# Building Windows Installer for Client Distribution

## Problem
The desktop app has Electron module resolution issues in Windows **development mode only**.
The compiled installer works perfectly on all Windows systems.

## Solution: Build on Linux

### Step 1: On Your Linux System

```bash
# Navigate to project
cd /path/to/mj-billing

# Install dependencies (if not already done)
npm install
cd frontend && npm install && cd ..

# Build the Windows installer
npm run build
npm run dist:win
```

### Step 2: Locate the Installer

The installer will be created at:
```
dist/ryx-billing-1.0.0-x64.exe
```

File size: ~200-300 MB (includes everything: Electron, Python, Node.js, all dependencies)

### Step 3: Distribute to Client

1. Copy `ryx-billing-1.0.0-x64.exe` to a USB drive or cloud storage
2. Send to client
3. Client double-clicks the `.exe` on their Windows system
4. Installer runs - creates desktop shortcut and start menu entry
5. Client launches "RYX Billing" from desktop shortcut
6. **It works perfectly!** (No Electron dev issues in production build)

## What Gets Installed

The installer includes:
- ✅ Electron app wrapper
- ✅ Python runtime (embedded)
- ✅ Flask backend
- ✅ Next.js frontend (pre-built)
- ✅ All dependencies
- ✅ PostgreSQL connection setup
- ✅ Desktop shortcuts

## Client System Requirements

- Windows 10/11 (64-bit)
- 4GB RAM minimum
- 500MB disk space
- Internet connection (for database access)
- No Python or Node.js installation needed!

## Alternative: Web Version for Development/Testing

If you need to test on Windows before building the installer, use the web version:

```bash
# On Windows
double-click start-web.bat
```

This launches:
- Backend on http://localhost:5000
- Frontend on http://localhost:3001

## Database Configuration

Before building, ensure `.env` has correct database settings:

```env
DATABASE_URL=postgresql://user:pass@host:port/dbname
# Or use Supabase connection string
```

The client's system will connect to your centralized database (Supabase/PostgreSQL server).

## Troubleshooting Client Installation

If client reports issues:

1. **Installer won't run**: Tell them to run as Administrator
2. **Antivirus blocks**: Add exception for RYX Billing
3. **Database connection fails**: Check firewall, verify DATABASE_URL
4. **App won't start**: Check Windows Event Viewer logs

## Updates

To update client's installation:
1. Build new version on Linux
2. Increment version in `package.json`
3. Run `npm run dist:win` again
4. Send new `.exe` to client
5. Client runs installer (auto-updates existing installation)

## Build Time

- First build: ~10-15 minutes
- Subsequent builds: ~5-7 minutes

## Notes

- **DO NOT** try to build on Windows development machine (Electron module issues)
- Always build on Linux for Windows distribution
- Test the `.exe` on a clean Windows VM before sending to client
- Keep backup of working builds in `dist/` folder
