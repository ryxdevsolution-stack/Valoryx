/**
 * Web Bluetooth Thermal Printer Service
 *
 * Ported from Flutter's printer_helper.dart ESC/POS logic.
 * Uses the Web Bluetooth API to communicate with BLE thermal printers.
 *
 * Supports common 58mm/80mm thermal printers that expose a writable
 * BLE characteristic (e.g. Goojprt, PeriPage, cat-printers, generic ESC/POS).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReceiptItem {
  name: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface ReceiptData {
  shopName: string;
  address1: string;
  address2?: string;
  phone: string;
  gstNumber?: string;
  billNumber: string;
  date: string;
  time: string;
  paymentMethod: string;
  items: ReceiptItem[];
  subtotal: number;
  gstAmount?: number;
  discount?: number;
  grandTotal: number;
  footerText?: string;
}

// ---------------------------------------------------------------------------
// ESC/POS command constants
// ---------------------------------------------------------------------------

const ESC_POS = {
  INIT: new Uint8Array([0x1b, 0x40]),
  ALIGN_LEFT: new Uint8Array([0x1b, 0x61, 0x00]),
  ALIGN_CENTER: new Uint8Array([0x1b, 0x61, 0x01]),
  ALIGN_RIGHT: new Uint8Array([0x1b, 0x61, 0x02]),
  BOLD_ON: new Uint8Array([0x1b, 0x45, 0x01]),
  BOLD_OFF: new Uint8Array([0x1b, 0x45, 0x00]),
  DOUBLE_HEIGHT: new Uint8Array([0x1b, 0x21, 0x10]),
  NORMAL_SIZE: new Uint8Array([0x1b, 0x21, 0x00]),
  LINE_FEED: new Uint8Array([0x0a]),
  CUT_PAPER: new Uint8Array([0x1d, 0x56, 0x00]),
} as const;

// Well-known BLE service UUIDs used by thermal printers
const PRINTER_SERVICE_UUIDS: BluetoothServiceUUID[] = [
  '000018f0-0000-1000-8000-00805f9b34fb', // common thermal printer service
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // alternate printer service
];

const OPTIONAL_SERVICE_UUIDS: BluetoothServiceUUID[] = [
  '00001101-0000-1000-8000-00805f9b34fb', // SPP (Serial Port Profile)
];

const DEVICE_ID_STORAGE_KEY = 'bt_printer_device_id';

/** Maximum payload per BLE write — most peripherals cap at 20 bytes. */
const BLE_CHUNK_SIZE = 20;

/** Column width for receipt formatting (32 chars for 58 mm paper). */
const RECEIPT_WIDTH = 32;

const SEPARATOR = '-'.repeat(RECEIPT_WIDTH);

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BluetoothPrinterService {
  // -- singleton -------------------------------------------------------------
  private static _instance: BluetoothPrinterService | null = null;

  static getInstance(): BluetoothPrinterService {
    if (!BluetoothPrinterService._instance) {
      BluetoothPrinterService._instance = new BluetoothPrinterService();
    }
    return BluetoothPrinterService._instance;
  }

  // -- state -----------------------------------------------------------------
  private _isConnected = false;
  private _connectedDevice: BluetoothDevice | null = null;
  private _characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private _savedDeviceId: string | null = null;

  get isConnected(): boolean {
    return this._isConnected;
  }

  get connectedDevice(): BluetoothDevice | null {
    return this._connectedDevice;
  }

  get savedDeviceId(): string | null {
    return this._savedDeviceId;
  }

  // -- constructor -----------------------------------------------------------
  private constructor() {
    try {
      this._savedDeviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    } catch {
      this._savedDeviceId = null;
    }
  }

  // -- public API ------------------------------------------------------------

  /**
   * Returns `true` when the current browser supports the Web Bluetooth API.
   */
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  /**
   * Opens the browser Bluetooth pairing dialog and returns the selected device
   * (or `null` if the user cancels or an error occurs).
   */
  async requestDevice(): Promise<BluetoothDevice | null> {
    if (!this.isSupported()) {
      console.error('[BluetoothPrinter] Web Bluetooth API is not supported in this browser.');
      return null;
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: PRINTER_SERVICE_UUIDS.map((uuid) => ({ services: [uuid] })),
        optionalServices: OPTIONAL_SERVICE_UUIDS,
      });

      this._persistDeviceId(device.id);
      return device;
    } catch (err) {
      // User may have cancelled the dialog — that is not a real error.
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        console.info('[BluetoothPrinter] Device selection cancelled by user.');
        return null;
      }

      // If filters fail (no matching devices), retry with acceptAllDevices
      try {
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [...PRINTER_SERVICE_UUIDS, ...OPTIONAL_SERVICE_UUIDS],
        });

        this._persistDeviceId(device.id);
        return device;
      } catch (retryErr) {
        if (retryErr instanceof DOMException && retryErr.name === 'NotFoundError') {
          console.info('[BluetoothPrinter] Device selection cancelled by user.');
          return null;
        }
        console.error('[BluetoothPrinter] requestDevice failed:', retryErr);
        return null;
      }
    }
  }

  /**
   * Connects to the GATT server of the given device, discovers services and
   * characteristics, and stores a reference to the first writable characteristic
   * it finds.
   */
  async connect(device: BluetoothDevice): Promise<boolean> {
    try {
      if (!device.gatt) {
        console.error('[BluetoothPrinter] Device does not support GATT.');
        return false;
      }

      // Listen for unexpected disconnections
      device.addEventListener('gattserverdisconnected', this._onDisconnected);

      const server = await device.gatt.connect();
      const characteristic = await this._discoverWritableCharacteristic(server);

      if (!characteristic) {
        console.error('[BluetoothPrinter] No writable characteristic found on device.');
        await this.disconnect();
        return false;
      }

      this._connectedDevice = device;
      this._characteristic = characteristic;
      this._isConnected = true;
      this._persistDeviceId(device.id);

      console.info(`[BluetoothPrinter] Connected to ${device.name ?? device.id}`);
      return true;
    } catch (err) {
      console.error('[BluetoothPrinter] connect failed:', err);
      this._resetState();
      return false;
    }
  }

  /**
   * Disconnects from the currently connected device.
   */
  async disconnect(): Promise<void> {
    try {
      if (this._connectedDevice?.gatt?.connected) {
        this._connectedDevice.removeEventListener(
          'gattserverdisconnected',
          this._onDisconnected,
        );
        this._connectedDevice.gatt.disconnect();
      }
    } catch (err) {
      console.error('[BluetoothPrinter] disconnect error:', err);
    } finally {
      this._resetState();
    }
  }

  /**
   * Sends raw bytes to the printer, splitting into BLE-safe 20-byte chunks.
   */
  async sendData(data: Uint8Array): Promise<boolean> {
    if (!this._isConnected || !this._characteristic) {
      console.error('[BluetoothPrinter] Not connected — cannot send data.');
      return false;
    }

    try {
      for (let offset = 0; offset < data.length; offset += BLE_CHUNK_SIZE) {
        const chunk = data.slice(offset, offset + BLE_CHUNK_SIZE);
        await this._characteristic.writeValueWithoutResponse(chunk);
      }
      return true;
    } catch (err) {
      // Fall back to writeValue (with response) for peripherals that require it
      try {
        for (let offset = 0; offset < data.length; offset += BLE_CHUNK_SIZE) {
          const chunk = data.slice(offset, offset + BLE_CHUNK_SIZE);
          await this._characteristic!.writeValue(chunk);
        }
        return true;
      } catch (fallbackErr) {
        console.error('[BluetoothPrinter] sendData failed:', fallbackErr);
        return false;
      }
    }
  }

  /**
   * Converts a string to Latin-1 / ISO-8859-1 bytes. Characters outside the
   * 0x00-0xFF range are replaced with `?`.
   */
  textToBytes(text: string): Uint8Array {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      bytes[i] = code <= 0xff ? code : 0x3f; // '?'
    }
    return bytes;
  }

  /**
   * Formats and prints a full receipt using ESC/POS commands.
   * Mirrors the layout produced by the Flutter `PrinterHelper.printReceipt`.
   */
  async printReceipt(receipt: ReceiptData): Promise<boolean> {
    if (!this._isConnected) {
      console.error('[BluetoothPrinter] Not connected — cannot print receipt.');
      return false;
    }

    try {
      const data = this._buildReceiptBytes(receipt);
      return await this.sendData(data);
    } catch (err) {
      console.error('[BluetoothPrinter] printReceipt failed:', err);
      return false;
    }
  }

  // -- private helpers -------------------------------------------------------

  /**
   * Iterates over discovered GATT services and returns the first writable
   * characteristic, preferring `writeWithoutResponse`.
   */
  private async _discoverWritableCharacteristic(
    server: BluetoothRemoteGATTServer,
  ): Promise<BluetoothRemoteGATTCharacteristic | null> {
    const targetUUIDs = [...PRINTER_SERVICE_UUIDS, ...OPTIONAL_SERVICE_UUIDS];

    for (const uuid of targetUUIDs) {
      try {
        const service = await server.getPrimaryService(uuid);
        const characteristics = await service.getCharacteristics();

        for (const char of characteristics) {
          if (
            char.properties.writeWithoutResponse ||
            char.properties.write
          ) {
            return char;
          }
        }
      } catch {
        // Service not available on this device — try next UUID.
      }
    }

    // Last resort: iterate ALL primary services
    try {
      const services = await server.getPrimaryServices();
      for (const service of services) {
        try {
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (
              char.properties.writeWithoutResponse ||
              char.properties.write
            ) {
              return char;
            }
          }
        } catch {
          // skip
        }
      }
    } catch {
      // getPrimaryServices may not be supported without filters
    }

    return null;
  }

  /**
   * Builds the complete ESC/POS byte sequence for a receipt.
   */
  private _buildReceiptBytes(receipt: ReceiptData): Uint8Array {
    const parts: Uint8Array[] = [];

    const push = (...arrays: Uint8Array[]) => {
      for (const a of arrays) parts.push(a);
    };

    const text = (s: string) => this.textToBytes(s);
    const lf = ESC_POS.LINE_FEED;

    // 1. INIT
    push(ESC_POS.INIT);

    // 2. Shop name — center, bold, double height
    push(ESC_POS.ALIGN_CENTER, ESC_POS.BOLD_ON, ESC_POS.DOUBLE_HEIGHT);
    push(text(receipt.shopName), lf);

    // 3. Address lines — center, normal
    push(ESC_POS.NORMAL_SIZE, ESC_POS.BOLD_OFF);
    push(text(receipt.address1), lf);
    if (receipt.address2) {
      push(text(receipt.address2), lf);
    }

    // 4. Phone — center
    push(text(receipt.phone), lf);

    // 5. GST number (if present) — center, bold
    if (receipt.gstNumber) {
      push(ESC_POS.BOLD_ON);
      push(text(`GSTIN: ${receipt.gstNumber}`), lf);
      push(ESC_POS.BOLD_OFF);
    }

    // 6. Separator
    push(text(SEPARATOR), lf);

    // 7. Bill number + Payment method — left
    push(ESC_POS.ALIGN_LEFT);
    push(text(`Bill No: ${receipt.billNumber}`), lf);
    push(text(`Payment: ${receipt.paymentMethod}`), lf);

    // 8. Date + Time — left
    push(text(`Date: ${receipt.date}  Time: ${receipt.time}`), lf);

    // 9. Separator
    push(text(SEPARATOR), lf);

    // 10. Table header
    push(text(this._formatRow('Item', 'Qty', 'Rate', 'Amt')), lf);
    push(text(SEPARATOR), lf);

    // 11. Item rows
    for (const item of receipt.items) {
      const name =
        item.name.length > 16 ? item.name.substring(0, 16) : item.name;
      push(
        text(
          this._formatRow(
            name,
            String(item.quantity),
            item.rate.toFixed(0),
            item.amount.toFixed(2),
          ),
        ),
        lf,
      );
    }

    // 12. Separator
    push(text(SEPARATOR), lf);

    // 13. Subtotal, GST, Discount — right aligned
    push(ESC_POS.ALIGN_RIGHT);
    push(text(`Subtotal: ${receipt.subtotal.toFixed(2)}`), lf);

    if (receipt.gstAmount !== undefined && receipt.gstAmount !== null) {
      push(text(`GST: ${receipt.gstAmount.toFixed(2)}`), lf);
    }
    if (receipt.discount !== undefined && receipt.discount !== null && receipt.discount > 0) {
      push(text(`Discount: -${receipt.discount.toFixed(2)}`), lf);
    }

    // 14. Grand Total — right, bold, double height
    push(ESC_POS.BOLD_ON, ESC_POS.DOUBLE_HEIGHT);
    push(text(`TOTAL: ${receipt.grandTotal.toFixed(2)}`), lf);
    push(ESC_POS.NORMAL_SIZE, ESC_POS.BOLD_OFF);

    // 15. Separator
    push(ESC_POS.ALIGN_LEFT);
    push(text(SEPARATOR), lf);

    // 16. Footer — center
    if (receipt.footerText) {
      push(ESC_POS.ALIGN_CENTER);
      push(text(receipt.footerText), lf);
    }

    // 17. 4 line feeds
    push(lf, lf, lf, lf);

    // 18. Cut paper
    push(ESC_POS.CUT_PAPER);

    return this._concatUint8Arrays(parts);
  }

  /**
   * Formats a single row for the item table.
   * Columns: Item (16) | Qty (4) | Rate (6) | Amt (6) = 32 chars
   */
  private _formatRow(
    item: string,
    qty: string,
    rate: string,
    amount: string,
  ): string {
    return (
      item.padEnd(16).substring(0, 16) +
      qty.padStart(4) +
      rate.padStart(6) +
      amount.padStart(6)
    );
  }

  /**
   * Concatenates an array of Uint8Array into a single Uint8Array.
   */
  private _concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
    let totalLength = 0;
    for (const arr of arrays) {
      totalLength += arr.length;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }

  /**
   * Handles unexpected GATT disconnection events.
   */
  private _onDisconnected = (): void => {
    console.warn('[BluetoothPrinter] Device disconnected unexpectedly.');
    this._resetState();
  };

  /**
   * Clears all connection state without touching `_savedDeviceId`.
   */
  private _resetState(): void {
    this._isConnected = false;
    this._connectedDevice = null;
    this._characteristic = null;
  }

  /**
   * Persists the device id to localStorage so the UI can offer a reconnect
   * shortcut on next visit.
   */
  private _persistDeviceId(id: string): void {
    this._savedDeviceId = id;
    try {
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    } catch {
      // Storage may be unavailable (private browsing, quota exceeded).
    }
  }
}

// ---------------------------------------------------------------------------
// Default singleton export
// ---------------------------------------------------------------------------

const bluetoothPrinterService = BluetoothPrinterService.getInstance();
export default bluetoothPrinterService;
