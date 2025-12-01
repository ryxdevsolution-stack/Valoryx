# Bundle Python for Windows - RYX Billing Desktop App
# Run this script on Windows before building the installer
# Usage: .\scripts\bundle-python-windows.ps1

param(
    [string]$PythonVersion = "3.11.9"
)

$ErrorActionPreference = "Stop"

# Paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$ResourcesDir = Join-Path $ProjectRoot "desktop\resources"
$PythonDir = Join-Path $ResourcesDir "python"
$BackendDir = Join-Path $ProjectRoot "backend"
$RequirementsFile = Join-Path $BackendDir "requirements.txt"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  RYX Billing - Bundle Python for Windows" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

# Clean previous Python bundle
if (Test-Path $PythonDir) {
    Write-Host "Removing existing Python bundle..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $PythonDir
}

New-Item -ItemType Directory -Force -Path $PythonDir | Out-Null

# Download Python embeddable
$PythonUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$TempDir = Join-Path $env:TEMP "ryx-python-bundle"
$ZipFile = Join-Path $TempDir "python-embed.zip"

if (Test-Path $TempDir) {
    Remove-Item -Recurse -Force $TempDir
}
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

Write-Host "Step 1: Downloading Python $PythonVersion Embeddable..." -ForegroundColor Green
Write-Host "  URL: $PythonUrl"
Invoke-WebRequest -Uri $PythonUrl -OutFile $ZipFile -UseBasicParsing

Write-Host ""
Write-Host "Step 2: Extracting Python..." -ForegroundColor Green
Expand-Archive -Path $ZipFile -DestinationPath $PythonDir -Force

# Enable pip in embeddable Python
Write-Host ""
Write-Host "Step 3: Enabling pip support..." -ForegroundColor Green

# Modify python311._pth to enable site-packages
$PthFile = Get-ChildItem -Path $PythonDir -Filter "python*._pth" | Select-Object -First 1
if ($PthFile) {
    $PthContent = @"
python311.zip
.
Lib\site-packages
import site
"@
    Set-Content -Path $PthFile.FullName -Value $PthContent
    Write-Host "  Modified $($PthFile.Name) to enable site-packages"
}

# Download and install pip
Write-Host ""
Write-Host "Step 4: Installing pip..." -ForegroundColor Green
$GetPipUrl = "https://bootstrap.pypa.io/get-pip.py"
$GetPipFile = Join-Path $TempDir "get-pip.py"
Invoke-WebRequest -Uri $GetPipUrl -OutFile $GetPipFile -UseBasicParsing

$PythonExe = Join-Path $PythonDir "python.exe"
& $PythonExe $GetPipFile --no-warn-script-location

# Create Lib\site-packages if not exists
$SitePackages = Join-Path $PythonDir "Lib\site-packages"
if (-not (Test-Path $SitePackages)) {
    New-Item -ItemType Directory -Force -Path $SitePackages | Out-Null
}

# Install requirements
Write-Host ""
Write-Host "Step 5: Installing dependencies from requirements.txt..." -ForegroundColor Green
$PipExe = Join-Path $PythonDir "Scripts\pip.exe"

if (Test-Path $RequirementsFile) {
    & $PythonExe -m pip install -r $RequirementsFile --no-warn-script-location --quiet
    Write-Host "  Dependencies installed successfully"
} else {
    Write-Host "  WARNING: requirements.txt not found at $RequirementsFile" -ForegroundColor Yellow
}

# Cleanup unnecessary files
Write-Host ""
Write-Host "Step 6: Cleaning up unnecessary files..." -ForegroundColor Green

# Remove pip cache
$PipCache = Join-Path $PythonDir "Scripts\pip*.exe"
# Keep pip for potential updates, but remove cache
$CacheDir = Join-Path $env:LOCALAPPDATA "pip\cache"
if (Test-Path $CacheDir) {
    Remove-Item -Recurse -Force $CacheDir -ErrorAction SilentlyContinue
}

# Remove __pycache__ directories
Get-ChildItem -Path $PythonDir -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# Remove test directories
Get-ChildItem -Path $PythonDir -Recurse -Directory -Filter "test" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $PythonDir -Recurse -Directory -Filter "tests" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# Remove .pyc files
Get-ChildItem -Path $PythonDir -Recurse -Filter "*.pyc" | Remove-Item -Force -ErrorAction SilentlyContinue

# Verify installation
Write-Host ""
Write-Host "Step 7: Verifying installation..." -ForegroundColor Green
& $PythonExe --version
& $PythonExe -c "import flask; print(f'Flask: {flask.__version__}')"
& $PythonExe -c "import sqlalchemy; print(f'SQLAlchemy: {sqlalchemy.__version__}')"

# Cleanup temp
Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue

# Calculate size
$Size = (Get-ChildItem -Path $PythonDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$SizeFormatted = "{0:N2} MB" -f $Size

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Python bundle created successfully!" -ForegroundColor Green
Write-Host "  Location: $PythonDir" -ForegroundColor White
Write-Host "  Size: $SizeFormatted" -ForegroundColor White
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Build the frontend: npm run build"
Write-Host "  2. Build the Windows installer: npm run dist:win"
Write-Host ""
