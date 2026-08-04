# Optical Voice

**Two-way live voice communication carried through animated optical codes.**

Optical Voice is an open-source experiment led by **Harold Ponte da Costa**. Two nearby devices can exchange speech using their screens, front cameras, microphones, and speakers—without Wi-Fi, Bluetooth, cellular service, pairing, or an intermediary server.

The project is based on [Decimen Optical Transfer](https://github.com/bashalarmistalt/decimen-optical-transfer), which provides the proven animated-QR, camera/WASM decoding, and Luby Transform fountain-code foundation.

## Current status

The repository now contains an **experimental full-duplex prototype** at `/talk/`.

| Capability | Status |
| --- | --- |
| Fountain-coded optical file and text transfer | Available from upstream |
| Live microphone capture | Implemented |
| Short independently recoverable audio groups | Implemented |
| Incremental QR transmission and recovery | Implemented |
| Jitter-buffered audio playback | Implemented |
| Simultaneous transmit and receive on one page | Implemented |
| Reproducible phone-to-phone hardware validation | Still required |
| Broad cross-browser compatibility | Still required |

“Implemented” means the complete browser pipeline exists in code and is build/test covered. It does not yet mean every phone pair or browser combination has been physically validated.

## Try the live mode

```bash
npm install
npm run dev
```

1. Open the printed HTTPS network URL on two devices.
2. Navigate to `/talk/` on both.
3. Press **Start conversation** on both devices.
4. Face the screens toward each other so each front camera sees the other QR code.
5. Use headphones where possible to reduce acoustic echo.

The development server uses HTTPS because browsers require a secure context for camera and microphone access on devices other than `localhost`.

## How it works

```text
microphone
  → 600 ms low-bitrate encoded audio group
  → OV1 voice container (stream id + sequence + MIME)
  → existing Decimen fountain encoder
  → animated QR frames
  → other device's front camera
  → existing WASM QR decoder
  → fountain recovery and checksum verification
  → browser audio decoder
  → small scheduled playback buffer
  → headphones / speaker
```

Both devices run this pipeline at the same time. There is no handshake or retransmission channel. Each audio group receives extra fountain-coded frames, and the receiver can reconstruct it from enough successfully scanned frames.

To remain live, the sender keeps only a small bounded queue. If optical recovery falls behind, old speech is discarded instead of allowing conversation latency to grow indefinitely.

## Deliberately small implementation

The live mode adds only:

- `talk/index.html` — one two-way interface;
- `talk/main.ts` — recording, optical transport, camera decoding, and playback;
- `shared/voice.ts` — a compact 16-byte live voice-group header;
- `tests/voice.test.ts` — protocol round-trip and malformed-packet tests.

It reuses the existing frame protocol, fountain coding, QR rasterizer, QR generator, camera worker, WASM decoder, HTTPS/PWA build, and wake-lock support.

## Expected limitations

- Audio arrives with noticeable experimental latency, likely around one to two seconds depending on hardware and QR decode rate.
- `MediaRecorder` is restarted per recovery group to keep each group independently playable; this prioritizes simplicity and loss recovery over seamless studio-quality audio.
- Cross-browser calls depend on both devices supporting the encoded audio format produced by the sender.
- Speaker output may feed back into the microphone despite requested echo cancellation; headphones are strongly recommended.
- The devices need direct line of sight and careful positioning.
- The optical stream is not encrypted. Any camera aimed at the transmitting screen may be able to decode it.

## Commands

```bash
npm test
npm run build
npm run build:standalone
npm run build:all
```

The inherited standalone builds remain focused on the file sender and receiver. The live mode ships as part of the main PWA build.

## Documentation

- [Roadmap](ROADMAP.md)
- [Live audio architecture](docs/voice/architecture.md)
- [Protocol direction](docs/voice/protocol.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)

## Maintainer and attribution

**Optical Voice project lead and maintainer:**  
Harold Ponte da Costa — [@ItzHarold](https://github.com/ItzHarold)

**Original optical-transfer foundation:**  
Decimen Optical Transfer by Evan Crawley (Bash Alarmist).

This repository retains the upstream Git history and MIT license. Copyright in upstream code remains with its original author. New Optical Voice contributions belong to their respective contributors and are distributed under the same MIT license.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
