let ffmpegProcess: Deno.ChildProcess | null = null;
let ffmpegStdinWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
let buffer = new Uint8Array(0);

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
    const pacatProcess = new Deno.Command("pacat", {
      args: [
        "--playback",
        "--device=audiorelay-virtual-mic-sink",
        "--format=s16le",
        "--rate=48000",
        "--channels=2",
      ],
      stdin: "piped",
    }).spawn();

    const pacatWriter = pacatProcess.stdin.getWriter();

    let totalBytesWritten = 0;
    for await (const chunk of ffmpegProcess.stdout) {
      console.log(`FFmpeg stdout: Received ${chunk.byteLength} bytes`);
      totalBytesWritten += chunk.byteLength;
      await pacatWriter.write(chunk);
    }
    console.log(`Total bytes written: ${totalBytesWritten}`);

    pacatWriter.close();
  })();
}

const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Audio Streaming</title>
</head>
<body>
    <h1>Audio Streaming</h1>
    <button id="startButton">Start Streaming</button>
    <script>
        const startButton = document.getElementById('startButton');
        let mediaRecorder;
        let socket;
        let isStreaming = false;
        let headerSent = false;

        startButton.addEventListener('click', async () => {
            if (!isStreaming) {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

                socket = new WebSocket(\`ws://\${window.location.host}/ws\`);
                socket.onopen = () => {
                    console.log('WebSocket connected');
                    mediaRecorder.start(1000);
                    startButton.textContent = 'Stop Streaming';
                    isStreaming = true;
                };

                mediaRecorder.ondataavailable = async (event) => {
                    if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
                        console.log(\`Sending chunk of size: \${event.data.size} bytes\`);
                        const arrayBuffer = await event.data.arrayBuffer();
                        const uint8Array = new Uint8Array(arrayBuffer);
                        console.log(\`First 32 bytes: \${Array.from(uint8Array.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ')}\`);
                        await socket.send(event.data);
                    }
                };
            } else {
                mediaRecorder.stop();
                socket.close();
                startButton.textContent = 'Start Streaming';
                isStreaming = false;
                headerSent = false;
            }
        });
    </script>
</body>
</html>
`;

Deno.serve((request) => {
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
  } else {
    return new Response(html, {
      headers: { "content-type": "text/html" },
    });
  }
});
