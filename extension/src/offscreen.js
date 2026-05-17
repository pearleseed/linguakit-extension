chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "play-tts") {
    const { text, lang, speed, urlTemplate } = message.payload;
    playTTS(text, lang, speed, urlTemplate)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});

async function playTTS(text, lang, speed = 1, urlTemplate = null) {
  let url;

  if (urlTemplate) {
    // Replace variables
    url = urlTemplate.replace("{text}", encodeURIComponent(text)).replace("{lang}", lang).replace("{speed}", speed);
  } else {
    // Default fallback
    url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&ttsspeed=${speed}&q=${encodeURIComponent(text)}`;
  }

  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.addEventListener("ended", () => resolve(), { once: true });
    audio.addEventListener("error", (_e) => reject(new Error("Audio playback failed")), {
      once: true,
    });
    audio.play().catch(reject);
  });
}
