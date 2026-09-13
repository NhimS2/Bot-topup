const http = require('http');
const { exec } = require('child_process');

const PORT = 3000;

const server = http.createServer((req, res) => {
  // We allow CORS so the extension can fetch this from the background script
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/shutdown') {
    console.log('[Local Server] Nhận yêu cầu tắt máy từ Extension!');
    
    // Thực thi lệnh tắt máy trên Windows
    exec('shutdown /s /t 0', (error, stdout, stderr) => {
      if (error) {
        console.error(`[Local Server] Lỗi khi thực hiện tắt máy: ${error.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Lỗi khi tắt máy' }));
        return;
      }
      
      console.log(`[Local Server] Lệnh tắt máy đã được gửi thành công.`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Đang tắt máy...' }));
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`[Local Server] Đang chạy tại http://localhost:${PORT}`);
  console.log(`[Local Server] Đợi lệnh tắt máy từ TPlus Auto Extension...`);
});
