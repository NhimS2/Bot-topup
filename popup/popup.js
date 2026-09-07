/**
 * TPlus Topup Auto-Checker - Popup Script
 * Hỗ trợ chuyển đổi nút Chạy / Tạm Dừng / Tiếp tục / Dừng hẳn, From Date và Mã Kích Hoạt (Access Code)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const toggleEnabled = document.getElementById('toggle-enabled');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const countdownTimer = document.getElementById('countdown-timer');
  const btnRunNow = document.getElementById('btn-run-now');
  const btnStopNow = document.getElementById('btn-stop-now');

  // Auth / Access Code Elements
  const inputAccessCode = document.getElementById('input-access-code');
  const btnVerifyCode = document.getElementById('btn-verify-code');
  const authBadge = document.getElementById('auth-badge');
  const authMsg = document.getElementById('auth-msg');

  const inputInterval = document.getElementById('input-interval');
  const inputStartTime = document.getElementById('input-start-time');
  const inputEndTime = document.getElementById('input-end-time');
  const selectStartHour = document.getElementById('select-start-hour');
  const selectStartMin = document.getElementById('select-start-min');
  const selectEndHour = document.getElementById('select-end-hour');
  const selectEndMin = document.getElementById('select-end-min');
  const presetButtons = document.querySelectorAll('.btn-preset');
  const inputFromDate = document.getElementById('input-from-date');
  const checkAutoToday = document.getElementById('check-auto-today');
  const btnSetToday = document.getElementById('btn-set-today');
  const inputDeviceName = document.getElementById('input-device-name');
  const inputEmail = document.getElementById('input-email');
  const inputPassword = document.getElementById('input-password');

  function getTodayDateStr() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // Phone blacklist elements
  const inputPhoneEntry = document.getElementById('input-phone-entry');
  const btnAddPhone = document.getElementById('btn-add-phone');
  const blockedPhonesTags = document.getElementById('blocked-phones-tags');
  const blockedPhonesCount = document.getElementById('blocked-phones-count');

  const checkShowWidget = document.getElementById('check-show-widget');
  const btnSaveConfig = document.getElementById('btn-save-config');

  const logsContainer = document.getElementById('logs-container');
  const btnClearLogs = document.getElementById('btn-clear-logs');

  let countdownInterval = null;
  let blockedPhoneList = [];
  let isCodeVerified = false;

  const FIREBASE_DB_URL = 'https://fir-run-extension-t-plus-default-rtdb.asia-southeast1.firebasedatabase.app';
  const AUTH_WEBHOOK_URL = 'https://ptb.discord.com/api/webhooks/1545410985198747738/M535wrLZA8Peczqn9boiW2q6P5D1T0CJT6L3Iv828nvKmr2Yik0_QsSMiaHWg7wX3YZF';

  // Helper gửi webhook log khi kích hoạt mã
  async function sendAuthWebhook(isSuccess, enteredCode, note = '') {
    try {
      const devName = inputDeviceName ? inputDeviceName.value.trim() : 'Máy 1';
      const email = inputEmail ? inputEmail.value.trim() : 'N/A';
      const nowStr = new Date().toLocaleString('vi-VN');

      const embed = {
        title: isSuccess ? '🟢 KÍCH HOẠT AUTO THÀNH CÔNG' : '🔴 NHẬP SAI MÃ KÍCH HOẠT',
        description: isSuccess
          ? `Máy **${devName}** đã kích hoạt mã thành công và được cấp quyền bật Auto.`
          : `Máy **${devName}** vừa nhập sai mã kích hoạt.`,
        color: isSuccess ? 0x22C55E : 0xEF4444,
        timestamp: new Date().toISOString(),
        footer: { text: 'TPlus Security License Logs' },
        fields: [
          { name: '🖥️ Tên máy', value: devName, inline: true },
          { name: '📧 Email', value: `\`${email}\``, inline: true },
          { name: '🔑 Mã vừa nhập', value: `\`${enteredCode || 'Rỗng'}\``, inline: true },
          { name: '⏰ Thời gian', value: nowStr, inline: true },
          { name: '📝 Ghi chú', value: note || (isSuccess ? 'Hợp lệ' : 'Sai mã/Hết hạn'), inline: true }
        ]
      };

      await fetch(AUTH_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'TPlus License Activity',
          avatar_url: 'https://cdn-icons-png.flaticon.com/512/3064/3064197.png',
          embeds: [embed]
        })
      });
    } catch (e) { }
  }

  // ==========================================
  // XÁC THỰC MÃ KÍCH HOẠT (KHÔNG CACHE)
  // ==========================================
  async function checkServerAccessCode(userCode, isSilent = false) {
    const rawCode = (userCode || '').trim();
    if (!rawCode) {
      isCodeVerified = false;
      await chrome.storage.local.set({ isCodeVerified: false });
      updateAuthUI(false, 'Chưa nhập mã kích hoạt');
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      // Thêm query timestamp ?t= và cache: 'no-store' để luôn lấy mã mới nhất 100% từ Firebase
      const res = await fetch(`${FIREBASE_DB_URL}/auth/access_code.json?t=${Date.now()}`, {
        signal: controller.signal,
        cache: 'no-store'
      }).then(r => r.json()).catch(() => null);
      clearTimeout(timeoutId);

      if (!res || !res.code) {
        isCodeVerified = false;
        await chrome.storage.local.set({ isCodeVerified: false });
        updateAuthUI(false, 'Hệ thống chưa thiết lập mã kích hoạt từ Admin');
        return false;
      }

      const serverCode = String(res.code).trim();
      const isValid = (rawCode === serverCode);

      if (isValid) {
        await chrome.storage.local.set({ accessCode: rawCode, isCodeVerified: true });
        isCodeVerified = true;
        updateAuthUI(true, `Mã hợp lệ (${res.note || 'Đang có hiệu lực'})`);
        return true;
      } else {
        await chrome.storage.local.set({ isCodeVerified: false });
        isCodeVerified = false;
        updateAuthUI(false, 'Mã không đúng hoặc đã hết hạn');
        // Nếu mã sai thì tự động tắt toggleEnabled ngay lập tức
        if (toggleEnabled.checked) {
          toggleEnabled.checked = false;
          await chrome.runtime.sendMessage({ action: 'TOGGLE_ENABLED', enabled: false });
        }
        return false;
      }
    } catch (e) {
      if (!isSilent) updateAuthUI(false, 'Lỗi kết nối kiểm tra mã');
      return false;
    }
  }

  function updateAuthUI(isValid, msgText = '') {
    if (!authBadge || !authMsg) return;

    if (isValid) {
      authBadge.className = 'auth-badge verified';
      authBadge.textContent = '🟢 Đã kích hoạt';
      authMsg.className = 'auth-msg success';
      authMsg.style.display = 'block';
      authMsg.textContent = `✓ ${msgText}`;
    } else {
      authBadge.className = 'auth-badge unverified';
      authBadge.textContent = '🔒 Chưa kích hoạt';
      authMsg.className = 'auth-msg error';
      authMsg.style.display = 'block';
      authMsg.textContent = `⚠️ ${msgText}`;
    }
  }

  // ==========================================
  // 1. LOAD INITIAL STATE
  // ==========================================
  async function loadState() {
    const config = await chrome.storage.local.get([
      'enabled',
      'intervalMinutes',
      'autoStartTime',
      'autoEndTime',
      'fromDate',
      'deviceName',
      'email',
      'password',
      'blockedPhones',
      'showWidget',
      'isLoopRunning',
      'isLoopPaused',
      'nextRunTime',
      'logs',
      'selectedProjects',
      'isBotOnline',
      'accessCode',
      'isCodeVerified'
    ]);

    // Load access code
    if (config.accessCode) {
      inputAccessCode.value = config.accessCode;
      await checkServerAccessCode(config.accessCode, true);
    } else {
      isCodeVerified = false;
      updateAuthUI(false, 'Chưa nhập mã kích hoạt');
    }

    const isBotOnline = await checkRealtimeBotStatus();
    const isAutoEnabled = !!(config.enabled && isCodeVerified && isBotOnline);

    if (config.enabled && !isAutoEnabled) {
      await chrome.storage.local.set({ enabled: false });
      await chrome.runtime.sendMessage({ action: 'TOGGLE_ENABLED', enabled: false });
    }

    toggleEnabled.checked = isAutoEnabled;
    updateStatusUI(isAutoEnabled, config.isLoopRunning, config.isLoopPaused);
    updateBotStatusUI(isBotOnline);

    const interval = config.intervalMinutes || 60;
    inputInterval.value = interval;
    updatePresetButtons(interval);

    initTimeSelects();
    const startVal = config.autoStartTime || '00:00';
    const endVal = config.autoEndTime || '23:59';
    inputStartTime.value = startVal;
    inputEndTime.value = endVal;

    const [sH = '00', sM = '00'] = startVal.split(':');
    const [eH = '23', eM = '59'] = endVal.split(':');
    if (selectStartHour) selectStartHour.value = sH.padStart(2, '0');
    if (selectStartMin) selectStartMin.value = sM.padStart(2, '0');
    if (selectEndHour) selectEndHour.value = eH.padStart(2, '0');
    if (selectEndMin) selectEndMin.value = eM.padStart(2, '0');

    const isAutoToday = config.autoTodayDate !== false;
    if (checkAutoToday) checkAutoToday.checked = isAutoToday;

    if (isAutoToday) {
      inputFromDate.value = getTodayDateStr();
    } else {
      inputFromDate.value = config.fromDate || getTodayDateStr();
    }
    if (inputDeviceName) {
      inputDeviceName.value = config.deviceName || (config.email ? config.email.split('@')[0] : 'Máy 1');
    }
    inputEmail.value = config.email || '';
    inputPassword.value = config.password || '';

    // Parse blocked phone list
    if (config.blockedPhones) {
      blockedPhoneList = config.blockedPhones
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('#'));
    } else {
      blockedPhoneList = [];
    }
    renderBlockedPhones();

    checkShowWidget.checked = config.showWidget !== false;

    // Project selection
    const selectedProjects = config.selectedProjects || ['biasg-2025-rcp5', 'bia333-spring-25'];
    document.querySelectorAll('.proj-checkbox').forEach(cb => {
      cb.checked = selectedProjects.includes(cb.value);
    });

    renderLogs(config.logs || []);
    startCountdown(toggleEnabled.checked, config.nextRunTime, config.isLoopRunning, config.isLoopPaused);
  }

  function renderBlockedPhones() {
    if (!blockedPhonesTags) return;

    if (blockedPhonesCount) {
      blockedPhonesCount.textContent = `(${blockedPhoneList.length} số)`;
    }

    if (blockedPhoneList.length === 0) {
      blockedPhonesTags.innerHTML = '<div class="blocked-phones-empty">Chưa có số nào trong danh sách chặn</div>';
      return;
    }

    blockedPhonesTags.innerHTML = blockedPhoneList.map(phone => {
      return `
        <div class="phone-tag">
          <span>${escapeHtml(phone)}</span>
          <button type="button" class="btn-remove-tag" data-phone="${escapeHtml(phone)}" title="Xóa số ${escapeHtml(phone)}">×</button>
        </div>
      `;
    }).join('');

    blockedPhonesTags.querySelectorAll('.btn-remove-tag').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const phoneToRemove = e.currentTarget.getAttribute('data-phone');
        blockedPhoneList = blockedPhoneList.filter(p => p !== phoneToRemove);
        await saveBlockedPhones();
        renderBlockedPhones();
      });
    });
  }

  async function saveBlockedPhones() {
    const blockedPhonesStr = blockedPhoneList.join('\n');
    await chrome.storage.local.set({ blockedPhones: blockedPhonesStr });
  }

  async function addPhoneFromInput() {
    if (!inputPhoneEntry) return;
    const rawVal = inputPhoneEntry.value.trim();
    if (!rawVal) return;

    const newItems = rawVal.split(/[\n,;\s]+/).map(s => s.trim()).filter(s => s.length > 0);
    let addedCount = 0;

    for (const item of newItems) {
      if (!blockedPhoneList.includes(item)) {
        blockedPhoneList.push(item);
        addedCount++;
      }
    }

    inputPhoneEntry.value = '';
    if (addedCount > 0) {
      await saveBlockedPhones();
      renderBlockedPhones();
    }
    inputPhoneEntry.focus();
  }

  function updateStatusUI(enabled, isRunning = false, isPaused = false) {
    if (isPaused) {
      statusIndicator.className = 'status-indicator on';
      statusText.textContent = '⏸ ĐANG TẠM DỪNG VÒNG LẶP';
      btnRunNow.innerHTML = '<span class="btn-icon">▶</span> Tiếp tục vòng lặp';
      btnRunNow.className = 'btn btn-success';
      btnStopNow.style.display = 'block';
    } else if (isRunning) {
      statusIndicator.className = 'status-indicator on';
      statusText.textContent = '⏳ ĐANG THỰC HIỆN VÒNG LẶP...';
      btnRunNow.innerHTML = '<span class="btn-icon">⏸</span> Tạm Dừng Vòng Lặp';
      btnRunNow.className = 'btn btn-warning';
      btnStopNow.style.display = 'block';
    } else if (enabled) {
      statusIndicator.className = 'status-indicator on';
      statusText.textContent = 'Đang BẬT tự động hóa vòng lặp';
      btnRunNow.innerHTML = '<span class="btn-icon">⚡</span> Chạy toàn bộ vòng lặp ngay';
      btnRunNow.className = 'btn btn-primary';
      btnStopNow.style.display = 'none';
    } else {
      statusIndicator.className = 'status-indicator off';
      statusText.textContent = 'Đang TẮT tự động hóa';
      btnRunNow.innerHTML = '<span class="btn-icon">⚡</span> Chạy toàn bộ vòng lặp ngay';
      btnRunNow.className = 'btn btn-primary';
      btnStopNow.style.display = 'none';
    }
  }

  async function checkRealtimeBotStatus() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${FIREBASE_DB_URL}/bot_status.json?t=${Date.now()}`, { 
        signal: controller.signal,
        cache: 'no-store'
      }).then(r => r.json()).catch(() => null);
      clearTimeout(timeoutId);

      const now = Date.now();
      const isOnline = !!(res && res.online && (now - (res.lastActive || 0) < 15000));
      updateBotStatusUI(isOnline);
      await chrome.storage.local.set({ isBotOnline: isOnline });

      // Nếu Bot bị tắt thì tự động khóa toggle Auto ngay lập tức
      if (!isOnline && toggleEnabled.checked) {
        toggleEnabled.checked = false;
        await chrome.runtime.sendMessage({ action: 'TOGGLE_ENABLED', enabled: false });
        const { isLoopRunning = false, isLoopPaused = false } = await chrome.storage.local.get(['isLoopRunning', 'isLoopPaused']);
        updateStatusUI(false, isLoopRunning, isLoopPaused);
      }
      return isOnline;
    } catch (e) {
      updateBotStatusUI(false);
      return false;
    }
  }

  function updateBotStatusUI(isOnline) {
    const card = document.getElementById('bot-status-card');
    const dot = document.getElementById('bot-status-dot');
    const badge = document.getElementById('bot-status-badge');
    const reminder = document.getElementById('bot-reminder-msg');

    if (!card || !dot || !badge || !reminder) return;

    if (isOnline) {
      card.className = 'card bot-status-card online';
      dot.className = 'bot-status-dot online';
      badge.className = 'bot-status-badge online';
      badge.textContent = '🟢 Đang Online';
      reminder.style.display = 'none';
    } else {
      card.className = 'card bot-status-card offline';
      dot.className = 'bot-status-dot offline';
      badge.className = 'bot-status-badge offline';
      badge.textContent = '🔴 Chưa bật';
      reminder.style.display = 'block';
    }
  }

  function updatePresetButtons(val) {
    presetButtons.forEach(btn => {
      if (Number(btn.dataset.min) === Number(val)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  let timeSelectsInitialized = false;
  function initTimeSelects() {
    if (timeSelectsInitialized) return;
    timeSelectsInitialized = true;

    const populate = (selectEl, max) => {
      if (!selectEl) return;
      selectEl.innerHTML = '';
      for (let i = 0; i <= max; i++) {
        const val = String(i).padStart(2, '0');
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        selectEl.appendChild(opt);
      }
    };

    populate(selectStartHour, 23);
    populate(selectStartMin, 59);
    populate(selectEndHour, 23);
    populate(selectEndMin, 59);

    const updateStartHidden = () => {
      if (inputStartTime && selectStartHour && selectStartMin) {
        inputStartTime.value = `${selectStartHour.value}:${selectStartMin.value}`;
      }
    };
    const updateEndHidden = () => {
      if (inputEndTime && selectEndHour && selectEndMin) {
        inputEndTime.value = `${selectEndHour.value}:${selectEndMin.value}`;
      }
    };

    if (selectStartHour) selectStartHour.addEventListener('change', updateStartHidden);
    if (selectStartMin) selectStartMin.addEventListener('change', updateStartHidden);
    if (selectEndHour) selectEndHour.addEventListener('change', updateEndHidden);
    if (selectEndMin) selectEndMin.addEventListener('change', updateEndHidden);
  }

  function renderLogs(logs) {
    if (!logs || logs.length === 0) {
      logsContainer.innerHTML = '<div class="log-empty">Chưa có lịch sử hoạt động</div>';
      return;
    }

    logsContainer.innerHTML = logs.map(item => {
      const typeClass = item.type || 'info';
      const icon = typeClass === 'success' ? '✅' : typeClass === 'error' ? '❌' : '⚠️';
      const tabBadge = item.tab ? `[${item.tab}]` : '';
      return `
        <div class="log-item ${typeClass}">
          <span class="log-time">${item.displayTime || ''}</span>
          <strong>${icon} ${tabBadge}</strong> ${escapeHtml(item.text || item.message || '')}
        </div>
      `;
    }).join('');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function startCountdown(enabled, nextRunTime, isRunning = false, isPaused = false) {
    if (countdownInterval) clearInterval(countdownInterval);

    const updateTimer = () => {
      if (isPaused) {
        countdownTimer.textContent = 'TẠM DỪNG';
        countdownTimer.style.color = '#f59e0b';
        return;
      }

      if (isRunning) {
        countdownTimer.textContent = 'ĐANG CHẠY...';
        countdownTimer.style.color = '#3b82f6';
        return;
      }

      if (!enabled) {
        countdownTimer.textContent = 'ĐANG TẮT';
        countdownTimer.style.color = 'var(--text-muted)';
        return;
      }

      if (!nextRunTime) {
        countdownTimer.textContent = 'CHỜ LÊN LỊCH';
        countdownTimer.style.color = 'var(--warning)';
        return;
      }

      const diffMs = nextRunTime - Date.now();
      if (diffMs <= 0) {
        countdownTimer.textContent = 'ĐẾN GIỜ CHẠY...';
        countdownTimer.style.color = 'var(--success)';
        return;
      }

      const totalSec = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSec / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;

      countdownTimer.style.color = 'var(--primary)';
      if (hours > 0) {
        countdownTimer.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      } else {
        countdownTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
    };

    updateTimer();
    countdownInterval = setInterval(updateTimer, 1000);
  }

  // ==========================================
  // 2. EVENT LISTENERS
  // ==========================================

  // Bấm nút Xác nhận mã kích hoạt
  btnVerifyCode.addEventListener('click', async () => {
    const code = inputAccessCode.value.trim();
    if (!code) {
      updateAuthUI(false, 'Vui lòng nhập mã kích hoạt');
      return;
    }

    btnVerifyCode.disabled = true;
    btnVerifyCode.textContent = 'Đang kiểm tra...';

    const isValid = await checkServerAccessCode(code);
    await sendAuthWebhook(isValid, code);

    btnVerifyCode.disabled = false;
    btnVerifyCode.textContent = 'Kích hoạt';
  });

  inputAccessCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnVerifyCode.click();
    }
  });

  toggleEnabled.addEventListener('change', async () => {
    // Kiểm tra mã trước khi cho phép bật
    if (toggleEnabled.checked && !isCodeVerified) {
      toggleEnabled.checked = false;
      inputAccessCode.focus();
      updateAuthUI(false, 'Cần nhập đúng mã kích hoạt để Bật Auto!');
      return;
    }

    if (toggleEnabled.checked) {
      const isBotOnline = await checkRealtimeBotStatus();
      if (!isBotOnline) {
        toggleEnabled.checked = false;
        alert('⚠️ Bot Discord chưa được bật (Offline)! Vui lòng bật Bot Discord trước khi bật Tự động hóa.');
        const { isLoopRunning = false, isLoopPaused = false } = await chrome.storage.local.get(['isLoopRunning', 'isLoopPaused']);
        updateStatusUI(false, isLoopRunning, isLoopPaused);
        return;
      }
    }

    const enabled = toggleEnabled.checked;
    const { isLoopRunning = false, isLoopPaused = false } = await chrome.storage.local.get(['isLoopRunning', 'isLoopPaused']);
    updateStatusUI(enabled, isLoopRunning, isLoopPaused);

    await chrome.runtime.sendMessage({
      action: 'TOGGLE_ENABLED',
      enabled: enabled
    });

    const config = await chrome.storage.local.get(['nextRunTime']);
    startCountdown(enabled, config.nextRunTime, isLoopRunning, isLoopPaused);
  });

  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const min = btn.dataset.min;
      inputInterval.value = min;
      updatePresetButtons(min);
    });
  });

  inputInterval.addEventListener('input', () => {
    updatePresetButtons(inputInterval.value);
  });

  if (btnSetToday) {
    btnSetToday.addEventListener('click', () => {
      inputFromDate.value = getTodayDateStr();
      if (checkAutoToday) checkAutoToday.checked = true;
    });
  }

  if (inputFromDate) {
    inputFromDate.addEventListener('change', () => {
      if (inputFromDate.value !== getTodayDateStr()) {
        if (checkAutoToday) checkAutoToday.checked = false;
      }
    });
  }

  if (checkAutoToday) {
    checkAutoToday.addEventListener('change', () => {
      if (checkAutoToday.checked) {
        inputFromDate.value = getTodayDateStr();
      }
    });
  }

  if (inputPhoneEntry) {
    inputPhoneEntry.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addPhoneFromInput();
      }
    });
  }

  if (btnAddPhone) {
    btnAddPhone.addEventListener('click', () => {
      addPhoneFromInput();
    });
  }

  btnSaveConfig.addEventListener('click', async () => {
    let interval = parseInt(inputInterval.value, 10);
    if (isNaN(interval) || interval < 1) {
      interval = 60;
      inputInterval.value = 60;
    }

    const autoStartTime = (selectStartHour && selectStartMin)
      ? `${selectStartHour.value}:${selectStartMin.value}`
      : (inputStartTime.value.trim() || '00:00');
    const autoEndTime = (selectEndHour && selectEndMin)
      ? `${selectEndHour.value}:${selectEndMin.value}`
      : (inputEndTime.value.trim() || '23:59');

    const autoTodayDate = checkAutoToday ? checkAutoToday.checked : true;
    const fromDate = autoTodayDate ? getTodayDateStr() : (inputFromDate.value.trim() || getTodayDateStr());

    const deviceName = inputDeviceName ? inputDeviceName.value.trim() : '';
    const email = inputEmail.value.trim();
    const password = inputPassword.value.trim();
    const blockedPhones = blockedPhoneList.join('\n');
    const showWidget = checkShowWidget.checked;
    const accessCode = inputAccessCode.value.trim();

    const selectedProjects = Array.from(document.querySelectorAll('.proj-checkbox:checked')).map(cb => cb.value);

    btnSaveConfig.textContent = 'Đang lưu...';
    btnSaveConfig.disabled = true;

    await chrome.runtime.sendMessage({
      action: 'UPDATE_CONFIG',
      intervalMinutes: interval,
      autoStartTime: autoStartTime,
      autoEndTime: autoEndTime,
      autoTodayDate: autoTodayDate,
      fromDate: fromDate,
      deviceName: deviceName || email,
      email: email,
      password: password,
      blockedPhones: blockedPhones,
      showWidget: showWidget,
      selectedProjects: selectedProjects,
      accessCode: accessCode
    });

    // Kiểm tra xem có đang nằm trong khung giờ không
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const parseTime = (timeStr) => {
      const parts = timeStr.split(':');
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    };
    const startMins = parseTime(autoStartTime);
    const endMins = parseTime(autoEndTime);
    let isWithinTimeframe = false;
    if (startMins <= endMins) {
      isWithinTimeframe = currentMinutes >= startMins && currentMinutes <= endMins;
    } else {
      isWithinTimeframe = currentMinutes >= startMins || currentMinutes <= endMins;
    }

    if (!isWithinTimeframe && toggleEnabled.checked) {
      if (toggleEnabled.checked) updateStatusUI(true, false, false);
      chrome.runtime.sendMessage({ 
        action: 'ADD_LOG', 
        entry: { type: 'warning', text: `⏸ Đã lưu cấu hình. Đang ngoài khung giờ (${autoStartTime} - ${autoEndTime}). Vòng lặp sẽ chạy khi đến khung giờ.` }
      });
    }

    const { enabled, nextRunTime, isLoopRunning = false, isLoopPaused = false } = await chrome.storage.local.get(['enabled', 'nextRunTime', 'isLoopRunning', 'isLoopPaused']);
    startCountdown(enabled, nextRunTime, isLoopRunning, isLoopPaused);

    btnSaveConfig.textContent = '✓ Đã lưu thành công!';
    setTimeout(() => {
      btnSaveConfig.textContent = 'Lưu cấu hình';
      btnSaveConfig.disabled = false;
    }, 1200);
  });

  btnRunNow.addEventListener('click', async () => {
    // Kiểm tra mã trước khi cho phép chạy
    if (!isCodeVerified) {
      inputAccessCode.focus();
      updateAuthUI(false, 'Cần nhập đúng mã kích hoạt để Chạy Vòng Lặp!');
      return;
    }

    const isBotOnline = await checkRealtimeBotStatus();
    if (!isBotOnline) {
      alert('⚠️ Bot Discord chưa được bật (Offline)! Vui lòng bật Bot Discord trước khi chạy vòng lặp.');
      return;
    }

    const { isLoopRunning = false, isLoopPaused = false } = await chrome.storage.local.get(['isLoopRunning', 'isLoopPaused']);

    if (isLoopPaused) {
      await chrome.runtime.sendMessage({ action: 'RESUME_LOOP' });
      updateStatusUI(toggleEnabled.checked, true, false);
    } else if (isLoopRunning) {
      await chrome.runtime.sendMessage({ action: 'PAUSE_LOOP' });
      updateStatusUI(toggleEnabled.checked, true, true);
    } else {
      updateStatusUI(toggleEnabled.checked, true, false);
      const response = await chrome.runtime.sendMessage({ action: 'RUN_NOW' });
      const { logs = [] } = await chrome.storage.local.get('logs');
      renderLogs(logs);
      updateStatusUI(toggleEnabled.checked, false, false);
    }
  });

  btnStopNow.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'STOP_LOOP' });
    updateStatusUI(toggleEnabled.checked, false, false);
  });

  btnClearLogs.addEventListener('click', async () => {
    if (confirm('Bạn có chắc muốn xóa toàn bộ lịch sử log không?')) {
      await chrome.runtime.sendMessage({ action: 'CLEAR_LOGS' });
      renderLogs([]);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.logs) {
        renderLogs(changes.logs.newValue || []);
      }
      if (changes.isLoopRunning !== undefined || changes.isLoopPaused !== undefined) {
        chrome.storage.local.get(['enabled', 'isLoopRunning', 'isLoopPaused']).then(({ enabled, isLoopRunning = false, isLoopPaused = false }) => {
          updateStatusUI(!!enabled, isLoopRunning, isLoopPaused);
        });
      }
      if (changes.enabled) {
        const isAuto = !!(changes.enabled.newValue && isCodeVerified);
        toggleEnabled.checked = isAuto;
        chrome.storage.local.get(['isLoopRunning', 'isLoopPaused', 'nextRunTime']).then(({ isLoopRunning, isLoopPaused, nextRunTime }) => {
          updateStatusUI(isAuto, !!isLoopRunning, !!isLoopPaused);
          startCountdown(isAuto, nextRunTime, !!isLoopRunning, !!isLoopPaused);
        });
      }
      if (changes.showWidget !== undefined) {
        checkShowWidget.checked = changes.showWidget.newValue;
      }
      if (changes.blockedPhones !== undefined) {
        const val = changes.blockedPhones.newValue || '';
        blockedPhoneList = val ? val.split('\n').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('#')) : [];
        renderBlockedPhones();
      }
      if (changes.isBotOnline !== undefined) {
        updateBotStatusUI(changes.isBotOnline.newValue);
      }
      if (changes.nextRunTime) {
        (async () => {
          const { enabled, isLoopRunning, isLoopPaused } = await chrome.storage.local.get(['enabled', 'isLoopRunning', 'isLoopPaused']);
          startCountdown(enabled, changes.nextRunTime.newValue, !!isLoopRunning, !!isLoopPaused);
        })();
      }
    }
  });

  await loadState();
  checkRealtimeBotStatus();
  setInterval(checkRealtimeBotStatus, 2000);
});
