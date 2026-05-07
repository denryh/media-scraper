import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ScrapeForm } from './components/ScrapeForm';
import { BatchStatus } from './components/BatchStatus';
import { FilterBar } from './components/FilterBar';
import { MediaGrid } from './components/MediaGrid';
import { Pagination } from './components/Pagination';
import { useMedia } from './hooks/useMedia';

function App() {
  const queryClient = useQueryClient();
  const [batchId, setBatchId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useMedia({ page, type: type || undefined, search: search || undefined });

  const handleBatchComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['media'] });
  }, [queryClient]);

  const handleTypeChange = (newType: string) => {
    setType(newType);
    setPage(1);
  };

  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <header className="mb-12 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Media Scraper</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Extract images and videos from any URL</p>
          </div>
        </header>

        <section className="mb-10 space-y-3">
          <ScrapeForm onBatchCreated={setBatchId} />
          <BatchStatus batchId={batchId} onComplete={handleBatchComplete} />
        </section>

        <section className="space-y-6">
          <div className="flex items-end justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
            <h2 className="text-base font-semibold tracking-tight">Library</h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {data?.pagination.total ?? 0} items
            </span>
          </div>
          <FilterBar
            type={type}
            search={search}
            onTypeChange={handleTypeChange}
            onSearchChange={handleSearchChange}
          />
          <MediaGrid items={data?.data ?? []} loading={isLoading} />
          <Pagination
            page={data?.pagination.page ?? 1}
            totalPages={data?.pagination.totalPages ?? 0}
            total={data?.pagination.total ?? 0}
            onPageChange={setPage}
          />
        </section>
      </div>
    </div>
  );
}

export default App;
