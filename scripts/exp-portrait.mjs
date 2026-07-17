#!/usr/bin/env node
// Confirm identity preservation generalizes across portrait apps (wedding =
// big edit, hairstyle = local) with the new model+prompt. Reuses the front
// face from the previous run. Downloads to /tmp/cmp3.
import fs from 'fs';
const BASE = 'https://api.atlascloud.ai/api/v1';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const KEY = process.env.ATLASCLOUD_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(payload, timeout = 180000) {
  const s = await fetch(`${BASE}/model/generateImage`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify(payload) }).then((r) => r.json());
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
  fs.mkdirSync('/tmp/cmp3', { recursive: true });
  const FACE = 'https://atlas-media.oss-us-west-1.aliyuncs.com/images/e0e26abc-d8d2-492e-9ca7-5ce07d81c759.jpg';
  await dl(FACE, '/tmp/cmp3/00-INPUT.jpg');
  const LOCK = 'Keep the EXACT same person and face — identical facial features, eyes, nose, mouth, face shape, jawline, skin tone and hair. Do NOT turn them into a different person.';
  const M = 'google/nano-banana-pro/edit-developer';
  const cands = [
    ['wedding', { aspect_ratio: '3:4' }, `${LOCK} Only change their outfit to elegant formal wedding attire and place them in a romantic garden with soft golden-hour lighting. Photorealistic wedding photograph of the same person.`],
    ['hairstyle', {}, `${LOCK} Only change the HAIRSTYLE to a stylish modern layered cut, natural realistic hair. Keep the clothing and background the same. Photorealistic.`],
  ];
  for (const [name, extra, prompt] of cands) {
    const r = await run({ model: M, images: [FACE], prompt, ...extra });
    console.log(name, '->', r.url || 'FAIL:' + r.error);
    if (r.url) await dl(r.url, `/tmp/cmp3/${name}.jpg`);
  }
  console.log('files:', fs.readdirSync('/tmp/cmp3').join(' '));
})();
