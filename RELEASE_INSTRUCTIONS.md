# Release Instructions

## How to Release a New Version

Follow these steps to release a new version with automatic updates:

### 1. Update Version Number
Edit `package.json` and change the version:
```json
"version": "1.0.1"  // Change from 1.0.0 to 1.0.1
```

### 2. Commit Changes
```bash
git add .
git commit -m "Release v1.0.1"
```

### 3. Create and Push Tag
```bash
git tag v1.0.1
git push origin main
git push origin v1.0.1
```

### 4. GitHub Actions Builds Automatically
- GitHub Actions will automatically build the app
- Takes about 5-10 minutes
- Check progress at: https://github.com/ryxdevsolution-stack/mj-billing/actions

### 5. Release is Published
- Installer will be available at: https://github.com/ryxdevsolution-stack/mj-billing/releases
- All client apps will automatically receive the update

## What Happens on Client Side

1. App checks for updates on startup (after 5 seconds)
2. If update found, downloads in background
3. User sees notification about update
4. Update installs when user closes the app
5. Next time they open, they have the new version

## Manual Update Check

Users can also manually check for updates:
- Right-click system tray icon
- Select "Check for Updates"

## Version Naming

Always use semantic versioning:
- `v1.0.0` - Major release
- `v1.0.1` - Bug fixes
- `v1.1.0` - New features
- `v2.0.0` - Breaking changes

## Important Notes

- Always test locally before releasing
- Version in package.json must match the git tag
- Tag must start with 'v' (e.g., v1.0.1, not 1.0.1)
- Don't delete old releases - users might still be on older versions
