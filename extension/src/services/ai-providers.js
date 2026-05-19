/**
 * LinguaKit AI Translation Provider Orchestration. Defines the translation provider interfaces and individual provider
 * handlers (such as custom OpenAI API integrations and public Google Translate APIs) to support multi-model
 * translation, writing style improvement, summarization, and custom tone conversions.
 *
 * @file Ai-providers.js
 */

/**
 * Standard system instructions used for base translation tasks to protect formatting/Markdown syntax.
 *
 * @constant {string} DEFAULT_SYSTEM_PROMPT
 */
const DEFAULT_SYSTEM_PROMPT = `You are a professional translator. Translate the user's text from {sourceLang} to {targetLang}.

RULES:
1. Keep all Markdown symbols (**, _, ~~, \`, \`\`\`, -, <u>) exactly as they are.
2. DO NOT translate content inside backticks (\`...\`) or code blocks (\`\`\`...\`\`\`).
3. Preserve all formatting markers in their original positions.
4. Return ONLY the translated text with preserved Markdown.`;

/**
 * System prompt to summarize a text block.
 *
 * @constant {string} SUMMARIZE_PROMPT
 */
const SUMMARIZE_PROMPT = `You are a professional editor. Summarize the user's text into a concise and clear summary. 
Maintain the same language as the source. 
Return ONLY the summary text.`;

/**
 * System prompt to refine vocabulary and grammar style.
 *
 * @constant {string} IMPROVE_PROMPT
 */
const IMPROVE_PROMPT = `You are a professional writing assistant. Improve the grammar, clarity, and flow of the user's text. 
Maintain the original meaning and language. 
Return ONLY the improved text.`;

/**
 * System prompt to re-write a message using professional/formal vocabulary.
 *
 * @constant {string} TONE_PROFESSIONAL_PROMPT
 */
const TONE_PROFESSIONAL_PROMPT = `You are a professional communicator. Rewrite the user's text to be professional, polite, and formal. 
Maintain the same language. 
Return ONLY the rewritten text.`;

/**
 * System prompt to re-write a message using casual/informal vocabulary.
 *
 * @constant {string} TONE_CASUAL_PROMPT
 */
const TONE_CASUAL_PROMPT = `You are a friendly companion. Rewrite the user's text to be casual, friendly, and conversational. 
Maintain the same language. 
Return ONLY the rewritten text.`;

/**
 * System prompt to explain vocabulary, grammar, and idioms in the text.
 *
 * @constant {string} EXPLAIN_PROMPT
 */
const EXPLAIN_PROMPT = `You are a helpful language teacher. Analyze the user's text and explain difficult words, grammar structures, or idioms. 
Explain in the target language: {targetLang}. Keep the explanation structured, clear, and easy to read.`;

/**
 * System prompt to correct grammar/spelling and explain what was changed.
 *
 * @constant {string} CORRECT_PROMPT
 */
const CORRECT_PROMPT = `You are an expert editor. Analyze the user's text. Correct any spelling or grammar errors.
First, output the corrected version of the text.
Then, if there were any errors, provide a bulleted list explaining what was corrected and why in the target language: {targetLang}.`;

/**
 * System prompt to simplify complex text (ELI5).
 *
 * @constant {string} SIMPLIFY_PROMPT
 */
const SIMPLIFY_PROMPT = `You are a clear communicator. Rewrite the user's text to be extremely simple, clear, and easy to understand (as if explaining to a child). 
Maintain the same language as the source text. 
Return ONLY the simplified text.`;

/**
 * Abstract base class representing a generic translation engine.
 *
 * @class TranslationProvider
 */
class TranslationProvider {
  /**
   * @class
   * @param {Object} config - Configuration settings for the provider (API keys, models, etc.).
   * @param {string} [customPrompt=""] - Optional user-defined system prompt overrides. Default is `""`
   */
  constructor(config, customPrompt = "") {
    this.config = config;
    this.customPrompt = customPrompt;
  }

  /**
   * Constructs the complete system prompt instructions matching the chosen execution task. Append any custom prompts
   * configured by the user.
   *
   * @function buildSystemPrompt
   * @param {string} sourceLang - The source language name or BCP-47 tag.
   * @param {string} targetLang - The target language name or BCP-47 tag.
   * @param {string} [task="translate"] - Operation mode ('translate', 'summarize', 'improve', 'tone-professional',
   *   'tone-casual'). Default is `"translate"`
   * @returns {string} The constructed system instructions.
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
      case "explain":
        basePrompt = EXPLAIN_PROMPT.replace("{targetLang}", targetLang);
        break;
      case "correct":
        basePrompt = CORRECT_PROMPT.replace("{targetLang}", targetLang);
        break;
      case "simplify":
        basePrompt = SIMPLIFY_PROMPT;
        break;
      default:
        basePrompt = DEFAULT_SYSTEM_PROMPT.replace("{sourceLang}", sourceLang).replace("{targetLang}", targetLang);
    }

    if (this.customPrompt && this.customPrompt.trim()) {
      return `${basePrompt}\n\nAdditional context: ${this.customPrompt.trim()}`;
    }

    return basePrompt;
  }

  /**
   * Orchestrate raw API calls to translate user text. Must be implemented by subclasses.
   *
   * @async
   * @abstract
   * @function translate
   * @param {string} text - The input plain or format text.
   * @param {string} sourceLang - Source language code.
   * @param {string} targetLang - Target language code.
   * @param {string} [task="translate"] - Operation task. Default is `"translate"`
   * @returns {Promise<Object | string>} Resolved translation payload.
   * @throws {Error} If method is not overridden.
   */
  async translate(_text, _sourceLang, _targetLang, _task = "translate") {
    throw new Error("Not implemented");
  }
}

/**
 * Integrates custom OpenAI compatible API gateway endpoints.
 *
 * @class OpenAIProvider
 * @extends TranslationProvider
 */
class OpenAIProvider extends TranslationProvider {
  /**
   * Sends standard text requests directly to configured OpenAI compatible API endpoints.
   *
   * @async
   * @function translate
   * @param {string} text - The input plain or format text.
   * @param {string} sourceLang - Source language code.
   * @param {string} targetLang - Target language code.
   * @param {string} [task="translate"] - Operation task. Default is `"translate"`
   * @returns {Promise<string>} The parsed, translated text from the API.
   * @override
   */
  async translate(text, sourceLang, targetLang, task = "translate") {
    const { username, password, model, baseUrl } = this.config;

    if (!username || !password || !model || !baseUrl) {
      throw new Error("Missing OpenAI configuration (Endpoint, Model, Username, or Password)");
    }

    // Basic Auth base-64 encoding
    const auth = btoa(`${username}:${password}`);
    const systemPrompt = this.buildSystemPrompt(sourceLang, targetLang, task);

    // Construct URL: baseUrl + model
    const url = baseUrl.endsWith("/") ? `${baseUrl}${model}` : `${baseUrl}/${model}`;

    // Route request through the local high-performance proxy server to bypass CORS restrictions
    const proxyUrl = "http://localhost:3001/api/translate";

    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        headers: {
          Authorization: `Basic ${auth}`,
        },
        body: {
          system_prompt: systemPrompt,
          user_input: text,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API Error (Status: ${response.status})`);
    }

    const data = await response.json();
    // Retrieve custom system response mapping returned by the gateway
    return data.system_repsonse?.trim();
  }
}

/**
 * Free Google Translate web API mapping implementation (requires no API key).
 *
 * @class GoogleTranslateProvider
 * @extends TranslationProvider
 */
class GoogleTranslateProvider extends TranslationProvider {
  /**
   * Fetches standard machine translation text segments from the public Google Translate API.
   *
   * @async
   * @function translate
   * @param {string} text - The input plain or format text.
   * @param {string} sourceLang - Source language code.
   * @param {string} targetLang - Target language code.
   * @param {string} [task="translate"] - Operation task (restricted to 'translate'). Default is `"translate"`
   * @returns {Promise<{ translation: string; detectedSourceLang: string | null }>}
   * @override
   */
  async translate(text, sourceLang, targetLang, task = "translate") {
    // Google Translate only supports general translation.
    if (task !== "translate") {
      throw new Error(`Google Translate does not support task: ${task}. Please use an AI provider.`);
    }

    // Use ISO-639-1 language codes, or 'auto' for dynamic source detection
    const sl = sourceLang === "auto" ? "auto" : sourceLang.toLowerCase();
    const tl = targetLang.toLowerCase();

    let data;
    if (this.config?.useGoogleTranslateProxy) {
      const proxyUrl = "http://localhost:3001/api/translate-google";
      const response = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          sourceLang: sl,
          targetLang: tl,
        }),
      });

      if (!response.ok) {
        throw new Error("Google Translate Proxy Error: " + response.statusText);
      }

      data = await response.json();
    } else {
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

      data = await response.json();
    }

    // Parse standard multi-segment translation sentences payload
    if (!data.sentences || !Array.isArray(data.sentences)) {
      throw new Error("Invalid response from Google Translate");
    }

    // Concatenate all parsed text segment translations cleanly
    const translation = data.sentences
      .map((sentence) => sentence.trans)
      .filter((trans) => trans) // Filter out any empty items
      .join("");

    return {
      translation,
      detectedSourceLang: data.src || null,
    };
  }
}

/**
 * Main orchestration service that manages active AI models and handles translation requests.
 *
 * @class AIProviderService
 */
export class AIProviderService {
  /**
   * @class
   * @param {Object} settings - Configuration settings.
   */
  constructor(settings) {
    this.settings = settings;
    this.activeProviderId = settings.activeProviderId || "google-translate";
    this.providers = settings.providers || [];
    this.customPrompt = settings.customPrompt || "";

    // Resolve initial active provider from configuration lists
    this.activeProvider = this.providers.find((p) => p.id === this.activeProviderId) ||
      this.providers.find((p) => p.id === "google-translate") ||
      this.providers[0] || { type: "google-translate", config: {} };
  }

  /**
   * Resolves the translation engine provider instance by its config ID.
   *
   * @function getProvider
   * @param {string} [providerId] - ID of the target provider, defaults to active provider.
   * @returns {OpenAIProvider | GoogleTranslateProvider}
   */
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
        return new GoogleTranslateProvider(
          {
            ...config,
            useGoogleTranslateProxy: this.settings.useGoogleTranslateProxy || false,
          },
          this.customPrompt,
        );
      default:
        throw new Error(`Unsupported provider type: ${type}`);
    }
  }

  /**
   * Delegates text translation to the resolved target engine provider.
   *
   * @async
   * @function translate
   * @param {string} text - The input plain or format text.
   * @param {string} sourceLang - Source language code.
   * @param {string} targetLang - Target language code.
   * @param {string} providerId - ID of the specific provider to use.
   * @param {string} [task="translate"] - Operation task. Default is `"translate"`
   * @returns {Promise<{
   *   translation: string;
   *   detectedSourceLang: string | null;
   *   providerName: string;
   *   providerType: string;
   * }>}
   */
  async translate(text, sourceLang, targetLang, providerId, task = "translate") {
    const provider = this.getProvider(providerId);
    const result = await provider.translate(text, sourceLang, targetLang, task);

    let translation = "";
    let detectedSourceLang = null;

    if (result && typeof result === "object") {
      translation = result.translation;
      detectedSourceLang = result.detectedSourceLang;
    } else {
      translation = result;
    }

    const providerData = providerId
      ? this.providers.find((p) => p.id === providerId) || this.activeProvider
      : this.activeProvider;

    return {
      translation,
      detectedSourceLang,
      providerName: providerData.name,
      providerType: providerData.type,
    };
  }
}
