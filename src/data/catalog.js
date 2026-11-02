const navigations = [
  {
    title: "Apartments for sale in Riyadh",
    publisher: "Wasalt",
    url: "https://wasalt.sa/en/apartments-for-sale-in-riyadh",
    keywords: ["apartment", "apartments", "flat", "flats", "riyadh", "sale", "buy"]
  },
  {
    title: "Villas for sale in Riyadh",
    publisher: "Wasalt",
    url: "https://wasalt.sa/en/villas-for-sale-in-riyadh",
    keywords: ["villa", "villas", "riyadh", "sale", "buy"]
  },
  {
    title: "Villas for sale in Jeddah",
    publisher: "Wasalt",
    url: "https://wasalt.sa/en/villas-for-sale-in-jeddah",
    keywords: ["villa", "villas", "jeddah", "sale", "buy"]
  },
  {
    title: "Wasalt — browse properties",
    publisher: "Wasalt",
    url: "https://wasalt.sa/en",
    keywords: ["wasalt", "property", "properties", "browse", "rent", "list", "listing"]
  },
  {
    title: "Dar Global — projects",
    publisher: "Dar Global",
    url: "https://darglobal.co.uk/projects/",
    keywords: ["dar", "global", "darglobal", "project", "projects"]
  },
  {
    title: "One of One — Pagani (sitemap page)",
    publisher: "Dar Global",
    url: "https://darglobal.co.uk/one-of-one/project-pagani",
    keywords: ["dar", "global", "pagani", "one", "project"]
  }
];

const darGlobalSitemapPages = [
  ["Davinci Tower by Pagani", "https://darglobal.co.uk/davinci-tower-by-pagani"],
  ["Trump International Hotel and Tower Dubai", "https://darglobal.co.uk/trump-international-hotel-and-tower-dubai"],
  ["Fairway Villas — AIDA Oman", "https://darglobal.co.uk/fairway-villas-aida-oman"],
  ["Marriott Residences — AIDA Oman", "https://darglobal.co.uk/marriott-residences-aida-oman"],
  ["The Great Escape 1 — AIDA Oman", "https://darglobal.co.uk/the-great-escape-1-aida-oman"],
  ["The Great Escape 2 — AIDA Oman", "https://darglobal.co.uk/the-great-escape-2-aida-oman"],
  ["AIDA Trump International Apartments", "https://darglobal.co.uk/aida-trump-international-apartments"],
  ["AIDA Trump International Hotel", "https://darglobal.co.uk/aida-trump-international-hotel"],
  ["AIDA Trump International Cliff Villas", "https://darglobal.co.uk/aida-trump-international-cliff-villas"],
  ["AIDA Trump Villas", "https://darglobal.co.uk/aida-trump-villas"],
  ["One of One — Unlisted by Pagani", "https://darglobal.co.uk/one-of-one/one-of-one-unlisted-by-pagani"],
  ["One of One — Trump Penthouse", "https://darglobal.co.uk/one-of-one/trump-penthouse"]
].map(([title, url]) => ({ title, url, publisher: "Dar Global", sitemapDate: "2026-10-29" }));

export function getAutocompleteSuggestions(query) {
  const terms = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!terms.length) return [];

  return navigations
    .map((item) => ({
      ...item,
      score: terms.reduce(
        (score, term) =>
          score +
          (item.title.toLowerCase().includes(term) ? 2 : 0) +
          (item.keywords.includes(term) ? 1 : 0),
        0
      )
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map(({ title, publisher, url }) => ({ title, publisher, url }));
}

function getListingFilters(query) {
  const normalized = query.toLowerCase();
  const transaction = /\b(rent|rental|renting|lease|leasing)\b/u.test(normalized)
    ? "rent"
    : /\b(sale|sell|buy|purchase|buying)\b/u.test(normalized)
      ? "sale"
      : null;
  const type = [
    ["apartment", /\b(apartment|apartments|flat|flats)\b/u],
    ["villa", /\b(villa|villas|house|houses)\b/u],
    ["land", /\b(land|lands|plot|plots)\b/u],
    ["floor", /\b(floor|floors)\b/u],
    ["building", /\b(building|buildings)\b/u],
    ["duplex", /\b(duplex|duplexes)\b/u]
  ].find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;

  return { transaction, type };
}

export function extractWasaltListings(xml, query, limit = 5) {
  const { transaction, type } = getListingFilters(query);
  if (!transaction && !type) return [];

  const listings = [];
  for (const match of xml.matchAll(/<loc>(https:\/\/wasalt\.sa\/en\/property\/(sale|rent)\/[a-z0-9-]+)<\/loc>/gu)) {
    const [, url, saleOrRent] = match;
    if (transaction && saleOrRent !== transaction) continue;

    const slug = url.split("/").at(-1);
    const listingType = slug.split("-")[0];
    if (type && listingType !== type) continue;

    const reference = slug.match(/(\d{6,})$/)?.[1];
    if (!reference) continue;

    listings.push({
      title: `${listingType[0].toUpperCase()}${listingType.slice(1)} for ${saleOrRent} · Wasalt listing #${reference}`,
      publisher: "Wasalt",
      url
    });
    if (listings.length === limit) break;
  }
  return listings;
}

export function getDarGlobalSitemapListings(query, limit = 5) {
  const terms = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const specificTerms = terms.filter((term) => !["dar", "global", "darglobal", "project", "projects", "list", "show", "find", "fetch", "me", "the", "of"].includes(term));
  const ranked = darGlobalSitemapPages
    .map((page) => {
      const searchable = page.title.toLowerCase();
      const score = specificTerms.length
        ? specificTerms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0)
        : 1;
      return { ...page, score };
    })
    .filter((page) => page.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ title, url, publisher, sitemapDate }) => ({
      title,
      url,
      publisher,
      sitemapDate
    }));
  return ranked;
}
