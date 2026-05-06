import { useQuery } from '@tanstack/react-query';
import { getBatchStatus } from '../api/client';

export function useScrapeStatus(batchId: string | null) {
  return useQuery({
    queryKey: ['batch', batchId],
    queryFn: () => getBatchStatus(batchId!),
    enabled: !!batchId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'completed' || status === 'failed' ? false : 2000;
    },
  });
}
