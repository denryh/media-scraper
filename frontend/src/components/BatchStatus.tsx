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
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
        {error instanceof Error ? error.message : 'Error loading batch status'}
      </div>
    );
  }

  if (!status) {
    return (
      <div className="rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Loading batch status…
      </div>
    );
  }

  const progress = status.totalUrls > 0
    ? Math.round(((status.completed + status.failed) / status.totalUrls) * 100)
    : 0;

  const statusColor = isDone
    ? status.failed > 0
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-emerald-600 dark:text-emerald-400'
    : 'text-zinc-700 dark:text-zinc-300';

  const dotColor = isDone
    ? status.failed > 0 ? 'bg-amber-500' : 'bg-emerald-500'
    : 'bg-zinc-400 dark:bg-zinc-500 animate-pulse';

  const barColor = status.failed > 0 ? 'bg-amber-500' : 'bg-zinc-900 dark:bg-white';

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
          <span className={`font-medium capitalize ${statusColor}`}>{status.status}</span>
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {status.id.slice(0, 8)}
          </span>
        </div>
        <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {status.completed + status.failed} / {status.totalUrls}
        </span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>
          <span className="text-emerald-600 dark:text-emerald-400">{status.completed} ok</span>
          {status.failed > 0 && (
            <>
              <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">·</span>
              <span className="text-amber-600 dark:text-amber-400">{status.failed} failed</span>
            </>
          )}
        </span>
        <span className="tabular-nums">{progress}%</span>
      </div>
    </div>
  );
}
