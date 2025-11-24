#!/bin/bash

# RYX Billing - Universal Build Script
echo "=========================================="
echo "RYX Billing Build System"
echo "=========================================="
echo

# Function to check dependencies
check_dependencies() {
    if [ ! -d "node_modules/electron" ] || [ ! -d "node_modules/electron-builder" ]; then
        echo "Installing dependencies..."
        npm install --save-dev electron electron-builder
    fi
}

# Function to run the app
run_app() {
    echo "Starting RYX Billing..."

    # Kill existing processes
    pkill -f "python.*app.py" 2>/dev/null
    pkill -f "npm.*dev" 2>/dev/null
    sleep 2

    # Start Backend
    echo "Starting Backend..."
    cd backend
    if [ -f "venv/bin/python" ]; then
        ./venv/bin/python app.py &
    else
        python3 app.py &
    fi
    BACKEND_PID=$!
    cd ..

    # Start Frontend
    echo "Starting Frontend..."
    cd frontend
    npm run dev &
    FRONTEND_PID=$!
    cd ..

    echo
    echo "✅ App running at: http://localhost:3001"
    echo "Press Ctrl+C to stop"

    trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
    wait
}

# Function to run desktop app
run_desktop() {
    echo "Starting Desktop App..."
    check_dependencies
    npm start
}

# Function to build for Linux
build_linux() {
    echo "Building for Linux..."
    check_dependencies
    npm run dist-linux
    echo
    echo "✅ Linux installers created:"
    ls -lh dist/*.{AppImage,deb,snap} 2>/dev/null
}

# Function to build for Windows
build_windows() {
    echo "Building for Windows..."

    # Check if Wine is installed
    if ! command -v wine &> /dev/null; then
        echo "⚠️  Wine is required to build Windows apps on Linux"
        echo "Install with: sudo apt install wine wine32 wine64"
        return 1
    fi

    check_dependencies
    npm run dist-win
    echo
    echo "✅ Windows installer created:"
    ls -lh dist/*.exe 2>/dev/null
}

# Function to build for macOS
build_mac() {
    echo "Building for macOS..."

    if [[ "$OSTYPE" != "darwin"* ]]; then
        echo "⚠️  Warning: Building Mac apps on Linux has limitations"
        echo "Recommended: Build on actual macOS or use CI/CD"
    fi

    check_dependencies
    npm run dist-mac
    echo
    echo "✅ macOS installer created:"
    ls -lh dist/*.dmg 2>/dev/null
}

# Function to build all platforms
build_all() {
    echo "Building for all platforms..."
    check_dependencies
    npm run dist
    echo
    echo "✅ All installers created:"
    ls -lh dist/*.{AppImage,deb,exe,dmg} 2>/dev/null
}

# Main menu
echo "Select option:"
echo "1) Run app (browser)"
echo "2) Run desktop app"
echo "3) Build Linux installers"
echo "4) Build Windows installer"
echo "5) Build macOS installer"
echo "6) Build all platforms"
echo "7) Clean build files"
echo

read -p "Enter choice (1-7): " choice

case $choice in
    1)
        run_app
        ;;
    2)
        run_desktop
        ;;
    3)
        build_linux
        ;;
    4)
        build_windows
        ;;
    5)
        build_mac
        ;;
    6)
        build_all
        ;;
    7)
        echo "Cleaning build files..."
        rm -rf dist/ installers/ build/ out/
        echo "✅ Cleaned"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac