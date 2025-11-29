/**
 * Post-build script to copy static files for Next.js standalone output
 * This is required because Next.js standalone doesn't include static files
 */

const fs = require('fs');
const path = require('path');

function copyFolderSync(from, to) {
    if (!fs.existsSync(from)) {
        console.log(`Source folder doesn't exist: ${from}`);
        return;
    }

    fs.mkdirSync(to, { recursive: true });

    fs.readdirSync(from).forEach((element) => {
        const fromPath = path.join(from, element);
        const toPath = path.join(to, element);

        if (fs.lstatSync(fromPath).isFile()) {
            fs.copyFileSync(fromPath, toPath);
        } else {
            copyFolderSync(fromPath, toPath);
        }
    });
}

const frontendDir = path.join(__dirname, '..');
const standaloneDir = path.join(frontendDir, '.next', 'standalone');

// Check if standalone exists
if (!fs.existsSync(standaloneDir)) {
    console.log('Standalone directory not found. Skipping postbuild.');
    process.exit(0);
}

// Copy .next/static to .next/standalone/.next/static
const staticSource = path.join(frontendDir, '.next', 'static');
const staticDest = path.join(standaloneDir, '.next', 'static');

console.log('Copying static files...');
console.log(`From: ${staticSource}`);
console.log(`To: ${staticDest}`);

if (fs.existsSync(staticSource)) {
    copyFolderSync(staticSource, staticDest);
    console.log('Static files copied successfully.');
} else {
    console.log('Static folder not found, skipping.');
}

// Copy public folder to .next/standalone/public
const publicSource = path.join(frontendDir, 'public');
const publicDest = path.join(standaloneDir, 'public');

console.log('Copying public files...');
console.log(`From: ${publicSource}`);
console.log(`To: ${publicDest}`);

if (fs.existsSync(publicSource)) {
    copyFolderSync(publicSource, publicDest);
    console.log('Public files copied successfully.');
} else {
    console.log('Public folder not found, skipping.');
}

console.log('Postbuild completed!');
