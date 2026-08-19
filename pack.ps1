# pack.ps1 — بسته‌بندی Smart Direction به ZIP تمیز (Windows PowerShell)
# استفاده:
#   .\pack.ps1
#   .\pack.ps1 -Version 2.3.0

param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
if (-not $Root) { $Root = Get-Location | Select-Object -ExpandProperty Path }
Set-Location $Root

# خواندن نسخه از manifest اگر آرگومان داده نشده
if ([string]::IsNullOrWhiteSpace($Version)) {
    $manifestPath = Join-Path $Root "manifest.json"
    if (-not (Test-Path $manifestPath)) {
        Write-Host "❌ manifest.json پیدا نشد." -ForegroundColor Red
        exit 1
    }
    $manifestJson = Get-Content $manifestPath -Raw -Encoding UTF8
    if ($manifestJson -match '"version"\s*:\s*"([^"]+)"') {
        $Version = $Matches[1]
    }
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    Write-Host "❌ نتوانستم نسخه را بخوانم. مثال: .\pack.ps1 -Version 2.3.0" -ForegroundColor Red
    exit 1
}

$OutName = "smart-direction-v$Version.zip"
$OutPath = Join-Path $Root $OutName
$Stage   = Join-Path $Root ".pack-stage"
$AppDir  = Join-Path $Stage "smart-direction"

# پاک‌سازی
if (Test-Path $Stage)   { Remove-Item $Stage -Recurse -Force }
if (Test-Path $OutPath) { Remove-Item $OutPath -Force }

New-Item -ItemType Directory -Path $AppDir -Force | Out-Null

Write-Host "📦 در حال بسته‌بندی نسخه $Version ..." -ForegroundColor Cyan

# manifest
Copy-Item (Join-Path $Root "manifest.json") $AppDir

# icons
$iconsSrc = Join-Path $Root "icons"
if (Test-Path $iconsSrc) {
    $iconsDst = Join-Path $AppDir "icons"
    New-Item -ItemType Directory -Path $iconsDst -Force | Out-Null
    foreach ($name in @("icon16.png", "icon48.png", "icon128.png")) {
        $src = Join-Path $iconsSrc $name
        if (Test-Path $src) { Copy-Item $src $iconsDst }
    }
}

# src
$srcDir = Join-Path $Root "src"
if (Test-Path $srcDir) {
    $srcDst = Join-Path $AppDir "src"
    New-Item -ItemType Directory -Path $srcDst -Force | Out-Null
    $files = @(
        "background.js", "content.js",
        "popup.html", "popup.css", "popup.js",
        "options.html", "options.css", "options.js"
    )
    foreach ($f in $files) {
        $src = Join-Path $srcDir $f
        if (Test-Path $src) { Copy-Item $src $srcDst }
    }
}

# اختیاری
foreach ($opt in @("LICENSE", "README.md")) {
    $p = Join-Path $Root $opt
    if (Test-Path $p) { Copy-Item $p $AppDir }
}

# ساخت ZIP
Compress-Archive -Path $AppDir -DestinationPath $OutPath -CompressionLevel Optimal -Force

# پاک‌سازی موقت
Remove-Item $Stage -Recurse -Force

$size = (Get-Item $OutPath).Length
$sizeKb = [math]::Round($size / 1KB, 1)

Write-Host ""
Write-Host "✅ بسته آماده شد:" -ForegroundColor Green
Write-Host "   $OutPath"
Write-Host "   حجم: $sizeKb KB"
Write-Host ""
Write-Host "محتوای بسته:"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($OutPath)
$zip.Entries | ForEach-Object { Write-Host "   $($_.FullName)" }
$zip.Dispose()