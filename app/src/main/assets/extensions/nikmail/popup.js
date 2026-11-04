// ============================================================================
// AI Multi-Account Switcher + Temp Mail Client - Popup Controller (v3.0)
// ============================================================================

const COLORS = [
  '#6366f1', '#06b6d4', '#10b981', '#f59e0b',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316',
  '#3b82f6', '#ef4444'
];

const LABEL_PRESETS = ['کاری', 'شخصی', 'آزمایشی'];
const LABEL_COLORS = {
  'کاری': '#818cf8',
  'شخصی': '#34d399',
  'آزمایشی': '#fbbf24'
};
function labelColor(label) {
  if (LABEL_COLORS[label]) return LABEL_COLORS[label];
  let h = 0;
  for (const ch of String(label)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return `hsl(${h}, 70%, 68%)`;
}

// ----------------------------------------------------------------------------
// SVG icon system (Lucide-style, stroke = currentColor) — هیچ ایموجی خام در UI
// ----------------------------------------------------------------------------
const ICON_PATHS = {
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  pen: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  shuffle: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  'at-sign': '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  'skip-back': '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>',
  'layout-grid': '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  key: '<path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.73-2Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  keyboard: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/><path d="M7 16h10"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  'arrow-down-up': '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
  'mail-check': '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m16 16 2 2 4-4"/>',
  'book-open': '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>'
};

function ic(name, cls = 'ic') {
  const body = ICON_PATHS[name] || '';
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

// تزریق آیکون‌های استاتیک مشخص‌شده در popup.html با <span data-icon="..."></span>
(function injectStaticIcons() {
  document.querySelectorAll('span[data-icon]').forEach((el) => {
    if (el.dataset.iconDone) return;
    el.innerHTML = ic(el.dataset.icon, el.dataset.iconClass || 'ic');
    el.dataset.iconDone = '1';
  });
})();

// کپی مطمئن در پاپ‌آپ: Clipboard API + فالبک execCommand (وقتی فوکوس پاپ‌آپ افتاده)
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    if (ok) return true;
  } catch {}
  return false;
}

const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function toFa(val) {
  return String(val).replace(/\d/g, (d) => persianDigits[Number(d)]);
}

function formatRelativeTime(ts) {
  if (!ts) return 'استفاده‌نشده';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 45) return 'هم‌اکنون';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${toFa(mins)} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${toFa(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  return `${toFa(days)} روز پیش`;
}

function sendMsg(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res || { ok: false, error: 'پاسخی دریافت نشد.' });
    });
  });
}

let state = {
  tabId: null,
  url: '',
  supported: false,
  siteKey: '',
  hostname: '',
  isGoogleUnified: false,
  activeAccountId: null,
  isIsolatedTab: false,
  isolatedAccountId: null,
  openIsolatedTabs: [],
  accounts: [],
  settings: {
    floatingWidget: true,
    autoSync: true,
    includeStorage: true
  }
};

let mailState = {
  activeMailboxId: null,
  mailboxes: [],
  messages: [],
  readingMessageId: null
};

// رابط ساخت ایمیل — دقیقا مثل اپ Instant Mail: سرویس + گروه (تصادفی/دامنه/محبوب)
const MAIL_PROVIDER_META = [
  { key: 'hd', icon: 'zap', label: 'اینسنت میل' },
  { key: 'hd_gmail', icon: 'mail', label: 'جیمیل آنی' },
  { key: 'temp-mail-io', icon: 'globe', label: 'Temp-Mail.io' },
  { key: 'mail.tm', icon: 'at-sign', label: 'Mail.tm' },
  { key: 'mail.gw', icon: 'inbox', label: 'Mail.gw' }
];

let mailUi = { provider: 'hd', group: 'domain', domain: '' };
let createCardOpen = false;
let providerDomainsCache = {}; // provider -> { domains, popular }

let currentView = 'accounts'; // 'accounts' | 'mail'
let searchQuery = '';
let listPref = { label: '', sort: 'recent' };
let pendingDeleteId = null;
let editingAccountId = null;
let editingColor = COLORS[0];
let editingLabels = [];
let editingPinned = false;
let toastTimer = null;
let inboxPollTimer = null;

const els = {
  domainBadge: document.getElementById('domainBadge'),
  countBadge: document.getElementById('countBadge'),
  isoCountBadge: document.getElementById('isoCountBadge'),
  toggleSettingsBtn: document.getElementById('toggleSettingsBtn'),
  quickSearchBtn: document.getElementById('quickSearchBtn'),
  chkDesktopNotif: document.getElementById('chkDesktopNotif'),
  sortSelect: document.getElementById('sortSelect'),
  labelFilterRow: document.getElementById('labelFilterRow'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  tabAccountsBtn: document.getElementById('tabAccountsBtn'),
  tabMailBtn: document.getElementById('tabMailBtn'),
  mailUnreadBadge: document.getElementById('mailUnreadBadge'),
  accountsView: document.getElementById('accountsView'),
  mailView: document.getElementById('mailView'),
  toast: document.getElementById('toast'),
  unsupportedState: document.getElementById('unsupportedState'),
  mainContent: document.getElementById('mainContent'),
  googleWarning: document.getElementById('googleWarning'),
  settingsPanel: document.getElementById('settingsPanel'),
  chkFloatingWidget: document.getElementById('chkFloatingWidget'),
  chkAutoSync: document.getElementById('chkAutoSync'),
  chkIncludeStorage: document.getElementById('chkIncludeStorage'),
  exportSiteBtn: document.getElementById('exportSiteBtn'),
  exportAllBtn: document.getElementById('exportAllBtn'),
  importBtn: document.getElementById('importBtn'),
  importFileInput: document.getElementById('importFileInput'),
  activeStatusText: document.getElementById('activeStatusText'),
  isoCountText: document.getElementById('isoCountText'),
  nextAccountBtn: document.getElementById('nextAccountBtn'),
  prevAccountBtn: document.getElementById('prevAccountBtn'),
  openBatchBtn: document.getElementById('openBatchBtn'),
  batchCountSelect: document.getElementById('batchCountSelect'),
  accountNameInput: document.getElementById('accountNameInput'),
  accountNoteInput: document.getElementById('accountNoteInput'),
  linkActiveMailRow: document.getElementById('linkActiveMailRow'),
  chkLinkActiveMail: document.getElementById('chkLinkActiveMail'),
  linkActiveMailLabel: document.getElementById('linkActiveMailLabel'),
  saveCurrentBtn: document.getElementById('saveCurrentBtn'),
  newSessionBtn: document.getElementById('newSessionBtn'),
  searchInput: document.getElementById('searchInput'),
  emptyAccountsState: document.getElementById('emptyAccountsState'),
  accountsList: document.getElementById('accountsList'),
  editModal: document.getElementById('editModal'),
  editNameInput: document.getElementById('editNameInput'),
  editNoteInput: document.getElementById('editNoteInput'),
  editLabelPicker: document.getElementById('editLabelPicker'),
  editCustomLabelInput: document.getElementById('editCustomLabelInput'),
  addCustomLabelBtn: document.getElementById('addCustomLabelBtn'),
  editColorPicker: document.getElementById('editColorPicker'),
  saveEditBtn: document.getElementById('saveEditBtn'),
  cancelEditBtn: document.getElementById('cancelEditBtn'),

  // Mail View Elements (Instant Mail app-style UI)
  mailServiceChips: document.getElementById('mailServiceChips'),
  imDomainGrid: document.getElementById('imDomainGrid'),
  imGroupTabsBox: document.getElementById('imGroupTabsBox'),
  activeMailMeta: document.getElementById('activeMailMeta'),
  mailCreateCard: document.getElementById('mailCreateCard'),
  closeCreateCardBtn: document.getElementById('closeCreateCardBtn'),
  newMailBtn: document.getElementById('newMailBtn'),
  groupTabs: document.querySelectorAll('.im-group-tab'),
  mailCustomUser: document.getElementById('mailCustomUser'),
  createMailBtn: document.getElementById('createMailBtn'),
  activeMailboxCard: document.getElementById('activeMailboxCard'),
  mailboxHistorySelect: document.getElementById('mailboxHistorySelect'),
  deleteMailboxBtn: document.getElementById('deleteMailboxBtn'),
  currentEmailText: document.getElementById('currentEmailText'),
  copyEmailBtn: document.getElementById('copyEmailBtn'),
  fillEmailBtn: document.getElementById('fillEmailBtn'),
  inboxSection: document.getElementById('inboxSection'),
  inboxPollStatus: document.getElementById('inboxPollStatus'),
  refreshInboxBtn: document.getElementById('refreshInboxBtn'),
  emptyInboxState: document.getElementById('emptyInboxState'),
  messagesList: document.getElementById('messagesList'),

  // Mail Read Modal
  mailReadModal: document.getElementById('mailReadModal'),
  mailModalSubject: document.getElementById('mailModalSubject'),
  mailModalFrom: document.getElementById('mailModalFrom'),
  mailModalOtpBox: document.getElementById('mailModalOtpBox'),
  mailModalOtpCode: document.getElementById('mailModalOtpCode'),
  copyModalOtpBtn: document.getElementById('copyModalOtpBtn'),
  mailModalLinks: document.getElementById('mailModalLinks'),
  mailModalBody: document.getElementById('mailModalBody'),
  deleteMessageBtn: document.getElementById('deleteMessageBtn'),
  closeMailModalBtn: document.getElementById('closeMailModalBtn'),
  closeMailModalBtn2: document.getElementById('closeMailModalBtn2')
};

function showToast(text, isError = false) {
  clearTimeout(toastTimer);
  els.toast.textContent = text;
  els.toast.classList.toggle('error', isError);
  els.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => {
    els.toast.classList.add('hidden');
  }, 3200);
}

// ----------------------------------------------------------------------------
// View Navigation
// ----------------------------------------------------------------------------

function switchView(viewName) {
  currentView = viewName;
  const isAcc = viewName === 'accounts';
  els.tabAccountsBtn.classList.toggle('active', isAcc);
  els.tabMailBtn.classList.toggle('active', !isAcc);
  els.accountsView.classList.toggle('hidden', !isAcc);
  els.mailView.classList.toggle('hidden', isAcc);

  clearInterval(inboxPollTimer);
  if (!isAcc) {
    renderMailSections();
    refreshInboxMessages();
    inboxPollTimer = setInterval(() => {
      if (mailState.activeMailboxId) {
        refreshInboxMessages(true);
      }
    }, 5000);
  }
}

els.tabAccountsBtn.addEventListener('click', () => switchView('accounts'));
els.tabMailBtn.addEventListener('click', () => switchView('mail'));

// ----------------------------------------------------------------------------
// Site & Accounts State
// ----------------------------------------------------------------------------

async function loadState() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  await loadListPref();

  const [res, mRes] = await Promise.all([
    sendMsg({ type: 'GET_SITE_STATE', tabId: tab?.id, url: tab?.url }),
    sendMsg({ type: 'MAIL_GET_STATE' })
  ]);

  if (mRes?.ok) {
    mailState.activeMailboxId = mRes.activeMailboxId;
    mailState.mailboxes = mRes.mailboxes || [];
    await loadMailUiPref();
    renderMailSections();
  }

  if (!res.ok || !res.supported) {
    state.supported = false;
    state.tabId = tab?.id || null;
    els.domainBadge.textContent = 'صفحه داخلی مرورگر';
    els.countBadge.textContent = '۰ اکانت';
    els.isoCountBadge.classList.add('hidden');
    els.unsupportedState.classList.remove('hidden');
    els.mainContent.classList.add('hidden');
    return;
  }

  state = {
    ...state,
    tabId: tab?.id || res.tabId,
    url: tab?.url || res.url,
    supported: true,
    siteKey: res.siteKey,
    hostname: res.hostname,
    isGoogleUnified: Boolean(res.isGoogleUnified),
    activeAccountId: res.activeAccountId,
    isIsolatedTab: Boolean(res.isIsolatedTab),
    isolatedAccountId: res.isolatedAccountId || null,
    openIsolatedTabs: res.openIsolatedTabs || [],
    accounts: res.accounts || [],
    settings: res.settings || state.settings
  };

  els.unsupportedState.classList.add('hidden');
  els.mainContent.classList.remove('hidden');

  const currentVal = els.accountNameInput.value.trim();
  if (!currentVal || /^اکانت\s+[۰-۹0-9]+$/.test(currentVal)) {
    els.accountNameInput.value = `اکانت ${toFa(state.accounts.length + 1)}`;
  }

  renderUI();
}

function renderUI() {
  els.domainBadge.textContent = state.siteKey;
  els.countBadge.textContent = `${toFa(state.accounts.length)} اکانت`;

  const openIsoCount = state.openIsolatedTabs.length;
  els.isoCountBadge.classList.toggle('hidden', openIsoCount === 0);
  els.isoCountText.textContent = `${toFa(openIsoCount)} تب باز`;

  els.googleWarning.classList.toggle('hidden', !state.isGoogleUnified);

  els.chkFloatingWidget.checked = state.settings.floatingWidget !== false;
  els.chkAutoSync.checked = state.settings.autoSync !== false;
  els.chkIncludeStorage.checked = state.settings.includeStorage !== false;

  loadNotifPref();

  // Link active mail indicator
  const activeMb = mailState.mailboxes.find((m) => m.id === mailState.activeMailboxId);
  if (activeMb) {
    els.linkActiveMailRow.classList.remove('hidden');
    els.linkActiveMailLabel.textContent = `اتصال ایمیل فعال (${activeMb.address}) به این اکانت`;
  } else {
    els.linkActiveMailRow.classList.add('hidden');
  }

  const total = state.accounts.length;

  if (state.isIsolatedTab && state.isolatedAccountId) {
    const isoIdx = state.accounts.findIndex((a) => a.id === state.isolatedAccountId);
    const isoAcc = isoIdx >= 0 ? state.accounts[isoIdx] : null;
    els.activeStatusText.textContent = isoAcc
      ? `تب همزمان ایزوله: ${isoAcc.name} (${toFa(isoIdx + 1)})`
      : 'تب ایزوله';
    els.activeStatusText.style.color = '#67e8f9';
  } else {
    const activeIdx = state.accounts.findIndex((a) => a.id === state.activeAccountId);
    const activeAcc = activeIdx >= 0 ? state.accounts[activeIdx] : null;

    if (activeAcc) {
      els.activeStatusText.textContent = `${activeAcc.name} (${toFa(activeIdx + 1)} از ${toFa(total)})`;
      els.activeStatusText.style.color = '#34d399';
    } else if (total > 0) {
      els.activeStatusText.textContent = 'نشست جدید (ذخیره‌نشده)';
      els.activeStatusText.style.color = '#fbbf24';
    } else {
      els.activeStatusText.textContent = 'بدون اکانت ذخیره‌شده';
      els.activeStatusText.style.color = '#94a3b8';
    }
  }

  const hasActive = state.accounts.some((a) => a.id === state.activeAccountId);
  const canCycle = total > 1 || (total === 1 && !hasActive);
  els.nextAccountBtn.disabled = !canCycle;
  els.prevAccountBtn.disabled = !canCycle;
  els.openBatchBtn.disabled = total === 0;

  els.searchInput.parentElement.classList.toggle('hidden', total < 4);
  els.emptyAccountsState.classList.toggle('hidden', total > 0);

  els.sortSelect.value = listPref.sort || 'recent';
  renderLabelFilterRow();
  renderAccountsList();
}

async function loadListPref() {
  try {
    const data = await chrome.storage.local.get('listPref');
    if (data.listPref && typeof data.listPref === 'object') {
      listPref = { ...listPref, ...data.listPref };
    }
  } catch {}
}

function saveListPref() {
  chrome.storage.local.set({ listPref }).catch(() => {});
}

function sortedAccountsForDisplay() {
  const sort = listPref.sort || 'recent';
  const arr = [...state.accounts];
  arr.sort((a, b) => {
    if (Boolean(b.pinned) !== Boolean(a.pinned)) return b.pinned ? 1 : -1;
    if (sort === 'name') return String(a.name).localeCompare(String(b.name), 'fa');
    if (sort === 'created') return (b.createdAt || 0) - (a.createdAt || 0);
    return (b.lastUsedAt || 0) - (a.lastUsedAt || 0);
  });
  return arr;
}

function getAllUsedLabels() {
  const set = new Set();
  for (const acc of state.accounts) {
    for (const l of acc.labels || []) set.add(l);
  }
  return Array.from(set);
}

function renderLabelFilterRow() {
  const labels = getAllUsedLabels();
  els.labelFilterRow.classList.toggle('hidden', labels.length === 0);
  els.labelFilterRow.innerHTML = '';

  const mkChip = (label, isActive, color) => {
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (isActive ? ' active' : '');
    if (label === '__all__') {
      chip.innerHTML = `${ic('users', 'ic ic-sm')}<span></span>`;
      chip.querySelector('span').textContent = 'همه';
    } else {
      chip.innerHTML = `${ic('tag', 'ic ic-sm')}<span></span>`;
      chip.querySelector('span').textContent = label;
    }
    if (color && isActive) {
      chip.style.borderColor = color;
      chip.style.color = color;
    }
    chip.addEventListener('click', () => {
      listPref.label = label === '__all__' ? '' : label;
      saveListPref();
      renderLabelFilterRow();
      renderAccountsList();
    });
    return chip;
  };

  els.labelFilterRow.appendChild(mkChip('__all__', !listPref.label));
  labels.forEach((l) => {
    els.labelFilterRow.appendChild(mkChip(l, listPref.label === l, labelColor(l)));
  });
}

function renderAccountsList() {
  els.accountsList.innerHTML = '';
  const q = searchQuery.trim().toLowerCase();

  const openTabByAccId = new Map();
  for (const item of state.openIsolatedTabs) {
    openTabByAccId.set(item.accountId, item.tabId);
  }

  const originalIndexById = new Map();
  state.accounts.forEach((acc, idx) => originalIndexById.set(acc.id, idx));

  const sorted = sortedAccountsForDisplay();

  sorted.forEach((acc) => {
    const idx = originalIndexById.get(acc.id);

    if (listPref.label && !(acc.labels || []).includes(listPref.label)) return;

    if (q) {
      const hay = `${acc.name} ${acc.note || ''} ${acc.email || ''} ${(acc.labels || []).join(' ')} ${idx + 1} ${toFa(idx + 1)}`.toLowerCase();
      if (!hay.includes(q)) return;
    }

    const effectiveCurrentId = state.isIsolatedTab
      ? state.isolatedAccountId
      : state.activeAccountId;
    const isActiveHere = acc.id === effectiveCurrentId;
    const openIsoTabId = openTabByAccId.get(acc.id);

    const card = document.createElement('div');
    card.className =
      'acc-card' +
      (isActiveHere ? ' active' : '') +
      (acc.skipped ? ' skipped' : '');

    const main = document.createElement('div');
    main.className = 'acc-main';
    main.title = `کلیک برای سوییچ در همین تب به «${acc.name}»`;

    const indexBadge = document.createElement('div');
    indexBadge.className = 'acc-index';
    indexBadge.style.background = acc.color || '#6366f1';
    indexBadge.textContent = toFa(idx + 1);

    const info = document.createElement('div');
    info.className = 'acc-info';

    const titleRow = document.createElement('div');
    titleRow.className = 'acc-title-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'acc-name';
    nameEl.textContent = acc.name;
    titleRow.appendChild(nameEl);

    if (isActiveHere) {
      const activePill = document.createElement('span');
      activePill.className = 'pill-badge pill-active';
      activePill.textContent = state.isIsolatedTab ? 'این تب' : 'فعال';
      titleRow.appendChild(activePill);
    }

    if (acc.pinned) {
      const pinPill = document.createElement('span');
      pinPill.className = 'pill-badge pill-pin';
      pinPill.innerHTML = `${ic('pin', 'ic ic-xs')}<span>پین</span>`;
      titleRow.appendChild(pinPill);
    }

    (acc.labels || []).slice(0, 3).forEach((l) => {
      const lbl = document.createElement('span');
      lbl.className = 'pill-badge pill-label';
      lbl.style.borderColor = labelColor(l);
      lbl.style.color = labelColor(l);
      lbl.textContent = l;
      titleRow.appendChild(lbl);
    });

    if (openIsoTabId) {
      const isoPill = document.createElement('span');
      isoPill.className = 'pill-badge pill-iso';
      isoPill.title = 'کلیک برای رفتن به تب بازِ این اکانت';
      isoPill.textContent = 'تب باز';
      isoPill.addEventListener('click', async (e) => {
        e.stopPropagation();
        await chrome.tabs.update(openIsoTabId, { active: true }).catch(() => {});
        window.close();
      });
      titleRow.appendChild(isoPill);
    }

    if (acc.skipped) {
      const skipPill = document.createElement('span');
      skipPill.className = 'pill-badge pill-skip';
      skipPill.textContent = 'توقف';
      titleRow.appendChild(skipPill);
    }

    const meta = document.createElement('div');
    meta.className = 'acc-meta';
    const parts = [];
    if (acc.note) parts.push(acc.note);
    parts.push(`${formatRelativeTime(acc.lastUsedAt)}`);
    meta.textContent = parts.join(' • ');

    info.appendChild(titleRow);
    info.appendChild(meta);

    main.appendChild(indexBadge);
    main.appendChild(info);

    main.addEventListener('click', async () => {
      await handleSwitchTo(acc.id);
    });

    const actions = document.createElement('div');
    actions.className = 'acc-actions';

    // Jump to linked Temp-Mail Inbox if linked!
    if (acc.mailboxId && mailState.mailboxes.some((m) => m.id === acc.mailboxId)) {
      const mailBtn = document.createElement('button');
      mailBtn.className = 'mini-action';
      mailBtn.title = `باز کردن صندوق پیام ایمیل این اکانت (${acc.email || ''})`;
      mailBtn.innerHTML = ic('mail');
      mailBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await sendMsg({ type: 'MAIL_SELECT_INBOX', mailboxId: acc.mailboxId });
        mailState.activeMailboxId = acc.mailboxId;
        renderMailUI();
        switchView('mail');
      });
      actions.appendChild(mailBtn);
    }

    // Open in Simultaneous Isolated Tab
    const isoBtn = document.createElement('button');
    isoBtn.className = 'mini-action iso-btn';
    isoBtn.title = openIsoTabId
      ? `رفتن به تب باز «${acc.name}»`
      : `باز کردن همزمان «${acc.name}» در یک تب جدید و ایزوله`;
    isoBtn.innerHTML = ic('external-link');
    isoBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const res = await sendMsg({
        type: 'OPEN_ISOLATED_TAB',
        tabId: state.tabId,
        url: state.url,
        accountId: acc.id,
        focusIfOpen: true
      });
      if (res.ok) {
        window.close();
      } else {
        showToast(res.error || 'خطا در باز کردن تب همزمان', true);
      }
    });

    // Update cookies
    const updateBtn = document.createElement('button');
    updateBtn.className = 'mini-action';
    updateBtn.title = 'بروزرسانی کوکی‌های این اکانت با نشست فعلی تب';
    updateBtn.innerHTML = ic('refresh');
    updateBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const res = await sendMsg({
        type: 'UPDATE_ACCOUNT_SESSION',
        tabId: state.tabId,
        accountId: acc.id
      });
      if (res.ok) {
        showToast(`نشست «${acc.name}» بروزرسانی شد.`);
        await loadState();
      } else {
        showToast(res.error || 'خطا در بروزرسانی', true);
      }
    });

    // Skip in rotation
    const skipBtn = document.createElement('button');
    skipBtn.className = 'mini-action';
    skipBtn.title = acc.skipped ? 'برگرداندن به چرخش' : 'رد شدن موقت در چرخش';
    skipBtn.innerHTML = ic(acc.skipped ? 'play' : 'pause');
    skipBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await sendMsg({
        type: 'EDIT_ACCOUNT_META',
        siteKey: state.siteKey,
        accountId: acc.id,
        patch: { skipped: !acc.skipped }
      });
      await loadState();
    });

    // Pin (علاقه‌مندی — همیشه اول لیست)
    const pinBtn = document.createElement('button');
    pinBtn.className = 'mini-action' + (acc.pinned ? ' pinned' : '');
    pinBtn.title = acc.pinned ? 'برداشتن پین' : 'پین‌کردن (همیشه اول لیست)';
    pinBtn.innerHTML = ic('pin');
    pinBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await sendMsg({
        type: 'EDIT_ACCOUNT_META',
        siteKey: state.siteKey,
        accountId: acc.id,
        patch: { pinned: !acc.pinned }
      });
      await loadState();
    });

    // Edit
    const editBtn = document.createElement('button');
    editBtn.className = 'mini-action';
    editBtn.title = 'ویرایش نام، یادداشت و رنگ';
    editBtn.innerHTML = ic('pen');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(acc);
    });

    // Delete
    const delBtn = document.createElement('button');
    const isConfirming = pendingDeleteId === acc.id;
    delBtn.className = 'mini-action' + (isConfirming ? ' confirm-del' : '');
    delBtn.title = 'حذف اکانت';
    delBtn.innerHTML = isConfirming ? '<span style="font-size:10.5px">حذف؟</span>' : ic('trash');
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (pendingDeleteId !== acc.id) {
        pendingDeleteId = acc.id;
        renderAccountsList();
        setTimeout(() => {
          if (pendingDeleteId === acc.id) {
            pendingDeleteId = null;
            renderAccountsList();
          }
        }, 3000);
        return;
      }
      pendingDeleteId = null;
      const res = await sendMsg({
        type: 'DELETE_ACCOUNT',
        siteKey: state.siteKey,
        accountId: acc.id
      });
      if (res.ok) {
        showToast(`«${acc.name}» حذف شد.`);
        await loadState();
      }
    });

    actions.appendChild(isoBtn);
    actions.appendChild(updateBtn);
    actions.appendChild(pinBtn);
    actions.appendChild(skipBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    card.appendChild(main);
    card.appendChild(actions);
    els.accountsList.appendChild(card);
  });
}

// ----------------------------------------------------------------------------
// Temp Mail & Live Inbox Controller
// ----------------------------------------------------------------------------

// ---------------- Instant Mail app-style create UI ----------------

async function ensureProviderDomains(provider) {
  if (!providerDomainsCache[provider]) {
    const res = await sendMsg({ type: 'MAIL_FETCH_DOMAINS', provider });
    providerDomainsCache[provider] = {
      domains: res.ok && Array.isArray(res.domains) ? res.domains : [],
      popular: res.ok && Array.isArray(res.popular) ? res.popular : []
    };
  }
  return providerDomainsCache[provider];
}

function renderServiceChips() {
  els.mailServiceChips.innerHTML = '';
  MAIL_PROVIDER_META.forEach((p) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className =
      'im-chip' + (mailUi.provider === p.key ? ' selected' : '');
    chip.innerHTML = `${ic(p.icon, 'ic ic-sm')}<span>${p.label}</span>`;
    chip.addEventListener('click', async () => {
      if (mailUi.provider === p.key) return;
      mailUi.provider = p.key;
      mailUi.domain = '';
      providerDomainsCache[p.key] = providerDomainsCache[p.key] || null;
      saveMailUiPref();
      renderServiceChips();
      await renderDomainGrid();
    });
    els.mailServiceChips.appendChild(chip);
  });
}

function renderGroupTabs() {
  els.groupTabs.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.group === mailUi.group);
  });
}

async function renderDomainGrid() {
  els.imDomainGrid.innerHTML = '';

  els.imGroupTabsBox.classList.remove('hidden');

  if (mailUi.group === 'random') {
    els.imDomainGrid.classList.add('hidden');
    els.mailCustomUser.classList.add('hidden');
    els.createMailBtn.innerHTML = `${ic('shuffle')}<span>ساخت ایمیل تصادفی</span>`;
    return;
  }

  const { domains, popular } = await ensureProviderDomains(mailUi.provider);
  const list = mailUi.group === 'popular'
    ? (popular.length ? popular : domains.slice(0, 3))
    : domains;

  els.imDomainGrid.classList.remove('hidden');
  els.mailCustomUser.classList.remove('hidden');
  els.createMailBtn.innerHTML = `${ic('sparkles')}<span>ساخت ایمیل جدید</span>`;

  if (!list.length) {
    const err = document.createElement('div');
    err.className = 'im-domain-error';
    err.textContent = 'دریافت دامنه‌ها ناموفق بود؛ دوباره تلاش کنید.';
    els.imDomainGrid.appendChild(err);
    return;
  }

  if (!mailUi.domain || !list.includes(mailUi.domain)) {
    mailUi.domain = list[0];
    saveMailUiPref();
  }

  list.forEach((d) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'im-domain-chip' + (d === mailUi.domain ? ' selected' : '');
    chip.textContent = `@${d}`;
    chip.title = `ساخت ایمیل روی دامنه ${d}`;
    chip.addEventListener('click', () => {
      mailUi.domain = d;
      saveMailUiPref();
      renderDomainGrid();
    });
    els.imDomainGrid.appendChild(chip);
  });
}

function renderMailSections() {
  const hasBoxes = mailState.mailboxes.length > 0;

  els.activeMailboxCard.classList.toggle('hidden', !hasBoxes);
  els.inboxSection.classList.toggle('hidden', !hasBoxes);
  els.mailCreateCard.classList.toggle('hidden', hasBoxes && !createCardOpen);
  els.closeCreateCardBtn.classList.toggle('hidden', !hasBoxes);

  renderServiceChips();
  renderGroupTabs();
  renderDomainGrid();
  renderMailUI();
}

async function loadMailUiPref() {
  try {
    const data = await chrome.storage.local.get('mailUiPref');
    if (data.mailUiPref && MAIL_PROVIDER_META.some((p) => p.key === data.mailUiPref.provider)) {
      mailUi = { ...mailUi, ...data.mailUiPref };
    }
  } catch {}
}

function saveMailUiPref() {
  chrome.storage.local.set({ mailUiPref: mailUi }).catch(() => {});
}

els.groupTabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    mailUi.group = btn.dataset.group;
    saveMailUiPref();
    renderGroupTabs();
    renderDomainGrid();
  });
});

els.newMailBtn.addEventListener('click', () => {
  createCardOpen = true;
  renderMailSections();
  els.mailCreateCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

els.closeCreateCardBtn.addEventListener('click', () => {
  createCardOpen = false;
  renderMailSections();
});

function renderMailUI() {
  const hasBoxes = mailState.mailboxes.length > 0;
  els.activeMailboxCard.classList.toggle('hidden', !hasBoxes);
  els.inboxSection.classList.toggle('hidden', !hasBoxes);

  if (!hasBoxes) return;

  els.mailboxHistorySelect.innerHTML = '';
  mailState.mailboxes.forEach((m, idx) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${idx + 1}. ${m.address}`;
    if (m.id === mailState.activeMailboxId) opt.selected = true;
    els.mailboxHistorySelect.appendChild(opt);
  });

  const active =
    mailState.mailboxes.find((m) => m.id === mailState.activeMailboxId) ||
    mailState.mailboxes[0];
  if (active) {
    mailState.activeMailboxId = active.id;
    els.currentEmailText.textContent = active.address;

    if (els.activeMailMeta) {
      els.activeMailMeta.textContent =
        'آدرس به‌صورت خودکار ساخته می‌شود، حدود ۲ روز اعتبار دارد و قابل بازیابی نیست.';
    }
  }
}

els.createMailBtn.addEventListener('click', async () => {
  els.createMailBtn.disabled = true;
  const originalLabel = els.createMailBtn.innerHTML;
  els.createMailBtn.innerHTML = `${ic('loader', 'ic spin')}<span>در حال ساخت...</span>`;

  const isRandom = mailUi.group === 'random';

  const res = await sendMsg({
    type: 'MAIL_CREATE_INBOX',
    provider: mailUi.provider,
    domain: isRandom ? '' : mailUi.domain,
    customUser: isRandom ? '' : els.mailCustomUser.value.trim()
  });

  els.createMailBtn.disabled = false;
  els.createMailBtn.innerHTML = originalLabel;

  if (res.ok) {
    els.mailCustomUser.value = '';
    createCardOpen = false;
    mailState.activeMailboxId = res.activeMailboxId;
    mailState.mailboxes = res.mailboxes || [];
    mailState.messages = [];
    renderMailSections();
    renderMessagesList();
    renderUI();
    refreshInboxMessages();

    const copied = await copyText(res.mailbox.address);
    showToast(copied ? `ایمیل ساخته و کپی شد: ${res.mailbox.address}` : 'ایمیل جدید ساخته شد');
  } else {
    showToast(res.error || 'خطا در ساخت ایمیل', true);
  }
});

els.mailboxHistorySelect.addEventListener('change', async (e) => {
  const id = e.target.value;
  await sendMsg({ type: 'MAIL_SELECT_INBOX', mailboxId: id });
  mailState.activeMailboxId = id;
  mailState.messages = [];
  renderMailUI();
  renderMessagesList();
  renderUI();
  await refreshInboxMessages();
});

els.deleteMailboxBtn.addEventListener('click', async () => {
  if (!mailState.activeMailboxId) return;
  const res = await sendMsg({
    type: 'MAIL_DELETE_INBOX',
    mailboxId: mailState.activeMailboxId
  });
  if (res.ok) {
    mailState.activeMailboxId = res.activeMailboxId;
    mailState.mailboxes = res.mailboxes || [];
    mailState.messages = [];
    renderMailUI();
    renderMessagesList();
    renderUI();
    showToast('ایمیل از لیست حذف شد.');
    if (mailState.activeMailboxId) {
      refreshInboxMessages();
    }
  }
});

const COPY_EMAIL_LABEL = () =>
  `${ic('copy')}<span>کپی ایمیل</span>`;

els.copyEmailBtn.addEventListener('click', async () => {
  const active = mailState.mailboxes.find((m) => m.id === mailState.activeMailboxId);
  if (!active) return;

  const ok = await copyText(active.address);
  if (ok) {
    els.copyEmailBtn.innerHTML = `${ic('check')}<span>کپی شد!</span>`;
    els.copyEmailBtn.classList.add('copied-flash');
    setTimeout(() => {
      els.copyEmailBtn.innerHTML = COPY_EMAIL_LABEL();
      els.copyEmailBtn.classList.remove('copied-flash');
    }, 1400);
    showToast('آدرس ایمیل کپی شد');
  } else {
    showToast('کپی خودکار ناموفق بود؛ آدرس را انتخاب و Ctrl+C بزنید.', true);
  }
});

els.fillEmailBtn.addEventListener('click', async () => {
  const active = mailState.mailboxes.find((m) => m.id === mailState.activeMailboxId);
  if (!active) return;
  await copyText(active.address);
  const res = await sendMsg({
    type: 'MAIL_FILL_IN_PAGE',
    tabId: state.tabId,
    value: active.address,
    fieldKind: 'email'
  });
  if (res.ok) {
    showToast('آدرس ایمیل در کادر سایت درج شد');
  } else {
    showToast(res.error || 'ایمیل کپی شد (دستی Paste کنید).', true);
  }
});

async function refreshInboxMessages(silent = false) {
  if (!mailState.activeMailboxId) return;
  if (!silent) {
    els.refreshInboxBtn.disabled = true;
    els.inboxPollStatus.textContent = 'در حال بررسی...';
  }

  const res = await sendMsg({
    type: 'MAIL_LIST_MESSAGES',
    mailboxId: mailState.activeMailboxId
  });

  els.refreshInboxBtn.disabled = false;
  els.inboxPollStatus.textContent = 'زنده';

  if (res.ok) {
    mailState.messages = res.messages || [];
    const unseenCount = mailState.messages.filter((m) => !m.seen).length;
    els.mailUnreadBadge.classList.toggle('hidden', unseenCount === 0);
    els.mailUnreadBadge.textContent = toFa(unseenCount);
    renderMessagesList();
  } else if (!silent) {
    showToast(res.error || 'خطا در دریافت پیام‌ها', true);
  }
}

els.refreshInboxBtn.addEventListener('click', () => refreshInboxMessages(false));

function renderMessagesList() {
  els.messagesList.innerHTML = '';
  const list = mailState.messages || [];
  els.emptyInboxState.classList.toggle('hidden', list.length > 0);

  list.forEach((m) => {
    const item = document.createElement('div');
    item.className = 'msg-item' + (!m.seen ? ' unseen' : '');

    const top = document.createElement('div');
    top.className = 'msg-top';

    const subj = document.createElement('div');
    subj.className = 'msg-subject';
    subj.textContent = m.subject;
    top.appendChild(subj);

    const from = document.createElement('div');
    from.className = 'msg-from';
    from.textContent = m.fromAddress || m.fromName;

    item.appendChild(top);
    item.appendChild(from);

    if (m.otpCode) {
      const otpBtn = document.createElement('button');
      otpBtn.className = 'msg-otp-btn';
      otpBtn.innerHTML = `${ic('key', 'ic ic-sm')}<span>کپی و درج کد تأیید: ${m.otpCode}</span>`;
      otpBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await copyAndFillOtp(m.otpCode);
      });
      item.appendChild(otpBtn);
    }

    item.addEventListener('click', () => openMessageModal(m.id));
    els.messagesList.appendChild(item);
  });
}

async function copyAndFillOtp(code) {
  const ok = await copyText(code);
  const res = await sendMsg({
    type: 'MAIL_FILL_IN_PAGE',
    tabId: state.tabId,
    value: code,
    fieldKind: 'otp'
  });
  if (res.ok) {
    showToast(`کد ${code} کپی و در سایت درج شد!`);
  } else if (ok) {
    showToast(`کد ${code} کپی شد! (Ctrl+V بزنید)`);
  } else {
    showToast('کپی ناموفق بود؛ کد را دستی وارد کنید.', true);
  }
}

function htmlToCleanText(htmlArr, fallbackText) {
  if (fallbackText && fallbackText.trim()) return fallbackText.trim();
  if (!Array.isArray(htmlArr) || !htmlArr.length) return '(پیام بدون متن)';
  try {
    const doc = new DOMParser().parseFromString(htmlArr.join('\n'), 'text/html');
    doc.querySelectorAll('script, style, noscript, iframe, object').forEach((el) => el.remove());
    return (doc.body?.innerText || doc.body?.textContent || '').trim() || '(پیام بدون متن)';
  } catch {
    return '(خطا در نمایش متن پیام)';
  }
}

async function openMessageModal(messageId) {
  const res = await sendMsg({
    type: 'MAIL_READ_MESSAGE',
    mailboxId: mailState.activeMailboxId,
    messageId
  });
  if (!res.ok) {
    showToast(res.error || 'خطا در باز کردن پیام', true);
    return;
  }

  const msg = res.message;
  mailState.readingMessageId = msg.id;
  els.mailModalSubject.textContent = msg.subject;
  els.mailModalFrom.textContent = `From: ${msg.fromName ? msg.fromName + ' <' + msg.fromAddress + '>' : msg.fromAddress}`;
  els.deleteMessageBtn.classList.toggle('hidden', res.canDelete === false);

  // OTP Banner
  if (msg.otpCode) {
    els.mailModalOtpBox.classList.remove('hidden');
    els.mailModalOtpCode.textContent = msg.otpCode;
    els.copyModalOtpBtn.onclick = () => copyAndFillOtp(msg.otpCode);
  } else {
    els.mailModalOtpBox.classList.add('hidden');
  }

  // Verification Links
  els.mailModalLinks.innerHTML = '';
  if (Array.isArray(msg.links) && msg.links.length > 0) {
    els.mailModalLinks.classList.remove('hidden');
    msg.links.slice(0, 3).forEach((url, idx) => {
      const btn = document.createElement('button');
      btn.className = 'verify-link-btn';
      btn.innerHTML =
        idx === 0
          ? `${ic('shield-check')}<span>باز کردن لینک تأیید در تب جدید</span>`
          : `${ic('link')}<span>باز کردن لینک ${toFa(idx + 1)} (تب جدید)</span>`;
      btn.title = url;
      btn.addEventListener('click', async () => {
        // همیشه تب جدید — باز کردن روی تب فعلی صفحه ثبت‌نام را نابود می‌کند
        // و می‌تواند توکن یک‌بارمصرف لینک تأیید را باطل کند.
        try {
          await chrome.tabs.create({ url, active: true });
        } catch {}
        window.close();
      });
      els.mailModalLinks.appendChild(btn);
    });
  } else {
    els.mailModalLinks.classList.add('hidden');
  }

  els.mailModalBody.textContent = htmlToCleanText(msg.html, msg.text);
  els.mailReadModal.classList.remove('hidden');

  // Refresh unseen status
  refreshInboxMessages(true);
}

els.closeMailModalBtn.addEventListener('click', () => {
  els.mailReadModal.classList.add('hidden');
});
els.closeMailModalBtn2.addEventListener('click', () => {
  els.mailReadModal.classList.add('hidden');
});
els.deleteMessageBtn.addEventListener('click', async () => {
  if (!mailState.readingMessageId) return;
  await sendMsg({
    type: 'MAIL_DELETE_MESSAGE',
    mailboxId: mailState.activeMailboxId,
    messageId: mailState.readingMessageId
  });
  els.mailReadModal.classList.add('hidden');
  showToast('پیام حذف شد.');
  refreshInboxMessages(true);
});

// ----------------------------------------------------------------------------
// Account Switcher Event Listeners
// ----------------------------------------------------------------------------

async function handleSwitchTo(accountId) {
  els.nextAccountBtn.disabled = true;
  els.prevAccountBtn.disabled = true;
  const res = await sendMsg({
    type: 'SWITCH_TO_ACCOUNT',
    tabId: state.tabId,
    accountId
  });
  if (res.ok) {
    showToast(`در حال ورود به «${res.accountName}»...`);
    await loadState();
  } else {
    showToast(res.error || 'خطا در جابه‌جایی اکانت', true);
    await loadState();
  }
}

els.nextAccountBtn.addEventListener('click', async () => {
  els.nextAccountBtn.disabled = true;
  const res = await sendMsg({
    type: 'SWITCH_CYCLE',
    tabId: state.tabId,
    direction: 1
  });
  if (res.ok) {
    showToast(`جابه‌جایی به «${res.accountName}» انجام شد`);
    await loadState();
  } else {
    showToast(res.error || 'خطا در جابه‌جایی', true);
    await loadState();
  }
});

els.prevAccountBtn.addEventListener('click', async () => {
  els.prevAccountBtn.disabled = true;
  const res = await sendMsg({
    type: 'SWITCH_CYCLE',
    tabId: state.tabId,
    direction: -1
  });
  if (res.ok) {
    showToast(`بازگشت به «${res.accountName}» انجام شد`);
    await loadState();
  } else {
    showToast(res.error || 'خطا در جابه‌جایی', true);
    await loadState();
  }
});

els.openBatchBtn.addEventListener('click', async () => {
  const countVal = els.batchCountSelect.value;
  els.openBatchBtn.disabled = true;
  const res = await sendMsg({
    type: 'OPEN_BATCH_ISOLATED_TABS',
    tabId: state.tabId,
    url: state.url,
    count: countVal
  });
  if (res.ok) {
    showToast(`در حال باز کردن همزمان ${toFa(res.openingCount)} تب مجزا...`);
    setTimeout(() => window.close(), 650);
  } else {
    els.openBatchBtn.disabled = false;
    showToast(res.error || 'خطا در باز کردن تب‌ها', true);
  }
});

async function saveCurrentAccount() {
  const name = els.accountNameInput.value.trim();
  const note = els.accountNoteInput.value.trim();
  const autoLinkActiveMail =
    Boolean(mailState.activeMailboxId) && els.chkLinkActiveMail.checked;

  els.saveCurrentBtn.disabled = true;

  const res = await sendMsg({
    type: 'SAVE_CURRENT_ACCOUNT',
    tabId: state.tabId,
    name,
    note,
    autoLinkActiveMail
  });

  els.saveCurrentBtn.disabled = false;
  if (res.ok) {
    els.accountNameInput.value = '';
    els.accountNoteInput.value = '';
    showToast(`«${res.account.name}» با موفقیت ذخیره شد`);
    await loadState();
  } else {
    showToast(res.error || 'خطا در ذخیره اکانت', true);
  }
}

els.saveCurrentBtn.addEventListener('click', saveCurrentAccount);
els.accountNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveCurrentAccount();
});
els.accountNoteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveCurrentAccount();
});

els.newSessionBtn.addEventListener('click', async () => {
  els.newSessionBtn.disabled = true;
  const res = await sendMsg({
    type: 'NEW_CLEAN_SESSION',
    tabId: state.tabId
  });
  els.newSessionBtn.disabled = false;

  if (res.ok) {
    showToast('نشست پاک شد! اکنون اکانت بعدی را لاگین و ذخیره کنید.');
    await loadState();
  } else {
    showToast(res.error || 'خطا در ایجاد نشست جدید', true);
  }
});

els.searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value || '';
  renderAccountsList();
});

els.toggleSettingsBtn.addEventListener('click', () => {
  els.settingsPanel.classList.toggle('hidden');
});
els.closeSettingsBtn.addEventListener('click', () => {
  els.settingsPanel.classList.add('hidden');
});

async function updateSetting(patch) {
  if (!state.siteKey) return;
  const res = await sendMsg({
    type: 'UPDATE_SETTINGS',
    siteKey: state.siteKey,
    patch
  });
  if (res.ok) {
    state.settings = res.settings;
    showToast('تنظیمات ذخیره شد.');
  }
}

els.chkFloatingWidget.addEventListener('change', (e) => {
  updateSetting({ floatingWidget: e.target.checked });
});
els.chkAutoSync.addEventListener('change', (e) => {
  updateSetting({ autoSync: e.target.checked });
});
els.chkIncludeStorage.addEventListener('change', (e) => {
  updateSetting({ includeStorage: e.target.checked });
});

function downloadJson(filename, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

els.exportSiteBtn.addEventListener('click', async () => {
  const res = await sendMsg({
    type: 'EXPORT_DATA',
    scope: 'site',
    siteKey: state.siteKey
  });
  if (res.ok) {
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadJson(`accounts-${state.siteKey || 'site'}-${dateStr}.json`, res.backup);
    showToast('فایل بکاپ دانلود شد.');
  }
});

els.exportAllBtn.addEventListener('click', async () => {
  const res = await sendMsg({
    type: 'EXPORT_DATA',
    scope: 'all'
  });
  if (res.ok) {
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadJson(`all-accounts-and-mails-${dateStr}.json`, res.backup);
    showToast('فایل بکاپ کامل دانلود شد.');
  }
});

els.importBtn.addEventListener('click', () => {
  els.importFileInput.value = '';
  els.importFileInput.click();
});

els.importFileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const res = await sendMsg({
      type: 'IMPORT_DATA',
      backup: parsed,
      mode: 'merge'
    });
    if (res.ok) {
      showToast('بکاپ اکانت‌ها و ایمیل‌ها با موفقیت بازیابی شد!');
      await loadState();
    } else {
      showToast(res.error || 'فایل نامعتبر است.', true);
    }
  } catch {
    showToast('خطا در خواندن فایل JSON.', true);
  }
});

function openEditModal(acc) {
  editingAccountId = acc.id;
  editingColor = acc.color || COLORS[0];
  editingLabels = Array.isArray(acc.labels) ? [...acc.labels] : [];
  editingPinned = Boolean(acc.pinned);
  els.editNameInput.value = acc.name;
  els.editNoteInput.value = acc.note || '';
  els.editCustomLabelInput.value = '';
  renderColorSwatches();
  renderEditLabelPicker();
  els.editModal.classList.remove('hidden');
  els.editNameInput.focus();
}

function renderEditLabelPicker() {
  els.editLabelPicker.innerHTML = '';

  const mkChip = (label, selected, color) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'edit-chip' + (selected ? ' selected' : '');
    chip.innerHTML = `${ic('tag', 'ic ic-xs')}<span></span>`;
    chip.querySelector('span').textContent = label;
    if (selected && color) {
      chip.style.borderColor = color;
      chip.style.color = color;
      chip.style.background = color + '22';
    }
    chip.addEventListener('click', () => {
      if (editingLabels.includes(label)) {
        editingLabels = editingLabels.filter((l) => l !== label);
      } else if (editingLabels.length < 5) {
        editingLabels.push(label);
      } else {
        showToast('حداکثر ۵ برچسب قابل انتخاب است.', true);
        return;
      }
      renderEditLabelPicker();
    });
    return chip;
  };

  [...LABEL_PRESETS, ...editingLabels.filter((l) => !LABEL_PRESETS.includes(l))].forEach((l) => {
    els.editLabelPicker.appendChild(mkChip(l, editingLabels.includes(l), labelColor(l)));
  });

  const pinChip = document.createElement('button');
  pinChip.type = 'button';
  pinChip.className = 'edit-chip edit-chip-pin' + (editingPinned ? ' selected' : '');
  pinChip.innerHTML = `${ic('pin', 'ic ic-xs')}<span></span>`;
  pinChip.querySelector('span').textContent = 'پین‌شده';
  if (editingPinned) {
    pinChip.style.borderColor = '#fbbf24';
    pinChip.style.color = '#fbbf24';
    pinChip.style.background = 'rgba(251, 191, 36, 0.13)';
  }
  pinChip.addEventListener('click', () => {
    editingPinned = !editingPinned;
    renderEditLabelPicker();
  });
  els.editLabelPicker.appendChild(pinChip);
}

function addCustomLabel() {
  const val = els.editCustomLabelInput.value.trim().slice(0, 18);
  if (!val) return;
  if (editingLabels.includes(val)) {
    showToast('این برچسب قبلاً اضافه شده است.', true);
    return;
  }
  if (editingLabels.length >= 5) {
    showToast('حداکثر ۵ برچسب قابل انتخاب است.', true);
    return;
  }
  editingLabels.push(val);
  els.editCustomLabelInput.value = '';
  renderEditLabelPicker();
}

function renderColorSwatches() {
  els.editColorPicker.innerHTML = '';
  COLORS.forEach((c) => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (c === editingColor ? ' selected' : '');
    sw.style.background = c;
    sw.addEventListener('click', () => {
      editingColor = c;
      renderColorSwatches();
    });
    els.editColorPicker.appendChild(sw);
  });
}

els.cancelEditBtn.addEventListener('click', () => {
  editingAccountId = null;
  els.editModal.classList.add('hidden');
});

els.saveEditBtn.addEventListener('click', async () => {
  if (!editingAccountId) return;
  const name = els.editNameInput.value.trim();
  const note = els.editNoteInput.value.trim();
  if (!name) {
    showToast('نام اکانت نمی‌تواند خالی باشد.', true);
    return;
  }

  await sendMsg({
    type: 'EDIT_ACCOUNT_META',
    siteKey: state.siteKey,
    accountId: editingAccountId,
    patch: { name, note, color: editingColor, labels: [...editingLabels], pinned: editingPinned }
  });

  editingAccountId = null;
  els.editModal.classList.add('hidden');
  showToast('مشخصات اکانت ویرایش شد.');
  await loadState();
});

els.addCustomLabelBtn.addEventListener('click', addCustomLabel);
els.editCustomLabelInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addCustomLabel();
  }
});

// مرتب‌سازی لیست اکانت‌ها
els.sortSelect.addEventListener('change', (e) => {
  listPref.sort = e.target.value || 'recent';
  saveListPref();
  renderAccountsList();
});

// جست‌وجوی سریع (پالت درون‌صفحه‌ای در تب فعلی)
els.quickSearchBtn.addEventListener('click', async () => {
  if (!state.tabId) {
    showToast('ابتدا یک صفحه وب باز کنید.', true);
    return;
  }
  try {
    await chrome.tabs.sendMessage(state.tabId, { type: 'OPEN_QUICK_SWITCHER' });
    window.close();
  } catch {
    showToast('پالت جست‌وجو در این صفحه فعال نیست (صفحه داخلی مرورگر).', true);
  }
});

// اعلان دسکتاپ
async function loadNotifPref() {
  try {
    const res = await sendMsg({ type: 'GET_NOTIF_PREFS' });
    if (res?.ok) {
      els.chkDesktopNotif.checked = res.notifPrefs?.enabled !== false;
    }
  } catch {}
}

els.chkDesktopNotif.addEventListener('change', async (e) => {
  const res = await sendMsg({ type: 'SET_NOTIF_ENABLED', enabled: e.target.checked });
  if (res?.ok) {
    showToast(
      e.target.checked
        ? 'اعلان دسکتاپ پیام و کد تأیید فعال شد.'
        : 'اعلان دسکتاپ غیرفعال شد.'
    );
  }
});

loadState();
