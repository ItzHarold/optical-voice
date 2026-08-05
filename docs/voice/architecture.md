# Live audio architecture

## Objective

Optical Voice carries speech between nearby devices using each screen as a transmitter and each front camera as a receiver. Version 0.1 prioritises a small implementation, independently recoverable speech groups, bounded delay, and reuse of the proven Decimen optical transport.

A phone-to-laptop test successfully reconstructed and played live optical audio while the sender was still speaking. The main remaining challenge is maintaining camera-to-screen alignment in both directions at once.

## Implemented pipeline

```text
microphone track
  → 600 ms MediaRecorder blob
  → OV1 voice-group container
  → inherited LT fountain encoder
  → inherited Decimen frame protocol
  → animated QR renderer
  → remote front camera
  → inherited ZXing WASM QR worker
  → per-group LT decoder
  → checksum + OV1 validation
  → browser audio decoder
  → scheduled playback buffer
```

The same `/talk/` page runs the transmission and reception pipelines simultaneously.

## Why bounded groups

The inherited Decimen file protocol assumes one finite payload. Live speech has no final length, and old speech quickly loses value.

Optical Voice therefore treats a conversation as a sequence of short finite payloads. Every recording group is independently encoded, transmitted, recovered, verified, and decoded. Missing a group damages a short span of speech instead of blocking everything that follows.

## Compact implementation

The new live functionality is intentionally concentrated:

```text
talk/index.html     interface, layout, and alignment preview
talk/main.ts        capture, transport, receive, recovery, and playback
shared/voice.ts     OV1 pack/unpack functions
tests/voice.test.ts wire-format tests
```

Everything else is reused from Decimen. This keeps the proof of concept inspectable and avoids introducing a large framework before measurements justify one.

## Sender

The sender:

1. Requests camera and microphone access.
2. Creates an audio-only `MediaStream` so camera video can never enter the payload.
3. Records approximately 600 ms at a requested 12 kbit/s.
4. Adds stream ID, group ID, MIME type, and length metadata.
5. Fountain-encodes the complete group using the existing Decimen primitives.
6. Displays bounded repair data at 15 QR frames per second.
7. Keeps at most three waiting groups and drops the oldest when overloaded.

The bounded queue is a core live-media rule. When the optical channel falls behind, the system loses old words rather than becoming an ever-growing delayed recording.

## Receiver

The receiver:

1. Captures the front-camera video stream.
2. Draws a mirrored preview into a separate canvas that cannot cover the transmitted QR.
3. Sends one camera image at a time to the existing ZXing WASM worker.
4. Usually scans a centred crop for speed and periodically checks the full image.
5. Limits decoder input to roughly 900 pixels on its longest side.
6. Routes valid frames by Decimen stream identity.
7. Keeps up to four LT decoders so frames completing around QR transitions do not destroy useful progress.
8. Verifies and unpacks complete OV1 groups.
9. Rejects self-reflections, duplicates, and older group IDs.
10. Decodes the media blob and schedules it against an `AudioContext` clock.
11. Resets excessive buffered delay instead of preserving stale speech.

## Simultaneous operation

Both devices can record, render, scan, decode, and play at the same time. The browser is asked for echo cancellation, noise suppression, and automatic gain control. Headphones remain the most reliable way to avoid feedback.

The difficult part is physical rather than conceptual: each front camera must continuously see the opposite QR while each screen remains visible to the other camera. A one-way optical path is straightforward; maintaining both paths simultaneously requires careful positioning.

## Version 0.1 parameters

- recording group: approximately 600 ms;
- requested audio bitrate: 12 kbit/s;
- QR frame size: 640 bytes total;
- LT source block: 620 bytes after the inherited 20-byte frame header;
- transmission rate: 15 QR frames per second;
- redundancy: `max(9, ceil(K × 2.5) + 3)` frames per group;
- waiting transmit queue: three groups;
- receiver decoders: up to four concurrent group streams;
- playback lead: 400 ms;
- queued-playback reset threshold: approximately 2.5 seconds.

These are proof-of-concept values, not final protocol guarantees.

## Known trade-offs

Restarting `MediaRecorder` for every group introduces container overhead and may create small seams. It was chosen because it makes every group independently decodable with little code and broadly available browser APIs.

A later version may use WebCodecs or a WASM Opus implementation for packet-level control. That could reduce overhead and improve continuity, but it would substantially increase complexity and compatibility work.
