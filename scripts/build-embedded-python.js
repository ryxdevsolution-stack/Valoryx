#!/usr/bin/env node
/**
 * Builds a self-contained embedded Python 3.11 runtime under ./python/
 * with all backend dependencies pre-installed as Windows wheels.
 *
 * Runs cross-platform (Linux/macOS/Windows) on the build machine.
 * Output: ./python/ — ready to be packaged by electron-builder via extraResources.
 *
 * Zero network required on the end-user machine. Zero prerequisites on the client.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const PYTHON_VERSION = '3.11.9';
const PYTHON_MAJOR_MINOR = '311';
const PYTHON_EMBED_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;

const ROOT = path.resolve(__dirname, '..');
const PYTHON_DIR = path.join(ROOT, 'python');
const SITE_PACKAGES = path.join(PYTHON_DIR, 'Lib', 'site-packages');
const PTH_FILE = path.join(PYTHON_DIR, `python${PYTHON_MAJOR_MINOR}._pth`);
const REQUIREMENTS_SRC = path.join(ROOT, 'backend', 'requirements.txt');
const ZIP_PATH = path.join(os.tmpdir(), `python-${PYTHON_VERSION}-embed-amd64.zip`);
const CLEAN_REQ_PATH = path.join(os.tmpdir(), 'valoryx-requirements-clean.txt');

function log(msg) { console.log(`[embed-python] ${msg}`); }
function fail(msg) { console.error(`[embed-python] ERROR: ${msg}`); process.exit(1); }

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function downloadFile(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    https.get(url, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        res.resume();
        return downloadFile(res.headers.location, dest, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    }).on('error', reject);
  });
}

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force"`,
      { stdio: 'inherit' }
    );
  } else {
    const r = spawnSync('unzip', ['-oq', zipPath, '-d', destDir], { stdio: 'inherit' });
    if (r.status !== 0) fail('unzip failed. Install `unzip` package on your build machine.');
  }
}

function findBuildPython() {
  const candidates = [
    { cmd: 'python3', args: [] },
    { cmd: 'python', args: [] },
    { cmd: 'py', args: ['-3'] },
  ];
  for (const c of candidates) {
    const r = spawnSync(c.cmd, [...c.args, '--version'], { stdio: 'ignore' });
    if (r.status === 0) return c;
  }
  fail('No Python 3 found on build machine. Install Python 3 and retry.');
}

function readRequirementsAsUtf8(filePath) {
  const buf = fs.readFileSync(filePath);
  // UTF-16 LE BOM: FF FE
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.slice(2).toString('utf16le');
  }
  // UTF-8 BOM: EF BB BF
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString('utf8');
  }
  return buf.toString('utf8');
}

function writeCleanRequirements(srcText, destPath) {
  // Strip platform markers (e.g. "; sys_platform == 'win32'") — we're forcing Windows target.
  // Keep version pins. Skip comments and empty lines.
  const lines = srcText.split(/\r?\n/);
  const out = [];
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('-r ')) continue;
    const semi = line.indexOf(';');
    if (semi !== -1) line = line.slice(0, semi).trim();
    if (line) out.push(line);
  }
  fs.writeFileSync(destPath, out.join('\n') + '\n', 'utf8');
  return out.length;
}

function patchPthFile() {
  if (!fs.existsSync(PTH_FILE)) fail(`Expected ${PTH_FILE} not found after extraction.`);
  let pth = fs.readFileSync(PTH_FILE, 'utf8');
  pth = pth.replace(/#\s*import\s+site/g, 'import site');
  if (!/^\s*Lib[\\/]site-packages\s*$/m.test(pth)) {
    pth = pth.trimEnd() + '\nLib\\site-packages\n';
  }
  fs.writeFileSync(PTH_FILE, pth, 'utf8');
}

function cleanSitePackages(dir) {
  const PRUNE_DIRS = new Set(['__pycache__', 'tests', 'test']);
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (PRUNE_DIRS.has(e.name)) {
          fs.rmSync(full, { recursive: true, force: true });
        } else {
          walk(full);
        }
      } else if (e.name.endsWith('.pyc') || e.name.endsWith('.pyo')) {
        try { fs.unlinkSync(full); } catch {}
      }
    }
  };
  walk(dir);
}

function folderSizeMB(dir) {
  let total = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else { try { total += fs.statSync(full).size; } catch {} }
    }
  };
  walk(dir);
  return (total / (1024 * 1024)).toFixed(1);
}

async function main() {
  log(`Target: Python ${PYTHON_VERSION} (win_amd64) → ${PYTHON_DIR}`);

  log('[1/6] Cleaning existing python/ folder…');
  rmrf(PYTHON_DIR);

  log('[2/6] Downloading Python embeddable zip…');
  if (!fs.existsSync(ZIP_PATH)) {
    await downloadFile(PYTHON_EMBED_URL, ZIP_PATH);
  } else {
    log('      (cached zip reused from temp)');
  }

  log('[3/6] Extracting…');
  extractZip(ZIP_PATH, PYTHON_DIR);

  log('[4/6] Enabling site-packages in ._pth…');
  patchPthFile();
  fs.mkdirSync(SITE_PACKAGES, { recursive: true });

  log('[5/6] Installing Windows wheels into site-packages…');
  const reqText = readRequirementsAsUtf8(REQUIREMENTS_SRC);
  const count = writeCleanRequirements(reqText, CLEAN_REQ_PATH);
  log(`      ${count} packages to install`);

  const py = findBuildPython();
  const pipArgs = [
    ...py.args,
    '-m', 'pip', 'install',
    '-r', CLEAN_REQ_PATH,
    '--target', SITE_PACKAGES,
    '--platform', 'win_amd64',
    '--python-version', '3.11',
    '--implementation', 'cp',
    '--abi', 'cp311',
    '--only-binary=:all:',
    '--no-compile',
    '--upgrade',
    '--disable-pip-version-check',
  ];
  const r = spawnSync(py.cmd, pipArgs, { stdio: 'inherit' });
  if (r.status !== 0) {
    fail('pip install failed. See errors above. Most common cause: a package has no Windows wheel — pin a version that ships one.');
  }

  log('[6/6] Pruning __pycache__, tests, .pyc…');
  cleanSitePackages(SITE_PACKAGES);

  log(`✓ Done. Embedded Python size: ${folderSizeMB(PYTHON_DIR)} MB`);
  log(`  ${PYTHON_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
