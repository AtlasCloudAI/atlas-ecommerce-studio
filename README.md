# Marketing Studio

One-click, self-hostable **AI e-commerce ad SaaS**, powered by the [AtlasCloud](https://atlascloud.ai?utm_source=github&utm_campaign=ecommerce-studio) API. Ship a credit-metered video-ad product on Cloudflare Workers in minutes.

Four production-grade pipelines, each wiring multiple models into one flow:

| App | What it does | Pipeline |
|---|---|---|
| **UGC Product Ad** (`/marketing-studio`) | Product + presenter photos → lip-synced UGC ad | AI prompt-expand → first frame (`nano-banana/edit`) → `seedance-2.0` i2v |
| **Reference to Ad** (`/ad-reference`) | Upload a viral ad → remake it with your product & presenter | `gemini-omni-flash/video-edit` swaps product+talent → optional ElevenLabs TTS + `veed/lipsync`; auto-fallback to `kling motion-control` for real-person talent |
| **AI Drama Ad** (`/drama-studio`) | One topic → comedy script → shot-by-shot drama ad | LLM script → cast/scene/product reference images → `seedance-2.0/reference-to-video` per shot |
| **Ad Skit** (`/ad-skit`) | One-line product → two-hander comedy skit | LLM script → `gpt-image-2` product shot → `seedance-2.0/reference-to-video` (15s, with audio) |

All four **auto-detect the input language** — write your topic in any language, get the script/ad in that language.

## Tech stack

- **Next.js 14** (App Router) + **OpenNext** on **Cloudflare Workers**
- **Prisma** on Cloudflare **D1**
- **AtlasCloud API** for every generation step (300+ image/video/LLM models behind one API)
- Credit metering with **dynamic per-second × resolution video billing** (below)
- NextAuth (Google) login · Stripe or redeem-code top-ups

## Quick start

```bash
git clone https://github.com/AtlasCloudAI/atlas-ecommerce-studio.git
cd atlas-ecommerce-studio
cp .env.example .env      # fill ATLASCLOUD_API_KEY + DATABASE_URL
npm install
npm run dev               # http://localhost:3000
```

Get a free AtlasCloud key at [atlascloud.ai](https://atlascloud.ai?utm_source=github&utm_campaign=ecommerce-studio).

### Deploy to Cloudflare

```bash
npm run cf:deploy         # prisma generate + opennext build + wrangler deploy
```

Set secrets (`ATLASCLOUD_API_KEY`, `NEXTAUTH_SECRET`, …) via `wrangler secret put` or the Cloudflare dashboard — they never live in the repo.

## Credits & pricing

Users spend in-app **credits**; you pay AtlasCloud in USD. The mapping is cost-based:

- **Fixed-cost steps** (images, LLM scripts, TTS) → flat credits.
- **Video is billed dynamically** — `src/lib/video-pricing.ts` computes credits from each model's real per-second × resolution rate:

  ```
  credits = ⌈ perSecond[resolution] × seconds × ACCOUNT_MARKUP × MARGIN / CREDIT_USD ⌉
  ```

  e.g. seedance 720p = $0.242/s, `gemini-omni-flash/video-edit` = $0.14/s, `kling motion-control` = $0.112/s. 720p/short → fewer credits; 1080p/long → scales up. Rates verified against production billing; tune `MARGIN` in one place. Top-up packs live in `src/config/pricing.ts`.

## License

MIT. Built on [AtlasCloud](https://atlascloud.ai?utm_source=github&utm_campaign=ecommerce-studio).
