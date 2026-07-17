#!/usr/bin/env node
// Identity-preservation experiment for the headshot app.
// Runs candidates on the SAME input face, downloads outputs to /tmp/cmp
// so we can visually compare "is it the same person?".
//   ATLASCLOUD_API_KEY=xxx NODE_USE_ENV_PROXY=1 node scripts/exp-headshot.mjs
import fs from 'fs';
const BASE = 'https://api.atlascloud.ai/api/v1';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const KEY = process.env.ATLASCLOUD_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(endpoint, payload, timeout = 180000) {
  const s = await fetch(`${BASE}/model/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify(payload),
  }).then((r) => r.json());
  if (Number(s.code) !== 200) return { error: JSON.stringify(s).slice(0, 200) };
  const getUrl = s.data?.urls?.get;
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    await sleep(4000);
    const d = (await fetch(getUrl, { headers: { Authorization: `Bearer ${KEY}`, 'User-Agent': UA } }).then((r) => r.json())).data;
    if (d.status === 'completed') return { url: d.outputs[0] };
    if (d.status === 'failed') return { error: d.error };
  }
  return { error: 'timeout' };
}
async function dl(url, path) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  fs.writeFileSync(path, Buffer.from(await r.arrayBuffer()));
}

(async () => {
  fs.mkdirSync('/tmp/cmp', { recursive: true });
  const PERSON = 'https://static.atlascloud.ai/media/images/20260108-6231164f-e04b-48d3-8e1c-071589933412.webp';
  await dl(PERSON, '/tmp/cmp/00-INPUT.webp');

  const WEAK = 'Transform this person into a professional corporate headshot: business attire, clean neutral studio background, soft professional lighting, confident expression, photorealistic.';
  const STRONG =
    'Keep the EXACT same person: do not change their face, facial features, eyes, nose, mouth, face shape, hairstyle or skin tone in any way — identity must stay identical. Only replace their clothing with a tailored dark business suit and the background with a clean professional studio backdrop with soft even lighting. Photorealistic corporate headshot of the SAME person.';

  const cands = [
    ['4-flux-kontext', 'generateImage', 'black-forest-labs/flux-kontext-dev', { images: [PERSON], prompt: STRONG }],
    ['5-nanobanana-pro', 'generateImage', 'google/nano-banana-pro/edit', { images: [PERSON], prompt: STRONG, aspect_ratio: '1:1' }],
    ['6-seedream-seq', 'generateImage', 'bytedance/seedream-v4.5/edit-sequential', { images: [PERSON], prompt: STRONG }],
  ];
  for (const [name, ep, model, payload] of cands) {
    const r = await run(ep, { model, ...payload });
    console.log(name, '->', r.url || 'FAIL:' + r.error);
    if (r.url) await dl(r.url, `/tmp/cmp/${name}.jpg`);
  }
  console.log('files:', fs.readdirSync('/tmp/cmp').join(' '));
})();
