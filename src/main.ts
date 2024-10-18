import assert from "node:assert";
import { Err, Ok } from "jsr:@sigmasd/rust-types@0.6.1/result";

async function unloadPipeSource() {
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
  #writer?: Deno.FsFile;
  static #idCounter: number = 0;
  #id: number;
  #micIndex?: number;

  constructor() {
    this.#id = ++VirtualMic.#idCounter;
  }

  async start() {
    const virtualMicPipePath = "/tmp/virtual_mic_pipe" + this.#id;

    // Create the named pipe if it doesn't exist
    try {
      await Deno.stat(virtualMicPipePath);
    } catch {
      new Deno.Command("mkfifo", { args: [virtualMicPipePath] })
        .spawn();
    }
    // wait a bit for mkfifo
    await new Promise((r) => setTimeout(r, 100));
    this.#writer = await Deno.open(virtualMicPipePath, {
      read: true,
      write: true,
    });

    const micName = `VirtualMic${this.#id}`;
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
      return Ok(0);
    } else {
      return Err("Failed to load module-pipe-source");
    }
  }

  async write(data: Uint8Array) {
    return await this.#writer?.write(data);
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
        "-v",
        "warning",
        "pipe:1",
      ],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();

    this.#process = process;
    this.readable = this.#process.stdout;
    this.#writer = this.#process.stdin.getWriter();

    // Handle FFmpeg stderr
    (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of process.stderr) {
        console.error("FFmpeg stderr:", decoder.decode(chunk));
      }
    })();
  }

  async write(data: Uint8Array) {
    return await this.#writer?.write(data);
  }

  async close() {
    await this.#writer.close();
    try {
      this.#process?.kill("SIGTERM");
    } catch {
      /*   */
    }
  }
}

function concatUint8Arrays(a: Uint8Array, b: Uint8Array): Uint8Array {
  const c = new Uint8Array(a.length + b.length);
  c.set(a, 0);
  c.set(b, a.length);
  return c;
}

function findWebMHeader(data: Uint8Array): number {
  const WEBM_HEADER_ID = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
  for (let i = 0; i < data.length - WEBM_HEADER_ID.length; i++) {
    if (
      data.slice(i, i + WEBM_HEADER_ID.length).every((v, j) =>
        v === WEBM_HEADER_ID[j]
      )
    ) {
      return i;
    }
  }
  return -1;
}

if (import.meta.main) {
  const port = Number.parseInt(Deno.env.get("PORT") || "8000");
  Deno.serve(
    {
      port: port,
      onListen: () => console.log(`Listening on http://localhost:${port}/`),
    },
    async (request) => {
      if (request.url.endsWith("/ws")) {
        const { socket, response } = Deno.upgradeWebSocket(request);
        console.log("WebSocket connection opened");

        let buffer = new Uint8Array(0);
        let ffmpeg: FFmpeg | null = null;
        const virtualMic = new VirtualMic();
        {
          const result = await virtualMic.start();
          if (result.isErr()) {
            return new Response(`Failed to start virtual mic: ${result}`, {
              status: 500,
            });
          }
        }

        socket.onmessage = async (event) => {
          if (event.data instanceof ArrayBuffer) {
            const chunk = new Uint8Array(event.data);
            buffer = concatUint8Arrays(buffer, chunk);

            if (!ffmpeg) {
              // wait for WebM Header then start ffmpeg
              const headerIndex = findWebMHeader(buffer);
              if (headerIndex !== -1) {
                console.log(`WebM header found at index ${headerIndex}`);
                console.log("Starting FFmpeg process");
                ffmpeg = new FFmpeg();
                // pipe ffmpeg to the virtual mic
                (async () => {
                  assert(ffmpeg);
                  for await (const chunk of ffmpeg.readable) {
                    await virtualMic.write(chunk);
                  }
                })();
              }
            } else {
              // pipe audio data to ffmpeg
              await ffmpeg.write(buffer);
              buffer = new Uint8Array(0);
            }
          }
        };

        socket.onclose = async () => {
          console.log("WebSocket connection closed");
          if (buffer.length > 0 && ffmpeg) {
            await ffmpeg.write(buffer);
          }
          await ffmpeg?.close();
          await virtualMic.unload();
        };

        socket.onerror = (error) => {
          console.error("WebSocket error:", error);
        };

        return response;
      } else if (request.url.endsWith("/stop")) {
        // stop the server and exit
        await unloadPipeSource();
        setTimeout(() => Deno.exit(0), 100);
        return new Response("Server is shutting down");
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
}
