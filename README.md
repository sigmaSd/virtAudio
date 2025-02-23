# Virtual Audio Streaming

A web-based audio streaming solution with a graphical user interface. Captures audio from the user's microphone, streams it to a server, and plays it back through a virtual microphone sink. (linux only for now)

This allow you to use your phone for example as a microphone for the pc.

<a href='https://flathub.org/apps/io.github.sigmasd.VirtAudio'>
  <img width='240' alt='Download on Flathub' src='https://dl.flathub.org/assets/badges/flathub-badge-i-en.png'/>
</a>

![image](https://github.com/sigmaSd/virtAudio/blob/b0ead458f2e4ed377b9a540cd4451f012ad87d71/distro/demo.png)

## Demo
[demo.webm](https://github.com/user-attachments/assets/34a2ef07-696d-4c3e-afdb-4876e048c18e)

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
3. Alternatively, you can download the AppImage from the GitHub Releases page. The AppImage is automatically generated by the GitHub CI.

## Usage

1. Run the GUI application:
   ```
   deno run --allow-all gui.ts
   ```
   Or if you're using the AppImage, simply run the downloaded file.

2. Use the GUI to start/stop the streaming server.

3. You can now connect to the server from any local web client (for example from your phone):
   - Open a browser and go to `http://<your-local-ip>:8383`
   - Use the "Start/Stop Streaming" buttons to control audio capture

Note: For Android devices, enable "Treat insecure origins as secure" for your local IP in Chrome flags (example http://192.168.1.1:8000).

## How it Works

1. The GUI allows users to control the streaming server.
2. The web interface uses the MediaRecorder API to capture audio from the user's microphone.
3. Audio data is sent to the server in real-time using WebSockets.
4. FFmpeg converts the WebM audio to raw PCM format.
5. The processed audio is sent directly to PulseAudio, which plays it through the virtual microphone sink.

## Troubleshooting

- Check console logs for error messages
- Ensure browser has microphone access permission

## License

This project is licensed under the MIT License.
