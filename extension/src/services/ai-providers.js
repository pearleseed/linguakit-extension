/**
 * Default system prompt for translation with Markdown preservation
 */
const DEFAULT_SYSTEM_PROMPT = `You are a professional translator. Translate the user's text from {sourceLang} to {targetLang}.

RULES:
1. Keep all Markdown symbols (**, _, ~~, \`, \`\`\`, -, <u>) exactly as they are.
2. DO NOT translate content inside backticks (\`...\`) or code blocks (\`\`\`...\`\`\`).
3. Preserve all formatting markers in their original positions.
4. Return ONLY the translated text with preserved Markdown.`;

const SUMMARIZE_PROMPT = `You are a professional editor. Summarize the user's text into a concise and clear summary. 
Maintain the same language as the source. 
Return ONLY the summary text.`;

const IMPROVE_PROMPT = `You are a professional writing assistant. Improve the grammar, clarity, and flow of the user's text. 
Maintain the original meaning and language. 
Return ONLY the improved text.`;

const TONE_PROFESSIONAL_PROMPT = `You are a professional communicator. Rewrite the user's text to be professional, polite, and formal. 
Maintain the same language. 
Return ONLY the rewritten text.`;

const TONE_CASUAL_PROMPT = `You are a friendly companion. Rewrite the user's text to be casual, friendly, and conversational. 
Maintain the same language. 
Return ONLY the rewritten text.`;

/**
 * Base class for Translation Providers
 */
class TranslationProvider {
  constructor(config, customPrompt = "") {
    this.config = config;
    this.customPrompt = customPrompt;
  }

  /**
   * Build the complete system prompt with custom additions
   */
  buildSystemPrompt(sourceLang, targetLang, task = "translate") {
    let basePrompt = "";

    switch (task) {
      case "summarize":
        basePrompt = SUMMARIZE_PROMPT;
        break;
      case "improve":
        basePrompt = IMPROVE_PROMPT;
        break;
      case "tone-professional":
        basePrompt = TONE_PROFESSIONAL_PROMPT;
        break;
      case "tone-casual":
        basePrompt = TONE_CASUAL_PROMPT;
        break;
      default:
        basePrompt = DEFAULT_SYSTEM_PROMPT.replace("{sourceLang}", sourceLang).replace(
          "{targetLang}",
          targetLang,
        );
    }

    if (this.customPrompt && this.customPrompt.trim()) {
      return `${basePrompt}\n\nAdditional context: ${this.customPrompt.trim()}`;
    }

    return basePrompt;
  }

  async translate(_text, _sourceLang, _targetLang, _task = "translate") {
    throw new Error("Not implemented");
  }
}

/**
 * OpenAI Provider
 */
class OpenAIProvider extends TranslationProvider {
  async translate(text, sourceLang, targetLang, task = "translate") {
    const { username, password, model, baseUrl } = this.config;

    if (!username || !password || !model || !baseUrl) {
      throw new Error("Missing OpenAI configuration (Endpoint, Model, Username, or Password)");
    }

    // Basic Auth encoding
    const auth = btoa(`${username}:${password}`);
    const systemPrompt = this.buildSystemPrompt(sourceLang, targetLang, task);

    // Construct URL: baseUrl + model
    const url = baseUrl.endsWith("/") ? `${baseUrl}${model}` : `${baseUrl}/${model}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        system_prompt: systemPrompt,
        user_input: text,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API Error (Status: ${response.status})`);
    }

    const data = await response.json();
    // Use system_repsonse as specified by user
    return data.system_repsonse?.trim();
  }
}

/**
 * Google Translate Provider (Free, no API key required)
 */
class GoogleTranslateProvider extends TranslationProvider {
  async translate(text, sourceLang, targetLang, task = "translate") {
    // Google Translate is only for translation.
    // If task is not translate, we should warn or handle it.
    if (task !== "translate") {
      throw new Error(
        `Google Translate does not support task: ${task}. Please use an AI provider.`,
      );
    }

    // Google Translate uses ISO 639-1 codes, 'auto' for auto-detect
    const sl = sourceLang === "auto" ? "auto" : sourceLang.toLowerCase();
    const tl = targetLang.toLowerCase();

    // Encode the text for URL
    const encodedText = encodeURIComponent(text);

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&dj=1&sl=${sl}&tl=${tl}&q=${encodedText}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Google Translate API Error: " + response.statusText);
    }

    const data = await response.json();

    // Parse the response
    // Response contains a "sentences" array where each item has "trans" field
    if (!data.sentences || !Array.isArray(data.sentences)) {
      throw new Error("Invalid response from Google Translate");
    }

    // Concatenate all translation segments
    const translation = data.sentences
      .map((sentence) => sentence.trans)
      .filter((trans) => trans) // Filter out any undefined/null values
      .join("");

    return translation;
  }
}

export class AIProviderService {
  constructor(settings) {
    this.settings = settings;
    this.activeProviderId = settings.activeProviderId || "google-translate";
    this.providers = settings.providers || [];
    this.customPrompt = settings.customPrompt || "";

    this.activeProvider = this.providers.find((p) => p.id === this.activeProviderId) ||
      this.providers.find((p) => p.id === "google-translate") ||
      this.providers[0] || { type: "google-translate", config: {} };
  }

  getProvider(providerId) {
    let providerData = this.activeProvider;

    if (providerId) {
      providerData = this.providers.find((p) => p.id === providerId) || this.activeProvider;
    }

    const { type, config } = providerData;

    switch (type) {
      case "openai":
        return new OpenAIProvider(config, this.customPrompt);
      case "google-translate":
        return new GoogleTranslateProvider(config, this.customPrompt);
      default:
        throw new Error(`Unsupported provider type: ${type}`);
    }
  }

  async translate(text, sourceLang, targetLang, providerId, task = "translate") {
    const provider = this.getProvider(providerId);
    const translation = await provider.translate(text, sourceLang, targetLang, task);

    // Find the actual provider used for metadata
    const providerData = providerId
      ? this.providers.find((p) => p.id === providerId) || this.activeProvider
      : this.activeProvider;

    return {
      translation,
      providerName: providerData.name,
      providerType: providerData.type,
    };
  }
}
