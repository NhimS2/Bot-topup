$ErrorActionPreference = 'SilentlyContinue'
$currentVersion = Get-Content -Path "version.txt" -Raw | ForEach-Object { $_ -replace "
|", "" }

# --- ĐIỀN THÔNG TIN GITHUB CỦA BẠN VÀO ĐÂY ---
$githubUser = "NhimS2"
$githubRepo = "Bot-topup"
$branch = "master"
# ---------------------------------------------

$rawUrl = "https://raw.githubusercontent.com/$githubUser/$githubRepo/$branch/version.txt"
$zipUrl = "https://github.com/$githubUser/$githubRepo/archive/refs/heads/$branch.zip"

Write-Host "Đang kiểm tra cập nhật từ GitHub..." -ForegroundColor Cyan

$latestVersion = Invoke-RestMethod -Uri $rawUrl -UseBasicParsing -TimeoutSec 5
if ($null -eq $latestVersion) {
    Write-Host "Không thể kiểm tra bản cập nhật. Vẫn tiếp tục chạy Bot." -ForegroundColor Yellow
    exit 0
}

$latestVersion = $latestVersion.Trim()

if ($currentVersion -eq $latestVersion) {
    Write-Host "Phiên bản $currentVersion là mới nhất!" -ForegroundColor Green
    exit 0
}

Write-Host "
[!] Phát hiện phiên bản mới: $latestVersion (Hiện tại: $currentVersion)!" -ForegroundColor Magenta
Write-Host "Đang tự động tải về và cập nhật... Vui lòng đợi." -ForegroundColor Yellow

# Tải file zip
Invoke-WebRequest -Uri $zipUrl -OutFile "update.zip" -UseBasicParsing

# Giải nén
if (Test-Path "update_temp") { Remove-Item "update_temp" -Recurse -Force }
Expand-Archive -Path "update.zip" -DestinationPath "update_temp" -Force

# Lấy thư mục gốc bên trong file zip (thường có dạng repo-master)
$extractedFolder = Get-ChildItem -Path "update_temp" | Where-Object { $_.PSIsContainer } | Select-Object -First 1

if ($extractedFolder) {
    # Copy toàn bộ đè lên thư mục hiện tại
    Copy-Item -Path "$($extractedFolder.FullName)\*" -Destination "." -Recurse -Force
    Write-Host "
[OK] Cập nhật mã nguồn thành công!" -ForegroundColor Green
    Write-Host "Vui lòng vào chrome://extensions tải lại (Refresh) tiện ích." -ForegroundColor Yellow
    Write-Host "Đang khởi động lại Bot..." -ForegroundColor Cyan
}

# Dọn dẹp rác
Remove-Item "update.zip" -Force
Remove-Item "update_temp" -Recurse -Force

# Trả về 1 để báo cho file bat biết là có update, cần chạy lại
exit 1
