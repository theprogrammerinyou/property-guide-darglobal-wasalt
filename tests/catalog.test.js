import assert from "node:assert/strict";
import test from "node:test";
import {
  extractWasaltListings,
  getAutocompleteSuggestions,
  getDarGlobalSitemapListings
} from "../src/data/catalog.js";

const sitemap = `
  <url><loc>https://wasalt.sa/en/property/sale/apartment-5849501</loc></url>
  <url><loc>https://wasalt.sa/en/property/rent/apartment-126-sqm-with-3-bedrooms-5849592</loc></url>
  <url><loc>https://wasalt.sa/en/property/sale/villa-324-sqm-5849527</loc></url>
  <url><loc>https://example.com/en/property/sale/apartment-5849555</loc></url>
`;

test("autocomplete suggests the matching official Wasalt category", () => {
  const suggestions = getAutocompleteSuggestions("apartments for sale in Riyadh");
  assert.equal(suggestions[0].title, "Apartments for sale in Riyadh");
  assert.equal(suggestions[0].url, "https://wasalt.sa/en/apartments-for-sale-in-riyadh");
});

test("Wasalt results are filtered to the requested transaction and type", () => {
  const results = extractWasaltListings(sitemap, "apartments for sale in Riyadh");
  assert.equal(results.length, 1);
  assert.match(results[0].title, /Apartment for sale/);
  assert.equal(results[0].url, "https://wasalt.sa/en/property/sale/apartment-5849501");
});

test("Wasalt results never include URLs outside the approved host and listing paths", () => {
  const results = extractWasaltListings(sitemap, "apartments");
  assert.equal(results.length, 2);
  assert.ok(results.every((listing) => listing.url.startsWith("https://wasalt.sa/en/property/")));
});

test("Dar Global project options are sitemap links and do not claim scraped details", () => {
  const results = getDarGlobalSitemapListings("list Dar Global projects");
  assert.ok(results.length > 0);
  assert.ok(results.every((listing) => listing.publisher === "Dar Global"));
  assert.ok(results.every((listing) => listing.url.startsWith("https://darglobal.co.uk/")));
});
