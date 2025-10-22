@echo off
echo ========================================
echo RYX Billing - Customer Table Migration
echo ========================================
echo.

cd /d "%~dp0"

echo Checking Python environment...
python --version
echo.

echo Running migration script...
python migrate_customer.py

echo.
echo Press any key to exit...
pause > nul
