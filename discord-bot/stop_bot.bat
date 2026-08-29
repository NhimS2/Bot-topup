@echo off
title Tat TPlus Discord Bot
color 0c
echo Dang tim va tat tien trinh Discord Bot chay ngam...

taskkill /f /im python.exe /fi "WINDOWTITLE eq TPlus Remote Discord Controller Bot*" 2>nul
taskkill /f /im pythonw.exe 2>nul
wmic process where "commandline like '%%bot.py%%'" call terminate >nul 2>nul
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*bot.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>nul

echo.
echo [OK] Da tat Bot thanh cong!
timeout /t 2 >nul
