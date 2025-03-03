/**
 * Patches the global fetch function to support file:// URLs in Deno
 * compiled executables. This works around issue denoland/deno#28129 where compiled
 * executables can't fetch embedded files.
 *
 * @example
 * ```ts
 * import { patchFetch } from "./mod.ts";
 *
 * // Apply the patch before using fetch with file:// URLs
 * patchFetch();
 *
 * // Now file:// URLs will work in both regular and compiled Deno
 * const content = await fetch(new URL("./data.txt", import.meta.url))
 *   .then(res => res.text());
 *
 * @module
 */

import { extname } from "jsr:@std/path@1.0.8/extname";
import { isStandaloneDenoExe } from "../utils.ts";

/**
 * Patches the global fetch function to support file:// URLs in Deno
 * compiled executables. This works around issue denoland/deno#28129 where compiled
 * executables can't fetch embedded files.
 *
 * @example
 * ```ts
 * import "jsr:@sigma/deno-compile-extra/fetchPatch";
 *
 * // Now file:// URLs will work in both regular and compiled Deno
 * const content = await fetch(new URL("./data.txt", import.meta.url))
 *   .then(res => res.text());
 */
export function patchFetch() {
  if (!isStandaloneDenoExe()) {
    return;
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function (input, init) {
    const url = input instanceof Request
      ? input.url
      : (input instanceof URL ? input.toString() : String(input));

    // Check if the URL is a file URL
    if (url.startsWith("file://")) {
      try {
        // Guess content type based on file extension
        // This is important for some file types like .wasm which does some optimizations based on it
        let contentType;
        if (extname(url) === ".wasm") {
          contentType = "application/wasm";
        }

        const filePath = new URL(url);
        const file = await Deno.open(filePath, { read: true });

        const headers = new Headers(init?.headers);
        if (contentType) {
          headers.set("Content-Type", contentType);
        }
        return new Response(file.readable, {
          status: 200,
          headers,
        });
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          return new Response("File not found", { status: 404 });
        } else if (error instanceof Deno.errors.PermissionDenied) {
          return new Response("Permission denied", { status: 403 });
        } else {
          console.error("Error reading file:", error);
          return new Response("Internal server error", { status: 500 });
        }
      }
    }

    // Use original fetch for all other URLs
    return originalFetch(input, init);
  };
}

// run the patch
patchFetch();
