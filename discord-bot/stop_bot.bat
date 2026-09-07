@echo off
title Tat TPlus Discord Bot
color 0b
echo ========================================================
echo             TAT TPLUS DISCORD BOT
echo ========================================================
echo.
echo [*] Dang kiem tra trang thai Discord Bot...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$targets = @(Get-CimInstance Win32_Process | Where-Object { ($_.CommandLine -like '*bot.py*' -or $_.CommandLine -like '*bot.js*' -or ($_.Name -like 'python*' -and $_.CommandLine -like '*discord-bot*')) -and $_.ProcessId -ne $PID });" ^
  "if ($targets.Count -gt 0) {" ^
  "    Write-Host '[*] Phat hien' $targets.Count 'tien trinh Bot dang chay. Dang tien hanh tat...' -ForegroundColor Yellow;" ^
  "    $targets | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
  "    try {" ^
  "        Invoke-RestMethod -Uri 'https://fir-run-extension-t-plus-default-rtdb.asia-southeast1.firebasedatabase.app/bot_status.json' -Method Put -Body '{\"\"online\"\":false,\"\"lastActive\"\":0}' -ContentType 'application/json' -TimeoutSec 3 -ErrorAction SilentlyContinue | Out-Null;" ^
  "    } catch {};" ^
  "    Write-Host '';" ^
  "    Write-Host '[OK] Da tat toan bo tien trinh Bot thanh cong!' -ForegroundColor Green;" ^
  "    Write-Host '[OK] Da cap nhat trang thai Offline len he thong.' -ForegroundColor Cyan;" ^
  "} else {" ^
  "    Write-Host '[THONG BAO] Bot Discord hien tai KHONG hoat dong (chua duoc bat truoc do)!' -ForegroundColor Yellow;" ^
  "}"

echo.
echo ========================================================
echo Tu dong dong cua so sau 3 giay...
ping -n 4 127.0.0.1 >nul
