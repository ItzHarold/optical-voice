# Live audio architecture

## Objective

Optical Voice should carry speech continuously from one nearby device to another using a display as the transmitter and a camera as the receiver. The first implementation should optimise for intelligibility, observability, and recoverable failure—not maximum audio quality.

## Proposed pipeline

```text
getUserMedia microphone track
  → audio encoder
  → encoded audio frames
  → short transmission group
  → optical packetisation and redundancy
  → animated QR renderer
  → remote camera capture
  → QR decode workers
  → group recovery
  → encoded-frame reorder queue
  → jitter buffer
  → audio decoder
  → scheduled playback
```

## Why the file protocol is insufficient

The inherited Decimen protocol assumes a finite payload with a known total length and hash. Its fountain encoder may generate unlimited repair symbols for that one payload, and the receiver offers the result only after reconstruction completes.

Live speech has no final length. Waiting for a complete stream is impossible, and indefinite retransmission is undesirable because old speech loses value after its playback deadline.

The live protocol should therefore use a sequence of bounded **transmission groups**. Each group contains a short span of encoded audio and can be recovered independently.

## Suggested timing model

A starting point for experiments:

- codec frames: 20 ms;
- transmission group: 250–500 ms of encoded audio;
- receiver target buffer: 500–1000 ms;
- stale-group policy: discard groups that cannot meet their playback deadline;
- timestamp base: monotonic session-relative time.

These values are hypotheses, not protocol guarantees. Benchmarks should determine the final defaults.

## Sender responsibilities

The sender should:

1. Request a mono microphone track.
2. Encode speech continuously at a configurable low bitrate.
3. Collect encoded frames into bounded groups.
4. Add group identity, timing, codec, and integrity metadata.
5. Produce source and repair packets for each group.
6. Schedule a limited number of optical frames before advancing.
7. Expose encoder delay, queue depth, rendered FPS, and dropped render frames.

The sender must not allow an old group to monopolise the display. Once a group is too old to be useful, transmission should advance even if complete recovery is not guaranteed.

## Receiver responsibilities

The receiver should:

1. Capture camera frames continuously.
2. Decode optical packets in workers.
3. Route packets by session and group ID.
4. Recover groups independently.
5. Validate recovered group integrity.
6. Reorder encoded frames by timestamp.
7. maintain a bounded jitter buffer.
8. Schedule decoded audio against the local audio clock.
9. Conceal or skip missing speech rather than blocking indefinitely.
10. Expose capture FPS, decode FPS, group recovery time, packet loss, late loss, and playback buffer depth.

## Codec strategy

Opus is the preferred starting codec because it is designed for interactive speech and is commonly available through browser media APIs. Browser support differs across `MediaRecorder`, WebCodecs, and platforms, so codec selection must be capability-driven.

The first recorded-message milestone may use `MediaRecorder` and WebM/Opus. True low-latency streaming may need WebCodecs or an explicit WASM codec to control frame boundaries, timestamps, and container overhead.

Codec and transport must remain separate modules. The optical protocol should identify the codec rather than assume one permanent encoding.

## Error recovery

File transfer can spend extra time collecting fountain symbols until every byte is recovered. Live audio cannot.

The live transport needs bounded redundancy. Candidate approaches include:

- a small LT/fountain code per transmission group;
- systematic source packets plus parity packets;
- duplication of particularly important metadata;
- unequal protection for control information and audio payload.

The selected design should be driven by measured camera-loss patterns. Recovery probability must be balanced against added latency.

## Full-duplex considerations

A full-duplex page must capture the front camera while displaying a high-contrast changing code and simultaneously capture/play audio. Expected issues include:

- acoustic echo and feedback;
- screen brightness affecting camera exposure;
- camera field-of-view and physical alignment;
- CPU/GPU contention between QR generation, decode workers, and audio;
- device heat and thermal throttling;
- mobile browser restrictions around autoplay and background execution.

Push-to-talk is therefore the required intermediate product. Full duplex remains an experimental phase with a mandatory push-to-talk fallback.

## Module direction

A likely structure is:

```text
voice/
  capture.ts
  codec.ts
  group-builder.ts
  sender.ts
  receiver.ts
  jitter-buffer.ts
  playback.ts
  metrics.ts

shared/
  voice-protocol.ts
  optical-packet-stream.ts
```

This structure is directional and may evolve through implementation pull requests.
