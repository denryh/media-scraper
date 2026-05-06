const API_BASE = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api';

export interface BatchResponse {
  batchId: string;
  totalUrls: number;
  status: string;
}

export interface BatchStatus {
  id: string;
  status: string;
  totalUrls: number;
  completed: number;
  failed: number;
  createdAt: string;
  jobs: {
    id: string;
    sourceUrl: string;
    status: string;
    error: string | null;
  }[];
}

export interface MediaItem {
  id: string;
  mediaUrl: string;
  type: 'image' | 'video';
  title: string | null;
  sourceUrl: string;
  createdAt: string;
}

export interface MediaResponse {
  data: MediaItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function submitScrape(urls: string[]): Promise<BatchResponse> {
  const res = await fetch(`${API_BASE}/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  });
  if (!res.ok) throw new Error(`Scrape failed: ${res.status}`);
  return res.json();
}

export async function getBatchStatus(batchId: string): Promise<BatchStatus> {
  const res = await fetch(`${API_BASE}/scrape/${batchId}`);
  if (!res.ok) throw new Error(`Batch not found: ${res.status}`);
  return res.json();
}

export async function getMedia(params: {
  page?: number;
  limit?: number;
  type?: string;
  search?: string;
}): Promise<MediaResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.type) query.set('type', params.type);
  if (params.search) query.set('search', params.search);

  const res = await fetch(`${API_BASE}/media?${query}`);
  if (!res.ok) throw new Error(`Media fetch failed: ${res.status}`);
  return res.json();
}
