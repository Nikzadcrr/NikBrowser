// ============================================================================
// AI Account Switcher - Per-Tab Synchronous Storage & Channel Isolator (MAIN)
// Runs at document_start BEFORE any website script executes
// ============================================================================

(() => {
  if (window.top !== window.self) return;

  const ISO_KEY = '__AI_SWITCHER_ISO__';
  let realSessionStorage;
  let rawBoot;

  try {
    realSessionStorage = window.sessionStorage;
    rawBoot = realSessionStorage.getItem(ISO_KEY);
  } catch {
    return;
  }

  // Normal tab (not opened in Simultaneous Isolated Mode) -> zero overhead, exit immediately
  if (!rawBoot) return;

  let boot;
  try {
    boot = JSON.parse(rawBoot);
  } catch {
    return;
  }
  if (!boot || !boot.accountId) return;

  const lsMap = new Map(Object.entries(boot.localStorage || {}));
  const ssMap = new Map(Object.entries(boot.sessionStorage || {}));
  const jsCookieMap = new Map(Object.entries(boot.jsCookies || {}));

  let syncTimer = null;
  function persistState() {
    try {
      boot.localStorage = Object.fromEntries(lsMap);
      boot.sessionStorage = Object.fromEntries(ssMap);
      boot.jsCookies = Object.fromEntries(jsCookieMap);
      realSessionStorage.setItem(ISO_KEY, JSON.stringify(boot));
    } catch {}

    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      try {
        window.dispatchEvent(
          new CustomEvent('__ai_switcher_iso_sync__', {
            detail: {
              siteKey: boot.siteKey,
              accountId: boot.accountId,
              localStorage: boot.localStorage,
              sessionStorage: boot.sessionStorage
            }
          })
        );
      } catch {}
    }, 700);
  }

  function createStorageProxy(map) {
    const api = {
      getItem(key) {
        const k = String(key);
        return map.has(k) ? map.get(k) : null;
      },
      setItem(key, val) {
        map.set(String(key), String(val));
        persistState();
      },
      removeItem(key) {
        map.delete(String(key));
        persistState();
      },
      clear() {
        map.clear();
        persistState();
      },
      key(index) {
        const keys = Array.from(map.keys());
        return keys[Number(index)] ?? null;
      },
      get length() {
        return map.size;
      }
    };

    return new Proxy(api, {
      get(target, prop) {
        if (prop === Symbol.toStringTag) return 'Storage';
        if (prop in target) {
          const val = target[prop];
          return typeof val === 'function' ? val.bind(target) : val;
        }
        if (typeof prop === 'string' && map.has(prop)) {
          return map.get(prop);
        }
        return undefined;
      },
      set(target, prop, value) {
        if (typeof prop === 'string' && !(prop in target)) {
          map.set(prop, String(value));
          persistState();
        }
        return true;
      },
      deleteProperty(target, prop) {
        if (typeof prop === 'string') {
          map.delete(prop);
          persistState();
        }
        return true;
      },
      has(target, prop) {
        return prop in target || (typeof prop === 'string' && map.has(prop));
      },
      ownKeys() {
        return Array.from(map.keys());
      },
      getOwnPropertyDescriptor(target, prop) {
        if (typeof prop === 'string' && map.has(prop)) {
          return {
            value: map.get(prop),
            writable: true,
            enumerable: true,
            configurable: true
          };
        }
        return undefined;
      }
    });
  }

  // 1. Virtualize window.localStorage & window.sessionStorage per tab
  try {
    const virtualLS = createStorageProxy(lsMap);
    const virtualSS = createStorageProxy(ssMap);

    Object.defineProperty(window, 'localStorage', {
      get: () => virtualLS,
      configurable: false
    });
    Object.defineProperty(window, 'sessionStorage', {
      get: () => virtualSS,
      configurable: false
    });
  } catch {}

  // 2. Virtualize document.cookie (non-HttpOnly JS-visible cookies) per tab
  try {
    Object.defineProperty(document, 'cookie', {
      configurable: false,
      get() {
        const pairs = [];
        for (const [k, v] of jsCookieMap.entries()) {
          pairs.push(`${k}=${v}`);
        }
        return pairs.join('; ');
      },
      set(cookieStr) {
        if (typeof cookieStr !== 'string') return;
        const segments = cookieStr.split(';').map((s) => s.trim());
        const first = segments[0] || '';
        const eqIdx = first.indexOf('=');
        if (eqIdx <= 0) return;
        const name = first.slice(0, eqIdx).trim();
        const val = first.slice(eqIdx + 1);

        let expired = false;
        for (let i = 1; i < segments.length; i++) {
          const low = segments[i].toLowerCase();
          if (low.startsWith('max-age=')) {
            const sec = Number(low.slice(8));
            if (!Number.isNaN(sec) && sec <= 0) expired = true;
          } else if (low.startsWith('expires=')) {
            const expTime = Date.parse(segments[i].slice(8));
            if (!Number.isNaN(expTime) && expTime <= Date.now()) expired = true;
          }
        }

        if (expired) {
          jsCookieMap.delete(name);
        } else {
          jsCookieMap.set(name, val);
        }
        persistState();

        // Notify content script to sync JS-set cookie into DNR network rule too
        try {
          window.dispatchEvent(
            new CustomEvent('__ai_switcher_js_cookie__', {
              detail: {
                siteKey: boot.siteKey,
                accountId: boot.accountId,
                name,
                value: val,
                expired
              }
            })
          );
        } catch {}
      }
    });
  } catch {}

  // 3. Isolate BroadcastChannel per account so tabs don't log each other out
  try {
    const NativeBC = window.BroadcastChannel;
    if (typeof NativeBC === 'function') {
      const ScopedBC = function (channelName) {
        return new NativeBC(`${channelName}__ai_iso_${boot.accountId}`);
      };
      ScopedBC.prototype = NativeBC.prototype;
      window.BroadcastChannel = ScopedBC;
    }
  } catch {}

  // 4. Block cross-tab 'storage' events from leaking across different accounts
  try {
    window.addEventListener(
      'storage',
      (e) => {
        e.stopImmediatePropagation();
      },
      true
    );
  } catch {}

  // 5. Keep tab title prefixed with account badge (e.g. "[۱] ChatGPT" or "[اکانت ۱]")
  const badgePrefix = `[${boot.shortBadge || boot.accountName}] `;
  function enforceTitlePrefix() {
    try {
      if (document.title && !document.title.startsWith('[')) {
        document.title = badgePrefix + document.title;
      } else if (!document.title) {
        document.title = badgePrefix.trim();
      }
    } catch {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    enforceTitlePrefix();
    const head = document.querySelector('head');
    if (head) {
      const obs = new MutationObserver(enforceTitlePrefix);
      obs.observe(head, { childList: true, subtree: true, characterData: true });
    }
  });
})();
