// https://github.com/justjavac/deno_dirs/blob/main/cache_dir/mod.ts
export function cacheDir(): string | null {
  switch (Deno.build.os) {
    case "linux": {
      const xdg = Deno.env.get("XDG_CACHE_HOME");
      if (xdg) return xdg;

      const home = Deno.env.get("HOME");
      if (home) return `${home}/.cache`;
      break;
    }

    case "darwin": {
      const home = Deno.env.get("HOME");
      if (home) return `${home}/Library/Caches`;
      break;
    }

    case "windows": {
      const localAppData = Deno.env.get("LOCALAPPDATA");
      if (localAppData) return localAppData;

      // Fallback for older Windows versions
      const appData = Deno.env.get("APPDATA");
      if (appData) return appData;
      break;
    }
  }

  return null;
}

/**
 * Determines whether the current Deno process is running as a standalone executable.
 *
 * This function uses heuristics to try to guess if the code is running in a compiled
 * standalone executable rather than the standard Deno runtime:
 * 1. Checks if the main module path includes "deno-compile"
 * 2. Tests if accessing localStorage results in an error (which happens in compiled executables)
 *
 * @example
 *
 * if (isStandaloneDenoExe()) {
 *   console.log("Running as a standalone executable");
 * } else {
 *   console.log("Running in normal Deno runtime");
 * }
 */
export function isStandaloneDenoExe(): boolean {
  // heuristics
  return (
    Deno.mainModule.includes("deno-compile") &&
    // accessing localStorage in the compiled binary result in an error
    try_(() => localStorage.length).isErr()
  );
}

function try_<T>(fn: () => T) {
  try {
    const ok = fn();
    return { isErr: () => false, ok };
  } catch (error) {
    return { isErr: () => true, err: error };
  }
}
