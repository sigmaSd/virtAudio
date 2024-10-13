import { qrcode } from "https://deno.land/x/qrcode@v2.0.0/mod.ts";

const senderClients = new Set<WebSocket>();
const receiverClients = new Set<WebSocket>();

const handler = async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname === "/") {
    // Serve the main page with two QR codes
    const senderQRCode = await qrcode(`${url.origin}/sender`);
    const receiverQRCode = await qrcode(`${url.origin}/receiver`);
    const html = `
      <html>
        <body>
          <h1>Audio Streaming System</h1>
          <div>
            <h2>Sender QR Code</h2>
            <pre><img src=${senderQRCode} /></pre>
            <p>Or open this URL on the sender device: <a href="${url.origin}/sender">${url.origin}/sender</a></p>
          </div>
          <div>
            <h2>Receiver QR Code</h2>
            <pre><img src=${receiverQRCode} /></pre>
            <p>Or open this URL on the receiver device: <a href="${url.origin}/receiver">${url.origin}/receiver</a></p>
          </div>
        </body>
      </html>
    `;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }

  if (url.pathname === "/sender") {
    // Serve the sender page
    const html = `
      <html>
        <body>
          <h1>Audio Sender</h1>
          <button id="startBtn">Start Streaming</button>
          <div id="status"></div>
          <script>
            const startBtn = document.getElementById('startBtn');
            const statusDiv = document.getElementById('status');
            let ws;

            startBtn.onclick = async () => {
              try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                ws = new WebSocket('wss://' + location.host + '/ws-sender');

                ws.onopen = () => {
                  console.log('WebSocket connected');
                  statusDiv.textContent = 'Connected, streaming audio...';
                  const audioContext = new AudioContext();
                  const source = audioContext.createMediaStreamSource(stream);
                  const processor = audioContext.createScriptProcessor(1024, 1, 1);

                  source.connect(processor);
                  processor.connect(audioContext.destination);

                  processor.onaudioprocess = (e) => {
                    if (ws.readyState === WebSocket.OPEN) {
                      const audioData = e.inputBuffer.getChannelData(0);
                      ws.send(audioData.buffer);
                    }
                  };
                };

                ws.onclose = () => {
                  console.log('WebSocket disconnected');
                  statusDiv.textContent = 'Disconnected';
                };
                ws.onerror = error => {
                  console.error('WebSocket error:', error);
                  statusDiv.textContent = 'Error: ' + error;
                };
              } catch (error) {
                console.error('Error:', error);
                statusDiv.textContent = 'Failed to start streaming: ' + error.message;
              }
            };
          </script>
        </body>
      </html>
    `;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }

  if (url.pathname === "/receiver") {
    // Serve the receiver page
    const html = `
      <html>
        <body>
          <h1>Audio Receiver</h1>
          <button id="startBtn">Start Receiving</button>
          <div id="status"></div>
          <script>
            const startBtn = document.getElementById('startBtn');
            const statusDiv = document.getElementById('status');
            let ws;
            let audioContext;
            let scriptNode;

            startBtn.onclick = () => {
              audioContext = new (window.AudioContext || window.webkitAudioContext)();
              scriptNode = audioContext.createScriptProcessor(1024, 1, 1);
              scriptNode.connect(audioContext.destination);

              ws = new WebSocket('wss://' + location.host + '/ws-receiver');

              ws.onopen = () => {
                console.log('WebSocket connected');
                statusDiv.textContent = 'Connected, waiting for audio...';
              };
              ws.onclose = () => {
                console.log('WebSocket disconnected');
                statusDiv.textContent = 'Disconnected';
              };
              ws.onerror = error => {
                console.error('WebSocket error:', error);
                statusDiv.textContent = 'Error: ' + error;
              };

              ws.onmessage = async (event) => {
                try {
                  const arrayBuffer = await event.data.arrayBuffer();
                  const floatArray = new Float32Array(arrayBuffer);

                  if (floatArray.length === 0) {
                    console.warn('Received empty audio data');
                    return;
                  }

                  const buffer = audioContext.createBuffer(1, floatArray.length, audioContext.sampleRate);
                  buffer.getChannelData(0).set(floatArray);

                  const source = audioContext.createBufferSource();
                  source.buffer = buffer;
                  source.connect(audioContext.destination);
                  source.start();

                  statusDiv.textContent = 'Playing audio...';
                } catch (error) {
                  console.error('Error processing audio data:', error);
                  statusDiv.textContent = 'Error processing audio: ' + error.message;
                }
              };
            };
          </script>
        </body>
      </html>
    `;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }

  if (url.pathname === "/ws-sender") {
    if (req.headers.get("upgrade") != "websocket") {
      return new Response(null, { status: 501 });
    }
    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.onopen = () => {
      senderClients.add(socket);
      console.log("Sender client connected");
    };

    socket.onmessage = (event) => {
      // Forward the audio data to all receiver clients
      for (const receiver of receiverClients) {
        if (receiver.readyState === WebSocket.OPEN) {
          receiver.send(event.data);
        }
      }
    };

    socket.onclose = () => {
      senderClients.delete(socket);
      console.log("Sender client disconnected");
    };

    return response;
  }

  if (url.pathname === "/ws-receiver") {
    if (req.headers.get("upgrade") != "websocket") {
      return new Response(null, { status: 501 });
    }
    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.onopen = () => {
      receiverClients.add(socket);
      console.log("Receiver client connected");
    };

    socket.onclose = () => {
      receiverClients.delete(socket);
      console.log("Receiver client disconnected");
    };

    return response;
  }

  return new Response("Not Found", { status: 404 });
};

Deno.serve(handler);
