# Valoryx Release Flow

Standard steps to build, tag, and publish a new version.

## Steps

1. **Bump version** in `package.json` (e.g. `1.1.1` → `1.1.2`)

2. **Build the exe**
   ```powershell
   npm run electron:build
   ```

3. **Commit, tag, push, and release**
   ```powershell
   git add -A
   git commit -m "v1.1.4"
   git tag v1.1.4
   git push origin main
   git push origin v1.1.4
   gh release create v1.1.4 --title "v1.1.3" --notes "Release notes here" dist/Valoryx-Setup-1.1.4.exe dist/latest.yml
   ```

4. **Client auto-update** — clients on older versions will get the update automatically next time they open the app.

---

## Notes

- Replace `1.1.4` with the actual version number each release.
- Update the `--notes` text with a summary of what changed.
- Both `Valoryx-Setup-X.X.X.exe` and `latest.yml` must be uploaded to the GitHub release for auto-update to work.

## If the tag already exists

```powershell
gh release delete v1.1.2 --yes
git tag -d v1.1.2
git push origin :refs/tags/v1.1.4
```

Then recreate the tag and release.

## If git push is rejected (branches diverged)

```powershell
git pull origin main --rebase
git push origin main
```
