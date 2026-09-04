/**
 * TPlus Remote Discord Controller Bot
 * Điều khiển từ xa các máy chạy Chrome Extension thông qua Firebase Realtime Database
 */

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || 'https://fir-run-extension-t-plus-default-rtdb.asia-southeast1.firebasedatabase.app';

if (!TOKEN) {
  console.error('❌ Lỗi: Thiếu DISCORD_BOT_TOKEN trong file .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// Lưu trữ các tin nhắn Bảng điều khiển đang hoạt động để tự động cập nhật
const activePanels = new Map(); // messageId -> { channelId, messageId }

// Helper lấy danh sách thiết bị từ Firebase
async function fetchDevices() {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/devices.json`);
    const data = await res.json();
    if (!data) return {};

    const now = Date.now();
    const activeData = {};

    for (const [devId, dev] of Object.entries(data)) {
      if (dev && typeof dev === 'object') {
        const lastActive = dev.lastActive || 0;
        if ((now - lastActive) < 45000) {
          activeData[devId] = dev;
        } else {
          // Tự động xóa node rác trên Firebase
          fetch(`${FIREBASE_DB_URL}/devices/${devId}.json`, { method: 'DELETE' }).catch(() => {});
        }
      }
    }

    return activeData;
  } catch (err) {
    console.error('Lỗi fetch devices từ Firebase:', err.message);
    return {};
  }
}

// Helper gửi lệnh điều khiển lên Firebase
async function sendCommandToFirebase(targetId, action) {
  try {
    const payload = {
      action: action, // 'RUN_NOW' | 'PAUSE' | 'RESUME' | 'STOP'
      timestamp: Date.now(),
      sender: 'Discord Bot'
    };

    const path = targetId === 'global' ? 'commands/global.json' : `commands/${targetId}.json`;
    await fetch(`${FIREBASE_DB_URL}/${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return true;
  } catch (err) {
    console.error(`Lỗi gửi lệnh ${action} tới ${targetId}:`, err.message);
    return false;
  }
}

// Helper tạo Bảng điều khiển (Embed + Nút bấm)
async function buildControlPanelPayload() {
  const devicesObj = await fetchDevices();
  const now = Date.now();
  const onlineDevices = Object.values(devicesObj);

  const embed = new EmbedBuilder()
    .setTitle('🎛️ BẢNG ĐIỀU KHIỂN TPLUS AUTO TOPUP')
    .setDescription('Hệ thống giám sát và điều khiển từ xa các máy đang chạy Chrome Extension.')
    .setColor('#2563EB')
    .setTimestamp();

  if (onlineDevices.length === 0) {
    embed.addFields({
      name: '📡 Trạng thái máy kết nối',
      value: '⚪ Hiện chưa có máy nào online. Hãy mở Extension trên trình duyệt để tự động kết nối.',
      inline: false
    });
  } else {
    const runningCount = onlineDevices.filter(d => d.status === 'running').length;
    const pausedCount = onlineDevices.filter(d => d.status === 'paused').length;
    const idleCount = onlineDevices.filter(d => d.status === 'idle' || d.status === 'disabled').length;

    embed.addFields({
      name: '📊 Tổng quan hệ thống',
      value: `🟢 **Online:** ${onlineDevices.length} máy (⚡ Đang chạy: ${runningCount} | ⏸ Tạm dừng: ${pausedCount} | ⚪ Chờ: ${idleCount})`,
      inline: false
    });

    onlineDevices.forEach((dev, idx) => {
      const statusIcon = dev.status === 'running' ? '🟢 ĐANG CHẠY' : (dev.status === 'paused' ? '🟡 ĐANG TẠM DỪNG' : '⚪ SẴN SÀNG');
      const timeAgo = Math.max(0, Math.floor((now - (dev.lastActive || 0)) / 1000));
      embed.addFields({
        name: `🖥️ [Máy ${idx + 1}]: ${dev.deviceName || dev.deviceId}`,
        value: `• **Trạng thái:** ${statusIcon}\n• **Tiến độ:** ${dev.currentStep || 'Sẵn sàng'}\n• **Email:** \`${dev.email || 'N/A'}\`\n• **Phản hồi:** ${timeAgo} giây trước`,
        inline: false
      });
    });
  }

  embed.setFooter({ text: 'TPlus Cloud Controller • Tự động dọn dẹp và cập nhật mỗi 5 giây' });

  const anyRunning = onlineDevices.some(d => d.status === 'running');
  const anyPaused = onlineDevices.some(d => d.status === 'paused');
  const isAutoEnabled = onlineDevices.length > 0 ? onlineDevices.some(d => d.enabled !== false && d.status !== 'disabled') : true;

  // 1. Hàng nút điều khiển TOÀN BỘ MÁY
  const runBtn = new ButtonBuilder()
    .setCustomId(anyPaused ? 'btn_global_resume' : (anyRunning ? 'btn_global_pause' : 'btn_global_run'))
    .setLabel(anyPaused ? '▶ Tiếp Tục Vòng Lặp' : (anyRunning ? '⏸ Tạm Dừng Vòng Lặp' : '⚡ Chạy Toàn Bộ Vòng Lặp Ngay'))
    .setStyle(anyPaused ? ButtonStyle.Success : (anyRunning ? ButtonStyle.Secondary : ButtonStyle.Primary));

  const stopBtn = new ButtonBuilder()
    .setCustomId('btn_global_stop')
    .setLabel('⏹ Dừng')
    .setStyle(ButtonStyle.Danger);

  const toggleAutoBtn = new ButtonBuilder()
    .setCustomId('btn_toggle_auto')
    .setLabel(isAutoEnabled ? '🟢 Auto: ĐANG BẬT' : '🔴 Auto: ĐANG TẮT')
    .setStyle(isAutoEnabled ? ButtonStyle.Success : ButtonStyle.Danger);

  const refreshBtn = new ButtonBuilder()
    .setCustomId('btn_refresh_panel')
    .setLabel('🔄')
    .setStyle(ButtonStyle.Secondary);

  const globalRow = new ActionRowBuilder().addComponents(runBtn, stopBtn, toggleAutoBtn, refreshBtn);

  const components = [globalRow];

  // 2. Hàng nút điều khiển RIÊNG TỪNG MÁY ONLINE (Tối đa 4 máy đầu tiên cho mỗi panel)
  onlineDevices.slice(0, 4).forEach((dev, idx) => {
    const isPaused = dev.status === 'paused';
    const isRunning = dev.status === 'running';

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_dev_run_${dev.deviceId}`)
        .setLabel(`⚡ Chạy [M${idx + 1}]`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(isRunning && !isPaused),
      new ButtonBuilder()
        .setCustomId(`btn_dev_${isPaused ? 'resume' : 'pause'}_${dev.deviceId}`)
        .setLabel(isPaused ? `▶ Tiếp Tục [M${idx + 1}]` : `⏸ Tạm Dừng [M${idx + 1}]`)
        .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`btn_dev_stop_${dev.deviceId}`)
        .setLabel(`⏹ Dừng [M${idx + 1}]`)
        .setStyle(ButtonStyle.Danger)
    );

    components.push(row);
  });

  return { embeds: [embed], components };
}

// Tự động cập nhật các panel đang mở
async function autoUpdatePanels() {
  if (activePanels.size === 0) return;

  try {
    const payload = await buildControlPanelPayload();
    for (const [msgId, panelInfo] of activePanels.entries()) {
      try {
        const channel = await client.channels.fetch(panelInfo.channelId);
        if (channel) {
          const message = await channel.messages.fetch(msgId);
          if (message) {
            await message.edit(payload);
          }
        }
      } catch (err) {
        // Message might be deleted
        activePanels.delete(msgId);
      }
    }
  } catch (err) {
    console.warn('Lỗi autoUpdatePanels:', err.message);
  }
}

// Đăng ký Slash Command
async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('panel')
      .setDescription('Mở Bảng điều khiển từ xa TPlus Auto Topup'),
    new SlashCommandBuilder()
      .setName('status')
      .setDescription('Xem trạng thái các máy đang chạy extension')
  ];

  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    console.log('Đang đăng ký Slash Commands...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Đã đăng ký Slash Commands thành công!');
  } catch (err) {
    console.warn('Không thể đăng ký Slash Commands:', err.message);
  }
}

client.once('ready', async () => {
  console.log(`========================================`);
  console.log(`🤖 Bot đã đăng nhập: ${client.user.tag}`);
  console.log(`📡 Kết nối Firebase: ${FIREBASE_DB_URL}`);
  console.log(`💡 Gõ /panel hoặc !panel trong Discord để mở Bảng điều khiển`);
  console.log(`========================================`);

  await registerSlashCommands();

  // Gửi heartbeat trạng thái bot
  const sendBotHeartbeat = () => {
    fetch(`${FIREBASE_DB_URL}/bot_status.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: true, lastActive: Date.now() })
    }).catch(() => {});
  };

  sendBotHeartbeat();
  setInterval(sendBotHeartbeat, 5000);

  // Bật chu kỳ tự động cập nhật Bảng điều khiển mỗi 5 giây
  setInterval(autoUpdatePanels, 5000);
});

// Xử lý tin nhắn text (!panel, !status)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();
  if (content === '!panel' || content === '!control' || content === '!status') {
    const payload = await buildControlPanelPayload();
    const sentMsg = await message.channel.send(payload);
    activePanels.set(sentMsg.id, { channelId: message.channelId, messageId: sentMsg.id });
  }
});

// Xử lý Slash Command & Nút bấm
client.on('interactionCreate', async (interaction) => {
  try {
    // 1. Xử lý Slash Command
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'panel' || interaction.commandName === 'status') {
        const payload = await buildControlPanelPayload();
        const sentMsg = await interaction.reply({ ...payload, fetchReply: true });
        activePanels.set(sentMsg.id, { channelId: interaction.channelId, messageId: sentMsg.id });
      }
      return;
    }

    // 2. Xử lý Nút bấm (Button Interaction)
    if (interaction.isButton()) {
      const customId = interaction.customId;

      if (customId === 'btn_refresh_panel') {
        const payload = await buildControlPanelPayload();
        await interaction.update(payload);
        return;
      }

      if (customId === 'btn_toggle_auto') {
        await sendCommandToFirebase('global', 'TOGGLE_ENABLED');
        await interaction.reply({
          content: `🔁 **LỆNH TẤT CẢ MÁY:** Đã gửi lệnh **BẬT/TẮT TỰ ĐỘNG HÓA** tới toàn bộ máy!`,
          ephemeral: true
        });
        setTimeout(autoUpdatePanels, 1500);
        return;
      }

      // Xử lý nút TOÀN BỘ MÁY (Global)
      if (customId.startsWith('btn_global_')) {
        const actionType = customId.replace('btn_global_', '').toUpperCase();
        let cmd = 'RUN_NOW';
        let actionName = 'CHẠY VÒNG LẶP';

        if (actionType === 'PAUSE') {
          cmd = 'PAUSE';
          actionName = 'TẠM DỪNG';
        } else if (actionType === 'RESUME') {
          cmd = 'RESUME';
          actionName = 'TIẾP TỤC';
        } else if (actionType === 'STOP') {
          cmd = 'STOP';
          actionName = 'DỪNG HẲN';
        }

        await sendCommandToFirebase('global', cmd);

        await interaction.reply({
          content: `⚡ **LỆNH TẤT CẢ MÁY:** Đã gửi lệnh **${actionName}** tới TOÀN BỘ các máy extension!`,
          ephemeral: true
        });

        setTimeout(autoUpdatePanels, 1500);
        return;
      }

      // Xử lý nút TỪNG MÁY (Per Device)
      if (customId.startsWith('btn_dev_')) {
        const parts = customId.split('_'); // btn, dev, action, deviceId
        const actionType = parts[2].toUpperCase();
        const deviceId = parts.slice(3).join('_');

        let cmd = 'RUN_NOW';
        let actionName = 'CHẠY VÒNG LẶP';

        if (actionType === 'PAUSE') {
          cmd = 'PAUSE';
          actionName = 'TẠM DỪNG';
        } else if (actionType === 'RESUME') {
          cmd = 'RESUME';
          actionName = 'TIẾP TỤC';
        } else if (actionType === 'STOP') {
          cmd = 'STOP';
          actionName = 'DỪNG HẲN';
        }

        await sendCommandToFirebase(deviceId, cmd);

        const devices = await fetchDevices();
        const devName = devices[deviceId]?.deviceName || deviceId;

        await interaction.reply({
          content: `🎯 Đã gửi lệnh **${actionName}** tới máy **${devName}**!`,
          ephemeral: true
        });

        setTimeout(autoUpdatePanels, 1500);
        return;
      }
    }
  } catch (err) {
    console.error('Lỗi interactionCreate:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `⚠️ Lỗi xử lý: ${err.message}`, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(TOKEN);
