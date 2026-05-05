import { useState, useCallback } from 'react';
import { ScrapeForm } from './components/ScrapeForm';
import { BatchStatus } from './components/BatchStatus';
import { FilterBar } from './components/FilterBar';
import { MediaGrid } from './components/MediaGrid';
import { Pagination } from './components/Pagination';
import { useMedia } from './hooks/useMedia';

function App() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');

  const { data, pagination, loading, refetch } = useMedia({ page, type: type || undefined, search: search || undefined });

  const handleBatchCreated = (id: string) => {
    setBatchId(id);
  };

  const handleBatchComplete = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleTypeChange = (newType: string) => {
    setType(newType);
    setPage(1);
  };

  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        <header>
          <h1 className="text-3xl font-bold">Media Scraper</h1>
          <p className="mt-1 text-sm text-gray-500">Enter URLs to scrape images and videos</p>
        </header>

        <section className="space-y-4">
          <ScrapeForm onBatchCreated={handleBatchCreated} />
          <BatchStatus batchId={batchId} onComplete={handleBatchComplete} />
        </section>

        <section className="space-y-4">
          <FilterBar
            type={type}
            search={search}
            onTypeChange={handleTypeChange}
            onSearchChange={handleSearchChange}
          />
          <MediaGrid items={data} loading={loading} />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
          />
        </section>
      </div>
    </div>
  );
}

export default App;
