import assert from "node:assert/strict";
import test from "node:test";
import { packVoiceChunk, unpackVoiceChunk } from "../shared/voice";

test("voice groups round-trip their identity, media type and audio bytes", () => {
  const audio = new Uint8Array([0, 1, 2, 127, 128, 255]);
  const unpacked = unpackVoiceChunk(packVoiceChunk(0x1234, 0x89abcdef, "audio/webm;codecs=opus", audio));
  assert.ok(unpacked);
  assert.equal(unpacked.streamId, 0x1234);
  assert.equal(unpacked.groupId, 0x89abcdef);
  assert.equal(unpacked.mimeType, "audio/webm;codecs=opus");
  assert.deepEqual(unpacked.audio, audio);
});

test("voice groups reject malformed lengths and unrelated payloads", () => {
  assert.equal(unpackVoiceChunk(new Uint8Array([1, 2, 3])), null);
  const packet = packVoiceChunk(1, 2, "audio/webm", new Uint8Array([3, 4, 5]));
  new DataView(packet.buffer).setUint32(12, 99, true);
  assert.equal(unpackVoiceChunk(packet), null);
});
