# Changelog

All notable Optical Voice changes are documented here.

## 0.1.0 — 2026-08-05

First working Optical Voice proof of concept.

### Added

- a single `/talk/` page that captures, transmits, receives, reconstructs, and plays live speech;
- the compact `OV1` voice-group container with stream identity, sequence number, MIME type, and payload length;
- short independently recoverable audio groups over the inherited Decimen fountain transport;
- bounded transmission queues that discard stale speech rather than accumulating unlimited delay;
- multiple concurrent receiver decoders to tolerate camera results around QR transitions;
- checksum validation, duplicate suppression, self-reflection filtering, and ordered playback;
- a separate camera-alignment panel that can never cover the transmitted QR;
- live **Searching / Reading** optical-lock feedback;
- mobile and desktop layouts for the two-way page;
- protocol tests and build/PWA integration for `/talk/`.

### Demonstrated

- live microphone audio transmitted optically from a phone screen to a laptop camera;
- successful fountain recovery, audio decoding, and playback while the sender was still speaking;
- the feasibility of using the same page for simultaneous screen transmission and front-camera reception.

### Known limitations

- maintaining camera-to-screen alignment in both directions at once is physically difficult;
- practical latency is higher than a conventional call;
- browser audio-container compatibility varies by device;
- acoustic feedback is possible without headphones;
- the optical stream is not encrypted;
- broad device compatibility and long-session stability have not yet been established.

### Foundation

Optical Voice is derived from Decimen Optical Transfer by Evan Crawley (Bash Alarmist). The upstream Git history, attribution, and MIT licence are retained.
