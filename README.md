# Atlas Marketing Studio

**Atlas Marketing Studio** is an open-source AI e-commerce ad studio for generating UGC product ads, reference-ad remakes, AI drama ads, and short ad skits.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020)](https://workers.cloudflare.com/)
[![Powered by Atlas Cloud](https://img.shields.io/badge/powered%20by-Atlas%20Cloud-6d5dfc)](https://atlascloud.ai?utm_source=github&utm_campaign=atlas-marketing-studio)

> Most AI video tools generate a clip. Atlas Marketing Studio gives you the ad workflow around it: product input, script, shots, reference assets, video generation, credits, login, and deployment.

## What this project is

Atlas Marketing Studio is a self-hostable AI ad generator for e-commerce teams, agencies, and builders. It turns product photos, presenter images, product links, prompts, or reference ads into ready-to-use video ad concepts.

This is not a generic AI SaaS starter. It is a real, runnable e-commerce creative studio with opinionated workflows for:

- AI UGC ads and product review videos
- Reference-ad remakes with your own product and presenter
- Short drama ads for social commerce
- Two-person ad skits from a simple product idea
- Multi-model image, video, LLM, TTS, and lip-sync pipelines
- Credit metering, Google login, Stripe top-ups, and Cloudflare deployment

Sample output: [`public/samples/ad-skit-demo-en.mp4`](public/samples/ad-skit-demo-en.mp4)

## AI ad workflows

Each workflow is a complete AI ad generation path, not just a single model call.

### UGC Product Ad

What it does: product + presenter photos -> lip-synced UGC ad.

Use this as an **AI UGC ad generator** or **product-to-video ad generator**. Add a product description, product photo, and presenter image; the workflow expands the brief, creates a first frame, and generates a short lip-synced product ad. It is designed for product reviews, creator-style testimonials, direct-response e-commerce ads, and social ad variations.

Models: Atlas Cloud prompt expansion, `nano-banana/edit` for the first frame, and `seedance-2.0` image-to-video for the final ad.

Route: `/marketing-studio`

### Reference to Ad

What it does: upload a viral ad -> remake it with your product and presenter.

Use this as a **reference ad remake AI workflow**. Upload a viral ad, competitor ad, or proven creative reference, then remake the structure with your own product and presenter. This is useful when you want to test the pattern of an existing ad without manually rebuilding the script, talent framing, and product placement from scratch.

Models: `gemini-omni-flash/video-edit` for product and presenter replacement, optional ElevenLabs TTS, optional `veed/lipsync`, with `kling motion-control` as the fallback for real-person talent.

Route: `/ad-reference`

### AI Drama Ad

What it does: one topic -> comedy script -> shot-by-shot drama ad.

Use this as an **AI short drama ad generator** for social commerce and short-form video campaigns. Start with a topic, product angle, or offer, then generate a short comedy/drama script, cast setup, scene references, and shot-by-shot video clips. It is built for story-led e-commerce ads where the product is sold through a mini scene rather than a plain product demo.

Models: Atlas Cloud LLM script generation, reference image generation for cast/scene/product setup, and `seedance-2.0/reference-to-video` for each shot.

Route: `/drama-studio`

### Ad Skit

What it does: one-line product -> two-person comedy skit.

Use this as a **short ad skit generator**. Enter a one-line product idea and turn it into a two-person skit with a hook, dialogue, product moment, and 15-second vertical video output. This workflow is best for lightweight product jokes, creator ads, TikTok-style skits, and fast creative testing.

Models: Atlas Cloud LLM script generation, `gpt-image-2` for the product shot, and `seedance-2.0/reference-to-video` for the 15-second skit with audio.

Route: `/ad-skit`

All workflows auto-detect the input language. Write the product brief in English, Chinese, or another language, and the generated script/ad follows that language.

## Who it is for

- E-commerce founders who need more ad creative variations
- UGC creators and performance marketing teams testing short-form video ads
- Agencies building repeatable AI ad production workflows for clients
- Developers studying how to build an AI video SaaS with real billing and deployment
- Atlas Cloud users who want a working multi-model reference app

## Features

- Product-to-video workflows for AI UGC ads, product commercials, drama ads, and ad skits
- Reference-ad remake flow for turning a working creative into a new product ad
- Multi-model orchestration through the Atlas Cloud API
- Dynamic video credit pricing based on duration, model, and resolution
- Google login with NextAuth
- Stripe checkout or Atlas redeem-code top-ups
- Prisma data layer with Cloudflare-compatible deployment
- OpenNext build target for Cloudflare Workers
- Public media URL handling for model APIs that need fetchable assets
- MIT license for learning, forking, and self-hosting

## Quick start

```bash
git clone https://github.com/AtlasCloudAI/atlas-marketing-studio.git
cd atlas-marketing-studio
npm install
cp .dev.vars.example .dev.vars
```

Fill the required values in `.dev.vars`:

```bash
ATLASCLOUD_API_KEY=
DATABASE_URL=
DIRECT_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
PAYMENT_PROVIDER=atlas
```

Optional Stripe checkout variables:

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

Where to get each value:

| Variable | Where to get it | Notes |
|---|---|---|
| `ATLASCLOUD_API_KEY` | [Atlas Cloud API Keys](https://www.atlascloud.ai/docs/api-keys) | Create an Atlas Cloud API key for image, video, LLM, TTS, and lip-sync generation. API keys are shown once, so store it safely. |
| `DATABASE_URL` | [Neon connection string](https://neon.com/docs/connect/connect-from-any-app) | Use the pooled Neon Postgres connection string for the app runtime. |
| `DIRECT_URL` | [Neon direct connection](https://neon.com/docs/connect/connect-from-any-app) | Use the direct Neon Postgres connection string for Prisma migrations. It can be the same project/database as `DATABASE_URL`. |
| `NEXTAUTH_SECRET` | [NextAuth secret](https://next-auth.js.org/configuration/options#nextauth_secret) | Generate locally with `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID` | [Google Cloud OAuth clients](https://console.cloud.google.com/auth/clients) | Create a Web application OAuth client for Google sign-in. |
| `GOOGLE_CLIENT_SECRET` | [Google Cloud OAuth clients](https://console.cloud.google.com/auth/clients) | Copy the client secret from the same Web application OAuth client. |
| `STRIPE_SECRET_KEY` | [Stripe API keys](https://dashboard.stripe.com/apikeys) | Optional. Required only when `PAYMENT_PROVIDER=stripe`. Use test keys for local development. |
| `STRIPE_WEBHOOK_SECRET` | [Stripe Webhooks](https://dashboard.stripe.com/webhooks) | Optional. Required for Stripe webhook verification in production. Local webhook secrets can also come from `stripe listen`. |

Then run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Get an Atlas Cloud API key at [Atlas Cloud](https://atlascloud.ai?utm_source=github&utm_campaign=atlas-marketing-studio).

## Deploy to Cloudflare

```bash
npm run cf:deploy
```

Set production secrets with Wrangler or the Cloudflare dashboard:

```bash
wrangler secret put ATLASCLOUD_API_KEY
wrangler secret put DATABASE_URL
wrangler secret put NEXTAUTH_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
```

Secrets should never be committed to the repository.

## Credits and pricing

Users spend in-app credits while your deployment pays Atlas Cloud in USD. The app maps AI generation cost to credits:

- Fixed-cost steps such as image generation, LLM scripts, and TTS use flat credit prices.
- Video generation uses dynamic pricing based on model, duration, and resolution.

`src/lib/video-pricing.ts` calculates video credits like this:

```text
credits = ceil(perSecond[resolution] * seconds * ACCOUNT_MARKUP * MARGIN / CREDIT_USD)
```

Top-up packs live in `src/config/pricing.ts`, so you can adjust margin and packaging in one place.

## License

MIT. Built on [Atlas Cloud](https://atlascloud.ai?utm_source=github&utm_campaign=atlas-marketing-studio).

## Technical architecture

```text
atlas-marketing-studio/
|-- src/
|   |-- app/                         # Next.js 14 App Router pages and API routes
|   |   |-- marketing-studio/         # AI UGC ad generator UI
|   |   |-- ad-reference/             # Reference ad remake workflow
|   |   |-- drama-studio/             # AI short drama ad generator
|   |   |-- ad-skit/                  # Two-person ad skit generator
|   |   |-- my-work/                  # Saved generations and creation history
|   |   |-- pricing/                  # Credit packs and top-up screen
|   |   `-- api/                      # Generation, auth, checkout, redeem, webhooks
|   |-- components/                   # Reusable studio UI components
|   |-- config/                       # Pricing and product configuration
|   |-- i18n/                         # Multilingual UI copy
|   `-- lib/
|       |-- atlas.ts                  # Atlas Cloud API client
|       |-- video-pricing.ts          # Duration and resolution based credit pricing
|       |-- marketing-studio/         # UGC ad formats, schemas, and prompts
|       |-- drama/                    # Drama scripts, prompts, and shot planning
|       `-- payments/                 # Stripe checkout and redeem-code credits
|-- prisma/
|   `-- schema.prisma                 # Users, accounts, credits, creations, codes
|-- public/
|   `-- samples/                      # Demo videos and reference assets
|-- open-next.config.ts               # OpenNext build target for Cloudflare Workers
|-- wrangler.jsonc                    # Cloudflare deployment config
`-- package.json                      # Next.js, Prisma, Stripe, Atlas Cloud scripts
```
