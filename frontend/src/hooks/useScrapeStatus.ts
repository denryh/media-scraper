import { useEffect, useRef, useState } from 'react';
import { getBatchStatus, type BatchStatus } from '../api/client';

export function useScrapeStatus(batchId: string | null) {
  const [status, setStatus] = useState<BatchStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!batchId) {
      setStatus(null);
      return;
    }

    const poll = async () => {
      try {
        const data = await getBatchStatus(batchId);
        setStatus(data);
        if (data.status === 'completed' || data.status === 'failed') {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [batchId]);

  return { status, error };
}
