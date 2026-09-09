import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const devUrl = "http://127.0.0.1:3000";

try {
  const response = await fetch(devUrl, { signal: AbortSignal.timeout(1_000) });
  const html = await response.text();
  if (!response.ok || !html.includes("Stance")) {
    throw new Error(`Port 3000 is occupied by a different application (${response.status}).`);
  }
  console.log(`Reusing the running Stance server at ${devUrl}.`);
  process.exit(0);
} catch (error) {
  if (error instanceof Error && error.message.includes("occupied by a different application")) {
    throw error;
  }
}

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3000"],
  { cwd: projectRoot, stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
