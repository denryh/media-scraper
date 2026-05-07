import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { submitScrape } from '../api/client';

interface ScrapeFormProps {
  onBatchCreated: (batchId: string) => void;
}

export function ScrapeForm({ onBatchCreated }: ScrapeFormProps) {
  const [input, setInput] = useState('');

  const mutation = useMutation({
    mutationFn: (urls: string[]) => submitScrape(urls),
    onSuccess: (data) => {
      onBatchCreated(data.batchId);
      setInput('');
    },
  });

  const urlCount = input
    .split('\n')
    .map((u) => u.trim())
    .filter((u) => u.length > 0).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const urls = input
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    if (urls.length === 0) return;
    mutation.mutate(urls);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="group relative rounded-xl border border-zinc-200 bg-white shadow-sm transition focus-within:border-zinc-400 focus-within:ring-4 focus-within:ring-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900 dark:focus-within:border-zinc-600 dark:focus-within:ring-white/5">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste URLs, one per line…"
          rows={4}
          className="block w-full resize-none rounded-xl bg-transparent px-4 py-3 text-sm leading-relaxed placeholder-zinc-400 outline-none dark:placeholder-zinc-500"
        />
        <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
          <span className="px-1 text-xs text-zinc-500 dark:text-zinc-400">
            {urlCount === 0 ? 'No URLs' : `${urlCount} URL${urlCount === 1 ? '' : 's'}`}
          </span>
          <button
            type="submit"
            disabled={mutation.isPending || urlCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {mutation.isPending ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Submitting
              </>
            ) : (
              <>
                Scrape
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
      {mutation.isError && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to submit'}
        </p>
      )}
    </form>
  );
}
