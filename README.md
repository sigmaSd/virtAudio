# Virtual Audio Streaming

This project implements a web-based audio streaming solution that captures audio from the user's microphone, streams it to a server, and then plays it back through a virtual microphone sink. It uses WebSockets for real-time communication, FFmpeg for audio processing, and PulseAudio for audio output.

## Features

- Web-based interface for starting and stopping audio streaming
- Real-time audio streaming using WebSockets
- Server-side audio processing with FFmpeg
- Playback through a virtual microphone using PulseAudio

## Prerequisites

- Deno
- FFmpeg
- PulseAudio
- A virtual audio sink (e.g., audiorelay-virtual-mic-sink)

## Installation

1. Install Deno: https://deno.land/#installation
2. Install FFmpeg: `sudo apt-get install ffmpeg` (on Ubuntu/Debian)
3. Install PulseAudio: `sudo apt-get install pulseaudio` (on Ubuntu/Debian)
4. Set up a virtual audio sink. You can create a temporary one with these commands:
   ```
   pactl load-module module-null-sink \
     sink_name=audiorelay-virtual-mic-sink \
     sink_properties=device.description=Virtual-Mic-Sink
   pactl load-module module-remap-source \
     master=audiorelay-virtual-mic-sink.monitor \
     source_name=audiorelay-virtual-mic-sink \
     source_properties=device.description=Virtual-Mic
   ```

## Usage

1. Run the server, specifying your virtual mic name as the first argument:
   ```
   deno run --allow-net --allow-run main.ts audiorelay-virtual-mic-sink
   ```

2. Find your local IP using `ifconfig` (Linux/Mac) or `ipconfig` (Windows)

3. Open a web browser and navigate to `http://<your-local-ip>:8000`

4. Click the "Start Streaming" button to begin capturing and streaming audio from your microphone.

5. The audio will be processed by the server and played back through the specified virtual microphone sink.

6. Click the "Stop Streaming" button to end the audio stream.

Note: If accessing from an Android device, use Chrome and enable "Treat insecure origins as secure" for your local IP in `chrome://flags`. This is necessary for audio streaming to work.

## How it Works

1. The web interface uses the MediaRecorder API to capture audio from the user's microphone.
2. Audio data is sent to the server in real-time using WebSockets.
3. The server buffers the incoming audio data and looks for the WebM header.
4. Once the WebM header is found, FFmpeg is started to process the audio stream.
5. FFmpeg converts the WebM audio to raw PCM format.
6. The processed audio is piped to PulseAudio's `pacat` command, which plays it through the virtual microphone sink.

## Troubleshooting

- Make sure your virtual audio sink is properly set up and recognized by PulseAudio.
- Check the console logs for any error messages from FFmpeg or the WebSocket connection.
- Ensure that your browser has permission to access the microphone.

## License

This project is licensed under the MIT License.
