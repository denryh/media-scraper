import type { MediaItem } from '../api/client';

interface MediaCardProps {
  item: MediaItem;
}

export function MediaCard({ item }: MediaCardProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-800">
      <div className="aspect-video bg-gray-900 flex items-center justify-center">
        {item.type === 'image' ? (
          <img
            src={item.mediaUrl}
            alt={item.title || ''}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).parentElement!.innerHTML =
                '<span class="text-xs text-gray-600">Failed to load</span>';
            }}
          />
        ) : (
          <video
            src={item.mediaUrl}
            controls
            preload="none"
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="p-3 space-y-1">
        <div className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
            item.type === 'image'
              ? 'bg-blue-900/50 text-blue-400'
              : 'bg-purple-900/50 text-purple-400'
          }`}>
            {item.type}
          </span>
          {item.title && (
            <span className="truncate text-xs text-gray-400">{item.title}</span>
          )}
        </div>
        <p className="truncate text-xs text-gray-500" title={item.mediaUrl}>
          {item.mediaUrl}
        </p>
        <p className="truncate text-xs text-gray-600" title={item.sourceUrl}>
          from: {item.sourceUrl}
        </p>
      </div>
    </div>
  );
}
