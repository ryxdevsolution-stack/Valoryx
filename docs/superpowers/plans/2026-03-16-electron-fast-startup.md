# Electron Fast Startup & Auto-Recovery Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the 1-minute blank screen on daily app open — show a branded splash instantly, start Flask in parallel, skip migrations on repeat launches, and auto-recover from backend crashes.

**Architecture:**
- Electron calls `loadFrontend()` immediately after `createWindow()` — React renders ElectronSplash within <300ms from disk
- Flask starts in background in parallel; main process polls `/api/health` (already exists in app.py)
- IPC events update the splash progress bar in real time
- A `_schema_version` table ensures migrations only run on first install, not on every open

**Tech Stack:** Electron 28, Flask (Python), SQLite (offline mode), IPC (contextBridge), React 18 + TypeScript, Vite

---

## Chunk 1: Backend — One-Time Migration System

### Problem
`backend/app.py` runs 15+ `ALTER TABLE` / `sa_inspect()` checks on **every startup**. SQLite introspection is slow — this is the primary cause of the 30-60s hang. Fix: introduce a `_schema_version` table. Migrations only run when the schema version number increases. On daily open with no change: returns in <1ms.

**NOTE:** `backend/app.py` already has an inline `/api/health` route. We will use it directly — no new blueprint needed.

---

### Task 1: Create Migration Runner (`backend/migrations/runner.py`)

**Files:**
- Create: `backend/migrations/runner.py`
- Modify: `backend/app.py` (replace all inline migration blocks with one call)

- [ ] **Step 1: Read the existing migration file to understand its schema**

```bash
cat backend/migrations/add_subscription_razorpay_columns.py
```
Note which tables and columns it creates — they must be included in `_m001_core_columns`.

- [ ] **Step 2: Create `backend/migrations/runner.py`**

```python
"""
Versioned migration runner.
Schema version is stored in _schema_version table.
Migrations only run when CURRENT_SCHEMA_VERSION > stored version.
On first install: runs all migrations (version 0 → N).
On daily open: reads version, matches, exits in <1ms.
"""
import logging
from sqlalchemy import text, inspect as sa_inspect

# Bump this number ONLY when you add new migrations to the list below.
CURRENT_SCHEMA_VERSION = 1

def _get_stored_version(db) -> int:
    """Return the stored schema version, or 0 if table doesn't exist yet."""
    try:
        row = db.session.execute(
            text("SELECT version FROM _schema_version ORDER BY applied_at DESC LIMIT 1")
        ).fetchone()
        return int(row[0]) if row else 0
    except Exception:
        return 0

def _ensure_version_table(db):
    db.session.execute(text("""
        CREATE TABLE IF NOT EXISTS _schema_version (
            version    INTEGER NOT NULL,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """))
    db.session.commit()

def _set_stored_version(db, version: int):
    db.session.execute(
        text("INSERT INTO _schema_version (version) VALUES (:v)"),
        {"v": version}
    )
    db.session.commit()

# ── Migration functions (add new ones at the bottom, never reorder) ──────────

def _m001_core_columns(db):
    """
    All ALTER TABLE additions previously inline in app.py,
    plus add_subscription_razorpay_columns.py logic.
    """
    # Use a single inspector instance for all introspection
    inspector = sa_inspect(db.engine)

    def _add_col(table, col, definition):
        """Add column only if it doesn't exist yet."""
        try:
            cols = [c['name'] for c in inspector.get_columns(table)]
        except Exception:
            return  # table doesn't exist yet — skip
        if col not in cols:
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {definition}"))
            logging.info(f"[Migration] {table}.{col} added")

    # ── users ─────────────────────────────────────────────────────────────────
    _add_col('users', 'telegram_chat_id', 'VARCHAR(50) NULL')
    _add_col('users', 'branch_id',        'VARCHAR(36) NULL')
    _add_col('users', 'last_login_ip',    'VARCHAR(45) NULL')

    # ── client_entry — email verification ─────────────────────────────────────
    _add_col('client_entry', 'email_verified',             'BOOLEAN NOT NULL DEFAULT 0')
    _add_col('client_entry', 'email_verification_token',   'VARCHAR(64) NULL')
    _add_col('client_entry', 'email_verification_expires', 'DATETIME NULL')

    # ── client_entry — account deletion / GDPR ────────────────────────────────
    _add_col('client_entry', 'deletion_requested_at',       'DATETIME NULL')
    _add_col('client_entry', 'deletion_scheduled_at',       'DATETIME NULL')
    _add_col('client_entry', 'deletion_requested_by',       'VARCHAR(36) NULL')
    _add_col('client_entry', 'deletion_reactivation_token', 'VARCHAR(64) NULL')

    # ── client_entry — Razorpay / subscriptions ───────────────────────────────
    _add_col('client_entry', 'razorpay_subscription_id', 'VARCHAR(100) NULL')
    _add_col('client_entry', 'telegram_chat_id',         'VARCHAR(50) NULL')

    # ── subscription_plan — Razorpay plan IDs (from add_subscription_razorpay_columns.py) ──
    _add_col('subscription_plan', 'razorpay_monthly_plan_id', 'VARCHAR(100) NULL')
    _add_col('subscription_plan', 'razorpay_yearly_plan_id',  'VARCHAR(100) NULL')

    # ── billing — customer fields ──────────────────────────────────────────────
    for tbl in ('gst_billing', 'non_gst_billing'):
        _add_col(tbl, 'customer_id',      'VARCHAR(36) NULL')
        _add_col(tbl, 'customer_email',   'VARCHAR(255) NULL')
        _add_col(tbl, 'customer_address', 'TEXT NULL')

    # ── indexes (safe: CREATE INDEX IF NOT EXISTS) ─────────────────────────────
    db.session.execute(text(
        "CREATE INDEX IF NOT EXISTS idx_client_entry_verify_token "
        "ON client_entry (email_verification_token)"
    ))
    db.session.execute(text(
        "CREATE INDEX IF NOT EXISTS idx_client_entry_reactivation_token "
        "ON client_entry (deletion_reactivation_token)"
    ))

    # ── webhook tables ─────────────────────────────────────────────────────────
    # Use same inspector instance (already created above)
    tables = inspector.get_table_names()

    if 'webhook_endpoints' not in tables:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS webhook_endpoints (
                endpoint_id VARCHAR(36) PRIMARY KEY,
                client_id   VARCHAR(36) NOT NULL
                            REFERENCES client_entry(client_id) ON DELETE CASCADE,
                url         VARCHAR(2048) NOT NULL,
                secret      VARCHAR(64) NOT NULL,
                description VARCHAR(255) NULL,
                events      TEXT NOT NULL DEFAULT '*',
                is_active   BOOLEAN NOT NULL DEFAULT 1,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_webhook_ep_client "
            "ON webhook_endpoints (client_id)"
        ))
        logging.info("[Migration] webhook_endpoints table created")

    if 'webhook_deliveries' not in tables:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS webhook_deliveries (
                delivery_id     VARCHAR(36) PRIMARY KEY,
                endpoint_id     VARCHAR(36) NOT NULL
                                REFERENCES webhook_endpoints(endpoint_id) ON DELETE CASCADE,
                client_id       VARCHAR(36) NOT NULL,
                event_type      VARCHAR(100) NOT NULL,
                payload         TEXT NOT NULL,
                attempt         INTEGER NOT NULL DEFAULT 1,
                status          VARCHAR(20) NOT NULL DEFAULT 'pending',
                response_status INTEGER NULL,
                response_body   TEXT NULL,
                error           TEXT NULL,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                delivered_at    DATETIME NULL,
                next_retry_at   DATETIME NULL
            )
        """))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_webhook_del_endpoint "
            "ON webhook_deliveries (endpoint_id)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_webhook_del_client "
            "ON webhook_deliveries (client_id)"
        ))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_webhook_del_retry "
            "ON webhook_deliveries (next_retry_at) WHERE next_retry_at IS NOT NULL"
        ))
        logging.info("[Migration] webhook_deliveries table created")

    # ── sync metadata tables ───────────────────────────────────────────────────
    if 'sync_metadata' not in tables:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_metadata (
                key        VARCHAR(100) PRIMARY KEY,
                value      TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        logging.info("[Migration] sync_metadata table created")

    if 'sync_log' not in tables:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name  VARCHAR(100),
                rows_synced INTEGER DEFAULT 0,
                synced_at   DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        logging.info("[Migration] sync_log table created")

    db.session.commit()

# ── Migration registry: (version_number, function) ───────────────────────────
# Add new entries at the BOTTOM only. Never reorder.
MIGRATIONS = [
    (1, _m001_core_columns),
]

# ── Public API ────────────────────────────────────────────────────────────────

def run_migrations_if_needed(app, db):
    """
    Called once during app startup.
    - First install: runs all migrations (takes a few seconds — acceptable)
    - Daily open with no schema change: returns in <1ms (version matches)
    """
    with app.app_context():
        _ensure_version_table(db)
        stored = _get_stored_version(db)

        if stored >= CURRENT_SCHEMA_VERSION:
            logging.info(
                f"[Migration] Schema up to date (v{stored}). Skipping all migration checks."
            )
            return

        logging.info(
            f"[Migration] Schema v{stored} → v{CURRENT_SCHEMA_VERSION}. Running migrations…"
        )

        all_succeeded = True
        for version, fn in MIGRATIONS:
            if version > stored:
                try:
                    fn(db)
                    logging.info(f"[Migration] v{version} applied: {fn.__name__}")
                except Exception as e:
                    all_succeeded = False
                    try:
                        db.session.rollback()
                    except Exception:
                        pass
                    logging.warning(f"[Migration] v{version} failed ({fn.__name__}): {e}")

        # Only write the new version if ALL migrations succeeded.
        # If any failed, the next startup will retry them.
        if all_succeeded:
            _set_stored_version(db, CURRENT_SCHEMA_VERSION)
            logging.info(f"[Migration] Schema now at v{CURRENT_SCHEMA_VERSION}")
        else:
            logging.warning("[Migration] Some migrations failed — version NOT updated. Will retry next startup.")
```

- [ ] **Step 3: Verify file was created**

```bash
python -c "import ast; ast.parse(open('backend/migrations/runner.py').read()); print('Syntax OK')"
```
Expected: `Syntax OK`

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/runner.py
git commit -m "feat(backend): add versioned migration runner — skip checks on daily open"
```

---

### Task 2: Replace Inline Migrations in `backend/app.py`

**Files:**
- Modify: `backend/app.py`

**What to replace:** Find the section starting at the comment:
```python
    # Telegram: add telegram_chat_id column to users table if missing (runs on every startup)
```
...all the way to the end of the webhook tables block (including the `db.session.commit()` after webhook_deliveries). Also find and remove the two explicit migration imports further down:
```python
    from migrations.add_subscription_razorpay_columns import run as _sub_migration
    _sub_migration(db)
```

**Replace the entire combined section** with:

```python
    # Run versioned migrations — skips entirely on daily open if schema is up to date
    if db_initialized:
        try:
            from migrations.runner import run_migrations_if_needed
            run_migrations_if_needed(app, db)
        except Exception as _e:
            logging.warning(f"[Migration] Migration runner failed: {_e}")

        # Permission sections seed — idempotent (INSERT OR IGNORE), fast (<5ms), always run
        try:
            with app.app_context():
                from migrations.seed_permission_sections import run as _perm_seed
                _perm_seed(db)
        except Exception as _e:
            logging.warning(f"[Migration] permission sections seed skipped: {_e}")
```

> **Why keep permission seed separate?** It uses `INSERT OR IGNORE` and is O(N) over a small fixed table. It's idempotent and fast — safer to run always than to version-gate it.

- [ ] **Step 1: Apply the replacement in `backend/app.py`**

Edit the file as described above. After editing, verify the inline migration blocks are gone:

```bash
grep -n "ALTER TABLE users ADD COLUMN telegram_chat_id" backend/app.py
```
Expected: No output (line removed).

- [ ] **Step 2: Run Flask to verify startup speed**

```bash
cd backend && DB_MODE=offline python app.py
```
Expected output within 3 seconds:
```
[Migration] Schema up to date (v1). Skipping all migration checks.
[OK] Database initialized successfully
 * Running on http://127.0.0.1:5017
```
OR on first run (no `_schema_version` table yet):
```
[Migration] Schema v0 → v1. Running migrations…
[Migration] v1 applied: _m001_core_columns
[Migration] Schema now at v1
```

- [ ] **Step 3: Verify `/api/health` still works (it's already inline in app.py)**

```bash
curl http://localhost:5017/api/health
```
Expected: `{"message": "RYX Billing API is running", "status": "healthy"}`

- [ ] **Step 4: Stop Flask and commit**

```bash
git add backend/app.py
git commit -m "feat(backend): replace 15 inline migration checks with versioned runner"
```

---

## Chunk 2: Electron — Instant Window + Parallel Backend Start

### Problem
`main.js` currently:
1. Blocks window creation on `await startBackend()` — user sees nothing for 30-60s
2. After Flask is ready, loads a `data:text/html` splash via `loadURL` then uses a hardcoded `setTimeout(loadFrontend, 1500)` — splash and actual frontend load are completely desynchronised
3. No auto-restart on backend crash

**Correct flow:**
1. `createWindow()` → `loadFrontend()` immediately — React renders from disk in <300ms
2. React shows `ElectronSplash` because `backendReady` is false
3. Flask starts in background; health poll updates IPC progress events
4. When health check passes → IPC event `progress: 80` → splash unmounts → routes render

---

### Task 3: Rewrite `electron/main.js` — Instant Window + Supervisor

**Files:**
- Modify: `electron/main.js`

> **CRITICAL SAFETY NOTE:** Do NOT touch `ipcMain.handle('silent-print', ...)`, `ipcMain.handle('get-printers', ...)`, `ipcMain.handle('set-default-printer', ...)`, the tray creation code, or the window close/closed handlers. Only the startup flow and backend management sections change.

- [ ] **Step 1: Add `http` require at the very top of `main.js`**

Find the existing require block at the top:
```javascript
const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
```

Add `http` to it:
```javascript
const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
```

- [ ] **Step 2: Update the constants block**

Replace:
```javascript
const BACKEND_PORT = 5000;
const FRONTEND_PORT = 3000; // Only used in dev mode (Vite dev server)
```

With:
```javascript
const BACKEND_PORT = 5017;
const FRONTEND_PORT = 3002;  // Vite dev server port
const MAX_RESTART_ATTEMPTS = 3;
const RESTART_BACKOFF_MS = [1000, 2000, 4000];
const HEALTH_POLL_INTERVAL_MS = 300;
const HEALTH_TIMEOUT_MS = 5000;
```

- [ ] **Step 3: Add supervisor globals after the `let` declarations**

After `let tray = null;`, add:
```javascript
let backendRestartCount = 0;
let backendReady = false;
```

- [ ] **Step 4: Replace the `startBackend()` function with the full supervisor**

Remove the existing `startBackend()` function (lines 19-77 of the original file) and replace with:

```javascript
// =======================
// Backend Supervisor
// =======================

function sendSplashStatus(message, progress) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('startup-status', { message, progress });
  }
}

function spawnFlask() {
  let pythonPath, backendPath;
  if (isDev) {
    pythonPath = 'python';
    backendPath = path.join(__dirname, '..', 'backend');
  } else {
    pythonPath = 'python';
    backendPath = path.join(process.resourcesPath, 'backend');
  }

  const proc = spawn(pythonPath, ['app.py'], {
    cwd: backendPath,
    env: { ...process.env, DB_MODE: 'offline', PYTHONUNBUFFERED: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  proc.stdout.on('data', (data) => console.log(`[Backend] ${data.toString().trim()}`));
  proc.stderr.on('data', (data) => console.error(`[Backend ERR] ${data.toString().trim()}`));
  proc.on('error', (err) => console.error('[Backend] Spawn error:', err));

  return proc;
}

function pollHealth(timeoutMs) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      if (Date.now() - start > timeoutMs) { resolve(false); return; }
      const req = http.get(`http://localhost:${BACKEND_PORT}/api/health`, (res) => {
        if (res.statusCode === 200) { resolve(true); return; }
        setTimeout(check, HEALTH_POLL_INTERVAL_MS);
      });
      req.setTimeout(HEALTH_TIMEOUT_MS);
      req.on('error', () => setTimeout(check, HEALTH_POLL_INTERVAL_MS));
      req.on('timeout', () => { req.destroy(); setTimeout(check, HEALTH_POLL_INTERVAL_MS); });
    };
    check();
  });
}

async function startBackendWithSupervision() {
  let attempt = 0;
  while (attempt <= MAX_RESTART_ATTEMPTS) {
    if (attempt > 0) {
      const delay = RESTART_BACKOFF_MS[attempt - 1] || 4000;
      sendSplashStatus(`Reconnecting… (attempt ${attempt + 1}/${MAX_RESTART_ATTEMPTS + 1})`, 30);
      await new Promise(r => setTimeout(r, delay));
    } else {
      sendSplashStatus('Starting backend…', 20);
    }

    backendProcess = spawnFlask();

    // Watch for unexpected crash AFTER successful start
    backendProcess.on('exit', (code) => {
      console.log(`[Backend] Exited with code ${code}`);
      backendProcess = null;
      if (!app.isQuitting && backendReady) {
        // Crash after successful start — restart from scratch
        console.log('[Backend] Unexpected crash — restarting supervisor');
        backendReady = false;
        backendRestartCount = 0;
        // Non-awaited intentionally: crash recovery runs independently
        startBackendWithSupervision().then((ok) => {
          if (ok) loadFrontend();
        });
      }
    });

    sendSplashStatus('Waiting for backend to be ready…', 40 + attempt * 10);
    const healthy = await pollHealth(30000);

    if (healthy) {
      backendReady = true;
      backendRestartCount = 0;
      sendSplashStatus('Loading application…', 80);
      return true;
    }

    // Health check timed out — kill process and retry
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill('SIGTERM');
      backendProcess = null;
    }
    attempt++;
  }

  // All attempts exhausted
  sendSplashStatus('Could not start backend after 3 attempts. Please restart the app.', -1);
  return false;
}
```

- [ ] **Step 5: Extract `loadFrontend` as a standalone named function**

Find the existing inline `loadFrontend` inside `createWindow()` and move it out as a standalone function before `createWindow()`:

```javascript
// =======================
// Frontend Loading
// =======================

function loadFrontend() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (isDev) {
    mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}/#/auth/login`);
  } else {
    const frontendPath = path.join(
      process.resourcesPath, 'frontend-react', 'dist', 'index.html'
    );
    mainWindow.loadFile(frontendPath, { hash: '/auth/login' });
  }
}
```

- [ ] **Step 6: Update `createWindow()` — remove the old `setTimeout(loadFrontend, 1500)` and the inline splash**

In `createWindow()`:
- Remove the `const loadingHTML = ...` block and `mainWindow.loadURL('data:text/html...')` call
- Remove `setTimeout(loadFrontend, 1500)`
- Change `show: true` to `show: false` to prevent flash before content loads
- Add `mainWindow.once('ready-to-show', () => mainWindow.show())` after the window is created

The updated `createWindow()` function body:

```javascript
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    icon: path.join(__dirname, 'resources', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,             // Show only when content is ready — prevents white flash
    backgroundColor: '#0f172a'
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}
```

- [ ] **Step 7: Update `stopBackend()`**

Keep this function the same but verify it uses `backendProcess` correctly:

```javascript
function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    console.log('[Backend] Stopping Flask…');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}
```

- [ ] **Step 8: Replace `app.on('ready')` handler**

Replace the existing `app.on('ready', async () => { ... })` block with:

```javascript
app.on('ready', async () => {
  console.log('[App] Starting RYX Billing Desktop…');

  // Step 1: Create window immediately
  createWindow();
  createTray();

  // Step 2: Load the frontend bundle immediately — React renders ElectronSplash
  //         from disk in <300ms. The splash is visible BEFORE Flask starts.
  loadFrontend();

  // Step 3: Start Flask in background while user sees the splash
  const started = await startBackendWithSupervision();

  if (!started) {
    // Error state is displayed by ElectronSplash via the -1 progress IPC event.
    // Do NOT call loadFrontend() again — the splash must stay on screen.
    return;
  }

  // Step 4: Backend is ready — the IPC event with progress:80 already triggered
  //         App.tsx to set backendReady=true and unmount ElectronSplash.
  //         loadFrontend() was already called in Step 2, so routing works now.
  console.log('[App] Backend ready. Application is running.');
});
```

> **Why call `loadFrontend()` before the backend is ready?**
> React renders from disk — no network needed. `ElectronSplash` shows immediately because `backendReady` is false in `App.tsx`. React's router still loads (it reads localStorage for auth, no API calls). When the backend is ready, IPC sets `backendReady = true` and the splash unmounts, revealing the login page which is already loaded.

- [ ] **Step 9: Test in dev mode**

```bash
npm run electron:dev
```
Expected sequence (timed with stopwatch):
1. `<500ms` — Window appears, dark background visible (`backgroundColor: '#0f172a'`)
2. `<800ms` — ElectronSplash renders: "Starting backend…" with progress bar at 20%
3. `<2s` — Splash updates: "Waiting for backend to be ready…" at 40%
4. `<8s` — Splash updates: "Loading application…" at 80%
5. Splash unmounts → Login page is visible

No blank/white screen at any point.

- [ ] **Step 10: Commit**

```bash
git add electron/main.js
git commit -m "feat(electron): instant window + load frontend before backend + supervisor auto-restart"
```

---

### Task 4: Update `electron/preload.js` — Expose IPC for Splash

**Files:**
- Modify: `electron/preload.js`

- [ ] **Step 1: Write the full updated `preload.js`**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Printing (unchanged)
  silentPrint: (html, printerName) => ipcRenderer.invoke('silent-print', html, printerName),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  setDefaultPrinter: (printerName) => ipcRenderer.invoke('set-default-printer', printerName),

  // App info (unchanged)
  getAppVersion: () => process.env.npm_package_version || '1.0.0',
  isElectron: true,

  // Startup progress IPC
  // App.tsx is the single source of truth for these events.
  // ElectronSplash receives status as a prop — it does NOT register its own listener.
  onStartupStatus: (callback) =>
    ipcRenderer.on('startup-status', (_event, data) => callback(data)),
  removeStartupStatus: () =>
    ipcRenderer.removeAllListeners('startup-status'),
});

console.log('[Preload] Context bridge initialized');
```

- [ ] **Step 2: Commit**

```bash
git add electron/preload.js
git commit -m "feat(electron): expose startup-status IPC to renderer"
```

---

## Chunk 3: Frontend — ElectronSplash Component

### Design Decision
**Single source of truth for IPC:** `App.tsx` registers the IPC listener and passes `status` as a prop to `ElectronSplash`. `ElectronSplash` does NOT register its own `ipcRenderer.on` listener. This prevents duplicate listeners and ensures cleanup works correctly.

---

### Task 5: Create `ElectronSplash` Component

**Files:**
- Create: `frontend-react/src/components/ElectronSplash.tsx`
- Modify: `frontend-react/src/App.tsx`

- [ ] **Step 1: Create `frontend-react/src/components/ElectronSplash.tsx`**

```tsx
interface StartupStatus {
  message: string
  progress: number  // -1 = error, 0-100 = percent
}

interface ElectronSplashProps {
  status: StartupStatus
}

/**
 * ElectronSplash — shown only in Electron during backend startup.
 * Receives status as a prop from App.tsx (single IPC listener there).
 * Renders entirely from CSS inline styles — zero dependency on Tailwind or loaded fonts.
 * This ensures it displays even before any stylesheets are parsed.
 */
export default function ElectronSplash({ status }: ElectronSplashProps) {
  const isError = status.progress === -1

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 320, width: '100%', padding: '0 24px' }}>
        {/* App logo */}
        <div
          style={{
            fontSize: 42,
            fontWeight: 800,
            letterSpacing: 2,
            marginBottom: 32,
            background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          RYX Billing
        </div>

        {/* Progress bar — only when loading */}
        {!isError && (
          <div
            style={{
              width: '100%',
              height: 3,
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 2,
              marginBottom: 20,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.max(0, status.progress)}%`,
                background: 'linear-gradient(90deg, #60a5fa, #a78bfa)',
                borderRadius: 2,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        )}

        {/* Spinner — only when loading */}
        {!isError && (
          <div
            style={{
              width: 32,
              height: 32,
              border: '3px solid rgba(255,255,255,0.1)',
              borderTopColor: '#60a5fa',
              borderRadius: '50%',
              animation: 'ryx-spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }}
          />
        )}

        {/* Error icon */}
        {isError && (
          <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
        )}

        {/* Status message */}
        <p style={{ color: isError ? '#f87171' : '#94a3b8', fontSize: 13, margin: 0 }}>
          {status.message}
        </p>

        {/* Restart hint on error */}
        {isError && (
          <p style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
            Close and reopen the app to try again.
          </p>
        )}
      </div>

      <style>{`@keyframes ryx-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
```

- [ ] **Step 2: Update `frontend-react/src/App.tsx`**

Add the following to `App.tsx`. **App.tsx is the single IPC listener.** It passes `startupStatus` as a prop to `ElectronSplash`.

At the top of the file, add the import:
```tsx
import { useState, useEffect } from 'react'
import ElectronSplash from '@/components/ElectronSplash'
```

Inside the `App()` function, before the return statement, add:
```tsx
const isElectron = !!(window as any).electronAPI?.isElectron

const [startupStatus, setStartupStatus] = useState({
  message: 'Initializing…',
  progress: 5,
})
// backendReady starts true for web, false for Electron
const [backendReady, setBackendReady] = useState(!isElectron)

useEffect(() => {
  if (!isElectron) return
  const api = (window as any).electronAPI
  if (!api?.onStartupStatus) { setBackendReady(true); return }

  api.onStartupStatus((data: { message: string; progress: number }) => {
    setStartupStatus(data)
    // Only mark ready on success (>= 80). On error (progress -1),
    // keep the splash visible so the user sees the error message.
    if (data.progress >= 80) {
      setBackendReady(true)
    }
  })

  return () => {
    api.removeStartupStatus?.()
  }
}, [isElectron])
```

At the very start of the return, add the splash guard:
```tsx
if (!backendReady) return <ElectronSplash status={startupStatus} />
```

The full `App()` function now looks like:
```tsx
export default function App() {
  const isElectron = !!(window as any).electronAPI?.isElectron
  const [startupStatus, setStartupStatus] = useState({ message: 'Initializing…', progress: 5 })
  const [backendReady, setBackendReady] = useState(!isElectron)

  useEffect(() => {
    if (!isElectron) return
    const api = (window as any).electronAPI
    if (!api?.onStartupStatus) { setBackendReady(true); return }
    api.onStartupStatus((data: { message: string; progress: number }) => {
      setStartupStatus(data)
      if (data.progress >= 80) setBackendReady(true)
    })
    return () => { api.removeStartupStatus?.() }
  }, [isElectron])

  if (!backendReady) return <ElectronSplash status={startupStatus} />

  return (
    <ThemeProvider>
      <LoadingProvider>
        <LoadingInitializer>
          <ClientProvider>
            <ImpersonationBanner />
            <DataProvider>
              <Suspense fallback={<LoadingFallback />}>
                <AppRoutes />
              </Suspense>
            </DataProvider>
          </ClientProvider>
        </LoadingInitializer>
      </LoadingProvider>
    </ThemeProvider>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles with no errors**

```bash
cd frontend-react && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend-react/src/components/ElectronSplash.tsx frontend-react/src/App.tsx
git commit -m "feat(frontend): add ElectronSplash with IPC progress — single listener in App.tsx"
```

---

## Chunk 4: Frontend — Remove Google Fonts Network Dependency

### Task 6: Bundle Fonts Locally

**Files:**
- Modify: `frontend-react/index.html`
- Create: `frontend-react/src/styles/fonts.css`
- Modify: `frontend-react/src/styles/globals.css`
- Create: `frontend-react/public/fonts/` (downloaded `.woff2` files)

> **Why this matters:** `index.html` lines 6-8 send 3 network requests to `fonts.googleapis.com` on every startup. In Electron, these hit the client's network. If offline or slow, rendering blocks for 2-5s or falls back to system fonts mid-session. Bundling fonts means zero network dependency and consistent renders.

- [ ] **Step 1: Look up correct font URLs**

Run these to get the actual CSS with per-weight URLs:
```bash
curl "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&display=swap"
curl "https://fonts.googleapis.com/css2?family=Cinzel:wght@300;400&display=swap"
curl "https://fonts.googleapis.com/css2?family=Lavishly+Yours&display=swap"
```
Copy the `woff2` URLs from the output — they will look like `https://fonts.gstatic.com/s/...`

- [ ] **Step 2: Download fonts to `public/fonts/`**

```bash
mkdir -p frontend-react/public/fonts
```

Use the URLs from Step 1 to download each file (replace `<URL>` with actual URL):
```bash
curl -L -o frontend-react/public/fonts/cormorant-garamond-300.woff2 "<URL for Cormorant Garamond 300>"
curl -L -o frontend-react/public/fonts/cormorant-garamond-400.woff2 "<URL for Cormorant Garamond 400>"
curl -L -o frontend-react/public/fonts/cinzel-300.woff2              "<URL for Cinzel 300>"
curl -L -o frontend-react/public/fonts/cinzel-400.woff2              "<URL for Cinzel 400>"
curl -L -o frontend-react/public/fonts/lavishly-yours-400.woff2      "<URL for Lavishly Yours 400>"
```

Verify each file is non-empty:
```bash
ls -lh frontend-react/public/fonts/
```
Expected: 5 files, each 10-50KB.

- [ ] **Step 3: Create `frontend-react/src/styles/fonts.css`**

```css
@font-face {
  font-family: 'Cormorant Garamond';
  font-style: normal;
  font-weight: 300;
  font-display: swap;
  src: url('/fonts/cormorant-garamond-300.woff2') format('woff2');
}

@font-face {
  font-family: 'Cormorant Garamond';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/cormorant-garamond-400.woff2') format('woff2');
}

@font-face {
  font-family: 'Cinzel';
  font-style: normal;
  font-weight: 300;
  font-display: swap;
  src: url('/fonts/cinzel-300.woff2') format('woff2');
}

@font-face {
  font-family: 'Cinzel';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/cinzel-400.woff2') format('woff2');
}

@font-face {
  font-family: 'Lavishly Yours';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/lavishly-yours-400.woff2') format('woff2');
}
```

- [ ] **Step 4: Import `fonts.css` in `globals.css`**

At the very top of `frontend-react/src/styles/globals.css`, add:
```css
@import './fonts.css';
```

- [ ] **Step 5: Remove Google Fonts from `index.html`**

Remove these 3 lines from `frontend-react/index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=Cinzel:wght@300;400&family=Lavishly+Yours&display=swap" rel="stylesheet">
```

- [ ] **Step 6: Build and verify no network font requests**

```bash
cd frontend-react && npm run build
```
Expected: Build succeeds with no errors.

Then start the app and open DevTools → Network tab → filter by "font" or "googleapis" → should be **zero** requests.

- [ ] **Step 7: Commit**

```bash
git add frontend-react/index.html frontend-react/src/styles/fonts.css \
        frontend-react/src/styles/globals.css frontend-react/public/fonts/
git commit -m "feat(frontend): bundle 3 font families locally — remove Google Fonts network calls"
```

---

## Chunk 5: Integration Test & Verification

### Task 7: Smoke Tests

- [ ] **Step 1: Cold start timing test**

```bash
npm run electron:dev
```

Measure with a stopwatch:
- Window appears + dark background: **< 500ms** ✓
- ElectronSplash renders with "Initializing…": **< 800ms** ✓
- Login page visible after backend ready: **< 8s** ✓ (first run may be slower for migrations)
- Zero blank/white screen at any point ✓

- [ ] **Step 2: Daily open test (second launch)**

Close the app and reopen. Check Flask logs:
```
[Migration] Schema up to date (v1). Skipping all migration checks.
```
Measure: window to Login page should now be **< 3s** (no migration overhead).

- [ ] **Step 3: Backend crash recovery test**

While app is open and on Login page, kill Flask:
```bash
pkill -f "python app.py"
```
Expected:
- ElectronSplash reappears with "Reconnecting… (attempt 2/3)"
- Flask restarts within 5s
- App returns to Login page

- [ ] **Step 4: All-attempts-failed test**

Temporarily rename `backend/app.py` to `backend/app.py.bak`:
```bash
mv backend/app.py backend/app.py.bak
npm run electron:dev
```
Expected after 3 attempts (~30s): Splash shows "Could not start backend after 3 attempts. Please restart the app." — NO crash, NO white screen, NO Windows "not responding" dialog.

Restore:
```bash
mv backend/app.py.bak backend/app.py
```

- [ ] **Step 5: Font verification**

Open app → Open DevTools (right-click → Inspect) → Network tab → Reload → filter "font":
- Zero requests to `fonts.googleapis.com` or `fonts.gstatic.com`
- All font files loaded from `localhost` or `file://`

- [ ] **Step 6: Create test checklist doc**

```bash
mkdir -p docs/testing
cat > docs/testing/startup-checklist.md << 'EOF'
# Electron Startup Smoke Checklist

## Daily Open (target: < 3s to Login)
- [ ] Splash visible < 500ms (no blank white screen)
- [ ] Flask logs: "Schema up to date (v1). Skipping all migration checks."
- [ ] Login page renders and is interactive

## First Install (migrations run — acceptable to take 5-10s)
- [ ] Flask logs show migration steps
- [ ] Schema version written: "[Migration] Schema now at v1"
- [ ] Login page reaches after migrations complete

## Backend Crash Recovery
- [ ] Kill Flask → Splash shows "Reconnecting…"
- [ ] Flask auto-restarts within 5s → Login page returns
- [ ] After 3 failures → error message shown, no app crash

## Font Rendering
- [ ] DevTools Network: zero requests to fonts.googleapis.com
- [ ] Cormorant Garamond, Cinzel, Lavishly Yours render correctly

## Existing Features (regression check)
- [ ] Silent print still works
- [ ] Printer list IPC works
- [ ] System tray appears and works
- [ ] Minimize to tray on window close works
EOF
```

- [ ] **Step 7: Commit**

```bash
git add docs/testing/startup-checklist.md
git commit -m "docs: add startup smoke test checklist"
```

---

## Summary: What Changes, What Doesn't

| File | Change | Risk |
|---|---|---|
| `backend/migrations/runner.py` | NEW — versioned migration runner | Zero (additive) |
| `backend/app.py` | Replace 15+ inline migration blocks with 1 call | Low — same logic, gated by version |
| `electron/main.js` | Instant window + parallel Flask + health poll + supervisor | Medium — test thoroughly |
| `electron/preload.js` | Add `onStartupStatus` / `removeStartupStatus` IPC | Low — additive |
| `frontend-react/src/components/ElectronSplash.tsx` | NEW — branded loading screen (prop-driven) | Zero (additive) |
| `frontend-react/src/App.tsx` | Add Electron splash guard + single IPC listener | Low — only affects Electron mode |
| `frontend-react/index.html` | Remove 3 Google Fonts lines | Low — same fonts, local source |
| `frontend-react/src/styles/fonts.css` | NEW — local `@font-face` declarations | Zero (additive) |
| `frontend-react/public/fonts/*.woff2` | NEW — downloaded font files | Zero (additive) |
| `docs/testing/startup-checklist.md` | NEW — test checklist | Zero |

**All 40 routes, all page components, all contexts, all services — UNTOUCHED.**

## Expected Result After Implementation

| Metric | Before | After |
|---|---|---|
| First pixel on screen | 30-60s (blank) | < 500ms (splash) |
| Daily open to backend ready | 30-60s | 2-4s |
| Migration checks on daily open | 15+ SQLite inspections | 1 version read (< 1ms) |
| Google Fonts network calls | Every startup | Never |
| Backend crash recovery | Blank screen / freeze | Auto-restart with user feedback |
| Blank/white screen time | 30-60s | 0s |
