import { qrcode } from "https://deno.land/x/qrcode@v2.0.0/mod.ts";

const senderClients = new Set<WebSocket>();
const receiverClients = new Set<WebSocket>();

const handler = async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname === "/") {
    // Get the public IP address
    const publicIP = await fetch("https://api.ipify.org").then((res) =>
      res.text()
    );
    console.log(`Public IP address: ${publicIP}`);

    // Serve the main page with two QR codes
    const senderQRCode = await qrcode(`http://${publicIP}/sender`);
    const receiverQRCode = await qrcode(`http://${publicIP}/receiver`);
    const html = `
      <html>
        <body>
          <h1>Audio Streaming System</h1>
          <div>
            <h2>Sender QR Code</h2>
            <pre><img src=${senderQRCode} /></pre>
            <p>Or open this URL on the sender device: http://${publicIP}/sender</p>
div>
          <div>
            <h2>Receiver QR Code</h2>
            <pre><img src=${receiverQRCode} /></pre>
            <p>Or open this URL on the receiver device: http://${publicIP}/receiver</p>
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
          <script>
            const startBtn = document.getElementById('startBtn');
            let ws;

            startBtn.onclick = () => {
              ws = new WebSocket('ws://' + location.host + '/ws-sender');

              ws.onopen = () => {
                console.log('WebSocket connected');

                try {
                  navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => {
                      const mediaRecorder = new MediaRecorder(stream);
                      mediaRecorder.ondataavailable = event => {
                        if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                          ws.send(event.data);
                        }
                      };
                      mediaRecorder.start(100);
                    })
                    .catch(alert);
                } catch(e) { alert(e); }
              };

              ws.onclose = () => console.log('WebSocket disconnected');
              ws.onerror = error => console.error('WebSocket error:', error);
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
          <audio id="audioPlayer" controls></audio>
          <script>
            const audioPlayer = document.getElementById('audioPlayer');
            const ws = new WebSocket('ws://' + location.host + '/ws-receiver');

            ws.onopen = () => console.log('WebSocket connected');
            ws.onclose = () => console.log('WebSocket disconnected');
            ws.onerror = error => console.error('WebSocket error:', error);

            ws.onmessage = (event) => {
              const audioBlob = event.data;
              const audioUrl = URL.createObjectURL(audioBlob);
              audioPlayer.src = audioUrl;
              audioPlayer.play().catch(console.error);
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
