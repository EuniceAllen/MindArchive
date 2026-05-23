// Simple script to generate placeholder PNG icons for MindArchive
// Run with: node scripts/generate-icons.js

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "..", "public", "icons");
mkdirSync(iconsDir, { recursive: true });

// Minimal valid 1x1 white pixel PNG in base64
const BASE64_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

function createMinimalPNG() {
  return Buffer.from(BASE64_PNG, "base64");
}

const sizes = [16, 48, 128];
for (const size of sizes) {
  const filePath = join(iconsDir, `icon-${size}.png`);
  writeFileSync(filePath, createMinimalPNG());
  console.log(`Created ${filePath}`);
}

console.log("Icons generated successfully.");
