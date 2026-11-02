import { extractWasaltListings } from "../data/catalog.js";

const SITEMAP_URL =
  "https://cdn.wasalt.sa/sitemap/product_sitemap_en_sa.xml.gz";
const MAX_SITEMAP_BYTES = 12_000_000;
const CACHE_DURATION_MS = 5 * 60_000;

let sitemapCache;
let sitemapExpiresAt = 0;
let sitemapRequest;

async function fetchProductSitemap(fetchImpl) {
  const response = await fetchImpl(SITEMAP_URL, {
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) {
    throw Object.assign(
      new Error(
        `Wasalt's public product sitemap returned HTTP ${response.status}.`
      ),
      { status: 502 }
    );
  }

  const sitemap = await response.text();
  if (sitemap.length > MAX_SITEMAP_BYTES) {
    throw Object.assign(
      new Error("Wasalt's product sitemap exceeded the allowed response size."),
      { status: 502 }
    );
  }
  return sitemap;
}

export async function getWasaltListingOptions(
  query,
  { fetchImpl = fetch, now = Date.now } = {}
) {
  if (sitemapCache && now() < sitemapExpiresAt) {
    return extractWasaltListings(sitemapCache, query);
  }

  if (!sitemapRequest) {
    sitemapRequest = fetchProductSitemap(fetchImpl).finally(() => {
      sitemapRequest = undefined;
    });
  }

  const sitemap = await sitemapRequest;
  sitemapCache = sitemap;
  sitemapExpiresAt = now() + CACHE_DURATION_MS;
  return extractWasaltListings(sitemap, query);
}
