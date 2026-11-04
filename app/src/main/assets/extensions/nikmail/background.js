// ============================================================================
// AI Multi-Account Switcher & Simultaneous Container Engine (Manifest V3)
// ============================================================================

const TWO_PART_TLDS = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'com.au', 'net.au', 'org.au',
  'co.jp', 'ne.jp', 'or.jp',
  'co.kr', 'or.kr',
  'com.br', 'org.br',
  'com.tr', 'org.tr',
  'co.ir', 'ac.ir', 'gov.ir', 'org.ir', 'id.ir', 'net.ir',
  'co.in', 'net.in', 'org.in',
  'com.sg', 'com.hk', 'com.tw', 'co.nz', 'co.za', 'com.mx', 'com.ar'
]);

const LINKED_AUTH_DOMAINS = {
  'chatgpt.com': ['chatgpt.com', 'openai.com'],
  'openai.com': ['openai.com', 'chatgpt.com'],
  'claude.ai': ['claude.ai', 'anthropic.com']
};

const ACCOUNT_COLORS = [
  '#6366f1', '#06b6d4', '#10b981', '#f59e0b',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316',
  '#3b82f6', '#ef4444'
];

const DNR_RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'xmlhttprequest',
  'script',
  'stylesheet',
  'image',
  'font',
  'media',
  'websocket',
  'ping',
  'other'
];

const siteLocks = new Map();
function withSiteLock(siteKey, fn) {
  const prev = siteLocks.get(siteKey) || Promise.resolve();
  const next = prev.then(fn, fn);
  siteLocks.set(siteKey, next.catch(() => {}));
  return next;
}

// ----------------------------------------------------------------------------
// Isolated Tabs Registry (In-Memory + chrome.storage.session persistence)
// ----------------------------------------------------------------------------
// Map<tabId: number, { tabId, siteKey, accountId, cookieDomains, ruleIds: number[], booting: boolean }>
const isolatedTabs = new Map();
let nextDnrRuleId = 1;
let sessionHydrated = false;

async function ensureSessionHydrated() {
  if (sessionHydrated) return;
  sessionHydrated = true;
  try {
    if (chrome.storage?.session) {
      const data = await chrome.storage.session.get(['isolatedTabsObj', 'nextDnrRuleId']);
      if (data.isolatedTabsObj && typeof data.isolatedTabsObj === 'object') {
        for (const [k, v] of Object.entries(data.isolatedTabsObj)) {
          isolatedTabs.set(Number(k), v);
        }
      }
      if (typeof data.nextDnrRuleId === 'number' && data.nextDnrRuleId > nextDnrRuleId) {
        nextDnrRuleId = data.nextDnrRuleId;
      }
    }
    if (chrome.declarativeNetRequest?.getSessionRules) {
      const existingRules = await chrome.declarativeNetRequest.getSessionRules();
      for (const r of existingRules) {
        if (r.id >= nextDnrRuleId) {
          nextDnrRuleId = r.id + 1;
        }
      }
    }
  } catch {}
}

function allocRuleId() {
  const id = nextDnrRuleId++;
  if (nextDnrRuleId > 2000000000) nextDnrRuleId = 1000;
  return id;
}

async function persistIsolatedSession() {
  try {
    if (chrome.storage?.session) {
      const obj = {};
      for (const [tid, val] of isolatedTabs.entries()) {
        obj[tid] = val;
      }
      await chrome.storage.session.set({
        isolatedTabsObj: obj,
        nextDnrRuleId
      });
    }
  } catch {}
}

// Kick off hydration on worker startup
ensureSessionHydrated();

// ----------------------------------------------------------------------------
// Domain & URL Helpers
// ----------------------------------------------------------------------------

function isIpOrLocalhost(hostname) {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  if (hostname.startsWith('[') && hostname.endsWith(']')) return true;
  return false;
}

function extractBaseDomain(hostname) {
  const clean = hostname.toLowerCase().replace(/\.$/, '');
  if (isIpOrLocalhost(clean)) return clean;

  const parts = clean.split('.');
  if (parts.length <= 2) return clean;

  const lastTwo = parts.slice(-2).join('.');
  if (TWO_PART_TLDS.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

function getSiteInfo(urlStr) {
  if (!urlStr) return { supported: false };
  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { supported: false };
    }
    if (
      url.hostname === 'chromewebstore.google.com' ||
      url.hostname === 'chrome.google.com'
    ) {
      return { supported: false, reason: 'restricted_store' };
    }

    const baseDomain = extractBaseDomain(url.hostname);
    const cookieDomains = LINKED_AUTH_DOMAINS[baseDomain] || [baseDomain];

    return {
      supported: true,
      url: urlStr,
      origin: url.origin,
      hostname: url.hostname,
      siteKey: baseDomain,
      baseDomain,
      cookieDomains,
      isGoogleUnified: baseDomain === 'google.com'
    };
  } catch {
    return { supported: false };
  }
}

// ----------------------------------------------------------------------------
// Storage Helpers
// ----------------------------------------------------------------------------

function defaultDomainRecord(siteKey) {
  return {
    siteKey,
    activeAccountId: null,
    accounts: [],
    settings: {
      floatingWidget: true,
      autoSync: true,
      includeStorage: true
    }
  };
}

async function getAllDomains() {
  const data = await chrome.storage.local.get('domains');
  return data.domains || {};
}

async function getDomainRecord(siteKey) {
  const domains = await getAllDomains();
  if (!domains[siteKey]) {
    return defaultDomainRecord(siteKey);
  }
  const rec = domains[siteKey];
  rec.settings = {
    floatingWidget: true,
    autoSync: true,
    includeStorage: true,
    ...(rec.settings || {})
  };
  rec.accounts = Array.isArray(rec.accounts) ? rec.accounts : [];
  return rec;
}

async function saveDomainRecord(siteKey, record) {
  const domains = await getAllDomains();
  domains[siteKey] = record;
  await chrome.storage.local.set({ domains });
}

async function getWidgetPos() {
  const data = await chrome.storage.local.get('widgetPos');
  return data.widgetPos || { bottom: 20, left: 20, minimized: false };
}

function summarizeAccount(acc) {
  return {
    id: acc.id,
    name: acc.name,
    note: acc.note || '',
    email: acc.email || '',
    mailboxId: acc.mailboxId || null,
    color: acc.color || '#6366f1',
    skipped: Boolean(acc.skipped),
    labels: Array.isArray(acc.labels) ? acc.labels : [],
    pinned: Boolean(acc.pinned),
    createdAt: acc.createdAt || 0,
    updatedAt: acc.updatedAt || 0,
    lastUsedAt: acc.lastUsedAt || 0,
    useCount: acc.useCount || 0,
    cookieCount: Array.isArray(acc.cookies) ? acc.cookies.length : 0,
    storageCount:
      Object.keys(acc.localStorage || {}).length +
      Object.keys(acc.sessionStorage || {}).length
  };
}

function toPersianDigits(num) {
  const persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(num).replace(/\d/g, (d) => persian[Number(d)]);
}

// ----------------------------------------------------------------------------
// Cookie Capture / Clear / Restore (Single-Tab Mode)
// ----------------------------------------------------------------------------

async function getStoreIdForTab(tabId) {
  if (!tabId) return undefined;
  try {
    const stores = await chrome.cookies.getAllCookieStores();
    const match = stores.find((s) => Array.isArray(s.tabIds) && s.tabIds.includes(tabId));
    return match ? match.id : undefined;
  } catch {
    return undefined;
  }
}

async function captureCookies(cookieDomains, storeId) {
  const map = new Map();

  for (const domain of cookieDomains) {
    const baseQuery = { domain };
    if (storeId) baseQuery.storeId = storeId;

    try {
      const list = await chrome.cookies.getAll(baseQuery);
      for (const c of list) {
        const key = `${c.name}\0${c.domain}\0${c.path}\0${c.partitionKey?.topLevelSite || ''}`;
        map.set(key, serializeCookie(c));
      }
    } catch {}

    try {
      const partList = await chrome.cookies.getAll({ ...baseQuery, partitionKey: {} });
      for (const c of partList) {
        const key = `${c.name}\0${c.domain}\0${c.path}\0${c.partitionKey?.topLevelSite || ''}`;
        map.set(key, serializeCookie(c));
      }
    } catch {}
  }

  return Array.from(map.values());
}

function serializeCookie(c) {
  const obj = {
    name: c.name,
    value: c.value,
    domain: c.domain,
    hostOnly: Boolean(c.hostOnly),
    path: c.path || '/',
    secure: Boolean(c.secure),
    httpOnly: Boolean(c.httpOnly),
    sameSite: c.sameSite || 'unspecified',
    session: Boolean(c.session)
  };
  if (!c.session && typeof c.expirationDate === 'number') {
    obj.expirationDate = c.expirationDate;
  }
  if (c.partitionKey) {
    obj.partitionKey = c.partitionKey;
  }
  return obj;
}

function buildCookieUrl(c) {
  const cleanHost = (c.domain || '').startsWith('.') ? c.domain.slice(1) : c.domain;
  const isHostPrefix = (c.name || '').startsWith('__Host-');
  const isSecurePrefix = (c.name || '').startsWith('__Secure-') || isHostPrefix;
  const secure = Boolean(c.secure || isSecurePrefix || c.sameSite === 'no_restriction');
  const path = isHostPrefix ? '/' : (c.path || '/');
  return `${secure ? 'https://' : 'http://'}${cleanHost}${path}`;
}

async function clearCookies(cookieDomains, storeId) {
  const existing = await captureCookies(cookieDomains, storeId);
  await Promise.allSettled(
    existing.map(async (c) => {
      const url = buildCookieUrl(c);
      const details = { url, name: c.name };
      if (storeId) details.storeId = storeId;
      if (c.partitionKey) details.partitionKey = c.partitionKey;
      try {
        await chrome.cookies.remove(details);
      } catch {
        const fallback = { url, name: c.name };
        if (storeId) fallback.storeId = storeId;
        await chrome.cookies.remove(fallback).catch(() => {});
      }
    })
  );
}

async function restoreCookies(savedCookies, storeId) {
  if (!Array.isArray(savedCookies) || savedCookies.length === 0) return;

  const nowSec = Math.floor(Date.now() / 1000);

  await Promise.allSettled(
    savedCookies.map(async (c) => {
      const isHostPrefix = (c.name || '').startsWith('__Host-');
      const isSecurePrefix = (c.name || '').startsWith('__Secure-') || isHostPrefix;
      const secure = Boolean(c.secure || isSecurePrefix || c.sameSite === 'no_restriction');
      const path = isHostPrefix ? '/' : (c.path || '/');
      const cleanHost = (c.domain || '').startsWith('.') ? c.domain.slice(1) : c.domain;
      if (!cleanHost) return;

      const url = `${secure ? 'https://' : 'http://'}${cleanHost}${path}`;
      const details = {
        url,
        name: c.name,
        value: c.value ?? '',
        path,
        secure,
        httpOnly: Boolean(c.httpOnly)
      };

      if (!c.hostOnly && !isHostPrefix && c.domain) {
        details.domain = c.domain;
      }
      if (c.sameSite && c.sameSite !== 'unspecified') {
        details.sameSite = c.sameSite;
      }
      if (!c.session && typeof c.expirationDate === 'number') {
        details.expirationDate =
          c.expirationDate > nowSec ? c.expirationDate : nowSec + 86400 * 14;
      }
      if (storeId) {
        details.storeId = storeId;
      }
      if (c.partitionKey) {
        details.partitionKey = c.partitionKey;
      }

      try {
        await chrome.cookies.set(details);
      } catch {
        if (details.partitionKey) {
          delete details.partitionKey;
          await chrome.cookies.set(details).catch(() => {});
        }
      }
    })
  );
}

// ----------------------------------------------------------------------------
// Simultaneous Multi-Tab Container Engine (DNR + Set-Cookie Sync + Preload)
// ----------------------------------------------------------------------------

function buildCookieHeaderForDomain(savedCookies, domain) {
  const pairs = new Map();
  for (const c of savedCookies || []) {
    if (!c || !c.name) continue;
    const clean = (c.domain || '').replace(/^\./, '').toLowerCase();
    if (clean === domain || clean.endsWith('.' + domain)) {
      // Keep first or root-path cookie
      if (!pairs.has(c.name) || c.path === '/') {
        pairs.set(c.name, c.value ?? '');
      }
    }
  }
  const list = [];
  for (const [k, v] of pairs.entries()) {
    list.push(`${k}=${v}`);
  }
  return list.join('; ');
}

function buildDnrCookieRulesForTab(tabId, cookieDomains, savedCookies) {
  const rules = [];
  for (const domain of cookieDomains) {
    const cookieStr = buildCookieHeaderForDomain(savedCookies, domain);
    const reqHeaderOp = cookieStr
      ? { header: 'cookie', operation: 'set', value: cookieStr }
      : { header: 'cookie', operation: 'remove' };

    const condition = {
      tabIds: [tabId],
      resourceTypes: DNR_RESOURCE_TYPES
    };
    if (isIpOrLocalhost(domain)) {
      condition.urlFilter = `||${domain}`;
    } else {
      condition.requestDomains = [domain];
    }

    rules.push({
      id: allocRuleId(),
      priority: 100,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [reqHeaderOp],
        responseHeaders: [{ header: 'set-cookie', operation: 'remove' }]
      },
      condition
    });
  }
  return rules;
}

async function refreshIsolatedTabDnrRules(tabId, account) {
  await ensureSessionHydrated();
  const iso = isolatedTabs.get(tabId);
  if (!iso || !chrome.declarativeNetRequest) return;

  const oldIds = iso.ruleIds || [];
  const newRules = buildDnrCookieRulesForTab(
    tabId,
    iso.cookieDomains,
    account.cookies || []
  );
  iso.ruleIds = newRules.map((r) => r.id);

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: oldIds,
    addRules: newRules
  });
  await persistIsolatedSession();
}

async function cleanupIsolatedTab(tabId) {
  await ensureSessionHydrated();
  const iso = isolatedTabs.get(tabId);
  if (!iso) return;
  isolatedTabs.delete(tabId);

  if (iso.ruleIds?.length && chrome.declarativeNetRequest) {
    await chrome.declarativeNetRequest
      .updateSessionRules({ removeRuleIds: iso.ruleIds })
      .catch(() => {});
  }
  await persistIsolatedSession();
}

function waitForTabComplete(tabId, timeoutMs = 10000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (tid, info) => {
      if (tid === tabId && info.status === 'complete') {
        finish();
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function openAccountInIsolatedTab(targetUrl, siteKey, accountId, makeActive = true) {
  await ensureSessionHydrated();
  const siteInfo = getSiteInfo(targetUrl);
  if (!siteInfo.supported) {
    return { ok: false, error: 'آدرس سایت برای تب مجزا معتبر نیست.' };
  }

  const record = await getDomainRecord(siteKey || siteInfo.siteKey);
  const accIdx = record.accounts.findIndex((a) => a.id === accountId);
  if (accIdx === -1) {
    return { ok: false, error: 'اکانت مورد نظر پیدا نشد.' };
  }
  const account = record.accounts[accIdx];

  // 1. Create blank tab first so we have tab.id BEFORE any network request happens
  const tab = await chrome.tabs.create({ url: 'about:blank', active: Boolean(makeActive) });
  const cookieRules = buildDnrCookieRulesForTab(
    tab.id,
    siteInfo.cookieDomains,
    account.cookies || []
  );
  const bootCspRuleId = allocRuleId();

  const bootRule = {
    id: bootCspRuleId,
    priority: 250,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        {
          header: 'content-security-policy',
          operation: 'set',
          value: "script-src 'none'"
        }
      ]
    },
    condition: {
      tabIds: [tab.id],
      resourceTypes: ['main_frame']
    }
  };

  isolatedTabs.set(tab.id, {
    tabId: tab.id,
    siteKey: record.siteKey,
    accountId: account.id,
    cookieDomains: siteInfo.cookieDomains,
    ruleIds: cookieRules.map((r) => r.id),
    booting: true
  });
  await persistIsolatedSession();

  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [...cookieRules, bootRule]
  });

  // 2. Navigate once with page scripts blocked to seed per-tab sessionStorage on exact origin
  const completePromise = waitForTabComplete(tab.id, 9000);
  await chrome.tabs.update(tab.id, { url: targetUrl });
  await completePromise;

  // Prepare non-HttpOnly cookies map for document.cookie virtualization
  const jsCookies = {};
  for (const c of account.cookies || []) {
    if (c && !c.httpOnly && c.name) {
      jsCookies[c.name] = c.value ?? '';
    }
  }

  const bootPayload = {
    siteKey: record.siteKey,
    accountId: account.id,
    accountName: account.name,
    shortBadge: toPersianDigits(accIdx + 1),
    color: account.color || '#06b6d4',
    localStorage: account.localStorage || {},
    sessionStorage: account.sessionStorage || {},
    jsCookies
  };

  await chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      func: (payload) => {
        try {
          window.sessionStorage.setItem('__AI_SWITCHER_ISO__', JSON.stringify(payload));
        } catch {}
      },
      args: [bootPayload]
    })
    .catch(() => {});

  // 3. Remove temporary CSP script-blocker and reload tab for real execution!
  await chrome.declarativeNetRequest
    .updateSessionRules({ removeRuleIds: [bootCspRuleId] })
    .catch(() => {});

  const isoEntry = isolatedTabs.get(tab.id);
  if (isoEntry) {
    isoEntry.booting = false;
    await persistIsolatedSession();
  }

  // Update usage stats
  await withSiteLock(record.siteKey, async () => {
    const freshRec = await getDomainRecord(record.siteKey);
    const targetAcc = freshRec.accounts.find((a) => a.id === account.id);
    if (targetAcc) {
      targetAcc.lastUsedAt = Date.now();
      targetAcc.useCount = (targetAcc.useCount || 0) + 1;
      await saveDomainRecord(record.siteKey, freshRec);
    }
  });

  await updateBadgeForTab(tab.id, targetUrl);
  await chrome.tabs.reload(tab.id);

  return {
    ok: true,
    tabId: tab.id,
    accountId: account.id,
    accountName: account.name
  };
}

// Observe Set-Cookie headers on Isolated Tabs so rotated tokens stay fresh!
const pendingCookieSaves = new Map();

function parseSetCookieHeader(rawHeader, fallbackHost) {
  if (!rawHeader || typeof rawHeader !== 'string') return null;
  const parts = rawHeader.split(';').map((s) => s.trim());
  const first = parts[0] || '';
  const eq = first.indexOf('=');
  if (eq <= 0) return null;

  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1);
  let domain = fallbackHost;
  let hostOnly = true;
  let path = '/';
  let secure = true;
  let httpOnly = false;
  let expired = false;
  let expirationDate;

  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    const low = seg.toLowerCase();
    if (low === 'httponly') {
      httpOnly = true;
    } else if (low === 'secure') {
      secure = true;
    } else if (low.startsWith('domain=')) {
      const d = seg.slice(7).trim().toLowerCase();
      if (d) {
        domain = d.startsWith('.') ? d : '.' + d;
        hostOnly = false;
      }
    } else if (low.startsWith('path=')) {
      path = seg.slice(5).trim() || '/';
    } else if (low.startsWith('max-age=')) {
      const sec = Number(seg.slice(8).trim());
      if (!Number.isNaN(sec)) {
        if (sec <= 0) expired = true;
        else expirationDate = Math.floor(Date.now() / 1000) + sec;
      }
    } else if (low.startsWith('expires=')) {
      const ms = Date.parse(seg.slice(8).trim());
      if (!Number.isNaN(ms)) {
        if (ms <= Date.now()) expired = true;
        else expirationDate = Math.floor(ms / 1000);
      }
    }
  }

  return {
    name,
    value,
    domain,
    hostOnly,
    path,
    secure,
    httpOnly,
    sameSite: 'lax',
    session: !expirationDate,
    ...(expirationDate ? { expirationDate } : {}),
    expired
  };
}

if (chrome.webRequest?.onHeadersReceived) {
  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (details.tabId < 0) return;
      const iso = isolatedTabs.get(details.tabId);
      if (!iso || iso.booting) return;

      const setCookieHeaders = (details.responseHeaders || []).filter(
        (h) => h.name && h.name.toLowerCase() === 'set-cookie' && h.value
      );
      if (setCookieHeaders.length === 0) return;

      let reqHost = iso.siteKey;
      try {
        reqHost = new URL(details.url).hostname.toLowerCase();
      } catch {}

      const parsedList = setCookieHeaders
        .map((h) => parseSetCookieHeader(h.value, reqHost))
        .filter(Boolean);
      if (parsedList.length === 0) return;

      // Queue async update for this isolated account
      const key = `${details.tabId}:${iso.accountId}`;
      const existing = pendingCookieSaves.get(key) || [];
      existing.push(...parsedList);
      pendingCookieSaves.set(key, existing);

      setTimeout(() => {
        const batch = pendingCookieSaves.get(key);
        if (!batch || batch.length === 0) return;
        pendingCookieSaves.delete(key);

        withSiteLock(iso.siteKey, async () => {
          const rec = await getDomainRecord(iso.siteKey);
          const acc = rec.accounts.find((a) => a.id === iso.accountId);
          if (!acc) return;

          const cookies = Array.isArray(acc.cookies) ? [...acc.cookies] : [];
          for (const item of batch) {
            const idx = cookies.findIndex(
              (c) =>
                c.name === item.name &&
                c.domain.replace(/^\./, '') === item.domain.replace(/^\./, '')
            );
            if (item.expired) {
              if (idx >= 0) cookies.splice(idx, 1);
            } else {
              const cleanObj = { ...item };
              delete cleanObj.expired;
              if (idx >= 0) cookies[idx] = { ...cookies[idx], ...cleanObj };
              else cookies.push(cleanObj);
            }
          }

          acc.cookies = cookies;
          acc.updatedAt = Date.now();
          await saveDomainRecord(iso.siteKey, rec);
          await refreshIsolatedTabDnrRules(details.tabId, acc);
        });
      }, 250);
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders', 'extraHeaders']
  );
}

// ----------------------------------------------------------------------------
// Tab Web Storage (Single-Tab Mode)
// ----------------------------------------------------------------------------

async function captureTabStorage(tabId) {
  if (!tabId) {
    return { localStorage: {}, sessionStorage: {}, indexedDB: {} };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const MAX_ITEM_LEN = 512 * 1024;
        const ls = {};
        const ss = {};

        try {
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k !== null && k !== '__AI_SWITCHER_ISO__') {
              const v = window.localStorage.getItem(k);
              if (typeof v === 'string' && v.length <= MAX_ITEM_LEN) {
                ls[k] = v;
              }
            }
          }
        } catch {}

        try {
          for (let i = 0; i < window.sessionStorage.length; i++) {
            const k = window.sessionStorage.key(i);
            if (k !== null && k !== '__AI_SWITCHER_ISO__') {
              const v = window.sessionStorage.getItem(k);
              if (typeof v === 'string' && v.length <= MAX_ITEM_LEN) {
                ss[k] = v;
              }
            }
          }
        } catch {}

        const idbDump = {};
        try {
          if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
            const captureIdb = async () => {
              const dbs = await window.indexedDB.databases();
              const authPattern = /firebase|auth|session|token|supabase|clerk|keyval|user/i;
              for (const info of dbs) {
                if (!info.name || !authPattern.test(info.name)) continue;
                await new Promise((resolve) => {
                  let settled = false;
                  const done = () => {
                    if (!settled) {
                      settled = true;
                      resolve();
                    }
                  };
                  const timer = setTimeout(done, 400);
                  try {
                    const req = window.indexedDB.open(info.name);
                    req.onerror = () => {
                      clearTimeout(timer);
                      done();
                    };
                    req.onsuccess = () => {
                      const db = req.result;
                      const storeNames = Array.from(db.objectStoreNames || []);
                      if (storeNames.length === 0) {
                        db.close();
                        clearTimeout(timer);
                        done();
                        return;
                      }
                      const dbRecord = {};
                      try {
                        const tx = db.transaction(storeNames, 'readonly');
                        let pending = storeNames.length;
                        for (const sName of storeNames) {
                          const store = tx.objectStore(sName);
                          const usesInlineKey = store.keyPath !== null;
                          const valReq = store.getAll();
                          const keyReq = store.getAllKeys();
                          let vals = null;
                          let keys = null;
                          const checkStoreDone = () => {
                            if (vals !== null && keys !== null) {
                              try {
                                const jsonSize = JSON.stringify(vals).length;
                                if (jsonSize <= 256 * 1024) {
                                  dbRecord[sName] = {
                                    usesInlineKey,
                                    entries: vals.map((v, idx) => ({
                                      key: keys[idx],
                                      value: v
                                    }))
                                  };
                                }
                              } catch {}
                              pending--;
                              if (pending <= 0) {
                                idbDump[info.name] = dbRecord;
                                db.close();
                                clearTimeout(timer);
                                done();
                              }
                            }
                          };
                          valReq.onsuccess = () => {
                            vals = valReq.result || [];
                            checkStoreDone();
                          };
                          keyReq.onsuccess = () => {
                            keys = keyReq.result || [];
                            checkStoreDone();
                          };
                          valReq.onerror = keyReq.onerror = () => {
                            vals = [];
                            keys = [];
                            checkStoreDone();
                          };
                        }
                      } catch {
                        db.close();
                        clearTimeout(timer);
                        done();
                      }
                    };
                  } catch {
                    clearTimeout(timer);
                    done();
                  }
                });
              }
            };
            await Promise.race([
              captureIdb(),
              new Promise((r) => setTimeout(r, 700))
            ]);
          }
        } catch {}

        return { localStorage: ls, sessionStorage: ss, indexedDB: idbDump };
      }
    });

    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
  } catch {}
  return { localStorage: {}, sessionStorage: {}, indexedDB: {} };
}

async function applyTabStorageAndReload(tabId, storagePayload, includeStorage) {
  if (!tabId) return;

  if (includeStorage) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: async (payload) => {
          try {
            window.localStorage.clear();
            const ls = (payload && payload.localStorage) || {};
            for (const [k, v] of Object.entries(ls)) {
              window.localStorage.setItem(k, v);
            }
          } catch {}

          try {
            window.sessionStorage.clear();
            const ss = (payload && payload.sessionStorage) || {};
            for (const [k, v] of Object.entries(ss)) {
              window.sessionStorage.setItem(k, v);
            }
          } catch {}

          try {
            if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
              const syncIdb = async () => {
                const targetIdb = (payload && payload.indexedDB) || {};
                const existingDbs = await window.indexedDB.databases();
                const authPattern = /firebase|auth|session|token|supabase|clerk|keyval|user/i;
                const dbNames = new Set([
                  ...Object.keys(targetIdb),
                  ...existingDbs
                    .map((d) => d.name)
                    .filter((n) => n && authPattern.test(n))
                ]);

                for (const dbName of dbNames) {
                  await new Promise((resolve) => {
                    let settled = false;
                    const done = () => {
                      if (!settled) {
                        settled = true;
                        resolve();
                      }
                    };
                    const timer = setTimeout(done, 400);
                    try {
                      const req = window.indexedDB.open(dbName);
                      req.onerror = () => {
                        clearTimeout(timer);
                        done();
                      };
                      req.onsuccess = () => {
                        const db = req.result;
                        const storeNames = Array.from(db.objectStoreNames || []);
                        if (storeNames.length === 0) {
                          db.close();
                          clearTimeout(timer);
                          done();
                          return;
                        }
                        try {
                          const tx = db.transaction(storeNames, 'readwrite');
                          const savedStores = targetIdb[dbName] || {};
                          for (const sName of storeNames) {
                            const store = tx.objectStore(sName);
                            store.clear();
                            const savedStore = savedStores[sName];
                            if (savedStore && Array.isArray(savedStore.entries)) {
                              for (const item of savedStore.entries) {
                                try {
                                  if (savedStore.usesInlineKey || store.keyPath !== null) {
                                    store.put(item.value);
                                  } else {
                                    store.put(item.value, item.key);
                                  }
                                } catch {}
                              }
                            }
                          }
                          tx.oncomplete = tx.onerror = tx.onabort = () => {
                            db.close();
                            clearTimeout(timer);
                            done();
                          };
                        } catch {
                          db.close();
                          clearTimeout(timer);
                          done();
                        }
                      };
                    } catch {
                      clearTimeout(timer);
                      done();
                    }
                  });
                }
              };
              await Promise.race([
                syncIdb(),
                new Promise((r) => setTimeout(r, 750))
              ]);
            }
          } catch {}
        },
        args: [storagePayload || { localStorage: {}, sessionStorage: {}, indexedDB: {} }]
      });

      await chrome.scripting
        .executeScript({
          target: { tabId },
          world: 'MAIN',
          func: () => {
            try {
              Storage.prototype.setItem = function () {};
              Storage.prototype.removeItem = function () {};
              Storage.prototype.clear = function () {};
            } catch {}
          }
        })
        .catch(() => {});
    } catch {}
  }

  await chrome.tabs.reload(tabId);
}

// ----------------------------------------------------------------------------
// Badge & Content Widget Notifications
// ----------------------------------------------------------------------------

async function updateBadgeForTab(tabId, urlStr) {
  if (!tabId) return;
  await ensureSessionHydrated();

  const info = getSiteInfo(urlStr);
  if (!info.supported) {
    await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    return;
  }

  const record = await getDomainRecord(info.siteKey);
  if (!record.accounts.length) {
    await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    return;
  }

  // If this tab is an Isolated Multi-Account Tab, show its dedicated account number!
  const iso = isolatedTabs.get(tabId);
  if (iso && iso.siteKey === info.siteKey) {
    const isoIdx = record.accounts.findIndex((a) => a.id === iso.accountId);
    if (isoIdx >= 0) {
      await chrome.action
        .setBadgeBackgroundColor({ tabId, color: '#06b6d4' })
        .catch(() => {});
      await chrome.action
        .setBadgeText({ tabId, text: `${isoIdx + 1}` })
        .catch(() => {});
      return;
    }
  }

  const activeIdx = record.accounts.findIndex((a) => a.id === record.activeAccountId);
  if (activeIdx >= 0) {
    const activeAcc = record.accounts[activeIdx];
    await chrome.action
      .setBadgeBackgroundColor({ tabId, color: activeAcc.color || '#6366f1' })
      .catch(() => {});
    await chrome.action
      .setBadgeText({ tabId, text: String(activeIdx + 1) })
      .catch(() => {});
  } else {
    await chrome.action
      .setBadgeBackgroundColor({ tabId, color: '#64748b' })
      .catch(() => {});
    await chrome.action
      .setBadgeText({ tabId, text: '+' })
      .catch(() => {});
  }
}

async function broadcastWidgetRefresh(siteKey) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      const info = getSiteInfo(tab.url);
      if (info.supported && info.siteKey === siteKey) {
        updateBadgeForTab(tab.id, tab.url);
        chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_WIDGET' }).catch(() => {});
      }
    }
  } catch {}
}

// ----------------------------------------------------------------------------
// Core Single-Tab Operations
// ----------------------------------------------------------------------------

async function maybeAutoSyncOutgoingAccount(record, siteInfo, tabId, storeId) {
  if (!record.settings.autoSync || !record.activeAccountId) return;
  // Do not overwrite shared activeAccountId from an isolated tab
  if (isolatedTabs.has(tabId)) return;

  const outgoing = record.accounts.find((a) => a.id === record.activeAccountId);
  if (!outgoing) return;

  const liveCookies = await captureCookies(siteInfo.cookieDomains, storeId);
  const prevCount = Array.isArray(outgoing.cookies) ? outgoing.cookies.length : 0;

  if (liveCookies.length > 0 && liveCookies.length >= Math.floor(prevCount * 0.5)) {
    outgoing.cookies = liveCookies;
    if (record.settings.includeStorage) {
      const liveStorage = await captureTabStorage(tabId);
      const prevLsCount = Object.keys(outgoing.localStorage || {}).length;
      const liveLsCount = Object.keys(liveStorage.localStorage || {}).length;
      if (prevLsCount === 0 || liveLsCount >= Math.floor(prevLsCount * 0.5)) {
        outgoing.localStorage = liveStorage.localStorage;
        outgoing.sessionStorage = liveStorage.sessionStorage;
        outgoing.indexedDB = liveStorage.indexedDB;
      }
    }
    outgoing.updatedAt = Date.now();
  }
}

async function performSwitchToAccount(tab, targetAccountId) {
  const siteInfo = getSiteInfo(tab?.url);
  if (!siteInfo.supported) {
    return { ok: false, error: 'این صفحه از تغییر اکانت پشتیبانی نمی‌کند.' };
  }

  await ensureSessionHydrated();
  // If user explicitly switches inside an isolated tab, convert/re-open it in isolated mode for the new account
  if (isolatedTabs.has(tab.id)) {
    await cleanupIsolatedTab(tab.id);
    // Clear __AI_SWITCHER_ISO__ from sessionStorage if switching to normal mode, OR re-seed isolated tab
  }

  return withSiteLock(siteInfo.siteKey, async () => {
    const record = await getDomainRecord(siteInfo.siteKey);
    const target = record.accounts.find((a) => a.id === targetAccountId);
    if (!target) {
      return { ok: false, error: 'اکانت مورد نظر پیدا نشد.' };
    }

    const storeId = await getStoreIdForTab(tab.id);

    if (record.activeAccountId && record.activeAccountId !== target.id) {
      await maybeAutoSyncOutgoingAccount(record, siteInfo, tab.id, storeId);
    }

    await clearCookies(siteInfo.cookieDomains, storeId);
    await restoreCookies(target.cookies || [], storeId);

    record.activeAccountId = target.id;
    target.lastUsedAt = Date.now();
    target.useCount = (target.useCount || 0) + 1;
    await saveDomainRecord(siteInfo.siteKey, record);

    await updateBadgeForTab(tab.id, tab.url);
    await applyTabStorageAndReload(
      tab.id,
      {
        localStorage: target.localStorage || {},
        sessionStorage: target.sessionStorage || {},
        indexedDB: target.indexedDB || {}
      },
      record.settings.includeStorage
    );

    const idx = record.accounts.findIndex((a) => a.id === target.id);
    return {
      ok: true,
      activeAccountId: target.id,
      activeIndex: idx,
      accountName: target.name
    };
  });
}

async function performCycleSwitch(tab, direction = 1) {
  const siteInfo = getSiteInfo(tab?.url);
  if (!siteInfo.supported) {
    return { ok: false, error: 'یک وب‌سایت معتبر باز کنید.' };
  }

  const record = await getDomainRecord(siteInfo.siteKey);
  if (record.accounts.length === 0) {
    return { ok: false, error: 'هنوز هیچ اکانتی برای این سایت ذخیره نشده است.' };
  }

  let pool = record.accounts.filter((a) => !a.skipped);
  if (pool.length === 0) {
    pool = record.accounts;
  }

  if (pool.length === 1 && record.activeAccountId === pool[0].id) {
    return {
      ok: false,
      error: 'فقط ۱ اکانت فعال برای چرخش وجود دارد.'
    };
  }

  const currentIdx = pool.findIndex((a) => a.id === record.activeAccountId);
  let nextIdx;
  if (currentIdx === -1) {
    nextIdx = direction >= 0 ? 0 : pool.length - 1;
  } else {
    nextIdx = (currentIdx + direction + pool.length) % pool.length;
  }

  return performSwitchToAccount(tab, pool[nextIdx].id);
}

async function performNewCleanSession(tab) {
  const siteInfo = getSiteInfo(tab?.url);
  if (!siteInfo.supported) {
    return { ok: false, error: 'این صفحه پشتیبانی نمی‌شود.' };
  }

  await cleanupIsolatedTab(tab.id);

  return withSiteLock(siteInfo.siteKey, async () => {
    const record = await getDomainRecord(siteInfo.siteKey);
    const storeId = await getStoreIdForTab(tab.id);

    if (record.activeAccountId) {
      await maybeAutoSyncOutgoingAccount(record, siteInfo, tab.id, storeId);
    }

    record.activeAccountId = null;
    await saveDomainRecord(siteInfo.siteKey, record);

    await clearCookies(siteInfo.cookieDomains, storeId);
    await updateBadgeForTab(tab.id, tab.url);
    await applyTabStorageAndReload(
      tab.id,
      { localStorage: {}, sessionStorage: {}, indexedDB: {} },
      true
    );

    return { ok: true };
  });
}

async function performSaveCurrentAccount(tab, name, note, color, mailboxId, email) {
  const siteInfo = getSiteInfo(tab?.url);
  if (!siteInfo.supported) {
    return { ok: false, error: 'این صفحه قابل ذخیره‌سازی نیست.' };
  }

  return withSiteLock(siteInfo.siteKey, async () => {
    const record = await getDomainRecord(siteInfo.siteKey);
    const storeId = await getStoreIdForTab(tab.id);

    const cookies = await captureCookies(siteInfo.cookieDomains, storeId);
    const storage = await captureTabStorage(tab.id);

    const hasData =
      cookies.length > 0 ||
      Object.keys(storage.localStorage).length > 0 ||
      Object.keys(storage.sessionStorage).length > 0;

    if (!hasData) {
      return {
        ok: false,
        error: 'هیچ کوکی یا نشستی در این سایت پیدا نشد. ابتدا وارد اکانت شوید.'
      };
    }

    const nextNum = record.accounts.length + 1;
    const finalName =
      (name || '').trim() || `اکانت ${toPersianDigits(nextNum)}`;
    const chosenColor =
      color || ACCOUNT_COLORS[(nextNum - 1) % ACCOUNT_COLORS.length];

    const now = Date.now();
    const newAccount = {
      id: `acc_${now}_${Math.random().toString(36).slice(2, 8)}`,
      name: finalName,
      note: (note || email || '').trim(),
      email: (email || '').trim(),
      mailboxId: mailboxId || null,
      color: chosenColor,
      skipped: false,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      useCount: 1,
      cookies,
      localStorage: storage.localStorage,
      sessionStorage: storage.sessionStorage,
      indexedDB: storage.indexedDB
    };

    record.accounts.push(newAccount);
    record.activeAccountId = newAccount.id;
    await saveDomainRecord(siteInfo.siteKey, record);

    await broadcastWidgetRefresh(siteInfo.siteKey);
    return {
      ok: true,
      account: summarizeAccount(newAccount),
      activeAccountId: newAccount.id
    };
  });
}

async function performUpdateAccountSession(tab, accountId) {
  const siteInfo = getSiteInfo(tab?.url);
  if (!siteInfo.supported) {
    return { ok: false, error: 'این صفحه پشتیبانی نمی‌شود.' };
  }

  return withSiteLock(siteInfo.siteKey, async () => {
    const record = await getDomainRecord(siteInfo.siteKey);
    const acc = record.accounts.find((a) => a.id === accountId);
    if (!acc) {
      return { ok: false, error: 'اکانت پیدا نشد.' };
    }

    const storeId = await getStoreIdForTab(tab.id);
    const cookies = await captureCookies(siteInfo.cookieDomains, storeId);
    const storage = await captureTabStorage(tab.id);

    acc.cookies = cookies;
    acc.localStorage = storage.localStorage;
    acc.sessionStorage = storage.sessionStorage;
    acc.indexedDB = storage.indexedDB;
    acc.updatedAt = Date.now();
    acc.lastUsedAt = Date.now();
    record.activeAccountId = acc.id;

    await saveDomainRecord(siteInfo.siteKey, record);
    await broadcastWidgetRefresh(siteInfo.siteKey);
    return { ok: true, account: summarizeAccount(acc) };
  });
}

// ----------------------------------------------------------------------------
// Temp Mail Engine — Multi-Provider
// ۱) Instant Mail HD  (سرور رسمی اپ «Instant Mail» / 1timetech)
// ۲) HD Gmail        (آلیاس واقعی gmail.com روی سرور شماره ۲ اپ)
// ۳) Temp-Mail.io    (عمومی، بدون احراز هویت)
// ۴) Mail.tm / Mail.gw (عمومی Hydra)
// ----------------------------------------------------------------------------

const MAIL_PROVIDERS = {
  hd: {
    type: 'hd',
    label: 'Instant Mail',
    base: 'https://mail-server.1timetech.com/api',
    createPath: '/email',
    appKey: 'b9db03078622',
    domains: [
      'gmail10p.com', 'oletters.com', 'oemails.com', 'oegmail.com',
      'suiemail.com', 'voewo.com', 'yanemail.com', 'tempmail.edu.pl', 'rommiui.com'
    ],
    popular: ['tempmail.edu.pl', 'rommiui.com']
  },
  hd_gmail: {
    type: 'hd',
    label: 'Gmail آنی',
    base: 'https://mail-server-2.1timetech.com/api',
    createPath: '/g-mail',
    appKey: 'b9db03078622',
    domains: ['gmail.com', 'googlemail.com'],
    popular: ['gmail.com']
  },
  'temp-mail-io': {
    type: 'io',
    label: 'Temp-Mail.io',
    base: 'https://api.internal.temp-mail.io/api',
    domains: null,
    popular: null
  },
  'mail.tm': { type: 'hydra', label: 'Mail.tm', base: 'https://api.mail.tm' },
  'mail.gw': { type: 'hydra', label: 'Mail.gw', base: 'https://api.mail.gw' }
};

const FIRST_NAMES = [
  'alex', 'sara', 'liam', 'emma', 'noah', 'nina', 'amir', 'mila',
  'ryan', 'lena', 'adam', 'tara', 'owen', 'maya', 'evan', 'zara'
];

function getProviderDef(providerKey) {
  return MAIL_PROVIDERS[providerKey] || MAIL_PROVIDERS.hd;
}

function getProviderBase(providerKey) {
  return getProviderDef(providerKey).base;
}

function getMailboxType(mailbox) {
  if (mailbox?.ptype) return mailbox.ptype;
  return getProviderDef(mailbox?.provider).type;
}

function newMailboxId() {
  return `mb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function sanitizeMailboxUser(v) {
  return (v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 28);
}

function normalizeTimestamp(val) {
  if (typeof val === 'number' && val > 0) {
    return new Date(val > 1e12 ? val : val * 1000).toISOString();
  }
  if (typeof val === 'string' && val) return val;
  return '';
}

// ---------------- Instant Mail HD codec (استخراج‌شده از باندل اپ) ----------------
// ENC(x) = charSwap( reverse( base64( JSON(x) ) ) )
// جفت‌های تعویض کاراکتر: ao, sq, =x, 5b, 4*, Bz

const HD_SWAP_PAIRS = [
  ['a', 'o'], ['s', 'q'], ['=', 'x'], ['5', 'b'], ['4', '*'], ['B', 'z']
];

function hdSwapChars(str) {
  let out = '';
  for (const ch of str) {
    let c = ch;
    for (const [a, b] of HD_SWAP_PAIRS) {
      if (c === a) { c = b; break; }
      if (c === b) { c = a; break; }
    }
    out += c;
  }
  return out;
}

function hdEncode(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(bin);
  return hdSwapChars(b64.split('').reverse().join(''));
}

function hdDecodeText(str) {
  const b64 = hdSwapChars(str.split('').reverse().join(''));
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// پاسخ سرور دوبار کدگذاری‌شده است: {"data": ENC(JSON), "type": "object"}
function hdExtract(body) {
  let cur = body && body.data !== undefined ? body.data : body;
  for (let i = 0; i < 4 && typeof cur === 'string'; i++) {
    cur = JSON.parse(hdDecodeText(cur));
  }
  return cur;
}

async function hdApiCall(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-app-key': getProviderDef('hd').appKey,
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).replace(/<[^>]*>/g, ' ').trim().slice(0, 90);
    } catch {}
    throw new Error(`خطای سرور Instant Mail (${res.status}) ${detail}`);
  }
  return hdExtract(await res.json());
}

// ---------------- Temp-Mail.io client ----------------

const IO_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'application-name': 'web',
  'application-version': '2.2.29',
  origin: 'https://temp-mail.io',
  referer: 'https://temp-mail.io/',
  'user-agent':
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.80 Mobile Safari/537.36'
};

async function ioApiCall(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...IO_HEADERS,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    throw new Error(`خطای سرور Temp-Mail.io (${res.status})`);
  }
  return res.json();
}

async function getMailState() {
  const data = await chrome.storage.local.get('mailState');
  const st = data.mailState || { activeMailboxId: null, mailboxes: [] };
  st.mailboxes = Array.isArray(st.mailboxes) ? st.mailboxes : [];
  // بقایای صندوق‌های «جیمیل من» نسخه‌های قدیمی را بی‌صدا حذف کن
  const before = st.mailboxes.length;
  st.mailboxes = st.mailboxes.filter((m) => m.provider !== 'gmail_real' && m.ptype !== 'gmail');
  if (st.mailboxes.length !== before) {
    const activeStillThere = st.mailboxes.some((m) => m.id === st.activeMailboxId);
    if (!activeStillThere) st.activeMailboxId = st.mailboxes[0]?.id || null;
    await chrome.storage.local.set({ mailState: st });
  }
  return st;
}

async function saveMailState(st) {
  await chrome.storage.local.set({ mailState: st });
}

function extractHydraList(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json['hydra:member'])) return json['hydra:member'];
  return [];
}

function extractOtpCode(text) {
  if (!text || typeof text !== 'string') return null;

  // نرمال‌سازی ارقام فارسی/عربی به لاتین (خیلی از سرویس‌های ایرانی کد فارسی می‌فرستند)
  const normalized = text
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

  // ۱) کد نزدیک کلیدواژه‌های تأیید
  const kwIdx = normalized.search(
    /(?:code|verification|verify|otp|pin|passcode|رمز|کد|تایید|تأیید)/i
  );
  if (kwIdx >= 0) {
    const after = normalized.slice(kwIdx, kwIdx + 90);
    // کد ۶رقمی با فاصله یا خط‌تیره (سبک واتساپ/اینستاگرام): «553 118» / «553-118»
    const spaced = after.match(/(?:\d{3})[ \-](\d{3})(?!\d)/);
    if (spaced) return `${spaced[0].slice(0, 3)}${spaced[1]}`;
    const keywordMatch = after.match(
      /(?:code|verification|verify|otp|pin|passcode|رمز|کد|تایید|تأیید)[^\d]{0,30}(\b\d{4,8}\b)/i
    );
    if (keywordMatch) return keywordMatch[1];
  }

  const sixDigit = normalized.match(/\b(\d{6})\b/);
  if (sixDigit) return sixDigit[1];

  const fiveOrFour = normalized.match(/\b(\d{4,8})\b/);
  if (fiveOrFour) {
    const val = fiveOrFour[1];
    // Avoid matching common years like 2024-2029
    if (!/^202\d$/.test(val)) return val;
  }
  return null;
}

function extractVerificationLinks(text, htmlArr) {
  const links = new Set();
  const combined = [text || '', ...(Array.isArray(htmlArr) ? htmlArr : [])].join('\n');
  const regex = /https?:\/\/[^\s"'<>\\)]+/gi;
  let m;
  while ((m = regex.exec(combined)) !== null) {
    const url = m[0].replace(/[.,;!?]+$/, '');
    if (
      !/\.(png|jpg|jpeg|gif|svg|css|woff2?|ico)(\?|$)/i.test(url) &&
      !url.includes('w3.org') &&
      !url.includes('schema.org')
    ) {
      links.add(url);
    }
  }
  const all = Array.from(links);
  // Sort verification/confirm/magic links to top
  all.sort((a, b) => {
    const score = (u) =>
      /verify|confirm|activate|auth|token|magic|callback|login/i.test(u) ? 0 : 1;
    return score(a) - score(b);
  });
  return all.slice(0, 6);
}

async function fetchHydraDomains(provider) {
  const base = getProviderBase(provider);
  const res = await fetch(`${base}/domains`, {
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) {
    throw new Error(`خطا در دریافت دامنه‌ها از ${provider} (${res.status})`);
  }
  const data = await res.json();
  return extractHydraList(data)
    .filter((d) => d && d.domain && d.isActive !== false && !d.isPrivate)
    .map((d) => d.domain);
}

async function fetchIoDomains() {
  const base = getProviderBase('temp-mail-io');
  const data = await ioApiCall(`${base}/v4/domains?min_expiration=900`);
  return (Array.isArray(data?.domains) ? data.domains : [])
    .filter((d) => d && d.name && d.type !== 'private')
    .map((d) => d.name);
}

async function fetchMailDomains(provider = 'hd') {
  const p = getProviderDef(provider);
  if (p.type === 'hd') return [...p.domains];
  if (p.type === 'io') return fetchIoDomains();
  return fetchHydraDomains(provider);
}

function getPopularDomains(provider, allDomains) {
  const p = getProviderDef(provider);
  if (Array.isArray(p.popular) && p.popular.length) return [...p.popular];
  return (allDomains || []).slice(0, 3);
}

function generateRandomUsername() {
  const name = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const suffix = Math.random().toString(36).slice(2, 6);
  const num = Math.floor(10 + Math.random() * 89);
  return `${name}.${suffix}${num}`;
}

function generateRandomPassword() {
  return `Pw_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}!`;
}

// ---------------- ساخت صندوق per-provider ----------------

async function createHydraMailbox(provider, customUser, chosenDomain) {
  const base = getProviderBase(provider);
  let domain = (chosenDomain || '').trim();
  if (!domain) {
    const domains = await fetchHydraDomains(provider);
    if (!domains.length) {
      throw new Error('هیچ دامنه فعالی روی این سرور یافت نشد. سرور دیگر را امتحان کنید.');
    }
    domain = domains[Math.floor(Math.random() * domains.length)];
  }

  const username = sanitizeMailboxUser(customUser) || generateRandomUsername();
  const address = `${username}@${domain}`;
  const password = generateRandomPassword();

  // 1. Register mailbox
  const createRes = await fetch(`${base}/accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ address, password })
  });

  if (!createRes.ok) {
    let detail = '';
    try {
      const errJson = await createRes.json();
      detail = errJson['hydra:description'] || errJson.detail || errJson.message || '';
    } catch {}
    throw new Error(detail || `ساخت ایمیل ناموفق بود (کد ${createRes.status})`);
  }

  const accData = await createRes.json();

  // 2. Obtain JWT Bearer token
  const tokRes = await fetch(`${base}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ address, password })
  });

  if (!tokRes.ok) {
    throw new Error('ایمیل ساخته شد اما دریافت توکن ورود ناموفق بود.');
  }
  const tokData = await tokRes.json();

  return {
    id: newMailboxId(),
    ptype: 'hydra',
    remoteId: accData.id || '',
    provider,
    baseUrl: base,
    address,
    password,
    token: tokData.token,
    createdAt: Date.now()
  };
}

// سرور رسمی اپ Instant Mail (HD و HD Gmail)
async function createHdMailbox(providerKey, customUser, chosenDomain) {
  const p = getProviderDef(providerKey);
  const domain =
    (chosenDomain || '').trim() ||
    p.domains[Math.floor(Math.random() * p.domains.length)];
  const username = sanitizeMailboxUser(customUser) || generateRandomUsername();
  const requested = `${username}@${domain}`;

  const info = await hdApiCall(`${p.base}${p.createPath}`, {
    method: 'POST',
    body: JSON.stringify({ data: hdEncode({ email: requested }) })
  });

  if (!info || info.success === false || !info.id) {
    throw new Error('ساخت ایمیل روی سرور Instant Mail ناموفق بود.');
  }

  return {
    id: newMailboxId(),
    ptype: 'hd',
    provider: providerKey,
    baseUrl: p.base,
    remoteId: String(info.id),
    // سرور ممکن است آدرس نهایی را تغییر دهد (مخصوصا در آلیاس‌های جیمیل)
    address: info.email || requested,
    createdAt: Date.now()
  };
}

async function createIoMailbox(customUser, chosenDomain) {
  const base = getProviderBase('temp-mail-io');
  const payload = {};
  const cleanUser = sanitizeMailboxUser(customUser);
  if (cleanUser) payload.name = cleanUser;
  const dom = (chosenDomain || '').trim();
  if (dom) payload.domain = dom;

  const data = await ioApiCall(`${base}/v3/email/new`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (!data?.email) {
    throw new Error('ساخت ایمیل Temp-Mail.io ناموفق بود.');
  }

  return {
    id: newMailboxId(),
    ptype: 'io',
    provider: 'temp-mail-io',
    baseUrl: base,
    remoteId: data.token || '',
    address: data.email,
    createdAt: Date.now()
  };
}

async function createTempMailbox(provider = 'hd', customUser = '', chosenDomain = '') {
  const p = getProviderDef(provider);
  let mailbox;
  if (p.type === 'hd') {
    mailbox = await createHdMailbox(provider, customUser, chosenDomain);
  } else if (p.type === 'io') {
    mailbox = await createIoMailbox(customUser, chosenDomain);
  } else {
    mailbox = await createHydraMailbox(provider, customUser, chosenDomain);
  }

  const st = await getMailState();
  st.mailboxes.unshift(mailbox);
  st.activeMailboxId = mailbox.id;
  await saveMailState(st);

  return mailbox;
}

async function reauthMailbox(mailbox) {
  const base = mailbox.baseUrl || getProviderBase(mailbox.provider);
  const tokRes = await fetch(`${base}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      address: mailbox.address,
      password: mailbox.password
    })
  });
  if (!tokRes.ok) {
    throw new Error('نشست این ایمیل منقضی شده است.');
  }
  const tokData = await tokRes.json();
  mailbox.token = tokData.token;

  const st = await getMailState();
  const idx = st.mailboxes.findIndex((m) => m.id === mailbox.id);
  if (idx >= 0) {
    st.mailboxes[idx].token = tokData.token;
    await saveMailState(st);
  }
  return tokData.token;
}

// ---------------- پیام‌ها per-provider ----------------

async function hdListMessages(mb) {
  const q = hdEncode({ email: mb.address });
  const list = await hdApiCall(
    `${mb.baseUrl}/email/${encodeURIComponent(mb.remoteId)}/messages?params=${q}`
  );
  return (Array.isArray(list) ? list : []).map((item) => {
    const combined = `${item.subject || ''} ${item.text || ''}`;
    return {
      id: String(item.id),
      fromAddress: item.from || '',
      fromName: item.fromText || item.from || 'ناشناس',
      subject: item.subject || '(بدون موضوع)',
      intro: item.text || '',
      seen: true,
      createdAt: normalizeTimestamp(item.createdAt),
      otpCode: extractOtpCode(combined)
    };
  });
}

async function hdReadMessage(mb, messageId) {
  const q = hdEncode({ email: mb.address });
  const d = await hdApiCall(
    `${mb.baseUrl}/email/${encodeURIComponent(mb.remoteId)}/messages/${encodeURIComponent(
      messageId
    )}?params=${q}`
  );
  const htmlArr = typeof d.html === 'string' && d.html ? [d.html] : [];
  const textBody = d.text || '';
  return {
    id: String(d.id || messageId),
    fromAddress: d.from || '',
    fromName: d.fromText || d.from || '',
    subject: d.subject || '(بدون موضوع)',
    text: textBody,
    html: htmlArr,
    createdAt: normalizeTimestamp(d.createdAt),
    otpCode: extractOtpCode(`${d.subject || ''}\n${textBody}\n${htmlArr.join('\n')}`),
    links: extractVerificationLinks(textBody, htmlArr)
  };
}

async function ioListMessages(mb) {
  const data = await ioApiCall(
    `${mb.baseUrl}/v3/email/${encodeURIComponent(mb.address)}/messages`
  );
  const list = Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : [];
  return list.map((item) => {
    const combined = `${item.subject || ''} ${item.body_text || ''}`;
    return {
      id: String(item.id),
      fromAddress: item.from || '',
      fromName: item.from || 'ناشناس',
      subject: item.subject || '(بدون موضوع)',
      intro: item.body_text || '',
      seen: true,
      createdAt: normalizeTimestamp(item.created_at || item.createdAt),
      otpCode: extractOtpCode(combined)
    };
  });
}

async function ioReadMessage(mb, messageId) {
  const d = await ioApiCall(`${mb.baseUrl}/v3/message/${encodeURIComponent(messageId)}`);
  const rawHtml = d.body_html ?? d.html ?? '';
  const htmlArr = Array.isArray(rawHtml)
    ? rawHtml.filter(Boolean)
    : rawHtml
      ? [String(rawHtml)]
      : [];
  const textBody = d.body_text || d.text || '';
  return {
    id: String(d.id || messageId),
    fromAddress: d.from || '',
    fromName: d.from || '',
    subject: d.subject || '(بدون موضوع)',
    text: textBody,
    html: htmlArr,
    createdAt: normalizeTimestamp(d.created_at || d.createdAt),
    otpCode: extractOtpCode(`${d.subject || ''}\n${textBody}\n${htmlArr.join('\n')}`),
    links: extractVerificationLinks(textBody, htmlArr)
  };
}

async function hydraListMessages(mb) {
  const res = await mailAuthedFetch(mb, '/messages');
  if (!res.ok) {
    throw new Error(`خطا در دریافت لیست پیام‌ها (${res.status})`);
  }
  const data = await res.json();
  return extractHydraList(data).map((item) => {
    const combined = `${item.subject || ''} ${item.intro || ''}`;
    return {
      id: item.id,
      fromAddress: item.from?.address || '',
      fromName: item.from?.name || item.from?.address || 'ناشناس',
      subject: item.subject || '(بدون موضوع)',
      intro: item.intro || '',
      seen: Boolean(item.seen),
      createdAt: item.createdAt || '',
      otpCode: extractOtpCode(combined)
    };
  });
}

async function hydraReadMessage(mb, messageId) {
  const res = await mailAuthedFetch(mb, `/messages/${encodeURIComponent(messageId)}`);
  if (!res.ok) {
    throw new Error('خطا در خواندن متن پیام.');
  }
  const detail = await res.json();

  // Mark as seen in background
  mailAuthedFetch(mb, `/messages/${encodeURIComponent(messageId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/merge-patch+json' },
    body: JSON.stringify({ seen: true })
  }).catch(() => {});

  const htmlArr = Array.isArray(detail.html)
    ? detail.html
    : detail.html
      ? [String(detail.html)]
      : [];
  const textBody = detail.text || '';
  return {
    id: detail.id,
    fromAddress: detail.from?.address || '',
    fromName: detail.from?.name || detail.from?.address || '',
    subject: detail.subject || '(بدون موضوع)',
    text: textBody,
    html: htmlArr,
    createdAt: detail.createdAt || '',
    otpCode: extractOtpCode(`${detail.subject || ''}\n${textBody}\n${htmlArr.join('\n')}`),
    links: extractVerificationLinks(textBody, htmlArr)
  };
}

async function listMessagesForMailbox(mb) {
  const type = getMailboxType(mb);
  if (type === 'hd') return hdListMessages(mb);
  if (type === 'io') return ioListMessages(mb);
  return hydraListMessages(mb);
}

async function readMessageForMailbox(mb, messageId) {
  const type = getMailboxType(mb);
  if (type === 'hd') return hdReadMessage(mb, messageId);
  if (type === 'io') return ioReadMessage(mb, messageId);
  return hydraReadMessage(mb, messageId);
}

function summarizeMailbox(m) {
  return {
    id: m.id,
    provider: m.provider,
    ptype: m.ptype || '',
    address: m.address,
    tag: m.tag || '',
    aliasStyle: m.aliasStyle || '',
    aliasDomain: m.aliasDomain || '',
    createdAt: m.createdAt
  };
}

async function mailAuthedFetch(mailbox, path, options = {}) {
  const base = mailbox.baseUrl || getProviderBase(mailbox.provider);
  let token = mailbox.token;
  if (!token) {
    token = await reauthMailbox(mailbox);
  }

  let res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  if (res.status === 401) {
    token = await reauthMailbox(mailbox);
    res = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`
      }
    });
  }

  return res;
}

async function fillValueInTab(tabId, value, fieldKind = 'email') {
  if (!tabId || !value) return { ok: false, error: 'تب فعالی یافت نشد.' };
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (val, kind) => {
        const isVisible = (el) => {
          if (!el || el.disabled || el.readOnly) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };

        let target = null;
        const active = document.activeElement;
        if (active && active.tagName === 'INPUT' && isVisible(active)) {
          target = active;
        }

        if (!target) {
          const inputs = Array.from(document.querySelectorAll('input')).filter(isVisible);
          if (kind === 'email') {
            target =
              inputs.find((i) => i.type === 'email') ||
              inputs.find((i) => /mail|user|login/i.test(`${i.name} ${i.id} ${i.placeholder}`)) ||
              inputs.find((i) => i.type === 'text');
          } else {
            target =
              inputs.find((i) => /code|otp|pin|token|verify/i.test(`${i.name} ${i.id} ${i.placeholder} ${i.autocomplete}`)) ||
              inputs.find((i) => i.type === 'text' || i.type === 'number' || i.type === 'tel');
          }
        }

        if (!target) return { filled: false };

        target.focus();
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        if (nativeSetter) {
          nativeSetter.call(target, val);
        } else {
          target.value = val;
        }
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return { filled: true };
      },
      args: [value, fieldKind]
    });

    if (results?.[0]?.result?.filled) {
      return { ok: true };
    }
    return { ok: false, error: 'فیلد ورودی مناسب در صفحه پیدا نشد (ایمیل کپی شد).' };
  } catch {
    return { ok: false, error: 'امکان درج خودکار در این صفحه نیست.' };
  }
}

// ----------------------------------------------------------------------------
// Desktop Notifications — پیام جدید / کد تأیید حتی وقتی پاپ‌آپ بسته است
// ----------------------------------------------------------------------------

const NOTIF_MAX_PER_POLL = 4;

async function getNotifPrefs() {
  try {
    const data = await chrome.storage.local.get('notifPrefs');
    return { enabled: data.notifPrefs?.enabled !== false };
  } catch {
    return { enabled: true };
  }
}

async function saveNotifPrefs(prefs) {
  await chrome.storage.local.set({ notifPrefs: prefs });
}

async function showMailNotification(mailbox, message) {
  const address = mailbox?.address || '';
  const sender = message.fromName || message.fromAddress || 'فرستنده ناشناس';
  const subject = message.subject || '(بدون موضوع)';

  let title;
  let body;
  if (message.otpCode) {
    title = `کد تأیید: ${message.otpCode}`;
    body = `${subject} — ${sender}`;
  } else {
    title = 'پیام جدید در صندوق ایمیل';
    body = `${subject} — ${sender}`;
  }

  const notifId = `mail_${mailbox.id}_${message.id}_${Date.now()}`;
  const options = {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon48.png'),
    title,
    message: body,
    contextMessage: address,
    priority: 2,
    requireInteraction: message.otpCode ? true : false
  };

  try {
    await chrome.notifications.create(notifId, options);
  } catch {
    try {
      delete options.requireInteraction;
      await chrome.notifications.create(notifId, options);
    } catch {}
  }
}

async function pollMailboxesForNotifications({ force = false } = {}) {
  const prefs = await getNotifPrefs();
  if (!prefs.enabled) return { ok: true, enabled: false, notified: 0 };

  const st = await getMailState();
  if (!st.mailboxes.length) return { ok: true, notified: 0 };


  let notifiedCount = 0;
  let stateDirty = false;

  for (const mb of st.mailboxes) {
    try {
      // اولین بررسی: وضعیت فعلی را مبنا می‌گیریم تا اعلان قدیمی نفرستیم
      if (!Array.isArray(mb.notifSeenIds) || !mb.notifInit) {
        const messages = await listMessagesForMailbox(mb);
        mb.notifSeenIds = messages.map((m) => String(m.id));
        mb.notifInit = true;
        stateDirty = true;
        continue;
      }

      const messages = await listMessagesForMailbox(mb);
      const seen = new Set(mb.notifSeenIds.map(String));
      const fresh = messages
        .filter((m) => !seen.has(String(m.id)))
        .sort((a, b) => normalizeTimestamp(b.createdAt) - normalizeTimestamp(a.createdAt));

      let ownFresh = fresh;

      for (const m of ownFresh) {
        mb.notifSeenIds.push(String(m.id));
      }
      if (mb.notifSeenIds.length > 200) {
        mb.notifSeenIds = mb.notifSeenIds.slice(-120);
      }

      if (ownFresh.length > 0) {
        stateDirty = true;
        if (!force) {
          for (const m of ownFresh.slice(0, NOTIF_MAX_PER_POLL)) {
            await showMailNotification(mb, m);
            notifiedCount++;
          }
        }
      }
    } catch {
      // خطای شبکه یا احراز هویت این صندوق — صندوق بعدی
    }
  }

  if (stateDirty) {
    await saveMailState(st);
  }
  return { ok: true, notified: notifiedCount };
}

chrome.notifications?.onClicked.addListener((notifId) => {
  chrome.notifications.clear(notifId).catch(() => {});
  // باز کردن پاپ‌آپ افزونه (کروم ۱۲۷+)؛ در غیر این صورت صفحه پاپ‌آپ در تب جدید
  try {
    const p = chrome.action.openPopup();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') }).catch(() => {});
      });
    }
  } catch {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') }).catch(() => {});
  }
});

// ----------------------------------------------------------------------------
// Quick Search — جست‌وجوی سریع اکانت‌ها بین همه سایت‌ها
// ----------------------------------------------------------------------------

function scoreQuickMatch(acc, q) {
  const name = (acc.name || '').toLowerCase();
  const note = (acc.note || '').toLowerCase();
  const email = (acc.email || '').toLowerCase();
  const labels = (acc.labels || []).join(' ').toLowerCase();
  const siteKey = acc.__siteKey || '';

  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (email.includes(q)) return 3;
  if (note.includes(q)) return 4;
  if (labels.includes(q)) return 5;
  if (siteKey.includes(q)) return 6;
  return -1;
}

async function quickSearchAccounts(rawQuery, currentSiteKey) {
  const q = (rawQuery || '').trim().toLowerCase();
  const domains = await getAllDomains();
  const results = [];

  for (const [siteKey, rec] of Object.entries(domains)) {
    if (!rec || !Array.isArray(rec.accounts)) continue;
    for (const acc of rec.accounts) {
      const withSite = {
        ...summarizeAccount(acc),
        accountId: acc.id,
        siteKey,
        __siteKey: siteKey
      };
      if (q) {
        const score = scoreQuickMatch(withSite, q);
        if (score < 0) continue;
        withSite.__score = score;
      }
      withSite.isSameSite = siteKey === currentSiteKey;
      withSite.siteUrl = `https://${siteKey}`;
      results.push(withSite);
    }
  }

  results.sort((a, b) => {
    if (Boolean(b.pinned) !== Boolean(a.pinned)) return b.pinned ? 1 : -1;
    if (q && b.__score !== a.__score) return a.__score - b.__score;
    return (b.lastUsedAt || 0) - (a.lastUsedAt || 0);
  });

  const sameSite = results.filter((r) => r.isSameSite).slice(0, 12);
  const otherSites = results.filter((r) => !r.isSameSite).slice(0, 10);
  for (const r of results) delete r.__score;

  return { sameSite, otherSites };
}

// ----------------------------------------------------------------------------
// Message Router
// ----------------------------------------------------------------------------

async function resolveTargetTab(msgTabId, sender) {
  if (msgTabId) {
    try {
      return await chrome.tabs.get(msgTabId);
    } catch {
      return null;
    }
  }
  if (sender?.tab) {
    return sender.tab;
  }
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  return activeTab || null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      await ensureSessionHydrated();

      switch (msg?.type) {
        case 'GET_SITE_STATE': {
          const tab = await resolveTargetTab(msg.tabId, sender);
          const url = msg.url || tab?.url || '';
          const siteInfo = getSiteInfo(url);
          const widgetPos = await getWidgetPos();

          if (!siteInfo.supported) {
            return {
              ok: true,
              supported: false,
              reason: siteInfo.reason || 'unsupported_protocol',
              widgetPos
            };
          }

          const record = await getDomainRecord(siteInfo.siteKey);
          if (tab?.id) {
            updateBadgeForTab(tab.id, url);
          }

          const isoForThisTab = tab?.id ? isolatedTabs.get(tab.id) : null;
          const openIsolatedTabs = [];
          for (const [tid, info] of isolatedTabs.entries()) {
            if (info.siteKey === siteInfo.siteKey) {
              openIsolatedTabs.push({ tabId: tid, accountId: info.accountId });
            }
          }

          return {
            ok: true,
            supported: true,
            tabId: tab?.id || null,
            url: siteInfo.url,
            origin: siteInfo.origin,
            siteKey: siteInfo.siteKey,
            hostname: siteInfo.hostname,
            isGoogleUnified: siteInfo.isGoogleUnified,
            activeAccountId: record.activeAccountId,
            isIsolatedTab: Boolean(isoForThisTab),
            isolatedAccountId: isoForThisTab?.accountId || null,
            openIsolatedTabs,
            accounts: record.accounts.map(summarizeAccount),
            settings: record.settings,
            widgetPos
          };
        }

        case 'OPEN_ISOLATED_TAB': {
          const tab = await resolveTargetTab(msg.tabId, sender);
          const targetUrl = msg.url || tab?.url;
          const siteInfo = getSiteInfo(targetUrl);
          if (!siteInfo.supported) {
            return { ok: false, error: 'ابتدا وارد سایت مورد نظر شوید.' };
          }

          // If an isolated tab for this exact account is already open and focusExisting is true, focus it!
          if (msg.focusIfOpen) {
            for (const [tid, info] of isolatedTabs.entries()) {
              if (info.siteKey === siteInfo.siteKey && info.accountId === msg.accountId) {
                try {
                  const existingTab = await chrome.tabs.get(tid);
                  if (existingTab) {
                    await chrome.tabs.update(tid, { active: true });
                    return { ok: true, tabId: tid, focusedExisting: true };
                  }
                } catch {
                  await cleanupIsolatedTab(tid);
                }
              }
            }
          }

          return await openAccountInIsolatedTab(
            targetUrl,
            siteInfo.siteKey,
            msg.accountId,
            msg.active !== false
          );
        }

        case 'OPEN_NEXT_ISOLATED_TAB': {
          const tab = await resolveTargetTab(msg.tabId, sender);
          const targetUrl = msg.url || tab?.url;
          const siteInfo = getSiteInfo(targetUrl);
          if (!siteInfo.supported) {
            return { ok: false, error: 'ابتدا وارد سایت مورد نظر شوید.' };
          }
          const record = await getDomainRecord(siteInfo.siteKey);
          const pool = record.accounts.filter((a) => !a.skipped);
          const list = pool.length ? pool : record.accounts;
          if (!list.length) {
            return { ok: false, error: 'هیچ اکانتی ذخیره نشده است.' };
          }

          const alreadyOpenIds = new Set();
          for (const info of isolatedTabs.values()) {
            if (info.siteKey === siteInfo.siteKey) {
              alreadyOpenIds.add(info.accountId);
            }
          }

          // Prefer first account not yet open in an isolated tab; otherwise cycle after current
          let chosen = list.find(
            (a) => !alreadyOpenIds.has(a.id) && a.id !== record.activeAccountId
          );
          if (!chosen) {
            chosen = list.find((a) => !alreadyOpenIds.has(a.id)) || list[0];
          }

          return await openAccountInIsolatedTab(
            targetUrl,
            siteInfo.siteKey,
            chosen.id,
            true
          );
        }

        case 'OPEN_BATCH_ISOLATED_TABS': {
          const tab = await resolveTargetTab(msg.tabId, sender);
          const targetUrl = msg.url || tab?.url;
          const siteInfo = getSiteInfo(targetUrl);
          if (!siteInfo.supported) {
            return { ok: false, error: 'ابتدا وارد سایت مورد نظر شوید.' };
          }

          const record = await getDomainRecord(siteInfo.siteKey);
          const eligible = record.accounts.filter((a) => !a.skipped);
          const list = eligible.length ? eligible : record.accounts;
          if (!list.length) {
            return { ok: false, error: 'اکانتی برای باز کردن وجود ندارد.' };
          }

          const alreadyOpenIds = new Set();
          for (const info of isolatedTabs.values()) {
            if (info.siteKey === siteInfo.siteKey) {
              alreadyOpenIds.add(info.accountId);
            }
          }

          const unopened = list.filter((a) => !alreadyOpenIds.has(a.id));
          const candidates = unopened.length > 0 ? unopened : list;
          const maxCount =
            msg.count === 'all'
              ? candidates.length
              : Math.min(Number(msg.count) || 5, candidates.length);

          const toOpen = candidates.slice(0, maxCount);

          // Launch asynchronously with safe 550ms stagger so browser & Cloudflare don't choke
          (async () => {
            for (let i = 0; i < toOpen.length; i++) {
              await openAccountInIsolatedTab(
                targetUrl,
                siteInfo.siteKey,
                toOpen[i].id,
                i === 0
              ).catch(() => {});
              if (i < toOpen.length - 1) {
                await new Promise((r) => setTimeout(r, 550));
              }
            }
          })();

          return {
            ok: true,
            openingCount: toOpen.length
          };
        }

        case 'SYNC_ISOLATED_STORAGE': {
          const { siteKey, accountId, localStorage, sessionStorage } = msg;
          if (!siteKey || !accountId) return { ok: false };
          await withSiteLock(siteKey, async () => {
            const rec = await getDomainRecord(siteKey);
            const acc = rec.accounts.find((a) => a.id === accountId);
            if (acc) {
              if (localStorage && typeof localStorage === 'object') {
                acc.localStorage = localStorage;
              }
              if (sessionStorage && typeof sessionStorage === 'object') {
                acc.sessionStorage = sessionStorage;
              }
              acc.updatedAt = Date.now();
              await saveDomainRecord(siteKey, rec);
            }
          });
          return { ok: true };
        }

        case 'SYNC_ISOLATED_JS_COOKIE': {
          const { siteKey, accountId, name, value, expired } = msg;
          const tabId = sender?.tab?.id;
          if (!siteKey || !accountId || !name) return { ok: false };

          await withSiteLock(siteKey, async () => {
            const rec = await getDomainRecord(siteKey);
            const acc = rec.accounts.find((a) => a.id === accountId);
            if (!acc) return;
            acc.cookies = Array.isArray(acc.cookies) ? acc.cookies : [];
            const idx = acc.cookies.findIndex((c) => c.name === name);
            if (expired) {
              if (idx >= 0) acc.cookies.splice(idx, 1);
            } else if (idx >= 0) {
              acc.cookies[idx].value = value;
            } else {
              acc.cookies.push({
                name,
                value,
                domain: siteKey,
                hostOnly: false,
                path: '/',
                secure: true,
                httpOnly: false,
                sameSite: 'lax',
                session: true
              });
            }
            acc.updatedAt = Date.now();
            await saveDomainRecord(siteKey, rec);
            if (tabId) {
              await refreshIsolatedTabDnrRules(tabId, acc);
            }
          });
          return { ok: true };
        }

        case 'SAVE_CURRENT_ACCOUNT': {
          const tab = await resolveTargetTab(msg.tabId, sender);
          let linkedMbId = msg.mailboxId || null;
          let linkedEmail = msg.email || '';
          if (msg.autoLinkActiveMail && !linkedMbId) {
            const mState = await getMailState();
            const activeMb = mState.mailboxes.find((m) => m.id === mState.activeMailboxId);
            if (activeMb) {
              linkedMbId = activeMb.id;
              linkedEmail = activeMb.address;
            }
          }
          return await performSaveCurrentAccount(
            tab,
            msg.name,
            msg.note,
            msg.color,
            linkedMbId,
            linkedEmail
          );
        }

        case 'MAIL_GET_STATE': {
          const st = await getMailState();
          return {
            ok: true,
            activeMailboxId: st.activeMailboxId,
            mailboxes: st.mailboxes.map(summarizeMailbox)
          };
        }

        case 'MAIL_FETCH_DOMAINS': {
          const provider = msg.provider || 'hd';
          const domains = await fetchMailDomains(provider);
          return { ok: true, domains, popular: getPopularDomains(provider, domains) };
        }

        case 'MAIL_CREATE_INBOX': {
          const mb = await createTempMailbox(
            msg.provider || 'hd',
            msg.customUser || '',
            msg.domain || ''
          );
          const st = await getMailState();
          return {
            ok: true,
            mailbox: summarizeMailbox(mb),
            activeMailboxId: st.activeMailboxId,
            mailboxes: st.mailboxes.map(summarizeMailbox)
          };
        }

        case 'MAIL_SELECT_INBOX': {
          const st = await getMailState();
          if (st.mailboxes.some((m) => m.id === msg.mailboxId)) {
            st.activeMailboxId = msg.mailboxId;
            await saveMailState(st);
          }
          return { ok: true, activeMailboxId: st.activeMailboxId };
        }

        case 'MAIL_DELETE_INBOX': {
          const st = await getMailState();
          st.mailboxes = st.mailboxes.filter((m) => m.id !== msg.mailboxId);
          if (st.activeMailboxId === msg.mailboxId) {
            st.activeMailboxId = st.mailboxes[0]?.id || null;
          }
          await saveMailState(st);
          return {
            ok: true,
            activeMailboxId: st.activeMailboxId,
            mailboxes: st.mailboxes.map(summarizeMailbox)
          };
        }

        case 'MAIL_LIST_MESSAGES': {
          const st = await getMailState();
          const targetId = msg.mailboxId || st.activeMailboxId;
          const mb = st.mailboxes.find((m) => m.id === targetId);
          if (!mb) {
            return { ok: false, error: 'ابتدا یک ایمیل بسازید یا انتخاب کنید.' };
          }

          let messages = await listMessagesForMailbox(mb);

          // سرورهای HD / Temp-Mail.io پرچم «خوانده‌شده» ندارند؛
          // پیام‌های موجود در اولین لیست، خوانده فرض می‌شوند و پیام‌های جدید خوانده‌نشده می‌مانند.
          if (getMailboxType(mb) !== 'hydra') {
            if (!Array.isArray(mb.initialIds)) {
              mb.initialIds = messages.map((m) => m.id);
            }
            const seenSet = new Set([...(mb.initialIds || []), ...(mb.seenIds || [])]);
            messages = messages.map((m) => ({ ...m, seen: seenSet.has(m.id) }));
            await saveMailState(st);
          }

          return { ok: true, messages };
        }

        case 'MAIL_READ_MESSAGE': {
          const st = await getMailState();
          const targetId = msg.mailboxId || st.activeMailboxId;
          const mb = st.mailboxes.find((m) => m.id === targetId);
          if (!mb) return { ok: false, error: 'صندوق ایمیل پیدا نشد.' };

          const message = await readMessageForMailbox(mb, msg.messageId);

          if (getMailboxType(mb) !== 'hydra') {
            if (!Array.isArray(mb.seenIds)) mb.seenIds = [];
            if (!mb.seenIds.includes(message.id)) {
              mb.seenIds.push(message.id);
              if (mb.seenIds.length > 300) mb.seenIds = mb.seenIds.slice(-200);
            }
            await saveMailState(st);
          }

          return {
            ok: true,
            canDelete: getMailboxType(mb) === 'hydra',
            message
          };
        }

        case 'MAIL_DELETE_MESSAGE': {
          const st = await getMailState();
          const targetId = msg.mailboxId || st.activeMailboxId;
          const mb = st.mailboxes.find((m) => m.id === targetId);
          if (!mb) return { ok: false, error: 'صندوق ایمیل پیدا نشد.' };

          if (getMailboxType(mb) === 'hydra') {
            await mailAuthedFetch(mb, `/messages/${encodeURIComponent(msg.messageId)}`, {
              method: 'DELETE'
            });
          } else {
            // سرورهای Instant Mail / Temp-Mail.io حذف دستی ندارند؛ پیام‌ها خودکار منقضی می‌شوند.
            return {
              ok: false,
              error: 'این سرور حذف دستی پیام ندارد؛ پیام‌ها به‌صورت خودکار پاک می‌شوند.'
            };
          }
          return { ok: true };
        }

        case 'MAIL_FILL_IN_PAGE': {
          const tab = await resolveTargetTab(msg.tabId, sender);
          return await fillValueInTab(tab?.id, msg.value, msg.fieldKind || 'email');
        }

        case 'UPDATE_ACCOUNT_SESSION': {
          const tab = await resolveTargetTab(msg.tabId, sender);
          return await performUpdateAccountSession(tab, msg.accountId);
        }

        case 'SWITCH_TO_ACCOUNT': {
          const tab = await resolveTargetTab(msg.tabId, sender);
          return await performSwitchToAccount(tab, msg.accountId);
        }

        case 'SWITCH_CYCLE': {
          const tab = await resolveTargetTab(msg.tabId, sender);
          return await performCycleSwitch(tab, msg.direction ?? 1);
        }

        case 'NEW_CLEAN_SESSION': {
          const tab = await resolveTargetTab(msg.tabId, sender);
          return await performNewCleanSession(tab);
        }

        case 'EDIT_ACCOUNT_META': {
          const { siteKey, accountId, patch } = msg;
          const record = await getDomainRecord(siteKey);
          const acc = record.accounts.find((a) => a.id === accountId);
          if (!acc) return { ok: false, error: 'اکانت یافت نشد.' };

          if (typeof patch?.name === 'string' && patch.name.trim()) {
            acc.name = patch.name.trim();
          }
          if (typeof patch?.note === 'string') {
            acc.note = patch.note.trim();
          }
          if (typeof patch?.color === 'string') {
            acc.color = patch.color;
          }
          if (typeof patch?.skipped === 'boolean') {
            acc.skipped = patch.skipped;
          }
          if (Array.isArray(patch?.labels)) {
            acc.labels = patch.labels
              .map((l) => String(l).trim().slice(0, 18))
              .filter(Boolean)
              .slice(0, 5);
          }
          if (typeof patch?.pinned === 'boolean') {
            acc.pinned = patch.pinned;
          }

          await saveDomainRecord(siteKey, record);
          await broadcastWidgetRefresh(siteKey);
          return { ok: true, account: summarizeAccount(acc) };
        }

        case 'QUICK_SEARCH_ACCOUNTS': {
          const currentSiteKey = msg.currentSiteKey || '';
          const { sameSite, otherSites } = await quickSearchAccounts(msg.query, currentSiteKey);
          return { ok: true, sameSite, otherSites };
        }

        case 'GET_NOTIF_PREFS': {
          return { ok: true, notifPrefs: await getNotifPrefs() };
        }

        case 'SET_NOTIF_ENABLED': {
          const prefs = await getNotifPrefs();
          prefs.enabled = msg.enabled !== false;
          await saveNotifPrefs(prefs);
          return { ok: true, notifPrefs: prefs };
        }

        case 'MAIL_POLL_NOW': {
          return await pollMailboxesForNotifications({ force: Boolean(msg.force) });
        }

        case 'DELETE_ACCOUNT': {
          const { siteKey, accountId } = msg;
          const record = await getDomainRecord(siteKey);
          record.accounts = record.accounts.filter((a) => a.id !== accountId);
          if (record.activeAccountId === accountId) {
            record.activeAccountId = null;
          }
          await saveDomainRecord(siteKey, record);
          await broadcastWidgetRefresh(siteKey);
          return {
            ok: true,
            activeAccountId: record.activeAccountId,
            accounts: record.accounts.map(summarizeAccount)
          };
        }

        case 'UPDATE_SETTINGS': {
          const { siteKey, patch } = msg;
          const record = await getDomainRecord(siteKey);
          record.settings = { ...record.settings, ...(patch || {}) };
          await saveDomainRecord(siteKey, record);
          await broadcastWidgetRefresh(siteKey);
          return { ok: true, settings: record.settings };
        }

        case 'SAVE_WIDGET_STATE': {
          const current = await getWidgetPos();
          const updated = { ...current, ...(msg.widgetPos || {}) };
          await chrome.storage.local.set({ widgetPos: updated });
          return { ok: true, widgetPos: updated };
        }

        case 'EXPORT_DATA': {
          const domains = await getAllDomains();
          const mailState = await getMailState();
          if (msg.scope === 'site' && msg.siteKey) {
            const single = domains[msg.siteKey]
              ? { [msg.siteKey]: domains[msg.siteKey] }
              : {};
            return {
              ok: true,
              backup: {
                app: 'ai-account-switcher',
                version: 3,
                exportedAt: new Date().toISOString(),
                domains: single,
                mailState
              }
            };
          }
          return {
            ok: true,
            backup: {
              app: 'ai-account-switcher',
              version: 3,
              exportedAt: new Date().toISOString(),
              domains,
              mailState
            }
          };
        }

        case 'IMPORT_DATA': {
          const incoming = msg.backup;
          if (!incoming || typeof incoming.domains !== 'object') {
            return { ok: false, error: 'فایل پشتیبان معتبر نیست.' };
          }
          const existing = msg.mode === 'replace' ? {} : await getAllDomains();
          let importedCount = 0;

          for (const [siteKey, rec] of Object.entries(incoming.domains)) {
            if (!rec || !Array.isArray(rec.accounts)) continue;
            if (!existing[siteKey] || msg.mode === 'replace') {
              existing[siteKey] = {
                siteKey,
                activeAccountId: rec.activeAccountId || null,
                accounts: rec.accounts,
                settings: {
                  floatingWidget: true,
                  autoSync: true,
                  includeStorage: true,
                  ...(rec.settings || {})
                }
              };
              importedCount += rec.accounts.length;
            } else {
              const knownIds = new Set(existing[siteKey].accounts.map((a) => a.id));
              for (const acc of rec.accounts) {
                if (!knownIds.has(acc.id)) {
                  existing[siteKey].accounts.push(acc);
                  importedCount++;
                }
              }
            }
          }

          await chrome.storage.local.set({ domains: existing });

          if (incoming.mailState && Array.isArray(incoming.mailState.mailboxes)) {
            const curMail = await getMailState();
            const knownMbIds = new Set(curMail.mailboxes.map((m) => m.id));
            for (const mb of incoming.mailState.mailboxes) {
              if (!knownMbIds.has(mb.id)) {
                curMail.mailboxes.push(mb);
              }
            }
            if (!curMail.activeMailboxId && curMail.mailboxes.length) {
              curMail.activeMailboxId = curMail.mailboxes[0].id;
            }
            await saveMailState(curMail);
          }
          const allTabs = await chrome.tabs.query({});
          for (const t of allTabs) {
            if (t.id && t.url) {
              updateBadgeForTab(t.id, t.url);
              chrome.tabs.sendMessage(t.id, { type: 'REFRESH_WIDGET' }).catch(() => {});
            }
          }

          return { ok: true, importedCount };
        }

        default:
          return { ok: false, error: 'دستور نامعتبر است.' };
      }
    } catch (err) {
      return { ok: false, error: err?.message || 'خطای غیرمنتظره رخ داد.' };
    }
  })().then(sendResponse);

  return true;
});

// ----------------------------------------------------------------------------
// Keyboard Shortcuts & Tab Lifecycle Listeners
// ----------------------------------------------------------------------------

chrome.commands.onCommand.addListener(async (command) => {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  if (!activeTab) return;

  if (command === 'quick-switch-search') {
    // باز کردن پالت جست‌وجوی سریع در همین تب (اگر صفحه پشتیبانی شود)
    try {
      await chrome.tabs.sendMessage(activeTab.id, { type: 'OPEN_QUICK_SWITCHER' });
      return;
    } catch {}
    // صفحه داخلی مرورگر: پالت داخل پاپ‌آپ باز می‌شود
    try {
      const p = chrome.action.openPopup();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {}
    return;
  }

  if (command === 'switch-next-account') {
    await performCycleSwitch(activeTab, 1);
  } else if (command === 'switch-prev-account') {
    await performCycleSwitch(activeTab, -1);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    updateBadgeForTab(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab?.url) {
      updateBadgeForTab(tabId, tab.url);
    }
  } catch {}
});

if (chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    cleanupIsolatedTab(tabId);
  });
}

// ----------------------------------------------------------------------------
// Notification Polling — چک دوره‌ای همه صندوق‌ها حتی وقتی پاپ‌آپ بسته است
// ----------------------------------------------------------------------------

const MAIL_NOTIF_ALARM = 'mail-notif-poll';
const MAIL_NOTIF_BOOT_ALARM = 'mail-notif-boot';

try {
  chrome.alarms.create(MAIL_NOTIF_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(MAIL_NOTIF_BOOT_ALARM, { delayInMinutes: 0.3 });
} catch {}

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm?.name === MAIL_NOTIF_ALARM || alarm?.name === MAIL_NOTIF_BOOT_ALARM) {
    pollMailboxesForNotifications().catch(() => {});
  }
});
