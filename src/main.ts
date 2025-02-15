import assert from "node:assert";

export async function unloadPipeSource() {
  await new Deno.Command("pactl", {
    args: ["unload-module", "module-pipe-source"],
    stderr: "null",
  }).spawn().status;
}

Deno.addSignalListener("SIGINT", async () => {
  await unloadPipeSource();
  Deno.exit(0);
});

class VirtualMic {
  writeable?: WritableStream<Uint8Array>;
  static #idCounter: number = 0;
  #id: number;
  #micIndex?: number;
  name?: string;

  constructor() {
    this.#id = ++VirtualMic.#idCounter;
  }

  async start() {
    const virtualMicPipePath = "/tmp/virtual_mic_pipe" + this.#id;

    // Create the named pipe if it doesn't exist
    try {
      await Deno.stat(virtualMicPipePath);
    } catch {
      await new Deno.Command("mkfifo", { args: [virtualMicPipePath] })
        .spawn().status;
    }
    this.writeable = await Deno.open(virtualMicPipePath, {
      read: true,
      write: true,
    }).then((process) => process.writable);

    const micName = `VirtualMic${this.#id}`;
    this.name = micName;
    // Load the module-pipe-source
    const result = await new Deno.Command("pactl", {
      args: [
        "load-module",
        "module-pipe-source",
        `source_name=${micName}`,
        `file=${virtualMicPipePath}`,
        "format=s16le",
        "rate=48000",
        "channels=2",
      ],
    }).output();
    if (result.success) {
      console.log(`VMAC created: ${micName}`);
      this.#micIndex = Number.parseInt(
        new TextDecoder().decode(result.stdout).trim(),
      );
      return micName;
    } else {
      throw new Error("Failed to load module-pipe-source");
    }
  }

  async unload() {
    console.log(`VMAC unloaded: VirtualMic${this.#id}`);
    if (!this.#micIndex) return;
    return await new Deno.Command("pactl", {
      args: ["unload-module", this.#micIndex.toString()],
    }).spawn().status;
  }
}

class FFmpeg {
  #process: Deno.ChildProcess;
  readonly readable: ReadableStream<Uint8Array>;
  #writer: WritableStreamDefaultWriter<Uint8Array>;

  constructor() {
    console.log("Starting FFmpeg process");
    const process = new Deno.Command("ffmpeg", {
      args: [
        "-f",
        "webm",
        "-i",
        "pipe:0",
        "-acodec",
        "pcm_s16le",
        "-f",
        "wav",
        "-ac",
        "2",
        "-ar",
        "48000",
        "pipe:1",
      ],
      stdin: "piped",
      stdout: "piped",
      stderr: "null",
    }).spawn();

    this.#process = process;
    this.readable = this.#process.stdout;
    this.#writer = this.#process.stdin.getWriter();
  }

  async write(data: Uint8Array) {
    try {
      return await this.#writer?.write(data);
    } catch (error) {
      console.error("FFmpeg write error:", error);
      await this.close();
      throw error;
    }
  }

  async close() {
    try {
      await this.#writer.close();
      this.#process?.kill("SIGTERM");
    } catch (error) {
      console.error("Error closing FFmpeg:", error);
    }
  }
}

export class Events extends EventTarget {}

export function main(
  { abortController }: { abortController?: AbortController } = {},
): Promise<{ port: number; events: Events }> {
  const events = new Events();
  return new Promise((resolve) => {
    Deno.serve(
      {
        // port: 0,
        // Hardcode the port so the clients have an easier time whitelisting the http connection
        port: 8383,
        onListen: ({ port }) => {
          console.log(`Listening on http://localhost:${port}/`);
          resolve({ port, events });
        },
        signal: abortController?.signal,
      },
      async (request) => {
        if (request.url.endsWith("/ws")) {
          const { socket, response } = Deno.upgradeWebSocket(request);
          console.log("WebSocket connection opened");

          let ffmpeg: FFmpeg | null = new FFmpeg();
          const virtualMic = new VirtualMic();

          await virtualMic.start();
          events.dispatchEvent(
            new CustomEvent("micAdded", {
              detail: virtualMic.name ?? "unknown",
            }),
          );

          assert(ffmpeg);
          assert(virtualMic.writeable);
          ffmpeg.readable.pipeTo(virtualMic.writeable);

          socket.onmessage = async (event) => {
            if (event.data instanceof ArrayBuffer && ffmpeg) {
              const chunk = new Uint8Array(event.data);
              await ffmpeg.write(chunk);
            }
          };

          socket.onclose = async () => {
            console.log("WebSocket connection closed");
            await ffmpeg?.close();
            await virtualMic.unload();
            events.dispatchEvent(
              new CustomEvent("micRemoved", {
                detail: virtualMic.name ?? "unknown",
              }),
            );
            ffmpeg = null;
          };

          socket.onerror = (error) => {
            console.error("WebSocket error:", error);
          };

          return response;
        } else {
          return new Response(
            await fetch(import.meta.resolve("./client.html"))
              .then((res) => res.text()),
            {
              headers: { "content-type": "text/html" },
            },
          );
        }
      },
    );
  });
}

if (import.meta.main) {
  await main();
}
