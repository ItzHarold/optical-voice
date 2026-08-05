# Optical Voice roadmap

Optical Voice v0.1 proves that live microphone audio can be carried through animated optical codes and reconstructed while the sender is still speaking. The next work is no longer basic feasibility; it is alignment, measurement, compatibility, and resilience.

## Completed — v0.1 proof of concept

- [x] Preserve the upstream fork relationship, Git history, attribution, and MIT licence.
- [x] Keep Decimen's inherited file and text transfer modes available.
- [x] Capture low-bitrate microphone audio with `MediaRecorder`.
- [x] Split speech into short independently playable groups.
- [x] Define and test the compact `OV1` live voice container.
- [x] Reuse the inherited fountain-coded QR transport.
- [x] Decode overlapping group transitions without resetting useful progress.
- [x] Verify recovered groups before playback.
- [x] Schedule playback with a small bounded buffer.
- [x] Discard stale queued speech instead of allowing unbounded delay.
- [x] Combine transmit and receive into one `/talk/` page.
- [x] Keep the camera preview physically separate from the transmitted QR.
- [x] Add camera alignment guidance and live **Searching / Reading** feedback.
- [x] Demonstrate live optical audio from a phone to a laptop.

## Next — physical usability

- [ ] Make simultaneous two-camera alignment easier and reproducible.
- [ ] Document successful device, browser, distance, brightness, and orientation combinations.
- [ ] Confirm sustained simultaneous two-way speech on at least one documented device pair.
- [ ] Add a push-to-talk fallback for arrangements that cannot maintain full duplex.
- [ ] Add clearer feedback for the remote direction, not only the local camera lock.

## Next — measurement and adaptation

- [ ] Measure glass-to-glass latency, decoded QR rate, group recovery rate, and dropped speech.
- [ ] Tune bitrate, QR density, frame rate, group duration, and redundancy from measurements.
- [ ] Adapt transmission settings to observed camera decode performance.
- [ ] Measure CPU, battery use, device temperature, autofocus, exposure, and long-session stability.
- [ ] Build a public device and browser compatibility matrix.

## Later — quality and security

- [ ] Replace recorder restart boundaries with a lower-level streaming codec where practical.
- [ ] Improve concealment when speech groups are missed.
- [ ] Add automated browser and protocol compatibility tests.
- [ ] Improve accessibility and connection guidance.
- [ ] Add optional authenticated encryption above the optical transport.
- [ ] Publish reproducible demonstrations and benchmarks.

## Current prototype parameters

- approximately 600 ms per independently recoverable audio group;
- requested 12 kbit/s encoded audio;
- 640 bytes per QR frame, including the inherited 20-byte frame header;
- 15 transmitted QR frames per second;
- bounded fountain redundancy per group;
- maximum of three waiting transmit groups;
- small scheduled playback lead with excessive queued delay discarded.

## Not promised

The project does not promise conventional phone-call latency, universal browser support, long-distance communication, operation without line of sight, confidentiality, or better performance than radio-based communication. Those claims require evidence beyond the v0.1 proof of concept.
