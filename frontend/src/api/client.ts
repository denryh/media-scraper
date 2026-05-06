import type { BatchResponse, BatchStatus, MediaItem, MediaResponse } from '@media-scraper/types';

export type { BatchResponse, BatchStatus, MediaItem, MediaResponse };

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api';

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
