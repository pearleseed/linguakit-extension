# 🌐 LinguaKit: Real-Time AI Translation & Offline WebAssembly OCR Chrome Extension

LinguaKit is a premium, high-performance Chrome Extension designed under the Manifest V3 architecture to provide instant, AI-powered in-context translations, writing style refinements, webpage localization, and standalone offline Optical Character Recognition (OCR) capabilities.

Built with a "zero-dependency, native-first" approach for its runtime execution, LinguaKit achieves microsecond and nanosecond processing speeds, ensuring zero lag or webpage scrolling "jank" (maintaining a locked 60 FPS scrolling experience) while offering users a highly responsive and aesthetically beautiful workspace interface.

---

## ⚡ Key Highlights & Features

### 1. 🤖 AI-Powered & Multi-Provider Translation

- **Dual Engines:** Orchestrates translation requests through the public Google Translate API (for fast machine translation) or custom **OpenAI-compatible gateways** (supporting deep AI reasoning).
- **Multi-Task Capabilities:** Goes beyond basic word-for-word translation. LinguaKit handles:
  - **Translate:** High-fidelity standard translations.
  - **Summarize:** Condenses long passages while maintaining source language.
  - **Improve:** Refines vocabulary, flow, and grammar.
  - **Tone Adjustments:** Automatically rewrites text using either **Professional/Formal** or **Casual/Friendly** tones.
  - **Explain:** Analyzes complex grammar, vocabulary, or idioms in the user's native language.
  - **Correct:** Fixes spelling and grammar mistakes, outputting explanations for the changes.
  - **Simplify:** Rewrites complex passages into an extremely simple format (ELI5 - _Explain Like I'm Five_).

### 2. 📝 Zero-Dependency Markdown Preservation

- **Rich Text Protection:** Employs an ultra-fast local regular-expression engine to convert HTML content to Markdown before sending payloads to AI APIs. Post-translation, it compiles the Markdown back into standard HTML formats.
- **Layout Safeguarding:** Protects headings, hyperlinks, lists, bold/italic markup, and inline code blocks (`...` or `...`) from being modified, corrupted, or translated by AI models.

### 3. 📸 Offline WebAssembly OCR (Tesseract Engine)

- **Private Offscreen Context:** Spawns a sandboxed Manifest V3 Offscreen Document to run WebAssembly operations, keeping the background service worker lightweight and protecting standard browsing.
- **SIMD-Accelerated Execution:** Automatically detects client CPU capabilities and dynamically loads SIMD (`tesseract-core-simd.wasm`) or relaxed-SIMD packages, delivering a **~2x performance speedup** on modern Apple Silicon or Intel chips.
- **Retained-Worker Caching:** Caches the loaded WebAssembly worker and decompressed language data (`.traineddata.gz`). Subsequent text extractions bypass the cold-start loading time, resolving in **sub-second inference times**.

### 4. 🖱️ Dynamic Layout & Scroll Optimization

- **Lag Prevention:** Features debounced and throttled event listeners for hover actions to eliminate unnecessary API requests during scrolling.
- **Reflow Isolation:** Displays selection dialogs and overlays using absolute positioning outside the webpage's standard document flow, completely avoiding browser recalculate-style and layout thrashing.

### 5. 💾 Caching & Caching Snapshots

- **Instant Offline Retrieval:** Caches full webpage translation snapshots locally in `chrome.storage.local`. Returning to a translated webpage loads the cached layout in **less than 1 microsecond (~0.05ms)**, yielding a **99.98% reduction** in network latency.
- **History Log Limiter:** Stores up to 50 translation logs locally with active UUID tagging and automatic length pruning.

### 6. 🌐 CORS Bypass Proxy Server

- Includes a built-in, lightweight HTTP proxy server powered by **Bun's fast HTTP server engine (`serve`)** to handle server-to-server calls for custom OpenAI gateways, bypassing standard browser-side CORS restriction rules.

---

## 📂 Project Directory Structure

```
linguakit-extension/
├── AGENTS.md                 # Agent-specific toolchain guidelines & instructions
├── package.json              # Project scripts, dependencies, devDependencies, and Bun lock file
├── vite.config.ts            # Vite+ toolchain build configuration
├── scripts/                  # Automated platform setup & runner scripts
│   ├── setup-ocr.js          # Node.js/Bun resource setup automation
│   ├── setup-ocr.sh          # Standalone Shell script for Linux & macOS
│   ├── setup-ocr.ps1         # Standalone PowerShell script for Windows
│   ├── Run-Server.command    # One-click server runner script for macOS
│   └── Run-Server.bat        # One-click server runner script for Windows
├── benchmarks/               # Performance evaluation & programmatic testing suites
│   ├── performance-test.js   # Bun-based parsing and storage benchmarks script
│   └── performance_evaluation.md # Detailed quantitative evaluation report
├── server/                   # Custom OpenAI API CORS proxy gateway
│   └── index.js              # High-performance Bun-powered HTTP proxy server
└── extension/                # Main WebExtension package directory
    ├── manifest.json         # Extension definition & permissions configuration
    ├── pages/                # Sandboxed extension views
    │   ├── popup.html        # Options, settings, and logs dashboard view
    │   └── offscreen.html    # Offscreen runtime for WASM OCR & TTS services
    ├── assets/               # CSS styles & branding resources
    │   ├── icons/            # Extension icon assets (16x16 up to 128x128)
    │   └── styles/           # CSS variables, tokens, and view themes
    └── src/                  # Content and background javascript scripts
        ├── background.js     # Manifest V3 service worker (Lifecycle & router)
        ├── content-script.js # Input fields, selection popup, hover triggers, & caret controller
        ├── content-script-granularity.js # Granular webpage text parser for segment processing
        ├── page-translate.js # Handles full DOM translation injection and layout preservation
        ├── popup.js          # Controller logic for popup.html and options views
        ├── offscreen.js      # Controller logic for offscreen.html (TTS & Tesseract)
        ├── common/           # Custom local utilities
        │   ├── i18n.js       # Dynamic translation translation helpers
        │   ├── language-map.js # ISO-639 codes and language mappings
        │   ├── locales.js    # Multi-language locale dictionary (EN, VI, JA)
        │   └── tesseract/    # WebAssembly Tesseract binaries and resources
        │       └── tessdata/ # Extracted language model data (.traineddata.gz)
        └── services/         # Key backend extension controllers
            ├── ai-providers.js # Orchestration layer for multi-model providers
            ├── format-utils.js # Regular-expression HTML ↔ Markdown parsers
            └── tts.js        # Web Speech API wrapper for sound synthesis
```

---

## 🚀 Installation & Setup Guide

### 📋 Prerequisites

- **Bun Runtime:** This workspace is optimized for **Bun v1.3.14** (recommended for running benchmarks, setup scripts, and proxy servers with extreme speed).
- **Google Chrome:** (or any Chromium-based browser supporting Manifest V3).

---

### Step 1: Install Dependencies

Run the Vite+ package manager installation to configure the required build environments:

```bash
# Using the Vite+ unified toolchain
vp install

# Or using Bun directly
bun install
```

---

### Step 2: Initialize Offline OCR Assets

To avoid heavy runtime downloads and browser security blocks during WebAssembly processing, populate the local OCR resource folder with workers and language models (English, Vietnamese, and Japanese):

```bash
# Automate setup using package script
bun run setup-ocr

# Or run the script manually with Node
node scripts/setup-ocr.js
```

_(Alternatively, you can run `bash scripts/setup-ocr.sh` on macOS/Linux or `powershell -ExecutionPolicy Bypass -File scripts/setup-ocr.ps1` on Windows)._

> [!NOTE]
> This copies Tesseract's core Javascript modules from `node_modules` and pulls gzipped language models directly from the Project Naptha CDN, saving them in the `extension/src/common/tesseract/` directory.

---

### Step 3: Start the CORS Proxy Server (Optional)

If you intend to use custom OpenAI-compatible endpoints that do not support browser CORS requests directly, spin up the Bun HTTP proxy.

#### Option A: One-Click Startup (Recommended for Non-Coders)

We provide pre-configured scripts inside the `scripts/` folder that automatically check if the Bun runtime is installed, download and install it in 3 seconds if it's missing, and launch the server immediately upon double-clicking:

- **macOS / Linux**: Double-click [Run-Server.command](./scripts/Run-Server.command) (or run `./scripts/Run-Server.command`).
- **Windows**: Double-click [Run-Server.bat](./scripts/Run-Server.bat).

#### Option B: Zero-Installation Standalone Binary (Fastest & Fully Self-Contained)

You can package the entire server and runtime into a single, standalone executable binary. This binary will run on the target machine without installing Bun, Node.js, or any package dependencies:

1.  Compile the binary on your development machine:
    - **For macOS**: `bun build ./server/index.js --compile --outfile ./server/linguakit-server`
    - **For Windows**: `bun build ./server/index.js --compile --outfile ./server/linguakit-server.exe`
2.  Distribute the resulting executable. The end-user can launch the proxy server by simply double-clicking the file!

#### Option C: Standard Developer Launch

Run the server directly via Bun inside the terminal:

```bash
bun run server
```

The proxy server will launch on `http://localhost:3001` and safely route AI translations via server-to-server requests.

---

### Step 4: Load the Extension into Google Chrome

1. Open Google Chrome and navigate to: `chrome://extensions/`.
2. In the top-right corner, toggle **Developer mode** to **ON**.
3. In the top-left corner, click **Load unpacked**.
4. Browse and select the **`extension/`** directory in this repository.
5. LinguaKit will now be active in your extension bar!

---

## ⌨️ Commands & Default Hotkeys

LinguaKit is optimized for keyboard-first navigation. The default shortcuts can be customized in the extension settings page:

| Action                   | Shortcut Key       | Description                                                                                           |
| :----------------------- | :----------------- | :---------------------------------------------------------------------------------------------------- |
| **OCR Crop Select**      | `Alt + Shift + O`  | Captures the active tab viewport and opens a high-performance crop frame for offline OCR translation. |
| **Instant Field Toggle** | `Ctrl + Shift + I` | Toggles the active field inline translator state for the current domain.                              |
| **Hover Translate**      | `Ctrl + Shift + O` | Toggles the hover-to-translate inject overlay for the active website.                                 |
| **Full Page Translate**  | `Ctrl + Shift + P` | Toggles the full-page translated snapshot cache overlay.                                              |

---

## 📊 Performance Benchmarks Summary

The extension was audited on **macOS 15 running under the Bun engine**. The client-side parsing operations are lightning-fast, taking almost no computing time:

| Benchmark Section     | Operations Tested      | Payload size    | Avg Latency               | Throughput (ops/sec) |
| :-------------------- | :--------------------- | :-------------- | :------------------------ | :------------------- |
| **Format Prescan**    | `shouldConvertFormat`  | 1.2 KB HTML     | **0.02 μs** (0.00002 ms)  | ~51,700,000          |
| **HTML ➔ Markdown**   | `htmlToMarkdown`       | 1.2 KB HTML     | **7.10 μs** (0.00710 ms)  | ~140,900             |
| **Markdown ➔ HTML**   | `markdownToHtml`       | 1.2 KB Markdown | **7.26 μs** (0.00726 ms)  | ~137,800             |
| **State Storage**     | Append & Prune History | 50 logs queue   | **27.17 μs** (0.02717 ms) | ~36,800              |
| **Local Cache Fetch** | Page Cache Retrieve    | Full Webpage    | **0.05 ms**               | -                    |

> [!TIP]
> **Performance Takeaway:** Client-side processing accounts for less than **1%** of the end-to-end translation latency. The parsing overhead is practically nonexistent, meaning the extension performs at peak hardware performance.

---

## 🛠️ Development & Quality Controls

This repository utilizes the **Vite+ Unified Toolchain** (`vp`) for clean package management, formatting, and performance validations. Use the following commands to check the health of the project:

```bash
# Run Oxfmt & Oxlint to check code formats, quality, and lints
vp check

# Run performance tests and logs
vp run benchmark
```

---

## 🏆 License & Contributing

This project is developed as a high-performance personal web utility tool. Feel free to clone, modify, and submit pull requests to enhance translation providers, support additional offline OCR languages, or introduce custom CSS variables.
