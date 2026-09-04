/**
 * TPlus Topup Auto-Checker - Content Script
 * - Click nút xanh [#do_retry_all_btn] ĐÚNG 1 LẦN DUY NHẤT (bỏ triệt để các lệnh click trùng lặp)
 * - Chỉ click vào Ô VUÔNG Checkbox SELECT ALL (không click chữ, không đi tick từng record)
 * - Tab Fail: Bấm nút xanh [#do_retry_all_btn] (1 lần duy nhất) ➔ Bấm nút [Close] ➔ Chờ và quét dòng "Doing re-topup as..."
 */

(() => {
  'use strict';

  if (window.__TPLUS_AUTO_CHECKER_INJECTED__) return;
  window.__TPLUS_AUTO_CHECKER_INJECTED__ = true;

  console.log('[NhiimSs Auto] Content Script loaded. URL:', window.location.href);

  let widgetElement = null;
  let countdownTimer = null;
  let liveLogs = [];

  let isContentPaused = false;
  let contentPauseResolver = null;

  // Khởi tạo trạng thái tạm dừng ngay khi inject
  chrome.storage.local.get(['isLoopPaused']).then(({ isLoopPaused = false }) => {
    isContentPaused = !!isLoopPaused;
  });

  // Lắng nghe thay đổi trạng thái tạm dừng theo thời gian thực
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.isLoopPaused !== undefined) {
        isContentPaused = !!changes.isLoopPaused.newValue;
        if (!isContentPaused && contentPauseResolver) {
          contentPauseResolver();
          contentPauseResolver = null;
        }
      }
    }
  });

  async function checkPauseAndCancelInContent() {
    while (isContentPaused) {
      await new Promise((resolve) => {
        contentPauseResolver = resolve;
      });
    }
  }

  // Sleep đóng băng ngay lập tức nếu bị tạm dừng (kiểm tra mỗi 100ms)
  async function sleep(ms) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      await checkPauseAndCancelInContent();
      const remaining = ms - (Date.now() - start);
      const chunk = Math.min(remaining, 100);
      if (chunk <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, chunk));
      await checkPauseAndCancelInContent();
    }
  }

  function norm(str) {
    return (str || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function getTimeStr() {
    return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // ==========================================
  // 1. LIVE LOGGING TERMINAL
  // ==========================================

  function logLive(text, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('vi-VN', { hour12: false });

    // Instead of relying on in-memory liveLogs which might be stale, read directly from storage
    chrome.storage.local.get('widgetLogs').then(({ widgetLogs = [] }) => {
      widgetLogs.push({ time: timestamp, text, type });
      if (widgetLogs.length > 50) widgetLogs.shift();

      liveLogs = widgetLogs;
      chrome.storage.local.set({ widgetLogs: liveLogs });
      renderLiveLogs();
    });
  }

  // Khôi phục log cũ
  chrome.storage.local.get('widgetLogs').then(({ widgetLogs = [] }) => {
    liveLogs = widgetLogs;
    renderLiveLogs();
  });

  function renderLiveLogs() {
    const container = document.getElementById('tplus-live-logs');
    if (!container) return;

    container.innerHTML = liveLogs.map(log => {
      return `
        <div class="tplus-log-line ${log.type}">
          <span class="tplus-log-time">[${log.time}]</span> ${escapeHtml(log.text)}
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
  }

  function updateCurrentStepBanner(text, isPaused = false) {
    const banner = document.getElementById('tplus-step-banner');
    if (banner) {
      banner.className = 'tplus-step-banner' + (isPaused ? ' paused' : '');
      banner.innerHTML = `<span>${isPaused ? '⏸' : '⚡'}</span> <span>${escapeHtml(text)}</span>`;
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==========================================
  // 2. SMART WAITING
  // ==========================================

  async function waitForElement(finderFn, timeoutMs = 12000, intervalMs = 400) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      await checkPauseAndCancelInContent();
      try {
        const el = finderFn();
        if (el) return el;
      } catch (e) { }
      await sleep(intervalMs);
    }
    return null;
  }

  async function waitForPageDataReady(timeoutMs = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      await checkPauseAndCancelInContent();
      const spinners = document.querySelectorAll('.spinner, .loading, .loader, [role="progressbar"], .swal2-loading');
      const isSpinnerVisible = Array.from(spinners).some(s => s.offsetParent !== null && s.id !== 'retry_all_loading');

      if (!isSpinnerVisible) {
        const bodyText = (document.body.innerText || '').toLowerCase();
        const hasRecordsText = bodyText.includes('displaying') || bodyText.includes('no data') || bodyText.includes('records');
        const hasTableRows = document.querySelectorAll('table tbody tr').length > 0;

        if (hasRecordsText || hasTableRows) {
          await sleep(800);
          return true;
        }
      }
      await sleep(500);
    }
    return false;
  }

  function setInputValue(inputEl, value) {
    if (!inputEl) return;
    inputEl.focus();
    try {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(inputEl, value);
      } else {
        inputEl.value = value;
      }
    } catch (e) {
      inputEl.value = value;
    }
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ==========================================
  // 3. AUTO LOGIN HANDLER
  // ==========================================

  function isLoginPage() {
    const url = window.location.href.toLowerCase();
    const hasPassword = !!document.querySelector('input[type="password"], input[name="password"], input[name*="pass"]');
    return url.includes('/login') || hasPassword;
  }

  function findLoginSubmitButton() {
    const submitBtn = document.querySelector('form button[type="submit"], form input[type="submit"], button[type="submit"], input[type="submit"]');
    if (submitBtn) return submitBtn;

    const formButtons = document.querySelectorAll('form button, .card-body button, .card button');
    for (const btn of formButtons) {
      const txt = norm(btn.innerText || btn.value || '');
      if (txt === 'login' || txt.includes('login') || txt === 'đăng nhập') {
        return btn;
      }
    }

    const allButtons = Array.from(document.querySelectorAll('button:not(nav button), .btn:not(a)'));
    for (const btn of allButtons) {
      const txt = norm(btn.innerText || btn.value || '');
      if (txt === 'login' || txt.includes('login')) {
        return btn;
      }
    }

    return document.querySelector('form');
  }

  async function handleAutoLogin(email, password, sendResponse) {
    logLive(`🔑 Phát hiện trang Login! Đang điền tài khoản...`, 'working');
    updateCurrentStepBanner('Đang tự động đăng nhập...');

    const emailInput = await waitForElement(() => {
      return document.querySelector('input[type="email"], input[name="email"], input[name="username"], input[name*="user"], input[id*="email"], input[id*="user"]');
    }, 8000);

    const passwordInput = await waitForElement(() => {
      return document.querySelector('input[type="password"], input[name="password"], input[name*="pass"], input[id*="pass"]');
    }, 8000);

    if (emailInput && email) setInputValue(emailInput, email);
    await sleep(400);
    if (passwordInput && password) setInputValue(passwordInput, password);
    await sleep(600);

    const loginBtn = await waitForElement(findLoginSubmitButton, 6000);

    if (loginBtn) {
      logLive(`🎯 Đang bấm đăng nhập vào hệ thống...`, 'working');
      sendResponse({ success: true, message: 'Đang nhấn nút Submit Login...' });

      setTimeout(() => {
        if (loginBtn.tagName === 'FORM') {
          loginBtn.submit();
        } else {
          loginBtn.click();
          const form = loginBtn.closest('form');
          if (form) setTimeout(() => form.submit?.(), 500);
        }
      }, 200);
      return;
    }

    logLive(`❌ Không tìm thấy nút Submit Login!`, 'error');
    sendResponse({ success: false, message: 'Không tìm thấy nút Submit Login' });
  }

  // ==========================================
  // 4. DATEPICKER: CHỌN NGÀY 15 VÀ BẤM SEARCH
  // ==========================================

  function findFromDateInput() {
    // 1. Tìm chính xác theo name/class chuẩn của trang web TTW
    const directInput = document.querySelector('input[name="from_date"], input[name="from"], input.date-picker, input.datepicker');
    if (directInput) return directInput;

    // 2. Tìm theo label chứa chữ 'from' hoặc 'từ ngày'
    const labels = Array.from(document.querySelectorAll('label, div, span, p'));
    for (const label of labels) {
      const txt = norm(label.textContent);
      if (txt === 'from' || txt === 'from date' || txt === 'from:' || txt.includes('from date') || txt.includes('từ ngày')) {
        const input = label.querySelector('input') ||
          label.nextElementSibling?.querySelector('input') ||
          (label.nextElementSibling?.tagName === 'INPUT' ? label.nextElementSibling : null) ||
          label.closest('.form-group, .col-md-3, .col-sm-4, div')?.querySelector('input');
        if (input) return input;
      }
    }

    // 3. Tìm theo name, id, placeholder
    const namedInputs = document.querySelectorAll('input[name*="from" i], input[placeholder*="from" i]');
    if (namedInputs.length > 0) return namedInputs[0];

    // 4. Fallback: Ô input date hoặc có giá trị ngày
    const allInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="date"]'));
    for (const input of allInputs) {
      const val = (input.value || '').trim();
      if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(val) || /^\d{2}[-/]\d{2}[-/]\d{4}$/.test(val)) {
        return input;
      }
    }

    return null;
  }

  function findSearchButton() {
    const candidates = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, .btn'));
    for (const btn of candidates) {
      const txt = norm(btn.innerText || btn.value || '');
      if (txt === 'search' || txt === 'tìm kiếm' || txt.includes('search')) {
        return btn;
      }
    }
    return null;
  }

  async function handleSetFromDateAndSearch(targetDateStr = '2026-08-15', sendResponse) {
    logLive(`📅 [Bước 1]: Đang chỉnh ngày From Date: ${targetDateStr}`, 'working');
    updateCurrentStepBanner(`Đang chỉnh ngày From: ${targetDateStr}...`);

    const fromInput = await waitForElement(findFromDateInput, 6000);
    if (!fromInput) {
      logLive(`⚠️ Không tìm thấy ô From Date. Bỏ qua bước đổi ngày.`, 'warning');
      sendResponse({ success: false, message: 'Không tìm thấy ô From Date' });
      return;
    }

    // 1. Gán trực tiếp giá trị ngày mục tiêu vào ô input
    setInputValue(fromInput, targetDateStr);
    fromInput.value = targetDateStr;

    // 2. Kích hoạt toàn bộ các event để plugin và form ghi nhận
    fromInput.dispatchEvent(new Event('input', { bubbles: true }));
    fromInput.dispatchEvent(new Event('change', { bubbles: true }));
    fromInput.dispatchEvent(new CustomEvent('changeDate', { bubbles: true }));
    fromInput.dispatchEvent(new CustomEvent('dp.change', { bubbles: true }));

    // 3. Nếu có Datepicker popup đang mở, đóng nó lại mà không làm mất giá trị
    const datepickerPopups = document.querySelectorAll('.datepicker, .datetimepicker, .flatpickr-calendar');
    datepickerPopups.forEach(pop => {
      pop.style.display = 'none';
    });

    logLive(`🎯 Đã set ngày From: ${targetDateStr}`, 'success');
    await sleep(600);

    // 4. Bấm nút Search để nạp lại dữ liệu
    const searchBtn = await waitForElement(findSearchButton, 5000);
    if (searchBtn) {
      logLive(`🔍 Đang bấm nút [Search] để tải lại bảng dữ liệu...`, 'working');
      sendResponse({ success: true, message: 'Đang bấm Search...' });
      setTimeout(() => searchBtn.click(), 200);
      return;
    }

    logLive(`⚠️ Không tìm thấy nút Search.`, 'warning');
    sendResponse({ success: true, message: 'Đã chỉnh ngày' });
  }

  // ==========================================
  // 5. SELECT ALL & ACTION
  // ==========================================

  function checkDisplayingRecords() {
    try {
      const rawText = document.body.innerText || '';
      const cleanText = rawText.replace(/[\u00A0\s]+/g, ' ').trim();

      const regexExact = /displaying\s+\d+\s*[-to]+\s*\d+\s+of\s+(\d+)\s+records/i;
      const matchExact = cleanText.match(regexExact);
      if (matchExact && matchExact[1]) {
        const count = parseInt(matchExact[1], 10);
        return { hasRecords: count > 0, count: count, text: matchExact[0] };
      }

      const regexGeneral = /displaying\s+.*?of\s+(\d+)\s+records/i;
      const matchGen = cleanText.match(regexGeneral);
      if (matchGen && matchGen[1]) {
        const count = parseInt(matchGen[1], 10);
        return { hasRecords: count > 0, count: count, text: matchGen[0] };
      }

      const regexSimple = /displaying\s+(\d+)\s+records/i;
      const matchSimple = cleanText.match(regexSimple);
      if (matchSimple && matchSimple[1]) {
        const count = parseInt(matchSimple[1], 10);
        return { hasRecords: count > 0, count: count, text: matchSimple[0] };
      }

      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      const validRows = rows.filter(r => {
        const txt = norm(r.innerText);
        return txt && !txt.includes('no data') && !txt.includes('không có dữ liệu') && !txt.includes('empty');
      });

      if (validRows.length > 0) {
        return { hasRecords: true, count: validRows.length, text: `${validRows.length} dòng table` };
      }
    } catch (e) {
      console.warn('[TPlus Auto] checkDisplayingRecords error:', e);
    }

    return { hasRecords: false, count: 0, text: 'No records' };
  }

  /**
   * Tìm ô checkbox SELECT ALL bằng chính xác ID #check_all từ DOM thực tế
   */
  function findSelectAllCheckboxInput() {
    // Ưu tiên 1: Tìm chính xác bằng ID #check_all (từ Inspect Element thực tế)
    const byId = document.getElementById('check_all');
    if (byId && byId.type === 'checkbox') return byId;

    // Ưu tiên 2: Tìm bằng title
    const byTitle = document.querySelector('input[type="checkbox"][title*="Select All" i]');
    if (byTitle) return byTitle;

    // Ưu tiên 3: Quét tất cả checkbox, tìm ô nào text xung quanh chứa "Select All"
    const allCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    for (const cb of allCheckboxes) {
      const id = (cb.id || '').toLowerCase();
      const nextTxt = (cb.nextSibling?.textContent || '').trim().toLowerCase();
      const parentTxt = (cb.parentElement?.textContent || '').trim().toLowerCase();

      // Bỏ qua checkbox Post Paid
      if (id.includes('post_paid') || parentTxt.includes('post paid')) continue;

      if (nextTxt.includes('select all') || parentTxt.includes('select all') || id === 'check_all' || id === 'select_all') {
        return cb;
      }
    }

    return null;
  }

  /**
   * Tìm & click ô vuông checkbox SELECT ALL, lặp lại tối đa 10 lần.
   * Nếu sau 10 lần vẫn không tìm thấy hoặc không tick được → trả về false để DỪNG luồng.
   */
  async function ensureSelectAllCheckboxTicked() {
    logLive(`☑️ Đang tìm ô vuông checkbox [SELECT ALL] (#check_all)...`, 'working');

    for (let attempt = 1; attempt <= 10; attempt++) {
      await checkPauseAndCancelInContent();
      const selectAllInput = findSelectAllCheckboxInput();

      if (!selectAllInput) {
        logLive(`⚠️ Lần ${attempt}/10: Chưa tìm thấy ô checkbox #check_all. Chờ 1.5 giây rồi tìm lại...`, 'warning');
        await sleep(1500);
        continue;
      }

      await checkPauseAndCancelInContent();
      logLive(`🎯 Đã tìm thấy ô checkbox #check_all (id="${selectAllInput.id}", title="${selectAllInput.title}"). Đang click...`, 'working');

      // Nếu đã checked rồi thì không cần click nữa
      if (selectAllInput.checked) {
        logLive(`☑️ Ô [SELECT ALL] ĐÃ ĐƯỢC TICK XANH THÀNH CÔNG! [✔]`, 'success');
        return true;
      }

      await checkPauseAndCancelInContent();
      // Click ĐÚNG 1 LẦN vào ô vuông input
      selectAllInput.focus?.();
      selectAllInput.click();

      await sleep(1500);
      await checkPauseAndCancelInContent();

      // Kiểm tra lại sau khi click
      if (selectAllInput.checked) {
        logLive(`☑️ Ô [SELECT ALL] ĐÃ ĐƯỢC TICK XANH THÀNH CÔNG! [✔]`, 'success');
        return true;
      }

      logLive(`⚠️ Lần ${attempt}/10: Ô chưa tick lên sau khi click. Thử lại...`, 'warning');
    }

    logLive(`❌ THẤT BẠI: Sau 10 lần thử vẫn không tick được ô [SELECT ALL]. DỪNG luồng tại đây!`, 'error');
    return false;
  }

  // ==========================================
  // 5.1. PHONE BLACKLIST FILTER (LỌC SỐ ĐIỆN THOẠI)
  // ==========================================

  function normalizePhoneNumber(str) {
    if (!str) return '';
    let cleaned = String(str).replace(/\D/g, '');
    if (cleaned.startsWith('84') && cleaned.length >= 11) {
      cleaned = '0' + cleaned.slice(2);
    }
    return cleaned;
  }

  function isPhoneBlocked(phoneStr, blockedList) {
    if (!phoneStr || !blockedList || blockedList.length === 0) return false;
    const rawClean = String(phoneStr).trim().replace(/\s+/g, '');
    const normTarget = normalizePhoneNumber(phoneStr);

    for (const item of blockedList) {
      const itemClean = String(item).trim().replace(/\s+/g, '');
      if (!itemClean) continue;

      // So khớp chính xác chuỗi (VD: 84394162725 == 84394162725)
      if (rawClean === itemClean) return true;

      // So khớp sau chuẩn hóa (VD: 84394162725 == 0394162725)
      const normItem = normalizePhoneNumber(item);
      if (normTarget && normItem && normTarget === normItem) return true;

      // So khớp 9 chữ số cuối
      if (normTarget.length >= 9 && normItem.length >= 9) {
        if (normTarget.slice(-9) === normItem.slice(-9)) {
          return true;
        }
      }
    }
    return false;
  }

  async function uncheckExcludedRecords() {
    try {
      const { blockedPhones = '' } = await chrome.storage.local.get('blockedPhones');

      const blockedList = blockedPhones
        ? blockedPhones
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0 && !line.startsWith('#'))
        : [];

      logLive(`🛡️ Đang quét lọc SĐT Blacklist (${blockedList.length} số)...`, 'working');

      const rows = Array.from(document.querySelectorAll('table tbody tr, table tr'));
      let uncheckPhoneCount = 0;

      for (const tr of rows) {
        // 1. Tìm ô chứa SĐT trong hàng (dạng <td ... id="mt_phone_57851">84394162725</td>)
        let phoneText = '';
        const phoneTd = tr.querySelector('td[id^="mt_phone_"]');
        if (phoneTd) {
          phoneText = (phoneTd.innerText || phoneTd.textContent || '').trim();
        } else {
          // Fallback: Quét các ô td trong hàng tìm chuỗi dạng số điện thoại
          const tds = tr.querySelectorAll('td');
          for (const td of tds) {
            const txt = (td.innerText || td.textContent || '').trim();
            if (/^\+?\d{9,13}$/.test(txt.replace(/\s+/g, ''))) {
              phoneText = txt;
              break;
            }
          }
        }

        // 3. Kiểm tra có nằm trong danh sách SĐT Blacklist không
        const isBlockedPhone = phoneText && isPhoneBlocked(phoneText, blockedList);

        // 4. Nếu SĐT trong Blacklist -> Bỏ tick checkbox trong cùng record
        if (isBlockedPhone) {
          const checkbox = tr.querySelector('input.check-check-trans') ||
            tr.querySelector('input[type="checkbox"]:not(#check_all)');

          if (checkbox) {
            const theId = checkbox.getAttribute('the-id') || checkbox.id || '';

            // Nếu đang tick thì bỏ tick đi
            if (checkbox.checked) {
              checkbox.click();
              if (checkbox.checked) {
                checkbox.checked = false;
              }
              checkbox.dispatchEvent(new Event('change', { bubbles: true }));
              checkbox.dispatchEvent(new Event('input', { bubbles: true }));

              uncheckPhoneCount++;
              logLive(`🚫 Đã bỏ chọn SĐT bị chặn: ${phoneText}${theId ? ' (ID: ' + theId + ')' : ''}`, 'warning');
            }
          }
        }
      }

      if (uncheckPhoneCount > 0) {
        logLive(`🛡️ Đã bỏ tick ${uncheckPhoneCount} SĐT Blacklist trên trang này!`, 'info');
      } else {
        logLive(`✅ Không phát hiện SĐT Blacklist nào trên trang này.`, 'info');
      }

      return uncheckPhoneCount;
    } catch (err) {
      console.warn('[TPlus Auto] uncheckExcludedRecords error:', err);
      return 0;
    }
  }

  // Alias để tương thích
  const uncheckBlockedPhoneNumbers = uncheckExcludedRecords;

  function findActionButtonForTab(tabName) {
    const isFailTab = norm(tabName) === 'fail';
    const targetText = isFailTab ? 'retry topup list' : 'check trans list';
    const fallbackText = isFailTab ? 'retry topup' : 'check trans';

    const candidates = Array.from(
      document.querySelectorAll('button, a, input[type="button"], input[type="submit"], .btn')
    );

    for (const btn of candidates) {
      const text = norm(btn.innerText || btn.value || '');
      if (text === targetText) return btn;
    }

    for (const btn of candidates) {
      const text = norm(btn.innerText || btn.value || '');
      if (text.includes(targetText)) return btn;
    }

    for (const btn of candidates) {
      const onclick = norm(btn.getAttribute('onclick') || '');
      const id = norm(btn.id);
      const className = norm(btn.className);
      const key = isFailTab ? 'retry' : 'checktrans';
      if (onclick.includes(key) || id.includes(key) || className.includes(key)) return btn;
    }

    for (const btn of candidates) {
      const text = norm(btn.innerText || btn.value || '');
      if (text.includes(fallbackText)) return btn;
    }

    return null;
  }

  /**
   * Tab Fail: Bấm nút xanh [#do_retry_all_btn] (ĐÚNG 1 LẦN DUY NHẤT) ➔ Bấm nút [Close] ➔ Chờ và quét dòng "Doing re-topup as..."
   */
  async function handleConfirmModalAndWatch(expectedRecords = 1, timeoutMs = 15000) {
    await checkPauseAndCancelInContent();
    logLive(`💬 Đang chờ cửa sổ modal chứa nút [#do_retry_all_btn]...`, 'working');

    const startTime = Date.now();
    let btn = null;

    // 1. Quét tìm nút ID #do_retry_all_btn
    while (Date.now() - startTime < timeoutMs) {
      await checkPauseAndCancelInContent();
      btn = document.getElementById('do_retry_all_btn') ||
        document.querySelector('.modal-footer button.btn-success') ||
        document.querySelector('button[id*="retry" i]');

      if (btn && btn.offsetParent !== null) {
        break;
      }
      await sleep(400);
    }

    if (!btn || btn.offsetParent === null) {
      logLive(`❌ KHÔNG TÌM THẤY MODAL HOẶC MODAL CHƯA MỞ SAU ${timeoutMs / 1000}s!`, 'error');
      return false;
    }

    await sleep(1000);
    await checkPauseAndCancelInContent();
    logLive(`🎯 Đang bấm nút xanh [OK, Retry Multiple Now]...`, 'working');

    // 2. BẤM NÚT XANH [#do_retry_all_btn] ĐÚNG 1 LẦN DUY NHẤT BẰNG .click()
    btn.focus();
    btn.click();
    logLive(`✅ Đã bấm nút xanh [OK, Retry Multiple Now] (1 lần duy nhất). Chờ máy chủ 3 giây...`, 'success');

    // Nghỉ 3 giây để máy chủ nhận request
    await sleep(3000);
    await checkPauseAndCancelInContent();

    // 3. BẤM NÚT [CLOSE] TRÊN MODAL ĐỂ ĐÓNG CỬA SỔ
    logLive(`👉 Đang tìm nút [Close] trên modal...`, 'working');

    // Tăng cường quét tìm nút Close (chỉ lấy nút đang hiển thị)
    const closeCandidates = Array.from(document.querySelectorAll('button[data-dismiss="modal"], button.btn-link, .modal button'));
    let closeBtn = closeCandidates.find(b => b.offsetParent !== null && norm(b.innerText || '').includes('close'));

    if (!closeBtn) {
      closeBtn = document.querySelector('button[data-dismiss="modal"], button.close');
    }

    if (closeBtn) {
      await checkPauseAndCancelInContent();
      closeBtn.focus();
      closeBtn.click();
      logLive(`✅ Đã bấm nút [Close] để đóng Modal.`, 'success');

      // Fallback thêm: Nếu trang dùng jQuery Bootstrap, ép đóng modal đề phòng click không ăn
      try {
        if (typeof window.$ !== 'undefined' && window.$('.modal').length) {
          window.$('.modal').modal('hide');
        }
      } catch (e) { }
    } else {
      logLive(`⚠️ Không tìm thấy nút Close, thử ẩn modal bằng code...`, 'warning');
      try {
        if (typeof window.$ !== 'undefined' && window.$('.modal').length) {
          window.$('.modal').modal('hide');
        } else {
          document.querySelectorAll('.modal, .modal-backdrop').forEach(el => el.style.display = 'none');
          document.body.classList.remove('modal-open');
        }
      } catch (e) { }
    }

    await sleep(2000);

    // 4. THEO DÕI CÁC DÒNG "Doing re-topup as..." TRÊN TỪNG BẢN GHI
    logLive(`⏳ Đang theo dõi máy chủ thực hiện "Doing re-topup as..." trên các bản ghi...`, 'working');

    let isDoingFound = false;
    const watchStartTime = Date.now();

    while (Date.now() - watchStartTime < 25000) {
      const bodyText = (document.body.innerText || '').toLowerCase();
      const doingElements = document.querySelectorAll('li.list-unstyled, div[id^="results_"], td');

      const hasDoingText = Array.from(doingElements).some(el => (el.innerText || '').toLowerCase().includes('doing re-topup'));

      if (hasDoingText || bodyText.includes('doing re-topup') || bodyText.includes('processing')) {
        if (!isDoingFound) {
          isDoingFound = true;
          logLive(`⚡ XÁC NHẬN THÀNH CÔNG: Đã xuất hiện dòng "Doing re-topup as..." trên các bản ghi!`, 'success');
        }
      }

      await sleep(1500);

      // Chờ ít nhất 6 giây để máy chủ xử lý ổn định
      if (isDoingFound && (Date.now() - watchStartTime > 6000)) {
        logLive(`🎉 Tiến trình re-topup của máy chủ đã hoàn tất!`, 'success');
        return true;
      }
    }

    logLive(`🎉 Đã kích hoạt "Doing re-topup as..." hoàn tất!`, 'success');
    return true;
  }

  async function handleExecuteTopupAction(stepName, sendResponse) {
    const tabTitle = (stepName || 'processing').toUpperCase();
    const isFail = tabTitle.includes('FAIL');
    const actionName = isFail ? 'Retry Topup List' : 'Check Trans List';

    logLive(`📊 [Bước 2]: Bắt đầu kiểm tra bảng dữ liệu Tab ${tabTitle}...`, 'working');
    updateCurrentStepBanner(`Đang quét bản ghi Tab ${tabTitle}...`);

    // 1. Chờ dữ liệu bảng tải xong
    await waitForPageDataReady(10000);
    await sleep(1500);

    // 2. Quét bản ghi
    let recordInfo = checkDisplayingRecords();
    if (!recordInfo.hasRecords) {
      await sleep(2500);
      recordInfo = checkDisplayingRecords();
    }

    logLive(`📋 Kết quả quét Tab ${tabTitle}: ${recordInfo.text} (${recordInfo.count} bản ghi)`, recordInfo.hasRecords ? 'working' : 'info');

    // 3. Nếu không có bản ghi -> Bỏ qua
    if (!recordInfo.hasRecords || recordInfo.count === 0) {
      logLive(`⏭️ Tab ${tabTitle} có 0 bản ghi ➔ Lướt qua bước tiếp theo.`, 'info');
      updateCurrentStepBanner(`Tab ${tabTitle}: 0 bản ghi (Lướt qua)`);
      sendResponse({ success: true, message: `0 bản ghi`, records: 0, skipped: true });
      return;
    }

    const records = recordInfo.count;
    logLive(`🎯 Phát hiện ${records} bản ghi hợp lệ! Bắt đầu kiểm tra ô [SELECT ALL]...`, 'working');

    // 4. CHỈ CLICK Ô VUÔNG [SELECT ALL] VÀ KIỂM TRA CÓ DẤU TICK XANH [✔]
    const selectAllOk = await ensureSelectAllCheckboxTicked();
    if (!selectAllOk) {
      logLive(`🛑 DỪNG Tab ${tabTitle}: Không tick được ô SELECT ALL sau 10 lần thử!`, 'error');
      updateCurrentStepBanner(`DỪNG Tab ${tabTitle}: Không tick được SELECT ALL`);
      sendResponse({ success: false, message: `Không tick được SELECT ALL sau 10 lần thử`, records });
      return;
    }
    await sleep(1500); // Nghỉ 1.5s để hệ thống tự động tick các dòng

    // 4.1. LỌC VÀ BỎ TICK CÁC SỐ ĐIỆN THOẠI BỊ CHẶN (BLACKLIST)
    await uncheckBlockedPhoneNumbers();
    await sleep(1000); // Nghỉ 1s trước khi click nút hành động
    await checkPauseAndCancelInContent();

    // 5. Bấm nút hành động (Check Trans List hoặc Retry Topup List)
    logLive(`⚡ Đang bấm nút [${actionName}]...`, 'working');
    const actionButton = await waitForElement(() => findActionButtonForTab(isFail ? 'fail' : 'processing'), 10000);
    if (!actionButton) {
      logLive(`❌ Không tìm thấy nút [${actionName}]!`, 'error');
      sendResponse({ success: false, message: `Không tìm thấy nút ${actionName}`, records });
      return;
    }

    await checkPauseAndCancelInContent();
    actionButton.click();
    logLive(`✅ Đã bấm nút [${actionName}]. Chờ 2 giây...`, 'success');
    await sleep(2000);
    await checkPauseAndCancelInContent();

    // 6. ĐẶC BIỆT: TAB FAIL ➔ BẤM ID [#do_retry_all_btn] (1 LẦN) ➔ BẤM CLOSE ➔ QUÉT XÁC NHẬN "Doing re-topup as..."
    if (isFail) {
      updateCurrentStepBanner(`Đang bấm OK ➔ Close ➔ Quét Doing re-topup...`);
      await handleConfirmModalAndWatch(records, 15000);
    }

    await sleep(3000);
    logLive(`🎉 Hoàn tất chu trình Tab ${tabTitle} (${records} bản ghi)!`, 'success');
    updateCurrentStepBanner(`Hoàn tất Tab ${tabTitle} (${records} rec)`);

    sendResponse({
      success: true,
      message: `Đã xử lý ${actionName} (${records} bản ghi)`,
      records
    });
  }

  // ==========================================
  // 6. FLOATING WIDGET UI (RUN / PAUSE / RESUME / STOP)
  // ==========================================

  function renderWidgetButtons(isLoopRunning, isLoopPaused) {
    const actionsContainer = document.getElementById('tplus-widget-actions');
    if (!actionsContainer) return;

    if (isLoopRunning) {
      if (isLoopPaused) {
        actionsContainer.innerHTML = `
          <button class="tplus-btn-run tplus-btn-resume" id="tplus-btn-resume" title="Tiếp tục chạy auto">▶ Tiếp tục</button>
          <button class="tplus-btn-stop" id="tplus-btn-stop" title="Dừng hẳn">⏹ Dừng</button>
          <button class="tplus-btn-discord" id="tplus-btn-test-discord" title="Test Webhook" style="background:#5865F2;color:white;border:none;border-radius:4px;cursor:pointer;padding:0 6px;">💬 Test</button>
          <button class="tplus-btn-min" id="tplus-widget-toggle" title="Thu nhỏ">−</button>
          <button class="tplus-btn-close" id="tplus-widget-close" title="Ẩn">✕</button>
        `;
      } else {
        actionsContainer.innerHTML = `
          <button class="tplus-btn-pause" id="tplus-btn-pause" title="Tạm dừng để kiểm tra">⏸ Tạm dừng</button>
          <button class="tplus-btn-stop" id="tplus-btn-stop" title="Dừng hẳn">⏹ Dừng</button>
          <button class="tplus-btn-discord" id="tplus-btn-test-discord" title="Test Webhook" style="background:#5865F2;color:white;border:none;border-radius:4px;cursor:pointer;padding:0 6px;">💬 Test</button>
          <button class="tplus-btn-min" id="tplus-widget-toggle" title="Thu nhỏ">−</button>
          <button class="tplus-btn-close" id="tplus-widget-close" title="Ẩn">✕</button>
        `;
      }
    } else {
      actionsContainer.innerHTML = `
        <button class="tplus-btn-run" id="tplus-btn-run" title="Bắt đầu chạy auto">▶ Chạy Vòng Lặp</button>
        <button class="tplus-btn-discord" id="tplus-btn-test-discord" title="Test Webhook" style="background:#5865F2;color:white;border:none;border-radius:4px;cursor:pointer;padding:0 6px;">💬 Test</button>
        <button class="tplus-btn-min" id="tplus-widget-toggle" title="Thu nhỏ">−</button>
        <button class="tplus-btn-close" id="tplus-widget-close" title="Ẩn">✕</button>
      `;
    }

    attachWidgetActionEvents();
  }

  function attachWidgetActionEvents() {
    const runBtn = document.getElementById('tplus-btn-run');
    if (runBtn) {
      runBtn.addEventListener('click', async () => {
        logLive('🚀 Người dùng bấm [▶ Chạy Vòng Lặp]', 'working');
        await chrome.runtime.sendMessage({ action: 'RUN_NOW' });
      });
    }

    const testDiscordBtn = document.getElementById('tplus-btn-test-discord');
    if (testDiscordBtn) {
      testDiscordBtn.addEventListener('click', async () => {
        logLive('💬 Đang bắn thử webhook @everyone 100 records sang Discord...', 'working');
        await chrome.runtime.sendMessage({ action: 'TEST_DISCORD_WEBHOOK' });
      });
    }

    const pauseBtn = document.getElementById('tplus-btn-pause');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', async () => {
        logLive('⏸ Người dùng bấm [⏸ TẠM DỪNG]. Auto đang tạm dừng lại tại bước này để bạn kiểm tra.', 'warning');
        updateCurrentStepBanner('Đang TẠM DỪNG (Bấm "Tiếp tục" để chạy tiếp)', true);
        await chrome.runtime.sendMessage({ action: 'PAUSE_LOOP' });
      });
    }

    const resumeBtn = document.getElementById('tplus-btn-resume');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', async () => {
        logLive('▶ Người dùng bấm [▶ TIẾP TỤC]. Auto tiếp tục thực hiện luồng...', 'working');
        updateCurrentStepBanner('Đang tiếp tục luồng tự động...');
        await chrome.runtime.sendMessage({ action: 'RESUME_LOOP' });
      });
    }

    const stopBtn = document.getElementById('tplus-btn-stop');
    if (stopBtn) {
      stopBtn.addEventListener('click', async () => {
        logLive('🛑 Người dùng bấm [⏹ DỪNG HẲN].', 'error');
        await chrome.runtime.sendMessage({ action: 'STOP_LOOP' });
      });
    }

    const toggleBtn = document.getElementById('tplus-widget-toggle');
    const bodyEl = document.getElementById('tplus-widget-body');
    if (toggleBtn && bodyEl) {
      toggleBtn.addEventListener('click', () => {
        bodyEl.classList.toggle('tplus-hidden');
        if (widgetElement) widgetElement.classList.toggle('tplus-minimized');
        toggleBtn.textContent = bodyEl.classList.contains('tplus-hidden') ? '+' : '−';
      });
    }

    const closeBtn = document.getElementById('tplus-widget-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', async () => {
        if (widgetElement) widgetElement.style.display = 'none';
        await chrome.storage.local.set({ showWidget: false });
      });
    }
  }

  function attachWidgetDragEvents(widget) {
    const header = document.getElementById('tplus-widget-header');
    if (!header || !widget) return;

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;

      isDragging = true;
      const rect = widget.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;

      widget.style.bottom = 'auto';
      widget.style.right = 'auto';
      widget.style.left = rect.left + 'px';
      widget.style.top = rect.top + 'px';

      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      let x = e.clientX - offsetX;
      let y = e.clientY - offsetY;

      const maxX = window.innerWidth - widget.offsetWidth;
      const maxY = window.innerHeight - widget.offsetHeight;

      if (x < 0) x = 0;
      if (x > maxX) x = maxX;
      if (y < 0) y = 0;
      if (y > maxY) y = maxY;

      widget.style.left = x + 'px';
      widget.style.top = y + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.userSelect = '';

        // Lưu lại vị trí khi nhả chuột
        chrome.storage.local.get('widgetState').then(({ widgetState = {} }) => {
          widgetState.left = widget.style.left;
          widgetState.top = widget.style.top;
          chrome.storage.local.set({ widgetState });
        });
      }
    });

    // Theo dõi thay đổi kích thước bằng ResizeObserver
    let resizeTimeout;
    const resizeObserver = new ResizeObserver((entries) => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        for (let entry of entries) {
          const { width, height } = entry.contentRect;
          chrome.storage.local.get('widgetState').then(({ widgetState = {} }) => {
            widgetState.width = width + 'px';
            widgetState.height = height + 'px';
            chrome.storage.local.set({ widgetState });
          });
        }
      }, 500); // Debounce 500ms
    });

    resizeObserver.observe(widget);
  }

  async function createFloatingWidget() {
    try {
      const { showWidget = true, isLoopRunning = false, isLoopPaused = false, widgetLogs = [], widgetState = {} } = await chrome.storage.local.get([
        'showWidget',
        'isLoopRunning',
        'isLoopPaused',
        'widgetLogs',
        'widgetState'
      ]);

      liveLogs = widgetLogs || [];

      if (document.getElementById('tplus-auto-widget')) {
        widgetElement = document.getElementById('tplus-auto-widget');
        widgetElement.style.display = showWidget ? 'flex' : 'none';
        renderWidgetButtons(isLoopRunning, isLoopPaused);
        renderLiveLogs();
        return;
      }

      const widget = document.createElement('div');
      widget.id = 'tplus-auto-widget';
      if (!showWidget) widget.style.display = 'none';

      // Phục hồi vị trí và kích thước đã lưu
      if (widgetState.left && widgetState.top) {
        widget.style.bottom = 'auto';
        widget.style.right = 'auto';
        widget.style.left = widgetState.left;
        widget.style.top = widgetState.top;
      }
      if (widgetState.width && widgetState.height) {
        widget.style.width = widgetState.width;
        widget.style.height = widgetState.height;
      }

      widget.innerHTML = `
        <div class="tplus-widget-header" id="tplus-widget-header">
          <div class="tplus-widget-title">
            <span class="tplus-status-dot ${isLoopPaused ? 'paused' : isLoopRunning ? 'working' : 'idle'}" id="tplus-dot"></span>
            <strong>TPlus Auto Topup</strong>
          </div>
          <div class="tplus-widget-actions" id="tplus-widget-actions"></div>
        </div>
        <div class="tplus-widget-body" id="tplus-widget-body">
          <div class="tplus-info-row">
            <div>
              <span>⏱ Chạy tới: </span>
              <strong id="tplus-countdown-text">--:--</strong>
            </div>
            <span id="tplus-bot-pill" class="tplus-bot-pill offline" title="Discord Bot chưa bật! Hãy chạy start_hidden.vbs">🤖 Bot: Chưa bật</span>
          </div>
          <div class="tplus-step-banner ${isLoopPaused ? 'paused' : ''}" id="tplus-step-banner">
            <span>${isLoopPaused ? '⏸' : '📍'}</span> <span>${isLoopPaused ? 'Đang TẠM DỪNG' : 'Sẵn sàng...'}</span>
          </div>
          <div class="tplus-live-terminal-wrapper">
            <div class="tplus-terminal-header">
              <span>🖥️ LIVE ACTIVITY LOG</span>
              <span id="tplus-log-count">● LIVE</span>
            </div>
            <div class="tplus-live-logs" id="tplus-live-logs">
              <div class="tplus-log-line info">[Sẵn sàng] Chờ kích hoạt chu kỳ tự động...</div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(widget);
      widgetElement = widget;

      renderWidgetButtons(isLoopRunning, isLoopPaused);
      renderLiveLogs();
      startCountdownWatcher();
      attachWidgetDragEvents(widget);
    } catch (e) {
      console.warn('[TPlus Auto] createFloatingWidget error:', e);
    }
  }

  const FIREBASE_DB_URL = 'https://fir-run-extension-t-plus-default-rtdb.asia-southeast1.firebasedatabase.app';
  let cachedBotOnline = false;
  let lastBotCheckTime = 0;

  async function checkDirectBotOnlineInContent() {
    if (Date.now() - lastBotCheckTime < 2500) return cachedBotOnline;
    lastBotCheckTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${FIREBASE_DB_URL}/bot_status.json`, { signal: controller.signal }).then(r => r.json()).catch(() => null);
      clearTimeout(timeoutId);
      const now = Date.now();
      cachedBotOnline = !!(res && res.online && (now - (res.lastActive || 0) < 10000));
      chrome.storage.local.set({ isBotOnline: cachedBotOnline });
      return cachedBotOnline;
    } catch (e) {
      return cachedBotOnline;
    }
  }

  function startCountdownWatcher() {
    if (countdownTimer) clearInterval(countdownTimer);

    const updateCountdown = async () => {
      try {
        const isLiveBotOnline = await checkDirectBotOnlineInContent();
        const { enabled, nextRunTime, showWidget = true, isLoopRunning = false, isLoopPaused = false } = await chrome.storage.local.get([
          'enabled',
          'nextRunTime',
          'showWidget',
          'isLoopRunning',
          'isLoopPaused'
        ]);

        if (widgetElement) {
          widgetElement.style.display = showWidget ? 'flex' : 'none';
          const dot = document.getElementById('tplus-dot');
          if (dot) {
            dot.className = 'tplus-status-dot ' + (isLoopPaused ? 'paused' : (isLoopRunning ? 'working' : (enabled ? '' : 'idle')));
          }
        }

        const botPill = document.getElementById('tplus-bot-pill');
        if (botPill) {
          botPill.className = 'tplus-bot-pill ' + (isLiveBotOnline ? 'online' : 'offline');
          botPill.textContent = isLiveBotOnline ? '🤖 Bot: Online' : '🤖 Bot: Chưa bật';
          botPill.title = isLiveBotOnline ? 'Discord Controller Bot đang hoạt động' : 'Discord Bot chưa bật! Hãy chạy start_hidden.vbs để điều khiển từ xa';
        }

        const countdownText = document.getElementById('tplus-countdown-text');
        if (!countdownText) return;

        if (isLoopPaused) {
          countdownText.textContent = 'ĐANG TẠM DỪNG';
          return;
        }

        if (isLoopRunning) {
          countdownText.textContent = 'ĐANG CHẠY...';
          return;
        }

        if (!enabled) {
          countdownText.textContent = 'Đang tắt';
          return;
        }

        if (!nextRunTime) {
          countdownText.textContent = 'Chưa lên lịch';
          return;
        }

        const diffMs = nextRunTime - Date.now();
        if (diffMs <= 0) {
          countdownText.textContent = 'Đến giờ chạy...';
          return;
        }

        const totalSec = Math.floor(diffMs / 1000);
        const minutes = Math.floor(totalSec / 60);
        const seconds = totalSec % 60;
        countdownText.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      } catch (e) { }
    };

    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 1000);
  }

  // ==========================================
  // 7. LẮNG NGHE LỆNH TỪ SERVICE WORKER
  // ==========================================

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
      if (request.action === 'LOG_MESSAGE') {
        logLive(request.text, request.type || 'info');
        sendResponse({ success: true });
      }
      else if (request.action === 'CHECK_IS_LOGIN_PAGE') {
        sendResponse({ isLoginPage: isLoginPage() });
      }
      else if (request.action === 'DO_LOGIN') {
        handleAutoLogin(request.email, request.password, sendResponse);
      }
      else if (request.action === 'SET_FROM_DATE_AND_SEARCH') {
        handleSetFromDateAndSearch(request.fromDate, sendResponse);
      }
      else if (request.action === 'GET_RECORDS_INFO') {
        const info = checkDisplayingRecords();

        let maxPage = 1;
        document.querySelectorAll('.pagination .page-link').forEach(link => {
          const num = parseInt(link.innerText.trim(), 10);
          if (!isNaN(num) && num > maxPage) {
            maxPage = num;
          }
        });

        sendResponse({ success: true, totalRecords: info.count, totalPages: maxPage });
      }
      else if (request.action === 'GO_TO_PAGE') {
        const targetPage = String(request.page);
        const pageLinks = Array.from(document.querySelectorAll('a.page-link'));
        const exactLink = pageLinks.find(a => a.innerText.trim() === targetPage);

        if (exactLink) {
          exactLink.click();
          sendResponse({ success: true, navigating: true });
        } else {
          // Fallback: modify href of the first page-link if available
          if (pageLinks.length > 0) {
            const sampleHref = pageLinks[0].getAttribute('href');
            if (sampleHref) {
              const newHref = sampleHref.replace(/page=\d+/, `page=${targetPage}`);
              window.location.href = newHref;
              sendResponse({ success: true, navigating: true });
              return;
            }
          }
          // Final fallback
          const url = new URL(window.location.href);
          url.searchParams.set('page', targetPage);
          window.location.href = url.toString();
          sendResponse({ success: true, navigating: true });
        }
      }
      else if (request.action === 'EXECUTE_TOPUP_ACTION') {
        handleExecuteTopupAction(request.step, sendResponse);
      }
      else {
        sendResponse({ success: true, message: 'Đã nhận' });
      }
    } catch (e) {
      sendResponse({ success: false, message: e.message });
    }
    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.showWidget !== undefined && widgetElement) {
        widgetElement.style.display = changes.showWidget.newValue ? 'flex' : 'none';
      }
      if (changes.widgetLogs) {
        liveLogs = changes.widgetLogs.newValue || [];
        renderLiveLogs();
      }
      if (changes.isLoopRunning !== undefined || changes.isLoopPaused !== undefined) {
        chrome.storage.local.get(['isLoopRunning', 'isLoopPaused']).then(({ isLoopRunning = false, isLoopPaused = false }) => {
          renderWidgetButtons(isLoopRunning, isLoopPaused);
        });
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createFloatingWidget);
  } else {
    createFloatingWidget();
  }
})();
