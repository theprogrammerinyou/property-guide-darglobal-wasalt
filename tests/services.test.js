import assert from "node:assert/strict";
import { test } from "node:test";
import { answerQuestion } from "../src/services/openrouter.js";
import { getWasaltListingOptions } from "../src/services/wasalt.js";

test("OpenRouter request uses the configured model and server-side key", async () => {
  let requestUrl;
  let requestOptions;
  const answer = await answerQuestion(
    "What does Wasalt do?",
    [],
    [
      {
        publisher: "Wasalt",
        title: "About Wasalt",
        content: "Wasalt is a Saudi real-estate platform.",
        url: "https://wasalt.sa/en"
      }
    ],
    {
      apiKey: "test-key-not-real",
      model: "openrouter/free",
      fetchImpl: async (url, options) => {
        requestUrl = url;
        requestOptions = options;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "Wasalt is a property platform. [1]" } }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  );

  assert.equal(answer, "Wasalt is a property platform. [1]");
  assert.equal(requestUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(requestOptions.headers.Authorization, "Bearer test-key-not-real");
  assert.equal(JSON.parse(requestOptions.body).model, "openrouter/free");
});

test("OpenRouter configuration errors are explicit", async () => {
  await assert.rejects(
    answerQuestion("Question", [], [], { apiKey: "" }),
    { status: 503, message: /OPENROUTER_API_KEY/ }
  );
});

test("Wasalt sitemap is cached while filters are applied per request", async () => {
  let fetchCount = 0;
  const sitemap = [
    "https://wasalt.sa/en/property/sale/apartment-123456",
    "https://wasalt.sa/en/property/rent/villa-123457"
  ]
    .map((url) => `<url><loc>${url}</loc></url>`)
    .join("");
  const options = {
    now: () => 1,
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response(sitemap, { status: 200 });
    }
  };

  const apartments = await getWasaltListingOptions("apartments for sale", options);
  const villas = await getWasaltListingOptions("villas for rent", options);

  assert.equal(fetchCount, 1);
  assert.equal(apartments.length, 1);
  assert.match(apartments[0].url, /apartment-123456/);
  assert.equal(villas.length, 1);
  assert.match(villas[0].url, /villa-123457/);
});
