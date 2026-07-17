#!/usr/bin/env node
/**
 * Verify every gallery app end-to-end against the real Atlas API.
 * Generates matching test images (z-image), then runs each app with its
 * chosen model + params + input image, and records status/output/timing.
 *
 *   ATLASCLOUD_API_KEY=xxx NODE_USE_ENV_PROXY=1 node scripts/verify.mjs
 * Results -> /tmp/verify-results.json
 */
import fs from 'fs';

const BASE = process.env.ATLASCLOUD_BASE || 'https://api.atlascloud.ai/api/v1';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const KEY = process.env.ATLASCLOUD_API_KEY;
if (!KEY) { console.error('Set ATLASCLOUD_API_KEY'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function submit(endpoint, payload) {
  const res = await fetch(`${BASE}/model/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify(payload),
  });
  const j = await res.json();
  if (Number(j.code) !== 200) throw new Error(`submit ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return { getUrl: j.data?.urls?.get || `${BASE}/model/prediction/${j.data.id}` };
}
async function poll(getUrl, timeout) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    await sleep(4000);
    const r = await fetch(getUrl, { headers: { Authorization: `Bearer ${KEY}`, 'User-Agent': UA } });
    const j = await r.json();
    const d = j.data ?? j;
    if (d.status === 'completed') return { status: 'completed', outputs: d.outputs || [], ms: Date.now() - t0 };
    if (d.status === 'failed') return { status: 'failed', error: d.error, ms: Date.now() - t0 };
  }
  return { status: 'timeout', ms: Date.now() - t0 };
}
async function run(endpoint, payload, timeout = 180000) {
  try {
    const s = await submit(endpoint, payload);
    const d = await poll(s.getUrl, timeout);
    return { ok: d.status === 'completed', ...d };
  } catch (e) {
    return { ok: false, status: 'error', error: String(e.message || e) };
  }
}
async function t2i(prompt) {
  const r = await run('generateImage', { model: 'z-image/turbo', prompt }, 120000);
  return r.ok ? r.outputs[0] : null;
}
async function exampleInputs(model) {
  const url = `https://static.atlascloud.ai/model/example/${model.replace(/[/.]/g, '-')}.json`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    const j = await r.json();
    return j.examples[0].inputs;
  } catch { return null; }
}

async function main() {
  const results = [];
  const PERSON = 'https://static.atlascloud.ai/media/images/20260108-6231164f-e04b-48d3-8e1c-071589933412.webp';

  console.log('== generating test images (z-image $0.005 each) ==');
  const product = (await t2i('professional product photo of white wireless earbuds charging case, plain light background, studio')) || PERSON;
  console.log('  product:', product ? 'ok' : 'FAIL');
  const room = (await t2i('empty living room interior, wooden floor, white walls, large window, no furniture, photorealistic')) || PERSON;
  console.log('  room:', room ? 'ok' : 'FAIL');
  const pet = (await t2i('cute golden retriever puppy portrait photo, soft studio background')) || PERSON;
  console.log('  pet:', pet ? 'ok' : 'FAIL');
  const garment = (await t2i('elegant black cocktail dress laid flat on plain white background, product photo')) || PERSON;
  console.log('  garment:', garment ? 'ok' : 'FAIL');
  const personB = (await t2i('portrait photo of a smiling young man, neutral background, natural light')) || PERSON;
  console.log('  personB:', personB ? 'ok' : 'FAIL');

  console.log('== fetching digital-human example inputs ==');
  const itk = await exampleInputs('atlascloud/infinitetalk');
  const kav = await exampleInputs('kwaivgi/kling-v2.6-pro/avatar');
  console.log('  infinitetalk example:', itk ? 'ok' : 'FAIL', '| kling-avatar example:', kav ? 'ok' : 'FAIL');

  const APPS = [
    ['headshot', 'generateImage', 'bytedance/seedream-v4.5/edit', { images: [PERSON], prompt: 'Transform this person into a professional corporate headshot: business attire, clean neutral studio background, soft professional lighting, confident expression, photorealistic.' }],
    ['product-photo', 'generateImage', 'bytedance/seedream-v4.5/edit', { images: [product], prompt: 'Place this product in a clean professional e-commerce studio scene: soft realistic shadows, premium minimal backdrop, even lighting, keep the product shape and color unchanged.' }],
    ['virtual-staging', 'generateImage', 'alibaba/qwen-image/edit-plus-20251215', { images: [room], prompt: 'Furnish this empty room with tasteful modern furniture and decor, warm inviting staging, realistic interior design, natural lighting, keep the architecture and windows unchanged.' }],
    ['wedding', 'generateImage', 'google/nano-banana-2/edit-developer', { images: [PERSON], prompt: 'Transform into an elegant wedding photoshoot: formal wedding attire, romantic garden background, soft golden-hour lighting, keep the face faithful.', aspect_ratio: '3:4' }],
    ['pet-portrait', 'generateImage', 'bytedance/seedream-v4.5/edit', { images: [pet], prompt: 'Transform this pet into a regal Renaissance oil-painting portrait: royal attire, ornate classical background, painterly brushwork, keep the pet recognizable.' }],
    ['hairstyle', 'generateImage', 'bytedance/seedream-v4.5/edit', { images: [PERSON], prompt: 'Give this person a stylish modern layered haircut, natural realistic hair, keep the face and identity faithful.' }],
    ['photo-restore', 'generateImage', 'bytedance/seedream-v4.5/edit', { images: [PERSON], prompt: 'Restore and enhance this photo: repair any damage, natural realistic colors, sharpen fine details, preserve the original face and composition.' }],
    ['tattoo', 'generateImage', 'bytedance/seedream-v4.5/edit', { images: [PERSON], prompt: 'Add a realistic fine-line tattoo on the forearm: natural skin integration, believable shading, keep everything else unchanged.' }],
    ['makeup', 'generateImage', 'bytedance/seedream-v4.5/edit', { images: [PERSON], prompt: 'Apply elegant professional soft-glam makeup to this person, natural flawless look, enhance features, keep identity faithful.' }],
    ['tryon-2img', 'generateImage', 'alibaba/qwen-image/edit-plus-20251215', { images: [PERSON, garment], prompt: 'The person in Figure 1 is wearing the dress shown in Figure 2, realistic fit and draping, natural lighting, keep the face and pose.' }],
    ['baby-2img', 'generateImage', 'bytedance/seedream-v4.5/edit', { images: [PERSON, personB], prompt: 'Generate a realistic cute baby face blending the facial features of the two people in the images, photorealistic toddler portrait.' }],
    ['photo-to-life', 'generateVideo', 'bytedance/seedance-v1-pro-fast/image-to-video', { image: PERSON, prompt: 'The person comes to life with subtle natural motion: gentle smile, soft head movement, slow cinematic push-in, stable and realistic.' }, 240000],
    ['i2v-hq', 'generateVideo', 'bytedance/seedance-v1.5-pro/image-to-video', { image: PERSON, prompt: 'The person comes to life, subtle natural motion, cinematic push-in.', duration: 5, resolution: '720p' }, 240000],
  ];
  if (itk) APPS.push(['ugc-infinitetalk', 'generateVideo', 'atlascloud/infinitetalk', itk, 300000]);
  if (kav) APPS.push(['ugc-kling-avatar', 'generateVideo', 'kwaivgi/kling-v2.6-pro/avatar', kav, 300000]);

  console.log(`== running ${APPS.length} app verifications ==`);
  for (const [id, ep, model, payload, timeout] of APPS) {
    const r = await run(ep, { model, ...payload }, timeout || 180000);
    results.push({ id, model, endpoint: ep, ok: r.ok, status: r.status, output: r.outputs?.[0] || null, error: r.error || null, ms: r.ms || 0 });
    console.log(`[${r.ok ? '✅' : '❌'}] ${id.padEnd(16)} ${model.padEnd(46)} ${r.status.padEnd(9)} ${((r.ms || 0) / 1000).toFixed(0)}s  ${r.outputs?.[0] || r.error || ''}`);
  }

  fs.writeFileSync('/tmp/verify-results.json', JSON.stringify({ assets: { product, room, pet, garment, personB, person: PERSON }, results }, null, 2));
  console.log(`\n== summary: ${results.filter((r) => r.ok).length}/${results.length} passed ==`);
  console.log('results -> /tmp/verify-results.json');
}
main();
