# Optical Voice roadmap

This roadmap separates code-complete milestones from physical validation. The first full-duplex browser prototype now exists; the next work is measurement, compatibility, and resilience.

## Phase 0 — Project foundation

- [x] Preserve the upstream fork relationship and Git history.
- [x] Establish Optical Voice branding, ownership, attribution, and contribution rules.
- [x] Document the live-media architecture.
- [x] Keep the inherited file-transfer modes available.
- [ ] Add repeatable optical-channel benchmarks for latency, loss, and goodput.

## Phase 1 — Compact live transport

- [x] Capture microphone audio using `MediaRecorder`.
- [x] Split speech into short independently playable groups.
- [x] Define the `OV1` live voice group header.
- [x] Reuse the existing fountain-coded QR frame transport.
- [x] Decode several transition-overlapping optical streams safely.
- [x] Verify recovered groups before playback.
- [x] Add wire-format tests.

## Phase 2 — One-way and two-way live audio

- [x] Encode and display groups while the microphone remains active.
- [x] Decode groups incrementally instead of waiting for one complete recording.
- [x] Add scheduled playback with a small jitter buffer.
- [x] Discard stale queued speech instead of allowing unbounded delay.
- [x] Combine front-camera receive and screen transmit into one page.
- [x] Run transmit and receive continuously on both devices.
- [x] Request browser echo cancellation, noise suppression, and automatic gain control.
- [ ] Confirm intelligible one-way audio on documented phone/browser pairs.
- [ ] Confirm reproducible simultaneous two-way speech on at least one device pair.
- [ ] Measure glass-to-glass latency and optical group loss.

Initial prototype targets:

- mono low-bitrate speech;
- 600 ms independently recoverable groups;
- bounded sender queue;
- approximately one to two seconds of practical latency;
- graceful loss through skipped groups rather than a frozen stream.

## Phase 3 — Resilience and usability

- [ ] Tune bitrate, QR density, frame rate, group size, and redundancy from measured decode performance.
- [ ] Add visual alignment and distance guidance.
- [ ] Adapt to camera decode rate and thermal throttling.
- [ ] Add a push-to-talk fallback for devices that cannot sustain full duplex.
- [ ] Add clearer audio-format compatibility reporting.
- [ ] Build a device/browser compatibility matrix.
- [ ] Add optional end-to-end encryption above the optical transport.

## Phase 4 — Quality

- [ ] Replace recorder restart boundaries with a lower-level streaming codec where browser support permits.
- [ ] Improve concealment when groups are missed.
- [ ] Measure CPU, battery, heat, exposure, and long-session stability.
- [ ] Add accessibility support and automated browser tests.
- [ ] Publish reproducible demonstrations and benchmark results.

## Not currently promised

The project does not promise conventional phone-call latency, universal browser support, long-distance communication, operation without line of sight, or better performance than Wi-Fi/Bluetooth. Those claims require physical evidence.
