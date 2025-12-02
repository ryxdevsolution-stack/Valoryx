@echo off
REM RYX Billing Web Application Launcher for Windows
REM This starts the backend and frontend servers

echo ============================================
echo Starting RYX Billing Web Application
echo ============================================
echo.

REM Set the app directory
set APP_DIR=%~dp0
cd /d "%APP_DIR%"

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found! Please install Python 3.10+
    pause
    exit /b 1
)

echo [1/4] Checking backend dependencies...
cd backend

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
)

REM Activate virtual environment and install dependencies
echo Installing/updating backend dependencies...
call venv\Scripts\activate.bat
pip install -r requirements.txt >nul 2>&1

echo.
echo [2/4] Starting backend server (Flask on port 5000)...
start "RYX Backend" cmd /k "cd /d "%APP_DIR%backend" && venv\Scripts\activate.bat && python app.py"

REM Wait for backend to start
timeout /t 5 /nobreak >nul

cd ..

echo.
echo [3/4] Checking frontend dependencies...
cd frontend

if not exist "node_modules" (
    echo Installing frontend dependencies...
    call npm install
)

echo.
echo [4/4] Starting frontend server (Next.js on port 3001)...
start "RYX Frontend" cmd /k "cd /d "%APP_DIR%frontend" && npm run dev"

REM Wait for frontend to start
timeout /t 3 /nobreak >nul

cd ..

echo.
echo ============================================
echo RYX Billing is starting...
echo ============================================
echo.
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:3001
echo.
echo The application will open in your default browser shortly...
echo.
echo To stop the servers, close both command windows
echo ============================================

REM Wait a bit more for services to fully start
timeout /t 5 /nobreak >nul

REM Open the application in default browser
start http://localhost:3001

echo.
echo Application launched successfully!
echo Press any key to close this window (servers will keep running)
pause >nul
