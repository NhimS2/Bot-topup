# TPlus Topup Auto-Checker (Chrome Extension)

Extension tự động hóa hoàn toàn quy trình kiểm tra Topup cho toàn bộ các dự án định kỳ mỗi 1 giờ trên **https://ttw-int.t-plus.vn/**.

---

## ✨ Các Tính Năng Nổi Bật
- 🤖 **Tự động hóa đa dự án:** Tự động chạy xoay vòng qua nhiều dự án (Beer SG, Beer 333,...).
- 🛡️ **Tự động lọc Blacklist:** Bỏ qua các số điện thoại nằm trong danh sách đen (Blacklist).
- 📱 **Điều khiển từ xa qua Discord Bot:** Có thể quản lý, ra lệnh Chạy / Tạm dừng / Dừng hẳn tất cả các máy cùng lúc thông qua Discord.
- ⚡ **Hệ thống Auto-Update:** Tự động kiểm tra và tải mã nguồn phiên bản mới nhất từ GitHub mỗi khi khởi động lại Bot.

---

## 🔄 Toàn bộ Vòng lặp Tự động (Multi-Project Full Loop)

Cứ mỗi 60 phút (hoặc khi bấm Chạy ngay), extension tự động thực hiện tuần tự:

1. **Kiểm tra Tab & Tự động Đăng nhập:**
   - Nếu chưa mở tab $\rightarrow$ Tự động mở tab `https://ttw-int.t-plus.vn/`.
   - Nếu ở trang `/login` $\rightarrow$ Tự động điền tài khoản và bấm **Login**.
2. **Dự án 1: `Beer SG 2026 RCP5`:**
   - Bấm chọn dự án **Beer SG 2026 RCP5** tại trang Home.
   - Bấm menu **Topup** ở Sidebar bên trái.
   - Tab `Processing`: Tự động bỏ tick các SĐT thuộc Blacklist $\rightarrow$ Tick **`SELECT ALL`** $\rightarrow$ Bấm **`Check Trans List`**.
   - Tab `Fail`: Tự động bỏ tick các SĐT thuộc Blacklist $\rightarrow$ Tick **`SELECT ALL`** $\rightarrow$ Bấm **`Retry Topup List`**.
   - Trở về Home.
3. **Dự án 2: `Beer 333 Spring 2025`:**
   - Bấm chọn dự án **Beer 333 Spring 2025** tại trang Home.
   - Bấm menu **Topup** ở Sidebar bên trái.
   - Tab `Processing`: Tự động bỏ tick Blacklist $\rightarrow$ Tick **`SELECT ALL`** $\rightarrow$ Bấm **`Check Trans List`**.
   - Tab `Fail`: Tự động bỏ tick Blacklist $\rightarrow$ Tick **`SELECT ALL`** $\rightarrow$ Bấm **`Retry Topup List`**.
   - Bấm menu **Home** bên trái kết thúc vòng lặp.
4. **Ghi lại nhật ký (Logs)** kết quả và hẹn giờ cho chu kỳ tiếp theo.

---

## 🚀 Hướng Dẫn Cài Đặt (Cho Máy Tính Khác):

1. **Tải mã nguồn:** Bấm vào nút màu xanh **Code** $\rightarrow$ **Download ZIP** ở kho GitHub này và giải nén.
2. **Cấu hình Discord Bot:** 
   - Vào thư mục `discord-bot`, đổi tên file `.env.example` thành `.env`.
   - Mở file `.env`, điền `DISCORD_BOT_TOKEN` của bạn vào.
3. **Cài đặt tiện ích trên Chrome:**
   - Mở `chrome://extensions/`. Bật **Developer mode**.
   - Bấm **Load unpacked** và chọn thư mục gốc vừa giải nén.
4. **Khởi động hệ thống:**
   - Vào thư mục `discord-bot`, chạy file `start_python.bat`.
   - Hệ thống sẽ tự động cấu hình môi trường, cài đặt Python (nếu thiếu), tự động cập nhật code mới, và khởi động Bot kết nối với Extension!
