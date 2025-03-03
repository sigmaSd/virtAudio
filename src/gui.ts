import * as slint from "npm:slint-ui@1.10.0";
import { decode } from "npm:@jsquash/png@3.0.1";
import { qrPng } from "jsr:@sigmasd/qrpng@0.1.3";
import { main as startServer, unloadPipeSource } from "./main.ts";

interface Mic {
  name: string;
  playing: boolean;
}
interface MainWindow {
  Global: {
    playAudio: (mic: string) => void;
    stopAudio: (mic: string) => void;
  };
  localIp: string;
  qrCode: slint.ImageData;
  mics: Mic[];
  run(): Promise<void>;
}

function getLocalIp(): string {
  return Deno.networkInterfaces()
    .find((int) => int.name !== "lo" && int.family === "IPv4")
    ?.address ?? "localhost";
}

class Player {
  #mics = new Map<string, Deno.ChildProcess>();
  constructor() {
  }
  play(mic: string) {
    const process = new Deno.Command("pacat", {
      args: ["--record", "-d", mic],
      stdout: "piped",
    }).spawn();

    const playbackProcess = new Deno.Command("pacat", {
      args: ["--playback"],
      stdin: "piped",
    }).spawn();

    // Pipe the output of record to input of playback
    process.stdout.pipeTo(playbackProcess.stdin);
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

if (import.meta.main) {
  // Setup UI
  const guiUrl = new URL("./gui.slint", import.meta.url);
  let guiSlint;
  if (guiUrl.protocol === "file:") {
    // workaround for https://github.com/denoland/deno/issues/28129
    guiSlint = await Deno.readTextFile(guiUrl);
  } else {
    guiSlint = await fetch(guiUrl).then((r) => r.text());
  }
  // deno-lint-ignore no-explicit-any
  const ui = slint.loadSource(guiSlint, "main.js") as any;
  const window = ui.MainWindow() as MainWindow;

  // Create an audio player
  const player = new Player();

  // Hook player functions
  window.Global.playAudio = (mic: string) => {
    player.play(mic);
  };

  window.Global.stopAudio = (mic) => {
    player.stop(mic);
  };

  // Start server
  const abortController = new AbortController();
  const { port: serverPort, events: serverEvents } = await startServer({
    abortController,
  });
  window.localIp = `${getLocalIp()}:${serverPort}`;

  // Generate QR code
  const address = `http://${getLocalIp()}:${serverPort}`;
  const qrCodePng = qrPng(
    new TextEncoder().encode(address),
  );
  if (!(qrCodePng.buffer instanceof ArrayBuffer)) {
    throw new Error("Expected ArrayBuffer but got SharedArrayBuffer");
  }
  const rgba = await decode(qrCodePng.buffer);
  window.qrCode = {
    width: rgba.width,
    height: rgba.height,
    data: new Uint8Array(rgba.data),
  };

  // Hook server events (mic additions and deletions)
  serverEvents.addEventListener("micAdded", (event: Event) => {
    const mic = (event as CustomEvent<string>).detail;
    window.mics = [...window.mics, { name: mic, playing: false }];
  });
  serverEvents.addEventListener("micRemoved", (event: Event) => {
    const mic = (event as CustomEvent<string>).detail;
    window.Global.stopAudio(mic);
    window.mics = [...window.mics].filter((m) => m.name !== mic);
  });

  // Start the GUI
  await window.run();

  // Cleanup at exit
  abortController?.abort();
  player.stopAll();
  await unloadPipeSource();
  // There could be still some ffmpeg instances running, this is the easiest way to ensure they are stopped
  Deno.exit(0);
}
