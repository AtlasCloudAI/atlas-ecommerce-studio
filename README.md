# Atlas Marketing Studio

**[Marketing Studio](https://atlas-saas-starter.atlascloudai.workers.dev/)** is an open-source AI e-commerce ad studio for generating UGC product ads, reference-ad remakes, AI drama ads, and short ad skits, powered by [Atlas Cloud](https://www.atlascloud.ai?utm_source=github&utm_campaign=atlas-marketing-studio).

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020)](https://workers.cloudflare.com/)
[![Vercel](https://img.shields.io/badge/Vercel-ready-black)](https://vercel.com/)
[![Powered by Atlas Cloud](https://img.shields.io/badge/powered%20by-Atlas%20Cloud-6d5dfc)](https://www.atlascloud.ai?utm_source=github&utm_campaign=atlas-marketing-studio)

> Most AI video tools generate a clip. Atlas Marketing Studio gives you the ad workflow around it: product input, script, shots, reference assets, video generation, credits, login, and deployment.

<video src="https://github.com/AtlasCloudAI/atlas-marketing-studio/raw/main/public/samples/ad-skit-demo-en.mp4" controls playsinline width="720"></video>

## What this project is

[Marketing Studio](https://atlas-saas-starter.atlascloudai.workers.dev/) is a self-hostable AI ad generator for e-commerce teams, agencies, and builders, powered by [Atlas Cloud](https://www.atlascloud.ai?utm_source=github&utm_campaign=atlas-marketing-studio). It turns product photos, presenter images, product links, prompts, or reference ads into ready-to-use video ad concepts.

This is not a generic AI SaaS starter. It is a real, runnable e-commerce creative studio with opinionated workflows for:

- AI UGC ads and product review videos
- Reference-ad remakes with your own product and presenter
- Short drama ads for social commerce
- Two-person ad skits from a simple product idea
- Multi-model image, video, LLM, TTS, and lip-sync pipelines
- Credit metering, Google login, Stripe top-ups, and Cloudflare deployment

## AI ad workflows

Each workflow is a complete AI ad generation path, not just a single model call.

Demo links use the hosted app path. If you self-host, keep the same paths on your own domain.

| Workflow | What it does | Use it for | Models | Try it |
|---|---|---|---|---|
| **UGC Product Ad** | Product + presenter photos -> lip-synced UGC ad | An **AI UGC ad generator** or **product-to-video ad generator** for product reviews, creator testimonials, direct-response e-commerce ads, and social ad variations. | Atlas Cloud prompt expansion, `nano-banana/edit` first frame, `seedance-2.0` image-to-video | [Open UGC Product Ad](https://atlas-saas-starter.atlascloudai.workers.dev/marketing-studio) |
| **Reference to Ad** | Upload a viral ad -> remake it with your product and presenter | A **reference ad remake AI workflow** for adapting proven ad structure, talent framing, and product placement to your own offer. | `gemini-omni-flash/video-edit`, optional ElevenLabs TTS, optional `veed/lipsync`, fallback to `kling motion-control` | [Open Reference to Ad](https://atlas-saas-starter.atlascloudai.workers.dev/ad-reference) |
| **AI Drama Ad** | One topic -> comedy script -> shot-by-shot drama ad | An **AI short drama ad generator** for social commerce, story-led e-commerce ads, and short-form video campaigns. | Atlas Cloud LLM script generation, reference image generation, `seedance-2.0/reference-to-video` per shot | [Open AI Drama Ad](https://atlas-saas-starter.atlascloudai.workers.dev/drama-studio) |
| **Ad Skit** | One-line product -> two-person comedy skit | A **short ad skit generator** for creator ads, TikTok-style product jokes, hook testing, and fast creative iteration. | Atlas Cloud LLM script generation, `gpt-image-2` product shot, `seedance-2.0/reference-to-video` with audio | [Open Ad Skit](https://atlas-saas-starter.atlascloudai.workers.dev/ad-skit) |

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
- Build-selected Prisma adapters: Cloudflare D1 or Neon Postgres
- Build-selected media storage: Cloudflare R2 or Public Vercel Blob
- Native Vercel build plus OpenNext target for Cloudflare Workers
- Public media URL handling for model APIs that need fetchable assets
- MIT license for learning, forking, and self-hosting

## Quick start

```bash
git clone https://github.com/AtlasCloudAI/atlas-marketing-studio.git
cd atlas-marketing-studio
npm install
```

For a Vercel-compatible local Next.js runtime:

```bash
cp .env.example .env
# Fill Neon, Public Vercel Blob, auth, and Atlas Cloud values.
npm run dev:vercel
```

For Cloudflare/OpenNext preview:

```bash
cp .dev.vars.example .dev.vars
# D1 and R2 come from wrangler.jsonc bindings.
npm run cf:preview
```

Core application variables:

```env
ATLASCLOUD_API_KEY=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
PAYMENT_PROVIDER=atlas
```

Platform resources:

| Platform | Database | Media storage |
|---|---|---|
| Cloudflare | D1 binding `DB` | R2 binding `MEDIA_BUCKET` |
| Vercel | `DATABASE_URL` for Neon Postgres | Public Blob via `BLOB_READ_WRITE_TOKEN` |

Where to get each value:

| Variable | Where to get it | Notes |
|---|---|---|
| `ATLASCLOUD_API_KEY` | [Atlas Cloud API Keys](https://www.atlascloud.ai/docs/api-keys) | Create an Atlas Cloud API key for image, video, LLM, TTS, and lip-sync generation. API keys are shown once, so store it safely. |
| `DATABASE_URL` | [Neon connection string](https://neon.com/docs/connect/connect-from-any-app) | Vercel only. Use the pooled Neon Postgres connection string. |
| `BLOB_READ_WRITE_TOKEN` | Vercel project Storage | Vercel only. Connect a **Public** Blob store; Vercel injects the token. |
| `NEXTAUTH_SECRET` | [NextAuth secret](https://next-auth.js.org/configuration/options#nextauth_secret) | Generate locally with `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID` | [Google Cloud OAuth clients](https://console.cloud.google.com/auth/clients) | Create a Web application OAuth client for Google sign-in. |
| `GOOGLE_CLIENT_SECRET` | [Google Cloud OAuth clients](https://console.cloud.google.com/auth/clients) | Copy the client secret from the same Web application OAuth client. |
| `STRIPE_SECRET_KEY` | [Stripe API keys](https://dashboard.stripe.com/apikeys) | Optional. Required only when `PAYMENT_PROVIDER=stripe`. Use test keys for local development. |
| `STRIPE_WEBHOOK_SECRET` | [Stripe Webhooks](https://dashboard.stripe.com/webhooks) | Optional. Required for Stripe webhook verification in production. |

Open [http://localhost:3000](http://localhost:3000).

Get an Atlas Cloud API key at [Atlas Cloud](https://www.atlascloud.ai?utm_source=github&utm_campaign=atlas-marketing-studio).

## Deploy

The same business code targets two infrastructure stacks. `VERCEL=1`
automatically selects Neon/Blob during Vercel builds; `cf:*` scripts explicitly
select D1/R2.

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FAtlasCloudAI%2Fatlas-marketing-studio&env=ATLASCLOUD_API_KEY,DATABASE_URL,BLOB_READ_WRITE_TOKEN,NEXTAUTH_SECRET,NEXTAUTH_URL,GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,PAYMENT_PROVIDER&envDescription=Atlas%20Cloud%20key%2C%20Neon%20database%2C%20Public%20Vercel%20Blob%2C%20NextAuth%2C%20Google%20OAuth%2C%20and%20payment%20provider&project-name=atlas-marketing-studio&repository-name=atlas-marketing-studio)

Create/connect a Neon database and a **Public** Vercel Blob store, initialize
the Neon schema with `npm run db:push:vercel`, then deploy with the standard
`npm run build` command.

### Deploy to Cloudflare Workers

```bash
npm run cf:deploy
```

Cloudflare uses the `DB` D1 binding and `MEDIA_BUCKET` R2 binding in
`wrangler.jsonc`; it does not use `DATABASE_URL` or `BLOB_READ_WRITE_TOKEN`.
Set application secrets with Wrangler or the dashboard:

```bash
wrangler secret put ATLASCLOUD_API_KEY
wrangler secret put NEXTAUTH_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for resource creation, database
initialization, legacy R2 compatibility, verification commands, and data
migration boundaries.

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

MIT. Built on [Atlas Cloud](https://www.atlascloud.ai?utm_source=github&utm_campaign=atlas-marketing-studio).

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
