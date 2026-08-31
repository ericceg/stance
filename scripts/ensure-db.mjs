import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";

const databasePath = resolve(process.cwd(), "prisma", "dev.db");

mkdirSync(dirname(databasePath), { recursive: true });
if (!existsSync(databasePath)) {
  closeSync(openSync(databasePath, "a"));
}
