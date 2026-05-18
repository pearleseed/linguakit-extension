# ==============================================================================
# Tesseract OCR Resource Setup Script for LinguaKit (PowerShell Version)
#
# This script automates preparing WebAssembly and language models for offline OCR.
# It requires NO npm or bun:
# - If node_modules is present, it copies assets locally.
# - If node_modules is missing, it downloads them directly from high-speed CDNs.
# ==============================================================================

# Disable progress bar to significantly speed up Invoke-WebRequest
$ProgressPreference = 'SilentlyContinue'

Write-Host "==================================================" -ForegroundColor Yellow
Write-Host "🌀 Starting LinguaKit OCR Setup (PowerShell Script)" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Yellow

# 1. Resolve target extension directory dynamically
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Fallback to current location if running line-by-line
if ([string]::IsNullOrEmpty($ScriptDir)) {
    $ScriptDir = (Get-Location).Path
}

$RootDir = $null
$CurrentDir = $ScriptDir

# Traverse upwards to find the directory containing 'extension\src\common'
while ($CurrentDir -ne $null -and $CurrentDir -ne "") {
    if (Test-Path (Join-Path $CurrentDir "extension\src\common")) {
        $RootDir = $CurrentDir
        break
    }
    $ParentDir = Split-Path -Parent $CurrentDir
    if ($ParentDir -eq $CurrentDir) {
        break
    }
    $CurrentDir = $ParentDir
}

# Fallback: check current directory
if ($null -eq $RootDir) {
    if (Test-Path "extension\src\common") {
        $RootDir = (Get-Location).Path
    }
}

if ($null -eq $RootDir) {
    Write-Host "✗ Error: Could not locate the extension directory containing 'extension\src\common'." -ForegroundColor Red
    Write-Host "Please make sure to run this script from inside the project directory tree." -ForegroundColor Yellow
    Exit 1
}

$TesseractDestDir = Join-Path $RootDir "extension\src\common\tesseract"
$TessdataDestDir = Join-Path $TesseractDestDir "tessdata"

# Ensure target directories exist
if (-not (Test-Path $TesseractDestDir)) {
    New-Item -ItemType Directory -Force -Path $TesseractDestDir | Out-Null
}
if (-not (Test-Path $TessdataDestDir)) {
    New-Item -ItemType Directory -Force -Path $TessdataDestDir | Out-Null
}

Write-Host "✓ Verified target directories at extension\src\common\tesseract\" -ForegroundColor Green

# 2. Check local source folders (installed via bun/npm install)
$TesseractJsSrc = Join-Path $RootDir "node_modules\tesseract.js\dist"
$TesseractCoreSrc = Join-Path $RootDir "node_modules\tesseract.js-core"

$UseLocal = $false
if ((Test-Path $TesseractJsSrc) -and (Test-Path $TesseractCoreSrc)) {
    $UseLocal = $true
    Write-Host "📦 Found local node_modules! Using offline copy mode." -ForegroundColor Green
} else {
    Write-Host "🌐 node_modules not found. Running in standalone CDN download mode." -ForegroundColor Cyan
}

# Helper function to download files
function Download-File {
    param (
        [string]$Url,
        [string]$DestPath,
        [string]$FileName
    )

    Write-Host "Downloading $FileName from CDN..." -ForegroundColor Cyan
    try {
        Invoke-WebRequest -Uri $Url -OutFile $DestPath -ErrorAction Stop
        Write-Host "✓ Successfully downloaded: $FileName" -ForegroundColor Green
    }
    catch {
        Write-Host "✗ Failed to download $FileName. Error: $_" -ForegroundColor Red
        Exit 1
    }
}

# Helper function to copy files
function Copy-File {
    param (
        [string]$SrcPath,
        [string]$DestPath,
        [string]$FileName
    )

    try {
        Copy-Item -Path $SrcPath -Destination $DestPath -Force -ErrorAction Stop
        Write-Host "✓ Copied: $FileName" -ForegroundColor DarkGray
    }
    catch {
        Write-Host "✗ Failed to copy $FileName. Error: $_" -ForegroundColor Red
        Exit 1
    }
}

# ==============================================================================
# Step 1: Process Tesseract.js libraries (tesseract.min.js, worker.min.js)
# ==============================================================================
Write-Host "`n📦 Step 1: Processing Tesseract.js libraries..." -ForegroundColor Cyan
$TesseractJsFiles = @("tesseract.min.js", "worker.min.js")

foreach ($file in $TesseractJsFiles) {
    $DestFile = Join-Path $TesseractDestDir $file
    if ($UseLocal) {
        Copy-File -SrcPath (Join-Path $TesseractJsSrc $file) -DestPath $DestFile -FileName $file
    } else {
        Download-File -Url "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/$file" -DestPath $DestFile -FileName $file
    }
}

# ==============================================================================
# Step 2: Process WebAssembly Cores (18 core files)
# ==============================================================================
Write-Host "`n⚙️ Step 2: Processing WebAssembly cores..." -ForegroundColor Cyan
$CoreFiles = @(
    "tesseract-core.js",
    "tesseract-core.wasm",
    "tesseract-core.wasm.js",
    "tesseract-core-lstm.js",
    "tesseract-core-lstm.wasm",
    "tesseract-core-lstm.wasm.js",
    "tesseract-core-simd.js",
    "tesseract-core-simd.wasm",
    "tesseract-core-simd.wasm.js",
    "tesseract-core-simd-lstm.js",
    "tesseract-core-simd-lstm.wasm",
    "tesseract-core-simd-lstm.wasm.js",
    "tesseract-core-relaxedsimd.js",
    "tesseract-core-relaxedsimd.wasm",
    "tesseract-core-relaxedsimd.wasm.js",
    "tesseract-core-relaxedsimd-lstm.js",
    "tesseract-core-relaxedsimd-lstm.wasm",
    "tesseract-core-relaxedsimd-lstm.wasm.js"
)

if ($UseLocal) {
    foreach ($file in $CoreFiles) {
        Copy-File -SrcPath (Join-Path $TesseractCoreSrc $file) -DestPath (Join-Path $TesseractDestDir $file) -FileName $file
    }
    Write-Host "✓ Copied all 18 WebAssembly core files." -ForegroundColor Green
} else {
    foreach ($file in $CoreFiles) {
        $DestFile = Join-Path $TesseractDestDir $file
        # Skip download if already exists (WASM cores are static)
        if ((Test-Path $DestFile) -and ((Get-Item $DestFile).Length -gt 0)) {
            Write-Host "✓ WebAssembly core $file already exists. Skipping." -ForegroundColor DarkGray
        } else {
            Download-File -Url "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0/$file" -DestPath $DestFile -FileName $file
        }
    }
    Write-Host "✓ Loaded all 18 WebAssembly core files." -ForegroundColor Green
}

# ==============================================================================
# Step 3: Fetch language models from high-speed Project Naptha CDN
# ==============================================================================
Write-Host "`n🌐 Step 3: Fetching language models..." -ForegroundColor Cyan
$LangModels = @(
    "eng.traineddata.gz",
    "vie.traineddata.gz",
    "jpn.traineddata.gz"
)

foreach ($model in $LangModels) {
    $DestFile = Join-Path $TessdataDestDir $model
    
    # Avoid redundant heavy downloads
    if (Test-Path $DestFile) {
        $item = Get-Item $DestFile
        if ($item.Length -gt 1MB) {
            Write-Host "✓ Language model $model already exists. Skipping download." -ForegroundColor Green
            continue
        }
    }

    Download-File -Url "https://tessdata.projectnaptha.com/4.0.0/$model" -DestPath $DestFile -FileName $model
}

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "🎉 LinguaKit OCR Setup Completed Successfully!" -ForegroundColor Green
Write-Host "Assets fully populated at: extension\src\common\tesseract\" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
