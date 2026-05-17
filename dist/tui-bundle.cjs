#!/usr/bin/env node

// bin/tui.js
var import_fs = require("fs");
var import_path = require("path");
var import_url = require("url");
var import_module = require("module");
var import_child_process = require("child_process");
var import_meta = {};
var __dir = (0, import_path.dirname)((0, import_url.fileURLToPath)(import_meta.url));
var root = (0, import_path.resolve)(__dir, "..");
var bundle = (0, import_path.resolve)(root, "dist", "tui-bundle.cjs");
var buildScript = (0, import_path.resolve)(root, "scripts", "build-tui.js");
var needsRebuild = !(0, import_fs.existsSync)(bundle) || process.argv.includes("--rebuild");
if (needsRebuild) {
  console.log("Building TUI bundle (first run)...");
  (0, import_child_process.execFileSync)(process.execPath, [buildScript], { stdio: "inherit", cwd: root });
}
(0, import_module.createRequire)(import_meta.url)(bundle);
