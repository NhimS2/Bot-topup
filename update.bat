@echo off
set "WEBHOOK_URL=https://discord.com/api/webhooks/1551410468957200489/p5ZZPrX-t-1mBjgCWdX9q38O1UNu__PkRUpTGn5LWnsUUoQjkL7jno78TEwqQLfisEG9"

:: Doc version hien tai
if not exist "version.txt" echo 0 > version.txt
set /p LOCAL_VER=<version.txt
:: Xoa khoang trang du thua neu co
set LOCAL_VER=%LOCAL_VER: =%

:: Kiem tra version tren Github
curl -L -k -s -o version_online.txt https://raw.githubusercontent.com/NhimS2/Bot-topup/master/version.txt
if not exist "version_online.txt" exit /b 0
set /p ONLINE_VER=<version_online.txt
del version_online.txt >nul 2>&1
set ONLINE_VER=%ONLINE_VER: =%

:: Neu giong nhau thi thoi
if "%LOCAL_VER%"=="%ONLINE_VER%" exit /b 0

echo [!] Phat hien phien ban moi (v%ONLINE_VER%). Dang tai cap nhat...
curl -L -k -s -o update.zip https://github.com/NhimS2/Bot-topup/archive/refs/heads/master.zip
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Invoke-RestMethod -Uri '%WEBHOOK_URL%' -Method Post -ContentType 'application/json' -Body '{\"content\":\"**[LỖI HỆ THỐNG]**\n🖥️ **Máy:** ```%COMPUTERNAME%```\n❌ **Lỗi:** Lỗi tải bản cập nhật (CURL thất bại).\"}'" >nul 2>&1
    exit /b 0
)

tar -xf update.zip
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Invoke-RestMethod -Uri '%WEBHOOK_URL%' -Method Post -ContentType 'application/json' -Body '{\"content\":\"**[LỖI HỆ THỐNG]**\n🖥️ **Máy:** ```%COMPUTERNAME%```\n❌ **Lỗi:** Lỗi giải nén bản cập nhật (TAR thất bại).\"}'" >nul 2>&1
    del update.zip >nul 2>&1
    exit /b 0
)

:: Copy de cac file moi tu thu muc vua giai nen ra ngoai
xcopy /Y /E /Q "Bot-topup-master\*" . >nul 2>&1

:: Don dep rac
rmdir /S /Q Bot-topup-master >nul 2>&1
del update.zip >nul 2>&1

echo [OK] Da cap nhat thanh cong.
exit /b 1
