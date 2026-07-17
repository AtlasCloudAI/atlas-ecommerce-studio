#!/usr/bin/env node
/**
 * Smoke test for image-edit / image-to-video (needs an input image).
 *   ATLASCLOUD_API_KEY=xxx node scripts/smoke-image.mjs <image|video> <model> <imageUrl> "<prompt>"
 */
const BASE = process.env.ATLASCLOUD_BASE || 'https://api.atlascloud.ai/api/v1';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const KEY = process.env.ATLASCLOUD_API_KEY;
if (!KEY) { console.error('Set ATLASCLOUD_API_KEY'); process.exit(1); }

const [, , kind, model, image, ...rest] = process.argv;
const prompt = rest.join(' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const ep = kind === 'image' ? '/model/generateImage' : '/model/generateVideo';
  const payload = { model, prompt };
  if (image && image !== '-') {
    if (kind === 'i2v') payload.image = image; // seedance i2v wants singular `image`
    else payload.images = image; // edit / others use plural `images`
  }
  const sub = await fetch(`${BASE}${ep}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify(payload),
  });
  const sj = await sub.json();
  if (Number(sj.code) !== 200) { console.error('submit failed:', JSON.stringify(sj)); process.exit(1); }
  const id = sj.data.id;
  const getUrl = sj.data?.urls?.get || `${BASE}/model/prediction/${id}`;
  console.log('submitted:', id);
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    await sleep(4000);
    const r = await fetch(getUrl, { headers: { Authorization: `Bearer ${KEY}`, 'User-Agent': UA } });
    const j = await r.json();
    const d = j.data ?? j;
    console.log(`  [${Math.round((Date.now() - t0) / 1000)}s] ${d.status}`);
    if (d.status === 'completed') { console.log('✅ OUTPUTS:', JSON.stringify(d.outputs)); process.exit(0); }
    if (d.status === 'failed') { console.error('❌ FAILED:', d.error); process.exit(1); }
  }
  console.error('timeout'); process.exit(1);
}
main();
