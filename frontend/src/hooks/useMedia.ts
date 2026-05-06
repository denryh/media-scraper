import { useQuery } from '@tanstack/react-query';
import { getMedia } from '../api/client';

interface UseMediaParams {
  page: number;
  type?: string;
  search?: string;
}

export function useMedia(params: UseMediaParams) {
  return useQuery({
    queryKey: ['media', params],
    queryFn: () => getMedia(params),
    placeholderData: (prev) => prev,
  });
}
