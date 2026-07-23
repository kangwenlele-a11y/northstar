import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("worker/bridge-worker.mjs");
const destinationDir = resolve("dist/server");
if (!existsSync(source)) throw new Error("Missing worker/bridge-worker.mjs");
if (!existsSync(resolve("dist/index.html"))) {
  throw new Error("Missing built browser assets. Run Vite before packaging the hosted app.");
}
mkdirSync(destinationDir, { recursive: true });
cpSync(source, resolve(destinationDir, "index.js"));
