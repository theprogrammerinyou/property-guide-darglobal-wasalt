import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createAppServer } from "../src/http-app.js";

async function startTestServer(options) {
  const server = createAppServer(options);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    })
  };
}

let server;
let baseUrl;

before(async () => {
  ({ baseUrl, ...server } = await startTestServer({
    listingProvider: async () => [
      {
        title: "Apartment for sale · Wasalt listing #123456",
        publisher: "Wasalt",
        url: "https://wasalt.sa/en/property/sale/apartment-123456"
      }
    ],
    chatProvider: async () => "Wasalt is a Saudi real-estate platform. [1]"
  }));
});

after(async () => {
  await server.close();
});

test("health endpoint returns a ready status", async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("static page is served with browser security headers", async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  assert.match(await response.text(), /Property Guide/);
});

test("autocomplete returns official site destinations", async () => {
  const response = await fetch(
    `${baseUrl}/api/suggest?q=${encodeURIComponent("apartments for sale in Riyadh")}`
  );
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(
    result.suggestions[0].url,
    "https://wasalt.sa/en/apartments-for-sale-in-riyadh"
  );
});

test("listing endpoint returns live-source links", async () => {
  const response = await fetch(
    `${baseUrl}/api/listings?q=${encodeURIComponent("apartments for sale")}`
  );
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.publisher, "Wasalt");
  assert.equal(result.listings.length, 1);
  assert.match(result.freshness, /does not include location, price, or availability/);
});

test("invalid listing requests are rejected", async () => {
  const response = await fetch(`${baseUrl}/api/listings?q=`);
  assert.equal(response.status, 400);
});

test("chat endpoint grounds answers and returns publisher citations", async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "What does Wasalt do?" })
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.match(result.answer, /Saudi real-estate platform/);
  assert.ok(result.sources.some((source) => source.publisher === "Wasalt"));
});

test("malformed requests return client errors", async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{"
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Request body must be valid JSON."
  });
});
