# Optical Voice

**Live speech transmitted through animated QR codes — screen to camera, with no network carrying the audio.**

**Live application:** [opticalvoice.haroldpdc.com](https://opticalvoice.haroldpdc.com)  
**Start a conversation:** [opticalvoice.haroldpdc.com/talk/](https://opticalvoice.haroldpdc.com/talk/)

Optical Voice is an open-source proof of concept led by **Harold Ponte da Costa**. It turns a device's microphone audio into a continuous sequence of short, recoverable optical transmissions. Another device reads those animated codes with its camera, reconstructs the audio, and plays it while the conversation is still happening.

The same `/talk/` page can transmit and receive at the same time, making experimental two-way optical voice possible when both devices maintain a clear camera-to-screen view.

> **v0.1 proof of concept:** live optical audio has been successfully demonstrated between a phone and a laptop. Maintaining simultaneous optical lock in both directions is possible but physically difficult because both front cameras must continuously see the opposite screen.

## What it does

| Capability | Status |
| --- | --- |
| Live microphone capture | Working |
| Speech encoded into short independent groups | Working |
| Animated QR transmission | Working |
| Camera-based incremental recovery | Working |
| Verified audio reconstruction and playback | Working |
| Bounded buffering that skips stale speech | Working |
| Transmit and receive from the same page | Working |
| Phone-to-laptop live optical audio | Demonstrated |
| Consistent simultaneous two-way alignment | Experimental |
| Broad device and browser compatibility | Not yet established |

The audio itself does not travel through Wi-Fi, Bluetooth, cellular service, WebRTC, or a server. A network connection is only needed to load the web application unless it has already been installed or cached as a PWA.

## How it works

```text
microphone
  → 600 ms low-bitrate audio group
  → OV1 voice container
  → Luby Transform fountain coding
  → animated QR frames on the screen
  → camera on the other device
  → QR decoding and fountain recovery
  → integrity and sequence validation
  → scheduled audio playback
```

Each audio group is independently recoverable. The sender emits repair frames for a limited time and then advances. When optical transmission cannot keep up, old speech is discarded rather than allowing latency to grow indefinitely.

Both devices can run this pipeline simultaneously:

```text
Device A screen  → Device B camera
Device A camera  ← Device B screen
```

## Try the hosted application

Open the live application on both devices:

- [Optical Voice home](https://opticalvoice.haroldpdc.com)
- [Live optical conversation](https://opticalvoice.haroldpdc.com/talk/)

Then:

1. Allow camera and microphone access.
2. Press **Start conversation** on both devices.
3. Aim each front camera at the other device's QR code.
4. Wait until the receiver indicator says **Reading**.

The hosted application is served over HTTPS, so no local development certificate is required. Headphones are strongly recommended to reduce acoustic echo and feedback.

## Run locally

```bash
npm install
npm run dev
```

Vite prints a local HTTPS address and a network address. Open the network address on both devices, navigate to `/talk/`, accept the development certificate warning, and allow camera and microphone access.

## Why the implementation is small

The live mode is concentrated in four files:

- `talk/index.html` — two-way interface and alignment preview;
- `talk/main.ts` — capture, transmission, camera decoding, recovery, and playback;
- `shared/voice.ts` — the compact `OV1` live-audio container;
- `tests/voice.test.ts` — protocol round-trip and malformed-payload tests.

It reuses the existing Decimen QR renderer, camera worker, ZXing WASM decoder, frame protocol, fountain encoder/decoder, PWA build, and wake-lock support.

## Current limitations

- Physical alignment is the main practical constraint. Both front cameras must see the opposite QR while both screens remain visible.
- Audio usually has noticeable experimental latency rather than conventional call latency.
- `MediaRecorder` restarts for every group so each group can be decoded independently; this may introduce small seams and container overhead.
- Cross-browser communication depends on the receiver supporting the audio format selected by the sender.
- Speaker output can feed back into the microphone despite requested browser echo cancellation.
- Performance varies with camera quality, autofocus, screen brightness, reflections, thermal throttling, and browser behaviour.
- The optical stream is not encrypted. Any camera with line of sight may be able to decode it.

## Existing file-transfer modes

The repository retains Decimen's original fountain-coded optical file and text transfer modes under `/send/` and `/receive/`.

```bash
npm test
npm run build
npm run build:standalone
npm run build:all
```

The standalone builds remain focused on file transfer. Optical Voice ships through the main PWA build.

## Documentation

- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)
- [Live audio architecture](docs/voice/architecture.md)
- [OV1 protocol](docs/voice/protocol.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)

## Project and attribution

**Optical Voice project lead and maintainer:**  
Harold Ponte da Costa — [@ItzHarold](https://github.com/ItzHarold)

Optical Voice is based on [Decimen Optical Transfer](https://github.com/bashalarmistalt/decimen-optical-transfer), created by Evan Crawley (Bash Alarmist). Decimen provides the original animated-QR file transport, camera/WASM decoding, and Luby Transform fountain-code foundation.

The upstream Git history and MIT licence are retained. Copyright in inherited code remains with its original author. New Optical Voice contributions belong to their respective contributors and are distributed under the same MIT licence.

## License

Open source under the MIT License. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
