chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "play-tts") {
    const { text, lang, speed, urlTemplate } = message.payload;
    playTTS(text, lang, speed, urlTemplate)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message?.type === "perform-ocr") {
    const { dataUrl, rect, targetTabId } = message.payload;
    performOCR(dataUrl, rect, { targetTabId })
      .then((text) => sendResponse({ ok: true, text }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});

const OCR_LANGUAGES = "eng+vie+jpn";
const OCR_OEM = Tesseract.OEM?.LSTM_ONLY ?? 1;
let ocrWorkerPromise = null;
let ocrTargetTabId = null;
let lastProgressSentAt = 0;

function sendOCRProgress(event) {
  if (!ocrTargetTabId) return;

  const now = Date.now();
  const isComplete = event?.progress >= 1;
  if (!isComplete && now - lastProgressSentAt < 150) return;
  lastProgressSentAt = now;

  chrome.runtime
    .sendMessage({
      type: "ocr-progress",
      payload: {
        targetTabId: ocrTargetTabId,
        status: event?.status || "",
        progress: typeof event?.progress === "number" ? event.progress : null,
      },
    })
    .catch(() => {});
}

async function getOCRWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = Tesseract.createWorker(OCR_LANGUAGES, OCR_OEM, {
      workerPath: chrome.runtime.getURL("src/common/tesseract/worker.min.js"),
      corePath: chrome.runtime.getURL("src/common/tesseract"),
      langPath: chrome.runtime.getURL("src/common/tesseract/tessdata"),
      workerBlobURL: false,
      gzip: false,
      logger: sendOCRProgress,
      errorHandler: (err) => console.error("[OCR]", err),
    });
  }

  return ocrWorkerPromise;
}

async function resetOCRWorker() {
  if (!ocrWorkerPromise) return;

  try {
    const worker = await ocrWorkerPromise;
    await worker.terminate();
  } catch (err) {
    console.warn("[OCR] Worker reset failed:", err);
  } finally {
    ocrWorkerPromise = null;
  }
}

function normalizeRect(rect, image) {
  const source = rect || {};
  const x = Math.max(0, Math.floor(Number(source.x) || 0));
  const y = Math.max(0, Math.floor(Number(source.y) || 0));
  const width = Math.max(1, Math.floor(Number(source.width) || image.naturalWidth || image.width));
  const height = Math.max(
    1,
    Math.floor(Number(source.height) || image.naturalHeight || image.height),
  );
  const maxWidth = Math.max(1, (image.naturalWidth || image.width) - x);
  const maxHeight = Math.max(1, (image.naturalHeight || image.height) - y);

  return {
    x,
    y,
    width: Math.min(width, maxWidth),
    height: Math.min(height, maxHeight),
  };
}

async function performOCR(dataUrl, rect, options = {}) {
  const image = new Image();
  image.src = dataUrl;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("Failed to load image"));
  });

  const cropRect = normalizeRect(rect, image);
  const canvas = document.createElement("canvas");
  canvas.width = cropRect.width;
  canvas.height = cropRect.height;
  const ctx = canvas.getContext("2d");

  // Draw the cropped area
  ctx.drawImage(
    image,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    0,
    0,
    cropRect.width,
    cropRect.height,
  );

  try {
    ocrTargetTabId = options.targetTabId || null;
    lastProgressSentAt = 0;
    const worker = await getOCRWorker();
    const {
      data: { text },
    } = await worker.recognize(canvas);
    return text;
  } catch (err) {
    await resetOCRWorker();
    throw err;
  } finally {
    ocrTargetTabId = null;
  }
}

async function playTTS(text, lang, speed = 1, urlTemplate = null) {
  let url;

  if (urlTemplate) {
    // Replace variables
    url = urlTemplate
      .replace("{text}", encodeURIComponent(text))
      .replace("{lang}", lang)
      .replace("{speed}", speed);
  } else {
    // Default fallback
    url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&ttsspeed=${speed}&q=${encodeURIComponent(text)}`;
  }

  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.onended = () => resolve();
    audio.onerror = (_e) => reject(new Error("Audio playback failed"));
    audio.play().catch(reject);
  });
}
