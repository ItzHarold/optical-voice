const MAGIC = new Uint8Array([0x4f, 0x56, 0x31, 0x00]); // OV1\0
const HEADER_LEN = 16;
const MAX_CHUNK_BYTES = 128 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface VoiceChunk {
  streamId: number;
  groupId: number;
  mimeType: string;
  audio: Uint8Array;
}

export function packVoiceChunk(
  streamId: number,
  groupId: number,
  mimeType: string,
  audio: Uint8Array,
): Uint8Array {
  const mime = encoder.encode(mimeType || "audio/webm");
  if (mime.length === 0 || mime.length > 0xffff) throw new Error("Unsupported audio type.");
  if (audio.length === 0 || audio.length > MAX_CHUNK_BYTES) {
    throw new Error("Audio group is empty or too large.");
  }
  const out = new Uint8Array(HEADER_LEN + mime.length + audio.length);
  const view = new DataView(out.buffer);
  out.set(MAGIC, 0);
  view.setUint16(4, streamId & 0xffff, true);
  view.setUint32(6, groupId >>> 0, true);
  view.setUint16(10, mime.length, true);
  view.setUint32(12, audio.length, true);
  out.set(mime, HEADER_LEN);
  out.set(audio, HEADER_LEN + mime.length);
  return out;
}

export function unpackVoiceChunk(bytes: Uint8Array): VoiceChunk | null {
  if (bytes.length < HEADER_LEN) return null;
  for (let i = 0; i < MAGIC.length; i++) if (bytes[i] !== MAGIC[i]) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const mimeLength = view.getUint16(10, true);
  const audioLength = view.getUint32(12, true);
  if (
    mimeLength === 0 ||
    audioLength === 0 ||
    audioLength > MAX_CHUNK_BYTES ||
    HEADER_LEN + mimeLength + audioLength !== bytes.length
  ) {
    return null;
  }
  return {
    streamId: view.getUint16(4, true),
    groupId: view.getUint32(6, true),
    mimeType: decoder.decode(bytes.subarray(HEADER_LEN, HEADER_LEN + mimeLength)),
    audio: bytes.slice(HEADER_LEN + mimeLength),
  };
}
