# 🌐 LinguaKit

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/namle/linguakit-extension)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://developer.chrome.com/docs/extensions)

**LinguaKit** is a powerful, AI-driven browser extension designed to transform your reading and writing experience. It brings instant, state-of-the-art translation and text analysis directly to your browser, seamlessly integrating with any website you visit.

---

## ✨ Features

- 🚀 **Instant Translation**: Translate text directly within input fields or anywhere on the web.
- 🧠 **Smart Selection Tools**:
  - **Summarize**: Get the gist of long articles instantly.
  - **Improve**: Refine your writing for better clarity and impact.
  - **Tone Adjustment**: Change the tone of your text (Professional, Casual, etc.).
- 🕒 **History & Favorites**: Keep track of your previous translations and save important ones.
- 🎨 **Premium UI/UX**: A modern, sleek interface with glassmorphism effects and smooth micro-animations.
- 🔐 **Custom AI Providers**: Support for custom OpenAI-compatible endpoints with secure authentication.
- 📸 **OCR Screen Capture**: Extract and translate text from any part of your screen.
- 🔊 **Text-to-Speech**: Listen to translations with high-quality TTS engines.
- 🇯🇵🇻🇳🇺🇸 **Multilingual Support**: Fully optimized for English, Japanese, and Vietnamese.

---

## 🛠 Tech Stack

- **Core**: HTML5, Vanilla JavaScript (ES6+)
- **Styling**: Modern CSS3 (Variables, Flexbox, Grid)
- **Runtime**: [Bun](https://bun.sh/) for package management
- **Quality**: [Oxlint](https://github.com/oxc-project/oxc) & [Oxfmt](https://github.com/oxc-project/oxc) for high-performance linting and formatting

---

## 🚀 Setup & Installation

### 1. Prerequisite

- Ensure you have [Bun](https://bun.sh/) installed for development tools.
- A Chromium-based browser (Chrome, Brave, Edge, etc.).

### 2. Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/namle/linguakit-extension.git
    cd linguakit-extension
    ```

2.  **Install dependencies** (optional, for dev tools):
    ```bash
    bun install
    ```

### 3. Load in Browser

1.  Open your browser and navigate to `chrome://extensions/`.
2.  Enable **Developer mode** (toggle in the top right).
3.  Click **Load unpacked** and select the `extension` folder within this repository.

---

## ⚙️ Configuration

1.  Open the LinguaKit popup by clicking the extension icon.
2.  Navigate to the **AI Provider** tab.
3.  Add your AI provider details (OpenAI-compatible endpoints supported).
4.  Configure your **Native** and **Target** languages in the **General** tab.

---

## 👨‍💻 Development

### Project Structure

- `extension/`: The core extension source code.
  - `manifest.json`: Extension manifest and permissions.
  - `src/`: JavaScript implementation logic.
    - `background.js`: Service worker for API orchestration.
    - `content-script.js`: Main logic for UI injection and page interaction.
    - `content-script-capture.js`: Screen selection and OCR logic.
    - `popup.js`: Extension popup management.
    - `offscreen.js`: Offscreen document for heavy processing (OCR).
    - `services/`: Specialized modules (AI, TTS, Formatting).
    - `common/`: Shared utilities, i18n, and language mapping.
  - `assets/`: Static resources (`icons/`, `styles/`).
  - `pages/`: HTML views for popup and offscreen.
- `package.json`: Project metadata and development scripts.
- `bun.lock`: Dependency lockfile.

### Scripts

- `bun run lint`: Run high-performance linting.
- `bun run format`: Automatically format the codebase.

---

<p align="center">
  Made with ❤️ for better web accessibility.
</p>
