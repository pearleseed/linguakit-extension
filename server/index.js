import { serve } from "bun";

const PORT = process.env.PORT || 3001;

serve({
  port: PORT,
  async fetch(req) {
    // 1. Handle CORS preflight requests
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // 2. Proxy request to custom OpenAI target endpoint
    if (req.method === "POST" && new URL(req.url).pathname === "/api/translate") {
      try {
        const { url, headers, body } = await req.json();

        if (!url) {
          return new Response(JSON.stringify({ error: "Missing required 'url' parameter" }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        // Execute server-to-server call (bypasses browser CORS origins)
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: JSON.stringify(body),
        });

        const responseData = await response.text();

        return new Response(responseData, {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    // 3. Proxy request to public Google Translate endpoint
    if (req.method === "POST" && new URL(req.url).pathname === "/api/translate-google") {
      try {
        const { text, sourceLang, targetLang } = await req.json();

        if (!text || !targetLang) {
          return new Response(JSON.stringify({ error: "Missing required 'text' or 'targetLang' parameters" }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        const sl = sourceLang === "auto" ? "auto" : sourceLang.toLowerCase();
        const tl = targetLang.toLowerCase();
        const encodedText = encodeURIComponent(text);
        const googleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&dj=1&sl=${sl}&tl=${tl}&q=${encodedText}`;

        const response = await fetch(googleUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const responseData = await response.text();

        return new Response(responseData, {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    // Default health check endpoint
    return new Response(JSON.stringify({ status: "healthy", service: "LinguaKit Translation Proxy" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
});

console.log(`LinguaKit Translation Proxy running on http://localhost:${PORT}`);
