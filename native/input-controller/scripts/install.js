const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") {
  console.log("Skipping native input_controller build on non-Windows host.");
  process.exit(0);
}

const result = spawnSync("node-gyp", ["rebuild"], {
  stdio: "inherit",
  shell: true
});

process.exit(result.status ?? 1);
