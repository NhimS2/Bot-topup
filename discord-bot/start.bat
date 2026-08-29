@echo off
title TPlus Remote Discord Controller Bot
color 0b
echo ========================================================
echo        TPLUS REMOTE DISCORD CONTROLLER BOT
echo ========================================================
echo.

cd /d "%~dp0"

if not exist "node_modules\" (
    echo [1/2] Dang cai dat thu vien discord.js va dotenv...
    call npm install
    echo.
)

echo [2/2] Dang khoi chay Discord Bot...
echo.
node bot.js

if %errorlevel% neq 0 (
    echo.
    echo [LOI] Bot da bi dung. Nhan phim bat ky de thoat...
    pause >nul
)
