@echo off
title Creating Distribution Package
color 0E

echo =========================================
echo    CREATING DISTRIBUTION PACKAGE
echo =========================================
echo.

REM Create distribution folder
set DIST_FOLDER=RYX-Billing-Distribution
if exist "%DIST_FOLDER%" rmdir /s /q "%DIST_FOLDER%"
mkdir "%DIST_FOLDER%"

echo Copying files...

REM Copy backend (exclude unnecessary files)
echo - Copying backend...
xcopy /E /I /Y backend "%DIST_FOLDER%\backend" > nul
rmdir /s /q "%DIST_FOLDER%\backend\__pycache__" 2>nul
rmdir /s /q "%DIST_FOLDER%\backend\venv" 2>nul
del "%DIST_FOLDER%\backend\.env" 2>nul
del "%DIST_FOLDER%\backend\*.pyc" 2>nul

REM Copy frontend (exclude unnecessary files)
echo - Copying frontend...
xcopy /E /I /Y frontend "%DIST_FOLDER%\frontend" > nul
rmdir /s /q "%DIST_FOLDER%\frontend\node_modules" 2>nul
rmdir /s /q "%DIST_FOLDER%\frontend\.next" 2>nul

REM Copy scripts
echo - Copying scripts...
copy "START_RYX_BILLING.bat" "%DIST_FOLDER%\" > nul
copy "STOP_RYX_BILLING.bat" "%DIST_FOLDER%\" > nul
copy "INSTALL_DEPENDENCIES.bat" "%DIST_FOLDER%\" > nul
copy "INSTALLATION_GUIDE.txt" "%DIST_FOLDER%\" > nul

REM Copy .env template
echo - Creating .env template...
echo DB_MODE=offline > "%DIST_FOLDER%\backend\.env"
echo SYNC_INTERVAL_HOURS=2 >> "%DIST_FOLDER%\backend\.env"
echo DB_URL=your_supabase_url_here >> "%DIST_FOLDER%\backend\.env"
echo SUPABASE_URL=your_supabase_url_here >> "%DIST_FOLDER%\backend\.env"
echo SUPABASE_KEY=your_supabase_key_here >> "%DIST_FOLDER%\backend\.env"
echo JWT_SECRET=your_jwt_secret_here >> "%DIST_FOLDER%\backend\.env"
echo SECRET_KEY=your_secret_key_here >> "%DIST_FOLDER%\backend\.env"

echo.
echo =========================================
echo    PACKAGE CREATED SUCCESSFULLY!
echo =========================================
echo.
echo Distribution folder: %DIST_FOLDER%
echo.
echo Next steps:
echo 1. Compress "%DIST_FOLDER%" folder to a ZIP file
echo 2. Send the ZIP file to your clients
echo 3. Clients extract and follow INSTALLATION_GUIDE.txt
echo.
pause
