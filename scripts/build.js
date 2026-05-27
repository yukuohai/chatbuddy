import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const required = [
  "public/index.html",
  "public/styles.css",
  "public/app.js",
  "public/favicon.ico",
  "public/favicon.svg",
  "src/server.js",
  "src/orchestrator.js",
  "src/llm.js",
  "src/models.js",
  "src/search.js",
  "src/store.js"
];

for (const file of required) {
  if (!existsSync(resolve(file))) {
    console.error(`Missing required file: ${file}`);
    process.exit(1);
  }
}

const filesToCheck = [
  "src/config.js",
  "src/json.js",
  "src/llm.js",
  "src/models.js",
  "src/orchestrator.js",
  "src/prompts.js",
  "src/search.js",
  "src/server.js",
  "src/store.js",
  "public/app.js"
];

for (const file of filesToCheck) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("Build checks passed.");
