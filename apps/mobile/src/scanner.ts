import { BarcodeScanner, BarcodeFormat } from "@capacitor-mlkit/barcode-scanning";

export async function scanQrCode(): Promise<string | null> {
  const { camera } = await BarcodeScanner.requestPermissions();
  if (camera !== "granted" && camera !== "limited") {
    throw new Error("Camera permission denied");
  }

  let scannerModuleAvailable = true;
  try {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    scannerModuleAvailable = available;
  } catch {
    scannerModuleAvailable = true;
  }

  if (!scannerModuleAvailable) {
    throw new Error("QR scanner module is unavailable on this device.");
  }

  const { barcodes } = await BarcodeScanner.scan({
    formats: [BarcodeFormat.QrCode],
  });

  const match = barcodes.find((b: { rawValue?: string }) => b.rawValue?.startsWith("otpauth://"));
  return match?.rawValue ?? null;
}
