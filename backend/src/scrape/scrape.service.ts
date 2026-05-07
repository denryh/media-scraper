import { Parser } from 'htmlparser2';
import { config } from '../config';

export interface MediaItem {
  mediaUrl: string;
  type: 'image' | 'video';
  title: string | null;
}

const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg|mov)(\?|#|$)/i;

function resolveUrl(src: string, baseUrl: string): string | null {
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return null;
  }
}

async function fetchStream(url: string): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(config.fetchTimeout),
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}. Body: ${await response.text()}`);
  }

  if (!response.body) throw new Error(`No response body for ${url}`);

  return response.body;
}

async function extractFromStream(stream: ReadableStream<Uint8Array>, baseUrl: string): Promise<MediaItem[]> {
  const media = new Map<string, MediaItem>();

  // SAX context — track nesting to distinguish <source> inside <picture> vs <video>
  let inPicture = false;
  let inVideo = false;
  let inAnchor = false;
  let anchorHref = '';
  let anchorText = '';

  // withResolvers lets us set up the parser first, then pump below as plain async/await
  const { promise, resolve, reject } = Promise.withResolvers<MediaItem[]>();

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        switch (name) {
          case 'img': {
            const abs = attrs.src && resolveUrl(attrs.src, baseUrl);
            if (abs) media.set(abs, { mediaUrl: abs, type: 'image', title: attrs.alt || null });
            break;
          }
          case 'picture':
            inPicture = true;
            break;
          case 'source': {
            if (inPicture && attrs.srcset) {
              const firstSrc = attrs.srcset.split(',')[0]?.trim().split(/\s+/)[0];
              const abs = firstSrc && resolveUrl(firstSrc, baseUrl);
              if (abs) media.set(abs, { mediaUrl: abs, type: 'image', title: null });
            } else if (inVideo && attrs.src) {
              const abs = resolveUrl(attrs.src, baseUrl);
              if (abs) media.set(abs, { mediaUrl: abs, type: 'video', title: null });
            }
            break;
          }
          case 'video': {
            inVideo = true;
            const abs = attrs.src && resolveUrl(attrs.src, baseUrl);
            if (abs) media.set(abs, { mediaUrl: abs, type: 'video', title: attrs.title || null });
            break;
          }
          case 'a':
            inAnchor = true;
            anchorHref = attrs.href || '';
            anchorText = '';
            break;
        }
      },
      ontext(text) {
        if (inAnchor) anchorText += text;
      },
      onclosetag(name) {
        switch (name) {
          case 'picture':
            inPicture = false;
            break;
          case 'video':
            inVideo = false;
            break;
          case 'a':
            if (anchorHref && VIDEO_EXTENSIONS.test(anchorHref)) {
              const abs = resolveUrl(anchorHref, baseUrl);
              if (abs) media.set(abs, { mediaUrl: abs, type: 'video', title: anchorText.trim() || null });
            }
            inAnchor = false;
            anchorHref = '';
            anchorText = '';
            break;
        }
      },
      onerror: reject,
      onend: () => resolve([...media.values()]),
    },
    { decodeEntities: true },
  );

  const reader = stream.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        parser.end();
        break;
      }
      parser.write(decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    reader.cancel().catch(() => {});
    reject(err);
  }

  return promise;
}

export async function fetchAndExtract(url: string): Promise<MediaItem[]> {
  const stream = await fetchStream(url);
  return extractFromStream(stream, url);
}
