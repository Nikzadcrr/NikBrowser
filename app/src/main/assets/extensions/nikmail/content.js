// ============================================================================
// AI Multi-Account Switcher - Isolated On-Page Floating Quick Switcher
// ============================================================================

(() => {
  if (window.top !== window.self) return;

  let hostEl = null;
  let shadow = null;
  let currentState = null;
  let dropdownOpen = false;
  let isBusy = false;

  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  function toFa(n) {
    return String(n).replace(/\d/g, (d) => persianDigits[Number(d)]);
  }

  // SVG icon system for the floating widget (no raw emojis)
  const WIDGET_ICONS = {
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
    'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'
  };
  function wIc(name, cls = 'ic') {
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${WIDGET_ICONS[name] || ''}</svg>`;
  }

  function sendMsg(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false });
            return;
          }
          resolve(res || { ok: false });
        });
      } catch {
        resolve({ ok: false });
      }
    });
  }

  // Forward storage & JS-cookie sync events from MAIN-world isolated-preload.js
  window.addEventListener('__ai_switcher_iso_sync__', (e) => {
    const detail = e?.detail;
    if (detail?.siteKey && detail?.accountId) {
      sendMsg({
        type: 'SYNC_ISOLATED_STORAGE',
        siteKey: detail.siteKey,
        accountId: detail.accountId,
        localStorage: detail.localStorage,
        sessionStorage: detail.sessionStorage
      });
    }
  });

  window.addEventListener('__ai_switcher_js_cookie__', (e) => {
    const detail = e?.detail;
    if (detail?.siteKey && detail?.accountId && detail?.name) {
      sendMsg({
        type: 'SYNC_ISOLATED_JS_COOKIE',
        siteKey: detail.siteKey,
        accountId: detail.accountId,
        name: detail.name,
        value: detail.value,
        expired: Boolean(detail.expired)
      });
    }
  });

  function unmountWidget() {
    if (hostEl && hostEl.parentNode) {
      hostEl.parentNode.removeChild(hostEl);
    }
    hostEl = null;
    shadow = null;
    dropdownOpen = false;
  }

  function ensureMounted() {
    if (hostEl && shadow) return;

    hostEl = document.createElement('div');
    hostEl.setAttribute('data-ai-switcher-host', '1');
    hostEl.style.all = 'initial';
    hostEl.style.position = 'fixed';
    hostEl.style.zIndex = '2147483646';
    hostEl.style.bottom = '20px';
    hostEl.style.left = '20px';
    hostEl.style.direction = 'rtl';

    shadow = hostEl.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      * {
        box-sizing: border-box;
        font-family: Tahoma, "Vazirmatn", "Segoe UI", system-ui, -apple-system, sans-serif;
      }
      .wrap {
        position: relative;
        user-select: none;
        direction: rtl;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(15, 23, 42, 0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: #f8fafc;
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 999px;
        padding: 5px 8px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(99, 102, 241, 0.2);
        font-size: 12px;
        line-height: 1;
        transition: opacity 0.2s ease;
      }
      .pill.isolated {
        border-color: rgba(6, 182, 212, 0.65);
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 12px rgba(6, 182, 212, 0.28);
      }
      .pill.busy {
        opacity: 0.65;
        pointer-events: none;
      }
      .drag-handle {
        cursor: grab;
        color: #64748b;
        padding: 2px 3px;
        font-size: 13px;
        letter-spacing: -2px;
      }
      .drag-handle:active {
        cursor: grabbing;
      }
      .acc-selector {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(30, 41, 59, 0.85);
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 999px;
        padding: 5px 10px;
        cursor: pointer;
        color: #e2e8f0;
        font-size: 12px;
        max-width: 175px;
        transition: background 0.15s;
      }
      .acc-selector:hover {
        background: rgba(51, 65, 85, 0.95);
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .acc-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
      }
      .acc-count {
        color: #94a3b8;
        font-size: 11px;
        flex-shrink: 0;
      }
      .btn {
        border: none;
        outline: none;
        cursor: pointer;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 11.5px;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: transform 0.1s, filter 0.15s, background 0.15s;
        color: #fff;
      }
      svg.ic {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        display: block;
      }
      .mini-btn svg.ic {
        width: 18px;
        height: 18px;
      }
      .drag-handle svg.ic {
        width: 13px;
        height: 13px;
      }
      .btn:active {
        transform: scale(0.95);
      }
      .btn-next {
        background: linear-gradient(135deg, #6366f1, #06b6d4);
        box-shadow: 0 2px 10px rgba(99, 102, 241, 0.4);
      }
      .btn-next:hover {
        filter: brightness(1.1);
      }
      .btn-iso {
        background: rgba(6, 182, 212, 0.2);
        border: 1px solid rgba(6, 182, 212, 0.5);
        color: #67e8f9;
      }
      .btn-iso:hover {
        background: rgba(6, 182, 212, 0.35);
        color: #fff;
      }
      .btn-search {
        padding: 6px;
      }
      .btn-save {
        background: linear-gradient(135deg, #10b981, #059669);
        box-shadow: 0 2px 10px rgba(16, 185, 129, 0.35);
      }
      .btn-icon {
        background: rgba(51, 65, 85, 0.7);
        color: #cbd5e1;
        padding: 5px 8px;
        font-weight: 600;
      }
      .btn-icon:hover {
        background: rgba(71, 85, 105, 0.95);
        color: #fff;
      }
      .mini-btn {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4f46e5, #06b6d4);
        color: #fff;
        border: 2px solid rgba(255,255,255,0.25);
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-weight: 700;
        font-size: 12px;
        position: relative;
      }
      .mini-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        background: #0f172a;
        color: #38bdf8;
        border: 1px solid rgba(56, 189, 248, 0.5);
        border-radius: 999px;
        padding: 1px 5px;
        font-size: 10px;
      }
      .dropdown {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 0;
        width: 265px;
        max-height: 280px;
        overflow-y: auto;
        background: rgba(15, 23, 42, 0.97);
        backdrop-filter: blur(14px);
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 14px;
        padding: 6px;
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.55);
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .dd-row {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .dd-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 7px 9px;
        border-radius: 9px;
        cursor: pointer;
        color: #cbd5e1;
        font-size: 12px;
        border: none;
        background: transparent;
        text-align: right;
        flex: 1;
        min-width: 0;
      }
      .dd-item:hover {
        background: rgba(51, 65, 85, 0.75);
        color: #fff;
      }
      .dd-item.active {
        background: rgba(99, 102, 241, 0.22);
        color: #fff;
        border: 1px solid rgba(99, 102, 241, 0.45);
      }
      .dd-open-tab {
        border: 1px solid rgba(6, 182, 212, 0.35);
        background: rgba(6, 182, 212, 0.12);
        color: #67e8f9;
        border-radius: 8px;
        padding: 5px 7px;
        cursor: pointer;
        font-size: 11px;
        flex-shrink: 0;
      }
      .dd-open-tab:hover {
        background: rgba(6, 182, 212, 0.3);
        color: #fff;
      }
      .dd-left {
        display: flex;
        align-items: center;
        gap: 7px;
        overflow: hidden;
      }
      .dd-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dd-new {
        margin-top: 4px;
        border-top: 1px solid rgba(148, 163, 184, 0.15);
        padding-top: 6px;
        color: #38bdf8;
        font-weight: 600;
        justify-content: center;
      }
    `;
    shadow.appendChild(style);

    const container = document.createElement('div');
    container.className = 'wrap';
    container.id = 'root';
    shadow.appendChild(container);

    (document.body || document.documentElement).appendChild(hostEl);
    setupDrag();
  }

  function applyPosition(widgetPos) {
    if (!hostEl || !widgetPos) return;
    const maxLeft = Math.max(10, window.innerWidth - 80);
    const maxBottom = Math.max(10, window.innerHeight - 60);
    const left = Math.min(Math.max(10, Number(widgetPos.left ?? 20)), maxLeft);
    const bottom = Math.min(Math.max(10, Number(widgetPos.bottom ?? 20)), maxBottom);
    hostEl.style.left = `${left}px`;
    hostEl.style.bottom = `${bottom}px`;
  }

  function setupDrag() {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 20;
    let origBottom = 20;

    shadow.addEventListener('mousedown', (e) => {
      const handle = e.target.closest?.('[data-drag="1"]');
      if (!handle) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origLeft = parseInt(hostEl.style.left || '20', 10);
      origBottom = parseInt(hostEl.style.bottom || '20', 10);
      e.preventDefault();
    });

    window.addEventListener(
      'mousemove',
      (e) => {
        if (!dragging || !hostEl) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newLeft = Math.min(Math.max(8, origLeft + dx), window.innerWidth - 70);
        const newBottom = Math.min(Math.max(8, origBottom - dy), window.innerHeight - 50);
        hostEl.style.left = `${newLeft}px`;
        hostEl.style.bottom = `${newBottom}px`;
      },
      { passive: true }
    );

    window.addEventListener('mouseup', () => {
      if (!dragging || !hostEl) return;
      dragging = false;
      const left = parseInt(hostEl.style.left || '20', 10);
      const bottom = parseInt(hostEl.style.bottom || '20', 10);
      sendMsg({
        type: 'SAVE_WIDGET_STATE',
        widgetPos: { left, bottom }
      });
    });
  }

  function render() {
    if (
      !currentState ||
      !currentState.supported ||
      !Array.isArray(currentState.accounts) ||
      currentState.accounts.length === 0 ||
      currentState.settings?.floatingWidget === false
    ) {
      unmountWidget();
      return;
    }

    ensureMounted();
    applyPosition(currentState.widgetPos);

    const root = shadow.getElementById('root');
    if (!root) return;
    root.innerHTML = '';

    const accounts = currentState.accounts;
    const isIso = Boolean(currentState.isIsolatedTab);
    const effectiveId = isIso ? currentState.isolatedAccountId : currentState.activeAccountId;
    const activeIdx = accounts.findIndex((a) => a.id === effectiveId);
    const activeAcc = activeIdx >= 0 ? accounts[activeIdx] : null;
    const minimized = Boolean(currentState.widgetPos?.minimized);

    if (minimized) {
      const mini = document.createElement('button');
      mini.className = 'mini-btn';
      mini.title = 'کلیک برای باز شدن نوار اکانت‌ها';
      mini.innerHTML = isIso ? wIc('lock') : wIc('zap');

      const badge = document.createElement('span');
      badge.className = 'mini-badge';
      badge.textContent = activeIdx >= 0 ? toFa(activeIdx + 1) : '+';
      mini.appendChild(badge);

      mini.addEventListener('click', async () => {
        currentState.widgetPos = { ...(currentState.widgetPos || {}), minimized: false };
        await sendMsg({ type: 'SAVE_WIDGET_STATE', widgetPos: { minimized: false } });
        render();
      });

      root.appendChild(mini);
      return;
    }

    if (dropdownOpen) {
      const dd = document.createElement('div');
      dd.className = 'dropdown';

      accounts.forEach((acc, i) => {
        const row = document.createElement('div');
        row.className = 'dd-row';

        const item = document.createElement('button');
        item.className = 'dd-item' + (acc.id === effectiveId ? ' active' : '');

        const leftBox = document.createElement('div');
        leftBox.className = 'dd-left';

        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = acc.color || '#6366f1';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'dd-name';
        nameSpan.textContent = `${toFa(i + 1)}. ${acc.name}`;

        leftBox.appendChild(dot);
        leftBox.appendChild(nameSpan);
        item.appendChild(leftBox);

        item.addEventListener('click', async () => {
          if (acc.id === effectiveId) {
            dropdownOpen = false;
            render();
            return;
          }
          isBusy = true;
          dropdownOpen = false;
          render();
          await sendMsg({ type: 'SWITCH_TO_ACCOUNT', accountId: acc.id });
        });

        const isoBtn = document.createElement('button');
        isoBtn.className = 'dd-open-tab';
        isoBtn.title = `باز کردن «${acc.name}» در تب مجزای همزمان`;
        isoBtn.innerHTML = `${wIc('external-link')}<span>تب</span>`;
        isoBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          dropdownOpen = false;
          render();
          await sendMsg({
            type: 'OPEN_ISOLATED_TAB',
            url: window.location.href,
            accountId: acc.id,
            focusIfOpen: true
          });
        });

        row.appendChild(item);
        row.appendChild(isoBtn);
        dd.appendChild(row);
      });

      const newBtn = document.createElement('button');
      newBtn.className = 'dd-item dd-new';
      newBtn.innerHTML = `${wIc('plus')}<span>نشست جدید (افزودن اکانت)</span>`;
      newBtn.addEventListener('click', async () => {
        isBusy = true;
        dropdownOpen = false;
        render();
        await sendMsg({ type: 'NEW_CLEAN_SESSION' });
      });
      dd.appendChild(newBtn);

      root.appendChild(dd);
    }

    const pill = document.createElement('div');
    pill.className = 'pill' + (isIso ? ' isolated' : '') + (isBusy ? ' busy' : '');

    const drag = document.createElement('span');
    drag.className = 'drag-handle';
    drag.setAttribute('data-drag', '1');
    drag.title = 'جابه‌جایی دکمه شناور';
    drag.innerHTML = wIc('grip');
    pill.appendChild(drag);

    const selector = document.createElement('button');
    selector.className = 'acc-selector';
    selector.title = isIso
      ? 'این تب به‌صورت ایزوله و همزمان باز شده است'
      : 'مشاهده لیست اکانت‌ها';

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = activeAcc ? activeAcc.color || '#10b981' : '#94a3b8';

    const label = document.createElement('span');
    label.className = 'acc-label';
    label.textContent = activeAcc ? activeAcc.name : 'نشست جدید';

    const count = document.createElement('span');
    count.className = 'acc-count';
    count.textContent =
      activeIdx >= 0
        ? `(${toFa(activeIdx + 1)}/${toFa(accounts.length)})`
        : `(${toFa(accounts.length)})`;

    if (isIso) {
      const lockIc = document.createElement('span');
      lockIc.style.display = 'inline-flex';
      lockIc.style.flexShrink = '0';
      lockIc.innerHTML = wIc('lock');
      selector.appendChild(lockIc);
    }
    selector.appendChild(dot);
    selector.appendChild(label);
    selector.appendChild(count);
    selector.addEventListener('click', () => {
      dropdownOpen = !dropdownOpen;
      render();
    });
    pill.appendChild(selector);

    if (!activeAcc && !isIso) {
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn btn-save';
      saveBtn.innerHTML = `${wIc('save')}<span>ذخیره اکانت ${toFa(accounts.length + 1)}</span>`;
      saveBtn.addEventListener('click', async () => {
        isBusy = true;
        render();
        await sendMsg({ type: 'SAVE_CURRENT_ACCOUNT' });
        isBusy = false;
        await refreshState();
      });
      pill.appendChild(saveBtn);
    }

    if (!isIso) {
      const nextBtn = document.createElement('button');
      nextBtn.className = 'btn btn-next';
      nextBtn.title = 'سوییچ در همین تب به اکانت بعدی (Alt+Shift+S)';
      nextBtn.innerHTML = `${wIc('zap')}<span>بعدی</span>`;
      nextBtn.addEventListener('click', async () => {
        isBusy = true;
        dropdownOpen = false;
        render();
        const res = await sendMsg({ type: 'SWITCH_CYCLE', direction: 1 });
        if (!res?.ok) {
          isBusy = false;
          render();
        }
      });
      pill.appendChild(nextBtn);
    }

    // Open Next Account in Simultaneous Isolated Tab!
    const openIsoBtn = document.createElement('button');
    openIsoBtn.className = 'btn btn-iso';
    openIsoBtn.title = 'باز کردن اکانت بعدی در تب جدید به‌صورت همزمان و ایزوله';
    openIsoBtn.innerHTML = `${wIc('external-link')}<span>+تب همزمان</span>`;
    openIsoBtn.addEventListener('click', async () => {
      dropdownOpen = false;
      await sendMsg({
        type: 'OPEN_NEXT_ISOLATED_TAB',
        url: window.location.href
      });
      await refreshState();
    });
    pill.appendChild(openIsoBtn);

    // Quick search palette button
    const searchBtn = document.createElement('button');
    searchBtn.className = 'btn btn-iso btn-search';
    searchBtn.title = 'جست‌وجوی سریع اکانت‌ها (Alt+Shift+F)';
    searchBtn.innerHTML = wIc('search');
    searchBtn.addEventListener('click', () => {
      dropdownOpen = false;
      render();
      openQuickSwitcher();
    });
    pill.appendChild(searchBtn);

    const minBtn = document.createElement('button');
    minBtn.className = 'btn btn-icon';
    minBtn.title = 'کوچک کردن';
    minBtn.innerHTML = wIc('minus');
    minBtn.addEventListener('click', async () => {
      dropdownOpen = false;
      currentState.widgetPos = { ...(currentState.widgetPos || {}), minimized: true };
      await sendMsg({ type: 'SAVE_WIDGET_STATE', widgetPos: { minimized: true } });
      render();
    });
    pill.appendChild(minBtn);

    root.appendChild(pill);
  }

  async function refreshState() {
    const res = await sendMsg({
      type: 'GET_SITE_STATE',
      url: window.location.href
    });
    if (res && res.ok) {
      currentState = res;
      render();
    }
  }

  // ------------------------------------------------------------------
  // Quick Switcher Palette — جست‌وجوی سریع اکانت‌ها (Alt+Shift+F)
  // ------------------------------------------------------------------

  let qsHost = null;
  let qsShadow = null;
  let qsOpen = false;
  let qsQuery = '';
  let qsDebounce = null;
  let qsRows = []; // { accountId, siteKey, siteUrl, isSameSite, name, ... }
  let qsSelected = 0;
  let qsSearching = false;

  function currentSiteKeyLocal() {
    try {
      if (currentState?.siteKey) return currentState.siteKey;
      const host = window.location.hostname.toLowerCase().replace(/\.$/, '');
      const parts = host.split('.');
      if (parts.length <= 2) return host;
      return parts.slice(-2).join('.');
    } catch {
      return '';
    }
  }

  function ensureQuickSwitcherMounted() {
    if (qsHost && qsShadow) return;

    qsHost = document.createElement('div');
    qsHost.setAttribute('data-ai-switcher-palette', '1');
    qsHost.style.all = 'initial';
    qsHost.style.position = 'fixed';
    qsHost.style.inset = '0';
    qsHost.style.zIndex = '2147483647';
    qsHost.style.display = 'none';
    qsHost.style.direction = 'rtl';

    qsShadow = qsHost.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: Tahoma, "Vazirmatn", "Segoe UI", system-ui, -apple-system, sans-serif;
      }
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(2, 6, 23, 0.6);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 12vh 16px 24px;
      }
      .palette {
        width: min(560px, 96vw);
        max-height: 72vh;
        display: flex;
        flex-direction: column;
        background: rgba(13, 20, 38, 0.94);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 18px;
        box-shadow: 0 30px 70px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(99, 102, 241, 0.14), 0 0 42px rgba(99, 102, 241, 0.16);
        overflow: hidden;
        animation: palette-in 0.16s ease-out;
      }
      @keyframes palette-in {
        from { opacity: 0; transform: translateY(-10px) scale(0.98); }
        to { opacity: 1; transform: none; }
      }
      .search-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        background: rgba(148, 163, 184, 0.06);
      }
      .search-row svg {
        width: 19px;
        height: 19px;
        color: #818cf8;
        flex-shrink: 0;
      }
      .search-row input {
        flex: 1;
        min-width: 0;
        background: transparent;
        border: none;
        outline: none;
        color: #f1f5f9;
        font-size: 15.5px;
        font-weight: 600;
      }
      .search-row input::placeholder {
        color: #64748b;
        font-weight: 400;
      }
      .kbd {
        color: #94a3b8;
        background: rgba(148, 163, 184, 0.12);
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 7px;
        padding: 2px 8px;
        font-size: 11.5px;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .results {
        overflow-y: auto;
        padding: 8px;
        flex: 1;
      }
      .results::-webkit-scrollbar { width: 7px; }
      .results::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.3); border-radius: 99px; }
      .section-title {
        color: #64748b;
        font-size: 11.5px;
        font-weight: 700;
        padding: 8px 10px 4px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .section-title svg { width: 12px; height: 12px; }
      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 10px;
        border-radius: 12px;
        cursor: pointer;
        border: 1px solid transparent;
        color: #cbd5e1;
      }
      .row.sel {
        background: rgba(99, 102, 241, 0.2);
        border-color: rgba(99, 102, 241, 0.5);
        color: #fff;
      }
      .row .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
        box-shadow: 0 0 8px currentColor;
      }
      .row-main {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .row-name {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        font-weight: 700;
        overflow: hidden;
      }
      .row-name svg.pin-ic {
        width: 12px;
        height: 12px;
        color: #fbbf24;
        flex-shrink: 0;
      }
      .row-name .nm {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .row-sub {
        font-size: 12px;
        color: #94a3b8;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .lbl {
        display: inline-flex;
        align-items: center;
        font-size: 10.5px;
        font-weight: 700;
        padding: 1px 7px;
        border-radius: 99px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        color: #cbd5e1;
        background: rgba(148, 163, 184, 0.1);
        flex-shrink: 0;
      }
      .lbl-کاری, .lbl-work { border-color: rgba(99, 102, 241, 0.6); color: #a5b4fc; background: rgba(99, 102, 241, 0.14); }
      .lbl-شخصی, .lbl-personal { border-color: rgba(16, 185, 129, 0.6); color: #6ee7b7; background: rgba(16, 185, 129, 0.14); }
      .lbl-آزمایشی, .lbl-test { border-color: rgba(245, 158, 11, 0.6); color: #fcd34d; background: rgba(245, 158, 11, 0.14); }
      .site-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: #67e8f9;
        direction: ltr;
        flex-shrink: 0;
      }
      .site-chip svg { width: 11px; height: 11px; }
      .row-actions { display: flex; gap: 6px; flex-shrink: 0; }
      .act {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border-radius: 10px;
        border: none;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        padding: 7px 11px;
        color: #fff;
        transition: filter 0.15s, transform 0.1s;
      }
      .act svg { width: 13px; height: 13px; }
      .act:active { transform: scale(0.95); }
      .act-switch {
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.85), rgba(6, 182, 212, 0.85));
        box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35);
      }
      .act-tab {
        background: rgba(6, 182, 212, 0.16);
        border: 1px solid rgba(6, 182, 212, 0.5);
        color: #67e8f9;
      }
      .act:hover { filter: brightness(1.15); }
      .empty {
        padding: 26px 16px;
        text-align: center;
        color: #64748b;
        font-size: 13.5px;
      }
      .footer {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 10px 16px;
        border-top: 1px solid rgba(148, 163, 184, 0.18);
        background: rgba(148, 163, 184, 0.05);
        color: #94a3b8;
        font-size: 12px;
        flex-wrap: wrap;
      }
      .footer b { color: #cbd5e1; font-weight: 700; }
    `;
    qsShadow.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) closeQuickSwitcher();
    });
    qsShadow.appendChild(backdrop);

    (document.body || document.documentElement).appendChild(qsHost);
  }

  function closeQuickSwitcher() {
    qsOpen = false;
    if (qsHost) qsHost.style.display = 'none';
    clearTimeout(qsDebounce);
  }

  function buildRow(item, idx) {
    const row = document.createElement('div');
    row.className = 'row' + (idx === qsSelected ? ' sel' : '');
    row.dataset.idx = String(idx);

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = item.color || '#6366f1';
    dot.style.color = item.color || '#6366f1';
    row.appendChild(dot);

    const main = document.createElement('div');
    main.className = 'row-main';

    const nameRow = document.createElement('div');
    nameRow.className = 'row-name';
    if (item.pinned) {
      const pin = document.createElement('span');
      pin.innerHTML = wIc('pin', 'pin-ic');
      nameRow.appendChild(pin);
    }
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = item.name;
    nameRow.appendChild(nm);
    (item.labels || []).slice(0, 3).forEach((l) => {
      const chip = document.createElement('span');
      chip.className = 'lbl';
      chip.textContent = l;
      nameRow.appendChild(chip);
    });

    const sub = document.createElement('div');
    sub.className = 'row-sub';
    sub.textContent = item.note || item.email || item.siteKey || '';

    main.appendChild(nameRow);
    main.appendChild(sub);
    row.appendChild(main);

    if (!item.isSameSite) {
      const siteChip = document.createElement('span');
      siteChip.className = 'site-chip';
      siteChip.innerHTML = `${wIc('globe')}<span></span>`;
      siteChip.querySelector('span').textContent = item.siteKey;
      row.appendChild(siteChip);
    }

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    if (item.isSameSite) {
      const swBtn = document.createElement('button');
      swBtn.className = 'act act-switch';
      swBtn.innerHTML = `${wIc('zap')}<span>سوییچ</span>`;
      swBtn.title = 'سوییچ در همین تب';
      swBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        runRowPrimary(item);
      });
      actions.appendChild(swBtn);
    }

    const tabBtn = document.createElement('button');
    tabBtn.className = 'act act-tab';
    tabBtn.innerHTML = `${wIc('external-link')}<span>تب جدید</span>`;
    tabBtn.title = 'باز کردن در تب ایزوله همزمان';
    tabBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      runRowNewTab(item);
      closeQuickSwitcher();
    });
    actions.appendChild(tabBtn);

    row.appendChild(actions);

    row.addEventListener('mouseenter', () => {
      qsSelected = idx;
      highlightRows();
    });
    row.addEventListener('click', () => {
      runRowPrimary(item);
    });

    return row;
  }

  function highlightRows() {
    if (!qsShadow) return;
    qsShadow.querySelectorAll('.row').forEach((el) => {
      el.classList.toggle('sel', Number(el.dataset.idx) === qsSelected);
    });
    const sel = qsShadow.querySelector(`.row[data-idx="${qsSelected}"]`);
    sel?.scrollIntoView({ block: 'nearest' });
  }

  function runRowPrimary(item) {
    closeQuickSwitcher();
    if (item.isSameSite) {
      sendMsg({ type: 'SWITCH_TO_ACCOUNT', accountId: item.accountId });
    } else {
      sendMsg({
        type: 'OPEN_ISOLATED_TAB',
        url: item.siteUrl,
        accountId: item.accountId,
        focusIfOpen: true
      });
    }
  }

  function runRowNewTab(item) {
    sendMsg({
      type: 'OPEN_ISOLATED_TAB',
      url: item.isSameSite ? window.location.href : item.siteUrl,
      accountId: item.accountId,
      focusIfOpen: true
    });
  }

  function renderQuickResults(data) {
    if (!qsShadow || !qsOpen) return;
    const results = qsShadow.querySelector('.results');
    if (!results) return;
    results.innerHTML = '';

    const sameSite = data?.sameSite || [];
    const otherSites = data?.otherSites || [];
    qsRows = [];
    sameSite.forEach((r) => qsRows.push(r));
    otherSites.forEach((r) => qsRows.push(r));

    if (qsSelected >= qsRows.length) qsSelected = 0;

    if (!qsRows.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = qsQuery
        ? 'اکانتی با این نام پیدا نشد.'
        : 'هنوز اکانتی ذخیره نشده است.';
      results.appendChild(empty);
      return;
    }

    const mkTitle = (icon, text) => {
      const t = document.createElement('div');
      t.className = 'section-title';
      t.innerHTML = `${wIc(icon)}<span>${text}</span>`;
      results.appendChild(t);
    };

    if (sameSite.length) {
      mkTitle('zap', 'همین سایت — سوییچ فوری');
      sameSite.forEach((item) => {
        results.appendChild(buildRow(item, qsRows.indexOf(item)));
      });
    }
    if (otherSites.length) {
      mkTitle('globe', 'سایت‌های دیگر — باز کردن در تب ایزوله');
      otherSites.forEach((item) => {
        results.appendChild(buildRow(item, qsRows.indexOf(item)));
      });
    }
  }

  async function searchQuickAccounts() {
    qsSearching = true;
    const res = await sendMsg({
      type: 'QUICK_SEARCH_ACCOUNTS',
      query: qsQuery,
      currentSiteKey: currentSiteKeyLocal()
    });
    qsSearching = false;
    if (res?.ok) {
      renderQuickResults(res);
    }
  }

  function openQuickSwitcher() {
    ensureQuickSwitcherMounted();
    qsOpen = true;
    qsQuery = '';
    qsSelected = 0;
    qsHost.style.display = 'block';

    const backdrop = qsShadow.querySelector('.backdrop');
    backdrop.innerHTML = '';

    const palette = document.createElement('div');
    palette.className = 'palette';

    const searchRow = document.createElement('div');
    searchRow.className = 'search-row';
    const sIcon = document.createElement('span');
    sIcon.innerHTML = wIc('search');
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'qs-input';
    input.placeholder = 'نام اکانت را بنویسید...';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    const kbd = document.createElement('span');
    kbd.className = 'kbd';
    kbd.textContent = 'Esc بستن';
    searchRow.appendChild(sIcon);
    searchRow.appendChild(input);
    searchRow.appendChild(kbd);

    const results = document.createElement('div');
    results.className = 'results';
    results.id = 'qs-results';
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'در حال دریافت اکانت‌ها...';
    results.appendChild(empty);

    const footer = document.createElement('div');
    footer.className = 'footer';
    footer.innerHTML =
      '<span><b>Enter</b> سوییچ در همین تب</span><span><b>Ctrl+Enter</b> تب جدید ایزوله</span><span><b>↑↓</b> حرکت بین اکانت‌ها</span>';

    palette.appendChild(searchRow);
    palette.appendChild(results);
    palette.appendChild(footer);
    backdrop.appendChild(palette);

    input.addEventListener('input', () => {
      qsQuery = input.value || '';
      clearTimeout(qsDebounce);
      qsDebounce = setTimeout(searchQuickAccounts, 140);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeQuickSwitcher();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (qsRows.length) {
          qsSelected = (qsSelected + 1) % qsRows.length;
          highlightRows();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (qsRows.length) {
          qsSelected = (qsSelected - 1 + qsRows.length) % qsRows.length;
          highlightRows();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = qsRows[qsSelected];
        if (!item) return;
        if (e.ctrlKey || e.metaKey) {
          runRowNewTab(item);
          closeQuickSwitcher();
        } else {
          runRowPrimary(item);
        }
      }
    });

    setTimeout(() => input.focus(), 30);
    searchQuickAccounts();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'REFRESH_WIDGET') {
      isBusy = false;
      refreshState();
    } else if (msg?.type === 'OPEN_QUICK_SWITCHER') {
      if (qsOpen) {
        closeQuickSwitcher();
      } else {
        openQuickSwitcher();
      }
    }
  });

  refreshState();
})();
