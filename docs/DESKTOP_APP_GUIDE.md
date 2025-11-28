# RYX Billing - Complete Technical Documentation

> **Real-Time Desktop App Guide with Practical Scenarios**
>
> This guide explains everything about how the desktop app works with real-world examples, step-by-step walkthroughs, and what happens behind the scenes at every stage.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Real-World Problem & Solution](#2-real-world-problem--solution)
3. [Architecture Overview](#3-architecture-overview)
4. [Real-Time Scenarios](#4-real-time-scenarios)
5. [Desktop App Startup - What Really Happens](#5-desktop-app-startup---what-really-happens)
6. [Printing Flow - Behind the Scenes](#6-printing-flow---behind-the-scenes)
7. [Auto-Start Mechanism](#7-auto-start-mechanism)
8. [Auto-Update System](#8-auto-update-system)
9. [Installation Guide](#9-installation-guide)
10. [Cost Breakdown](#10-cost-breakdown)
11. [Daily Operations Guide](#11-daily-operations-guide)
12. [Maintenance Guide](#12-maintenance-guide)
13. [Troubleshooting with Real Examples](#13-troubleshooting-with-real-examples)
14. [Feature Matrix](#14-feature-matrix)
15. [Building the Desktop App](#15-building-the-desktop-app)
16. [Auto-Update System (Implementation)](#16-auto-update-system-implementation-details)
17. [App Icons & Branding](#17-app-icons--branding)
18. [Web App vs Desktop App Comparison](#18-web-app-vs-desktop-app-comparison)
19. [Developer Reference](#19-developer-reference)
20. [Deployment Checklist](#20-deployment-checklist)

---

## 1. Executive Summary

### What is RYX Billing?

RYX Billing is a complete billing solution for retail shops. It handles:
- Creating GST and non-GST bills
- Managing inventory/stock
- Tracking customers
- Generating reports
- **Printing thermal receipts (80mm paper)**

### The Core Problem We Solved

Your shop needs to print receipts on a thermal printer connected to your computer. But the web version (hosted on Render.com) cannot access your printer because:

```
YOUR COMPUTER                    CLOUD SERVER (Render.com)
┌─────────────────┐              ┌─────────────────┐
│                 │              │                 │
│  🖨️ Printer    │              │  No printer     │
│  (USB/Local)    │   ❌         │  No USB ports   │
│                 │   Cannot     │  No hardware    │
│  Your browser ──┼───connect───▶│  access         │
│                 │              │                 │
└─────────────────┘              └─────────────────┘

Error: "No printer configured"
```

### The Solution

Use the **Desktop App** that runs the backend server locally on your computer:

```
YOUR COMPUTER (Desktop App)
┌─────────────────────────────────────────────────┐
│                                                 │
│  ┌─────────────┐    ┌─────────────┐            │
│  │   Backend   │    │  Frontend   │            │
│  │   (Flask)   │    │  (Next.js)  │            │
│  │   :5000     │    │   :3001     │            │
│  └──────┬──────┘    └─────────────┘            │
│         │                                       │
│         │ Direct access                         │
│         ▼                                       │
│  ┌─────────────┐                               │
│  │  🖨️ Thermal │  ✅ WORKS!                    │
│  │   Printer   │                               │
│  └─────────────┘                               │
│                                                 │
└─────────────────────────────────────────────────┘
         │
         │ Only database on cloud
         ▼
┌─────────────────┐
│    Supabase     │
│   (Database)    │
│   FREE TIER     │
└─────────────────┘
```

### Business Summary

| Item | Value |
|------|-------|
| Client | 1 shop |
| Users | 1 admin + 1 staff |
| Revenue | ₹6,000/year |
| Hosting Cost | **₹0** (Supabase free tier) |
| **Profit** | **₹6,000/year (100%)** |

---

## 2. Real-World Problem & Solution

### Scenario: A Day at the Shop (Before Desktop App)

**9:00 AM - Shop Opens**

```
👨‍💼 Shop Owner: Opens browser, goes to ryxbilling.vercel.app
📱 Browser: Loads the website
✅ Login successful!
✅ Dashboard loads!
✅ Can see all bills!
```

**9:15 AM - First Customer**

```
👨‍💼 Shop Owner: Creates a bill for customer
✅ Bill created successfully!
✅ Stock updated!
✅ Customer record updated!

👨‍💼 Shop Owner: Clicks "Print Receipt"
❌ ERROR: "No printer configured"

😞 Owner: But my printer is right here, connected!

📋 What happened:
   1. Click "Print" button
   2. Request goes to Render.com (cloud server)
   3. Render tries to find a printer
   4. Render has no printers (it's a virtual server!)
   5. Error returned: "No printer configured"
```

**The Fundamental Problem:**
```
Your Request Journey:
──────────────────────────────────────────────────────────────────────

You (Chennai) ──────▶ Render.com (USA) ──────▶ Error!
                     Server has NO printer
                     attached

The printer is in Chennai, but the print
command runs in USA where there's no printer!
```

---

### Scenario: A Day at the Shop (With Desktop App)

**9:00 AM - Shop Opens**

```
👨‍💼 Shop Owner: Double-clicks "RYX Billing" icon on desktop
⏳ Splash screen: "Starting services..."

   Behind the scenes (3-5 seconds):
   ┌────────────────────────────────────────┐
   │ 1. Electron app starts                 │
   │ 2. Launches Flask backend (port 5000)  │
   │ 3. Launches Next.js frontend (port 3001)│
   │ 4. Waits for both to be ready          │
   │ 5. Opens main window                   │
   └────────────────────────────────────────┘

🖥️ App: Login screen appears
✅ Login successful!
✅ Dashboard loads!
```

**9:15 AM - First Customer**

```
👨‍💼 Shop Owner: Creates a bill for customer
✅ Bill created in Supabase cloud database!
✅ Stock updated!

👨‍💼 Shop Owner: Clicks "Print Receipt"

   Behind the scenes (instant):
   ┌────────────────────────────────────────┐
   │ 1. Frontend sends IPC message          │
   │ 2. Electron main process receives it   │
   │ 3. Calls local Flask backend           │
   │ 4. Flask detects thermal printer       │
   │ 5. Generates 80mm receipt              │
   │ 6. Sends to printer                    │
   └────────────────────────────────────────┘

🖨️ Thermal printer: *BRRRRR* (prints receipt)
✅ "Receipt printed successfully!"

😊 Owner: Perfect! Here's your receipt, sir.
```

---

## 3. Architecture Overview

### 3.1 Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT'S COMPUTER                                  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    ELECTRON DESKTOP APP                                │  │
│  │                                                                        │  │
│  │   ┌─────────────────┐      ┌─────────────────┐      ┌──────────────┐  │  │
│  │   │   MAIN PROCESS  │      │ RENDERER PROCESS│      │   PRELOAD    │  │  │
│  │   │   (Node.js)     │◄────▶│   (Chromium)    │◄────▶│   BRIDGE     │  │  │
│  │   │                 │ IPC  │                 │      │              │  │  │
│  │   │ • Window Mgmt   │      │ • React UI      │      │ • Secure API │  │  │
│  │   │ • Service Mgmt  │      │ • Next.js App   │      │ • No Node    │  │  │
│  │   │ • File System   │      │ • User Interface│      │   Exposure   │  │  │
│  │   │ • Printer Access│      │                 │      │              │  │  │
│  │   │ • Auto-Update   │      │                 │      │              │  │  │
│  │   └────────┬────────┘      └────────┬────────┘      └──────────────┘  │  │
│  │            │                        │                                  │  │
│  │            │ Spawns & Manages       │ HTTP Requests                    │  │
│  │            ▼                        ▼                                  │  │
│  │   ┌─────────────────┐      ┌─────────────────┐                        │  │
│  │   │  FLASK BACKEND  │◄─────│  NEXT.JS SERVER │                        │  │
│  │   │  localhost:5000 │      │  localhost:3001 │                        │  │
│  │   │                 │      │                 │                        │  │
│  │   │ • REST API      │      │ • SSR/SSG Pages │                        │  │
│  │   │ • Business Logic│      │ • Static Assets │                        │  │
│  │   │ • Print Commands│      │ • API Calls     │                        │  │
│  │   │ • File Handling │      │                 │                        │  │
│  │   └────────┬────────┘      └─────────────────┘                        │  │
│  │            │                                                           │  │
│  └────────────┼───────────────────────────────────────────────────────────┘  │
│               │                                                              │
│               │ Can access local hardware                                    │
│               ▼                                                              │
│  ┌─────────────────┐     ┌─────────────────┐                                │
│  │ THERMAL PRINTER │     │  LOCAL FILES    │                                │
│  │ (USB Connected) │     │  (Temp, Logs)   │                                │
│  └─────────────────┘     └─────────────────┘                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                │
                │ HTTPS (Internet) - Only for database
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLOUD SERVICES                                  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         SUPABASE (Free Tier)                         │   │
│   │                                                                      │   │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│   │  │  PostgreSQL  │  │   Storage    │  │     Auth     │              │   │
│   │  │   Database   │  │   (Logos)    │  │   (Future)   │              │   │
│   │  │              │  │              │  │              │              │   │
│   │  │ • Bills      │  │ • Client     │  │ • Optional   │              │   │
│   │  │ • Stock      │  │   Logos      │  │ • JWT now    │              │   │
│   │  │ • Customers  │  │ • Receipts   │  │              │              │   │
│   │  │ • Users      │  │              │  │              │              │   │
│   │  │ • Audit Logs │  │              │  │              │              │   │
│   │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│   │                                                                      │   │
│   │  Limits (Free):  500MB DB │ 1GB Storage │ 50K MAU │ Unlimited API   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 What Each Component Does (In Plain English)

**Electron Desktop App:**
Think of it as a custom browser that also has superpowers - it can access your files, printers, and run programs.

**Main Process (Node.js):**
The "manager" of the app. It:
- Opens and closes windows
- Starts the backend and frontend servers
- Handles print requests
- Manages updates

**Renderer Process (Chromium):**
This is where your actual app runs. It's basically Chrome browser showing your React app.

**Preload Bridge:**
A security guard. It only allows specific actions from the webpage to the main process. This prevents any malicious code from accessing your system.

**Flask Backend:**
Your API server. It:
- Handles all business logic
- Talks to the database
- Sends print commands to your printer

**Next.js Frontend:**
The user interface. What you see and interact with.

---

## 4. Real-Time Scenarios

### Scenario 1: Creating a Bill (Complete Flow)

**Situation:** A customer comes to buy 2 items worth ₹500.

```
STEP 1: Staff Member Opens Billing Page
─────────────────────────────────────────────────────────────────

👤 Staff: Clicks "New Bill" button

What happens internally:
┌──────────────────────────────────────────────────────────────┐
│ 1. React Router navigates to /billing/create                 │
│ 2. Page component mounts                                     │
│ 3. useEffect triggers data fetch:                            │
│    - GET /api/stock → Fetches all stock items                │
│    - GET /api/settings → Fetches GST rates, shop details     │
│ 4. Data loads into React state                               │
│ 5. Empty bill form displayed                                 │
└──────────────────────────────────────────────────────────────┘

Time taken: ~0.5 seconds


STEP 2: Adding Items to Bill
─────────────────────────────────────────────────────────────────

👤 Staff: Scans barcode "8901234567890" or searches "Cotton Shirt"

What happens internally:
┌──────────────────────────────────────────────────────────────┐
│ 1. Search query sent: GET /api/stock?search=Cotton+Shirt     │
│                                                              │
│ 2. Flask receives request                                    │
│    @app.route('/api/stock')                                  │
│    def get_stock():                                          │
│        query = request.args.get('search')                    │
│        results = Stock.query.filter(...)                     │
│        return jsonify(results)                               │
│                                                              │
│ 3. Supabase (cloud) returns matching items:                  │
│    [                                                         │
│      {                                                       │
│        "id": 42,                                              │
│        "name": "Cotton Shirt Blue",                          │
│        "mrp": 599,                                            │
│        "selling_price": 499,                                  │
│        "gst_rate": 5,                                         │
│        "available_qty": 25                                    │
│      }                                                        │
│    ]                                                         │
│                                                              │
│ 4. Staff clicks to add item                                  │
│ 5. React state updates: billItems.push(selectedItem)         │
│ 6. Totals recalculated automatically                         │
└──────────────────────────────────────────────────────────────┘

Time taken: ~0.3 seconds per search


STEP 3: Customer Details (Optional)
─────────────────────────────────────────────────────────────────

👤 Staff: "Sir, your phone number?"
🧑 Customer: "9876543210"
👤 Staff: Enters number in customer field

What happens internally:
┌──────────────────────────────────────────────────────────────┐
│ 1. Debounced search after typing: GET /api/customer/search   │
│ 2. If existing customer found:                               │
│    {                                                         │
│      "id": 15,                                                │
│      "name": "Ramesh Kumar",                                  │
│      "phone": "9876543210",                                   │
│      "total_purchases": 12500,                                │
│      "visit_count": 8                                         │
│    }                                                         │
│    → Auto-fill customer details                              │
│    → Show "Welcome back, Ramesh!" message                    │
│                                                              │
│ 3. If new customer:                                          │
│    → Show "New Customer" form                                │
│    → Staff enters name                                       │
└──────────────────────────────────────────────────────────────┘


STEP 4: Payment and Save Bill
─────────────────────────────────────────────────────────────────

👤 Staff: Selects "Cash" payment, clicks "Save Bill"

What happens internally:
┌──────────────────────────────────────────────────────────────┐
│ 1. Validation check:                                         │
│    - Are all items valid?                                    │
│    - Is payment amount >= total?                             │
│    - Is customer info complete?                              │
│                                                              │
│ 2. POST /api/billing/create                                  │
│    {                                                         │
│      "items": [...],                                          │
│      "customer_id": 15,                                       │
│      "payment_method": "cash",                                │
│      "total": 998,                                            │
│      "gst_amount": 47.52                                      │
│    }                                                         │
│                                                              │
│ 3. Flask processes:                                          │
│    a. BEGIN TRANSACTION                                      │
│    b. INSERT INTO bills (...) → Gets bill_id = 1234          │
│    c. INSERT INTO bill_items (...)                           │
│    d. UPDATE stock SET qty = qty - sold_qty                  │
│    e. UPDATE customers SET total_purchases += 998            │
│    f. INSERT INTO audit_log (...)                            │
│    g. COMMIT                                                 │
│                                                              │
│ 4. Response:                                                 │
│    { "success": true, "bill_id": 1234, "bill_number": "INV-1234" }│
│                                                              │
│ 5. Frontend shows: "Bill saved! Print receipt?"             │
└──────────────────────────────────────────────────────────────┘

Time taken: ~1 second


STEP 5: Printing Receipt
─────────────────────────────────────────────────────────────────

👤 Staff: Clicks "Print" button

What happens internally (DESKTOP APP - SILENT PRINT):
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│ Frontend (BillPrintPreview.tsx):                             │
│ ─────────────────────────────                                │
│ const handlePrint = async () => {                            │
│   // Check if running in Electron                            │
│   if (window.electronAPI) {                                  │
│     // Silent print - no dialog!                             │
│     const result = await window.electronAPI.printBill({      │
│       billId: 1234,                                          │
│       billData: billDetails                                  │
│     });                                                      │
│   }                                                          │
│ }                                                            │
│                                                              │
│ Preload Bridge (preload/index.js):                           │
│ ─────────────────────────────────                            │
│ contextBridge.exposeInMainWorld('electronAPI', {             │
│   printBill: (data) => ipcRenderer.invoke('printer:print', data)│
│ });                                                          │
│                                                              │
│ Main Process (ipc.js):                                       │
│ ──────────────────────                                       │
│ ipcMain.handle('printer:print', async (event, data) => {     │
│   // Call local backend                                      │
│   const response = await fetch('http://localhost:5000/api/print', {│
│     method: 'POST',                                          │
│     body: JSON.stringify(data)                               │
│   });                                                        │
│   return response.json();                                    │
│ });                                                          │
│                                                              │
│ Flask Backend (thermal_printer.py):                          │
│ ───────────────────────────────────                          │
│ def print_bill(bill_data):                                   │
│   # 1. Get default printer                                   │
│   printer = subprocess.run(['lpstat', '-d'])                 │
│   # Output: "system default destination: RP3220"             │
│                                                              │
│   # 2. Generate receipt text (80mm format)                   │
│   receipt = generate_thermal_receipt(bill_data)              │
│   # Output:                                                  │
│   # ════════════════════════════════════════                 │
│   # │      SHOP NAME               │                         │
│   # │      Address Line 1          │                         │
│   # │      GST: 27XXXXX1234Z       │                         │
│   # ├──────────────────────────────┤                         │
│   # │ Cotton Shirt    1 x 499  499 │                         │
│   # │ Jeans Blue      1 x 899  899 │                         │
│   # ├──────────────────────────────┤                         │
│   # │ Subtotal:              1398  │                         │
│   # │ GST (5%):               70   │                         │
│   # │ TOTAL:                1468   │                         │
│   # ├──────────────────────────────┤                         │
│   # │ Thank you for shopping!      │                         │
│   # ════════════════════════════════════════                 │
│                                                              │
│   # 3. Send to printer                                       │
│   subprocess.run(['lp', '-d', 'RP3220', '-o', 'raw', receipt])│
│                                                              │
│   return {"success": True, "printer": "RP3220"}              │
│                                                              │
└──────────────────────────────────────────────────────────────┘

🖨️ PRINTER: *BRRRRR* Receipt prints!

Time taken: ~0.5 seconds (instant feel)

👤 Staff: Hands receipt to customer
🧑 Customer: "Thank you!"
```

---

### Scenario 2: App Startup (What Happens When You Double-Click)

**Situation:** Staff member starts their day, double-clicks the RYX Billing icon.

```
SECOND 0: Double-Click
─────────────────────────────────────────────────────────────────

👤 User: Double-clicks "RYX Billing" icon

Operating System:
┌──────────────────────────────────────────────────────────────┐
│ Linux:   ./ryx-billing.AppImage                              │
│ Windows: "C:\Program Files\RYX Billing\RYX Billing.exe"      │
│                                                              │
│ OS loads the Electron executable into memory                 │
└──────────────────────────────────────────────────────────────┘


SECOND 0.1: Electron Main Process Initializes
─────────────────────────────────────────────────────────────────

File: desktop/main/index.js

┌──────────────────────────────────────────────────────────────┐
│ const { app, BrowserWindow } = require('electron');          │
│                                                              │
│ // Electron is ready                                         │
│ app.whenReady().then(() => {                                 │
│   console.log('App starting...');                            │
│                                                              │
│   // Load environment config                                 │
│   loadConfig();  // Reads .env.desktop                       │
│   // BACKEND_PORT=5000                                       │
│   // FRONTEND_PORT=3001                                      │
│   // PRINTER_ENABLED=true                                    │
│ });                                                          │
└──────────────────────────────────────────────────────────────┘


SECOND 0.2: Splash Screen Shows
─────────────────────────────────────────────────────────────────

┌──────────────────────────────────────────────────────────────┐
│ // Create splash window                                      │
│ splashWindow = new BrowserWindow({                           │
│   width: 400,                                                │
│   height: 300,                                               │
│   frame: false,                                              │
│   transparent: true                                          │
│ });                                                          │
│                                                              │
│ splashWindow.loadFile('splash.html');                        │
│                                                              │
│ User sees:                                                   │
│ ┌────────────────────────────────┐                          │
│ │                                │                          │
│ │     🛒 RYX Billing             │                          │
│ │                                │                          │
│ │     Starting services...       │                          │
│ │     ████████░░░░░░░░           │                          │
│ │                                │                          │
│ └────────────────────────────────┘                          │
└──────────────────────────────────────────────────────────────┘


SECOND 0.5: Backend Service Starts
─────────────────────────────────────────────────────────────────

File: desktop/main/services.js

┌──────────────────────────────────────────────────────────────┐
│ async function startBackend() {                              │
│   // Find Python executable                                  │
│   const pythonPath = findPython();                           │
│   // Linux: /app/backend/venv/bin/python                     │
│   // Windows: C:\...\backend\venv\Scripts\python.exe         │
│                                                              │
│   // Find backend directory                                  │
│   const backendDir = path.join(__dirname, '../../backend');  │
│                                                              │
│   // Spawn Flask process                                     │
│   backendProcess = spawn(pythonPath, [                       │
│     '-m', 'flask', 'run',                                    │
│     '--host', '127.0.0.1',                                   │
│     '--port', '5000'                                         │
│   ], {                                                       │
│     cwd: backendDir,                                         │
│     env: {                                                   │
│       ...process.env,                                        │
│       FLASK_APP: 'app.py',                                   │
│       FLASK_ENV: 'production'                                │
│     }                                                        │
│   });                                                        │
│                                                              │
│   // Listen for output                                       │
│   backendProcess.stdout.on('data', (data) => {               │
│     console.log('[Backend]', data.toString());               │
│     // Output: "* Running on http://127.0.0.1:5000"          │
│   });                                                        │
│                                                              │
│   backendProcess.stderr.on('data', (data) => {               │
│     console.error('[Backend Error]', data.toString());       │
│   });                                                        │
│ }                                                            │
│                                                              │
│ RESULT: Flask server starting on port 5000                   │
└──────────────────────────────────────────────────────────────┘


SECOND 1.0: Frontend Service Starts
─────────────────────────────────────────────────────────────────

┌──────────────────────────────────────────────────────────────┐
│ async function startFrontend() {                             │
│   const frontendDir = path.join(__dirname, '../../frontend');│
│                                                              │
│   // Spawn Next.js process                                   │
│   frontendProcess = spawn('npm', ['run', 'start'], {         │
│     cwd: frontendDir,                                        │
│     env: {                                                   │
│       ...process.env,                                        │
│       PORT: '3001',                                          │
│       NEXT_PUBLIC_API_URL: 'http://localhost:5000/api'       │
│     },                                                       │
│     shell: true                                              │
│   });                                                        │
│                                                              │
│   // Listen for output                                       │
│   frontendProcess.stdout.on('data', (data) => {              │
│     console.log('[Frontend]', data.toString());              │
│     // Output: "ready - started server on 0.0.0.0:3001"      │
│   });                                                        │
│ }                                                            │
│                                                              │
│ RESULT: Next.js server starting on port 3001                 │
└──────────────────────────────────────────────────────────────┘


SECONDS 1-4: Health Check Loop
─────────────────────────────────────────────────────────────────

┌──────────────────────────────────────────────────────────────┐
│ async function waitForServices() {                           │
│   const maxAttempts = 30;  // Try for 30 seconds             │
│   let attempts = 0;                                          │
│                                                              │
│   while (attempts < maxAttempts) {                           │
│     try {                                                    │
│       // Check backend                                       │
│       const backendCheck = await fetch(                      │
│         'http://localhost:5000/api/health'                   │
│       );                                                     │
│       // Expected: { "status": "healthy", "db": "connected" }│
│                                                              │
│       // Check frontend                                      │
│       const frontendCheck = await fetch(                     │
│         'http://localhost:3001'                              │
│       );                                                     │
│       // Expected: 200 OK                                    │
│                                                              │
│       if (backendCheck.ok && frontendCheck.ok) {             │
│         console.log('All services ready!');                  │
│         return true;                                         │
│       }                                                      │
│     } catch (err) {                                          │
│       // Service not ready yet                               │
│       console.log(`Waiting... (attempt ${attempts + 1})`);   │
│     }                                                        │
│                                                              │
│     await sleep(1000);  // Wait 1 second                     │
│     attempts++;                                              │
│   }                                                          │
│                                                              │
│   throw new Error('Services failed to start');               │
│ }                                                            │
│                                                              │
│ TYPICAL TIMELINE:                                            │
│ Attempt 1: Backend starting...                               │
│ Attempt 2: Backend ready, Frontend starting...               │
│ Attempt 3: Frontend ready! ✅                                │
└──────────────────────────────────────────────────────────────┘


SECOND 4-5: Main Window Opens
─────────────────────────────────────────────────────────────────

┌──────────────────────────────────────────────────────────────┐
│ async function createMainWindow() {                          │
│   // Close splash                                            │
│   splashWindow.close();                                      │
│                                                              │
│   // Create main window                                      │
│   mainWindow = new BrowserWindow({                           │
│     width: 1280,                                             │
│     height: 800,                                             │
│     webPreferences: {                                        │
│       preload: path.join(__dirname, '../preload/index.js'),  │
│       contextIsolation: true,                                │
│       nodeIntegration: false                                 │
│     }                                                        │
│   });                                                        │
│                                                              │
│   // Load the frontend                                       │
│   mainWindow.loadURL('http://localhost:3001');               │
│                                                              │
│   // Window events                                           │
│   mainWindow.on('closed', () => {                            │
│     mainWindow = null;                                       │
│     stopAllServices();  // Cleanup on close                  │
│   });                                                        │
│ }                                                            │
└──────────────────────────────────────────────────────────────┘


SECOND 5+: App Ready!
─────────────────────────────────────────────────────────────────

User sees:
┌────────────────────────────────────────────────────────────────┐
│ RYX Billing                                          - □ X    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                    LOGIN                                  │ │
│  │                                                          │ │
│  │    Email:    [_________________]                         │ │
│  │    Password: [_________________]                         │ │
│  │                                                          │ │
│  │              [ LOGIN ]                                   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘

TOTAL TIME: ~5 seconds from double-click to login screen
```

---

### Scenario 3: What Happens When Internet Goes Down?

**Situation:** Staff is creating a bill when WiFi disconnects.

```
DURING NORMAL OPERATION:
─────────────────────────────────────────────────────────────────

Desktop App ──── Internet ────▶ Supabase (Database)
     │                              │
     │                              │
     ▼                              │
 localhost:5000 ◄───────────────────┘
 (Backend)


INTERNET DROPS:
─────────────────────────────────────────────────────────────────

👤 Staff: Working on a bill, clicks "Save"

Timeline:
┌──────────────────────────────────────────────────────────────┐
│ Second 0: Staff clicks "Save Bill"                           │
│                                                              │
│ Second 0-5: Frontend sends request to backend                │
│   POST http://localhost:5000/api/billing/create              │
│   (This works - it's local!)                                 │
│                                                              │
│ Second 5-10: Backend tries to save to Supabase               │
│   db.session.add(new_bill)                                   │
│   db.session.commit()  ← FAILS! No internet!                 │
│                                                              │
│ Second 10: Error returned to frontend                        │
│   {                                                          │
│     "error": "Database connection failed",                   │
│     "message": "Could not reach database server"             │
│   }                                                          │
│                                                              │
│ Second 10: Frontend shows error message                      │
│   ┌────────────────────────────────────────┐                │
│   │  ⚠️ Connection Error                   │                │
│   │                                         │                │
│   │  Could not save bill. Please check     │                │
│   │  your internet connection and try      │                │
│   │  again.                                │                │
│   │                                         │                │
│   │  Your bill data is preserved.          │                │
│   │                                         │                │
│   │         [ Retry ]  [ Cancel ]          │                │
│   └────────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────┘


WHEN INTERNET COMES BACK:
─────────────────────────────────────────────────────────────────

👤 Staff: Clicks "Retry"

┌──────────────────────────────────────────────────────────────┐
│ 1. Frontend sends same request again                         │
│ 2. Backend connects to Supabase ✅                           │
│ 3. Bill saved successfully                                   │
│ 4. Staff can now print receipt                               │
└──────────────────────────────────────────────────────────────┘


WHAT STILL WORKS WITHOUT INTERNET:
─────────────────────────────────────────────────────────────────

✅ App opens and runs (Electron + local services)
✅ Login works (if session token is cached)
✅ UI navigation
✅ Viewing cached data
✅ Print functionality (printer is local)

❌ Saving new bills (needs database)
❌ Loading fresh stock data
❌ Creating new customers
❌ Generating reports
```

---

### Scenario 4: Multiple Users Scenario

**Situation:** Admin on Computer A, Staff on Computer B (same shop)

```
SETUP:
─────────────────────────────────────────────────────────────────

┌─────────────────────┐         ┌─────────────────────┐
│    COMPUTER A       │         │    COMPUTER B       │
│    (Admin PC)       │         │    (Billing Counter)│
│                     │         │                     │
│  RYX Billing App    │         │  RYX Billing App    │
│  (admin@shop.com)   │         │  (staff@shop.com)   │
│                     │         │                     │
│  Backend :5000      │         │  Backend :5000      │
│  Frontend :3001     │         │  Frontend :3001     │
│                     │         │                     │
│  🖨️ No printer     │         │  🖨️ Thermal printer│
└──────────┬──────────┘         └──────────┬──────────┘
           │                               │
           │                               │
           └───────────┬───────────────────┘
                       │
                       ▼
             ┌─────────────────┐
             │    SUPABASE     │
             │   (Shared DB)   │
             │                 │
             │  All data in    │
             │  sync instantly │
             └─────────────────┘


REAL-TIME SYNC EXAMPLE:
─────────────────────────────────────────────────────────────────

10:00:00 AM - Admin adds new stock item on Computer A:
┌──────────────────────────────────────────────────────────────┐
│ Admin: Adds "New T-Shirt Design" - 50 pieces @ ₹299          │
│                                                              │
│ Computer A Backend:                                          │
│   INSERT INTO stock (name, qty, price) VALUES (...);         │
│   → Saved to Supabase                                        │
└──────────────────────────────────────────────────────────────┘


10:00:05 AM - Staff refreshes stock list on Computer B:
┌──────────────────────────────────────────────────────────────┐
│ Staff: Refreshes the stock page                              │
│                                                              │
│ Computer B Backend:                                          │
│   SELECT * FROM stock;                                       │
│   → Gets latest data from Supabase including new item        │
│                                                              │
│ Staff sees: "New T-Shirt Design" in the list ✅              │
└──────────────────────────────────────────────────────────────┘


10:01:00 AM - Customer buys the new item on Computer B:
┌──────────────────────────────────────────────────────────────┐
│ Staff: Creates bill with "New T-Shirt Design" x 1            │
│                                                              │
│ Computer B Backend:                                          │
│   INSERT INTO bills (...);                                   │
│   UPDATE stock SET qty = qty - 1 WHERE id = 123;             │
│   → Stock now: 49 pieces                                     │
│                                                              │
│ 🖨️ Receipt prints on Computer B's thermal printer           │
└──────────────────────────────────────────────────────────────┘


10:01:30 AM - Admin checks dashboard on Computer A:
┌──────────────────────────────────────────────────────────────┐
│ Admin: Views dashboard                                       │
│                                                              │
│ Dashboard shows:                                             │
│ • Today's sales: ₹299 (1 bill)                               │
│ • New T-Shirt Design: 49 remaining (1 sold)                  │
│                                                              │
│ All synced through Supabase! ✅                              │
└──────────────────────────────────────────────────────────────┘


WHY THIS WORKS:
─────────────────────────────────────────────────────────────────

1. Both computers have their OWN local backend
2. Both backends connect to SAME Supabase database
3. Data is always in sync
4. Each computer can print to its OWN printer
5. No conflict - database handles concurrent access

The database (Supabase) is the SINGLE SOURCE OF TRUTH.
Each computer just reads/writes to it.
```

---

## 5. Desktop App Startup - What Really Happens

### 5.1 File-by-File Breakdown

```
When you run the app, these files execute in order:

1. desktop/main/index.js (Entry Point)
   │
   ├── 2. desktop/utils/config.js (Load .env.desktop)
   │
   ├── 3. desktop/main/services.js
   │   ├── startBackend() → Spawns Python Flask
   │   └── startFrontend() → Spawns Node Next.js
   │
   ├── 4. desktop/main/window.js (Create Electron window)
   │
   └── 5. desktop/main/ipc.js (Register IPC handlers)
       ├── 'printer:list' handler
       ├── 'printer:print' handler
       └── 'file:*' handlers
```

### 5.2 Process Diagram

```
BEFORE APP STARTS:
─────────────────────────────────────────────────────────────────

Your Computer's Running Processes:
• Chrome (maybe)
• File Explorer
• Other apps...

No RYX Billing processes.
Ports 5000 and 3001 are FREE.


AFTER APP STARTS:
─────────────────────────────────────────────────────────────────

Your Computer's Running Processes:

┌─────────────────────────────────────────────────────────────┐
│                    PROCESS TREE                              │
│                                                              │
│  ryx-billing (Electron)                    ← Parent Process  │
│       │                                                      │
│       ├── python flask run                  ← Backend        │
│       │   └── Listening on localhost:5000                    │
│       │                                                      │
│       ├── node next start                   ← Frontend       │
│       │   └── Listening on localhost:3001                    │
│       │                                                      │
│       └── Chromium Renderer                 ← UI Window      │
│           └── Showing http://localhost:3001                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘


WHEN APP CLOSES:
─────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────┐
│ User clicks X button                                         │
│                                                              │
│ mainWindow.on('closed', () => {                              │
│   // Kill child processes                                    │
│   backendProcess.kill('SIGTERM');                            │
│   frontendProcess.kill('SIGTERM');                           │
│                                                              │
│   // Wait a moment                                           │
│   setTimeout(() => {                                         │
│     // Force kill if still running                           │
│     if (backendProcess) backendProcess.kill('SIGKILL');      │
│     if (frontendProcess) frontendProcess.kill('SIGKILL');    │
│   }, 5000);                                                  │
│                                                              │
│   // Quit Electron                                           │
│   app.quit();                                                │
│ });                                                          │
│                                                              │
│ All processes terminated. Ports 5000 and 3001 freed.         │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Printing Flow - Behind the Scenes

### 6.1 Complete Print Journey

```
USER ACTION: Click "Print Receipt"
─────────────────────────────────────────────────────────────────

LAYER 1: React Component (Frontend)
┌──────────────────────────────────────────────────────────────┐
│ // frontend/src/components/BillPrintPreview.tsx              │
│                                                              │
│ const BillPrintPreview = ({ bill }) => {                     │
│   const handlePrint = async () => {                          │
│     // Check if we're in Electron                            │
│     if (typeof window !== 'undefined' && window.electronAPI) {│
│       // SILENT PRINT - Desktop App mode                     │
│       const result = await window.electronAPI.printBill({    │
│         billNumber: bill.bill_number,                        │
│         items: bill.items,                                   │
│         total: bill.grand_total,                             │
│         customer: bill.customer_name,                        │
│         date: bill.created_at,                               │
│         gst: bill.total_gst                                  │
│       });                                                    │
│                                                              │
│       if (result.success) {                                  │
│         toast.success('Receipt printed!');                   │
│       } else {                                               │
│         toast.error('Print failed: ' + result.error);        │
│       }                                                      │
│     } else {                                                 │
│       // BROWSER PRINT - Shows dialog                        │
│       window.print();                                        │
│     }                                                        │
│   };                                                         │
│                                                              │
│   return (                                                   │
│     <button onClick={handlePrint}>🖨️ Print Receipt</button>  │
│   );                                                         │
│ };                                                           │
└──────────────────────────────────────────────────────────────┘
                    │
                    │ IPC Message
                    ▼

LAYER 2: Preload Bridge (Security Layer)
┌──────────────────────────────────────────────────────────────┐
│ // desktop/preload/index.js                                  │
│                                                              │
│ const { contextBridge, ipcRenderer } = require('electron');  │
│                                                              │
│ // Expose safe API to renderer                               │
│ contextBridge.exposeInMainWorld('electronAPI', {             │
│   // Printer functions                                       │
│   printBill: (data) => ipcRenderer.invoke('printer:print', data),│
│   getPrinters: () => ipcRenderer.invoke('printer:list'),     │
│                                                              │
│   // File functions                                          │
│   openFile: () => ipcRenderer.invoke('file:open'),           │
│   saveFile: (data) => ipcRenderer.invoke('file:save', data), │
│                                                              │
│   // App functions                                           │
│   getVersion: () => ipcRenderer.invoke('app:version'),       │
│   quit: () => ipcRenderer.invoke('app:quit')                 │
│ });                                                          │
│                                                              │
│ // NOTE: This is the ONLY way renderer can talk to main      │
│ // process. Direct Node.js access is blocked for security.   │
└──────────────────────────────────────────────────────────────┘
                    │
                    │ IPC Invoke
                    ▼

LAYER 3: Main Process IPC Handler
┌──────────────────────────────────────────────────────────────┐
│ // desktop/main/ipc.js                                       │
│                                                              │
│ const { ipcMain } = require('electron');                     │
│ const fetch = require('node-fetch');                         │
│                                                              │
│ function registerIpcHandlers() {                             │
│   // Handle print requests                                   │
│   ipcMain.handle('printer:print', async (event, billData) => {│
│     try {                                                    │
│       // Call local backend API                              │
│       const response = await fetch('http://localhost:5000/api/print', {│
│         method: 'POST',                                      │
│         headers: { 'Content-Type': 'application/json' },     │
│         body: JSON.stringify(billData)                       │
│       });                                                    │
│                                                              │
│       const result = await response.json();                  │
│       return result;                                         │
│     } catch (error) {                                        │
│       return { success: false, error: error.message };       │
│     }                                                        │
│   });                                                        │
│                                                              │
│   // List available printers                                 │
│   ipcMain.handle('printer:list', async () => {               │
│     const response = await fetch('http://localhost:5000/api/printers');│
│     return response.json();                                  │
│   });                                                        │
│ }                                                            │
└──────────────────────────────────────────────────────────────┘
                    │
                    │ HTTP POST
                    ▼

LAYER 4: Flask Backend API
┌──────────────────────────────────────────────────────────────┐
│ # backend/routes/print.py (or billing.py)                    │
│                                                              │
│ @app.route('/api/print', methods=['POST'])                   │
│ def print_bill():                                            │
│     data = request.get_json()                                │
│                                                              │
│     # Import printer utility                                 │
│     from utils.thermal_printer import ThermalPrinter         │
│                                                              │
│     printer = ThermalPrinter()                               │
│                                                              │
│     # Check if printer available                             │
│     if not printer.is_available():                           │
│         return jsonify({                                     │
│             'success': False,                                │
│             'error': 'No printer configured'                 │
│         }), 400                                              │
│                                                              │
│     # Print the receipt                                      │
│     result = printer.print_receipt(data)                     │
│                                                              │
│     return jsonify(result)                                   │
└──────────────────────────────────────────────────────────────┘
                    │
                    │ Function Call
                    ▼

LAYER 5: Thermal Printer Utility
┌──────────────────────────────────────────────────────────────┐
│ # backend/utils/thermal_printer.py                           │
│                                                              │
│ import subprocess                                            │
│ import platform                                              │
│                                                              │
│ class ThermalPrinter:                                        │
│     def __init__(self):                                      │
│         self.printer_name = self._get_default_printer()      │
│                                                              │
│     def _get_default_printer(self):                          │
│         """Get system default printer"""                     │
│         system = platform.system()                           │
│                                                              │
│         if system == 'Linux':                                │
│             # Use CUPS lpstat command                        │
│             result = subprocess.run(                         │
│                 ['lpstat', '-d'],                            │
│                 capture_output=True,                         │
│                 text=True                                    │
│             )                                                │
│             # Output: "system default destination: RP3220"   │
│             if 'no system default' in result.stdout:         │
│                 return None                                  │
│             return result.stdout.split(':')[1].strip()       │
│                                                              │
│         elif system == 'Windows':                            │
│             # Use WMI query                                  │
│             import wmi                                       │
│             c = wmi.WMI()                                    │
│             for printer in c.Win32_Printer():                │
│                 if printer.Default:                          │
│                     return printer.Name                      │
│             return None                                      │
│                                                              │
│     def is_available(self):                                  │
│         return self.printer_name is not None                 │
│                                                              │
│     def print_receipt(self, data):                           │
│         """Format and print 80mm thermal receipt"""          │
│                                                              │
│         # Generate receipt text                              │
│         receipt = self._format_receipt(data)                 │
│                                                              │
│         # Save to temp file                                  │
│         temp_file = '/tmp/receipt.txt'                       │
│         with open(temp_file, 'w') as f:                      │
│             f.write(receipt)                                 │
│                                                              │
│         # Send to printer                                    │
│         if platform.system() == 'Linux':                     │
│             subprocess.run([                                 │
│                 'lp', '-d', self.printer_name,               │
│                 '-o', 'raw',                                 │
│                 temp_file                                    │
│             ])                                               │
│         else:  # Windows                                     │
│             # Use PowerShell for raw printing                │
│             subprocess.run([                                 │
│                 'powershell', '-Command',                    │
│                 f'Get-Content {temp_file} | Out-Printer "{self.printer_name}"'│
│             ])                                               │
│                                                              │
│         return {'success': True, 'printer': self.printer_name}│
│                                                              │
│     def _format_receipt(self, data):                         │
│         """Format receipt for 80mm thermal paper (42 chars)"""│
│         width = 42                                           │
│         lines = []                                           │
│                                                              │
│         # Header                                             │
│         lines.append('=' * width)                            │
│         lines.append(center_text('SHOP NAME', width))        │
│         lines.append(center_text('123 Main Street', width))  │
│         lines.append(center_text('Ph: 9876543210', width))   │
│         lines.append(center_text('GST: 27AXXXX1234Z', width))│
│         lines.append('=' * width)                            │
│                                                              │
│         # Bill info                                          │
│         lines.append(f"Bill No: {data['billNumber']}")       │
│         lines.append(f"Date: {data['date']}")                │
│         lines.append(f"Customer: {data['customer']}")        │
│         lines.append('-' * width)                            │
│                                                              │
│         # Items                                              │
│         lines.append(f"{'Item':<20}{'Qty':>6}{'Amount':>14}")│
│         lines.append('-' * width)                            │
│         for item in data['items']:                           │
│             lines.append(                                    │
│                 f"{item['name'][:20]:<20}"                   │
│                 f"{item['qty']:>6}"                          │
│                 f"{item['amount']:>14.2f}"                   │
│             )                                                │
│         lines.append('-' * width)                            │
│                                                              │
│         # Totals                                             │
│         lines.append(f"{'Subtotal:':<28}{data['subtotal']:>12.2f}")│
│         lines.append(f"{'GST:':<28}{data['gst']:>12.2f}")    │
│         lines.append('=' * width)                            │
│         lines.append(f"{'TOTAL:':<28}{data['total']:>12.2f}")│
│         lines.append('=' * width)                            │
│                                                              │
│         # Footer                                             │
│         lines.append('')                                     │
│         lines.append(center_text('Thank you!', width))       │
│         lines.append(center_text('Visit Again', width))      │
│         lines.append('')                                     │
│         lines.append('')  # Paper feed                       │
│                                                              │
│         return '\n'.join(lines)                              │
└──────────────────────────────────────────────────────────────┘
                    │
                    │ System Command
                    ▼

LAYER 6: Operating System & Printer
┌──────────────────────────────────────────────────────────────┐
│ LINUX (CUPS - Common Unix Printing System):                  │
│                                                              │
│ Command: lp -d RP3220 -o raw /tmp/receipt.txt                │
│                                                              │
│ CUPS receives print job:                                     │
│ 1. Validates printer exists                                  │
│ 2. Queues the job                                            │
│ 3. Sends raw data to USB port                                │
│ 4. Printer receives ESC/POS commands                         │
│ 5. Paper feeds, prints, cuts                                 │
│                                                              │
│ ─────────────────────────────────────────────────────────────│
│                                                              │
│ WINDOWS:                                                     │
│                                                              │
│ Command: Out-Printer "EPSON TM-T82"                          │
│                                                              │
│ Windows Print Spooler:                                       │
│ 1. Receives print data                                       │
│ 2. Queues in spooler                                         │
│ 3. Sends to printer via USB                                  │
│ 4. Printer prints receipt                                    │
└──────────────────────────────────────────────────────────────┘
                    │
                    │ USB/Network
                    ▼

PHYSICAL OUTPUT:
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  🖨️ Thermal Printer Output (80mm paper):                    │
│                                                              │
│  ┌────────────────────────────────────┐                     │
│  │  ══════════════════════════════════│                     │
│  │         SHOP NAME                  │                     │
│  │       123 Main Street              │                     │
│  │       Ph: 9876543210               │                     │
│  │       GST: 27AXXXX1234Z            │                     │
│  │  ══════════════════════════════════│                     │
│  │  Bill No: INV-1234                 │                     │
│  │  Date: 28-Nov-2025 10:30 AM        │                     │
│  │  Customer: Ramesh Kumar            │                     │
│  │  ──────────────────────────────────│                     │
│  │  Item          Qty      Amount     │                     │
│  │  ──────────────────────────────────│                     │
│  │  Cotton Shirt    1        499.00   │                     │
│  │  Jeans Blue      1        899.00   │                     │
│  │  ──────────────────────────────────│                     │
│  │  Subtotal:              1398.00    │                     │
│  │  GST (5%):                69.90    │                     │
│  │  ══════════════════════════════════│                     │
│  │  TOTAL:                 1467.90    │                     │
│  │  ══════════════════════════════════│                     │
│  │                                    │                     │
│  │          Thank you!                │                     │
│  │         Visit Again                │                     │
│  │                                    │                     │
│  └────────────────────────────────────┘                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘

TOTAL TIME: ~0.5 seconds (feels instant!)
```

---

## 7. Auto-Start Mechanism

### 7.1 How Services Auto-Start

```
WHEN ELECTRON APP LAUNCHES:
─────────────────────────────────────────────────────────────────

┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  app.whenReady()                                             │
│       │                                                      │
│       ▼                                                      │
│  ┌────────────────────┐                                      │
│  │ startServices()    │                                      │
│  └─────────┬──────────┘                                      │
│            │                                                 │
│    ┌───────┴───────┐                                         │
│    ▼               ▼                                         │
│ startBackend()  startFrontend()                              │
│    │               │                                         │
│    │               │                                         │
│    ▼               ▼                                         │
│ ┌─────────────┐ ┌─────────────┐                              │
│ │ SPAWN:      │ │ SPAWN:      │                              │
│ │ python      │ │ npm start   │                              │
│ │ flask run   │ │ (Next.js)   │                              │
│ │ --port 5000 │ │ --port 3001 │                              │
│ └──────┬──────┘ └──────┬──────┘                              │
│        │               │                                     │
│        │   Health Check Loop                                 │
│        │   ┌─────────────────┐                               │
│        └──▶│ Every 1 second: │◀──────────────────────────────┤
│            │ GET :5000/health│                               │
│            │ GET :3001       │                               │
│            └────────┬────────┘                               │
│                     │                                        │
│              Both OK? ────────────────────────────────┐      │
│                     │                                 │      │
│                Yes  │                            No   │      │
│                     ▼                                 │      │
│            ┌────────────────┐                         │      │
│            │ createWindow() │              Retry ─────┘      │
│            │ Load :3001     │              (max 30 times)    │
│            └────────────────┘                                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 What Happens If Backend Crashes?

```
CRASH DETECTION & RECOVERY:
─────────────────────────────────────────────────────────────────

Normal Operation:
┌──────────────────────────────────────────────────────────────┐
│ backendProcess.on('exit', (code, signal) => {                │
│   // code = 0 means normal exit (app closed)                 │
│   // code != 0 means crash                                   │
│                                                              │
│   if (code !== 0 && !isQuitting) {                           │
│     console.error('Backend crashed! Exit code:', code);      │
│                                                              │
│     // Check restart count                                   │
│     if (restartCount < MAX_RESTARTS) {  // MAX_RESTARTS = 3  │
│       restartCount++;                                        │
│       console.log(`Restarting backend (attempt ${restartCount})...`);│
│       startBackend();  // Try again                          │
│     } else {                                                 │
│       // Too many crashes, show error to user                │
│       dialog.showErrorBox(                                   │
│         'Backend Error',                                     │
│         'The backend service crashed multiple times. ' +     │
│         'Please restart the application or contact support.'│
│       );                                                     │
│     }                                                        │
│   }                                                          │
│ });                                                          │
└──────────────────────────────────────────────────────────────┘


CRASH SCENARIO TIMELINE:
─────────────────────────────────────────────────────────────────

10:00:00 - Backend crashes (out of memory, unhandled error, etc.)
           backendProcess exits with code 1

10:00:00 - Exit handler triggered
           restartCount = 1 (< 3, so restart)

10:00:01 - startBackend() called
           New Flask process spawned

10:00:03 - Health check passes
           Backend recovered! ✅

User probably didn't even notice (3 seconds of possible errors)


MULTIPLE CRASH SCENARIO:
─────────────────────────────────────────────────────────────────

10:00:00 - Crash #1 → Restart
10:00:05 - Crash #2 → Restart
10:00:10 - Crash #3 → Restart
10:00:15 - Crash #4 → MAX REACHED!

           ┌────────────────────────────────────────┐
           │  ⚠️ Backend Error                      │
           │                                        │
           │  The backend service crashed multiple  │
           │  times. Please restart the application │
           │  or contact support.                   │
           │                                        │
           │                [ OK ]                  │
           └────────────────────────────────────────┘
```

---

## 8. Auto-Update System

### 8.1 How Updates Work

```
AUTO-UPDATE ARCHITECTURE:
─────────────────────────────────────────────────────────────────

                    GITHUB RELEASES
                    (Your Repository)
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    ▼                    ▼                    ▼
latest.yml       RYX-Billing.exe      RYX-Billing.AppImage
(metadata)       (Windows)            (Linux)

latest.yml contains:
{
  "version": "1.2.0",
  "releaseDate": "2025-11-28",
  "files": [
    {
      "url": "RYX-Billing-1.2.0.exe",
      "sha512": "abc123...",
      "size": 85000000
    }
  ]
}


UPDATE CHECK FLOW:
─────────────────────────────────────────────────────────────────

App starts (version 1.1.0)
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ // In main process                                           │
│ const { autoUpdater } = require('electron-updater');         │
│                                                              │
│ autoUpdater.checkForUpdatesAndNotify();                      │
│                                                              │
│ // This does:                                                │
│ // 1. Fetch latest.yml from GitHub Releases                  │
│ // 2. Compare versions: 1.2.0 > 1.1.0? YES                   │
│ // 3. Download update in background                          │
│ // 4. Show notification when ready                           │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ autoUpdater.on('update-available', (info) => {               │
│   console.log('Update available:', info.version);            │
│                                                              │
│   // Optional: Show notification to user                     │
│   dialog.showMessageBox({                                    │
│     type: 'info',                                            │
│     title: 'Update Available',                               │
│     message: `Version ${info.version} is available.`,        │
│     buttons: ['Download Now', 'Later']                       │
│   });                                                        │
│ });                                                          │
│                                                              │
│ autoUpdater.on('download-progress', (progress) => {          │
│   // Update progress bar in splash/status bar                │
│   console.log(`Downloaded: ${progress.percent.toFixed(1)}%`);│
│ });                                                          │
│                                                              │
│ autoUpdater.on('update-downloaded', (info) => {              │
│   // Update is ready to install                              │
│   dialog.showMessageBox({                                    │
│     type: 'info',                                            │
│     title: 'Update Ready',                                   │
│     message: 'Update downloaded. Restart to install?',       │
│     buttons: ['Restart Now', 'Later']                        │
│   }).then((result) => {                                      │
│     if (result.response === 0) {                             │
│       autoUpdater.quitAndInstall();                          │
│     }                                                        │
│   });                                                        │
│ });                                                          │
└──────────────────────────────────────────────────────────────┘


USER EXPERIENCE:
─────────────────────────────────────────────────────────────────

Day 1: You release version 1.2.0 to GitHub

Day 2: Client opens app (running 1.1.0)
       │
       ├── App checks GitHub in background
       │   "Oh, 1.2.0 is available!"
       │
       ├── Downloads 85MB update while user works
       │   (No interruption to user's work)
       │
       └── After download completes:
           ┌────────────────────────────────────────┐
           │  🔄 Update Ready                       │
           │                                        │
           │  Version 1.2.0 has been downloaded.    │
           │  Restart now to install the update?    │
           │                                        │
           │  [ Restart Now ]    [ Later ]          │
           └────────────────────────────────────────┘

       If "Restart Now":
       │
       ├── App closes gracefully
       ├── Installer runs (Windows) / Replaces binary (Linux)
       ├── App restarts with 1.2.0
       └── User continues working with new version!

       If "Later":
       │
       └── Update is cached, will install on next restart
```

### 8.2 Release Process (For Developer)

```
WHEN YOU WANT TO RELEASE AN UPDATE:
─────────────────────────────────────────────────────────────────

Step 1: Update version number
─────────────────────────────
Edit package.json:
{
  "name": "ryx-billing",
  "version": "1.1.0"  →  "1.2.0"
}


Step 2: Build installers
─────────────────────────────
$ ./build.sh
> Select option 6 (Build all platforms)

OR manually:
$ npm run dist:linux   # Creates .AppImage and .deb
$ npm run dist:win     # Creates .exe installer

Output in /dist folder:
├── ryx-billing-1.2.0.AppImage
├── ryx-billing_1.2.0_amd64.deb
├── RYX-Billing-Setup-1.2.0.exe
└── latest.yml  (auto-generated metadata)


Step 3: Create GitHub Release
─────────────────────────────
1. Go to: github.com/your-repo/releases/new
2. Create tag: v1.2.0
3. Title: "Version 1.2.0 - New Features"
4. Description:
   ## What's New
   - Added customer loyalty tracking
   - Fixed print alignment issues
   - Improved startup speed

5. Upload files:
   - ryx-billing-1.2.0.AppImage
   - ryx-billing_1.2.0_amd64.deb
   - RYX-Billing-Setup-1.2.0.exe
   - latest.yml

6. Publish Release


Step 4: Users automatically get notified
─────────────────────────────
- Next time any user opens the app
- electron-updater checks GitHub
- Finds new version
- Downloads and prompts to install

NO MANUAL DEPLOYMENT NEEDED! 🎉
```

---

## 9. Installation Guide

### 9.1 For Linux Users (Ubuntu/Debian)

```
FIRST-TIME INSTALLATION:
─────────────────────────────────────────────────────────────────

Step 1: Download the installer
────────────────────────────────────────
You'll receive one of these files:
• ryx-billing-1.0.0.AppImage (recommended - no install needed)
• ryx-billing_1.0.0_amd64.deb (traditional install)


OPTION A: AppImage (Easiest)
────────────────────────────────────────

What is AppImage?
It's like a portable .exe for Linux. No installation required.
Just download, make executable, and run!

$ cd ~/Downloads

# Make it executable
$ chmod +x ryx-billing-1.0.0.AppImage

# Run it!
$ ./ryx-billing-1.0.0.AppImage

# Or double-click in file manager after chmod

THAT'S IT! App runs directly.

To create desktop shortcut:
$ ./ryx-billing-1.0.0.AppImage --install-desktop-shortcut


OPTION B: .deb Package (Traditional)
────────────────────────────────────────

# Install
$ sudo dpkg -i ryx-billing_1.0.0_amd64.deb

# If dependencies missing
$ sudo apt-get install -f

# Now find in application menu
# Or run from terminal:
$ ryx-billing


PRINTER SETUP:
────────────────────────────────────────

Your thermal printer needs CUPS (Common Unix Printing System).

Step 1: Install CUPS (if not installed)
$ sudo apt install cups

Step 2: Start CUPS service
$ sudo systemctl enable cups
$ sudo systemctl start cups

Step 3: Add your printer
• Open browser: http://localhost:631
• Administration → Add Printer
• Select your thermal printer (usually USB)
• Choose driver (Generic/Text-Only for thermal)

Step 4: Set as default
$ lpstat -p                    # List printers
$ sudo lpoptions -d RP3220     # Set default

Step 5: Test print
$ echo "Test Print" | lp       # Should print on thermal

Now RYX Billing can print! 🎉
```

### 9.2 For Windows Users

```
FIRST-TIME INSTALLATION:
─────────────────────────────────────────────────────────────────

Step 1: Download the installer
────────────────────────────────────────
File: RYX-Billing-Setup-1.0.0.exe


Step 2: Run the installer
────────────────────────────────────────

1. Double-click RYX-Billing-Setup-1.0.0.exe

2. Windows SmartScreen may appear:
   ┌────────────────────────────────────────┐
   │  Windows protected your PC             │
   │                                        │
   │  Windows SmartScreen prevented an      │
   │  unrecognized app from starting.       │
   │                                        │
   │  [ More info ]                         │
   └────────────────────────────────────────┘

   Click "More info" → "Run anyway"
   (This happens because the app isn't code-signed yet)

3. If UAC (User Account Control) appears:
   Click "Yes" to allow installation

4. Choose install location:
   Default: C:\Program Files\RYX Billing
   (Or change to your preference)

5. Wait for installation to complete

6. Click "Finish"


Step 3: First launch
────────────────────────────────────────

• Find "RYX Billing" in Start Menu
• Or use desktop shortcut (if created)
• Click to launch

First launch takes ~10 seconds as it:
• Starts backend server
• Starts frontend server
• Prepares the window


PRINTER SETUP:
────────────────────────────────────────

Step 1: Connect thermal printer via USB
        (Most printers auto-install drivers)

Step 2: Check in Settings → Devices → Printers
        Your printer should appear

Step 3: Set as default printer (optional)
        Right-click printer → Set as default

Step 4: Test from RYX Billing
        Create a test bill → Click Print
        Should print immediately!


TROUBLESHOOTING WINDOWS:
────────────────────────────────────────

"App won't start" →
• Check Windows Defender isn't blocking
• Try running as Administrator
• Check if ports 5000/3001 are free:
  netstat -ano | findstr "5000"

"Printer not detected" →
• Reinstall printer drivers
• Try restarting printer
• Check USB connection

"Slow startup" →
• First launch is slower (warming up)
• Subsequent launches are faster
• Patience for 5-10 seconds
```

---

## 10. Cost Breakdown

### 10.1 Complete Cost Analysis

```
YOUR CURRENT SETUP:
─────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────┐
│                       COST TABLE                             │
├─────────────────┬─────────────────┬───────────┬─────────────┤
│ SERVICE         │ FREE TIER       │ YOUR USE  │ MONTHLY COST│
├─────────────────┼─────────────────┼───────────┼─────────────┤
│ Supabase DB     │ 500 MB          │ ~5 MB     │ ₹0          │
│ Supabase Storage│ 1 GB            │ ~10 MB    │ ₹0          │
│ Supabase Auth   │ 50,000 MAU      │ 2 users   │ ₹0          │
│ Supabase API    │ Unlimited       │ ~1K/day   │ ₹0          │
├─────────────────┼─────────────────┼───────────┼─────────────┤
│ Vercel          │ N/A (Desktop)   │ -         │ ₹0          │
│ Render          │ N/A (Desktop)   │ -         │ ₹0          │
├─────────────────┼─────────────────┼───────────┼─────────────┤
│ Domain          │ Not needed      │ -         │ ₹0          │
│ SSL Certificate │ Not needed      │ -         │ ₹0          │
├─────────────────┼─────────────────┼───────────┼─────────────┤
│                 │                 │ TOTAL     │ ₹0/month    │
│                 │                 │           │ ₹0/year     │
└─────────────────┴─────────────────┴───────────┴─────────────┘


WHY DESKTOP APP COSTS ₹0:
─────────────────────────────────────────────────────────────────

WEB APP (Previous):                  DESKTOP APP (Now):
──────────────────                   ─────────────────
Vercel (Frontend) ─── FREE           Not needed
Render (Backend) ──── FREE           Runs locally
Supabase (DB) ─────── FREE           Still FREE

Both cost ₹0, but Desktop App can print! 🖨️


PROFIT CALCULATION:
─────────────────────────────────────────────────────────────────

Your client pays:           ₹6,000/year
Your infrastructure cost:   ₹0/year
────────────────────────────────────
Your profit:                ₹6,000/year (100% margin!)

Monthly breakdown:          ₹500/month profit


FUTURE SCALING:
─────────────────────────────────────────────────────────────────

│ Clients │ DB Size  │ Supabase │ Revenue    │ Profit     │
├─────────┼──────────┼──────────┼────────────┼────────────┤
│ 1       │ ~5 MB    │ Free     │ ₹6,000/yr  │ ₹6,000/yr  │
│ 5       │ ~25 MB   │ Free     │ ₹30,000/yr │ ₹30,000/yr │
│ 10      │ ~50 MB   │ Free     │ ₹60,000/yr │ ₹60,000/yr │
│ 25      │ ~125 MB  │ Free     │ ₹1.5L/yr   │ ₹1.5L/yr   │
│ 50      │ ~250 MB  │ Free     │ ₹3L/yr     │ ₹3L/yr     │
│ 100     │ ~500 MB  │ Free*    │ ₹6L/yr     │ ₹6L/yr     │
│ 100+    │ >500 MB  │ ~₹2K/mo  │ ₹6L+/yr    │ ₹5.76L/yr  │

* You can serve up to 100 small shops on FREE tier!
  That's ₹6,00,000/year revenue at zero cost!
```

### 10.2 What About Code Signing?

```
CODE SIGNING (OPTIONAL):
─────────────────────────────────────────────────────────────────

What is it?
A certificate that proves your app is from a trusted developer.

Without code signing:
┌────────────────────────────────────────┐
│  Windows protected your PC             │
│  Windows SmartScreen prevented an      │
│  unrecognized app from starting.       │
│                                        │
│  [More info]   [Don't run]             │
└────────────────────────────────────────┘

With code signing:
App installs without warning ✅


Cost of code signing:
• Standard Code Signing: ₹8,000-15,000/year
• EV Code Signing: ₹25,000-40,000/year

Recommendation for 1 client:
SKIP IT. Just tell the client to click "More info" → "Run anyway".
It's a one-time thing during installation.

Recommendation for 10+ clients:
Consider getting it for professional appearance.
```

---

## 11. Daily Operations Guide

### 11.1 Shop Opening Routine

```
MORNING STARTUP CHECKLIST:
─────────────────────────────────────────────────────────────────

08:55 AM - Staff arrives
────────────────────────────────────────

□ Turn on computer
□ Turn on thermal printer
□ Wait for Windows/Linux to fully boot


09:00 AM - Start RYX Billing
────────────────────────────────────────

□ Double-click RYX Billing icon
□ Wait for splash screen (5 seconds)
□ Login screen appears

What's happening behind the scenes:
┌──────────────────────────────────────────────────────────────┐
│ 1. Electron starts                                           │
│ 2. Flask backend starts on port 5000                         │
│ 3. Next.js frontend starts on port 3001                      │
│ 4. Health check verifies both services                       │
│ 5. Main window loads frontend                                │
│ 6. Login screen displayed                                    │
└──────────────────────────────────────────────────────────────┘


09:01 AM - Login
────────────────────────────────────────

□ Enter email: staff@shop.com
□ Enter password: ********
□ Click Login

What's happening:
┌──────────────────────────────────────────────────────────────┐
│ 1. POST /api/auth/login                                      │
│ 2. Backend checks credentials in Supabase                    │
│ 3. Returns JWT token if valid                                │
│ 4. Frontend stores token in localStorage                     │
│ 5. Redirects to Dashboard                                    │
└──────────────────────────────────────────────────────────────┘


09:02 AM - Dashboard loads
────────────────────────────────────────

□ Check today's date is correct
□ Review yesterday's summary (if any)
□ Verify printer icon shows "Connected" (if displayed)

Dashboard shows:
• Today's sales: ₹0 (morning)
• Yesterday's total: ₹12,500
• Low stock alerts: 3 items
• Recent bills: Last 5 bills


09:05 AM - Test print (optional but recommended)
────────────────────────────────────────

□ Go to Settings or any bill
□ Click test print button
□ Verify receipt prints correctly

If print fails:
• Check printer is on
• Check USB cable
• Check paper roll
• Restart app if needed


09:10 AM - Ready for customers!
────────────────────────────────────────

Shop is ready to operate.
App is running, printer is tested, you're logged in.
```

### 11.2 During Business Hours

```
TYPICAL BILLING WORKFLOW:
─────────────────────────────────────────────────────────────────

Customer arrives with items
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 1: Click "New Bill" button                              │
│         ┌────────────────────────────────────────────┐       │
│         │ + New Bill                                 │       │
│         └────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 2: Add items                                            │
│                                                              │
│ Option A: Scan barcode                                       │
│   • Barcode scanner reads: 8901234567890                     │
│   • Item auto-adds to bill                                   │
│                                                              │
│ Option B: Search by name                                     │
│   • Type: "Cotton Shirt"                                     │
│   • Select from dropdown                                     │
│   • Item adds to bill                                        │
│                                                              │
│ Option C: Manual entry                                       │
│   • Click "Add Item"                                         │
│   • Enter details manually                                   │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 3: Review bill                                          │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ Item                 Qty     Rate      Amount          │   │
│ ├────────────────────────────────────────────────────────┤   │
│ │ Cotton Shirt Blue     2      499       998.00          │   │
│ │ Jeans Regular         1      899       899.00          │   │
│ ├────────────────────────────────────────────────────────┤   │
│ │ Subtotal                               1897.00         │   │
│ │ GST (5%)                                94.85          │   │
│ │ ─────────────────────────────────────────────────      │   │
│ │ TOTAL                                  1991.85         │   │
│ └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 4: Customer details (optional)                          │
│                                                              │
│ Phone: [9876543210_____]                                     │
│        ↓                                                     │
│ System finds: "Ramesh Kumar - 8 previous visits"             │
│ Or: "New customer - Enter name"                              │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 5: Payment                                              │
│                                                              │
│ Payment Method: [ Cash ▼ ]                                   │
│                                                              │
│ Amount Received: [2000______]                                │
│ Change to Return: ₹8.15                                      │
│                                                              │
│ [ Save Bill ]                                                │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 6: Print receipt                                        │
│                                                              │
│ ┌────────────────────────────────────────┐                   │
│ │  ✅ Bill Saved Successfully!           │                   │
│ │                                        │                   │
│ │  Bill Number: INV-1234                 │                   │
│ │                                        │                   │
│ │  [ 🖨️ Print Receipt ]  [ New Bill ]   │                   │
│ └────────────────────────────────────────┘                   │
│                                                              │
│ Click "Print Receipt"                                        │
│                                                              │
│ 🖨️ *BRRRRR* Receipt prints instantly!                       │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 7: Hand receipt to customer                             │
│                                                              │
│ Staff: "Here's your receipt, sir. Thank you!"                │
│ Customer: "Thank you!"                                       │
│                                                              │
│ Ready for next customer!                                     │
└──────────────────────────────────────────────────────────────┘


TIME FOR ENTIRE PROCESS: 30 seconds - 2 minutes
(Depends on number of items and customer interaction)
```

### 11.3 End of Day

```
CLOSING ROUTINE:
─────────────────────────────────────────────────────────────────

09:00 PM - Last customer leaves
────────────────────────────────────────

□ Complete any pending bills
□ Ensure all transactions are saved


09:05 PM - Generate daily report
────────────────────────────────────────

□ Go to Reports → Daily Summary

Report shows:
┌──────────────────────────────────────────────────────────────┐
│                  DAILY SUMMARY - 28 Nov 2025                 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Total Bills:           45                                    │
│ Total Revenue:         ₹28,750.00                            │
│ GST Collected:         ₹1,437.50                             │
│                                                              │
│ Payment Breakdown:                                           │
│ ├── Cash:             ₹18,500.00  (64%)                      │
│ ├── Card:             ₹8,250.00   (29%)                      │
│ └── UPI:              ₹2,000.00   (7%)                       │
│                                                              │
│ Top Selling Items:                                           │
│ 1. Cotton Shirt Blue     - 12 units - ₹5,988                 │
│ 2. Jeans Regular         - 8 units  - ₹7,192                 │
│ 3. T-Shirt Graphic       - 15 units - ₹4,485                 │
│                                                              │
│ [ 🖨️ Print Report ]  [ 📧 Email Report ]  [ 📥 Export PDF ]  │
└──────────────────────────────────────────────────────────────┘


09:10 PM - Check low stock (optional)
────────────────────────────────────────

□ Go to Stock → Low Stock Alert

Low stock items:
• Cotton Shirt Blue - Only 3 left (min: 10)
• Jeans Regular - Only 5 left (min: 10)
→ Note these for tomorrow's order


09:15 PM - Close application
────────────────────────────────────────

□ Click X button to close
□ All data is already saved to Supabase

What happens when you close:
┌──────────────────────────────────────────────────────────────┐
│ 1. Electron receives close event                             │
│ 2. stopAllServices() called                                  │
│ 3. Flask backend process terminated                          │
│ 4. Next.js frontend process terminated                       │
│ 5. Window closes                                             │
│ 6. Ports 5000 and 3001 freed                                 │
└──────────────────────────────────────────────────────────────┘

□ Turn off computer
□ Turn off printer
□ Shop closed for the day! 🌙
```

---

## 12. Maintenance Guide

### 12.1 Regular Maintenance Schedule

```
MAINTENANCE CALENDAR:
─────────────────────────────────────────────────────────────────

DAILY (Automatic - No action needed):
────────────────────────────────────────
✅ Supabase automatic backups (7-day retention)
✅ App checks for updates on every startup
✅ All transactions auto-saved to cloud


WEEKLY (5 minutes):
────────────────────────────────────────
□ Check Supabase dashboard for unusual activity
  • Go to: app.supabase.com → Your project → Usage
  • Verify database size is normal (~5MB)
  • Verify API calls look reasonable

□ Quick printer check
  • Print a test receipt
  • Check paper roll level
  • Clean printer head if needed (monthly is fine)


MONTHLY (15 minutes):
────────────────────────────────────────
□ Review Supabase usage
  • Database size trending
  • Storage usage
  • Any errors in logs

□ Client check-in call
  • Any issues?
  • Feature requests?
  • Satisfaction check

□ Check for app updates
  • Normally auto-updates
  • But verify latest version is installed


YEARLY:
────────────────────────────────────────
□ Renew client subscription (₹6,000)
□ Review and backup annual data
□ Major version update if available
□ Consider feature additions based on feedback


BACKUP REMINDER:
────────────────────────────────────────
Supabase free tier includes:
• Automatic daily backups
• 7-day retention
• Point-in-time recovery

For extra safety (optional):
• Monthly export of critical data
• Download bills report as CSV
• Store in separate location (Google Drive, etc.)
```

### 12.2 How to Release Updates

```
WHEN YOU FIX A BUG OR ADD A FEATURE:
─────────────────────────────────────────────────────────────────

Step 1: Make your code changes
────────────────────────────────────────

• Fix the bug in backend/frontend
• Test locally
• Commit to git


Step 2: Update version number
────────────────────────────────────────

Edit package.json:
{
  "version": "1.1.0"  →  "1.2.0"
}

Version numbering:
• MAJOR.MINOR.PATCH
• Bug fix: 1.1.0 → 1.1.1
• New feature: 1.1.0 → 1.2.0
• Breaking change: 1.1.0 → 2.0.0


Step 3: Build new installers
────────────────────────────────────────

$ cd /home/development1/Desktop/mj-billing
$ ./build.sh

Select: 6) Build all platforms

OR manually:
$ npm run dist:linux
$ npm run dist:win

Output:
dist/
├── ryx-billing-1.2.0.AppImage
├── ryx-billing_1.2.0_amd64.deb
├── RYX-Billing-Setup-1.2.0.exe
└── latest.yml


Step 4: Create GitHub Release
────────────────────────────────────────

1. Go to: github.com/your-repo/releases/new

2. Tag version: v1.2.0

3. Release title: "Version 1.2.0 - Bug Fixes"

4. Description:
   ```
   ## What's Changed
   - Fixed receipt alignment issue
   - Added customer phone validation
   - Improved startup speed

   ## Installation
   Download the appropriate file for your system:
   - **Linux**: ryx-billing-1.2.0.AppImage
   - **Windows**: RYX-Billing-Setup-1.2.0.exe
   ```

5. Attach files:
   - ryx-billing-1.2.0.AppImage
   - ryx-billing_1.2.0_amd64.deb
   - RYX-Billing-Setup-1.2.0.exe
   - latest.yml (IMPORTANT for auto-update!)

6. Click "Publish release"


Step 5: Verify auto-update works
────────────────────────────────────────

• Open the app on a test machine
• App should detect update
• Download and install
• Verify new version runs


Step 6: Done! 🎉
────────────────────────────────────────

• Client will get update notification next time they open app
• They click "Install" → App updates itself
• No manual deployment needed!
```

---

## 13. Troubleshooting with Real Examples

### 13.1 "App Won't Start"

```
SCENARIO: User double-clicks icon, nothing happens
─────────────────────────────────────────────────────────────────

Possible Cause 1: Port already in use
────────────────────────────────────────

Symptoms:
• App splash appears briefly, then closes
• Or app freezes on "Starting services..."

Check (Linux):
$ lsof -i :5000
$ lsof -i :3001

Check (Windows):
> netstat -ano | findstr "5000"
> netstat -ano | findstr "3001"

If something is using the port:
┌──────────────────────────────────────────────────────────────┐
│ Output:                                                      │
│ COMMAND   PID   USER   FD   TYPE  DEVICE  NODE NAME          │
│ python   1234   user   5u   IPv4   ...    TCP *:5000 (LISTEN)│
│                                                              │
│ This means a previous app instance didn't close properly     │
└──────────────────────────────────────────────────────────────┘

Fix:
$ kill -9 1234    # Linux
> taskkill /PID 1234 /F    # Windows

Then try starting app again.


Possible Cause 2: Python not found
────────────────────────────────────────

Symptoms:
• App shows error about Python
• Backend service fails to start

Check:
$ which python3
$ python3 --version

If Python not installed:
$ sudo apt install python3 python3-venv python3-pip

Then recreate venv:
$ cd backend
$ python3 -m venv venv
$ ./venv/bin/pip install -r requirements.txt


Possible Cause 3: Node.js not found
────────────────────────────────────────

Symptoms:
• Frontend service fails to start
• Error about npm or node

Check:
$ node --version
$ npm --version

If not installed:
$ curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
$ sudo apt install nodejs
```

### 13.2 "Print Not Working"

```
SCENARIO: Click print, nothing happens or error appears
─────────────────────────────────────────────────────────────────

Quick Diagnosis:
────────────────────────────────────────

Step 1: Is printer ON?
        Check power light, paper loaded

Step 2: Is printer connected?
        Check USB cable both ends

Step 3: Is printer detected by system?
        Linux: $ lpstat -p
        Windows: Check Devices and Printers

Step 4: Is a default printer set?
        Linux: $ lpstat -d
        Windows: Check default printer in settings


Cause 1: No default printer set (Linux)
────────────────────────────────────────

Error message: "No printer configured"

Check:
$ lpstat -d
# Output: "no system default destination"

Fix:
$ lpstat -p                    # List available printers
# Output: "printer RP3220 is idle"

$ sudo lpoptions -d RP3220     # Set as default
$ lpstat -d
# Output: "system default destination: RP3220"

Test:
$ echo "Test" | lp
# Should print!


Cause 2: CUPS not installed (Linux)
────────────────────────────────────────

Error message: "lpstat: command not found"

Fix:
$ sudo apt install cups
$ sudo systemctl enable cups
$ sudo systemctl start cups

Then add your printer through:
• http://localhost:631 (CUPS web interface)
• Or: System Settings → Printers


Cause 3: Printer driver issue (Windows)
────────────────────────────────────────

Symptoms:
• Printer shows in devices
• But doesn't print

Fix:
1. Remove printer from Devices and Printers
2. Unplug USB cable
3. Download latest driver from manufacturer
4. Install driver
5. Plug in USB cable
6. Windows should detect printer
7. Test print


Cause 4: Paper jam or empty roll
────────────────────────────────────────

Symptoms:
• Print command succeeds
• But nothing comes out
• Printer might beep

Fix:
1. Check paper roll - replace if empty
2. Open printer cover, check for jammed paper
3. Clean with dry cloth
4. Close cover, test print
```

### 13.3 "Database Connection Failed"

```
SCENARIO: App shows "Cannot connect to database" or operations time out
─────────────────────────────────────────────────────────────────

Quick Diagnosis:
────────────────────────────────────────

Step 1: Is internet working?
        Try opening google.com in browser

Step 2: Is Supabase accessible?
        Check: https://status.supabase.com/

Step 3: Are credentials correct?
        Check backend/.env file


Cause 1: No internet connection
────────────────────────────────────────

Symptoms:
• All database operations fail
• Can't login
• App might show cached data only

Fix:
• Check WiFi/Ethernet connection
• Restart router if needed
• Wait for connection to restore


Cause 2: Supabase service down (rare)
────────────────────────────────────────

Symptoms:
• Internet works for other sites
• But Supabase operations fail

Check:
• Visit: https://status.supabase.com/
• Check for incidents

If Supabase is down:
• Wait for them to fix it (usually <1 hour)
• They provide status updates


Cause 3: Wrong credentials in .env
────────────────────────────────────────

Symptoms:
• "Authentication failed" errors
• Even with internet working

Check backend/.env:
```
DB_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-ID].supabase.co:6543/postgres
SUPABASE_URL=https://[PROJECT-ID].supabase.co
SUPABASE_KEY=[YOUR-ANON-KEY]
```

Fix:
• Login to Supabase dashboard
• Go to Settings → API
• Copy correct values
• Update .env file
• Restart app
```

### 13.4 "Slow Performance"

```
SCENARIO: App feels sluggish, operations take too long
─────────────────────────────────────────────────────────────────

Cause 1: Too much data loaded
────────────────────────────────────────

Symptoms:
• Stock list takes long to load
• Bills page slow

Fix:
• Use search/filters instead of loading all
• Enable pagination (if not already)
• Clear browser cache in Electron:
  - Press Ctrl+Shift+I (DevTools)
  - Go to Application → Storage
  - Click "Clear site data"


Cause 2: Low system resources
────────────────────────────────────────

Symptoms:
• Whole computer feels slow
• Multiple apps open

Fix:
• Close unnecessary applications
• Restart computer
• Check RAM usage (Task Manager / System Monitor)

Minimum requirements:
• 4GB RAM (8GB recommended)
• Dual-core CPU
• 500MB free disk space


Cause 3: Network latency
────────────────────────────────────────

Symptoms:
• Save operations take 2-3 seconds
• Database operations slow

Fix:
• Check internet speed (should be >1 Mbps)
• Try wired connection instead of WiFi
• Contact ISP if speed is consistently low
```

---

## 14. Feature Matrix

### 14.1 Complete Feature List

```
FEATURE COMPARISON: WEB APP vs DESKTOP APP
─────────────────────────────────────────────────────────────────

┌──────────────────────────┬─────────┬─────────┬────────────────┐
│ FEATURE                  │ WEB APP │ DESKTOP │ NEEDS INTERNET │
├──────────────────────────┼─────────┼─────────┼────────────────┤
│ BILLING                  │         │         │                │
│ ├── Create GST Bill      │ ✅      │ ✅      │ Yes            │
│ ├── Create Non-GST Bill  │ ✅      │ ✅      │ Yes            │
│ ├── Edit Bill            │ ✅      │ ✅      │ Yes            │
│ ├── Delete Bill          │ ✅      │ ✅      │ Yes            │
│ ├── View Bills List      │ ✅      │ ✅      │ Yes            │
│ ├── Search Bills         │ ✅      │ ✅      │ Yes            │
│ ├── Exchange/Return      │ ✅      │ ✅      │ Yes            │
│ ├── SILENT PRINT         │ ❌      │ ✅      │ No (local)     │
│ └── Browser Print        │ ✅      │ ✅      │ No (local)     │
├──────────────────────────┼─────────┼─────────┼────────────────┤
│ INVENTORY                │         │         │                │
│ ├── Add Stock            │ ✅      │ ✅      │ Yes            │
│ ├── Edit Stock           │ ✅      │ ✅      │ Yes            │
│ ├── Delete Stock         │ ✅      │ ✅      │ Yes            │
│ ├── Bulk Import (CSV)    │ ✅      │ ✅      │ Yes            │
│ ├── Export Stock         │ ✅      │ ✅      │ Yes            │
│ ├── Low Stock Alerts     │ ✅      │ ✅      │ Yes            │
│ └── Barcode Lookup       │ ✅      │ ✅      │ Yes            │
├──────────────────────────┼─────────┼─────────┼────────────────┤
│ CUSTOMERS                │         │         │                │
│ ├── Add Customer         │ ✅      │ ✅      │ Yes            │
│ ├── Edit Customer        │ ✅      │ ✅      │ Yes            │
│ ├── Search Customer      │ ✅      │ ✅      │ Yes            │
│ └── Customer History     │ ✅      │ ✅      │ Yes            │
├──────────────────────────┼─────────┼─────────┼────────────────┤
│ ANALYTICS                │         │         │                │
│ ├── Dashboard            │ ✅      │ ✅      │ Yes            │
│ ├── Revenue Charts       │ ✅      │ ✅      │ Yes            │
│ ├── Top Products         │ ✅      │ ✅      │ Yes            │
│ ├── Customer Analytics   │ ✅      │ ✅      │ Yes            │
│ └── Stock Movement       │ ✅      │ ✅      │ Yes            │
├──────────────────────────┼─────────┼─────────┼────────────────┤
│ REPORTS                  │         │         │                │
│ ├── Daily Summary        │ ✅      │ ✅      │ Yes            │
│ ├── Monthly Report       │ ✅      │ ✅      │ Yes            │
│ ├── Export PDF           │ ✅      │ ✅      │ Yes            │
│ ├── Export Excel         │ ✅      │ ✅      │ Yes            │
│ └── Audit Trail          │ ✅      │ ✅      │ Yes            │
├──────────────────────────┼─────────┼─────────┼────────────────┤
│ ADMIN                    │         │         │                │
│ ├── User Management      │ ✅      │ ✅      │ Yes            │
│ ├── Permissions          │ ✅      │ ✅      │ Yes            │
│ └── Shop Settings        │ ✅      │ ✅      │ Yes            │
├──────────────────────────┼─────────┼─────────┼────────────────┤
│ SYSTEM                   │         │         │                │
│ ├── Dark Mode            │ ✅      │ ✅      │ No             │
│ ├── Auto-Update          │ ❌      │ ✅      │ Yes            │
│ ├── Desktop Shortcut     │ ❌      │ ✅      │ No             │
│ └── Multi-Device Sync    │ ✅      │ ✅      │ Yes            │
└──────────────────────────┴─────────┴─────────┴────────────────┘

KEY DIFFERENCE:
Desktop App can do SILENT PRINT (no browser dialog).
This is why we use Desktop App for billing!
```

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RYX BILLING - QUICK REFERENCE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ STARTUP:                                                                    │
│   Double-click icon → Wait 5 sec → Login → Ready!                           │
│                                                                             │
│ CREATE BILL:                                                                │
│   New Bill → Add Items → Customer (optional) → Payment → Save → Print       │
│                                                                             │
│ KEYBOARD SHORTCUTS:                                                         │
│   Ctrl+N     New Bill                                                       │
│   Ctrl+P     Print                                                          │
│   Ctrl+S     Save                                                           │
│   Ctrl+F     Search                                                         │
│   Esc        Cancel/Close                                                   │
│                                                                             │
│ COMMON ISSUES:                                                              │
│   App won't start   → Kill port 5000/3001, restart                          │
│   Print fails       → Check printer power, USB, default printer             │
│   Slow loading      → Check internet, clear cache                           │
│   Login fails       → Check internet, verify credentials                    │
│                                                                             │
│ SUPPORT:                                                                    │
│   Developer Contact: [Your contact info]                                    │
│   Email: support@yourcompany.com                                            │
│   Phone: +91 XXXXX XXXXX                                                    │
│                                                                             │
│ VERSION: 1.0.0                                                              │
│ LAST UPDATED: November 2025                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Summary

This documentation provides:

- **Real-world scenarios** showing exactly what happens when you use the app
- **Step-by-step flows** from user click to system response
- **Behind-the-scenes explanations** of how each component works
- **Troubleshooting guides** with actual error messages and fixes
- **Daily operations guide** for shop staff
- **Maintenance procedures** for developers
- **Cost analysis** showing ₹0/month operation

**The Bottom Line:**
- Desktop app solves the printing problem
- All features work the same as web app
- Zero monthly hosting cost
- Auto-updates keep clients current
- One-time installation per computer

**Ready to deploy? Follow the Installation Guide in Section 9!**

---

## 15. Building the Desktop App

### 15.1 Prerequisites

```
┌─────────────────────────────────────────────────────────────────┐
│                    BUILD PREREQUISITES                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  REQUIRED SOFTWARE:                                             │
│  ─────────────────                                              │
│  • Node.js (v18 or later)                                       │
│  • npm (comes with Node.js)                                     │
│  • Python 3.x (for backend)                                     │
│  • Git (optional, for version control)                          │
│                                                                 │
│  FOR WINDOWS BUILD ON LINUX:                                    │
│  ────────────────────────────                                   │
│  • Wine (for cross-compilation)                                 │
│    sudo apt install wine64                                      │
│                                                                 │
│  FOR WINDOWS BUILD ON WINDOWS:                                  │
│  ─────────────────────────────                                  │
│  • No additional requirements                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 15.2 Build for Linux

```bash
# Step 1: Install dependencies
npm install
cd frontend && npm install && cd ..

# Step 2: Setup Python virtual environment
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
cd ..

# Step 3: Build frontend
cd frontend && npm run build && cd ..

# Step 4: Build Linux installers
npx electron-builder --linux

# Output files:
# dist/RYX Billing-1.0.0.AppImage  (Portable)
# dist/ryx-billing_1.0.0_amd64.deb (Debian package)
```

### 15.3 Build for Windows

**Option A: Build on Windows (Recommended)**
```powershell
# Step 1: Install dependencies
npm install
cd frontend && npm install && cd ..

# Step 2: Setup Python virtual environment
cd backend
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt
cd ..

# Step 3: Build frontend
cd frontend && npm run build && cd ..

# Step 4: Build Windows installer
npx electron-builder --win

# Output files:
# dist/RYX Billing Setup 1.0.0.exe (Installer)
# dist/win-unpacked/              (Portable)
```

**Option B: Build on Linux (Requires Wine)**
```bash
# Install Wine first
sudo apt install wine64

# Then build
npx electron-builder --win
```

### 15.4 Build Output Files

```
dist/
├── linux-unpacked/              # Unpacked Linux app
├── win-unpacked/                # Unpacked Windows app
├── RYX Billing-1.0.0.AppImage   # Linux portable (80MB)
├── ryx-billing_1.0.0_amd64.deb  # Linux Debian package (72MB)
├── RYX Billing Setup 1.0.0.exe  # Windows installer (~85MB)
├── latest-linux.yml             # Auto-update manifest (Linux)
└── latest.yml                   # Auto-update manifest (Windows)
```

---

## 16. Auto-Update System (Implementation Details)

### 16.1 How Auto-Update Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     AUTO-UPDATE FLOW                            │
│                                                                 │
│  1. User opens app (version 1.0.0)                              │
│           │                                                     │
│           ▼                                                     │
│  2. App checks GitHub Releases (after 5 seconds)                │
│           │                                                     │
│           ▼                                                     │
│  3. Found new version? (e.g., 1.1.0)                            │
│           │                                                     │
│      ┌────┴────┐                                                │
│     YES       NO                                                │
│      │         └──▶ Continue normally                           │
│      ▼                                                          │
│  ┌──────────────────────────┐                                   │
│  │  "Update Available!"     │                                   │
│  │  Version 1.1.0           │                                   │
│  │                          │                                   │
│  │  [Download]  [Later]     │                                   │
│  └──────────────────────────┘                                   │
│           │                                                     │
│           ▼                                                     │
│  4. User clicks "Download"                                      │
│           │                                                     │
│           ▼                                                     │
│  ┌──────────────────────────┐                                   │
│  │  Downloading Update...   │                                   │
│  │  ████████░░░░░░  67%     │                                   │
│  └──────────────────────────┘                                   │
│           │                                                     │
│           ▼                                                     │
│  5. Download complete                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌──────────────────────────┐                                   │
│  │  "Update Ready!"         │                                   │
│  │                          │                                   │
│  │  [Restart Now]  [Later]  │                                   │
│  └──────────────────────────┘                                   │
│           │                                                     │
│           ▼                                                     │
│  6. App restarts with new version!                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 16.2 Configuration

Auto-update is configured in `package.json`:

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "your-github-username",
      "repo": "mj-billing",
      "releaseType": "release"
    }
  }
}
```

### 16.3 Releasing an Update

**Step 1: Update version number**
```json
// package.json
{
  "version": "1.0.0"  →  "1.1.0"
}
```

**Step 2: Build new installers**
```bash
npm run dist:linux   # For Linux
npm run dist:win     # For Windows (on Windows machine)
```

**Step 3: Create GitHub Release**
```
1. Go to: github.com/your-repo/releases/new

2. Create tag: v1.1.0

3. Title: "Version 1.1.0 - What's New"

4. Description:
   ## What's Changed
   - Added new feature X
   - Fixed bug Y
   - Improved performance Z

5. Upload files:
   - RYX Billing-1.1.0.AppImage
   - ryx-billing_1.1.0_amd64.deb
   - RYX Billing Setup 1.1.0.exe
   - latest-linux.yml
   - latest.yml

6. Click "Publish release"
```

**Step 4: Users automatically notified**
```
Next time any user opens the app:
→ App checks GitHub Releases
→ Finds v1.1.0 > v1.0.0
→ Shows "Update Available!" dialog
→ User downloads and installs
→ Done! No manual deployment needed.
```

### 16.4 Auto-Update Code Location

```
desktop/
├── main/
│   ├── index.js      ← Initializes updater
│   └── updater.js    ← Auto-update logic
```

**Key file: `desktop/main/updater.js`**
```javascript
// Handles:
// - Checking for updates
// - Download progress dialog
// - Install on restart
```

---

## 17. App Icons & Branding

### 17.1 Icon Files

```
desktop/
└── resources/
    └── icon.png      ← Main app icon (500x500 PNG)

frontend/
└── public/
    └── RYX_Logo.png  ← Logo used in web UI
```

### 17.2 Where Icons Appear

```
┌─────────────────────────────────────────────────────────────────┐
│                    ICON USAGE LOCATIONS                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  WINDOWS:                                                       │
│  ─────────                                                      │
│  • Desktop shortcut icon                                        │
│  • Taskbar icon (when running)                                  │
│  • Start menu icon                                              │
│  • Installer wizard icon                                        │
│  • Add/Remove Programs list                                     │
│                                                                 │
│  LINUX:                                                         │
│  ───────                                                        │
│  • Application menu icon                                        │
│  • Taskbar/dock icon                                            │
│  • File manager (for .AppImage)                                 │
│                                                                 │
│  IN-APP:                                                        │
│  ────────                                                       │
│  • Window title bar                                             │
│  • About dialog                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 17.3 Changing the Icon

**To use a different icon:**

1. Create/obtain your icon (recommended: 512x512 or 1024x1024 PNG)

2. Replace the icon file:
   ```bash
   cp your-new-icon.png desktop/resources/icon.png
   ```

3. Rebuild the app:
   ```bash
   npx electron-builder --linux  # or --win
   ```

**For Windows .ico file (optional but recommended):**
```bash
# Use online converter: https://convertio.co/png-ico/
# Or install ImageMagick:
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

---

## 18. Web App vs Desktop App Comparison

### 18.1 Feature Comparison

```
┌──────────────────────────┬─────────────┬─────────────┬────────────────┐
│ FEATURE                  │ WEB APP     │ DESKTOP APP │ NOTES          │
├──────────────────────────┼─────────────┼─────────────┼────────────────┤
│ BILLING                  │             │             │                │
│ ├── Create Bills         │ ✅          │ ✅          │ Same           │
│ ├── Edit Bills           │ ✅          │ ✅          │ Same           │
│ ├── Print (Dialog)       │ ✅          │ ✅          │ Shows dialog   │
│ └── Print (Silent)       │ ❌          │ ✅          │ Desktop only!  │
├──────────────────────────┼─────────────┼─────────────┼────────────────┤
│ STOCK MANAGEMENT         │ ✅          │ ✅          │ Same           │
│ CUSTOMER MANAGEMENT      │ ✅          │ ✅          │ Same           │
│ REPORTS & ANALYTICS      │ ✅          │ ✅          │ Same           │
│ USER PERMISSIONS         │ ✅          │ ✅          │ Same           │
│ GST CALCULATIONS         │ ✅          │ ✅          │ Same           │
├──────────────────────────┼─────────────┼─────────────┼────────────────┤
│ SYSTEM FEATURES          │             │             │                │
│ ├── Works Offline        │ ❌          │ ⚠️ Limited  │ Cached data    │
│ ├── Auto-Update          │ N/A         │ ✅          │ Desktop only   │
│ ├── Desktop Shortcut     │ ❌          │ ✅          │ Desktop only   │
│ ├── Taskbar Icon         │ ❌          │ ✅          │ Desktop only   │
│ └── Faster Response      │ Normal      │ ✅ Faster   │ Local backend  │
├──────────────────────────┼─────────────┼─────────────┼────────────────┤
│ REQUIREMENTS             │             │             │                │
│ ├── Browser              │ ✅ Required │ ❌ Not needed│               │
│ ├── Internet             │ ✅ Required │ ✅ Required │ For database   │
│ └── Installation         │ ❌ None     │ ✅ One-time │                │
└──────────────────────────┴─────────────┴─────────────┴────────────────┘
```

### 18.2 When to Use Which?

```
USE WEB APP WHEN:
─────────────────
• Multiple devices need access (phones, tablets)
• No printing required
• Don't want to install anything
• Need access from anywhere

USE DESKTOP APP WHEN:
────────────────────
• Thermal receipt printing is required ← YOUR CASE
• Want faster performance
• Single dedicated billing computer
• Want auto-updates
• Want native app experience
```

### 18.3 Can Both Run Together?

**YES!** You can use both:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   COMPUTER A (Shop Counter)        COMPUTER B (Office)          │
│   ─────────────────────────        ────────────────────         │
│   Desktop App                      Web Browser                  │
│   • Creates bills                  • Views reports              │
│   • Prints receipts                • Manages stock              │
│   • Fast checkout                  • Admin tasks                │
│                                                                 │
│              │                              │                   │
│              └──────────┬───────────────────┘                   │
│                         │                                       │
│                         ▼                                       │
│                  ┌─────────────┐                                │
│                  │  SUPABASE   │                                │
│                  │  (Database) │                                │
│                  │             │                                │
│                  │ All data    │                                │
│                  │ synced!     │                                │
│                  └─────────────┘                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Both connect to the SAME database - data is always in sync!
```

---

## 19. Developer Reference

### 19.1 Project Structure

```
mj-billing/
├── backend/                    # Flask API Server
│   ├── app.py                  # Main Flask app
│   ├── routes/                 # API endpoints
│   ├── models/                 # Database models
│   ├── utils/
│   │   └── thermal_printer.py  # Printer interface
│   ├── venv/                   # Python virtual environment
│   └── requirements.txt        # Python dependencies
│
├── frontend/                   # Next.js Web App
│   ├── src/
│   │   ├── app/                # Pages
│   │   └── components/         # React components
│   ├── public/
│   │   └── RYX_Logo.png        # Logo
│   └── package.json
│
├── desktop/                    # Electron Desktop App
│   ├── main/
│   │   ├── index.js            # Entry point
│   │   ├── services.js         # Backend/Frontend management
│   │   ├── window.js           # Window management
│   │   ├── ipc.js              # IPC handlers (printing)
│   │   └── updater.js          # Auto-update logic
│   ├── preload/
│   │   └── index.js            # Security bridge
│   ├── utils/
│   │   ├── config.js           # Configuration
│   │   └── health-check.js     # Service health checks
│   └── resources/
│       └── icon.png            # App icon
│
├── docs/
│   └── DESKTOP_APP_GUIDE.md    # This documentation
│
├── dist/                       # Built installers (after build)
├── package.json                # Electron & build config
└── .env                        # Environment variables
```

### 19.2 Key Commands

```bash
# DEVELOPMENT
npm run dev              # Run desktop app in dev mode
npm run dev:backend      # Run only backend
npm run dev:frontend     # Run only frontend

# BUILDING
npm run build            # Build frontend + backend
npm run dist:linux       # Build Linux installers
npm run dist:win         # Build Windows installer
npm run dist:mac         # Build macOS installer

# TESTING
npm start                # Run production build
npm run pack             # Create unpacked build (for testing)

# CLEANUP
npm run clean            # Remove dist/build folders
```

### 19.3 Environment Variables

```bash
# .env file

# Backend
FLASK_ENV=production
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-key

# Desktop App
BACKEND_PORT=5000
FRONTEND_PORT=3001
PRINTER_ENABLED=true
```

---

## 20. Deployment Checklist

### 20.1 Before First Deployment

```
□ Update package.json version to 1.0.0
□ Update GitHub publish config (owner, repo)
□ Replace icon.png with your logo
□ Test on target OS (Linux/Windows)
□ Verify printing works
□ Test with real database
□ Create GitHub repository (for auto-updates)
```

### 20.2 Client Installation Checklist

```
□ Copy installer to client machine
□ Run installer / Extract AppImage
□ Set up thermal printer in OS
□ Set printer as default
□ Launch app and login
□ Test print a receipt
□ Create desktop shortcut (if needed)
□ Brief client on daily operations
```

### 20.3 For Each Update Release

```
□ Update version in package.json
□ Build new installers
□ Test the new build
□ Create GitHub Release
□ Upload installer files
□ Upload latest*.yml files
□ Publish release
□ Verify auto-update works
```
