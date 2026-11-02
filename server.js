import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sources } from "./knowledge.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = resolve(root, "public");
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENROUTER_MODEL || "openrouter/free";
const requestWindowMs = 60_000;
const requestLimit = 12;
const requestCounts = new Map();
const stopWords = new Set(
  "a an and are as at be by can do for from how i in is it me my of on or please tell that the this to was what where which who with would".split(" ")
);

function retrieve(query) {
  const terms = query
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((term) => term.length > 1 && !stopWords.has(term)) ?? [];
  const ranked = sources
    .map((source) => {
      const searchable = `${source.publisher} ${source.title} ${source.content}`.toLowerCase();
      const score = terms.reduce((total, term) => {
        const matches = searchable.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gu"));
        return total + Math.min(matches?.length ?? 0, 4);
      }, 0);
      return { source, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ source }) => source);

  return ranked;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) {
      throw Object.assign(new Error("Request body is too large."), { status: 413 });
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

function isRateLimited(request) {
  const now = Date.now();
  const client = request.socket.remoteAddress || "unknown";
  const current = requestCounts.get(client);
  if (!current || now - current.startedAt >= requestWindowMs) {
    requestCounts.set(client, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > requestLimit;
}

async function answerQuestion(question, history, context) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw Object.assign(new Error("Chat is not configured: set OPENROUTER_API_KEY on the server."), { status: 503 });
  }

  const numberedContext = context
    .map((source, index) => `[${index + 1}] ${source.publisher} — ${source.title}\n${source.content}\nSource: ${source.url}`)
    .join("\n\n");
  const messages = [
    {
      role: "system",
      content:
        "You are a concise real-estate information assistant for Dar Global and Wasalt. Answer only from the supplied source excerpts. If they do not contain the answer, say so plainly and direct the user to the relevant official source. Never invent listing details, prices, availability, investment returns, legal or eligibility advice, or Dar Global project facts. Wasalt listings change: tell users to verify live details on Wasalt. Attribute information to the named publisher. Wasalt's published policy disallows commercial use and bulk contact-data extraction; never provide or solicit private information or contact details. If Dar Global evidence is only sitemap metadata, clearly say details could not be verified and do not infer facts from URL slugs. Use [1], [2] citations matching the supplied excerpts."
    },
    { role: "user", content: `Source excerpts:\n${numberedContext}` },
    ...history,
    { role: "user", content: question }
  ];

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-Title": "Property Guide — Dar Global & Wasalt"
    },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 500 }),
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    const error = new Error(`OpenRouter request failed (${response.status}): ${detail}`);
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }
  const result = await response.json();
  const text = result.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw Object.assign(new Error("OpenRouter returned no answer."), { status: 502 });
  }
  return text.trim();
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname === "/health") {
      return sendJson(response, 200, { status: "ok" });
    }
    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        return sendJson(response, 405, { error: "Use POST for chat requests." });
      }
      if (isRateLimited(request)) {
        return sendJson(response, 429, { error: "Too many requests. Please wait a moment and try again." });
      }
      const body = await readJson(request);
      const question = typeof body.question === "string" ? body.question.trim() : "";
      if (!question || question.length > 1800) {
        return sendJson(response, 400, { error: "Enter a question of 1–1,800 characters." });
      }
      const history = Array.isArray(body.history)
        ? body.history.slice(-6).flatMap((message) => {
            if (
              message &&
              (message.role === "user" || message.role === "assistant") &&
              typeof message.content === "string"
            ) {
              return [{ role: message.role, content: message.content.slice(0, 1800) }];
            }
            return [];
          })
        : [];
      const context = retrieve(question);
      if (!context.length) {
        return sendJson(response, 200, {
          answer: "I couldn't find relevant information in the collected sources for that question. Try asking about Wasalt's services or Riyadh/Jeddah property guides, or visit the official sites for more details.",
          sources: []
        });
      }
      const answer = await answerQuestion(question, history, context);
      return sendJson(response, 200, {
        answer,
        sources: context.map(({ id, publisher, title, url }) => ({ id, publisher, title, url }))
      });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      return sendJson(response, 405, { error: "Method not allowed." });
    }
    const filename = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (!["index.html", "styles.css", "app.js"].includes(filename)) {
      return sendJson(response, 404, { error: "Not found." });
    }
    const content = await readFile(resolve(publicRoot, filename));
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filename)],
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy": "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error(error);
    if (!response.headersSent) {
      sendJson(response, status, {
        error: status === 500 ? "The server could not complete the request. Please try again." : error.message
      });
    } else {
      response.destroy(error);
    }
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Property Guide is listening on port ${port}`);
});
