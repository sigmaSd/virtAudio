# Virtual Audio Streaming

A web-based audio streaming solution with a graphical user interface. Captures audio from the user's microphone, streams it to a server, and plays it back through a virtual microphone sink.

## Features

- Graphical user interface for easy control
- Real-time audio streaming using WebSockets
- Server-side audio processing with FFmpeg
- Playback through virtual microphone using PulseAudio

## Prerequisites

- Deno
- FFmpeg
- PulseAudio

## Installation

1. Install Deno: https://deno.land/#installation
2. Install FFmpeg and PulseAudio (e.g., `sudo apt-get install ffmpeg pulseaudio` on Ubuntu/Debian)

## Usage

1. Run the GUI application:
   ```
   deno run --allow-all gui.ts
   ```

2. Use the GUI to start/stop the streaming server.

3. For web interface:
   - Open a browser and go to `http://<your-local-ip>:8000`
   - Use the "Start/Stop Streaming" buttons to control audio capture

Note: For Android devices, enable "Treat insecure origins as secure" for your local IP in Chrome flags (example http://192.168.1.1:8000).

## How it Works

1. The GUI allows users to control the streaming server.
2. The web interface uses the MediaRecorder API to capture audio from the user's microphone.
3. Audio data is sent to the server in real-time using WebSockets.
4. The server buffers the incoming audio data and looks for the WebM header.
5. Once the WebM header is found, FFmpeg is started to process the audio stream.
6. FFmpeg converts the WebM audio to raw PCM format.
7. The processed audio is sent directly to PulseAudio, which plays it through the virtual microphone sink.

## Troubleshooting

- Check console logs for error messages
- Ensure browser has microphone access permission

## License

This project is licensed under the MIT License.
