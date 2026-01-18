@echo off
title RYX Billing - Stopping...

echo Stopping RYX Billing...

REM Kill Python (Flask backend)
taskkill /F /IM python.exe /T > nul 2>&1

REM Kill Node (Next.js frontend)
taskkill /F /IM node.exe /T > nul 2>&1

echo.
echo RYX Billing has been stopped.
echo.
pause
