import type { MediaItem } from '../api/client';
import { MediaCard } from './MediaCard';

interface MediaGridProps {
  items: MediaItem[];
  loading: boolean;
}

export function MediaGrid({ items, loading }: MediaGridProps) {
  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-500">Loading...</div>;
  }

  if (items.length === 0) {
    return <div className="py-12 text-center text-sm text-gray-500">No media found</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <MediaCard key={item.id} item={item} />
      ))}
    </div>
  );
}
