import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

console.log("Starting Tauri release build (vite + rustc + bundles)...\n");

const tauriCli = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const run = spawnSync(process.execPath, [tauriCli, "build"], {
  cwd: root,
  stdio: "inherit",
});

if (run.error) {
  console.error(run.error);
  process.exit(1);
}
if (run.signal) {
  console.error(`Build stopped (signal: ${run.signal})`);
  process.exit(1);
}
if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

const releaseDir = join(root, "src-tauri", "target", "release");
const appExe = join(releaseDir, "solitaire.exe");

function walkBundleExes(dir, acc) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkBundleExes(p, acc);
    else if (name.endsWith(".exe") || name.endsWith(".msi")) acc.push(p);
  }
}

const bundleExes = [];
walkBundleExes(join(releaseDir, "bundle"), bundleExes);

console.log("");
console.log("Build finished. Output files:");
console.log("");

if (existsSync(appExe)) {
  console.log(`  Application (.exe): ${resolve(appExe)}`);
} else {
  console.log(`  (Expected app exe not found at ${resolve(appExe)})`);
}

if (bundleExes.length > 0) {
  for (const p of bundleExes.sort()) {
    console.log(`  Bundle:             ${resolve(p)}`);
  }
} else {
  console.log("  (No installer bundles under target/release/bundle — check tauri bundle config.)");
}

console.log("");
