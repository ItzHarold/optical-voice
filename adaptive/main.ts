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
const MARGIN = 4;
const AUDIO_COMMANDS = {
  slower: 1550,
  faster: 1850,
  hold: 2150,
  done: 2450,
} as const;
const COMMAND_DURATION_MS = 180;
const COMMAND_GAP_MS = 120;
const COMMAND_COOLDOWN_MS = 900;

type Role = "send" | "receive";
type Command = keyof typeof AUDIO_COMMANDS;
type VideoWithFrames = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
};

const roleSend = document.getElementById("role-send") as HTMLButtonElement;
const roleReceive = document.getElementById("role-receive") as HTMLButtonElement;
const panelTitle = document.getElementById("panel-title")!;
const senderControls = document.getElementById("sender-controls")!;
const receiverControls = document.getElementById("receiver-controls")!;
const sendStage = document.getElementById("send-stage")!;
const receiveStage = document.getElementById("receive-stage")!;
const fileInput = document.getElementById("file") as HTMLInputElement;
const startSend = document.getElementById("start-send") as HTMLButtonElement;
const startReceive = document.getElementById("start-receive") as HTMLButtonElement;
const qrCanvas = document.getElementById("qr") as HTMLCanvasElement;
const video = document.getElementById("video") as HTMLVideoElement;
const status = document.getElementById("status")!;
const profileStat = document.getElementById("profile-stat")!;
const streamStat = document.getElementById("stream-stat")!;
const audioStat = document.getElementById("audio-stat")!;
const feedbackStat = document.getElementById("feedback-stat")!;
const progressBar = document.getElementById("progress-bar")!;
const progressLabel = document.getElementById("progress-label")!;
const receivedResult = document.getElementById("received-result")!;

let role: Role = "send";
let generation = 0;
let sendRunning = false;
let receiveRunning = false;
let senderProfile = 1;
let senderPayload: Uint8Array | null = null;
let senderName = "";
let senderMime = "application/octet-stream";
let senderSession = 0;
let senderEncoder: LTEncoder | null = null;
let senderHeader: FrameHeader | null = null;
let senderSeq = 0;
let senderProfileGeneration = 0;
let microphoneStream: MediaStream | null = null;
let cameraStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let scanWorker: Worker | null = null;
let workerBusy = false;
let receiverDecoder: LTDecoder | null = null;
let receiverIdentity = "";
let receiverHeader: FrameHeader | null = null;
let receiverFrames = 0;
let receiverLastFrames = 0;
let receiverLastProgressAt = 0;
let receiverLastCommandAt = 0;
let receiverLastDecodedAt = 0;
let receiverCompleted = false;
let lastHeardCommandAt = 0;
let lastHeardCommand: Command | null = null;

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

function stopEverything(): void {
  generation++;
  sendRunning = false;
  receiveRunning = false;
  senderPayload = null;
  senderEncoder = null;
  senderHeader = null;
  microphoneStream?.getTracks().forEach((track) => track.stop());
  cameraStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
  cameraStream = null;
  scanWorker?.terminate();
  scanWorker = null;
  workerBusy = false;
  analyser = null;
  void audioContext?.close();
  audioContext = null;
  video.pause();
  video.srcObject = null;
  receiverDecoder = null;
  receiverHeader = null;
  receiverIdentity = "";
  receiverFrames = 0;
  receiverCompleted = false;
  startSend.textContent = "Start adaptive transfer";
  startReceive.textContent = "Start camera + feedback";
  streamStat.textContent = "Idle";
  audioStat.textContent = "Idle";
  feedbackStat.textContent = "No feedback yet.";
  progressBar.setAttribute("style", "width: 0%");
  progressLabel.textContent = "0% · waiting for optical frames";
  receivedResult.replaceChildren();
}

function setRole(next: Role): void {
  if (next === role) return;
  stopEverything();
  role = next;
  const sending = role === "send";
  roleSend.classList.toggle("active", sending);
  roleReceive.classList.toggle("active", !sending);
  senderControls.hidden = !sending;
  receiverControls.hidden = sending;
  sendStage.hidden = !sending;
  receiveStage.hidden = sending;
  panelTitle.textContent = sending ? "Adaptive sender" : "Adaptive receiver";
  profileStat.textContent = sending ? PROFILES[senderProfile].name : "Receiver decides";
  setStatus(
    sending
      ? "Choose a file, then start. Keep the receiving device close enough to hear feedback tones."
      : "Start the camera, point it at the sender, and this device will send tiny sound commands back automatically.",
  );
}

roleSend.addEventListener("click", () => setRole("send"));
roleReceive.addEventListener("click", () => setRole("receive"));

function rebuildSenderEncoder(profileIndex: number): void {
  if (!senderPayload) return;
  senderProfile = Math.max(0, Math.min(PROFILES.length - 1, profileIndex));
  const profile = PROFILES[senderProfile];
  const blockLen = blockLength(profile.frameBytes);
  senderSession = randomId();
  senderEncoder = new LTEncoder(senderPayload, blockLen, senderSession);
  senderHeader = {
    sessionId: senderSession,
    seq: 0,
    k: senderEncoder.k,
    blockLen,
    totalLen: senderPayload.length,
    payloadFnv: fnv1a(senderPayload),
  };
  senderSeq = 0;
  senderProfileGeneration++;
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

function startQrLoop(gen: number): void {
  let localProfileGeneration = -1;
  let nextAt = performance.now();
  const tick = (now: number) => {
    if (!sendRunning || gen !== generation) return;
    requestAnimationFrame(tick);
    const profile = PROFILES[senderProfile];
    if (localProfileGeneration !== senderProfileGeneration) {
      localProfileGeneration = senderProfileGeneration;
      nextAt = now;
    }
    if (now < nextAt || !senderEncoder || !senderHeader) return;
    const seq = senderSeq++;
    const frame = packFrame({ ...senderHeader, seq }, senderEncoder.encode(seq));
    drawFrame(frame);
    const interval = 1000 / profile.fps;
    nextAt += interval;
    if (now - nextAt > interval * 3) nextAt = now + interval;
  };
  requestAnimationFrame(tick);
}

function closestCommand(frequency: number): Command | null {
  let best: Command | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const [command, tone] of Object.entries(AUDIO_COMMANDS) as [Command, number][]) {
    const delta = Math.abs(tone - frequency);
    if (delta < distance) {
      distance = delta;
      best = command;
    }
  }
  return distance <= 90 ? best : null;
}

function dominantFrequency(analyserNode: AnalyserNode, context: AudioContext): { frequency: number; strength: number } {
  const data = new Float32Array(analyserNode.frequencyBinCount);
  analyserNode.getFloatFrequencyData(data);
  let bestIndex = 0;
  let bestDb = -Infinity;
  const minIndex = Math.floor((1300 * analyserNode.fftSize) / context.sampleRate);
  const maxIndex = Math.min(data.length - 1, Math.ceil((2650 * analyserNode.fftSize) / context.sampleRate));
  for (let index = minIndex; index <= maxIndex; index++) {
    const value = data[index] ?? -Infinity;
    if (value > bestDb) {
      bestDb = value;
      bestIndex = index;
    }
  }
  return {
    frequency: (bestIndex * context.sampleRate) / analyserNode.fftSize,
    strength: bestDb,
  };
}

function applyHeardCommand(command: Command): void {
  const now = performance.now();
  if (lastHeardCommand === command && now - lastHeardCommandAt < COMMAND_COOLDOWN_MS) return;
  lastHeardCommand = command;
  lastHeardCommandAt = now;
  if (command === "slower") {
    rebuildSenderEncoder(senderProfile - 1);
    feedbackStat.textContent = `Receiver asked to slow down → ${PROFILES[senderProfile].name}.`;
  } else if (command === "faster") {
    rebuildSenderEncoder(senderProfile + 1);
    feedbackStat.textContent = `Receiver says the link is healthy → ${PROFILES[senderProfile].name}.`;
  } else if (command === "hold") {
    feedbackStat.textContent = "Receiver asked to hold this profile.";
  } else {
    feedbackStat.textContent = "Receiver verified the file. Transfer stopped.";
    stopSender(false);
  }
}

function listenForFeedback(gen: number): void {
  const loop = () => {
    if (!sendRunning || gen !== generation || !analyser || !audioContext) return;
    const { frequency, strength } = dominantFrequency(analyser, audioContext);
    const command = strength > -48 ? closestCommand(frequency) : null;
    if (command) {
      audioStat.textContent = `${command} · ${Math.round(frequency)} Hz`;
      applyHeardCommand(command);
    } else {
      audioStat.textContent = "Listening";
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
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
    const packed = await packFile(file.name, file.type, new Uint8Array(await file.arrayBuffer()));
    if (gen !== generation) return;
    senderPayload = packed.container;
    senderName = file.name;
    senderMime = file.type || "application/octet-stream";
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    audioContext = new AudioContext({ latencyHint: "interactive" });
    await audioContext.resume();
    const source = audioContext.createMediaStreamSource(microphoneStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.35;
    source.connect(analyser);
    sendRunning = true;
    senderProfile = 1;
    rebuildSenderEncoder(senderProfile);
    startSend.disabled = false;
    startSend.textContent = "Stop transfer";
    setStatus(`Streaming ${senderName}. The microphone is listening only for the receiver's feedback tones.`);
    startQrLoop(gen);
    listenForFeedback(gen);
    await requestScreenWakeLock();
  } catch (error) {
    stopSender(false);
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function stopSender(userInitiated: boolean): void {
  generation++;
  sendRunning = false;
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
  analyser = null;
  void audioContext?.close();
  audioContext = null;
  senderEncoder = null;
  senderHeader = null;
  senderPayload = null;
  startSend.disabled = false;
  startSend.textContent = "Start adaptive transfer";
  streamStat.textContent = "Idle";
  audioStat.textContent = "Idle";
  drawIdle(userInitiated ? "STOPPED" : "COMPLETE");
  if (userInitiated) setStatus("Stopped. Choose a file and start again when ready.");
}

startSend.addEventListener("click", () => void startSender());

async function emitTone(command: Command): Promise<void> {
  if (!audioContext || audioContext.state === "closed") return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = AUDIO_COMMANDS[command];
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.015);
  gain.gain.setValueAtTime(0.16, now + COMMAND_DURATION_MS / 1000 - 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + COMMAND_DURATION_MS / 1000);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + COMMAND_DURATION_MS / 1000 + 0.02);
  audioStat.textContent = `Sent ${command}`;
  feedbackStat.textContent = `Sent “${command}” to the sender over sound.`;
  await new Promise((resolve) => setTimeout(resolve, COMMAND_DURATION_MS + COMMAND_GAP_MS));
}

function chooseReceiverCommand(): Command | null {
  const now = performance.now();
  if (receiverCompleted) return "done";
  if (!receiverDecoder || receiverFrames < 5) return null;
  if (now - receiverLastCommandAt < 1800) return null;
  const framesDelta = receiverFrames - receiverLastFrames;
  const elapsed = Math.max(0.5, (now - receiverLastProgressAt) / 1000);
  const rate = framesDelta / elapsed;
  receiverLastFrames = receiverFrames;
  receiverLastProgressAt = now;
  receiverLastCommandAt = now;
  if (rate < 1.2) return "slower";
  if (rate > 8 && receiverDecoder.framesNew > 14) return "faster";
  return "hold";
}

function updateReceiverProgress(): void {
  if (!receiverDecoder) return;
  const targetFrames = Math.max(receiverDecoder.k + 2, Math.ceil(receiverDecoder.k * 1.18));
  const percent = Math.min(99, (receiverDecoder.framesNew / targetFrames) * 100);
  progressBar.setAttribute("style", `width: ${percent.toFixed(1)}%`);
  progressLabel.textContent = `${percent.toFixed(0)}% · ${receiverDecoder.framesNew} useful frames · ${receiverDecoder.solvedCount}/${receiverDecoder.k} blocks solved`;
}

async function onDecoded(bytes: Uint8Array): Promise<void> {
  const parsed = parseFrame(bytes);
  if (!parsed || receiverCompleted) return;
  receiverLastDecodedAt = performance.now();
  const identity = streamIdentity(parsed.header);
  if (!receiverDecoder || receiverIdentity !== identity) {
    receiverDecoder = new LTDecoder(
      parsed.header.k,
      parsed.header.blockLen,
      parsed.header.sessionId,
      parsed.header.totalLen,
    );
    receiverHeader = parsed.header;
    receiverIdentity = identity;
    receiverFrames = 0;
    receiverLastFrames = 0;
    receiverLastProgressAt = performance.now();
    streamStat.textContent = `Locked · K=${parsed.header.k}`;
  }
  receiverFrames++;
  receiverDecoder.addFrame(parsed.header.seq, parsed.block);
  updateReceiverProgress();
  const command = chooseReceiverCommand();
  if (command) void emitTone(command);
  if (!receiverDecoder.isComplete || !receiverHeader) return;
  const container = receiverDecoder.assemble();
  if (!container || fnv1a(container) !== receiverHeader.payloadFnv) return;
  receiverCompleted = true;
  progressBar.setAttribute("style", "width: 100%");
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
      if (!workerBusy && width && height && scanWorker) {
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
        scanWorker.postMessage({ id: frameId++, buf: image.data.buffer, w: target, h: target }, [image.data.buffer]);
      }
      schedule();
    };
    const source = video as VideoWithFrames;
    if (source.requestVideoFrameCallback) source.requestVideoFrameCallback(next);
    else requestAnimationFrame(next);
  };
  schedule();
}

function receiverHealthLoop(gen: number): void {
  const tick = () => {
    if (!receiveRunning || gen !== generation || receiverCompleted) return;
    const age = performance.now() - receiverLastDecodedAt;
    if (receiverDecoder && age > 2500 && performance.now() - receiverLastCommandAt > 1800) {
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
    setStatus("Camera and microphone APIs are unavailable in this browser.", true);
    return;
  }
  const gen = ++generation;
  startReceive.disabled = true;
  setStatus("Opening the camera and preparing the speaker feedback channel…");
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 960 },
        frameRate: { ideal: 30 },
      },
    });
    if (gen !== generation) return;
    video.srcObject = cameraStream;
    await video.play();
    audioContext = new AudioContext({ latencyHint: "interactive" });
    await audioContext.resume();
    scanWorker = new Worker(new URL("../receive/worker.ts", import.meta.url), { type: "module" });
    scanWorker.onmessage = (event: MessageEvent) => {
      const message = event.data as { id: number; bytes: Uint8Array | null };
      if (message.id === -1) return;
      workerBusy = false;
      if (message.bytes) void onDecoded(message.bytes);
    };
    receiverDecoder = null;
    receiverHeader = null;
    receiverIdentity = "";
    receiverFrames = 0;
    receiverLastFrames = 0;
    receiverLastProgressAt = performance.now();
    receiverLastCommandAt = 0;
    receiverLastDecodedAt = performance.now();
    receiverCompleted = false;
    receiveRunning = true;
    startReceive.disabled = false;
    startReceive.textContent = "Stop receiver";
    profileStat.textContent = "Receiver decides";
    streamStat.textContent = "Searching";
    audioStat.textContent = "Ready to signal";
    setStatus("Point the camera at the sender. Feedback tones are automatic once frames start arriving.");
    captureLoop(gen);
    receiverHealthLoop(gen);
    await requestScreenWakeLock();
  } catch (error) {
    stopReceiver(false);
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function stopReceiverCapture(): void {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  video.pause();
  video.srcObject = null;
  scanWorker?.terminate();
  scanWorker = null;
  workerBusy = false;
  receiveRunning = false;
  startReceive.disabled = false;
  startReceive.textContent = "Start camera + feedback";
}

function stopReceiver(userInitiated: boolean): void {
  generation++;
  stopReceiverCapture();
  void audioContext?.close();
  audioContext = null;
  receiverDecoder = null;
  receiverHeader = null;
  receiverIdentity = "";
  receiverCompleted = false;
  streamStat.textContent = "Idle";
  audioStat.textContent = "Idle";
  if (userInitiated) {
    progressBar.setAttribute("style", "width: 0%");
    progressLabel.textContent = "0% · waiting for optical frames";
    setStatus("Stopped. Start again when the sender is ready.");
  }
}

startReceive.addEventListener("click", () => void startReceiver());

void senderMime;
drawIdle();
