import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("worker/bridge-worker.mjs");
const destinationDir = resolve("dist/server");
if (!existsSync(source)) throw new Error("Missing worker/bridge-worker.mjs");
if (!existsSync(resolve("dist/index.html"))) {
  throw new Error("Missing built browser assets. Run Vite before packaging the hosted app.");
}

const page = readFileSync(resolve("dist/index.html"), "utf8");
const scriptMatch = page.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
const styleMatch = page.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/);
if (!scriptMatch || !styleMatch) throw new Error("Could not locate the built app assets.");

const script = readFileSync(resolve("dist", scriptMatch[1].replace(/^\//, "")), "utf8");
const style = readFileSync(resolve("dist", styleMatch[1].replace(/^\//, "")), "utf8");
const appHtml = page
  .replace(styleMatch[0], `<style>${style}</style>`)
  .replace(scriptMatch[0], `<script type="module">${script}</script>`);

mkdirSync(destinationDir, { recursive: true });
const worker = readFileSync(source, "utf8");
writeFileSync(
  resolve(destinationDir, "index.js"),
  worker.replace("/* __NORTHSTAR_APP_HTML__ */", `const appHtml = ${JSON.stringify(appHtml)};`),
);
