$ErrorActionPreference = 'SilentlyContinue'
$currentVersion = Get-Content -Path "version.txt" -Raw | ForEach-Object { $_ -replace "
|
", "" }

# --- ÐI?N THÔNG TIN GITHUB C?A B?N VÀO ÐÂY ---
$githubUser = "NhimS2"
$githubRepo = "Bot-topup"
$branch = "main"
# ---------------------------------------------

$rawUrl = "https://raw.githubusercontent.com/$githubUser/$githubRepo/$branch/version.txt"
$zipUrl = "https://github.com/$githubUser/$githubRepo/archive/refs/heads/$branch.zip"

Write-Host "Ðang ki?m tra c?p nh?t t? GitHub..." -ForegroundColor Cyan

$latestVersion = Invoke-RestMethod -Uri $rawUrl -UseBasicParsing -TimeoutSec 5
if ($null -eq $latestVersion) {
    Write-Host "Không th? ki?m tra b?n c?p nh?t. V?n ti?p t?c ch?y Bot." -ForegroundColor Yellow
    exit 0
}

$latestVersion = $latestVersion.Trim()

if ($currentVersion -eq $latestVersion) {
    Write-Host "Phiên b?n $currentVersion là m?i nh?t!" -ForegroundColor Green
    exit 0
}

Write-Host "
[!Phát hi?n phiên b?n m?i: $latestVersion (Hi?n t?i: $currentVersion)!" -ForegroundColor Magenta
Write-Host "Ðang t? d?ng t?i v? và c?p nh?t... Vui lòng d?i." -ForegroundColor Yellow

# T?i file zip
Invoke-WebRequest -Uri $zipUrl -OutFile "update.zip" -UseBasicParsing

# Gi?i nén
if (Test-Path "update_temp") { Remove-Item "update_temp" -Recurse -Force }
Expand-Archive -Path "update.zip" -DestinationPath "update_temp" -Force

# L?y thu m?c g?c bên trong file zip (thu?ng có d?ng repo-main)
$extractedFolder = Get-ChildItem -Path "update_temp" | Where-Object { $_.PSIsContainer } | Select-Object -First 1

if ($extractedFolder) {
    # Copy toàn b? dè lên thu m?c hi?n t?i
    Copy-Item -Path "$($extractedFolder.FullName)\*" -Destination "." -Recurse -Force
    Write-Host "
[OK] C?p nh?t mã ngu?n thành công!" -ForegroundColor Green
    Write-Host "Vui lòng vào chrome://extensions t?i l?i (Refresh) ti?n ích." -ForegroundColor Yellow
    Write-Host "Ðang kh?i d?ng l?i Bot..." -ForegroundColor Cyan
}

# D?n d?p rác
Remove-Item "update.zip" -Force
Remove-Item "update_temp" -Recurse -Force

# Tr? v? 1 d? báo cho file bat bi?t là có update, c?n ch?y l?i
exit 1
