@echo off
title TPlus Remote Discord Controller Bot (Python)
color 0b
echo ========================================================
echo     TPLUS REMOTE DISCORD CONTROLLER BOT (PYTHON)
echo ========================================================
cd /d "%~dp0"

:: Kiem tra va cap nhat ma nguon tu dong tu thu muc goc
echo ========================================================
echo        KIEM TRA CAP NHAT TPLUS AUTO TOPUP
echo ========================================================
cd ..
powershell -ExecutionPolicy Bypass -File auto_update.ps1
if %errorlevel% equ 1 (
    echo [!] Vua moi cap nhat xong. Dang tu dong khoi dong lai...
    timeout /t 3 /nobreak >nul
    :: Chay lai chinh no
    cd discord-bot
    start "" cmd /c "%~nx0"
    exit
)
cd discord-bot

:CheckPython
set "PYTHON_EXE="

:: 1. Kiem tra thu muc cai dat thong dung
for /d %%i in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
    if exist "%%i\python.exe" (
        set "PYTHON_EXE=%%i\python.exe"
    )
)

if not defined PYTHON_EXE (
    for /d %%i in ("%LOCALAPPDATA%\Python\pythoncore-*") do (
        if exist "%%i\python.exe" (
            set "PYTHON_EXE=%%i\python.exe"
        )
    )
)

:: 2. Kiem tra py launcher
if not defined PYTHON_EXE (
    py -c "print('OK')" >nul 2>&1
    if %errorlevel% equ 0 set "PYTHON_EXE=py"
)

:: 3. Kiem tra python trong PATH
if not defined PYTHON_EXE (
    python -c "print('OK')" >nul 2>&1
    if %errorlevel% equ 0 set "PYTHON_EXE=python"
)

:: 4. Kiem tra C:\Python* hoac Program Files
if not defined PYTHON_EXE (
    for /d %%i in ("C:\Python3*", "%ProgramFiles%\Python3*") do (
        if exist "%%i\python.exe" (
            set "PYTHON_EXE=%%i\python.exe"
        )
    )
)

:: 5. Neu van khong co, bat dau tai va cai dat tu dong vao thu muc TEMP
if not defined PYTHON_EXE (
    echo [!] Khong tim thay Python hop le tren may tinh.
    echo [!] Dang tu dong tai va cai dat Python 3.11... (Vui long doi vai phut)
    set "INSTALLER_PATH=%TEMP%\python-installer.exe"
    curl -L -k -o "%INSTALLER_PATH%" https://www.python.org/ftp/python/3.11.8/python-3.11.8-amd64.exe
    if %errorlevel% neq 0 (
        echo [LOI] Khong the tai xuong Python tu dong. Vui long cai dat thu cong tai: https://www.python.org/downloads/
        pause
        exit /b 1
    )
    echo [!] Dang tien hanh cai dat Python... (Vui long cap quyen neu co bang hoi hien len)
    start /wait "" "%INSTALLER_PATH%" /quiet InstallAllUsers=0 PrependPath=1 Include_test=0 Include_doc=0 Include_tcltk=0 Include_pip=1
    del /f /q "%INSTALLER_PATH%" >nul 2>&1
    
    :: Tim lai duong dan sau khi cai
    for /d %%i in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
        if exist "%%i\python.exe" (
            set "PYTHON_EXE=%%i\python.exe"
        )
    )
    
    if not defined PYTHON_EXE (
        echo [LOI] Cai dat Python xong nhung chua tim thay file chay.
        echo Vui long tat bang nay, roi bat lai start_python.bat de ap dung cai dat.
        pause
        exit /b 1
    )
)

echo [OK] Da tim thay Python: %PYTHON_EXE%
echo.

"%PYTHON_EXE%" -c "import discord, dotenv" >nul 2>&1
if %errorlevel% neq 0 (
    echo [1/2] Dang cai dat thu vien discord.py, python-dotenv...
    "%PYTHON_EXE%" -m pip install -r requirements.txt
    echo.
)

echo [2/2] Dang khoi chay Discord Bot bang Python...
echo.
"%PYTHON_EXE%" bot.py

if %errorlevel% neq 0 (
    echo.
    echo [LOI] Bot da bi dung. Nhan phim bat ky de thoat...
    pause >nul
)
