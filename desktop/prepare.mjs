import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const standaloneDir = join(projectRoot, ".next", "standalone");

if (Number.parseInt(process.versions.node, 10) < 22) {
  throw new Error("Desktop builds require Node.js 22 or newer.");
}

execFileSync("npm", ["run", "build"], { cwd: projectRoot, stdio: "inherit" });

if (!existsSync(standaloneDir)) {
  throw new Error("Next.js did not produce .next/standalone.");
}

const staticSource = join(projectRoot, ".next", "static");
const staticDestination = join(standaloneDir, ".next", "static");
rmSync(staticDestination, { force: true, recursive: true });
cpSync(staticSource, staticDestination, { recursive: true });

const publicSource = join(projectRoot, "public");
const publicDestination = join(standaloneDir, "public");
if (existsSync(publicSource)) {
  rmSync(publicDestination, { force: true, recursive: true });
  cpSync(publicSource, publicDestination, { recursive: true });
}

const targetTriple = process.env.TAURI_ENV_TARGET_TRIPLE
  ?? execFileSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" }).trim();
const extension = targetTriple.includes("windows") ? ".exe" : "";
const binaryDirectory = join(projectRoot, "src-tauri", "binaries");
const binaryPath = join(binaryDirectory, `stance-node-${targetTriple}${extension}`);
mkdirSync(binaryDirectory, { recursive: true });
copyFileSync(process.execPath, binaryPath);
chmodSync(binaryPath, 0o755);

console.log(`Prepared the desktop server and Node sidecar for ${targetTriple}.`);
