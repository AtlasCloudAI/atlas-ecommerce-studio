#!/usr/bin/env node
// Front-facing identity test (matches user's real scenario: clear selfie).
// Generate a clear front portrait, then headshot-edit it with the top
// candidates; download to /tmp/cmp2 for visual same-person comparison.
import fs from 'fs';
const BASE = 'https://api.atlascloud.ai/api/v1';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const KEY = process.env.ATLASCLOUD_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(endpoint, payload, timeout = 180000) {
  const s = await fetch(`${BASE}/model/${endpoint}`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify(payload) }).then((r) => r.json());
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
async function dl(url, path) { const r = await fetch(url, { headers: { 'User-Agent': UA } }); fs.writeFileSync(path, Buffer.from(await r.arrayBuffer())); }
(async () => {
  fs.mkdirSync('/tmp/cmp2', { recursive: true });
  console.log('generating a clear front-facing selfie as input...');
  const face = (await run('generateImage', { model: 'google/nano-banana-pro/text-to-image-developer', prompt: 'A clear front-facing casual selfie photo of a young East Asian man in a white shirt, in an office, looking straight at the camera, natural lighting, photorealistic, distinctive recognizable face' })).url;
  if (!face) { console.log('input gen FAIL'); return; }
  await dl(face, '/tmp/cmp2/00-INPUT-face.jpg');
  console.log('input:', face);
  const STRONG = 'Keep the EXACT same person and face — identical facial features, eyes, nose, mouth, face shape, jawline, skin tone and hairstyle. Do NOT change the face or turn it into a different person. Only change the clothing to a tailored business suit and the background to a clean professional studio backdrop with soft lighting. Front-facing corporate headshot of the SAME person, photorealistic.';
  for (const [name, model, extra] of [
    ['nanobanana-pro', 'google/nano-banana-pro/edit-developer', { aspect_ratio: '1:1' }],
    ['seedream', 'bytedance/seedream-v4.5/edit', {}],
  ]) {
    const r = await run('generateImage', { model, images: [face], prompt: STRONG, ...extra });
    console.log(name, '->', r.url || 'FAIL:' + r.error);
    if (r.url) await dl(r.url, `/tmp/cmp2/${name}.jpg`);
  }
  console.log('files:', fs.readdirSync('/tmp/cmp2').join(' '));
})();
