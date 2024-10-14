// gui.ts
import * as slint from "npm:slint-ui@1.8.0";

interface MainWindow {
  set_virtual_mics: (mics: string[]) => void;
  set_selected_mic: (mic: string) => void;
  Logic: {
    createVirtualMic: (name: string) => void;
    startServer: (mic: string) => void;
    playAudio: (mic: string) => void;
    getRandomNumber: () => number;
  };
}

// deno-lint-ignore no-explicit-any
const ui = slint.loadFile("gui.slint") as any;
const window = ui.MainWindow();
const port = Number.parseInt(Deno.env.get("PORT") || "8000");

// Function to create a new virtual mic
async function createVirtualMic(name: string): Promise<void> {
  await new Deno.Command("pactl", {
    args: [
      "load-module",
      "module-null-sink",
      `sink_name=${name}`,
      "sink_properties=device.description=Virtual-Mic-Sink",
    ],
  }).spawn().status;
  await new Deno.Command("pactl", {
    args: [
      "load-module",
      "module-remap-source",
      `master=${name}.monitor`,
      `source_name=${name}`,
      "source_properties=device.description=Virtual-Mic",
    ],
  }).spawn().status;
}

// Function to get available virtual mics
async function getVirtualMics(): Promise<string[]> {
  const command = new Deno.Command("pactl", {
    args: ["list", "short", "sources"],
  });
  const output = await command.output();
  const sources = new TextDecoder().decode(output.stdout).split("\n");
  return sources
    .filter((source) => source.includes("virtual"))
    .filter((source) => !source.includes("monitor"))
    .map((source) => source.split("\t")[1]);
}

// Function to start the server
function startServer(virtualMic: string) {
  new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-all", "main.ts", virtualMic],
  }).spawn();
}

// Function to play audio from virtual mic
function playAudio(virtualMic: string) {
  new Deno.Command("sh", {
    args: ["-c", `pacat --record -d ${virtualMic}.monitor | pacat --playback`],
  }).spawn();
}

async function updateVirtualMics() {
  const mics = await getVirtualMics();
  window.virtual_mics = mics;
  if (mics[0]) {
    window.selected_mic = mics[0];
  }
}

window.Logic.createVirtualMic = async (name: string) => {
  await createVirtualMic(name);
  await updateVirtualMics();
};

window.Logic.startServer = (mic: string) => {
  startServer(mic);
};

window.Logic.playAudio = (mic: string) => {
  playAudio(mic);
};

window.Logic.getRandomNumber = () => Math.floor(Math.random() * 1000);

window.localIp = `${getLocalIp()}:${port}`;

// Initial update of virtual mics
updateVirtualMics();

await window.run();
if (window.is_server_running) {
  await fetch(`http://localhost:${port}/stop`);
}

function getLocalIp(): string {
  return Deno.networkInterfaces().find((int) =>
    int.name !== "lo" && int.family === "IPv4"
  )?.address ?? "localhost";
}
