import QRCode from "qrcode";
import { blockLength } from "../shared/frame-capacity";
import { LTDecoder, LTEncoder } from "../shared/fountain";
import { rasterizeQr } from "../shared/qr-raster";
import {
  fnv1a,
  packFile,
  packFrame,
  parseFrame,
  streamIdentity,
  unpackFile,
  verifyFile,
  type FrameHeader,
} from "../shared/protocol";
import { requestScreenWakeLock } from "../shared/wake-lock";

const PROFILES = [
  { name: "Safe", frameBytes: 1000, fps: 15 },
  { name: "Balanced", frameBytes: 1465, fps: 24 },
  { name: "Fast", frameBytes: 2331, fps: 30 },
] as const;
const TONES = { slower: 1550, faster: 1850, hold: 2150, done: 2450 } as const;
const MARGIN = 4;
const TONE_MS = 180;

type Role = "send" | "receive";
type Command = keyof typeof TONES;
type ProfileIndex = 0 | 1 | 2;
type VideoWithFrames = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
};

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const roleSend = byId<HTMLButtonElement>("role-send");
const roleReceive = byId<HTMLButtonElement>("role-receive");
const panelTitle = byId<HTMLElement>("panel-title");
const senderControls = byId<HTMLElement>("sender-controls");
const receiverControls = byId<HTMLElement>("receiver-controls");
const sendStage = byId<HTMLElement>("send-stage");
const receiveStage = byId<HTMLElement>("receive-stage");
const fileInput = byId<HTMLInputElement>("file");
const startSend = byId<HTMLButtonElement>("start-send");
const startReceive = byId<HTMLButtonElement>("start-receive");
const qrCanvas = byId<HTMLCanvasElement>("qr");
const video = byId<HTMLVideoElement>("video");
const status = byId<HTMLElement>("status");
const profileStat = byId<HTMLElement>("profile-stat");
const streamStat = byId<HTMLElement>("stream-stat");
const audioStat = byId<HTMLElement>("audio-stat");
const feedbackStat = byId<HTMLElement>("feedback-stat");
const progressBar = byId<HTMLElement>("progress-bar");
const progressLabel = byId<HTMLElement>("progress-label");
const receivedResult = byId<HTMLElement>("received-result");

let role: Role = "send";
let generation = 0;
let profileIndex: ProfileIndex = 1;
let sendRunning = false;
let receiveRunning = false;
let payload: Uint8Array | null = null;
let encoder: LTEncoder | null = null;
let header: FrameHeader | null = null;
let seq = 0;
let profileGeneration = 0;
let mic: MediaStream | null = null;
let camera: MediaStream | null = null;
let audio: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let worker: Worker | null = null;
let workerBusy = false;
let decoder: LTDecoder | null = null;
let receiverHeader: FrameHeader | null = null;
let receiverIdentity = "";
let receiverFrames = 0;
let receiverLastFrames = 0;
let receiverLastSampleAt = 0;
let receiverLastCommandAt = 0;
let receiverLastDecodedAt = 0;
let completed = false;
let lastHeard: Command | null = null;
let lastHeardAt = 0;

function randomId(): number {
  return (crypto.getRandomValues(new Uint16Array(1))[0]! || 1) & 0xffff;
}

function setStatus(message: string, error = false): void {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function drawIdle(label = "ADAPTIVE"): void {
  const size = 420;
  const dpr = window.devicePixelRatio || 1;
  qrCanvas.width = size * dpr;
  qrCanvas.height = size * dpr;
  qrCanvas.style.width = `${size}px`;
  qrCanvas.style.height = `${size}px`;
  const ctx = qrCanvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#070a11";
  ctx.textAlign = "center";
  ctx.font = "700 28px system-ui, sans-serif";
  ctx.fillText(label, size / 2, size / 2);
}

function resetMedia(): void {
  mic?.getTracks().forEach((track) => track.stop());
  camera?.getTracks().forEach((track) => track.stop());
  mic = null;
  camera = null;
  worker?.terminate();
  worker = null;
  workerBusy = false;
  analyser = null;
  void audio?.close();
  audio = null;
  video.pause();
  video.srcObject = null;
}

function resetState(): void {
  generation++;
  sendRunning = false;
  receiveRunning = false;
  payload = null;
  encoder = null;
  header = null;
  decoder = null;
  receiverHeader = null;
  receiverIdentity = "";
  receiverFrames = 0;
  completed = false;
  resetMedia();
  startSend.textContent = "Start adaptive transfer";
  startReceive.textContent = "Start camera + feedback";
  streamStat.textContent = "Idle";
  audioStat.textContent = "Idle";
  feedbackStat.textContent = "No feedback yet.";
  progressBar.style.width = "0%";
  progressLabel.textContent = "0% · waiting for optical frames";
  receivedResult.replaceChildren();
}

function setRole(next: Role): void {
  if (next === role) return;
  resetState();
  role = next;
  const sending = role === "send";
  roleSend.classList.toggle("active", sending);
  roleReceive.classList.toggle("active", !sending);
  senderControls.hidden = !sending;
  receiverControls.hidden = sending;
  sendStage.hidden = !sending;
  receiveStage.hidden = sending;
  panelTitle.textContent = sending ? "Adaptive sender" : "Adaptive receiver";
  profileStat.textContent = sending ? PROFILES[profileIndex].name : "Receiver decides";
  setStatus(
    sending
      ? "Choose a file, then start. Keep the receiving device close enough to hear feedback tones."
      : "Start the camera, point it at the sender, and this device will send tiny sound commands back automatically.",
  );
}

function clampProfile(index: number): ProfileIndex {
  return Math.max(0, Math.min(2, index)) as ProfileIndex;
}

function rebuildSender(nextProfile: number): void {
  if (!payload) return;
  profileIndex = clampProfile(nextProfile);
  const profile = PROFILES[profileIndex];
  const blockLen = blockLength(profile.frameBytes);
  const sessionId = randomId();
  encoder = new LTEncoder(payload, blockLen, sessionId);
  header = {
    sessionId,
    seq: 0,
    k: encoder.k,
    blockLen,
    totalLen: payload.length,
    payloadFnv: fnv1a(payload),
  };
  seq = 0;
  profileGeneration++;
  profileStat.textContent = profile.name;
  streamStat.textContent = `${profile.fps} fps · ${profile.frameBytes} B/frame`;
}

function drawFrame(bytes: Uint8Array): void {
  const qr = QRCode.create([{ data: bytes, mode: "byte" } as unknown as QRCode.QRCodeSegment], {
    errorCorrectionLevel: "L",
    maskPattern: 4,
  });
  const raster = rasterizeQr(qr.modules.size, qr.modules.data, MARGIN);
  const image = new ImageData(new Uint8ClampedArray(raster.pixels.buffer), raster.size, raster.size);
  const staging = document.createElement("canvas");
  staging.width = image.width;
  staging.height = image.height;
  staging.getContext("2d")!.putImageData(image, 0, 0);
  const cssSize = Math.min(620, Math.max(260, window.innerWidth - 44), Math.max(300, window.innerHeight * 0.68));
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.max(1, Math.floor((cssSize * dpr) / image.width));
  qrCanvas.width = image.width * scale;
  qrCanvas.height = image.height * scale;
  qrCanvas.style.width = `${qrCanvas.width / dpr}px`;
  qrCanvas.style.height = `${qrCanvas.height / dpr}px`;
  const ctx = qrCanvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(staging, 0, 0, qrCanvas.width, qrCanvas.height);
}

function qrLoop(gen: number): void {
  let localProfileGeneration = -1;
  let nextAt = performance.now();
  const tick = (now: number) => {
    if (!sendRunning || gen !== generation) return;
    requestAnimationFrame(tick);
    const profile = PROFILES[profileIndex];
    if (localProfileGeneration !== profileGeneration) {
      localProfileGeneration = profileGeneration;
      nextAt = now;
    }
    if (now < nextAt || !encoder || !header) return;
    const currentSeq = seq++;
    drawFrame(packFrame({ ...header, seq: currentSeq }, encoder.encode(currentSeq)));
    const interval = 1000 / profile.fps;
    nextAt += interval;
    if (now - nextAt > interval * 3) nextAt = now + interval;
  };
  requestAnimationFrame(tick);
}

function dominantTone(): { command: Command | null; frequency: number } {
  if (!analyser || !audio) return { command: null, frequency: 0 };
  const bins = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(bins);
  let bestIndex = 0;
  let bestDb = -Infinity;
  const min = Math.floor((1350 * analyser.fftSize) / audio.sampleRate);
  const max = Math.min(bins.length - 1, Math.ceil((2600 * analyser.fftSize) / audio.sampleRate));
  for (let index = min; index <= max; index++) {
    const value = bins[index] ?? -Infinity;
    if (value > bestDb) {
      bestDb = value;
      bestIndex = index;
    }
  }
  const frequency = (bestIndex * audio.sampleRate) / analyser.fftSize;
  let command: Command | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const [candidate, tone] of Object.entries(TONES) as [Command, number][]) {
    const delta = Math.abs(tone - frequency);
    if (delta < distance) {
      distance = delta;
      command = candidate;
    }
  }
  return { command: bestDb > -48 && distance <= 90 ? command : null, frequency };
}

function applyCommand(command: Command): void {
  const now = performance.now();
  if (lastHeard === command && now - lastHeardAt < 900) return;
  lastHeard = command;
  lastHeardAt = now;
  if (command === "slower") {
    rebuildSender(profileIndex - 1);
    feedbackStat.textContent = `Receiver asked to slow down → ${PROFILES[profileIndex].name}.`;
  } else if (command === "faster") {
    rebuildSender(profileIndex + 1);
    feedbackStat.textContent = `Receiver says the link is healthy → ${PROFILES[profileIndex].name}.`;
  } else if (command === "hold") {
    feedbackStat.textContent = "Receiver asked to hold this profile.";
  } else {
    feedbackStat.textContent = "Receiver verified the file. Transfer stopped.";
    stopSender(false);
  }
}

function feedbackListenLoop(gen: number): void {
  const tick = () => {
    if (!sendRunning || gen !== generation) return;
    const heard = dominantTone();
    if (heard.command) {
      audioStat.textContent = `${heard.command} · ${Math.round(heard.frequency)} Hz`;
      applyCommand(heard.command);
    } else {
      audioStat.textContent = "Listening";
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function startSender(): Promise<void> {
  if (sendRunning) {
    stopSender(true);
    return;
  }
  const file = fileInput.files?.[0];
  if (!file) {
    setStatus("Choose a file first.", true);
    return;
  }
  const gen = ++generation;
  startSend.disabled = true;
  setStatus("Preparing file and opening the microphone for feedback…");
  try {
    payload = (await packFile(file.name, file.type, new Uint8Array(await file.arrayBuffer()))).container;
    if (gen !== generation) return;
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    audio = new AudioContext({ latencyHint: "interactive" });
    await audio.resume();
    const source = audio.createMediaStreamSource(mic);
    analyser = audio.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.35;
    source.connect(analyser);
    sendRunning = true;
    profileIndex = 1;
    rebuildSender(profileIndex);
    startSend.disabled = false;
    startSend.textContent = "Stop transfer";
    setStatus(`Streaming ${file.name}. The microphone is listening only for the receiver's feedback tones.`);
    qrLoop(gen);
    feedbackListenLoop(gen);
    await requestScreenWakeLock();
  } catch (error) {
    stopSender(false);
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function stopSender(userInitiated: boolean): void {
  generation++;
  sendRunning = false;
  payload = null;
  encoder = null;
  header = null;
  mic?.getTracks().forEach((track) => track.stop());
  mic = null;
  analyser = null;
  void audio?.close();
  audio = null;
  startSend.disabled = false;
  startSend.textContent = "Start adaptive transfer";
  streamStat.textContent = "Idle";
  audioStat.textContent = "Idle";
  drawIdle(userInitiated ? "STOPPED" : "COMPLETE");
  if (userInitiated) setStatus("Stopped. Choose a file and start again when ready.");
}

async function emitTone(command: Command): Promise<void> {
  if (!audio || audio.state === "closed") return;
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = TONES[command];
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.015);
  gain.gain.setValueAtTime(0.16, now + TONE_MS / 1000 - 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + TONE_MS / 1000);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + TONE_MS / 1000 + 0.02);
  audioStat.textContent = `Sent ${command}`;
  feedbackStat.textContent = `Sent “${command}” to the sender over sound.`;
  await new Promise((resolve) => setTimeout(resolve, TONE_MS + 120));
}

function chooseReceiverCommand(): Command | null {
  const now = performance.now();
  if (completed) return "done";
  if (!decoder || receiverFrames < 5 || now - receiverLastCommandAt < 1800) return null;
  const frameDelta = receiverFrames - receiverLastFrames;
  const elapsed = Math.max(0.5, (now - receiverLastSampleAt) / 1000);
  const rate = frameDelta / elapsed;
  receiverLastFrames = receiverFrames;
  receiverLastSampleAt = now;
  receiverLastCommandAt = now;
  if (rate < 1.2) return "slower";
  if (rate > 8 && decoder.framesNew > 14) return "faster";
  return "hold";
}

function updateProgress(): void {
  if (!decoder) return;
  const target = Math.max(decoder.k + 2, Math.ceil(decoder.k * 1.18));
  const percent = Math.min(99, (decoder.framesNew / target) * 100);
  progressBar.style.width = `${percent.toFixed(1)}%`;
  progressLabel.textContent = `${percent.toFixed(0)}% · ${decoder.framesNew} useful frames · ${decoder.solvedCount}/${decoder.k} blocks solved`;
}

async function onDecoded(bytes: Uint8Array): Promise<void> {
  const parsed = parseFrame(bytes);
  if (!parsed || completed) return;
  receiverLastDecodedAt = performance.now();
  const identity = streamIdentity(parsed.header);
  if (!decoder || receiverIdentity !== identity) {
    decoder = new LTDecoder(parsed.header.k, parsed.header.blockLen, parsed.header.sessionId, parsed.header.totalLen);
    receiverHeader = parsed.header;
    receiverIdentity = identity;
    receiverFrames = 0;
    receiverLastFrames = 0;
    receiverLastSampleAt = performance.now();
    streamStat.textContent = `Locked · K=${parsed.header.k}`;
  }
  receiverFrames++;
  decoder.addFrame(parsed.header.seq, parsed.block);
  updateProgress();
  const command = chooseReceiverCommand();
  if (command) void emitTone(command);
  if (!decoder.isComplete || !receiverHeader) return;
  const container = decoder.assemble();
  if (!container || fnv1a(container) !== receiverHeader.payloadFnv) return;
  completed = true;
  progressBar.style.width = "100%";
  progressLabel.textContent = "100% · optical payload reconstructed";
  try {
    const file = await unpackFile(container);
    if (!(await verifyFile(file))) throw new Error("SHA-256 verification failed.");
    await emitTone("done");
    setStatus(`Verified ${file.name}. The receiver sent a DONE tone so the sender can stop.`);
    streamStat.textContent = "Verified";
    showReceivedFile(file.name, file.type, file.bytes);
    stopReceiverCapture();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function showReceivedFile(name: string, type: string, bytes: Uint8Array): void {
  const heading = document.createElement("strong");
  heading.textContent = name;
  const actions = document.createElement("div");
  actions.className = "received-actions";
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  if (type.startsWith("image/")) {
    const image = document.createElement("img");
    image.className = "received";
    image.src = url;
    image.alt = `Received file preview: ${name}`;
    actions.append(image);
  }
  const download = document.createElement("a");
  download.className = "adaptive-button primary";
  download.href = url;
  download.download = name;
  download.textContent = `Save ${name}`;
  actions.append(download);
  receivedResult.replaceChildren(heading, actions);
}

function captureLoop(gen: number): void {
  const grab = document.createElement("canvas");
  let frameId = 0;
  const schedule = () => {
    if (!receiveRunning || gen !== generation) return;
    const next = () => {
      if (!receiveRunning || gen !== generation) return;
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!workerBusy && width && height && worker) {
        const side = Math.floor(Math.min(width, height) * 0.92);
        const x = Math.floor((width - side) / 2);
        const y = Math.floor((height - side) / 2);
        const scale = Math.min(1, 1000 / side);
        const target = Math.max(1, Math.round(side * scale));
        if (grab.width !== target || grab.height !== target) {
          grab.width = target;
          grab.height = target;
        }
        const ctx = grab.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(video, x, y, side, side, 0, 0, target, target);
        const image = ctx.getImageData(0, 0, target, target);
        workerBusy = true;
        worker.postMessage({ id: frameId++, buf: image.data.buffer, w: target, h: target }, [image.data.buffer]);
      }
      schedule();
    };
    const source = video as VideoWithFrames;
    if (source.requestVideoFrameCallback) source.requestVideoFrameCallback(next);
    else requestAnimationFrame(next);
  };
  schedule();
}

function healthLoop(gen: number): void {
  const tick = () => {
    if (!receiveRunning || gen !== generation || completed) return;
    if (
      decoder &&
      performance.now() - receiverLastDecodedAt > 2500 &&
      performance.now() - receiverLastCommandAt > 1800
    ) {
      receiverLastCommandAt = performance.now();
      void emitTone("slower");
    }
    window.setTimeout(tick, 500);
  };
  tick();
}

async function startReceiver(): Promise<void> {
  if (receiveRunning) {
    stopReceiver(true);
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Camera APIs are unavailable in this browser.", true);
    return;
  }
  const gen = ++generation;
  startReceive.disabled = true;
  setStatus("Opening the camera and preparing the speaker feedback channel…");
  try {
    camera = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 960 },
        frameRate: { ideal: 30 },
      },
    });
    if (gen !== generation) return;
    video.srcObject = camera;
    await video.play();
    audio = new AudioContext({ latencyHint: "interactive" });
    await audio.resume();
    worker = new Worker(new URL("../receive/worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data as { id: number; bytes: Uint8Array | null };
      if (message.id === -1) return;
      workerBusy = false;
      if (message.bytes) void onDecoded(message.bytes);
    };
    decoder = null;
    receiverHeader = null;
    receiverIdentity = "";
    receiverFrames = 0;
    receiverLastFrames = 0;
    receiverLastSampleAt = performance.now();
    receiverLastCommandAt = 0;
    receiverLastDecodedAt = performance.now();
    completed = false;
    receiveRunning = true;
    startReceive.disabled = false;
    startReceive.textContent = "Stop receiver";
    profileStat.textContent = "Receiver decides";
    streamStat.textContent = "Searching";
    audioStat.textContent = "Ready to signal";
    setStatus("Point the camera at the sender. Feedback tones are automatic once frames start arriving.");
    captureLoop(gen);
    healthLoop(gen);
    await requestScreenWakeLock();
  } catch (error) {
    stopReceiver(false);
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function stopReceiverCapture(): void {
  camera?.getTracks().forEach((track) => track.stop());
  camera = null;
  video.pause();
  video.srcObject = null;
  worker?.terminate();
  worker = null;
  workerBusy = false;
  receiveRunning = false;
  startReceive.disabled = false;
  startReceive.textContent = "Start camera + feedback";
}

function stopReceiver(userInitiated: boolean): void {
  generation++;
  stopReceiverCapture();
  void audio?.close();
  audio = null;
  decoder = null;
  receiverHeader = null;
  receiverIdentity = "";
  completed = false;
  streamStat.textContent = "Idle";
  audioStat.textContent = "Idle";
  if (userInitiated) {
    progressBar.style.width = "0%";
    progressLabel.textContent = "0% · waiting for optical frames";
    setStatus("Stopped. Start again when the sender is ready.");
  }
}

roleSend.addEventListener("click", () => setRole("send"));
roleReceive.addEventListener("click", () => setRole("receive"));
startSend.addEventListener("click", () => void startSender());
startReceive.addEventListener("click", () => void startReceiver());
drawIdle();
