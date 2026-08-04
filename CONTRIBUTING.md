# Contributing to Optical Voice

Thank you for helping explore live communication over screen-to-camera optical links.

## Before contributing

Please read the README, roadmap, live architecture, and protocol-direction documents. This project is experimental; performance claims must be supported by reproducible measurements.

## Development setup

```bash
npm install
npm test
npm run build
npm run dev
```

Camera and microphone access require a secure browser context. `localhost` is treated as secure; testing from another device normally requires HTTPS.

## Workflow

1. Create an issue for substantial protocol or architecture changes.
2. Branch from `main` using a descriptive name such as `feat/live-group-packetizer`.
3. Keep changes focused and include tests.
4. Run `npm test` and `npm run build` before opening a pull request.
5. Explain test devices, browsers, settings, and measured results.

## Pull-request expectations

A pull request should include:

- the problem being addressed;
- the chosen design and important alternatives;
- tests or deterministic vectors for protocol changes;
- before/after measurements for performance changes;
- documentation updates for new behaviour;
- confirmation that upstream attribution and licensing remain intact.

## Performance reports

Include, where relevant:

- sender and receiver device models;
- operating systems and browser versions;
- display refresh rate and brightness;
- camera resolution and capture FPS;
- QR version, bytes per frame, and transmit FPS;
- audio codec, bitrate, group duration, and buffer target;
- decoded FPS, packet/group loss, and end-to-end latency;
- whether devices were handheld or fixed.

Avoid describing a result as “real-time,” “low latency,” or “reliable” without publishing the measured conditions.

## Protocol changes

Protocol changes must:

- use explicit versioning;
- remain deterministic across supported JavaScript engines;
- include parsing and validation tests;
- include golden encoded byte vectors where practical;
- update `docs/voice/protocol.md`;
- describe compatibility and migration consequences.

## Code style

- Use TypeScript with clear types at protocol boundaries.
- Keep codec, transport, rendering, and playback concerns separated.
- Prefer small modules and observable state over hidden global behaviour.
- Document timing assumptions and units.
- Do not silently ignore integrity or decoding failures.

## Licensing and attribution

The project is MIT licensed and derived from Decimen Optical Transfer. Do not remove the original license, copyright notice, Git history, or attribution. Contributions you submit are accepted under the repository's MIT license.

## Conduct and security

Follow the [Code of Conduct](CODE_OF_CONDUCT.md). Do not publicly disclose security-sensitive findings before following [SECURITY.md](SECURITY.md).
