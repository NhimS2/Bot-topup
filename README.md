# TPlus Topup Auto-Checker (Chrome Extension)

Extension tự động hóa hoàn toàn quy trình kiểm tra Topup cho toàn bộ các dự án định kỳ mỗi 1 giờ trên **https://ttw-int.t-plus.vn/**.

---

## 🔄 Toàn bộ Vòng lặp Tự động (Multi-Project Full Loop)

Cứ mỗi 60 phút (hoặc khi bấm Chạy ngay), extension tự động thực hiện tuần tự:

1. **Kiểm tra Tab & Tự động Đăng nhập:**
   - Nếu chưa mở tab $\rightarrow$ Tự động mở tab `https://ttw-int.t-plus.vn/`.
   - Nếu ở trang `/login` $\rightarrow$ Tự điền `thanhquang.le@t-plus.vn` / `@Luom0102` và bấm **Login**.
2. **Dự án 1: `Beer SG 2026 RCP5`:**
   - Tại trang Home: Bấm chọn dự án **Beer SG 2026 RCP5**.
   - Bấm menu **Topup** ở Sidebar bên trái.
   - Tab `Processing`: Tick **`SELECT ALL`** $\rightarrow$ Bấm **`Check Trans List`**.
   - Tab `Fail`: Tick **`SELECT ALL`** $\rightarrow$ Bấm **`Retry Topup List`**.
   - Bấm menu **Home** bên trái để trở về Home.
3. **Dự án 2: `Beer 333 Spring 2025`:**
   - Tại trang Home: Bấm chọn dự án **Beer 333 Spring 2025**.
   - Bấm menu **Topup** ở Sidebar bên trái.
   - Tab `Processing`: Tick **`SELECT ALL`** $\rightarrow$ Bấm **`Check Trans List`**.
   - Tab `Fail`: Tick **`SELECT ALL`** $\rightarrow$ Bấm **`Retry Topup List`**.
   - Bấm menu **Home** bên trái kết thúc vòng lặp.
4. **Ghi lại nhật ký (Logs)** kết quả và hẹn giờ cho chu kỳ tiếp theo.

---

## 🚀 Cách cài đặt / Nạp bản mới:
1. Mở `chrome://extensions/`.
2. Bấm nút **Tải lại 🔄 (Reload)** tại *TPlus Topup Auto-Checker*.
3. Mở Popup $\rightarrow$ Bấm **"⚡ Chạy toàn bộ vòng lặp ngay"** (hoặc bấm **"▶ Chạy Vòng Lặp"** trên widget góc dưới web).
