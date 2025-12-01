declare module 'qz-tray' {
  interface QZWebsocket {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isActive(): boolean;
  }

  interface QZSecurity {
    setCertificatePromise(callback: (resolve: (cert: string) => void) => void): void;
    setSignaturePromise(callback: () => (resolve: (sig: string) => void) => void): void;
  }

  interface QZPrinters {
    find(): Promise<string | string[]>;
    getDefault(): Promise<string>;
  }

  interface QZConfigOptions {
    encoding?: string;
    copies?: number;
    margins?: number | { top?: number; left?: number; right?: number; bottom?: number };
    size?: { width?: number; height?: number };
    units?: 'in' | 'cm' | 'mm';
    colorType?: 'color' | 'grayscale' | 'blackwhite';
    interpolation?: 'bicubic' | 'bilinear' | 'nearest-neighbor';
    rotation?: number;
    scaleContent?: boolean;
    rasterize?: boolean;
    altPrinting?: boolean;
  }

  interface QZConfig {
    // Config object returned by qz.configs.create()
  }

  interface QZConfigs {
    create(printer: string, options?: QZConfigOptions): QZConfig;
  }

  interface QZPrintData {
    type: 'raw' | 'html' | 'pdf' | 'image' | 'file' | 'pixel';
    format?: 'plain' | 'base64' | 'hex' | 'file' | 'xml';
    data: string | string[];
    options?: Record<string, any>;
  }

  interface QZ {
    websocket: QZWebsocket;
    security: QZSecurity;
    printers: QZPrinters;
    configs: QZConfigs;
    print(config: QZConfig, data: QZPrintData[]): Promise<void>;
  }

  const qz: QZ;
  export default qz;
  export = qz;
}
