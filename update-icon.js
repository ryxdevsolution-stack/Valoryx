/**
 * Update Electron App Icon
 * Converts PNG logo to ICO format for Windows
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sourceLogo = path.join(__dirname, 'frontend', 'public', 'RYX_Logo.png');
const targetIcoPath = path.join(__dirname, 'electron', 'resources', 'icon.ico');
const targetIconsIcoPath = path.join(__dirname, 'electron', 'resources', 'icons', 'icon.ico');

console.log('📦 Updating Electron App Icon...');
console.log('Source:', sourceLogo);
console.log('Target:', targetIcoPath);

// Check if source exists
if (!fs.existsSync(sourceLogo)) {
  console.error('❌ Error: Source logo not found at:', sourceLogo);
  process.exit(1);
}

// Method 1: Try using electron-icon-builder (if available)
try {
  console.log('\n🔄 Attempting to generate icons using electron-icon-builder...');
  execSync(`npx electron-icon-builder --input="${sourceLogo}" --output=electron/resources`, {
    stdio: 'inherit'
  });
  console.log('✅ Icons generated successfully!');
} catch (error) {
  console.log('⚠️  electron-icon-builder failed, trying alternative method...');

  // Method 2: Manual copy (requires manual ICO conversion)
  console.log('\n📝 Please convert your logo manually:');
  console.log('1. Go to https://convertico.com/ or https://www.icoconverter.com/');
  console.log('2. Upload:', sourceLogo);
  console.log('3. Download the .ico file');
  console.log('4. Replace these files:');
  console.log('   -', targetIcoPath);
  console.log('   -', targetIconsIcoPath);
  console.log('\n💡 After replacing, run: npm run electron:build:win');
}

console.log('\n✨ Icon update process complete!');
console.log('\n📌 Next steps:');
console.log('1. Rebuild your app: npm run electron:build:win');
console.log('2. Reinstall the app to see the new icon on desktop shortcuts');
