# Optical Voice roadmap

This roadmap deliberately separates proof of feasibility from a polished communication experience. Each phase should produce measurable evidence before the next phase begins.

## Phase 0 — Project foundation

- [x] Preserve the upstream fork relationship and Git history.
- [x] Establish Optical Voice branding, ownership, attribution, and contribution rules.
- [x] Document the proposed live-media architecture.
- [ ] Confirm the inherited test and production builds pass unchanged.
- [ ] Add repeatable optical-channel benchmarks for latency, loss, and goodput.

**Exit criterion:** contributors can build the project, understand its scope, and reproduce baseline Decimen performance.

## Phase 1 — Recorded optical voice messages

- [ ] Capture microphone audio with `MediaRecorder` using Opus where supported.
- [ ] Transfer a complete short recording through the existing fountain-coded file protocol.
- [ ] Preserve MIME information and verify the payload before playback.
- [ ] Add browser compatibility and maximum-duration tests.

**Exit criterion:** one device records a voice message and another receives and plays it without any network transport.

## Phase 2 — One-way live audio

- [ ] Define the first version of the live voice packet header.
- [ ] Split audio into short independently recoverable transmission groups.
- [ ] Encode and display groups while the microphone remains active.
- [ ] Decode groups incrementally instead of waiting for a complete file.
- [ ] Implement a receiver jitter buffer and scheduled playback.
- [ ] Discard audio that misses its playback deadline.
- [ ] Expose end-to-end latency, loss, recovery, and buffer metrics.

Initial targets:

- mono speech;
- Opus or another browser-supported low-bitrate speech codec;
- 250–500 ms optical recovery groups;
- less than 2 seconds glass-to-glass latency on supported devices;
- intelligible playback under moderate dropped-frame conditions.

**Exit criterion:** continuous speech captured on one device is heard on another while the speaker is still talking.

## Phase 3 — Optical push-to-talk

- [ ] Combine camera receive and screen transmit into one page.
- [ ] Add session identity and direction/turn state.
- [ ] Add press-and-hold or tap-to-talk controls.
- [ ] Require or strongly recommend headphones for initial testing.
- [ ] Handle interruption, session restart, and device rotation.
- [ ] Test front-camera operation while the same phone displays a QR stream.

**Exit criterion:** two devices can alternate speaking in a walkie-talkie-style conversation with no network path.

## Phase 4 — Resilience and usability

- [ ] Tune bitrate, QR density, frame rate, group size, and redundancy automatically.
- [ ] Add visual alignment and distance guidance.
- [ ] Adapt to camera decode performance and thermal throttling.
- [ ] Add accessibility support and clear failure states.
- [ ] Build a device/browser compatibility matrix.
- [ ] Add optional end-to-end encryption above the optical transport.

**Exit criterion:** non-developers can establish and maintain a push-to-talk session on a documented set of devices.

## Phase 5 — Experimental full duplex

- [ ] Transmit and receive continuously on both devices.
- [ ] Investigate speaker-to-microphone echo cancellation.
- [ ] Evaluate alternating optical time slots if simultaneous display/capture interferes.
- [ ] Measure CPU, battery, heat, camera exposure, and audio stability.
- [ ] Define graceful fallback from full duplex to push-to-talk.

**Exit criterion:** both participants can speak and hear simultaneously on at least one documented device pair, with reproducible test results.

## Not currently promised

The roadmap does not promise conventional phone-call latency, universal browser support, long-distance communication, operation without line of sight, or better performance than Wi-Fi/Bluetooth. Those claims require evidence and are outside the initial goal.
