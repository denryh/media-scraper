import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const failedRequests = new Counter('failed_requests');

export const options = {
  scenarios: {
    burst_scrape: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 5000,
      maxDuration: '5m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
    failed_requests: ['count<50'],
  },
};

const TEST_URLS = [
  'https://example.com',
  'https://httpbin.org/html',
  'https://www.wikipedia.org',
  'https://info.cern.ch',
  'https://www.w3.org',
];

export default function () {
  // Pick a random URL from the pool
  const url = TEST_URLS[Math.floor(Math.random() * TEST_URLS.length)];

  const payload = JSON.stringify({ urls: [url] });

  const res = http.post('http://localhost:3001/api/scrape', payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const passed = check(res, {
    'status is 201': (r) => r.status === 201,
    'has batchId': (r) => {
      try {
        return JSON.parse(r.body).batchId !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (!passed) {
    failedRequests.add(1);
  }
}
