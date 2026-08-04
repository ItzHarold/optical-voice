# Live audio architecture

## Objective

Optical Voice carries speech continuously between two nearby devices using each display as a transmitter and each front camera as a receiver. The first implementation optimises for a small codebase, intelligible speech, bounded latency, and recoverable failure—not maximum audio quality.

## Implemented pipeline

```text
microphone track
  → 600 ms MediaRecorder blob
  → OV1 voice-group container
  → inherited LT fountain encoder
  → inherited Decimen frame protocol
  → animated QR renderer
  → remote front camera
  → inherited WASM QR worker
  → per-group LT decoder
  → checksum + OV1 validation
  → browser audio decoder
  → scheduled playback buffer
```

The same `/talk/` page runs the sender and receiver pipelines simultaneously.

## Why bounded groups

The inherited Decimen file protocol assumes one finite payload. Live speech has no final length and old speech quickly loses value.

Optical Voice therefore treats a conversation as a sequence of short finite payloads. Every 600 ms recording is independently encoded, transmitted, recovered, verified, and decoded. A missed group damages a short span of speech instead of blocking everything that follows.

## Deliberately compact structure

The prototype avoids a large abstraction tree:

```text
talk/index.html     interface and page-local styling
talk/main.ts        capture, transport, receive, recovery, playback
shared/voice.ts     OV1 pack/unpack functions
tests/voice.test.ts wire-format tests
```

Everything else is reused from Decimen. This makes the first implementation easier to inspect and modify while the protocol is still experimental.

If later measurement proves that codec, sender, receiver, or jitter-buffer logic needs independent implementations, those pieces can be extracted without changing the basic wire model.

## Sender

The sender:

1. Requests camera and microphone together.
2. Creates an audio-only `MediaStream` for recording so camera video can never enter the payload.
3. Records a short low-bitrate blob.
4. Adds stream ID, group ID, MIME type, and length metadata.
5. Fountain-encodes the group using the existing Decimen primitives.
6. Displays a bounded amount of repair data at 20 QR frames per second.
7. Keeps at most three waiting groups and discards the oldest when overloaded.

The bounded queue is a core live-media rule. An overloaded system must lose words, not become an ever-growing delayed recording.

## Receiver

The receiver:

1. Captures the front-camera video stream.
2. Sends one camera frame at a time to the existing ZXing WASM worker.
3. Routes valid Decimen frames by their stream identity.
4. Keeps a few simultaneous LT decoders so worker results from QR transitions do not reset useful progress.
5. Verifies and unpacks complete OV1 groups.
6. Rejects self-reflections, duplicates, and older group IDs.
7. Decodes the media blob and schedules it against an `AudioContext` clock.
8. Resets excessive buffered delay instead of preserving stale speech.

## Full duplex

Both devices record, render, scan, decode, and play simultaneously. The browser is asked for echo cancellation, noise suppression, and automatic gain control, but headphones remain the most reliable way to avoid feedback.

The primary physical constraint is simple: when the screens face each other, each front camera must still have a clear view of the other QR code.

## Performance assumptions

The prototype currently uses:

- 600 ms recording groups;
- requested 16 kbit/s audio;
- 980-byte LT source blocks;
- 20 QR frames per second;
- approximately `2.2 × K + 3` transmitted fountain frames;
- a 350 ms initial playback lead;
- a roughly 2.5 second maximum queued-playback tolerance.

These are starting values. Phone-to-phone measurements should drive future tuning.

## Known engineering trade-offs

Restarting `MediaRecorder` for every group introduces container overhead and may create small acoustic seams. It was chosen because it makes every group independently decodable with very little code and broad browser APIs.

A later version may use WebCodecs or a WASM Opus codec for continuous packet-level control, but that would add complexity and reduce current browser coverage.
