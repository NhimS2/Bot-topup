/**
 * TPlus Topup Auto-Checker - Service Worker (Manifest V3)
 * Điều phối luồng chạy nhịp nhàng, có độ trễ hợp lý giữa các bước và dự án
 */

globalThis.addEventListener('unhandledrejection', (event) => {
  console.warn('[TPlus Auto Background] Unhandled rejection:', event.reason);
  event.preventDefault();
});

const ALARM_NAME = 'tplus_auto_check_alarm';
const TARGET_URL_PATTERN = 'https://ttw-int.t-plus.vn/*';
const HOME_URL = 'https://ttw-int.t-plus.vn/';

const PROJECTS = [
  {
    name: 'Beer SG 2026 RCP5',
    slug: 'biasg-2025-rcp5',
    processingUrl: 'https://ttw-int.t-plus.vn/biasg-2025-rcp5/lixi/processing',
    failUrl: 'https://ttw-int.t-plus.vn/biasg-2025-rcp5/lixi/fail'
  },
  {
    name: 'Beer 333 Spring 2025',
    slug: 'bia333-spring-25',
    processingUrl: 'https://ttw-int.t-plus.vn/bia333-spring-25/lixi/processing',
    failUrl: 'https://ttw-int.t-plus.vn/bia333-spring-25/lixi/fail'
  }
];

const FIREBASE_DB_URL = 'https://fir-run-extension-t-plus-default-rtdb.asia-southeast1.firebasedatabase.app';

const DEFAULT_CONFIG = {
  enabled: true,
  intervalMinutes: 60,
  autoLogin: true,
  email: 'thanhquang.le@t-plus.vn',
  password: '@Luom0102',
  fromDate: '2026-08-15',
  blockedPhones: '',
  showWidget: true,
  deviceId: '',
  deviceName: 'Máy 1 (Nhật)',
  enableCloudControl: true,
  isLoopRunning: false,
  isLoopPaused: false,
  lastRunTime: null,
  nextRunTime: null,
  logs: [],
  widgetLogs: [],
  selectedProjects: ['biasg-2025-rcp5', 'bia333-spring-25'],
  isBotOnline: false
};

let isLoopCancelled = false;
let isLoopPaused = false;
let pauseResolver = null;
let lastProcessedCommandTime = 0;
let currentRunningStep = 'Sẵn sàng';

async function checkPauseAndCancel() {
  if (isLoopCancelled) {
    throw new Error('Đã dừng vòng lặp theo yêu cầu.');
  }

  while (isLoopPaused) {
    await new Promise((resolve) => {
      pauseResolver = resolve;
    });
  }

  if (isLoopCancelled) {
    throw new Error('Đã dừng vòng lặp theo yêu cầu.');
  }
}

const sleep = async (ms) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    await checkPauseAndCancel();
    const remaining = ms - (Date.now() - start);
    const chunk = Math.min(remaining, 100);
    if (chunk <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, chunk));
    await checkPauseAndCancel();
  }
};

const DISCORD_WEBHOOK_URL = 'https://discordapp.com/api/webhooks/1428196372506607678/8rvJQFih4eFnxHvBIgx-HRpWg5LYfJwW2HdoPltNTx_z-hKl5xiykt6HGlXjcnGw84Jw';
const DISCORD_WEBHOOK_URGENT_URL = 'https://discordapp.com/api/webhooks/1540775585184354427/fZED8wVYFK76uzXVGorNqDAVHtSznyVwlRZgrlGSEKgOtNLNZKoACJ6yVZd1o42Bx1yt';

async function sendDiscordWebhook(tabId, projectName, tabName, recordsCount) {
  try {
    if (recordsCount <= 0) return; // Chỉ gửi thông báo khi có bản ghi (Displaying...)

    // Tạo timeout 10 giây để tránh trường hợp fetch bị treo vĩnh viễn
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    // 1. Gửi webhook thường (không tag)
    const message = `**${projectName}** - ${tabName} - ${recordsCount} records`;
    try {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message }),
        signal: controller.signal
      });
      console.log('[TPlus Auto] Đã gửi Discord Webhook:', message);
      if (tabId) await sendLogToWidget(tabId, `🔔 Đã bắn thông báo sang Discord: ${recordsCount} records`, 'success');
    } catch (e) {
      console.warn('[TPlus Auto] Webhook 1 failed or timeout:', e.message);
      if (tabId) await sendLogToWidget(tabId, `⚠️ Lỗi gửi Webhook Discord: ${e.message}`, 'error');
    }

    // 2. Nếu >= 100 records thì gửi webhook khẩn cấp (có tag @everyone)
    if (recordsCount >= 100) {
      const urgentMessage = `@everyone 🔔 **${projectName}** - ${tabName} - ${recordsCount} records`;
      try {
        await fetch(DISCORD_WEBHOOK_URGENT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: urgentMessage }),
          signal: controller.signal
        });
        console.log('[TPlus Auto] Đã gửi Discord Webhook KHẨN CẤP:', urgentMessage);
        if (tabId) await sendLogToWidget(tabId, `🚨 Đã réo tên @everyone vì phát hiện ${recordsCount} records!`, 'error');
      } catch (e) {
        console.warn('[TPlus Auto] Webhook 2 failed or timeout:', e.message);
      }
    }

    clearTimeout(timeoutId);
  } catch (error) {
    console.warn('[TPlus Auto] Lỗi tổng khi gửi Discord Webhook:', error);
  }
}

async function getOrCreateDeviceId() {
  let { deviceId, deviceName, email } = await chrome.storage.local.get(['deviceId', 'deviceName', 'email']);

  // Nếu máy này chưa có ID, tạo 1 ID duy nhất và lưu cố định vào bộ nhớ máy này
  if (!deviceId) {
    const randomHex = Math.random().toString(36).substring(2, 8);
    const safeName = (deviceName || email || 'device').toLowerCase().replace(/[^a-z0-9]/g, '_');
    deviceId = `dev_${safeName}_${randomHex}`;
    await chrome.storage.local.set({ deviceId });
  }

  deviceName = deviceName || (email ? email.split('@')[0] : 'Máy 1');
  return { deviceId, deviceName };
}

async function sendFirebaseHeartbeat(stepText = '') {
  try {
    const { deviceId, deviceName } = await getOrCreateDeviceId();
    const config = await chrome.storage.local.get([
      'enabled',
      'isLoopRunning',
      'isLoopPaused',
      'fromDate',
      'intervalMinutes',
      'email',
      'enableCloudControl'
    ]);

    if (config.enableCloudControl === false) return;

    if (stepText) {
      currentRunningStep = stepText;
    }

    let status = 'idle';
    if (config.isLoopPaused) status = 'paused';
    else if (config.isLoopRunning) status = 'running';
    else if (config.enabled === false) status = 'disabled';

    const payload = {
      deviceId,
      deviceName: deviceName || config.email || deviceId,
      email: config.email || '',
      status,
      currentStep: currentRunningStep,
      lastActive: Date.now(),
      lastActiveFormatted: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      fromDate: config.fromDate || '2026-08-15',
      intervalMinutes: config.intervalMinutes || 60
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    await fetch(`${FIREBASE_DB_URL}/devices/${deviceId}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
  } catch (e) { }
}

async function pollFirebaseCommands() {
  try {
    const { deviceId } = await getOrCreateDeviceId();
    const { enableCloudControl = true } = await chrome.storage.local.get('enableCloudControl');
    if (!enableCloudControl) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const [devRes, globalRes] = await Promise.all([
      fetch(`${FIREBASE_DB_URL}/commands/${deviceId}.json`, { signal: controller.signal }).then(r => r.json()).catch(() => null),
      fetch(`${FIREBASE_DB_URL}/commands/global.json`, { signal: controller.signal }).then(r => r.json()).catch(() => null)
    ]);

    clearTimeout(timeoutId);

    const targetCommand = (devRes && devRes.timestamp > (globalRes?.timestamp || 0)) ? devRes : (globalRes || devRes);

    if (!targetCommand || !targetCommand.action || !targetCommand.timestamp) return;

    if (targetCommand.timestamp <= lastProcessedCommandTime) {
      return;
    }

    lastProcessedCommandTime = targetCommand.timestamp;
    const action = targetCommand.action;
    console.log(`[TPlus Auto] 📡 Nhận lệnh từ Discord/Firebase: [${action}]`);

    if (action === 'PAUSE') {
      addLog({ type: 'warning', text: `📡 Nhận lệnh TẠM DỪNG từ Discord!` });
      await pauseLoop();
    } else if (action === 'RESUME') {
      addLog({ type: 'info', text: `📡 Nhận lệnh TIẾP TỤC từ Discord!` });
      await resumeLoop();
    } else if (action === 'STOP') {
      addLog({ type: 'error', text: `📡 Nhận lệnh DỪNG HẲN từ Discord!` });
      await stopLoop();
    } else if (action === 'RUN_NOW') {
      addLog({ type: 'success', text: `📡 Nhận lệnh CHẠY TẤT CẢ từ Discord!` });
      const { isLoopRunning = false, isLoopPaused = false } = await chrome.storage.local.get(['isLoopRunning', 'isLoopPaused']);
      if (isLoopPaused) {
        await resumeLoop();
      } else if (!isLoopRunning) {
        runFullMultiProjectLoop('discord');
      }
    }

    await sendFirebaseHeartbeat();
  } catch (e) { }
}

async function checkBotStatus() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${FIREBASE_DB_URL}/bot_status.json`, { signal: controller.signal }).then(r => r.json()).catch(() => null);
    clearTimeout(timeoutId);

    const now = Date.now();
    const isBotOnline = !!(res && res.online && (now - (res.lastActive || 0) < 20000));
    await chrome.storage.local.set({ isBotOnline });
    return isBotOnline;
  } catch (e) {
    return false;
  }
}

let syncInterval = null;
function startFirebaseSyncLoop() {
  if (syncInterval) clearInterval(syncInterval);
  sendFirebaseHeartbeat();
  checkBotStatus();
  syncInterval = setInterval(async () => {
    await pollFirebaseCommands();
    await sendFirebaseHeartbeat();
    await checkBotStatus();
  }, 3000);
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const current = await chrome.storage.local.get(Object.keys(DEFAULT_CONFIG));
    const newConfig = { ...DEFAULT_CONFIG, ...current, isLoopRunning: false, isLoopPaused: false, showWidget: true };
    await chrome.storage.local.set(newConfig);
    await updateBadge(newConfig.enabled);
    if (newConfig.enabled) {
      await setupAlarm(true, newConfig.intervalMinutes);
    }
    startFirebaseSyncLoop();
  } catch (err) {
    console.error('[TPlus Auto] onInstalled error:', err);
  }
});

// Khởi động sync loop ngay khi service worker thức dậy
startFirebaseSyncLoop();

async function updateBadge(enabled, running = false, paused = false) {
  try {
    if (paused) {
      await chrome.action.setBadgeText({ text: 'PAUSE' });
      await chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
    } else if (running) {
      await chrome.action.setBadgeText({ text: 'RUN' });
      await chrome.action.setBadgeBackgroundColor({ color: '#3B82F6' });
    } else if (enabled) {
      await chrome.action.setBadgeText({ text: 'ON' });
      await chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
    } else {
      await chrome.action.setBadgeText({ text: 'OFF' });
      await chrome.action.setBadgeBackgroundColor({ color: '#6B7280' });
    }
  } catch (err) {
    console.error('[TPlus Auto] updateBadge error:', err);
  }
}

async function setupAlarm(enabled, intervalMinutes) {
  try {
    await chrome.alarms.clear(ALARM_NAME);
    if (enabled && intervalMinutes > 0) {
      const period = Math.max(1, Number(intervalMinutes));
      await chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: period,
        periodInMinutes: period
      });
      const nextRunTime = Date.now() + period * 60 * 1000;
      await chrome.storage.local.set({ nextRunTime });
    } else {
      await chrome.storage.local.set({ nextRunTime: null });
    }
  } catch (err) {
    console.error('[TPlus Auto] setupAlarm error:', err);
  }
}

async function addLog(entry) {
  try {
    const { logs = [] } = await chrome.storage.local.get('logs');
    const newLog = {
      id: Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      displayTime: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      displayDate: new Date().toLocaleDateString('vi-VN'),
      ...entry
    };
    const updatedLogs = [newLog, ...logs].slice(0, 100);
    await chrome.storage.local.set({ logs: updatedLogs, lastRunTime: newLog.timestamp });
  } catch (err) {
    console.error('[TPlus Auto] addLog error:', err);
  }
}

async function sendLogToWidget(tabId, text, type = 'info') {
  try {
    await sendMessageToTab(tabId, { action: 'LOG_MESSAGE', text, type });
  } catch (e) { }
}

async function findOrCreateTargetTab() {
  try {
    const tabs = await chrome.tabs.query({ url: TARGET_URL_PATTERN });
    if (tabs && tabs.length > 0) {
      const tab = tabs.find(t => t.active) || tabs[0];
      await chrome.tabs.update(tab.id, { active: true });
      try {
        await chrome.windows.update(tab.windowId, { focused: true });
      } catch (e) { }
      return tab;
    }

    console.log('[TPlus Auto] Mở tab mới https://ttw-int.t-plus.vn/...');
    const newTab = await chrome.tabs.create({ url: HOME_URL, active: true });
    try {
      await chrome.windows.update(newTab.windowId, { focused: true });
    } catch (e) { }
    await waitForTabComplete(newTab.id);
    await sleep(3000);
    return newTab;
  } catch (err) {
    console.error('[TPlus Auto] findOrCreateTargetTab error:', err);
  }
  return null;
}

function waitForTabComplete(tabId, timeoutMs = 25000) {
  return new Promise((resolve) => {
    let timer;
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(true);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(false);
    }, timeoutMs);
  });
}

async function sendMessageToTab(tabId, messageData, maxRetries = 2) {
  const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ success: false, error: 'TIMEOUT' }), 15000));

  const sendMessagePromise = (async () => {
    try {
      const res = await chrome.tabs.sendMessage(tabId, messageData);
      return res || { success: true };
    } catch (err) {
      const msg = (err.message || '').toLowerCase();

      if (msg.includes('message channel closed') || msg.includes('asynchronous response') || msg.includes('channel closed')) {
        return { success: true, navigating: true };
      }

      if (msg.includes('receiving end does not exist') || msg.includes('could not establish connection')) {
        try {
          await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/content.css'] });
          await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] });
          await sleep(1000);
          const retryRes = await chrome.tabs.sendMessage(tabId, messageData);
          return retryRes || { success: true };
        } catch (injectErr) {
          const injectMsg = (injectErr.message || '').toLowerCase();
          if (injectMsg.includes('message channel closed') || injectMsg.includes('asynchronous response')) {
            return { success: true, navigating: true };
          }
          return { success: false, error: injectErr.message };
        }
      }

      return { success: false, error: err.message };
    }
  })();

  return Promise.race([timeoutPromise, sendMessagePromise]);
}

async function checkAndPerformLogin(tabId, config) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = (tab.url || '').toLowerCase();

    const loginCheck = await sendMessageToTab(tabId, { action: 'CHECK_IS_LOGIN_PAGE' });
    const isLogin = url.includes('/login') || (loginCheck && loginCheck.isLoginPage);

    if (isLogin) {
      await sendLogToWidget(tabId, `🔑 Phát hiện trang Login! Đang tự động đăng nhập...`, 'working');

      await sendMessageToTab(tabId, {
        action: 'DO_LOGIN',
        email: config.email || 'thanhquang.le@t-plus.vn',
        password: config.password || '@Luom0102'
      });

      await waitForTabComplete(tabId, 15000);
      await sleep(4000);

      const freshTab = await chrome.tabs.get(tabId);
      if ((freshTab.url || '').toLowerCase().includes('/login')) {
        await sendMessageToTab(tabId, {
          action: 'DO_LOGIN',
          email: config.email || 'thanhquang.le@t-plus.vn',
          password: config.password || '@Luom0102'
        });
        await waitForTabComplete(tabId, 15000);
        await sleep(3500);
      }

      await sendLogToWidget(tabId, `✅ Đăng nhập hoàn tất vào Dashboard.`, 'success');
      return true;
    }
  } catch (e) {
    console.warn('[TPlus Auto] checkAndPerformLogin warning:', e);
  }
  return false;
}

// ====================================================
// QUY TRÌNH VÒNG LẶP ĐA DỰ ÁN TOÀN DIỆN (CHẬM RÃI & CHÍNH XÁC)
// ====================================================
async function processTabMultiPage(tabId, proj, stepName, fromDate, config) {
  await sendLogToWidget(tabId, `Mở trang ${stepName}: ${stepName === 'processing' ? proj.processingUrl : proj.failUrl}`, 'working');
  await chrome.tabs.update(tabId, { url: stepName === 'processing' ? proj.processingUrl : proj.failUrl });
  await waitForTabComplete(tabId);
  await sleep(3000);

  const wasLogin = await checkAndPerformLogin(tabId, config);
  if (wasLogin) {
    await chrome.tabs.update(tabId, { url: stepName === 'processing' ? proj.processingUrl : proj.failUrl });
    await waitForTabComplete(tabId);
    await sleep(3000);
  }

  await checkPauseAndCancel();

  // Đổi ngày From & Bấm Search
  await sendMessageToTab(tabId, {
    action: 'SET_FROM_DATE_AND_SEARCH',
    fromDate: fromDate
  });
  await sendLogToWidget(tabId, `⏳ Đang chờ website tải bảng dữ liệu...`, 'working');
  await waitForTabComplete(tabId, 6000);
  await sleep(4000); // Nghỉ 4s để server nạp bảng dữ liệu

  await checkPauseAndCancel();

  // Lấy tổng số bản ghi (Thử tối đa 5 lần, mỗi lần cách nhau 2s để chờ DOM load)
  let totalRecords = 0;
  let domTotalPages = 1;
  for (let retry = 1; retry <= 5; retry++) {
    await sendLogToWidget(tabId, `🔎 Đang đếm số trang & bản ghi (Thử lần ${retry}/5)...`, 'working');
    let infoRes = await sendMessageToTab(tabId, { action: 'GET_RECORDS_INFO' });
    if (infoRes && infoRes.success && (infoRes.totalRecords > 0 || infoRes.totalPages > 1)) {
      totalRecords = infoRes.totalRecords || 0;
      domTotalPages = infoRes.totalPages || 1;
      await sendLogToWidget(tabId, `✅ Đã tìm thấy: ${totalRecords} bản ghi, ${domTotalPages} trang.`, 'success');
      break;
    }
    await sleep(2000);
  }

  // Gửi webhook trước
  await sendDiscordWebhook(tabId, proj.name, stepName === 'processing' ? 'Processing' : 'Fail', totalRecords);

  if (totalRecords <= 0 && domTotalPages <= 1) {
    await sendLogToWidget(tabId, `⏭️ Tab ${stepName.toUpperCase()} có 0 bản ghi ➔ Lướt qua.`, 'info');
    return 0;
  }

  const calcPages = Math.ceil(totalRecords / 100);
  const totalPages = Math.max(calcPages, domTotalPages);

  await sendLogToWidget(tabId, `📊 Chốt: Xử lý từ trang ${totalPages} lùi về trang 1.`, 'info');

  let totalProcessed = 0;

  for (let p = totalPages; p >= 1; p--) {
    await checkPauseAndCancel();

    if (totalPages > 1) {
      await sendLogToWidget(tabId, `🔄 Đang click chuyển sang trang ${p}/${totalPages}...`, 'working');
      await sendMessageToTab(tabId, { action: 'GO_TO_PAGE', page: p });
      await sendLogToWidget(tabId, `⏳ Chờ trang ${p} tải xong...`, 'working');
      await waitForTabComplete(tabId, 10000);
      await sleep(3500); // Chờ trang tải
    }

    await checkPauseAndCancel();

    // Xử lý bản ghi trên trang này
    await sendLogToWidget(tabId, `⚡ Bắt đầu click Retry/Check Trans trên trang ${p}...`, 'working');
    const actionRes = await sendMessageToTab(tabId, {
      action: 'EXECUTE_TOPUP_ACTION',
      step: stepName
    });
    totalProcessed += (actionRes?.records || 0);

    await sleep(3500); // Nghỉ một chút trước khi sang trang tiếp theo
  }

  return totalRecords;
}

async function runFullMultiProjectLoop(reason = 'scheduled') {
  isLoopCancelled = false;
  isLoopPaused = false;
  pauseResolver = null;

  await chrome.storage.local.set({ isLoopRunning: true, isLoopPaused: false });
  await updateBadge(true, true, false);

  console.log(`[TPlus Auto] 🚀 BẮT ĐẦU VÒNG LẶP TOÀN BỘ DỰ ÁN (Lý do: ${reason})`);

  const config = await chrome.storage.local.get([
    'enabled',
    'intervalMinutes',
    'autoLogin',
    'email',
    'password',
    'fromDate',
    'selectedProjects'
  ]);

  const fromDate = config.fromDate || '2026-08-15';

  if (reason === 'scheduled' && !config.enabled) {
    await chrome.storage.local.set({ isLoopRunning: false, isLoopPaused: false });
    await updateBadge(false);
    return { success: false, message: 'Đang tắt tự động hóa' };
  }

  try {
    // 1. Tìm hoặc mở Tab
    let tab = await findOrCreateTargetTab();
    if (!tab) throw new Error('Không thể mở tab ttw-int.t-plus.vn');
    const tabId = tab.id;

    await checkPauseAndCancel();

    await sendLogToWidget(tabId, `🚀 Bắt đầu vòng lặp tự động đa dự án!`, 'working');

    // 2. MỞ TRANG CHỦ & KIỂM TRA ĐĂNG NHẬP
    await chrome.tabs.update(tabId, { url: HOME_URL });
    await waitForTabComplete(tabId);
    await sleep(3000);

    await checkAndPerformLogin(tabId, config);

    await checkPauseAndCancel();

    let loopResults = [];

    // 3. DUYỆT TỪNG DỰ ÁN
    const activeProjects = (config.selectedProjects && config.selectedProjects.length > 0)
      ? PROJECTS.filter(p => config.selectedProjects.includes(p.slug))
      : PROJECTS;

    if (activeProjects.length === 0) {
      throw new Error('Chưa chọn dự án nào trong Cấu hình.');
    }

    for (let i = 0; i < activeProjects.length; i++) {
      await checkPauseAndCancel();

      const proj = activeProjects[i];
      await sendLogToWidget(tabId, `\n📁 [DỰ ÁN ${i + 1}/${activeProjects.length}]: ${proj.name}`, 'working');

      // ── BƯỚC 1: TAB PROCESSING ──
      const pRecords = await processTabMultiPage(tabId, proj, 'processing', fromDate, config);
      await sleep(3500); // Nghỉ 3.5s trước khi chuyển tab

      // ── BƯỚC 2: TAB FAIL ──
      const fRecords = await processTabMultiPage(tabId, proj, 'fail', fromDate, config);
      await sleep(3500); // Nghỉ 3.5s

      loopResults.push(`${proj.name} [Proc: ${pRecords} | Fail: ${fRecords}]`);

      await addLog({
        type: 'success',
        tab: proj.name,
        reason,
        records: pRecords + fRecords,
        message: `Hoàn tất (From: ${fromDate}): Processing (${pRecords} rec) & Fail (${fRecords} rec)`
      });
    }

    await checkPauseAndCancel();

    // ── BƯỚC CUỐI: TRỞ VỀ TRANG HOME ──
    await sendLogToWidget(tabId, `🏠 Hoàn thành vòng lặp! Trở về trang Home.`, 'success');
    await chrome.tabs.update(tabId, { url: HOME_URL });
    await waitForTabComplete(tabId);
    await sleep(2500);

    const summaryMsg = `Hoàn tất 1 vòng lặp: ` + loopResults.join(' ➔ ');
    console.log(`[TPlus Auto] 🎉 ${summaryMsg}`);

    if (config.enabled && config.intervalMinutes) {
      const nextRunTime = Date.now() + Number(config.intervalMinutes) * 60 * 1000;
      await chrome.storage.local.set({ nextRunTime });
    }

    await chrome.storage.local.set({ isLoopRunning: false, isLoopPaused: false });
    await updateBadge(config.enabled !== false, false, false);

    return { success: true, message: summaryMsg };
  } catch (error) {
    const errorMsg = `Lỗi vòng lặp: ${error.message || error}`;
    console.warn('[TPlus Auto]', errorMsg);

    await addLog({
      type: isLoopCancelled ? 'warning' : 'error',
      tab: 'VÒNG LẶP',
      reason,
      records: 0,
      message: errorMsg
    });

    await chrome.storage.local.set({ isLoopRunning: false, isLoopPaused: false });
    const { enabled } = await chrome.storage.local.get('enabled');
    await updateBadge(enabled !== false, false, false);

    return { success: false, message: errorMsg };
  }
}

async function pauseLoop() {
  console.log('[TPlus Auto] ⏸ TẠM DỪNG VÒNG LẶP');
  isLoopPaused = true;
  await chrome.storage.local.set({ isLoopPaused: true });
  await updateBadge(true, true, true);
  return { success: true, message: 'Đã tạm dừng vòng lặp' };
}

async function resumeLoop() {
  console.log('[TPlus Auto] ▶ TIẾP TỤC VÒNG LẶP');
  isLoopPaused = false;
  await chrome.storage.local.set({ isLoopPaused: false });
  await updateBadge(true, true, false);
  if (pauseResolver) {
    pauseResolver();
    pauseResolver = null;
  }
  return { success: true, message: 'Đã tiếp tục vòng lặp' };
}

async function stopLoop() {
  console.log('[TPlus Auto] 🛑 Nhận lệnh DỪNG VÒNG LẶP!');
  isLoopCancelled = true;
  isLoopPaused = false;
  if (pauseResolver) {
    pauseResolver();
    pauseResolver = null;
  }
  await chrome.storage.local.set({ isLoopRunning: false, isLoopPaused: false });
  const { enabled } = await chrome.storage.local.get('enabled');
  await updateBadge(enabled !== false, false, false);
  return { success: true, message: 'Đã dừng vòng lặp' };
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await runFullMultiProjectLoop('scheduled');
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.action === 'TOGGLE_ENABLED') {
        const { enabled } = request;
        const { intervalMinutes = 60 } = await chrome.storage.local.get('intervalMinutes');
        await chrome.storage.local.set({ enabled });
        await setupAlarm(enabled, intervalMinutes);
        await updateBadge(enabled);
        sendResponse({ success: true, enabled });
      }
      else if (request.action === 'UPDATE_CONFIG') {
        const { intervalMinutes, autoLogin, email, password, fromDate, blockedPhones, showWidget, selectedProjects, deviceName, enableCloudControl } = request;
        const { enabled } = await chrome.storage.local.get('enabled');
        await chrome.storage.local.set({
          intervalMinutes,
          autoLogin,
          email,
          password,
          fromDate,
          blockedPhones,
          showWidget,
          selectedProjects,
          deviceName: deviceName || email,
          enableCloudControl: enableCloudControl !== false
        });
        await setupAlarm(enabled, intervalMinutes);
        await sendFirebaseHeartbeat();
        sendResponse({ success: true });
      }
      else if (request.action === 'RUN_NOW') {
        const result = await runFullMultiProjectLoop('manual');
        sendResponse(result);
      }
      else if (request.action === 'TEST_DISCORD_WEBHOOK') {
        const tabId = sender.tab ? sender.tab.id : null;
        await sendDiscordWebhook(tabId, 'Beer SG 2026 RCP5', 'Test', 100);
        sendResponse({ success: true });
      }
      else if (request.action === 'PAUSE_LOOP') {
        const result = await pauseLoop();
        sendResponse(result);
      }
      else if (request.action === 'RESUME_LOOP') {
        const result = await resumeLoop();
        sendResponse(result);
      }
      else if (request.action === 'STOP_LOOP') {
        const result = await stopLoop();
        sendResponse(result);
      }
      else if (request.action === 'LOG_ACTION') {
        await addLog(request.logData);
        sendResponse({ success: true });
      }
      else if (request.action === 'CLEAR_LOGS') {
        await chrome.storage.local.set({ logs: [], widgetLogs: [] });
        sendResponse({ success: true });
      }
      else if (request.action === 'GET_STATUS') {
        const data = await chrome.storage.local.get(Object.keys(DEFAULT_CONFIG));
        sendResponse({ success: true, data });
      }
    } catch (err) {
      console.error('[TPlus Auto] onMessage error:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true;
});
