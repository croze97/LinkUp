#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$root/web/dist}"
cargo build --manifest-path "$root/Cargo.toml" --locked --release --target wasm32-unknown-unknown
mkdir -p "$out"
cp "${CARGO_TARGET_DIR:-$root/target}/wasm32-unknown-unknown/release/ld60.wasm" "$out/ld60.wasm"
cp "$root/web/ld60.css" "$root/web/game.html" "$out/"
{
  cat "$root/web/pinball.js" "$root/web/pinball_art.js" "$root/web/micro.js" "$root/web/ld60.js"
  for pair in STAGE1:stage1 MENU:menu TUNI:tuninunininu STAGE2:stage2 STAGESELECT:stageselect; do
    printf 'self.LD60_%s = "%s";\n' "${pair%%:*}" "$(base64 -w0 "$root/web/${pair#*:}.opus")"
  done
} > "$out/ld60.js"
node -e '
const fs = require("fs"), [wasm, js] = process.argv.slice(1);
const have = new Set(WebAssembly.Module.exports(new WebAssembly.Module(fs.readFileSync(wasm))).map(e => e.name));
const list = fs.readFileSync(js, "utf8").match(/for \(const name of \[([^\]]*)\]\) \{\s*if \(typeof wasm\[name\]/);
if (!list) { console.error("build: cannot find the export list in ld60.js"); process.exit(1); }
const missing = [...list[1].matchAll(/"([a-z_]+)"/g)].map(m => m[1]).filter(n => !have.has(n));
if (missing.length) { console.error("build: ld60.wasm lacks " + missing.join(", ") + " (stale build? touch src/lib.rs and rebuild)"); process.exit(1); }
' "$out/ld60.wasm" "$root/web/ld60.js"
