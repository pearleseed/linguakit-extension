/* eslint-disable no-await-in-loop, no-underscore-dangle */
/**
 * Tesseract OCR Resource Setup Script for LinguaKit.
 *
 * This script automates copying WebAssembly and Worker Javascript files from the local node_modules dependencies
 * (installed via bun install) into the extension's assets, and fetches the compressed language models (English,
 * Vietnamese, Japanese) from the Project Naptha CDN.
 *
 * Usage: bun run setup-ocr or node scripts/setup-ocr.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, "..");
const TESSERACT_DEST_DIR = path.join(ROOT_DIR, "extension", "src", "common", "tesseract");
const TESSDATA_DEST_DIR = path.join(TESSERACT_DEST_DIR, "tessdata");

// Local source paths inside node_modules
const TESSERACT_JS_SRC = path.join(ROOT_DIR, "node_modules", "tesseract.js", "dist");
const TESSERACT_CORE_SRC = path.join(ROOT_DIR, "node_modules", "tesseract.js-core");

// Trained language model CDN paths
const LANG_MODELS = [
  {
    name: "eng.traineddata.gz",
    url: "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz",
  },
  {
    name: "vie.traineddata.gz",
    url: "https://tessdata.projectnaptha.com/4.0.0/vie.traineddata.gz",
  },
  {
    name: "jpn.traineddata.gz",
    url: "https://tessdata.projectnaptha.com/4.0.0/jpn.traineddata.gz",
  },
];

// ANSI Terminal Colors
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

async function downloadFile(url, destPath, filename) {
  log(`Downloading ${filename} from Project Naptha CDN...`, colors.cyan);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    await fs.promises.writeFile(destPath, Buffer.from(arrayBuffer));
    log(`✓ Successfully downloaded and saved: ${filename}`, colors.green);
  } catch (error) {
    log(`✗ Failed to download ${filename}: ${error.message}`, colors.red);
    throw error;
  }
}

async function copyFile(src, dest, filename) {
  try {
    await fs.promises.copyFile(src, dest);
    log(`✓ Copied: ${filename}`, colors.gray);
  } catch (error) {
    log(`✗ Failed to copy ${filename} from ${src}: ${error.message}`, colors.red);
    throw error;
  }
}

async function main() {
  log("==================================================", colors.yellow);
  log("🌀 Starting LinguaKit OCR Setup Script", colors.yellow);
  log("==================================================\n", colors.yellow);

  // 1. Ensure target directories exist
  if (!fs.existsSync(TESSERACT_DEST_DIR)) {
    fs.mkdirSync(TESSERACT_DEST_DIR, { recursive: true });
    log(`Created directory: extension/src/common/tesseract`, colors.green);
  }
  if (!fs.existsSync(TESSDATA_DEST_DIR)) {
    fs.mkdirSync(TESSDATA_DEST_DIR, { recursive: true });
    log(`Created directory: extension/src/common/tesseract/tessdata`, colors.green);
  }

  // 2. Verify source node_modules exist
  if (!fs.existsSync(TESSERACT_JS_SRC) || !fs.existsSync(TESSERACT_CORE_SRC)) {
    log("Error: Local node_modules for Tesseract are missing!", colors.red);
    log('Please run "bun install" first before setting up OCR.', colors.yellow);
    process.exit(1);
  }

  // 3. Copy files from node_modules/tesseract.js/dist/
  log("\n📦 Step 1: Copying Tesseract.js libraries...", colors.cyan);
  const tesseractJsFiles = ["tesseract.min.js", "worker.min.js"];
  for (const filename of tesseractJsFiles) {
    const src = path.join(TESSERACT_JS_SRC, filename);
    const dest = path.join(TESSERACT_DEST_DIR, filename);
    await copyFile(src, dest, filename);
  }

  // 4. Copy WebAssembly files from node_modules/tesseract.js-core/
  log("\n⚙️ Step 2: Copying WebAssembly cores...", colors.cyan);
  try {
    const files = await fs.promises.readdir(TESSERACT_CORE_SRC);
    const coreFiles = files.filter((f) => f.startsWith("tesseract-core"));

    if (coreFiles.length === 0) {
      throw new Error("No core WebAssembly files found in node_modules/tesseract.js-core");
    }

    for (const filename of coreFiles) {
      const src = path.join(TESSERACT_CORE_SRC, filename);
      const dest = path.join(TESSERACT_DEST_DIR, filename);
      await copyFile(src, dest, filename);
    }
    log(`✓ Copied ${coreFiles.length} WebAssembly core files.`, colors.green);
  } catch (error) {
    log(`✗ Error copying core WebAssembly files: ${error.message}`, colors.red);
    process.exit(1);
  }

  // 5. Download training data files
  log("\n🌐 Step 3: Fetching language models...", colors.cyan);
  for (const model of LANG_MODELS) {
    const destPath = path.join(TESSDATA_DEST_DIR, model.name);

    // Check if already exists to avoid redundant heavy downloads
    if (fs.existsSync(destPath)) {
      const stats = await fs.promises.stat(destPath);
      // Ensure file is not 0 bytes or corrupted
      if (stats.size > 1024 * 1024) {
        log(`✓ Language model ${model.name} already exists. Skipping download.`, colors.green);
        continue;
      }
    }

    await downloadFile(model.url, destPath, model.name);
  }

  log("\n==================================================", colors.green);
  log("🎉 LinguaKit OCR Setup Completed Successfully!", colors.green);
  log("Assets fully populated at: extension/src/common/tesseract/", colors.green);
  log("==================================================\n", colors.green);
}

main().catch((err) => {
  log(`\n✗ OCR Setup failed: ${err.message}`, colors.red);
  process.exit(1);
});
