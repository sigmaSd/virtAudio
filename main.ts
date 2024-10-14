let ffmpegProcess: Deno.ChildProcess | null = null;
let ffmpegStdinWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
let buffer = new Uint8Array(0);
const port = Number.parseInt(Deno.env.get("PORT") || "8000");

Deno.addSignalListener("SIGINT", () => {
  new Deno.Command("pactl", {
    args: ["unload-module", "module-pipe-source"],
    stderr: "null",
  }).spawn();
  Deno.exit(0);
});

function concatUint8Arrays(a: Uint8Array, b: Uint8Array): Uint8Array {
  const c = new Uint8Array(a.length + b.length);
  c.set(a, 0);
  c.set(b, a.length);
  return c;
}

const WEBM_HEADER_ID = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);

function findWebMHeader(data: Uint8Array): number {
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

function startFFmpegProcess() {
  console.log("Starting FFmpeg process");
  ffmpegProcess = new Deno.Command("ffmpeg", {
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
      "debug",
      "pipe:1",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  ffmpegStdinWriter = ffmpegProcess.stdin.getWriter();

  // Handle FFmpeg stderr
  (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of ffmpegProcess.stderr) {
      console.error("FFmpeg stderr:", decoder.decode(chunk));
    }
  })();

  // Handle FFmpeg stdout and pipe to virtual mic using pacat
  (async () => {
    const virtualMicPipe = "/tmp/virtual_mic_pipe";

    // Create the named pipe if it doesn't exist
    try {
      await Deno.stat(virtualMicPipe);
    } catch {
      await new Deno.Command("mkfifo", { args: [virtualMicPipe] }).spawn()
        .status;
    }

    // Load the module-pipe-source
    const paProcess = new Deno.Command("pactl", {
      args: [
        "load-module",
        "module-pipe-source",
        `source_name=VirtualMic`,
        `file=${virtualMicPipe}`,
        "format=s16le",
        "rate=48000",
        "channels=2",
      ],
    }).spawn();

    // Wait for the module to load
    await paProcess.status;

    // Open the pipe for writing
    const pipeWriter = await Deno.open(virtualMicPipe, { write: true });

    // Write FFmpeg output to the pipe
    let totalBytesWritten = 0;
    for await (const chunk of ffmpegProcess.stdout) {
      console.log(`FFmpeg stdout: Received ${chunk.byteLength} bytes`);
      totalBytesWritten += chunk.byteLength;
      try {
        await pipeWriter.write(chunk);
      } catch { /*   */ }
    }
    console.log(`Total bytes written to virtual mic: ${totalBytesWritten}`);

    // Clean up
    pipeWriter.close();
    await new Deno.Command("pactl", {
      args: ["unload-module", "module-pipe-source"],
    }).spawn()
      .status;
    await Deno.remove(virtualMicPipe);
  })();
}

const html = Deno.readTextFileSync("client.html");

Deno.serve({ port: port }, async (request) => {
  if (request.url.endsWith("/ws")) {
    const { socket, response } = Deno.upgradeWebSocket(request);
    console.log("WebSocket connection opened");

    socket.onmessage = async (event) => {
      if (event.data instanceof ArrayBuffer) {
        const chunk = new Uint8Array(event.data);
        console.log(`Received chunk of size: ${chunk.length} bytes`);
        console.log(
          `First 32 bytes: ${
            Array.from(chunk.slice(0, 32)).map((b) =>
              b.toString(16).padStart(2, "0")
            ).join(" ")
          }`,
        );

        buffer = concatUint8Arrays(buffer, chunk);

        if (!ffmpegProcess) {
          const headerIndex = findWebMHeader(buffer);
          if (headerIndex !== -1) {
            console.log(`WebM header found at index ${headerIndex}`);
            startFFmpegProcess();
          }
        }

        if (ffmpegStdinWriter) {
          await ffmpegStdinWriter.write(buffer);
          buffer = new Uint8Array(0);
        }
      }
    };

    socket.onclose = async () => {
      console.log("WebSocket connection closed");
      if (buffer.length > 0 && ffmpegStdinWriter) {
        await ffmpegStdinWriter.write(buffer);
      }
      ffmpegStdinWriter?.close();
      try {
        ffmpegProcess?.kill("SIGTERM");
      } catch {
        /*   */
      }
      ffmpegProcess = null;
      ffmpegStdinWriter = null;
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return response;
  } else if (request.url.endsWith("/stop")) {
    // stop the server and exit
    await new Deno.Command("pactl", {
      args: ["unload-module", "module-pipe-source"],
      stderr: "null",
    }).spawn().status;
    setTimeout(() => Deno.exit(0), 100);
    return new Response();
  } else {
    return new Response(html, {
      headers: { "content-type": "text/html" },
    });
  }
});
