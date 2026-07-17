#!/usr/bin/env node
/**
 * Smoke test: prove the Atlas video engine works end-to-end without the
 * full app (no DB / auth / payments). Submits one cheap t2v job and polls.
 *
 *   ATLASCLOUD_API_KEY=apikey-xxx node scripts/smoke-atlas.mjs
 */
const BASE = process.env.ATLASCLOUD_BASE || 'https://api.atlascloud.ai/api/v1';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const KEY = process.env.ATLASCLOUD_API_KEY;
if (!KEY) {
  console.error('Set ATLASCLOUD_API_KEY');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const payload = {
    model: 'bytedance/seedance-v1-pro-fast/text-to-video',
    prompt: 'A red sports car driving along a coastal road at sunset, cinematic, aerial shot',
    duration: 5,
    resolution: '720p',
    seed: -1,
  };
  const sub = await fetch(`${BASE}/model/generateVideo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify(payload),
  });
  const sj = await sub.json();
  if (Number(sj.code) !== 200) {
    console.error('submit failed:', JSON.stringify(sj));
    process.exit(1);
  }
  const id = sj.data.id;
  const getUrl = sj.data?.urls?.get || `${BASE}/model/prediction/${id}`;
  console.log('submitted task:', id);

  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    await sleep(5000);
    const r = await fetch(getUrl, { headers: { Authorization: `Bearer ${KEY}`, 'User-Agent': UA } });
    const j = await r.json();
    const d = j.data ?? j;
    console.log(`  [${Math.round((Date.now() - t0) / 1000)}s] status=${d.status}`);
    if (d.status === 'completed') {
      console.log('✅ OUTPUTS:', JSON.stringify(d.outputs));
      process.exit(0);
    }
    if (d.status === 'failed') {
      console.error('❌ FAILED:', d.error);
      process.exit(1);
    }
  }
  console.error('timeout');
  process.exit(1);
}
main();
