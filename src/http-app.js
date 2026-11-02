import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAutocompleteSuggestions,
  getDarGlobalSitemapListings
} from "./data/catalog.js";
import { answerQuestion } from "./services/openrouter.js";
import { retrieveSources } from "./services/retrieval.js";
import { getWasaltListingOptions } from "./services/wasalt.js";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultPublicDirectory = resolve(projectRoot, "public");
const requestWindowMs = 60_000;
const requestLimit = 12;
const listingRateLimitMs = 15_000;
const maximumRequestBodyBytes = 16_384;
const maximumQuestionLength = 1800;
const maximumSuggestionLength = 100;
const darGlobalSitemapUpdatedAt = "2026-10-29";
const darGlobalSitemapNotice =
  "These are sitemap links only. Dar Global's site blocks automated page retrieval, so project details were not scraped or verified.";
const wasaltSitemapNotice =
  "Fetched from Wasalt's public product sitemap, which is cached for up to five minutes. The sitemap does not include location, price, or availability; open each live listing to verify those details. City criteria cannot be checked from the sitemap.";
const listingIntentPattern =
  /\b(property|properties|apartment|apartments|flat|flats|villa|villas|house|houses|land|plot|plots|floor|floors|building|buildings|duplex|duplexes|projects?)\b/i;
const listRequestPattern =
  /\b(list|listings?|options|show me|fetch|get me|find me)\b/i;
const darGlobalPattern = /\bdar\s*global\b|\bdarglobal\b|\bprojects?\b/i;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumRequestBodyBytes) {
      throw Object.assign(new Error("Request body is too large."), {
        status: 413
      });
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), {
      status: 400
    });
  }
}

function formatListingResponse(publisher, checkedAt, freshness, listings) {
  const answer = listings.length
    ? `Here are ${listings.length} ${publisher} options matching the available sitemap information. ${freshness}`
    : `I couldn't find matching listings in the public sitemap. ${freshness}`;

  return {
    publisher,
    checkedAt,
    freshness,
    answer,
    listings
  };
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];

  return value.slice(-6).flatMap((message) => {
    if (
      message &&
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string"
    ) {
      return [{ role: message.role, content: message.content.slice(0, 1800) }];
    }
    return [];
  });
}

export function createAppServer({
  publicDirectory = defaultPublicDirectory,
  listingProvider = getWasaltListingOptions,
  chatProvider = answerQuestion
} = {}) {
  const requestCounts = new Map();
  const listingRequestTimes = new Map();

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

  function isListingRateLimited(request) {
    const client = request.socket.remoteAddress || "unknown";
    const now = Date.now();
    const lastRequestAt = listingRequestTimes.get(client) ?? 0;
    if (now - lastRequestAt < listingRateLimitMs) return true;
    listingRequestTimes.set(client, now);
    return false;
  }

  async function handleRequest(request, response) {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (url.pathname === "/health") {
      return sendJson(response, 200, { status: "ok" });
    }
    if (url.pathname === "/api/suggest") {
      if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        return sendJson(response, 405, {
          error: "Use GET for autocomplete suggestions."
        });
      }

      const query = (url.searchParams.get("q") || "")
        .trim()
        .slice(0, maximumSuggestionLength);
      return sendJson(response, 200, {
        suggestions: getAutocompleteSuggestions(query)
      });
    }
    if (url.pathname === "/api/listings") {
      if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        return sendJson(response, 405, {
          error: "Use GET to request listing options."
        });
      }

      const query = (url.searchParams.get("q") || "")
        .trim()
        .slice(0, maximumQuestionLength);
      if (!query) {
        return sendJson(response, 400, {
          error: "Add a property type or project name to find options."
        });
      }
      if (isListingRateLimited(request)) {
        return sendJson(response, 429, {
          error:
            "Please wait a few seconds before requesting another live listing list."
        });
      }
      if (darGlobalPattern.test(query)) {
        return sendJson(
          response,
          200,
          formatListingResponse(
            "Dar Global",
            darGlobalSitemapUpdatedAt,
            darGlobalSitemapNotice,
            getDarGlobalSitemapListings(query)
          )
        );
      }
      if (!listingIntentPattern.test(query)) {
        return sendJson(response, 400, {
          error:
            "Specify a Wasalt property type such as apartments, villas, land, or buildings."
        });
      }

      const listings = await listingProvider(query);
      return sendJson(
        response,
        200,
        formatListingResponse(
          "Wasalt",
          new Date().toISOString(),
          wasaltSitemapNotice,
          listings
        )
      );
    }
    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        return sendJson(response, 405, {
          error: "Use POST for chat requests."
        });
      }
      if (isRateLimited(request)) {
        return sendJson(response, 429, {
          error: "Too many requests. Please wait a moment and try again."
        });
      }

      const body = await readJson(request);
      const question =
        typeof body.question === "string" ? body.question.trim() : "";
      if (!question || question.length > maximumQuestionLength) {
        return sendJson(response, 400, {
          error: "Enter a question of 1–1,800 characters."
        });
      }

      const history = normalizeHistory(body.history);
      const asksForList =
        listRequestPattern.test(question) && listingIntentPattern.test(question);
      if (asksForList) {
        if (isListingRateLimited(request)) {
          return sendJson(response, 429, {
            error:
              "Please wait a few seconds before requesting another live listing list."
          });
        }

        if (darGlobalPattern.test(question)) {
          return sendJson(
            response,
            200,
            formatListingResponse(
              "Dar Global",
              darGlobalSitemapUpdatedAt,
              darGlobalSitemapNotice,
              getDarGlobalSitemapListings(question)
            )
          );
        }

        const listings = await listingProvider(question);
        return sendJson(
          response,
          200,
          formatListingResponse(
            "Wasalt",
            new Date().toISOString(),
            wasaltSitemapNotice,
            listings
          )
        );
      }

      const context = retrieveSources(question);
      if (!context.length) {
        return sendJson(response, 200, {
          answer:
            "I couldn't find relevant information in the collected sources for that question. Try asking about Wasalt's services or Riyadh/Jeddah property guides, or visit the official sites for more details.",
          sources: []
        });
      }

      const answer = await chatProvider(question, history, context);
      return sendJson(response, 200, {
        answer,
        sources: context.map(({ id, publisher, title, url: sourceUrl }) => ({
          id,
          publisher,
          title,
          url: sourceUrl
        }))
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      return sendJson(response, 405, { error: "Method not allowed." });
    }

    const filename =
      url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (!Object.hasOwn(mimeTypes, extname(filename))) {
      return sendJson(response, 404, { error: "Not found." });
    }

    let content;
    try {
      content = await readFile(resolve(publicDirectory, filename));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return sendJson(response, 404, { error: "Not found." });
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filename)],
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy":
        "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"
    });
    response.end(request.method === "HEAD" ? undefined : content);
  }

  return createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      const status = Number.isInteger(error.status) ? error.status : 500;
      if (status >= 500) console.error(error);
      if (!response.headersSent) {
        sendJson(response, status, {
          error:
            status >= 500
              ? "The server could not complete the request. Please try again."
              : error.message
        });
      } else {
        response.destroy(error);
      }
    });
  });
}
