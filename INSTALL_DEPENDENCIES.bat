@echo off
title RYX Billing - Installing Dependencies
color 0B

echo =========================================
echo    RYX BILLING - DEPENDENCY INSTALLER
echo =========================================
echo.
echo This will install all required dependencies.
echo This may take 5-10 minutes depending on your internet speed.
echo.
echo Please wait...
echo.

REM Install backend dependencies
echo [1/2] Installing backend dependencies...
cd /d "%~dp0backend"
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to install backend dependencies!
    echo Please make sure Python is installed correctly.
    pause
    exit /b 1
)

echo.
echo Backend dependencies installed successfully!
echo.

REM Install frontend dependencies
echo [2/2] Installing frontend dependencies...
cd /d "%~dp0frontend"
npm install
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to install frontend dependencies!
    echo Please make sure Node.js is installed correctly.
    pause
    exit /b 1
)

echo.
echo Frontend dependencies installed successfully!
echo.

REM Build frontend for production
echo Building frontend for production...
npm run build
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to build frontend!
    pause
    exit /b 1
)

echo.
echo =========================================
echo    INSTALLATION COMPLETE!
echo =========================================
echo.
echo You can now run "START_RYX_BILLING.bat" to start the application.
echo.
pause
