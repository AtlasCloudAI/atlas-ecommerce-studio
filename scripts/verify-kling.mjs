#!/usr/bin/env node
// Verify kling-v2.6-pro/avatar (digital human, image+audio) using the
// infinitetalk example's image+audio. ATLASCLOUD_API_KEY=xxx node scripts/verify-kling.mjs
const BASE = 'https://api.atlascloud.ai/api/v1';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const KEY = process.env.ATLASCLOUD_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const ex = await fetch('https://static.atlascloud.ai/model/example/atlascloud-infinitetalk.json', { headers: { 'User-Agent': UA } }).then((r) => r.json());
  const inp = ex.examples[0].inputs;
  console.log('image+audio from infinitetalk example');
  const sub = await fetch(`${BASE}/model/generateVideo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ model: 'kwaivgi/kling-v2.6-pro/avatar', image: inp.image, audio: inp.audio }),
  }).then((r) => r.json());
  if (Number(sub.code) !== 200) { console.log('SUBMIT FAIL', JSON.stringify(sub).slice(0, 300)); return; }
  const getUrl = sub.data?.urls?.get;
  console.log('submitted', sub.data.id);
  const t0 = Date.now();
  while (Date.now() - t0 < 360000) {
    await sleep(6000);
    const d = (await fetch(getUrl, { headers: { Authorization: `Bearer ${KEY}`, 'User-Agent': UA } }).then((r) => r.json())).data;
    console.log('  ', d.status, ((Date.now() - t0) / 1000).toFixed(0) + 's');
    if (d.status === 'completed') { console.log('OUTPUT', d.outputs[0]); break; }
    if (d.status === 'failed') { console.log('FAILED', d.error); break; }
  }
})();
