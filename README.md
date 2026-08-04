# Optical Voice

**Live voice communication carried entirely through animated visual codes.**

Optical Voice is an open-source experiment led by **Harold Ponte da Costa** to make real-time speech possible between nearby devices using only their screens, cameras, microphones, and speakers—without Wi-Fi, Bluetooth, cellular service, pairing, or an intermediary server.

Each device will display an encoded optical stream while its camera reads the other device's stream. The long-term goal is a two-way conversation that travels directly from screen to camera.

> [!IMPORTANT]
> Live voice is the project goal, not the current state. The inherited Decimen code currently transfers complete files and text through animated QR codes. Development will progress from recorded voice messages to one-way live speech, push-to-talk, and finally experimental full-duplex audio.

## Project status

| Capability | Status |
| --- | --- |
| Fountain-coded optical file transfer | Available from upstream |
| Recorded voice-message transfer | Planned baseline |
| One-way live microphone audio | Planned |
| Optical push-to-talk | Planned |
| Simultaneous two-way conversation | Research milestone |

See the [roadmap](ROADMAP.md) for the staged delivery plan.

## How it should work

```text
microphone
  → speech compression
  → short, independently recoverable audio groups
  → fountain/error-corrected optical packets
  → animated visual stream
  → camera decoding on the other device
  → jitter buffer
  → audio playback
```

A live stream cannot be treated as one endlessly growing file. Audio must be divided into short groups with sequence numbers and playback deadlines. Missing data should be recovered when possible and skipped when it arrives too late, rather than blocking the conversation.

The first practical target is **headphone-based optical push-to-talk**. This avoids acoustic echo while proving the core live transport.

## Why this project exists

Current device-to-device communication normally depends on a radio link or network service. Optical Voice explores a different local channel:

- direct line-of-sight communication;
- no network path between participants;
- no account, pairing, or discovery service;
- a channel that is physically visible and intentionally directional;
- an open protocol that can be studied, measured, and improved.

This is an experimental communication system, not a claim that optical QR communication is faster or more convenient than conventional networking.

## Technical foundation

The project is forked from [Decimen Optical Transfer](https://github.com/bashalarmistalt/decimen-optical-transfer), created by Evan Crawley (Bash Alarmist).

Decimen provides the existing foundation for:

- animated QR generation;
- camera capture and WASM QR decoding;
- Luby Transform fountain coding;
- dropped-frame tolerance;
- deterministic wire-format handling;
- browser/PWA support across desktop and mobile devices.

Optical Voice will introduce a separate live-media protocol, streaming audio pipeline, jitter buffering, playback scheduling, session control, and bidirectional communication mode.

## Development principles

1. **Measure before optimizing.** Latency, decode rate, loss, CPU load, and thermal behaviour must be observable.
2. **Build in stages.** Recorded audio first, then one-way live audio, then push-to-talk, then full duplex.
3. **Keep the protocol documented.** Every wire-format change must be reflected in the protocol specification and test vectors.
4. **Fail gracefully.** Late or missing audio should reduce quality rather than freeze the stream.
5. **Preserve attribution.** Upstream work remains clearly credited and licensed.

## Run locally

```bash
npm install
npm run dev
```

The development server uses HTTPS because browser camera and microphone access require a secure context on devices other than `localhost`.

Existing upstream commands remain available:

```bash
npm test
npm run build
npm run build:standalone
npm run build:all
```

## Documentation

- [Roadmap](ROADMAP.md)
- [Live audio architecture](docs/voice/architecture.md)
- [Protocol direction](docs/voice/protocol.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)

The inherited Decimen documentation remains under `docs/user` and `docs/technical` while the new live-audio design is developed under `docs/voice`.

## Contributing

The project is in an early research and prototyping phase. Contributions involving browser audio, WebCodecs, Opus, real-time media, forward-error correction, QR/camera performance, latency measurement, accessibility, and mobile testing are especially useful.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Maintainer and attribution

**Optical Voice project lead and maintainer:**  
Harold Ponte da Costa — [@ItzHarold](https://github.com/ItzHarold)

**Original optical-transfer foundation:**  
Decimen Optical Transfer by Evan Crawley (Bash Alarmist).

This repository retains the upstream Git history and MIT license. Copyright in upstream code remains with its original author. New Optical Voice contributions belong to their respective contributors and are distributed under the same MIT license.

## License

MIT. See [LICENSE](LICENSE).
