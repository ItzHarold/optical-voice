# Live optical voice protocol direction

This document records the design constraints for the future live protocol. It is not yet a stable wire-format specification.

## Design goals

The protocol should:

- support an unbounded stream as bounded recoverable groups;
- tolerate dropped, duplicated, and out-of-order optical frames;
- permit a receiver to join an active stream;
- keep control metadata self-describing;
- prioritise current audio over perfect recovery of old audio;
- support one-way, push-to-talk, and eventually full-duplex sessions;
- remain testable with deterministic vectors and simulated loss.

## Non-goals for version 1

- bit-perfect archival audio;
- retransmission handshakes;
- universal codec support;
- guaranteed delivery;
- cryptographic confidentiality unless an explicit encryption layer is enabled.

## Candidate packet fields

A first implementation will likely require fields equivalent to:

```ts
interface VoicePacketHeader {
  magic: number;
  version: number;
  sessionId: number;
  speakerId: number;
  groupId: number;
  packetSequence: number;
  groupPacketIndex: number;
  sourcePacketCount: number;
  repairPacketCount: number;
  groupTimestampMs: number;
  groupDurationMs: number;
  codecId: number;
  sampleRate: number;
  channels: number;
  payloadLength: number;
  groupChecksum: number;
  flags: number;
}
```

The exact representation and field sizes must be chosen only after capacity and compatibility measurements.

## Transmission groups

A transmission group is a short independent unit of encoded speech. It should contain enough codec frames to use optical capacity efficiently, while remaining short enough to recover before playback.

Each group should have:

- a unique session-relative group ID;
- a capture timestamp and duration;
- codec configuration sufficient for decoding;
- a checksum or cryptographic digest;
- source and repair packet information;
- an explicit deadline derived by the receiver.

## Session changes

A new session ID should reset receiver state. Session changes may occur when:

- the sender restarts;
- codec parameters change;
- the selected optical profile changes incompatibly;
- a user starts a new conversation.

Codec or profile changes inside an active session should be avoided in the first version.

## Control packets

Control information may include:

- session announcement;
- speaker start/stop state;
- codec configuration;
- end-of-turn marker;
- capability/profile information;
- optional encryption metadata.

Control information should receive stronger protection or repetition than ordinary audio payloads.

## Receiver deadlines

The receiver should calculate a playback deadline for every group. A group that cannot be recovered and decoded before that deadline should be marked late and discarded. This is a core semantic difference from the inherited file protocol.

Metrics should distinguish:

- optical packet loss;
- unrecovered groups;
- recovered but late groups;
- decoder errors;
- playback underruns.

## Versioning

The live protocol must use its own magic value and version namespace so live packets cannot be mistaken for inherited Decimen file-transfer packets.

Breaking wire-format changes require a version increase and updated golden test vectors.

## Security note

A camera with line of sight can observe the optical stream. “No network” does not mean confidential. Encryption should be implemented as an optional authenticated-encryption layer over encoded audio groups, with keys established outside or through a separately reviewed optical handshake.
