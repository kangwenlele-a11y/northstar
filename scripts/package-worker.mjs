import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("worker/bridge-worker.mjs");
const destinationDir = resolve("dist/server");
if (!existsSync(source)) throw new Error("Missing worker/bridge-worker.mjs");
mkdirSync(destinationDir, { recursive: true });
cpSync(source, resolve(destinationDir, "index.js"));
