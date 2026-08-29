/**
 * TPlus Topup Auto-Checker - Popup Script
 * Hỗ trợ chuyển đổi nút Chạy / Tạm Dừng / Tiếp tục / Dừng hẳn và chỉnh From Date
 */

document.addEventListener('DOMContentLoaded', async () => {
  const toggleEnabled = document.getElementById('toggle-enabled');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const countdownTimer = document.getElementById('countdown-timer');
  const btnRunNow = document.getElementById('btn-run-now');

  const inputInterval = document.getElementById('input-interval');
  const presetButtons = document.querySelectorAll('.btn-preset');
  const inputFromDate = document.getElementById('input-from-date');
  const inputDeviceName = document.getElementById('input-device-name');
  const inputEmail = document.getElementById('input-email');
  const inputPassword = document.getElementById('input-password');

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

  // ==========================================
  // 1. LOAD INITIAL STATE
  // ==========================================
  async function loadState() {
    const config = await chrome.storage.local.get([
      'enabled',
      'intervalMinutes',
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
      'isBotOnline'
    ]);

    toggleEnabled.checked = config.enabled !== false;
    updateStatusUI(toggleEnabled.checked, config.isLoopRunning, config.isLoopPaused);
    updateBotStatusUI(config.isBotOnline);

    const interval = config.intervalMinutes || 60;
    inputInterval.value = interval;
    updatePresetButtons(interval);

    inputFromDate.value = config.fromDate || '2026-08-15';
    if (inputDeviceName) {
      inputDeviceName.value = config.deviceName || (config.email ? config.email.split('@')[0] : 'Máy 1');
    }
    inputEmail.value = config.email || 'thanhquang.le@t-plus.vn';
    inputPassword.value = config.password || '@Luom0102';

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

    // Attach click event for remove buttons
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

    // Support multiple numbers pasted at once (split by comma, space, semicolon, newline)
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
  const btnStopNow = document.getElementById('btn-stop-now');

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

  const FIREBASE_DB_URL = 'https://fir-run-extension-t-plus-default-rtdb.asia-southeast1.firebasedatabase.app';

  async function checkRealtimeBotStatus() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${FIREBASE_DB_URL}/bot_status.json`, { signal: controller.signal }).then(r => r.json()).catch(() => null);
      clearTimeout(timeoutId);

      const now = Date.now();
      const isOnline = !!(res && res.online && (now - (res.lastActive || 0) < 10000));
      updateBotStatusUI(isOnline);
      await chrome.storage.local.set({ isBotOnline: isOnline });
    } catch (e) {
      updateBotStatusUI(false);
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
          <strong>${icon} ${tabBadge}</strong> ${escapeHtml(item.message || '')}
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

  toggleEnabled.addEventListener('change', async () => {
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

  // Add phone on Enter key or button click
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

    const fromDate = inputFromDate.value.trim() || '2026-08-15';
    const deviceName = inputDeviceName ? inputDeviceName.value.trim() : '';
    const email = inputEmail.value.trim();
    const password = inputPassword.value.trim();
    const blockedPhones = blockedPhoneList.join('\n');
    const showWidget = checkShowWidget.checked;

    const selectedProjects = Array.from(document.querySelectorAll('.proj-checkbox:checked')).map(cb => cb.value);

    btnSaveConfig.textContent = 'Đang lưu...';
    btnSaveConfig.disabled = true;

    await chrome.runtime.sendMessage({
      action: 'UPDATE_CONFIG',
      intervalMinutes: interval,
      fromDate: fromDate,
      deviceName: deviceName || email,
      email: email,
      password: password,
      blockedPhones: blockedPhones,
      showWidget: showWidget,
      selectedProjects: selectedProjects
    });

    const { enabled, nextRunTime, isLoopRunning = false, isLoopPaused = false } = await chrome.storage.local.get(['enabled', 'nextRunTime', 'isLoopRunning', 'isLoopPaused']);
    startCountdown(enabled, nextRunTime, isLoopRunning, isLoopPaused);

    btnSaveConfig.textContent = '✓ Đã lưu thành công!';
    setTimeout(() => {
      btnSaveConfig.textContent = 'Lưu cấu hình';
      btnSaveConfig.disabled = false;
    }, 1200);
  });

  btnRunNow.addEventListener('click', async () => {
    const { isLoopRunning = false, isLoopPaused = false } = await chrome.storage.local.get(['isLoopRunning', 'isLoopPaused']);

    if (isLoopPaused) {
      // Tiếp tục
      await chrome.runtime.sendMessage({ action: 'RESUME_LOOP' });
      updateStatusUI(toggleEnabled.checked, true, false);
    } else if (isLoopRunning) {
      // Tạm dừng
      await chrome.runtime.sendMessage({ action: 'PAUSE_LOOP' });
      updateStatusUI(toggleEnabled.checked, true, true);
    } else {
      // Chạy mới
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
          updateStatusUI(enabled !== false, isLoopRunning, isLoopPaused);
        });
      }
      if (changes.enabled) {
        toggleEnabled.checked = changes.enabled.newValue;
        chrome.storage.local.get(['isLoopRunning', 'isLoopPaused']).then(({ isLoopRunning, isLoopPaused }) => {
          updateStatusUI(changes.enabled.newValue, !!isLoopRunning, !!isLoopPaused);
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
