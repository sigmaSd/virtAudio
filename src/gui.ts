import * as slint from "npm:slint-ui@1.8.0";
import { $, CommandChild } from "jsr:@david/dax@0.42.0";

interface Mic {
  name: string;
  playing: boolean;
}
interface MainWindow {
  Global: {
    startServer: () => void;
    stopServer: () => void;
    playAudio: (mic: string) => void;
    stopAudio: (mic: string) => void;
  };
  localIp: string;
  mics: Mic[];
  run(): Promise<void>;
}

class Server extends EventTarget {
  #process: Deno.ChildProcess;
  static port = Number.parseInt(Deno.env.get("PORT") || "8000");
  constructor() {
    super();
    const process = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", import.meta.resolve("./main.ts")],
      stdout: "piped",
    }).spawn();
    this.#process = process;

    // Monitor server output for client connections
    const decoder = new TextDecoder();
    (async () => {
      if (process && process.stdout) {
        for await (const chunk of process.stdout) {
          const output = decoder.decode(chunk);
          if (output.includes("VMAC")) {
            const mic = output.split(":")[1].trim();
            if (output.includes("created")) {
              this.dispatchEvent(
                new CustomEvent("micAdded", { detail: mic }),
              );
            } else if (output.includes("unloaded")) {
              this.dispatchEvent(
                new CustomEvent("micRemoved", { detail: mic }),
              );
            }
          }
        }
      }
    })();
  }
  async stop() {
    await fetch(`http://localhost:${Server.port}/stop`).then(() => {
      console.log("Server stopped");
    }).catch((err) => {
      console.error("Failed to stop server:", err);
    });
  }
}

class Player {
  #mics = new Map<string, CommandChild>();
  constructor() {
  }
  play(mic: string) {
    const process = $`pacat --record -d ${mic} | pacat --playback`.spawn();
    this.#mics.set(mic, process);
  }
  stop(mic: string) {
    this.#mics.get(mic)?.kill();
    this.#mics.delete(mic);
  }
  stopAll() {
    this.#mics.forEach((process, mic) => {
      process.kill();
      this.#mics.delete(mic);
    });
  }
}

function getLocalIp(): string {
  return Deno.networkInterfaces().find((int) =>
    int.name !== "lo" && int.family === "IPv4"
  )?.address ?? "localhost";
}

if (import.meta.main) {
  // https://github.com/slint-ui/slint/issues/5780
  Deno.env.set("WAYLAND_DISPLAY", "");
  const guiSlint = await fetch(import.meta.resolve("./gui.slint"))
    .then((r) => r.text());
  // deno-lint-ignore no-explicit-any
  const ui = slint.loadSource(guiSlint, "main.js") as any;
  const window = ui.MainWindow() as MainWindow;

  let server: Server | null = null;
  const player = new Player();

  window.Global.startServer = () => {
    server = new Server();
    server.addEventListener("micAdded", (event: Event) => {
      const mic = (event as CustomEvent<string>).detail;
      window.mics = [...window.mics, { name: mic, playing: false }];
    });
    server.addEventListener("micRemoved", (event: Event) => {
      const mic = (event as CustomEvent<string>).detail;
      window.Global.stopAudio(mic);
      window.mics = [...window.mics].filter((m) => m.name !== mic);
    });
  };

  window.Global.stopServer = async () => {
    await server?.stop();
    server = null;
  };

  window.Global.playAudio = (mic: string) => {
    player.play(mic);
  };

  window.Global.stopAudio = (mic) => {
    player.stop(mic);
  };

  window.localIp = `${getLocalIp()}:${Server.port}`;

  await window.run();
  (server as Server | null)?.stop();
  player.stopAll();
}
