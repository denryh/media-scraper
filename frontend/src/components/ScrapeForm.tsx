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
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Enter URLs to scrape (one per line)"
        rows={4}
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {mutation.isError && (
        <p className="text-sm text-red-400">
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to submit'}
        </p>
      )}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {mutation.isPending ? 'Submitting...' : 'Scrape'}
      </button>
    </form>
  );
}
