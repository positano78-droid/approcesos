/**
 * Cloudflare Worker — Proxy para OpenAI API
 * Recibe el prompt desde el frontend, llama a GPT, devuelve el JSON.
 * La API key se guarda como secret en Cloudflare (nunca expuesta al browser).
 *
 * Deploy:
 *   cd worker && npx wrangler deploy
 *
 * Secrets:
 *   npx wrangler secret put OPENAI_API_KEY
 *   npx wrangler secret put ALLOWED_ORIGIN   (opcional, default *)
 */

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, env);
    }

    try {
      const { prompt, model, max_tokens } = await request.json();

      if (!prompt) {
        return json({ error: "Missing 'prompt' field" }, 400, env);
      }

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          max_tokens: max_tokens || 1800,
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Responde ÚNICAMENTE en JSON válido." },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error("OpenAI API error:", res.status, err);
        return json({ error: "OpenAI API error", status: res.status }, 502, env);
      }

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || "";

      // Parsear JSON
      let parsed;
      try {
        parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      } catch {
        parsed = null;
      }

      return json({ result: parsed, raw: parsed ? undefined : raw }, 200, env);
    } catch (err) {
      console.error("Worker error:", err);
      return json({ error: "Internal worker error" }, 500, env);
    }
  },
};

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}
