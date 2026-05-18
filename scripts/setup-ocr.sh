#!/usr/bin/env bash

# ==============================================================================
# Tesseract OCR Resource Setup Script for LinguaKit (Bash Version)
#
# This script automates preparing WebAssembly and language models for offline OCR.
# It requires NO npm or bun:
# - If node_modules is present, it copies assets locally.
# - If node_modules is missing, it downloads them directly from high-speed CDNs.
# ==============================================================================

# ANSI Terminal Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

log() {
  echo -e "${2:-$NC}$1${NC}"
}

log "==================================================" "$YELLOW"
log "🌀 Starting LinguaKit OCR Setup (Bash Script)" "$YELLOW"
log "==================================================" "$YELLOW"

# 1. Resolve target extension directory dynamically
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR=""
CURRENT_DIR="$SCRIPT_DIR"

# Traverse upwards to find the directory containing 'extension/src/common'
while [ "$CURRENT_DIR" != "/" ] && [ -n "$CURRENT_DIR" ]; do
  if [ -d "$CURRENT_DIR/extension/src/common" ]; then
    ROOT_DIR="$CURRENT_DIR"
    break
  fi
  CURRENT_DIR="$(dirname "$CURRENT_DIR")"
done

# Fallback: check current directory
if [ -z "$ROOT_DIR" ]; then
  if [ -d "./extension/src/common" ]; then
    ROOT_DIR="$(pwd)"
  fi
fi

if [ -z "$ROOT_DIR" ]; then
  log "✗ Error: Could not locate the extension directory containing 'extension/src/common'." "$RED"
  log "Please make sure to run this script from inside the project directory tree." "$YELLOW"
  exit 1
fi

TESSERACT_DEST_DIR="$ROOT_DIR/extension/src/common/tesseract"
TESSDATA_DEST_DIR="$TESSERACT_DEST_DIR/tessdata"

# Ensure target directories exist
mkdir -p "$TESSDATA_DEST_DIR"
log "✓ Verified target directories at extension/src/common/tesseract/" "$GREEN"

# 2. Check local source folders (installed via bun/npm install)
TESSERACT_JS_SRC="$ROOT_DIR/node_modules/tesseract.js/dist"
TESSERACT_CORE_SRC="$ROOT_DIR/node_modules/tesseract.js-core"

USE_LOCAL=false
if [ -d "$TESSERACT_JS_SRC" ] && [ -d "$TESSERACT_CORE_SRC" ]; then
  USE_LOCAL=true
  log "📦 Found local node_modules! Using offline copy mode." "$GREEN"
else
  log "🌐 node_modules not found. Running in standalone CDN download mode." "$CYAN"
fi

# Helper function to download files via curl or wget
download_file() {
  local url="$1"
  local dest="$2"
  local filename="$3"

  log "Downloading $filename from CDN..." "$CYAN"
  if command -v curl >/dev/null 2>&1; then
    curl -L -s -f -o "$dest" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$dest" "$url"
  else
    log "✗ Error: Neither curl nor wget is installed. Please install curl or wget." "$RED"
    exit 1
  fi

  if [ $? -ne 0 ] || [ ! -s "$dest" ]; then
    log "✗ Failed to download $filename" "$RED"
    exit 1
  fi
  log "✓ Successfully downloaded: $filename" "$GREEN"
}

# Helper function to copy files locally
copy_file() {
  local src="$1"
  local dest="$2"
  local filename="$3"

  cp "$src" "$dest"
  if [ $? -ne 0 ]; then
    log "✗ Failed to copy $filename from node_modules" "$RED"
    exit 1
  fi
  log "✓ Copied: $filename" "$GRAY"
}

# ==============================================================================
# Step 1: Process Tesseract.js libraries (tesseract.min.js, worker.min.js)
# ==============================================================================
log "\n📦 Step 1: Processing Tesseract.js libraries..." "$CYAN"
TESSERACT_JS_FILES=("tesseract.min.js" "worker.min.js")

for file in "${TESSERACT_JS_FILES[@]}"; do
  dest_file="$TESSERACT_DEST_DIR/$file"
  if [ "$USE_LOCAL" = true ]; then
    copy_file "$TESSERACT_JS_SRC/$file" "$dest_file" "$file"
  else
    download_file "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/$file" "$dest_file" "$file"
  fi
done

# ==============================================================================
# Step 2: Process WebAssembly Cores (18 core files)
# ==============================================================================
log "\n⚙️ Step 2: Processing WebAssembly cores..." "$CYAN"
CORE_FILES=(
  "tesseract-core.js"
  "tesseract-core.wasm"
  "tesseract-core.wasm.js"
  "tesseract-core-lstm.js"
  "tesseract-core-lstm.wasm"
  "tesseract-core-lstm.wasm.js"
  "tesseract-core-simd.js"
  "tesseract-core-simd.wasm"
  "tesseract-core-simd.wasm.js"
  "tesseract-core-simd-lstm.js"
  "tesseract-core-simd-lstm.wasm"
  "tesseract-core-simd-lstm.wasm.js"
  "tesseract-core-relaxedsimd.js"
  "tesseract-core-relaxedsimd.wasm"
  "tesseract-core-relaxedsimd.wasm.js"
  "tesseract-core-relaxedsimd-lstm.js"
  "tesseract-core-relaxedsimd-lstm.wasm"
  "tesseract-core-relaxedsimd-lstm.wasm.js"
)

if [ "$USE_LOCAL" = true ]; then
  for file in "${CORE_FILES[@]}"; do
    copy_file "$TESSERACT_CORE_SRC/$file" "$TESSERACT_DEST_DIR/$file" "$file"
  done
  log "✓ Copied all 18 WebAssembly core files." "$GREEN"
else
  for file in "${CORE_FILES[@]}"; do
    dest_file="$TESSERACT_DEST_DIR/$file"
    # Skip download if already exists (WASM cores are static)
    if [ -f "$dest_file" ] && [ -s "$dest_file" ]; then
      log "✓ WebAssembly core $file already exists. Skipping." "$GRAY"
    else
      download_file "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0/$file" "$dest_file" "$file"
    fi
  done
  log "✓ Loaded all 18 WebAssembly core files." "$GREEN"
fi

# ==============================================================================
# Step 3: Fetch language models from high-speed Project Naptha CDN
# ==============================================================================
log "\n🌐 Step 3: Fetching language models..." "$CYAN"
LANG_MODELS=(
  "eng.traineddata.gz"
  "vie.traineddata.gz"
  "jpn.traineddata.gz"
)

for model in "${LANG_MODELS[@]}"; do
  dest_file="$TESSDATA_DEST_DIR/$model"
  
  # Avoid redundant heavy downloads
  if [ -f "$dest_file" ]; then
    filesize=$(wc -c < "$dest_file" 2>/dev/null | tr -d ' ')
    # Check if file size is greater than 1MB (1048576 bytes)
    if [ -n "$filesize" ] && [ "$filesize" -gt 1048576 ]; then
      log "✓ Language model $model already exists. Skipping download." "$GREEN"
      continue
    fi
  fi

  download_file "https://tessdata.projectnaptha.com/4.0.0/$model" "$dest_file" "$model"
done

log "\n==================================================" "$GREEN"
log "🎉 LinguaKit OCR Setup Completed Successfully!" "$GREEN"
log "Assets fully populated at: extension/src/common/tesseract/" "$GREEN"
log "==================================================" "$GREEN"
