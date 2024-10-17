import * as slint from "npm:slint-ui@1.8.0";

interface MainWindow {
  Global: {
    startServer: () => void;
    stopServer: () => void;
    playAudio: () => void;
    stopAudio: () => void;
  };
  is_server_running: boolean;
  is_audio_playing: boolean;
  is_client_connected: boolean;
  localIp: string;
  run(): Promise<void>;
}

// https://github.com/slint-ui/slint/issues/5780
Deno.env.set("WAYLAND_DISPLAY", "");
const guiSlint = await fetch(import.meta.resolve("./gui.slint"))
  .then((r) => r.text());
// deno-lint-ignore no-explicit-any
const ui = slint.loadSource(guiSlint, "main.js") as any;
const window = ui.MainWindow() as MainWindow;
const port = Number.parseInt(Deno.env.get("PORT") || "8000");

let pi: Deno.ChildProcess | null = null;
let po: Deno.ChildProcess | null = null;
let serverProcess: Deno.ChildProcess | null = null;

// Function to start the server
function startServer() {
  serverProcess = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-all", import.meta.resolve("./main.ts")],
    stdout: "piped",
  }).spawn();

  // Monitor server output for client connections
  const decoder = new TextDecoder();
  (async () => {
    if (serverProcess && serverProcess.stdout) {
      for await (const chunk of serverProcess.stdout) {
        const output = decoder.decode(chunk);
        if (output.includes("WebSocket connection opened")) {
          window.is_client_connected = true;
        } else if (output.includes("WebSocket connection closed")) {
          window.is_client_connected = false;
          stopAudio();
        }
      }
    }
  })();
}

// Function to stop the server
function stopServer() {
  fetch(`http://localhost:${port}/stop`).then(() => {
    console.log("Server stopped");
    stopAudio();
  }).catch((err) => {
    console.error("Failed to stop server:", err);
  });
}

// Function to play audio from virtual mic
async function playAudio() {
  pi = new Deno.Command("pacat", {
    args: ["--record", "-d", `VirtualMic`],
    stdout: "piped",
  }).spawn();
  po = new Deno.Command("pacat", {
    args: ["--playback"],
    stdin: "piped",
  }).spawn();

  if (pi.stdout && po.stdin) {
    const writer = po.stdin.getWriter();
    for await (const chunk of pi.stdout) {
      await writer.write(chunk);
    }
  }
}

// Function to stop audio playback
function stopAudio() {
  pi?.kill();
  po?.kill();
  pi = null;
  po = null;
  window.is_audio_playing = false;
}

window.Global.startServer = () => {
  startServer();
};

window.Global.stopServer = () => {
  stopServer();
};

window.Global.playAudio = () => {
  playAudio();
};

window.Global.stopAudio = () => {
  stopAudio();
};

window.localIp = `${getLocalIp()}:${port}`;

await window.run();
if (window.is_server_running) {
  await fetch(`http://localhost:${port}/stop`);
}
stopAudio();

function getLocalIp(): string {
  return Deno.networkInterfaces().find((int) =>
    int.name !== "lo" && int.family === "IPv4"
  )?.address ?? "localhost";
}
