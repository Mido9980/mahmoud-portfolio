// NOVA Local Render engine.
//
// Renders a storyboard into a real H.264 MP4: procedural cinematic gradient
// backgrounds (or the user's uploaded still), a slow camera push, burned-in
// scene typography (libass handles Arabic shaping/RTL) and a silent AAC track.
// This is explicitly a storyboard renderer, not an AI video model — the UI and
// API label it that way.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { STYLES } from '../director.js';

const DIMENSIONS = {
  '16:9': [1280, 720],
  '9:16': [720, 1280],
  '1:1': [960, 960],
};

const FONTS_DIR = '/usr/share/fonts';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(width, height, pixelAt) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixelAt(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
      offset += 4;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function gradientPng(width, height, palette, seed) {
  const [c0, c1, accent] = palette.map(hexToRgb);
  const ax = 0.32 + (seed % 5) * 0.07;
  const ay = 0.34 + (seed % 3) * 0.09;
  const pixels = encodePng(width, height, (x, y) => {
    const u = x / width;
    const v = y / height;
    const t = Math.min(1, Math.max(0, v * 0.85 + u * 0.15));
    let r = c0[0] + (c1[0] - c0[0]) * t;
    let g = c0[1] + (c1[1] - c0[1]) * t;
    let b = c0[2] + (c1[2] - c0[2]) * t;
    const dist = Math.hypot((u - ax) * 1.15, (v - ay) * 1.6);
    const glow = Math.exp(-dist * dist * 3.2) * 0.85;
    r += accent[0] * glow * 0.5;
    g += accent[1] * glow * 0.5;
    b += accent[2] * glow * 0.5;
    const lightBand = Math.exp(-Math.pow(u * 0.6 + v * 0.4 - 0.52, 2) * 12) * 0.1;
    r += 255 * lightBand;
    g += 255 * lightBand;
    b += 255 * lightBand;
    const cx = u - 0.5;
    const cy = v - 0.5;
    const vignette = 1 - Math.min(0.72, (cx * cx + cy * cy) * 1.35);
    const noise = (Math.sin((x * 12.9898 + y * 78.233 + seed * 37.7) * 0.017) * 43758.5453) % 1;
    const grain = (noise - Math.floor(noise) - 0.5) * 6;
    return [clamp255(r * vignette + grain), clamp255(g * vignette + grain), clamp255(b * vignette + grain), 255];
  });
  return pixels;
}

function scrimPng(width, height) {
  return encodePng(width, height, (_x, y) => {
    const v = y / height;
    const bottom = Math.pow(Math.max(0, (v - 0.42) / 0.58), 1.4) * 0.88;
    const top = Math.pow(Math.max(0, (0.16 - v) / 0.16), 1.5) * 0.42;
    const alpha = Math.min(0.92, Math.max(bottom, top));
    return [0, 0, 0, Math.round(alpha * 255)];
  });
}

function wrapText(text, maxChars, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines) {
    const consumed = lines.join(' ').length;
    if (consumed < String(text).length) lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,;:]$/, '')}…`;
  }
  return lines;
}

function assTime(seconds) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
}

function assEscape(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')');
}

function sceneAss({ width, height, duration, title, description, index, total, arabic }) {
  const titleSize = width >= 1000 ? 44 : 34;
  const bodySize = width >= 1000 ? 26 : 22;
  const marginV = height > width ? Math.round(height * 0.2) : Math.round(height * 0.13);
  const font = arabic ? 'Noto Sans Arabic' : 'DejaVu Sans';
  const titleLines = wrapText(title, width >= 1000 ? 34 : 24, 2).join('\\N');
  const bodyLines = wrapText(description, width >= 1000 ? 58 : 34, 3).join('\\N');
  const meta = `${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}   ·   NOVA`;
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,${font},${titleSize},&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,2,3,2,60,60,${marginV},1
Style: Body,${font},${bodySize},&H00E8E8F0,&H000000FF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,1.6,2,2,60,60,${Math.max(24, marginV - titleSize - 22)},1
Style: Meta,${font},${Math.round(bodySize * 0.66)},&H00C9C9D6,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,1,0,1,0,1,7,40,40,34,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,${assTime(duration)},Meta,,0,0,0,,{\\fad(300,0)}${assEscape(meta)}
Dialogue: 0,0:00:00.25,${assTime(duration)},Title,,0,0,0,,{\\fad(420,420)}${assEscape(titleLines)}
Dialogue: 0,0:00:00.70,${assTime(duration)},Body,,0,0,0,,{\\fad(520,420)}${assEscape(bodyLines)}
`;
}

function run(cmd, args, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 40_000) stderr = stderr.slice(-40_000);
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

export async function renderStoryboard({ title, aspect, style, scenes, imagePath, outFile, onProgress }) {
  const [width, height] = DIMENSIONS[aspect] || DIMENSIONS['16:9'];
  const palette = STYLES[style]?.palette || ['#08080f', '#1a1038', '#8b5cf6'];
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-render-'));
  const sceneFiles = [];
  const total = scenes.length;

  try {
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    const scrimFile = path.join(workDir, 'scrim.png');
    await fs.writeFile(scrimFile, scrimPng(width, height));

    for (let i = 0; i < total; i += 1) {
      const scene = scenes[i];
      const duration = Math.max(1.2, Number(scene.durationSec) || 2.5);
      const bgFile = path.join(workDir, `bg${i}.png`);
      const backgroundInput = imagePath || bgFile;
      if (!imagePath) {
        await fs.writeFile(bgFile, gradientPng(width * 2, height * 2, palette, i + 1));
      }
      const assFile = path.join(workDir, `scene${i}.ass`);
      const arabic = /[\u0600-\u06FF]/.test(`${title} ${scene.description}`);
      await fs.writeFile(
        assFile,
        sceneAss({
          width,
          height,
          duration,
          title: i === 0 ? title : scene.title || title,
          description: scene.description,
          index: i + 1,
          total,
          arabic,
        }),
        'utf8',
      );

      const zoomIn = i % 2 === 0;
      const zExpr = zoomIn
        ? `1+0.09*on/${(24 * duration).toFixed(2)}`
        : `1.09-0.09*on/${(24 * duration).toFixed(2)}`;
      const zoompan = `zoompan=z='${zExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=24`;
      const pre = imagePath
        ? `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},`
        : '';
      const filter =
        `[0:v]${pre}${zoompan}[bg];` +
        `[bg][1:v]overlay=0:0[sc];` +
        `[sc]subtitles=filename='${assFile.replace(/'/g, "\\'")}':fontsdir=${FONTS_DIR},` +
        `fade=t=in:st=0:d=0.4,fade=t=out:st=${Math.max(0.5, duration - 0.45).toFixed(2)}:d=0.45,format=yuv420p[v]`;

      const sceneFile = path.join(workDir, `scene${i}.mp4`);
      await run('ffmpeg', [
        '-y',
        '-loop', '1',
        '-framerate', '24',
        '-i', backgroundInput,
        '-loop', '1',
        '-framerate', '24',
        '-i', scrimFile,
        '-filter_complex', filter,
        '-map', '[v]',
        '-t', String(duration),
        '-r', '24',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-an',
        sceneFile,
      ]);
      sceneFiles.push(sceneFile);
      if (onProgress) onProgress(Math.round(((i + 1) / total) * 82));
    }

    const listFile = path.join(workDir, 'list.txt');
    await fs.writeFile(listFile, sceneFiles.map((f) => `file '${f}'`).join('\n'), 'utf8');
    const silentFile = path.join(workDir, 'silent.mp4');
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silentFile]);

    await run('ffmpeg', [
      '-y',
      '-i', silentFile,
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-shortest',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      outFile,
    ]);
    if (onProgress) onProgress(94);

    const posterFile = outFile.replace(/\.mp4$/i, '.jpg');
    const seek = Math.min(1.2, Math.max(0.2, scenes[0] ? Number(scenes[0].durationSec) / 2 : 0.6));
    await run('ffmpeg', ['-y', '-ss', String(seek), '-i', outFile, '-frames:v', '1', '-q:v', '3', posterFile]);

    const stat = await fs.stat(outFile);
    const totalDuration = scenes.reduce((sum, s) => sum + Math.max(1.2, Number(s.durationSec) || 2.5), 0);
    return {
      path: outFile,
      posterPath: posterFile,
      bytes: stat.size,
      width,
      height,
      duration: Math.round(totalDuration * 10) / 10,
      mime: 'video/mp4',
    };
  } finally {
    fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function extractPoster(videoPath) {
  const posterPath = videoPath.replace(/\.mp4$/i, '.jpg');
  await run('ffmpeg', ['-y', '-ss', '0.6', '-i', videoPath, '-frames:v', '1', '-q:v', '3', posterPath]);
  return posterPath;
}

export async function renderStill({ title, aspect, style, outFile }) {
  const [width, height] = DIMENSIONS[aspect] || DIMENSIONS['16:9'];
  const palette = STYLES[style]?.palette || ['#08080f', '#1a1038', '#8b5cf6'];
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, gradientPng(width, height, palette, 3));
  return { path: outFile, bytes: (await fs.stat(outFile)).size, width, height, mime: 'image/png', title };
}
