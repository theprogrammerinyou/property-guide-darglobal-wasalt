const DEFAULT_MODEL = "openrouter/free";
const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

const systemPrompt = [
  "You are a concise real-estate information assistant for Dar Global and Wasalt.",
  "Answer only from the supplied source excerpts. If they do not contain the answer, say so plainly and direct the user to the relevant official source.",
  "Never invent listing details, prices, availability, investment returns, legal or eligibility advice, or Dar Global project facts.",
  "Wasalt listings change: tell users to verify live details on Wasalt. Attribute information to the named publisher.",
  "Wasalt's published policy disallows commercial use and bulk contact-data extraction; never provide or solicit private information or contact details.",
  "If Dar Global evidence is only sitemap metadata, clearly say details could not be verified and do not infer facts from URL slugs.",
  "Use [1], [2] citations matching the supplied excerpts."
].join(" ");

function createHttpError(message, status) {
  return Object.assign(new Error(message), { status });
}

export async function answerQuestion(
  question,
  history,
  context,
  {
    apiKey = process.env.OPENROUTER_API_KEY,
    model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    appUrl = process.env.APP_URL || "http://localhost:3000",
    fetchImpl = fetch
  } = {}
) {
  if (!apiKey) {
    throw createHttpError(
      "Chat is not configured: set OPENROUTER_API_KEY on the server.",
      503
    );
  }

  const numberedContext = context
    .map(
      (source, index) =>
        `[${index + 1}] ${source.publisher} — ${source.title}\n${source.content}\nSource: ${source.url}`
    )
    .join("\n\n");
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Source excerpts:\n${numberedContext}` },
    ...history,
    { role: "user", content: question }
  ];

  const response = await fetchImpl(COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": appUrl,
      "X-Title": "Property Guide - Dar Global & Wasalt"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 500
    }),
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw createHttpError(
      `OpenRouter request failed (${response.status}): ${detail}`,
      response.status === 429 ? 429 : 502
    );
  }

  const result = await response.json();
  const text = result.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw createHttpError("OpenRouter returned no answer.", 502);
  }
  return text.trim();
}
