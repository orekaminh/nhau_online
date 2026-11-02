@echo off
title Chia se Phong Nhau Ao - Cloudflare Tunnel
color 0B
echo ====================================================================
echo      CHIA SE PHONG NHAU AO RA INTERNET VOI CLOUDFLARE TUNNEL
echo ====================================================================
echo.

:: 1. Kiem tra xem Python server da chay chua
netstat -ano | findstr :8000 >nul
if %errorlevel% neq 0 (
    echo [1/3] Server local chua chay. Dang tu dong mo server Quan Nhau...
    start "Phong Nhau Ao - Server Backend" cmd /k "python app.py"
    timeout /t 3 /nobreak >nul
) else (
    echo [1/3] Server local dang hoat dong tot tren cong 8000!
)

:: 2. Kiem tra file cloudflared.exe
if not exist "%~dp0cloudflared.exe" (
    echo [2/3] Dang tai Cloudflare Tunnel (cloudflared.exe)...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe', '%~dp0cloudflared.exe')"
    if not exist "%~dp0cloudflared.exe" (
        echo [LOI] Khong the tai cloudflared.exe. Vui long kiem tra mang.
        pause
        exit /b
    )
    echo [2/3] Da tai xong cloudflared.exe!
) else (
    echo [2/3] Da tim thay Cloudflare Tunnel!
)

:: 3. Chay Cloudflare Tunnel
echo.
echo ====================================================================
echo  [3/3] DANG KET NOI CLOUDFLARE EDGE NETWORK...
echo.
echo  TIM DONG CO LINK DANG:
echo  ==============================================================
echo  https://xxxx-xxxx-xxxx.trycloudflare.com
echo  ==============================================================
echo.
echo  - Copy link https do gui vao Zalo / Facebook / Telegram.
echo  - Ban be co the bam vao bang DIEN THOAI (4G/Wifi) hoac MAY TINH.
echo  - Ho se xuat hien ngay trong quan nhau 3D cung ban!
echo.
echo  (Nhan Ctrl+C hoac tat cua so nay de dung chia se)
echo ====================================================================
echo.

"%~dp0cloudflared.exe" tunnel --url http://localhost:8000
pause
