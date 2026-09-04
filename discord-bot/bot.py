import os
import sys
import time
import json
import asyncio
import urllib.request
import discord
from discord.ext import commands, tasks
from dotenv import load_dotenv

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

TOKEN = os.getenv("DISCORD_BOT_TOKEN")
FIREBASE_DB_URL = os.getenv("FIREBASE_DB_URL", "https://fir-run-extension-t-plus-default-rtdb.asia-southeast1.firebasedatabase.app")
AUTH_WEBHOOK_URL = os.getenv("AUTH_WEBHOOK_URL", "https://ptb.discord.com/api/webhooks/1545410985198747738/M535wrLZA8Peczqn9boiW2q6P5D1T0CJT6L3Iv828nvKmr2Yik0_QsSMiaHWg7wX3YZF")

# ID duy nhất của Admin được phép thực hiện
ADMIN_ID = 584589789198811157

if not TOKEN:
    print("❌ Lỗi: Thiếu DISCORD_BOT_TOKEN trong file .env")
    exit(1)

intents = discord.Intents.default()
bot = commands.Bot(command_prefix="!", intents=intents)

active_panels = {}  # msg_id: (channel_id, msg_id)

def is_admin(user_id):
    return int(user_id) == ADMIN_ID

def send_auth_webhook_notification(title, description, color, fields=None):
    try:
        embed = {
            "title": title,
            "description": description,
            "color": color,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "footer": {"text": "TPlus License & Security Manager"}
        }
        if fields:
            embed["fields"] = fields

        payload = json.dumps({
            "username": "TPlus License Security",
            "avatar_url": "https://cdn-icons-png.flaticon.com/512/3064/3064197.png",
            "embeds": [embed]
        }).encode("utf-8")

        req = urllib.request.Request(AUTH_WEBHOOK_URL, data=payload, method="POST", headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0"
        })
        with urllib.request.urlopen(req, timeout=4) as res:
            return True, "OK"
    except Exception as e:
        print(f"Lỗi gửi Auth Webhook: {e}")
        return False, str(e)

def get_access_code():
    try:
        req = urllib.request.Request(f"{FIREBASE_DB_URL}/auth/access_code.json?t={int(time.time()*1000)}")
        with urllib.request.urlopen(req, timeout=4) as response:
            data = json.loads(response.read().decode()) or {}
            return data
    except Exception as e:
        print(f"Lỗi đọc access code: {e}")
        return {}

def set_access_code(code_str, note_str="Cập nhật bởi Admin", admin_name="Admin"):
    try:
        raw_code = code_str.strip()
        if not raw_code:
            return False, "Mã code không được để trống!", None

        now = int(time.time() * 1000)
        time_str = time.strftime("%d/%m/%Y %H:%M:%S")
        payload_data = {
            "code": raw_code,
            "note": note_str.strip() or "Cập nhật định kỳ",
            "updatedAt": now,
            "updatedBy": admin_name,
            "updatedTimeStr": time_str
        }
        payload = json.dumps(payload_data).encode("utf-8")
        req = urllib.request.Request(f"{FIREBASE_DB_URL}/auth/access_code.json", data=payload, method="PUT", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=4) as res:
            pass

        # Gửi thông báo tới Webhook Discord
        fields = [
            {"name": "🔑 Mã Kích Hoạt Mới", "value": f"```{raw_code}```", "inline": False},
            {"name": "📝 Ghi chú / Thời hạn", "value": payload_data["note"], "inline": True},
            {"name": "👤 Người cập nhật", "value": admin_name, "inline": True},
            {"name": "⏰ Thời gian", "value": time_str, "inline": True}
        ]
        wh_ok, wh_msg = send_auth_webhook_notification(
            title="🔐 ĐÃ CẬP NHẬT MÃ KÍCH HOẠT HỆ THỐNG",
            description="Mã kích hoạt mới đã được lưu thành công trên Firebase. Toàn bộ máy Extension cũ sẽ tự động hết hạn và cần nhập mã mới này.",
            color=0x22C55E,
            fields=fields
        )
        return True, "Thành công", payload_data
    except Exception as e:
        print(f"Lỗi khi set access code: {e}")
        return False, f"Lỗi kết nối Firebase: {str(e)}", None

def fetch_devices():
    try:
        req = urllib.request.Request(f"{FIREBASE_DB_URL}/devices.json?t={int(time.time()*1000)}")
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read().decode()) or {}
            
            now = time.time() * 1000
            active_data = {}
            for dev_id, dev in data.items():
                if isinstance(dev, dict):
                    last_active = dev.get("lastActive", 0)
                    if (now - last_active) < 45000:
                        active_data[dev_id] = dev
                    else:
                        try:
                            del_req = urllib.request.Request(f"{FIREBASE_DB_URL}/devices/{dev_id}.json", method="DELETE")
                            urllib.request.urlopen(del_req, timeout=1)
                        except Exception:
                            pass
            return active_data
    except Exception:
        return {}

def send_bot_heartbeat():
    try:
        url = f"{FIREBASE_DB_URL}/bot_status.json"
        payload = json.dumps({
            "online": True,
            "lastActive": int(time.time() * 1000)
        }).encode("utf-8")
        req = urllib.request.Request(url, data=payload, method="PUT", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=2) as res:
            pass
    except Exception:
        pass

def send_command(target_id, action, extra_data=None):
    try:
        path = "commands/global.json" if target_id == "global" else f"commands/{target_id}.json"
        url = f"{FIREBASE_DB_URL}/{path}"
        payload_dict = {
            "action": action,
            "timestamp": int(time.time() * 1000),
            "sender": "Discord Bot"
        }
        if extra_data and isinstance(extra_data, dict):
            payload_dict.update(extra_data)

        payload = json.dumps(payload_dict).encode("utf-8")
        req = urllib.request.Request(url, data=payload, method="PUT", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=3) as res:
            return True
    except Exception as e:
        print(f"Lỗi gửi lệnh {action} tới {target_id}: {e}")
        return False

# ==========================================
# VIEW BẢNG ĐIỀU KHIỂN ĐẦY ĐỦ NÚT BẤM (GỌN GÀNG)
# ==========================================
class ControlPanelView(discord.ui.View):
    def __init__(self, devices_data):
        super().__init__(timeout=None)
        online_devices = list(devices_data.values())

        any_running = any(d.get("status") == "running" for d in online_devices)
        any_paused = any(d.get("status") == "paused" for d in online_devices)
        is_auto_enabled = any(d.get("enabled", True) and d.get("status") != "disabled" for d in online_devices) if online_devices else True

        # 1. HÀNG 1: ĐIỀU KHIỂN VÒNG LẶP TOÀN BỘ
        if any_paused:
            btn_run = discord.ui.Button(label="▶ Tiếp Tục Vòng Lặp", style=discord.ButtonStyle.success, custom_id="btn_global_resume", row=0)
            btn_run.callback = self.make_global_callback("RESUME", "TIẾP TỤC VÒNG LẶP")
        elif any_running:
            btn_run = discord.ui.Button(label="⏸ Tạm Dừng Vòng Lặp", style=discord.ButtonStyle.secondary, custom_id="btn_global_pause", row=0)
            btn_run.callback = self.make_global_callback("PAUSE", "TẠM DỪNG VÒNG LẶP")
        else:
            btn_run = discord.ui.Button(label="⚡ Chạy Toàn Bộ Vòng Lặp Ngay", style=discord.ButtonStyle.primary, custom_id="btn_global_run", row=0)
            btn_run.callback = self.make_global_callback("RUN_NOW", "CHẠY TOÀN BỘ VÒNG LẶP")

        btn_stop = discord.ui.Button(label="⏹ Dừng", style=discord.ButtonStyle.danger, custom_id="btn_global_stop", row=0)
        btn_stop.callback = self.make_global_callback("STOP", "DỪNG HẲN")

        if is_auto_enabled:
            btn_toggle_auto = discord.ui.Button(label="🟢 Auto: ĐANG BẬT", style=discord.ButtonStyle.success, custom_id="btn_toggle_auto", row=0)
            btn_toggle_auto.callback = self.make_global_callback("DISABLE", "TẮT TỰ ĐỘNG HÓA", {"enabled": False})
        else:
            btn_toggle_auto = discord.ui.Button(label="🔴 Auto: ĐANG TẮT", style=discord.ButtonStyle.danger, custom_id="btn_toggle_auto", row=0)
            btn_toggle_auto.callback = self.make_global_callback("ENABLE", "BẬT TỰ ĐỘNG HÓA", {"enabled": True})

        btn_refresh = discord.ui.Button(label="🔄", style=discord.ButtonStyle.secondary, custom_id="btn_refresh", row=0)
        btn_refresh.callback = self.refresh_callback

        self.add_item(btn_run)
        self.add_item(btn_stop)
        self.add_item(btn_toggle_auto)
        self.add_item(btn_refresh)

        # 2. HÀNG 2+: NÚT ĐIỀU KHIỂN RIÊNG TỪNG MÁY ONLINE (TỐI ĐA 4 MÁY)
        for idx, dev in enumerate(online_devices[:4]):
            row_num = idx + 1
            dev_id = dev.get("deviceId", f"dev_{idx}")
            is_paused = dev.get("status") == "paused"
            is_running = dev.get("status") == "running"

            btn_dev_run = discord.ui.Button(
                label=f"⚡ Chạy [M{idx+1}]",
                style=discord.ButtonStyle.primary,
                row=row_num,
                disabled=(is_running and not is_paused)
            )
            btn_dev_toggle = discord.ui.Button(
                label=f"▶ Tiếp Tục [M{idx+1}]" if is_paused else f"⏸ Tạm Dừng [M{idx+1}]",
                style=discord.ButtonStyle.success if is_paused else discord.ButtonStyle.secondary,
                row=row_num
            )
            btn_dev_stop = discord.ui.Button(label=f"⏹ Dừng [M{idx+1}]", style=discord.ButtonStyle.danger, row=row_num)

            btn_dev_run.callback = self.make_device_callback(dev_id, "RUN_NOW", f"CHẠY [M{idx+1}]")
            btn_dev_toggle.callback = self.make_device_callback(dev_id, "RESUME" if is_paused else "PAUSE", f"{'TIẾP TỤC' if is_paused else 'TẠM DỪNG'} [M{idx+1}]")
            btn_dev_stop.callback = self.make_device_callback(dev_id, "STOP", f"DỪNG [M{idx+1}]")

            self.add_item(btn_dev_run)
            self.add_item(btn_dev_toggle)
            self.add_item(btn_dev_stop)

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
            value="⚪ Hiện chưa có máy nào online. Hãy mở Extension trên trình duyệt để tự động kết nối.",
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
            status_icon = "🟢 ĐANG CHẠY" if status == "running" else ("🟡 ĐANG TẠM DỪNG" if status == "paused" else ("🔴 TỰ ĐỘNG TẮT" if status == "disabled" else "⚪ SẴN SÀNG"))
            ago_sec = max(0, int((now - dev.get("lastActive", 0)) / 1000))
            from_date = dev.get("fromDate", "2026-08-15")
            embed.add_field(
                name=f"🖥️ [Máy {idx + 1}]: {dev.get('deviceName') or dev.get('deviceId')}",
                value=f"• **Trạng thái:** {status_icon}\n• **Tiến độ:** {dev.get('currentStep', 'Sẵn sàng')}\n• **From Date:** `{from_date}`\n• **Email:** `{dev.get('email', 'N/A')}`\n• **Phản hồi:** {ago_sec}s trước",
                inline=False
            )

    embed.set_footer(text=f"TPlus Cloud Controller • Admin ID: {ADMIN_ID}")
    view = ControlPanelView(devices_data)
    return embed, view

@tasks.loop(seconds=3)
async def bot_heartbeat_loop():
    await asyncio.to_thread(send_bot_heartbeat)

@tasks.loop(seconds=5)
async def auto_update_panels():
    if not active_panels:
        return
    devices = await asyncio.to_thread(fetch_devices)
    embed, view = build_panel(devices)

    to_remove = []
    for msg_id, (channel_id, _) in list(active_panels.items()):
        try:
            channel = bot.get_channel(channel_id) or await bot.fetch_channel(channel_id)
            if channel:
                message = await channel.fetch_message(msg_id)
                if message:
                    await message.edit(embed=embed, view=view)
        except Exception:
            to_remove.append(msg_id)

    for msg_id in to_remove:
        active_panels.pop(msg_id, None)

@bot.event
async def on_ready():
    await asyncio.to_thread(send_bot_heartbeat)
    print("========================================")
    print(f"🤖 Bot da dang nhap thanh cong: {bot.user}")
    print(f"📡 Ket noi Firebase: {FIREBASE_DB_URL}")
    print(f"👑 Admin ID (Quan ly Code): {ADMIN_ID}")
    print("💡 Go /panel hoac !panel tren Discord de mo Bang dieu khien")
    print("🔑 Go /setcode <ma> de cap nhat ma kich hoat moi (Chi Admin)")
    print("========================================")
    try:
        synced = await bot.tree.sync()
        print(f"✅ Da dong bo {len(synced)} Slash Commands tren Discord!")
    except Exception as e:
        print(f"Sync command notice: {e}")

    if not bot_heartbeat_loop.is_running():
        bot_heartbeat_loop.start()

    if not auto_update_panels.is_running():
        auto_update_panels.start()

# ==========================================
# SLASH COMMANDS: PANEL & STATUS
# ==========================================
@bot.tree.command(name="panel", description="Mo Bang dieu khien tu xa TPlus Auto Topup")
async def slash_panel(interaction: discord.Interaction):
    await interaction.response.defer()
    devices = await asyncio.to_thread(fetch_devices)
    embed, view = build_panel(devices)
    msg = await interaction.followup.send(embed=embed, view=view)
    active_panels[msg.id] = (interaction.channel_id, msg.id)

@bot.tree.command(name="status", description="Xem trang thai cac may chay extension")
async def slash_status(interaction: discord.Interaction):
    await interaction.response.defer()
    devices = await asyncio.to_thread(fetch_devices)
    embed, view = build_panel(devices)
    msg = await interaction.followup.send(embed=embed, view=view)
    active_panels[msg.id] = (interaction.channel_id, msg.id)

# ==========================================
# SLASH COMMANDS: SETCODE & GETCODE (MÃ KÍCH HOẠT)
# ==========================================
@bot.tree.command(name="setcode", description="Cap nhat ma kich hoat (Access Code) moi cho Extension")
@discord.app_commands.describe(
    code="Ma kich hoat moi (VD: TPLUS_THANG_9, AUTO_2026, ...)",
    note="Ghi chu thoi han (VD: Ap dung thang 9/2026, Han dung den het tuan, ...)"
)
async def slash_setcode(interaction: discord.Interaction, code: str, note: str = "Cập nhật định kỳ"):
    if not is_admin(interaction.user.id):
        await interaction.response.send_message(
            f"⛔ **TỪ CHỐI:** Bạn không có quyền đặt mã kích hoạt! Chỉ có Admin (<@{ADMIN_ID}>) mới được phép.",
            ephemeral=True
        )
        return

    await interaction.response.defer()
    admin_user = str(interaction.user)
    success, msg, res = await asyncio.to_thread(set_access_code, code, note, admin_user)

    if success:
        embed = discord.Embed(
            title="✅ ĐÃ ĐẶT MÃ KÍCH HOẠT THÀNH CÔNG",
            description="Mã kích hoạt mới đã được cập nhật thành công lên hệ thống.",
            color=discord.Color.green()
        )
        embed.add_field(name="🔑 Mã Kích Hoạt Mới", value=f"```{code.strip()}```", inline=False)
        embed.add_field(name="📝 Ghi Chú / Thời Hạn", value=note, inline=True)
        embed.add_field(name="👤 Người Đặt", value=admin_user, inline=True)
        embed.add_field(name="⏰ Thời Gian", value=res.get("updatedTimeStr", "Vừa xong"), inline=True)
        embed.add_field(name="📡 Đồng Bộ Firebase", value="🟢 Thành công (OK)", inline=True)
        embed.add_field(name="📢 Discord Webhook", value="🟢 Đã gửi thông báo", inline=True)
        embed.set_footer(text="Toàn bộ Extension dùng mã cũ sẽ tự động hết hạn.")
        await interaction.followup.send(embed=embed)
    else:
        embed = discord.Embed(
            title="❌ LỖI ĐẶT MÃ KÍCH HOẠT",
            description=f"Không thể cập nhật mã kích hoạt lên hệ thống.\n**Chi tiết lỗi:** `{msg}`",
            color=discord.Color.red()
        )
        embed.add_field(name="💡 Gợi ý khắc phục", value="Kiểm tra kết nối mạng hoặc đường dẫn Firebase trong file `.env`.", inline=False)
        await interaction.followup.send(embed=embed)

@bot.tree.command(name="getcode", description="Xem ma kich hoat (Access Code) hien tai dang co hieu luc")
async def slash_getcode(interaction: discord.Interaction):
    if not is_admin(interaction.user.id):
        await interaction.response.send_message(
            f"⛔ **TỪ CHỐI:** Bạn không có quyền xem mã kích hoạt! Chỉ có Admin (<@{ADMIN_ID}>) mới được phép.",
            ephemeral=True
        )
        return

    await interaction.response.defer()
    code_data = await asyncio.to_thread(get_access_code)
    current_code = code_data.get("code", "CHƯA THIẾT LẬP")
    updated_time = code_data.get("updatedTimeStr", "N/A")
    note = code_data.get("note", "N/A")
    admin = code_data.get("updatedBy", "Admin")

    embed = discord.Embed(
        title="🔑 MÃ KÍCH HOẠT HIỆN TẠI ĐANG DÙNG",
        color=discord.Color.blue()
    )
    embed.add_field(name="Mã Code", value=f"```{current_code}```", inline=False)
    embed.add_field(name="📝 Ghi Chú", value=note, inline=True)
    embed.add_field(name="👤 Người Đặt", value=admin, inline=True)
    embed.add_field(name="⏰ Thời Gian Tạo", value=updated_time, inline=True)
    embed.set_footer(text="Gõ /setcode <code> để thay đổi mã này")
    await interaction.followup.send(embed=embed)

# ==========================================
# TEXT PREFIX COMMANDS (!panel, !setcode, !getcode)
# ==========================================
@bot.command(name="panel", aliases=["control", "status"])
async def cmd_panel(ctx):
    devices = await asyncio.to_thread(fetch_devices)
    embed, view = build_panel(devices)
    msg = await ctx.send(embed=embed, view=view)
    active_panels[msg.id] = (ctx.channel.id, msg.id)

@bot.command(name="setcode")
async def cmd_setcode(ctx, code: str = None, *, note: str = "Cập nhật bởi Admin"):
    if not is_admin(ctx.author.id):
        await ctx.send(f"⛔ **TỪ CHỐI:** Bạn không có quyền đặt mã! Chỉ có Admin (<@{ADMIN_ID}>) mới được phép.")
        return

    if not code:
        embed = discord.Embed(
            title="⚠️ THIẾU THÔNG TIN MÃ",
            description="Vui lòng nhập cú pháp: `!setcode <ma_code_moi> [ghi chu]`\n*Ví dụ:* `!setcode TPLUS2026 Code tháng 9`",
            color=discord.Color.orange()
        )
        await ctx.send(embed=embed)
        return

    admin_user = str(ctx.author)
    success, msg, res = await asyncio.to_thread(set_access_code, code, note, admin_user)

    if success:
        embed = discord.Embed(
            title="✅ ĐÃ ĐẶT MÃ KÍCH HOẠT THÀNH CÔNG",
            description="Mã kích hoạt mới đã được cập nhật thành công lên hệ thống.",
            color=discord.Color.green()
        )
        embed.add_field(name="🔑 Mã Kích Hoạt Mới", value=f"```{code.strip()}```", inline=False)
        embed.add_field(name="📝 Ghi Chú / Thời Hạn", value=note, inline=True)
        embed.add_field(name="👤 Người Đặt", value=admin_user, inline=True)
        embed.add_field(name="⏰ Thời Gian", value=res.get("updatedTimeStr", "Vừa xong"), inline=True)
        embed.add_field(name="📡 Đồng Bộ Firebase", value="🟢 Thành công (OK)", inline=True)
        embed.add_field(name="📢 Discord Webhook", value="🟢 Đã gửi thông báo", inline=True)
        embed.set_footer(text="Toàn bộ Extension dùng mã cũ sẽ tự động hết hạn.")
        await ctx.send(embed=embed)
    else:
        embed = discord.Embed(
            title="❌ LỖI ĐẶT MÃ KÍCH HOẠT",
            description=f"Không thể cập nhật mã kích hoạt lên hệ thống.\n**Chi tiết lỗi:** `{msg}`",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)

@bot.command(name="getcode")
async def cmd_getcode(ctx):
    if not is_admin(ctx.author.id):
        await ctx.send(f"⛔ **TỪ CHỐI:** Bạn không có quyền xem mã! Chỉ có Admin (<@{ADMIN_ID}>) mới được phép.")
        return

    code_data = await asyncio.to_thread(get_access_code)
    current_code = code_data.get("code", "CHƯA THIẾT LẬP")
    updated_time = code_data.get("updatedTimeStr", "N/A")
    note = code_data.get("note", "N/A")
    admin = code_data.get("updatedBy", "Admin")

    embed = discord.Embed(
        title="🔑 MÃ KÍCH HOẠT HIỆN TẠI ĐANG DÙNG",
        color=discord.Color.blue()
    )
    embed.add_field(name="Mã Code", value=f"```{current_code}```", inline=False)
    embed.add_field(name="📝 Ghi Chú", value=note, inline=True)
    embed.add_field(name="👤 Người Đặt", value=admin, inline=True)
    embed.add_field(name="⏰ Thời Gian Tạo", value=updated_time, inline=True)
    await ctx.send(embed=embed)

if __name__ == "__main__":
    bot.run(TOKEN)
