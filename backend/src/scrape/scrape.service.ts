import * as cheerio from 'cheerio';
import { config } from '../config';

export interface MediaItem {
  mediaUrl: string;
  type: 'image' | 'video';
  title: string | null;
}

const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg|mov)(\?|#|$)/i;

export function extractMedia(html: string, baseUrl: string): MediaItem[] {
  const $ = cheerio.load(html);
  const media: Map<string, MediaItem> = new Map();

  const resolve = (src: string): string | null => {
    try {
      return new URL(src, baseUrl).href;
    } catch {
      return null;
    }
  };

  // Images: <img src="...">
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (!src) return;
    const abs = resolve(src);
    if (!abs) return;
    media.set(abs, { mediaUrl: abs, type: 'image', title: $(el).attr('alt') || null });
  });

  // Picture sources: <picture><source srcset="..."></picture>
  $('picture source[srcset]').each((_, el) => {
    const srcset = $(el).attr('srcset');
    if (!srcset) return;
    // Take the first URL from srcset
    const firstSrc = srcset.split(',')[0]?.trim().split(/\s+/)[0];
    if (!firstSrc) return;
    const abs = resolve(firstSrc);
    if (!abs) return;
    media.set(abs, { mediaUrl: abs, type: 'image', title: null });
  });

  // Videos: <video src="..."> and <video><source src="..."></video>
  $('video[src], video source[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (!src) return;
    const abs = resolve(src);
    if (!abs) return;
    media.set(abs, { mediaUrl: abs, type: 'video', title: $(el).attr('title') || null });
  });

  // Links to video files: <a href="...mp4">
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || !VIDEO_EXTENSIONS.test(href)) return;
    const abs = resolve(href);
    if (!abs) return;
    media.set(abs, { mediaUrl: abs, type: 'video', title: $(el).text().trim() || null });
  });

  return [...media.values()];
}

export async function fetchAndExtract(url: string): Promise<MediaItem[]> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(config.fetchTimeout),
    redirect: 'follow',
    headers: {
      'User-Agent': 'MediaScraper/1.0',
      'Accept': 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > config.maxBodySize) {
    throw new Error(`Response too large (${contentLength} bytes) for ${url}`);
  }

  const html = await response.text();
  return extractMedia(html, url);
}
