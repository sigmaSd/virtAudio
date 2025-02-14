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

        let ffmpeg: FFmpeg | null = new FFmpeg();
        const virtualMic = new VirtualMic();

        try {
          const result = await virtualMic.start();
          if (result.isErr()) {
            return new Response(`Failed to start virtual mic: ${result}`, {
              status: 500,
            });
          }

          // Pipe ffmpeg to virtual mic
          const readable = ffmpeg.readable.getReader();
          (async () => {
            try {
              if (!ffmpeg) return;
              // for await (const chunk of ffmpeg.readable) {
              while (true) {
                const chunk = await readable.read();
                await new Promise((resolve) => setTimeout(resolve, 100));
                console.log("FFmpeg chunk received", Date.now());
                await virtualMic.write(chunk.value!);
                console.log("Virtual mic chunk received", Date.now());
              }
            } catch (error) {
              console.error("Error in audio pipeline:", error);
            }
          })();

          socket.onmessage = async (event) => {
            if (event.data instanceof ArrayBuffer && ffmpeg) {
              try {
                const chunk = new Uint8Array(event.data);
                const now = Date.now();
                console.log("Before write", now);
                await ffmpeg.write(chunk);
                console.log("after write", Date.now());
              } catch (error) {
                console.error("Error processing audio chunk:", error);
                socket.close();
              }
            }
          };

          socket.onclose = async () => {
            console.log("WebSocket connection closed");
            await ffmpeg?.close();
            await virtualMic.unload();
            ffmpeg = null;
          };

          socket.onerror = (error) => {
            console.error("WebSocket error:", error);
          };
        } catch (error) {
          console.error("Setup error:", error);
          socket.close();
        }

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
