@echo off
title RYX Billing - Starting...
color 0A

echo =========================================
echo    RYX BILLING DESKTOP APPLICATION
echo =========================================
echo.
echo Starting backend server...
echo.

REM Start Flask backend in background
cd /d "%~dp0backend"
start /B python app.py > nul 2>&1

REM Wait for backend to start
timeout /t 5 /nobreak > nul

echo Backend started!
echo.
echo Starting application...
echo.

REM Start Next.js frontend and open browser
cd /d "%~dp0frontend"
start /B npm start > nul 2>&1

REM Wait for frontend to start
timeout /t 8 /nobreak > nul

REM Open browser
start http://localhost:3000

echo.
echo =========================================
echo    RYX BILLING IS NOW RUNNING!
echo =========================================
echo.
echo The application is open in your browser.
echo.
echo DO NOT CLOSE THIS WINDOW!
echo Closing this window will stop the application.
echo.
echo To stop the application, close this window
echo or press Ctrl+C
echo.
pause
