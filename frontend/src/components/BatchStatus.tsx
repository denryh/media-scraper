import { useEffect } from 'react';
import { useScrapeStatus } from '../hooks/useScrapeStatus';

interface BatchStatusProps {
  batchId: string | null;
  onComplete: () => void;
}

export function BatchStatus({ batchId, onComplete }: BatchStatusProps) {
  const { data: status, isError, error } = useScrapeStatus(batchId);

  const isDone = status?.status === 'completed' || status?.status === 'failed';

  useEffect(() => {
    if (isDone && status?.completed && status.completed > 0) {
      onComplete();
    }
  }, [isDone, status?.completed, onComplete]);

  if (!batchId) return null;

  if (isError) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-900/20 p-4 text-sm text-red-400">
        {error instanceof Error ? error.message : 'Error loading batch status'}
      </div>
    );
  }

  if (!status) {
    return <div className="text-sm text-gray-400">Loading batch status...</div>;
  }

  const progress = status.totalUrls > 0
    ? Math.round(((status.completed + status.failed) / status.totalUrls) * 100)
    : 0;

  return (
    <div className="space-y-2 rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">
          Batch: <span className="font-mono text-gray-300">{status.id.slice(0, 8)}</span>
        </span>
        <span className={isDone ? (status.failed > 0 ? 'text-yellow-400' : 'text-green-400') : 'text-blue-400'}>
          {status.status}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-700">
        <div
          className={`h-full rounded-full transition-all duration-300 ${status.failed > 0 ? 'bg-yellow-500' : 'bg-blue-500'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{status.completed} completed / {status.failed} failed</span>
        <span>{progress}% ({status.completed + status.failed}/{status.totalUrls})</span>
      </div>
    </div>
  );
}
