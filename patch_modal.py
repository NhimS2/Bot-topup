import re

timer_modal_code = '''class TimerModal(discord.ui.Modal, title="Cấu hình Hẹn Giờ"):
    interval = discord.ui.TextInput(
        label="Khoảng cách lặp (phút)",
        default="60",
        required=True
    )
    start_time = discord.ui.TextInput(
        label="Giờ bắt đầu (HH:MM)",
        default="00:00",
        required=True
    )
    end_time = discord.ui.TextInput(
        label="Giờ kết thúc (HH:MM)",
        default="23:59",
        required=True
    )

    def __init__(self, dev_id, machine_name):
        super().__init__()
        self.dev_id = dev_id
        self.machine_name = machine_name

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        extra_data = {
            "intervalMinutes": int(self.interval.value),
            "autoStartTime": self.start_time.value,
            "autoEndTime": self.end_time.value
        }
        await asyncio.to_thread(send_command, self.dev_id, "UPDATE_CONFIG", extra_data)
        await interaction.followup.send(f"🕒 Đã gửi cấu hình hẹn giờ tới {self.machine_name}!", ephemeral=True)
        
        await asyncio.sleep(0.5)
        devices = await asyncio.to_thread(fetch_devices)
        embed, view = build_panel(devices)
        try:
            await interaction.message.edit(embed=embed, view=view)
        except Exception:
            pass

class ControlPanelView'''

with open('discord-bot/bot.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Insert the TimerModal class
content = content.replace("class ControlPanelView", timer_modal_code)

# Replace the callback
old_callback = '''btn_dev_timer.callback = self.make_device_callback(dev_id, "UPDATE_CONFIG", f"HẸN GIỜ [M{idx+1}]", {"intervalMinutes": 30})'''
new_callback = '''btn_dev_timer.callback = self.make_timer_callback(dev_id, f"[M{idx+1}]")'''
content = content.replace(old_callback, new_callback)

# Inject the make_timer_callback method inside ControlPanelView
timer_callback_method = '''
    def make_timer_callback(self, dev_id, machine_name):
        async def callback(interaction: discord.Interaction):
            modal = TimerModal(dev_id, machine_name)
            await interaction.response.send_modal(modal)
        return callback

    def make_showlog_callback'''
content = content.replace("    def make_showlog_callback", timer_callback_method)

with open('discord-bot/bot.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Timer Modal injected successfully")
