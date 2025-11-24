# RYX Billing Desktop Application

## Architecture

This desktop application uses a modern, modular architecture:

```
desktop/
├── main/               # Main process modules
│   ├── index.js       # Entry point
│   ├── services.js    # Service management
│   ├── window.js      # Window management
│   └── ipc.js         # IPC handlers
├── preload/           # Preload scripts
│   └── index.js       # Security bridge
├── utils/             # Utility modules
│   ├── config.js      # Configuration
│   └── health-check.js # Health monitoring
└── resources/         # Application resources
    └── icons/         # Application icons
```

## Key Features

### 1. **Service Management**
- Automatic backend/frontend startup
- Health monitoring with retry logic
- Graceful shutdown handling
- Automatic service restart on failure

### 2. **Configuration**
- Environment-based configuration
- No hardcoded values
- Dynamic port allocation support
- Platform-specific settings

### 3. **Security**
- Context isolation enabled
- Preload script for secure IPC
- No direct node integration in renderer
- Controlled API exposure

### 4. **Window Management**
- Centralized window creation
- Platform-specific optimizations
- Multi-window support
- State persistence

### 5. **IPC Communication**
- Type-safe IPC handlers
- Bi-directional communication
- Event-based updates
- Error handling

## Development

### Setup
```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.desktop .env

# Run in development mode
npm run dev
```

### Available Scripts

- `npm start` - Start the desktop app (production)
- `npm run dev` - Start in development mode
- `npm run build` - Build frontend and backend
- `npm run dist` - Build distributable packages
- `npm run dist:linux` - Build for Linux
- `npm run dist:win` - Build for Windows
- `npm run dist:mac` - Build for macOS

## Configuration

Edit `.env` file to configure:

- **Ports**: Backend and frontend ports
- **Window**: Size and behavior
- **Database**: Local or cloud mode
- **Printing**: Printer settings
- **Updates**: Auto-update behavior

## API Access from Renderer

The preload script exposes a secure API to the renderer:

```javascript
// System information
const version = await window.electronAPI.system.getVersion();

// File operations
const file = await window.electronAPI.file.selectFile();

// Printing
const printers = await window.electronAPI.printer.getPrinters();
await window.electronAPI.printer.print({ silent: true });

// Service management
const status = await window.electronAPI.service.getStatus();

// Database
await window.electronAPI.database.sync();
```

## Building for Distribution

### Prerequisites
- Node.js 16+
- Python 3.8+
- Build tools for your platform

### Build Process

1. **Prepare the build**:
   ```bash
   npm run build
   ```

2. **Create distributables**:
   ```bash
   # For current platform
   npm run dist

   # For specific platform
   npm run dist:linux
   npm run dist:win
   npm run dist:mac
   ```

3. **Output locations**:
   - Linux: `dist/*.AppImage`, `dist/*.deb`
   - Windows: `dist/*.exe`
   - macOS: `dist/*.dmg`

## Troubleshooting

### Port Conflicts
- The app checks for port availability
- Ports can be configured in `.env`
- Default: Backend 5000, Frontend 3001

### Service Failures
- Check logs in console
- Services auto-restart 3 times
- Manual restart via service manager

### Build Issues
- Clear cache: `npm run clean`
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Check Python environment for backend

## Architecture Benefits

1. **No Hardcoding**: All configuration externalized
2. **Modular Design**: Easy to maintain and extend
3. **Error Recovery**: Automatic retry and restart logic
4. **Security First**: Proper context isolation
5. **Platform Agnostic**: Works across Windows, Linux, macOS
6. **Production Ready**: Optimized builds with ASAR packaging
7. **Developer Friendly**: Clear separation of concerns

## License

Proprietary - RYX Solutions © 2024