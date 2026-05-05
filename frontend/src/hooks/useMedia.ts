import { useEffect, useState, useCallback } from 'react';
import { getMedia, type MediaItem, type MediaResponse } from '../api/client';

interface UseMediaParams {
  page: number;
  type?: string;
  search?: string;
}

export function useMedia(params: UseMediaParams) {
  const [data, setData] = useState<MediaItem[]>([]);
  const [pagination, setPagination] = useState<MediaResponse['pagination']>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMedia({
        page: params.page,
        type: params.type,
        search: params.search,
      });
      setData(res.data);
      setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [params.page, params.type, params.search]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  return { data, pagination, loading, error, refetch: fetchMedia };
}
