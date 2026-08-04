# OV1 live optical voice protocol

This document describes the first implemented Optical Voice wire format. It is intentionally small and experimental.

## Layering

OV1 does not replace Decimen's existing QR frame protocol or fountain code. It adds one compact media container above them:

```text
OV1 voice group
  → LT fountain encoder
  → existing 20-byte Decimen frame header
  → QR byte payload
```

Every voice group is finite and independently decodable. This allows a receiver to recover and play current speech without knowing the final duration of a conversation.

## Voice-group layout

All integers are little-endian.

| Offset | Type | Meaning |
| ---: | --- | --- |
| 0 | 4 bytes | Magic `4f 56 31 00` (`OV1\0`) |
| 4 | `u16` | Random sender/stream ID |
| 6 | `u32` | Monotonically increasing group ID |
| 10 | `u16` | UTF-8 MIME-type length |
| 12 | `u32` | Encoded-audio byte length |
| 16 | bytes | UTF-8 MIME type |
| variable | bytes | Complete independently playable encoded-audio blob |

The fixed header is 16 bytes. A voice group is rejected when its lengths do not exactly match the recovered payload or when its encoded audio exceeds 128 KiB.

## Audio grouping

The browser prototype records approximately 600 ms per group at a requested 16 kbit/s audio bitrate. `MediaRecorder` is restarted for every group so each blob carries enough container information to be decoded independently.

The sender prefers these formats in order, using the first one supported by its browser:

1. `audio/webm;codecs=opus`
2. `audio/mp4;codecs=mp4a.40.2`
3. `audio/webm`
4. `audio/mp4`

Cross-browser communication therefore requires the receiving browser's audio decoder to understand the sender's selected format.

## Optical transmission

Each OV1 group is passed to the inherited `LTEncoder` with a 980-byte source block (`1000` QR frame bytes minus the existing 20-byte frame header).

The prototype sends a bounded amount of fountain redundancy:

```text
max(8, ceil(sourceBlockCount × 2.2) + 3) frames
```

A fresh random 16-bit Decimen session ID is used for every group. The existing frame checksum covers the entire OV1 group.

The sender emits at 20 QR frames per second and retains at most three waiting voice groups. When recording outruns optical transmission, the oldest waiting group is discarded. This is deliberate: live conversation prioritises current speech over perfect delivery of old speech.

## Receiver behaviour

The receiver may see frames from adjacent groups out of order because camera-worker results can complete across a QR transition. It therefore keeps up to four fountain decoders keyed by the existing Decimen stream identity.

After a group is complete, the receiver:

1. assembles the fountain payload;
2. verifies the inherited FNV checksum;
3. validates and unpacks the OV1 header;
4. ignores reflected packets carrying its own stream ID;
5. rejects duplicate or older group IDs;
6. decodes the audio blob;
7. schedules it into a small playback buffer.

A playback queue that grows beyond roughly 2.5 seconds is reset to the current time plus a short lead. Old queued speech is not allowed to turn the system into a delayed recording.

## Session semantics

There is no handshake, acknowledgement, retransmission request, or central session service. Pressing Start creates a new random sender ID and resets local receiver state.

Both devices run the same transmit and receive pipeline simultaneously. The physical arrangement of the devices is the session: each front camera must maintain line of sight to the other screen.

## Versioning

`OV1` is an experimental version identifier, not a promise of long-term wire compatibility. Breaking changes require a new magic/version and updated tests.

## Security

OV1 is not encrypted. A camera with line of sight may recover the voice stream. “No network path” is a transport property, not confidentiality.
