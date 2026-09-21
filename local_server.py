import http.server
import socketserver
import os
import json

PORT = 3000

class ShutdownHandler(http.server.SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.end_headers()

    def do_POST(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        if self.path == '/shutdown':
            print("[Local Server] Nhận yêu cầu tắt máy từ Extension!")
            
            # Thực thi lệnh tắt máy trên Windows
            status = os.system("shutdown /s /t 0")
            
            if status == 0:
                print("[Local Server] Lệnh tắt máy đã được gửi thành công.")
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = {"success": True, "message": "Đang tắt máy..."}
                self.wfile.write(json.dumps(response).encode('utf-8'))
            else:
                print("[Local Server] Lỗi khi thực hiện tắt máy.")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = {"success": False, "message": "Lỗi khi tắt máy"}
                self.wfile.write(json.dumps(response).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not Found")

    def log_message(self, format, *args):
        # Tắt log mặc định của Python server để màn hình gọn gàng hơn
        pass

with socketserver.TCPServer(("", PORT), ShutdownHandler) as httpd:
    print(f"[Local Server] Đang chạy tại http://localhost:{PORT}")
    print("[Local Server] Đợi lệnh tắt máy từ TPlus Auto Extension...")
    httpd.serve_forever()
