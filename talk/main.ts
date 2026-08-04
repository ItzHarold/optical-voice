import QRCode from "qrcode";
import { blockLength } from "../shared/frame-capacity";
import { LTDecoder, LTEncoder } from "../shared/fountain";
import { rasterizeQr } from "../shared/qr-raster";
import {
  fnv1a,
  packFrame,
  parseFrame,
  streamIdentity,
  type FrameHeader,
} from "../shared/protocol";
import { packVoiceChunk, unpackVoiceChunk } from "../shared/voice";
import { requestScreenWakeLock } from "../shared/wake-lock";

const GROUP_MS = 600;
const TX_FPS = 15;
const FRAME_BYTES = 640;
const BLOCK_LEN = blockLength(FRAME_BYTES);
const MARGIN = 4;
const MAX_TX_QUEUE = 3;
const MAX_RX_STREAMS = 4;
const PLAYBACK_LEAD = 0.4;

const canvas = document.getElementById("qr") as HTMLCanvasElement;
const video = document.getElementById("camera") as HTMLVideoElement;
const cameraCard = document.getElementById("camera-card")!;
const scanStat = document.getElementById("scan-stat")!;
const startButton = document.getElementById("start") as HTMLButtonElement;
const muteButton = document.getElementById("mute") as HTMLButtonElement;
const status = document.getElementById("status")!;
const txStat = document.getElementById("tx-stat")!;
const rxStat = document.getElementById("rx-stat")!;
const bufferStat = document.getElementById("buffer-stat")!;
const staging = document.createElement("canvas");

interface TxGroup {
  encoder: LTEncoder;
  header: FrameHeader;
  seq: number;
  framesLeft: number;
}

interface RxStream {
  decoder: LTDecoder;
  header: FrameHeader;
  seenAt: number;
}

type VideoWithFrames = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
};

let running = false;
let generation = 0;
let media: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let worker: Worker | null = null;
let workerBusy = false;
let senderId = 0;
let groupId = 0;
let currentTx: TxGroup | null = null;
let txQueue: TxGroup[] = [];
let rxStreams = new Map<string, RxStream>();
let completedStreams = new Set<string>();
let nextPlayAt = 0;
let lastRemoteGroup = new Map<number, number>();
let sentGroups = 0;
let receivedGroups = 0;
let droppedGroups = 0;
let decodedFrames = 0;
let lastDecodedAt = 0;

function randomId(): number {
  return (crypto.getRandomValues(new Uint16Array(1))[0]! || 1) & 0xffff;
}

function setStatus(message: string, error = false): void {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function drawIdle(label = "READY"): void {
  const size = 360;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#070a11";
  ctx.textAlign = "center";
  ctx.font = "700 30px system-ui, sans-serif";
  ctx.fillText(label, size / 2, size / 2 - 4);
  ctx.font = "15px system-ui, sans-serif";
  ctx.fillText("press start on both devices", size / 2, size / 2 + 28);
}

function recorderMime(): string {
  const choices = [
    "audio/webm;codecs=opus",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/webm",
    "audio/mp4",
  ];
  return choices.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function recordGroup(stream: MediaStream, mimeType: string, gen: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!running || gen !== generation) return resolve(null);
    let settled = false;
    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      resolve(blob);
    };
    const chunks: Blob[] = [];
    const options: MediaRecorderOptions = { audioBitsPerSecond: 12_000 };
    if (mimeType) options.mimeType = mimeType;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, options);
    } catch {
      finish(null);
      return;
    }
    const timer = window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, GROUP_MS);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      clearTimeout(timer);
      if (recorder.state !== "inactive") recorder.stop();
      finish(null);
    };
    recorder.onstop = () => {
      clearTimeout(timer);
      finish(chunks.length > 0 ? new Blob(chunks, { type: recorder.mimeType || mimeType }) : null);
    };
    recorder.start();
  });
}

async function recordLoop(gen: number): Promise<void> {
  const source = media;
  if (!source) return;
  const audioStream = new MediaStream(source.getAudioTracks());
  const mime = recorderMime();
  while (running && gen === generation) {
    const blob = await recordGroup(audioStream, mime, gen);
    if (!blob) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    if (!running || gen !== generation) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    try {
      enqueueVoice(packVoiceChunk(senderId, groupId++, blob.type || mime || "audio/webm", bytes));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  }
}

function enqueueVoice(payload: Uint8Array): void {
  const sessionId = randomId();
  const encoder = new LTEncoder(payload, BLOCK_LEN, sessionId);
  const header: FrameHeader = {
    sessionId,
    seq: 0,
    k: encoder.k,
    blockLen: BLOCK_LEN,
    totalLen: payload.length,
    payloadFnv: fnv1a(payload),
  };
  txQueue.push({
    encoder,
    header,
    seq: 0,
    framesLeft: Math.max(9, Math.ceil(encoder.k * 2.5) + 3),
  });
  while (txQueue.length > MAX_TX_QUEUE) {
    txQueue.shift();
    droppedGroups++;
  }
  sentGroups++;
}

function nextQrFrame(): ImageData | null {
  if (!currentTx) currentTx = txQueue.shift() ?? null;
  const tx = currentTx;
  if (!tx) return null;
  const seq = tx.seq++;
  const bytes = packFrame({ ...tx.header, seq }, tx.encoder.encode(seq));
  tx.framesLeft--;
  if (tx.framesLeft <= 0) currentTx = null;
  const qr = QRCode.create([{ data: bytes, mode: "byte" } as unknown as QRCode.QRCodeSegment], {
    errorCorrectionLevel: "L",
    maskPattern: 4,
  });
  const raster = rasterizeQr(qr.modules.size, qr.modules.data, MARGIN);
  return new ImageData(new Uint8ClampedArray(raster.pixels.buffer), raster.size, raster.size);
}

function drawQr(image: ImageData): void {
  staging.width = image.width;
  staging.height = image.height;
  staging.getContext("2d")!.putImageData(image, 0, 0);
  const cssSize = Math.min(
    620,
    Math.max(220, window.innerWidth - 28),
    Math.max(260, window.innerHeight * 0.68),
  );
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.max(1, Math.floor((cssSize * dpr) / image.width));
  canvas.width = image.width * scale;
  canvas.height = image.height * scale;
  canvas.style.width = `${canvas.width / dpr}px`;
  canvas.style.height = `${canvas.height / dpr}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(staging, 0, 0, canvas.width, canvas.height);
}

function transmitLoop(gen: number): void {
  const interval = 1000 / TX_FPS;
  let nextAt = performance.now();
  const tick = (now: number) => {
    if (!running || gen !== generation) return;
    requestAnimationFrame(tick);
    if (now < nextAt) return;
    const frame = nextQrFrame();
    if (frame) drawQr(frame);
    nextAt += interval;
    if (now - nextAt > interval * 3) nextAt = now + interval;
  };
  requestAnimationFrame(tick);
}

function trimReceiverMaps(): void {
  if (rxStreams.size > MAX_RX_STREAMS) {
    const oldest = [...rxStreams.entries()].sort((a, b) => a[1].seenAt - b[1].seenAt)[0];
    if (oldest) rxStreams.delete(oldest[0]);
  }
  if (completedStreams.size > 24) completedStreams = new Set([...completedStreams].slice(-12));
}

function onDecoded(bytes: Uint8Array): void {
  const parsed = parseFrame(bytes);
  if (!parsed) return;
  decodedFrames++;
  lastDecodedAt = performance.now();
  const identity = streamIdentity(parsed.header);
  if (completedStreams.has(identity)) return;
  let state = rxStreams.get(identity);
  if (!state) {
    state = {
      decoder: new LTDecoder(
        parsed.header.k,
        parsed.header.blockLen,
        parsed.header.sessionId,
        parsed.header.totalLen,
      ),
      header: parsed.header,
      seenAt: performance.now(),
    };
    rxStreams.set(identity, state);
    trimReceiverMaps();
  }
  state.seenAt = performance.now();
  state.decoder.addFrame(parsed.header.seq, parsed.block);
  if (!state.decoder.isComplete) return;
  const payload = state.decoder.assemble();
  rxStreams.delete(identity);
  completedStreams.add(identity);
  if (!payload || fnv1a(payload) !== state.header.payloadFnv) return;
  const chunk = unpackVoiceChunk(payload);
  if (!chunk || chunk.streamId === senderId) return;
  receivedGroups++;
  void scheduleAudio(chunk.streamId, chunk.groupId, chunk.audio);
}

async function scheduleAudio(streamId: number, remoteGroupId: number, audio: Uint8Array): Promise<void> {
  const ctx = audioContext;
  if (!ctx) return;
  const previous = lastRemoteGroup.get(streamId);
  if (previous !== undefined && remoteGroupId <= previous) return;
  lastRemoteGroup.set(streamId, remoteGroupId);
  try {
    const stable = audio.slice().buffer;
    const decoded = await ctx.decodeAudioData(stable);
    if (lastRemoteGroup.get(streamId) !== remoteGroupId) return;
    const now = ctx.currentTime;
    if (nextPlayAt < now || nextPlayAt - now > 2.5) nextPlayAt = now + PLAYBACK_LEAD;
    const source = ctx.createBufferSource();
    source.buffer = decoded;
    source.connect(ctx.destination);
    source.start(nextPlayAt);
    nextPlayAt += decoded.duration;
  } catch {
    setStatus("Received audio, but this browser could not decode its format.", true);
  }
}

function captureLoop(gen: number): void {
  const grab = document.createElement("canvas");
  let frameId = 0;
  const schedule = () => {
    if (!running || gen !== generation) return;
    const next = () => {
      if (!running || gen !== generation) return;
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!workerBusy && width && height && worker) {
        const useCenterCrop = frameId % 4 !== 0;
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = width;
        let sourceHeight = height;
        if (useCenterCrop) {
          const side = Math.floor(Math.min(width, height) * 0.88);
          sourceX = Math.floor((width - side) / 2);
          sourceY = Math.floor((height - side) / 2);
          sourceWidth = side;
          sourceHeight = side;
        }
        const scale = Math.min(1, 900 / Math.max(sourceWidth, sourceHeight));
        const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
        const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
        if (grab.width !== targetWidth || grab.height !== targetHeight) {
          grab.width = targetWidth;
          grab.height = targetHeight;
        }
        const ctx = grab.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(
          video,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          targetWidth,
          targetHeight,
        );
        const image = ctx.getImageData(0, 0, targetWidth, targetHeight);
        workerBusy = true;
        worker.postMessage(
          { id: frameId++, buf: image.data.buffer, w: targetWidth, h: targetHeight },
          [image.data.buffer],
        );
      }
      schedule();
    };
    const camera = video as VideoWithFrames;
    if (camera.requestVideoFrameCallback) camera.requestVideoFrameCallback(next);
    else requestAnimationFrame(next);
  };
  schedule();
}

function updateStats(): void {
  txStat.textContent = `${sentGroups} sent${droppedGroups ? ` · ${droppedGroups} skipped` : ""}`;
  rxStat.textContent = `${receivedGroups} received`;
  const queued = audioContext ? Math.max(0, nextPlayAt - audioContext.currentTime) : 0;
  bufferStat.textContent = `${queued.toFixed(1)} s buffer`;
  const reading = running && performance.now() - lastDecodedAt < 1800;
  cameraCard.classList.toggle("locked", reading);
  scanStat.textContent = !running ? "Idle" : reading ? `Reading · ${decodedFrames}` : "Searching…";
}

async function start(): Promise<void> {
  if (running) {
    stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    setStatus("This browser does not expose the required camera and microphone APIs.", true);
    return;
  }
  const gen = ++generation;
  startButton.disabled = true;
  setStatus("Requesting camera and microphone…");
  try {
    media = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: 960 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
    });
    if (gen !== generation) {
      media.getTracks().forEach((track) => track.stop());
      return;
    }
    video.srcObject = media;
    await video.play();
    audioContext = new AudioContext({ latencyHint: "interactive" });
    await audioContext.resume();
    worker = new Worker(new URL("../receive/worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data as { id: number; bytes: Uint8Array | null };
      if (message.id === -1) return;
      workerBusy = false;
      if (message.bytes) onDecoded(message.bytes);
    };
    senderId = randomId();
    groupId = 0;
    sentGroups = 0;
    receivedGroups = 0;
    droppedGroups = 0;
    decodedFrames = 0;
    lastDecodedAt = 0;
    nextPlayAt = 0;
    txQueue = [];
    currentTx = null;
    rxStreams.clear();
    completedStreams.clear();
    lastRemoteGroup.clear();
    running = true;
    startButton.disabled = false;
    startButton.textContent = "Stop conversation";
    muteButton.hidden = false;
    muteButton.textContent = "Mute microphone";
    setStatus("Live. Center the other QR in the receiver guide until it says Reading.");
    captureLoop(gen);
    transmitLoop(gen);
    void recordLoop(gen);
    await requestScreenWakeLock();
  } catch (error) {
    stop();
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function stop(): void {
  generation++;
  running = false;
  media?.getTracks().forEach((track) => track.stop());
  media = null;
  video.srcObject = null;
  worker?.terminate();
  worker = null;
  workerBusy = false;
  void audioContext?.close();
  audioContext = null;
  txQueue = [];
  currentTx = null;
  rxStreams.clear();
  decodedFrames = 0;
  lastDecodedAt = 0;
  cameraCard.classList.remove("locked");
  scanStat.textContent = "Idle";
  startButton.disabled = false;
  startButton.textContent = "Start conversation";
  muteButton.hidden = true;
  drawIdle();
  setStatus("Stopped. Press start on both devices when they are facing each other.");
}

function toggleMute(): void {
  const track = media?.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  muteButton.textContent = track.enabled ? "Mute microphone" : "Unmute microphone";
}

startButton.addEventListener("click", () => void start());
muteButton.addEventListener("click", toggleMute);
window.setInterval(updateStats, 500);
drawIdle();
