# Property Guide

A source-grounded property discovery chatbot for public information from **Wasalt** and **Dar Global**. It combines a lightweight Node.js API, a responsive browser UI, curated retrieval-augmented answers through OpenRouter, and live Wasalt listing links.

> Independent assessment project. Not affiliated with Wasalt or Dar Global. Answers are informational only, not legal or investment advice.

## Features

- Grounded chat answers with clickable source citations.
- Autocomplete suggestions that open official publisher pages.
- Wasalt listing options from its public English product sitemap, refreshed at most every five minutes and filtered by transaction and property type.
- Dar Global project links from public sitemap metadata. Dar Global blocks automated page retrieval, so the app does not claim to have scraped or verified project details.
- Server-side OpenRouter credentials, request-size validation, rate limiting, security headers, and a Docker health check.

## Quick start

**Requirements:** Node.js 22.13+ and an OpenRouter API key.

```sh
cp .env.example .env
# Add your key to .env; never commit this file.
npm ci
npm start
```

Open <http://localhost:3000>. The API key remains on the server. `OPENROUTER_MODEL` defaults to `openrouter/free`; `PORT` defaults to `3000`.

## Development

```sh
npm run check
npm test
npm run lint
```

Tests use Node's built-in test runner and stub external services; they do not require a key or scrape the production websites.

## Docker

```sh
docker build -t property-guide .
docker run --rm -p 3000:3000 \
  -e OPENROUTER_API_KEY="your-openrouter-api-key" \
  property-guide
```

The image installs production dependencies only, runs as the non-root `node` user, and checks `/health`. For hosted deployments, add `OPENROUTER_API_KEY` as a private environment secret and set `APP_URL` to the deployed origin. Never put credentials in the frontend or source control.

## Project structure

```text
src/
  data/       Curated source excerpts and official-page/catalog metadata
  services/   OpenRouter, source retrieval, and cached Wasalt sitemap access
  http-app.js HTTP routes, validation, rate limits, and static-file handling
  server.js   Application entry point
public/       Browser UI, styles, and client-side interactions
tests/        Unit and HTTP integration tests
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Container/host health probe |
| `GET` | `/api/suggest?q=...` | Publisher/category autocomplete links |
| `GET` | `/api/listings?q=...` | Up to five matching source links |
| `POST` | `/api/chat` | Grounded answer; list requests return listing links |

## Source use and accuracy

Wasalt's [`llms.txt`](https://wasalt.sa/llms.txt) requires attribution, allows public listing extraction, disallows commercial use and bulk contact-data extraction, and warns that cached listing details may become stale. The application does not collect contact details. Its public product sitemap contains listing URLs but not reliable city, price, or availability data; open the linked Wasalt page to verify current listing details. Sitemap responses are cached for up to five minutes and list requests are rate-limited.

Dar Global's [`robots.txt`](https://darglobal.co.uk/robots.txt) identifies a public sitemap. Its page responses were blocked by the site's Incapsula challenge during collection, so the chatbot uses only accessible sitemap metadata and does not bypass the challenge. Verify all project information on the official site.

## Deployment

[`render.yaml`](./render.yaml) is a Render Blueprint for a free Docker web service. Connect this repository, create the Blueprint, and enter `OPENROUTER_API_KEY` as a private secret when prompted. Free model availability, API limits, and hosting sleep/usage limits are controlled by their respective providers.
