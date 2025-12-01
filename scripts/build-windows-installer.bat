@echo off
REM Build RYX Billing Windows Installer with Bundled Python
REM Run this script from the project root directory

echo ================================================
echo   RYX Billing - Windows Installer Builder
echo ================================================
echo.

REM Check if we're in the right directory
if not exist "package.json" (
    echo ERROR: Please run this script from the project root directory
    echo        where package.json is located
    pause
    exit /b 1
)

REM Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo        Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Step 1: Installing npm dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo.
echo Step 2: Bundling Python with dependencies...
powershell -ExecutionPolicy Bypass -File scripts\bundle-python-windows.ps1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Python bundling failed
    pause
    exit /b 1
)

echo.
echo Step 3: Building frontend...
call npm run build:frontend
if %ERRORLEVEL% neq 0 (
    echo ERROR: Frontend build failed
    pause
    exit /b 1
)

echo.
echo Step 4: Creating Windows installer...
call npx electron-builder --win
if %ERRORLEVEL% neq 0 (
    echo ERROR: Electron builder failed
    pause
    exit /b 1
)

echo.
echo ================================================
echo   BUILD SUCCESSFUL!
echo ================================================
echo.
echo The installer is located in: dist\
echo Look for: RYX Billing Setup *.exe
echo.
pause
