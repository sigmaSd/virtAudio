// deno-lint-ignore-file
// deno-fmt-ignore-file

export interface InstantiateResult {
  instance: WebAssembly.Instance;
  exports: {
    qr_png: typeof qr_png
  };
}

/** Gets if the Wasm module has been instantiated. */
export function isInstantiated(): boolean;


/** Instantiates an instance of the Wasm module returning its functions.
* @remarks It is safe to call this multiple times and once successfully
* loaded it will always return a reference to the same object. */
export function instantiate(): InstantiateResult["exports"];

/** Instantiates an instance of the Wasm module along with its exports.
 * @remarks It is safe to call this multiple times and once successfully
 * loaded it will always return a reference to the same object. */
export function instantiateWithInstance(): InstantiateResult;

/**
* Generates a PNG image of a QR code from the given input data.
*
* This function takes a slice of bytes representing the input data,
* generates a QR code from the data, and then renders the QR code
* as a PNG image. The PNG image is returned as a vector of bytes.
*
* # Arguments
*
* * `data` - A slice of bytes representing the input data to be encoded
*   into a QR code.
*
* # Returns
*
* A `Result` which is:
* * `Ok(Vec<u8>)` containing the PNG image data as a vector of bytes if the
*   operation is successful.
* * `Err(String)` containing an error message if the operation fails at any
*   point.
*
* # Errors
*
* This function can fail in two main places:
* 1. If the QR code generation fails, it returns an error containing the
*    description of the failure.
* 2. If the PNG encoding fails, it returns an error containing the
*    description of the failure.
*
* # Example
*
* ```rust
* let data = b"Hello, world!";
* match qr_png(data) {
*     Ok(png_data) => {
*         // Use the PNG data (e.g., save it to a file, send it over a network)
*     }
*     Err(err) => {
*         eprintln!("Error generating QR code PNG: {}", err);
*     }
* }
* ```
* @param {Uint8Array} data
* @returns {Uint8Array}
*/
export function qr_png(data: Uint8Array): Uint8Array;
