/**
 * Screen Capture Tool for LinguaKit
 * Handles selecting an area on the screen for OCR.
 */

const DEFAULT_CAPTURE_STRINGS = {
  selectArea: "Select an area to translate",
  dragInstruction: "Drag across text to capture it",
  cancelHint: "Esc to cancel",
  selectionTooSmall: "Selection is too small",
  processingOcr: "Processing OCR...",
  ocrComplete: "OCR complete",
  noTextFound: "No text found",
  captureFailed: "Screen capture failed",
  ocrFailed: "OCR failed",
  cancelled: "Capture cancelled",
};

function isTopFrameForCapture() {
  try {
    return window.top === window;
  } catch {
    return false;
  }
}

class ScreenCaptureTool {
  constructor(strings = {}) {
    this.strings = { ...DEFAULT_CAPTURE_STRINGS, ...strings };
    this.overlay = null;
    this.canvas = null;
    this.ctx = null;
    this.panel = null;
    this.title = null;
    this.subtitle = null;
    this.progress = null;
    this.isDragging = false;
    this.state = "selecting";
    this.startX = 0;
    this.startY = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.onSelectionCallback = null;
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnResize = this.onResize.bind(this);
  }

  start(callback) {
    this.onSelectionCallback = callback;
    this.createOverlay();
    this.addEventListeners();
    this.setState("selecting");
    document.body.style.cursor = "crosshair";
  }

  createOverlay() {
    this.overlay = document.createElement("div");
    this.overlay.id = "bt-capture-overlay";
    this.overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(8, 13, 24, 0.45);
      z-index: 2147483647;
      cursor: crosshair;
      user-select: none;
    `;

    this.canvas = document.createElement("canvas");
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.canvas.style.cssText = "width: 100%; height: 100%; display: block;";
    this.ctx = this.canvas.getContext("2d");
    this.overlay.appendChild(this.canvas);

    this.panel = document.createElement("div");
    this.panel.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      min-width: min(360px, calc(100vw - 32px));
      max-width: calc(100vw - 32px);
      color: #fff;
      background: rgba(10, 15, 28, 0.88);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 10px;
      box-shadow: 0 18px 45px rgba(0, 0, 0, 0.3);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 12px 14px;
      pointer-events: none;
    `;

    this.title = document.createElement("div");
    this.title.style.cssText = "font-size: 14px; font-weight: 650; line-height: 1.3;";

    this.subtitle = document.createElement("div");
    this.subtitle.style.cssText =
      "font-size: 12px; opacity: 0.78; line-height: 1.35; margin-top: 3px;";

    this.progress = document.createElement("div");
    this.progress.style.cssText =
      "font-size: 12px; opacity: 0.88; line-height: 1.35; margin-top: 8px;";

    this.panel.append(this.title, this.subtitle, this.progress);
    this.overlay.appendChild(this.panel);
    document.body.appendChild(this.overlay);
  }

  addEventListeners() {
    this.overlay.addEventListener("mousedown", this.boundOnMouseDown);
    window.addEventListener("mousemove", this.boundOnMouseMove);
    window.addEventListener("mouseup", this.boundOnMouseUp);
    window.addEventListener("keydown", this.boundOnKeyDown, true);
    window.addEventListener("resize", this.boundOnResize);
  }

  removeEventListeners() {
    this.overlay?.removeEventListener("mousedown", this.boundOnMouseDown);
    window.removeEventListener("mousemove", this.boundOnMouseMove);
    window.removeEventListener("mouseup", this.boundOnMouseUp);
    window.removeEventListener("keydown", this.boundOnKeyDown, true);
    window.removeEventListener("resize", this.boundOnResize);
  }

  onMouseDown(e) {
    if (this.state === "processing") return;
    this.isDragging = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.currentX = e.clientX;
    this.currentY = e.clientY;
    this.setState("selecting");
    this.draw();
  }

  onMouseMove(e) {
    if (!this.isDragging) return;
    this.currentX = e.clientX;
    this.currentY = e.clientY;
    this.draw();
  }

  onMouseUp() {
    if (!this.isDragging) return;
    this.isDragging = false;

    const rect = this.getSelectionRect();
    if (rect.width < 8 || rect.height < 8) {
      this.setState("error", this.strings.selectionTooSmall);
      this.draw(rect);
      return;
    }

    this.setState("processing", this.strings.processingOcr);
    this.draw(rect);
    if (this.onSelectionCallback) {
      this.onSelectionCallback(rect);
    }
  }

  onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.cancel();
    }
  }

  onResize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.draw();
  }

  getSelectionRect() {
    return {
      x: Math.min(this.startX, this.currentX),
      y: Math.min(this.startY, this.currentY),
      width: Math.abs(this.startX - this.currentX),
      height: Math.abs(this.startY - this.currentY),
    };
  }

  setState(state, message, progress = null) {
    this.state = state;
    const stateTitle = {
      selecting: this.strings.selectArea,
      processing: this.strings.processingOcr,
      success: this.strings.ocrComplete,
      empty: this.strings.noTextFound,
      error: this.strings.ocrFailed,
      cancelled: this.strings.cancelled,
    };

    this.title.textContent = message || stateTitle[state] || this.strings.selectArea;
    this.subtitle.textContent =
      state === "selecting" ? `${this.strings.dragInstruction} · ${this.strings.cancelHint}` : "";

    if (typeof progress === "number") {
      this.progress.textContent = `${Math.round(progress * 100)}%`;
    } else {
      this.progress.textContent = "";
    }

    this.overlay.dataset.state = state;
  }

  updateStatus(payload = {}) {
    const state = payload.state || "processing";
    this.setState(state, payload.message, payload.progress);
    if (state === "success" || state === "empty" || state === "error") {
      setTimeout(() => this.cleanup(), state === "success" ? 450 : 1400);
    }
  }

  cancel() {
    this.setState("cancelled", this.strings.cancelled);
    chrome.runtime.sendMessage({ type: "capture-cancelled" }).catch(() => {});
    this.cleanup();
  }

  draw(rect = this.isDragging ? this.getSelectionRect() : null) {
    if (!this.ctx) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!rect) return;

    this.ctx.save();
    this.ctx.globalCompositeOperation = "destination-out";
    this.ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    this.ctx.restore();

    this.ctx.save();
    this.ctx.strokeStyle = this.state === "error" ? "#f97316" : "#38bdf8";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    this.ctx.fillStyle = this.ctx.strokeStyle;
    this.ctx.font = "12px system-ui, sans-serif";
    const label = `${Math.round(rect.width)} x ${Math.round(rect.height)}`;
    const labelY = rect.y > 18 ? rect.y - 8 : rect.y + rect.height + 18;
    this.ctx.fillText(label, rect.x, labelY);
    this.ctx.restore();
  }

  cleanup() {
    this.removeEventListeners();
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    document.body.style.cursor = "";
    if (window.__linguakitScreenCaptureTool === this) {
      window.__linguakitScreenCaptureTool = null;
    }
  }
}

/*
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isTopFrameForCapture()) {
    return false;
  }

  if (message.type === "start-capture") {
    if (window.__linguakitScreenCaptureTool) {
      window.__linguakitScreenCaptureTool.cleanup();
    }

    const tool = new ScreenCaptureTool(message.payload?.strings);
    window.__linguakitScreenCaptureTool = tool;
    tool.start((rect) => {
      chrome.runtime
        .sendMessage({
          type: "capture-coordinates",
          payload: {
            rect: {
              x: rect.x * window.devicePixelRatio,
              y: rect.y * window.devicePixelRatio,
              width: rect.width * window.devicePixelRatio,
              height: rect.height * window.devicePixelRatio,
            },
          },
        })
        .catch((err) => {
          tool.updateStatus({
            state: "error",
            message: `${tool.strings.captureFailed}: ${err.message || err}`,
          });
        });
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "capture-status") {
    if (window.__linguakitScreenCaptureTool) {
      window.__linguakitScreenCaptureTool.updateStatus(message.payload);
    }
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
*/
