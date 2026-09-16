import re

new_ui_code = '''class ControlPanelView(discord.ui.View):
    def __init__(self, devices_data):
        super().__init__(timeout=None)
        online_devices = list(devices_data.values())

        # 1. HÀNG 1: ĐIỀU KHIỂN CHUNG
        btn_stop = discord.ui.Button(label="⏹ Dừng toàn bộ", style=discord.ButtonStyle.danger, custom_id="btn_global_stop", row=0)
        btn_stop.callback = self.make_global_callback("STOP", "DỪNG HẲN TOÀN BỘ")

        btn_enable_auto = discord.ui.Button(label="🟢 Bật Auto", style=discord.ButtonStyle.success, custom_id="btn_global_enable", row=0)
        btn_enable_auto.callback = self.make_global_callback("ENABLE", "BẬT TỰ ĐỘNG HÓA", {"enabled": True})

        btn_disable_auto = discord.ui.Button(label="🔴 Tắt Auto", style=discord.ButtonStyle.danger, custom_id="btn_global_disable", row=0)
        btn_disable_auto.callback = self.make_global_callback("DISABLE", "TẮT TỰ ĐỘNG HÓA", {"enabled": False})

        btn_refresh = discord.ui.Button(label="🔄", style=discord.ButtonStyle.secondary, custom_id="btn_refresh", row=0)
        btn_refresh.callback = self.refresh_callback

        self.add_item(btn_stop)
        self.add_item(btn_enable_auto)
        self.add_item(btn_disable_auto)
        self.add_item(btn_refresh)

        # 2. HÀNG 2+: NÚT ĐIỀU KHIỂN RIÊNG TỪNG MÁY ONLINE (TỐI ĐA 4 MÁY)
        for idx, dev in enumerate(online_devices[:4]):
            row_num = idx + 1
            dev_id = dev.get("deviceId", f"dev_{idx}")
            dev_enabled = dev.get("enabled", True)

            btn_dev_stop = discord.ui.Button(label=f"⏹ Dừng [M{idx+1}]", style=discord.ButtonStyle.danger, row=row_num)
            btn_dev_timer = discord.ui.Button(label=f"🕒 Hẹn Giờ [M{idx+1}]", style=discord.ButtonStyle.secondary, row=row_num)
            btn_dev_enable = discord.ui.Button(label=f"🟢 Bật Auto [M{idx+1}]", style=discord.ButtonStyle.success, row=row_num)
            btn_dev_shutdown = discord.ui.Button(label=f"🔌 Shutdown [M{idx+1}]", style=discord.ButtonStyle.danger, row=row_num)
            btn_dev_showlog = discord.ui.Button(label=f"📄 Show Log [M{idx+1}]", style=discord.ButtonStyle.secondary, row=row_num)

            btn_dev_stop.callback = self.make_device_callback(dev_id, "STOP", f"DỪNG [M{idx+1}]")
            btn_dev_timer.callback = self.make_device_callback(dev_id, "UPDATE_CONFIG", f"HẸN GIỜ [M{idx+1}]", {"intervalMinutes": 30})
            btn_dev_enable.callback = self.make_device_callback(dev_id, "ENABLE", f"BẬT AUTO [M{idx+1}]", {"enabled": True})
            btn_dev_shutdown.callback = self.make_device_callback(dev_id, "SHUTDOWN", f"SHUTDOWN [M{idx+1}]")
            btn_dev_showlog.callback = self.make_showlog_callback(dev_id, f"[M{idx+1}]")

            self.add_item(btn_dev_stop)
            self.add_item(btn_dev_timer)
            self.add_item(btn_dev_enable)
            self.add_item(btn_dev_shutdown)
            self.add_item(btn_dev_showlog)

    def make_showlog_callback(self, dev_id, machine_name):
        async def callback(interaction: discord.Interaction):
            await interaction.response.defer(ephemeral=True)
            await asyncio.to_thread(send_command, dev_id, "REQUEST_LOGS")
            await interaction.followup.send(f"📄 Đã yêu cầu gửi log từ máy `{dev_id}`. Vui lòng đợi vài giây...", ephemeral=True)
            
            await asyncio.sleep(2)
            try:
                req = urllib.request.Request(f"{FIREBASE_DB_URL}/discordLogs/{dev_id}.json?t={int(time.time()*1000)}")
                with urllib.request.urlopen(req, timeout=3) as response:
                    logs = json.loads(response.read().decode()) or []
                    
                if not logs:
                    await interaction.followup.send(f"⚠️ Máy `{dev_id}` chưa có log hoặc extension chưa kịp phản hồi.", ephemeral=True)
                else:
                    log_text = chr(10).join(logs)
                    embed = discord.Embed(title=f"🖥️ LIVE ACTIVITY LOG {machine_name}", description=f"```ini\\n{log_text}\\n```", color=discord.Color.green())
                    await interaction.followup.send(embed=embed, ephemeral=True)
            except Exception as e:
                await interaction.followup.send(f"Lỗi lấy log: {str(e)}", ephemeral=True)
        return callback

    def make_global_callback(self, action, name, extra_data=None):
        async def callback(interaction: discord.Interaction):
            await interaction.response.defer(ephemeral=True)
            await asyncio.to_thread(send_command, "global", action, extra_data)
            await interaction.followup.send(f"⚡ **LỆNH TẤT CẢ:** Đã gửi lệnh **{name}** tới TOÀN BỘ máy!", ephemeral=True)
            await asyncio.sleep(0.5)
            devices = await asyncio.to_thread(fetch_devices)
            embed, view = build_panel(devices)
            try:
                await interaction.message.edit(embed=embed, view=view)
            except Exception:
                pass
        return callback

    def make_device_callback(self, dev_id, action, name, extra_data=None):
        async def callback(interaction: discord.Interaction):
            await interaction.response.defer(ephemeral=True)
            await asyncio.to_thread(send_command, dev_id, action, extra_data)
            await interaction.followup.send(f"🎯 Đã gửi lệnh **{name}** tới máy `{dev_id}`!", ephemeral=True)
            await asyncio.sleep(0.5)
            devices = await asyncio.to_thread(fetch_devices)
            embed, view = build_panel(devices)
            try:
                await interaction.message.edit(embed=embed, view=view)
            except Exception:
                pass
        return callback

    async def refresh_callback(self, interaction: discord.Interaction):
        await interaction.response.defer()
        devices = await asyncio.to_thread(fetch_devices)
        embed, view = build_panel(devices)
        await interaction.message.edit(embed=embed, view=view)

def build_panel(devices_data=None):
    if devices_data is None:
        devices_data = fetch_devices()
    
    now = time.time() * 1000
    online_devices = list(devices_data.values())

    embed = discord.Embed(
        title="🎛️ BẢNG ĐIỀU KHIỂN TPLUS AUTO TOPUP",
        description="Hệ thống giám sát & điều khiển vòng lặp từ xa qua Chrome Extension.",
        color=discord.Color.blue()
    )

    if not online_devices:
        embed.add_field(
            name="📡 Trạng thái máy kết nối",
            value="⚪ Hiện chưa có máy nào online.",
            inline=False
        )
    else:
        running_cnt = len([d for d in online_devices if d.get("status") == "running"])
        paused_cnt = len([d for d in online_devices if d.get("status") == "paused"])
        idle_cnt = len([d for d in online_devices if d.get("status") in ("idle", "disabled")])

        embed.add_field(
            name="📊 Tổng quan hệ thống",
            value=f"🟢 **Online:** {len(online_devices)} máy (⚡ Đang chạy: {running_cnt} | ⏸ Tạm dừng: {paused_cnt} | ⚪ Chờ: {idle_cnt})",
            inline=False
        )

        for idx, dev in enumerate(online_devices):
            status = dev.get("status")
            status_icon = "⚪ Chờ"
            if status == "running": status_icon = "⚡ Đang chạy"
            elif status == "paused": status_icon = "⏸ Tạm dừng"
            elif status == "disabled": status_icon = "🔴 Đang Tắt"
                
            auto_status = "🟢 BẬT" if dev.get("enabled", True) else "🔴 TẮT"
            ago_sec = max(0, int((now - dev.get("lastActive", 0)) / 1000))
            
            interval = dev.get("intervalMinutes", 60)
            start_t = dev.get("autoStartTime", "00:00")
            end_t = dev.get("autoEndTime", "23:59")
            
            embed.add_field(
                name=f"🖥️ [Máy {idx + 1}]: {dev.get('deviceName') or dev.get('deviceId')}",
                value=f"• **Trạng thái:** {status_icon}\\n• **Auto:** {auto_status}\\n• **Tiến độ:** {dev.get('currentStep', 'Sẵn sàng')}\\n• **From Date:** `{dev.get('fromDate', '2026-08-15')}`\\n• **Email:** `{dev.get('email', 'N/A')}`\\n• **Hẹn giờ:** {interval}p | {start_t}-{end_t} | Shutdown: Tắt\\n• **Phản hồi:** {ago_sec}s trước",
                inline=False
            )

    embed.set_footer(text=f"TPlus Cloud Controller • Admin ID: {ADMIN_ID}")
    view = ControlPanelView(devices_data)
    return embed, view
'''

with open('discord-bot/bot.py', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(r'class ControlPanelView\(discord\.ui\.View\):.*?(?=@tasks\.loop)', re.DOTALL)
content = pattern.sub(new_ui_code + '\n', content)

# Fix backslashes specifically for embed f-strings to avoid SyntaxError
content = content.replace("```ini\\\\n{log_text}\\\\n```", "```ini\\n{log_text}\\n```")

with open('discord-bot/bot.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")
