# QZ Tray Silent Printing Setup Guide

## Overview

QZ Tray enables **silent printing** - bills print directly to your thermal printer without any browser dialog or confirmation popup.

## Quick Setup (5 minutes)

### Step 1: Download QZ Tray

1. Go to: https://qz.io/download/
2. Download the installer for your operating system:
   - **Windows**: `qz-tray-2.x.x.exe`
   - **Linux**: `qz-tray-2.x.x.run`
   - **Mac**: `qz-tray-2.x.x.pkg`

### Step 2: Install QZ Tray

**Windows:**
```
1. Run the downloaded .exe file
2. Follow the installation wizard
3. QZ Tray will start automatically
```

**Linux:**
```bash
chmod +x qz-tray-*.run
sudo ./qz-tray-*.run
```

**Mac:**
```
1. Open the downloaded .pkg file
2. Follow the installation wizard
3. Grant necessary permissions when prompted
```

### Step 3: Start QZ Tray

QZ Tray should start automatically after installation. You'll see a small QZ icon in your system tray (near the clock).

If not running:
- **Windows**: Search for "QZ Tray" in Start menu
- **Linux**: Run `qz-tray` from terminal
- **Mac**: Open QZ Tray from Applications

### Step 4: Configure Printer in Billing App

1. Open the billing application
2. Go to **Printer Settings** (gear icon or settings menu)
3. You should see "QZ Tray Connected" with a green indicator
4. Select your thermal printer from the list
5. Click "Test Print" to verify

## How It Works

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Your Browser  │ ───► │    QZ Tray      │ ───► │ Thermal Printer │
│  (Billing App)  │  JS  │ (Background)    │  Raw │   (USB/Network) │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

1. User clicks "Print Bill" in the browser
2. JavaScript sends print data to QZ Tray (running locally)
3. QZ Tray sends raw ESC/POS commands to the printer
4. **No dialog, no popup, instant silent print!**

## Supported Printers

QZ Tray works with most thermal receipt printers:

| Brand | Models |
|-------|--------|
| Epson | TM-T88, TM-T20, TM-U220, TM-T82 |
| Star | TSP100, TSP650, mPOP |
| Bixolon | SRP-350, SRP-330 |
| Citizen | CT-S310, CT-S2000 |
| Custom | KUBE, TG2480 |
| Generic | Any ESC/POS compatible |

## Troubleshooting

### "QZ Tray Not Connected"

1. **Check if QZ Tray is running**: Look for QZ icon in system tray
2. **Restart QZ Tray**: Right-click tray icon → Exit, then start again
3. **Refresh the page**: Sometimes a browser refresh helps
4. **Firewall**: Allow QZ Tray through your firewall (port 8181)

### "No Printers Found"

1. **Check printer connection**: Is the USB cable connected?
2. **Check printer power**: Is the printer turned on?
3. **Install drivers**: Some printers need drivers installed
4. **Restart QZ Tray**: After connecting printer, restart QZ Tray

### Print Quality Issues

1. **Paper width**: Make sure you're using 80mm paper
2. **Paper alignment**: Check paper is properly loaded
3. **Printer settings**: Adjust density in printer settings

### First Time Permission

When you first try to print, your browser may ask to allow the connection to QZ Tray. **Click Allow** to enable printing.

## Fallback Mode

If QZ Tray is not available, the system automatically falls back to:

- **Local deployment**: Backend server printing (using `lp` command)
- **Remote deployment**: Browser's native print dialog (requires user confirmation)

## Security Notes

- QZ Tray only accepts connections from localhost by default
- HTTPS is recommended for production use
- For enterprise deployment, you can configure trusted certificates

## Support

- QZ Tray Documentation: https://qz.io/wiki/
- QZ Tray Support: https://qz.io/support/
- GitHub Issues: https://github.com/qzind/tray/issues

---

## Quick Reference

| Action | How To |
|--------|--------|
| Start QZ Tray | Click QZ icon in Start menu or Applications |
| Stop QZ Tray | Right-click tray icon → Exit |
| Check Status | Look for QZ icon in system tray |
| View Logs | Right-click tray icon → View Logs |
| Select Printer | Billing App → Printer Settings → Select |
| Test Print | Billing App → Printer Settings → Test Print |
