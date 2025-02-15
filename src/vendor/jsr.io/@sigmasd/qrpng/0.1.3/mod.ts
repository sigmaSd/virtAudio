/**
 * # Qr Png
 * This module provides functionality to generate a PNG image of a QR code from given input data.
 *
 * @example
 * ```ts
 * import { qrPng } from "@sigmasd/qrpng";
 *
 * const data = new TextEncoder().encode("Hello, world!");
 * const qrCodePng = qrPng(data);
 * console.log(qrCodePng);
 *
 * @module
 */
import { instantiate } from "./lib/rs_lib.generated.js";
const { qr_png } = instantiate();

/**
 * Generates a PNG image of a QR code from the given input data.
 *
 * @param {Uint8Array} data - The input data to encode into a QR code.
 * @returns {Uint8Array} - A Uint8Array representing the PNG image of the QR code.
 *
 * @example
 * ```ts
 * const data = new TextEncoder().encode("Hello, world!");
 * const qrCodePng = qrPng(data);
 * console.log(qrCodePng);
 * ```
 */
export function qrPng(data: Uint8Array): Uint8Array {
  return qr_png(data);
}
