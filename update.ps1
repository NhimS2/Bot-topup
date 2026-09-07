# TPlus Auto Topup - Auto Update Script
$REPO_OWNER = "NhimS2"
$REPO_NAME = "Bot-topup"
$BRANCH = "master"
$VERSION_URL = "https://raw.githubusercontent.com/$REPO_OWNER/$REPO_NAME/$BRANCH/version.txt"
$ZIP_URL = "https://github.com/$REPO_OWNER/$REPO_NAME/archive/refs/heads/$BRANCH.zip"

$currentDir = Get-Location
$localVersionFile = Join-Path $currentDir "version.txt"
$localVersion = "1.0.0"
if (Test-Path $localVersionFile) {
    $localVersion = (Get-Content $localVersionFile -Raw).Trim()
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       KIEM TRA CAP NHAT TPLUS AUTO TOPUP" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "[*] Phien ban hien tai tren may: v$localVersion"

try {
    $remoteVersion = (Invoke-RestMethod -Uri "$VERSION_URL?t=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" -TimeoutSec 5).Trim()
    Write-Host "[*] Phien ban moi nhat tren server: v$remoteVersion"
    
    if ($remoteVersion -and ($remoteVersion -ne $localVersion)) {
        Write-Host "[!] Phat hien phien ban moi (v$remoteVersion)! Dang tien hanh cap nhat..." -ForegroundColor Yellow
        
        $tempZip = Join-Path $env:TEMP "tplus_update.zip"
        $tempExtract = Join-Path $env:TEMP "tplus_extract"
        
        if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue }
        
        Invoke-WebRequest -Uri $ZIP_URL -OutFile $tempZip -TimeoutSec 30
        Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
        
        $extractedFolder = Get-ChildItem -Path $tempExtract | Where-Object { $_.PSIsContainer } | Select-Object -First 1
        if ($extractedFolder) {
            Get-ChildItem -Path $extractedFolder.FullName -Recurse | ForEach-Object {
                $relPath = $_.FullName.Substring($extractedFolder.FullName.Length + 1)
                $destPath = Join-Path $currentDir $relPath
                
                # Khong ghi de file .env neu da co
                if ($relPath -eq "discord-bot\.env" -and (Test-Path $destPath)) {
                    return
                }
                
                if ($_.PSIsContainer) {
                    if (!(Test-Path $destPath)) { New-Item -ItemType Directory -Path $destPath -Force | Out-Null }
                } else {
                    Copy-Item -Path $_.FullName -Destination $destPath -Force
                }
            }
            
            Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
            Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
            
            Write-Host "[OK] Da cap nhat len phien ban v$remoteVersion thanh cong!" -ForegroundColor Green
            exit 1
        }
    } else {
        Write-Host "[OK] Ban dang su dung phien ban moi nhat." -ForegroundColor Green
        exit 0
    }
} catch {
    Write-Host "[!] Khong the ket noi toi server cap nhat (Tiep tuc dung ban hien tai)." -ForegroundColor Gray
    exit 0
}
