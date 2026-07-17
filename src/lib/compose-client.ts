'use client';
/**
 * 浏览器端整片合成(ffmpeg.wasm,单线程 core → 不需要 COOP/COEP,不破坏全站图片加载)。
 * 素材优先直连远端媒体 URL;仅对小图片使用受限代理兜底,避免大视频/音频打爆部署平台流量。
 *
 * 通用能力:把「一段配图 + 一段讲师/口播」的多个小节合成为一条完整视频。
 * course-studio 首个接入;SKU/漫剧/播客可复用同一函数。
 *
 * 性能:单线程 wasm 编码较慢(720p、preset ultrafast),大课耗时按节数线性增长,
 * 全程在用户浏览器本地跑,不占服务器、不需要额外部署。
 */
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchMediaBytes } from '@/lib/media-url';

const CORE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
let ffPromise: Promise<FFmpeg> | null = null;

async function getFF(): Promise<FFmpeg> {
  if (ffPromise) return ffPromise;
  ffPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');
    const ff = new FFmpeg();
    await ff.load({
      coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    return ff;
  })();
  return ffPromise;
}

export interface ComposeSection {
  slideUrl?: string; // 配图(16:9)
  videoUrl?: string; // 讲师数字人视频(自带口播音轨),有则左右分栏
  audioUrl?: string; // 无讲师时的口播音频,配图铺满 + 该音轨
}

export interface ComposeProgress {
  frac: number; // 0-1
  note: string;
}

/**
 * 合成一门课:每节 → 配图|讲师左右分栏(带口播音)或 配图+口播;再 concat 成整片。
 * 输出 720p mp4 Blob(供下载)。
 */
export async function composeCourseVideo(
  sections: ComposeSection[],
  onProgress?: (p: ComposeProgress) => void,
): Promise<Blob> {
  const ff = await getFF();
  const segs: string[] = [];
  const usable = sections.filter((s) => s.slideUrl && (s.videoUrl || s.audioUrl));
  if (!usable.length) throw new Error('no_sections');

  for (let i = 0; i < usable.length; i++) {
    const s = usable[i];
    onProgress?.({ frac: (i / usable.length) * 0.9, note: `合成第 ${i + 1}/${usable.length} 节` });
    await ff.writeFile(`slide${i}.jpg`, await fetchMediaBytes(s.slideUrl!));
    if (s.videoUrl) {
      await ff.writeFile(`t${i}.mp4`, await fetchMediaBytes(s.videoUrl));
      // 左:配图 640x720,右:讲师 640x720 → hstack 1280x720,音轨用讲师视频(含口播)
      await ff.exec([
        '-loop', '1', '-i', `slide${i}.jpg`, '-i', `t${i}.mp4`,
        '-filter_complex',
        '[0:v]scale=640:720:force_original_aspect_ratio=decrease,pad=640:720:(ow-iw)/2:(oh-ih)/2,setsar=1[l];' +
          '[1:v]scale=640:720:force_original_aspect_ratio=decrease,pad=640:720:(ow-iw)/2:(oh-ih)/2,setsar=1[r];' +
          '[l][r]hstack=inputs=2[v]',
        '-map', '[v]', '-map', '1:a', '-shortest', '-r', '25',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', `seg${i}.mp4`,
      ]);
    } else {
      await ff.writeFile(`a${i}.mp3`, await fetchMediaBytes(s.audioUrl!));
      // 配图铺满 1280x720 + 口播音轨
      await ff.exec([
        '-loop', '1', '-i', `slide${i}.jpg`, '-i', `a${i}.mp3`,
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1',
        '-map', '0:v', '-map', '1:a', '-shortest', '-r', '25',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', `seg${i}.mp4`,
      ]);
    }
    segs.push(`seg${i}.mp4`);
  }

  onProgress?.({ frac: 0.92, note: '拼接整门课' });
  await ff.writeFile('list.txt', new TextEncoder().encode(segs.map((f) => `file '${f}'`).join('\n')));
  await ff.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'out.mp4']);
  const data = await ff.readFile('out.mp4');
  onProgress?.({ frac: 1, note: '完成' });
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
  return new Blob([bytes as BlobPart], { type: 'video/mp4' });
}

/**
 * 竖屏广告拼接:多个自带对白音轨的竖屏视频镜头 → 各自归一化到 1080x1920/30fps →
 * concat 成一条完整广告。用于 marketing-studio 的多镜口播广告(每镜 Veo i2v 生成)。
 */
export async function composeAdReel(
  videoUrls: string[],
  onProgress?: (p: ComposeProgress) => void,
): Promise<Blob> {
  const ff = await getFF();
  const clips = videoUrls.filter((u): u is string => typeof u === 'string' && u.length > 0);
  if (!clips.length) throw new Error('no_clips');
  const segs: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    onProgress?.({ frac: (i / clips.length) * 0.9, note: `合成第 ${i + 1}/${clips.length} 镜` });
    await ff.writeFile(`v${i}.mp4`, await fetchMediaBytes(clips[i]));
    // 归一化竖屏 1080x1920(不足处黑边居中),统一 30fps + aac,便于无损 concat
    await ff.exec([
      '-i', `v${i}.mp4`,
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-ar', '44100', '-r', '30', `seg${i}.mp4`,
    ]);
    segs.push(`seg${i}.mp4`);
  }
  onProgress?.({ frac: 0.92, note: '拼接整片' });
  await ff.writeFile('list.txt', new TextEncoder().encode(segs.map((f) => `file '${f}'`).join('\n')));
  await ff.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'reel.mp4']);
  const data = await ff.readFile('reel.mp4');
  onProgress?.({ frac: 1, note: '完成' });
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
  return new Blob([bytes as BlobPart], { type: 'video/mp4' });
}
