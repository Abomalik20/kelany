#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// No-op on Windows (chmod semantics differ and CI runs on Linux)
if (process.platform === 'win32') process.exit(0);

const binDir = path.resolve(process.cwd(), 'node_modules', '.bin');
try {
  const entries = fs.readdirSync(binDir);
  for (const e of entries) {
    try {
      fs.chmodSync(path.join(binDir, e), 0o755);
    } catch (err) {
      // ignore individual failures
    }
  }
  // ensure react-scripts executable is writable if present
  try {
    fs.chmodSync(path.resolve(process.cwd(), 'node_modules', 'react-scripts', 'bin', 'react-scripts.js'), 0o755);
  } catch (e) {}
} catch (err) {
  // directory missing or unreadable; nothing to do
}
