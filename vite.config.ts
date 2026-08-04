import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { viteSingleFile } from "vite-plugin-singlefile";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAX_FILE_LABEL } from "./shared/protocol";
import { MAX_SNIPPET_LABEL } from "./shared/snippet";
import {
  DEFAULT_FRAME_BYTES,
  DEFAULT_TX_FPS,
  FRAME_BYTES_OPTIONS,
  TX_FPS_OPTIONS,
} from "./shared/send-settings";
import { htmlTokens } from "./build/html-tokens";
import { inlineZxingWasm } from "./build/inline-zxing-wasm";
import { useInlineVariants } from "./build/use-inline-variants";
import { rewriteStandaloneLinks } from "./build/rewrite-standalone-links";
import { standaloneCsp } from "./build/standalone-csp";
import { emitAs } from "./build/emit-as";
import { rootPwaHead } from "./build/root-pwa-head";
import { licenseBanner } from "./build/license-banner";

// Where the site is published, used only to make social-card URLs absolute.
const SITE_URL = process.env.VITE_SITE_URL ?? "https://itzharold.github.io/optical-voice/";

// HTTPS always: camera and microphone access require a secure context on LAN devices.
// Modes:
//   (default)           the site — home, file tools, and live optical talk
//   demo                sender locked to the bundled payloads
//   standalone-send     one self-contained decimen-sender.html
//   standalone-receive  one self-contained decimen-receiver.html

const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as {
  version: string;
};

function buildId(): string {
  const git = (cmd: string) =>
    execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  try {
    const hash = git("git rev-parse --short HEAD");
    return git("git status --porcelain").length > 0 ? `${hash}-dirty` : hash;
  } catch {
    return "unknown";
  }
}

const selectOptions = (values: readonly number[], selected: number) =>
  values
    .map((v) => (v === selected ? `<option selected>${v}</option>` : `<option>${v}</option>`))
    .join("");

const TOKENS = {
  MAX_FILE_LABEL,
  MAX_SNIPPET_LABEL,
  SITE_URL,
  OG_IMAGE: new URL("og.png", SITE_URL).href,
  TX_FPS_OPTIONS: selectOptions(TX_FPS_OPTIONS, DEFAULT_TX_FPS),
  FRAME_BYTES_OPTIONS: selectOptions(FRAME_BYTES_OPTIONS, DEFAULT_FRAME_BYTES),
  APP_VERSION: pkg.version,
  BUILD_ID: buildId(),
};

export default defineConfig(({ mode }) => {
  const standalone = mode === "standalone-send" || mode === "standalone-receive";
  const page = mode === "standalone-send" ? "send" : "receive";
  const outDir = "dist-standalone";

  if (standalone) {
    return {
      base: "./",
      publicDir: false,
      plugins: [
        htmlTokens(TOKENS),
        useInlineVariants(__dirname),
        inlineZxingWasm(),
        rewriteStandaloneLinks(page),
        standaloneCsp(page),
        viteSingleFile(),
        licenseBanner(pkg.version),
        emitAs(outDir, `${page}/index.html`, `decimen-${page === "send" ? "sender" : "receiver"}.html`),
      ],
      worker: { format: "iife", plugins: () => [useInlineVariants(__dirname), inlineZxingWasm()] },
      build: {
        outDir,
        emptyOutDir: false,
        assetsInlineLimit: Number.MAX_SAFE_INTEGER,
        rollupOptions: { input: resolve(__dirname, `${page}/index.html`) },
      },
    };
  }

  return {
    base: "./",
    plugins: [
      htmlTokens(TOKENS),
      basicSsl(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: false,
        manifest: {
          name: "Optical Voice",
          short_name: "Optical Voice",
          description:
            "Live voice and file transfer using screens and cameras, with no network path between devices.",
          theme_color: "#070a11",
          background_color: "#070a11",
          display: "standalone",
          start_url: "./",
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          clientsClaim: true,
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          globPatterns: ["**/*.{js,css,html,wasm,png,svg}"],
          runtimeCaching: [
            {
              urlPattern: /\/received-media\//,
              handler: "CacheOnly" as const,
              options: {
                cacheName: "received-media",
                rangeRequests: true,
                matchOptions: { ignoreSearch: true },
              },
            },
          ],
        },
      }),
      rootPwaHead(),
      licenseBanner(pkg.version),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "index.html"),
          send: resolve(__dirname, "send/index.html"),
          receive: resolve(__dirname, "receive/index.html"),
          talk: resolve(__dirname, "talk/index.html"),
        },
      },
    },
    server: { host: true },
    preview: { host: true },
  };
});
