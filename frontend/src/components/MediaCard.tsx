import { useRef, useState } from 'react';
import type { MediaItem } from '../api/client';

interface MediaCardProps {
  item: MediaItem;
}

export function MediaCard({ item }: MediaCardProps) {
  const isImage = item.type === 'image';

  return (
    <a
      href={item.mediaUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      <div className="relative aspect-video overflow-hidden bg-zinc-100 dark:bg-zinc-950">
        {isImage ? (
          <img
            src={item.mediaUrl}
            alt={item.title || ''}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).parentElement!.insertAdjacentHTML(
                'beforeend',
                '<span class="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">Failed to load</span>',
              );
            }}
          />
        ) : (
          <HoverVideo src={item.mediaUrl} />
        )}
        <span
          className={`pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide backdrop-blur ${
            isImage
              ? 'bg-blue-500/15 text-blue-700 dark:bg-blue-400/20 dark:text-blue-300'
              : 'bg-purple-500/15 text-purple-700 dark:bg-purple-400/20 dark:text-purple-300'
          }`}
        >
          {item.type}
        </span>
      </div>
      <div className="space-y-1 px-3 py-2.5">
        {item.title ? (
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100" title={item.title}>
            {item.title}
          </p>
        ) : (
          <p className="truncate text-sm text-zinc-500 dark:text-zinc-400" title={item.mediaUrl}>
            {item.mediaUrl}
          </p>
        )}
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-500" title={item.sourceUrl}>
          {hostname(item.sourceUrl)}
        </p>
      </div>
    </a>
  );
}

function HoverVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  const handleEnter = () => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {});
  };

  const handleLeave = () => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMuted((m) => !m);
  };

  return (
    <div
      className="relative h-full w-full"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <video
        ref={videoRef}
        src={src}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? 'Unmute' : 'Mute'}
        className="absolute bottom-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition hover:bg-black/75 group-hover:opacity-100"
      >
        {muted ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            <line x1="22" y1="9" x2="16" y2="15" />
            <line x1="16" y1="9" x2="22" y2="15" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
      </button>
    </div>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
