# Property Guide — Dar Global & Wasalt

A Docker-ready, source-grounded real-estate chatbot. The Node.js server retrieves relevant excerpts from the curated public-source dataset and sends them to OpenRouter's free-model router (`openrouter/free`). The browser never receives the API key.

## Run locally

```sh
export OPENROUTER_API_KEY="your-openrouter-api-key"
npm start
```

Open <http://localhost:3000>. Optionally set `OPENROUTER_MODEL` to another OpenRouter model ID or `PORT` to change the listening port.

## Run with Docker

```sh
docker build -t property-guide .
docker run --rm -p 3000:3000 -e OPENROUTER_API_KEY="your-openrouter-api-key" property-guide
```

For hosted deployments, configure `OPENROUTER_API_KEY` as a server-side secret and set `APP_URL` to the public app URL. Never put the key in frontend code or commit it to source control. The `/health` endpoint can be used for container health checks.

## Sources and limitations

The curated source excerpts and attribution links are in [`knowledge.js`](./knowledge.js). Wasalt's published AI policy requires attribution, bars commercial use and bulk contact-data extraction, and warns that listings, prices, and availability change. This demo is informational, is not investment/legal advice, and directs users to the live source for current details.

Dar Global's public sitemap and robots.txt were accessible, but the site's Incapsula protection blocked page content during collection. No protection was bypassed; Dar Global answers are limited to what the accessible sitemap metadata establishes. Check Dar Global's official site for verified project details.

## Deployment

The included [`render.yaml`](./render.yaml) defines a free Docker web service with a health check. In Render, create a new Blueprint from this repository and set `OPENROUTER_API_KEY` as a private environment variable when prompted. Free model availability, OpenRouter rate limits, and host sleep/usage limits are controlled by their respective providers.
