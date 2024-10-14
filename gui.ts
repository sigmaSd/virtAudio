// gui.ts
import * as slint from "npm:slint-ui@1.8.0";

interface MainWindow {
  set_virtual_mics: (mics: string[]) => void;
  set_selected_mic: (mic: string) => void;
  Logic: {
    createVirtualMic: (name: string) => void;
    startServer: (mic: string) => void;
    stopServer: () => void;
    playAudio: (mic: string) => void;
    stopAudio: () => void;
    getRandomNumber: () => number;
  };
}

// deno-lint-ignore no-explicit-any
const ui = slint.loadFile("gui.slint") as any;
const window = ui.MainWindow();
const port = Number.parseInt(Deno.env.get("PORT") || "8000");

let pi: Deno.ChildProcess | null = null;
let po: Deno.ChildProcess | null = null;

// Function to start the server
function startServer(virtualMic: string) {
  new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-all", "main.ts", virtualMic],
  }).spawn();
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
    const reader = pi.stdout.getReader();
    const writer = po.stdin.getWriter();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      console.log("writing chunk ", chunk.value.length);
      await writer.write(chunk.value);
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

window.Logic.startServer = (mic: string) => {
  startServer(mic);
};

window.Logic.stopServer = () => {
  stopServer();
};

window.Logic.playAudio = () => {
  playAudio();
};

window.Logic.stopAudio = () => {
  stopAudio();
};

window.Logic.getRandomNumber = () => Math.floor(Math.random() * 1000);

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
