import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

function argument(name) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`Missing required ${name} argument.`);
  return resolve(value);
}

const serverDirectory = argument("--server");
const migrationsDirectory = argument("--migrations");
const databasePath = argument("--database");

mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS "_stance_migrations" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const applied = new Set(
  database.prepare('SELECT "name" FROM "_stance_migrations"').all().map((row) => row.name),
);

const hasPrismaHistory = database.prepare(
  "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'",
).get();

if (hasPrismaHistory) {
  for (const row of database.prepare(
    'SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL',
  ).all()) {
    applied.add(row.migration_name);
  }
}

const recordMigration = database.prepare('INSERT INTO "_stance_migrations" ("name") VALUES (?)');
for (const name of readdirSync(migrationsDirectory).sort()) {
  const migrationPath = join(migrationsDirectory, name, "migration.sql");
  if (applied.has(name) || !existsSync(migrationPath)) continue;

  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(readFileSync(migrationPath, "utf8"));
    recordMigration.run(name);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw new Error(`Could not apply database migration ${name}.`, { cause: error });
  }
}
database.close();

process.env.DATABASE_URL = pathToFileURL(databasePath).href;
process.env.HOSTNAME ??= "127.0.0.1";
process.env.NODE_ENV = "production";
process.chdir(serverDirectory);

await import(pathToFileURL(join(serverDirectory, "server.js")).href);
