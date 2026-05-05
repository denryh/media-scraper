/**
 * Integration test for the scraping pipeline.
 *
 * Prerequisites:
 *   docker compose up postgres redis -d
 *
 * Run:
 *   DATABASE_URL="postgresql://scraper:scraper@localhost:5432/media_scraper" \
 *   REDIS_URL="redis://localhost:6379" \
 *   bun run tests/integration.ts
 */

import { eq } from "drizzle-orm";
import { db } from "../src/db/index";
import { batches, scrapeJobs, media } from "../src/db/schema";
import { scrapeQueue } from "../src/scrape/scrape.queue";
import { startWorker } from "../src/scrape/scrape.worker";

const TEST_URLS = [
  { url: "https://example.com", expectMedia: false },
  { url: "https://www.wikipedia.org", expectMedia: true },
];

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

async function testScrape(url: string, expectMedia: boolean) {
  console.log(`\nTest: scrape ${url}`);

  const [batch] = await db.insert(batches).values({ totalUrls: 1 }).returning();

  if (!batch) {
    console.error("Failed to create batch");
    return;
  }

  const [job] = await db
    .insert(scrapeJobs)
    .values({
      batchId: batch.id,
      sourceUrl: url,
    })
    .returning();

  if (!job) {
    console.error("Failed to create scrape job");
    return;
  }

  await scrapeQueue.add("scrape", {
    jobId: job.id,
    batchId: batch.id,
    url,
  });

  // Wait for the job to be processed
  await new Promise((resolve) => setTimeout(resolve, 8000));

  const [updatedJob] = await db
    .select()
    .from(scrapeJobs)
    .where(eq(scrapeJobs.id, job.id));
  const [updatedBatch] = await db
    .select()
    .from(batches)
    .where(eq(batches.id, batch.id));
  const mediaRows = await db
    .select()
    .from(media)
    .where(eq(media.jobId, job.id));

  assert(
    updatedJob?.status === "completed",
    `job status is "completed" (got "${updatedJob?.status}")`,
  );
  assert(
    updatedBatch?.status === "completed",
    `batch status is "completed" (got "${updatedBatch?.status}")`,
  );
  assert(
    updatedBatch?.completed === 1,
    `batch completed count is 1 (got ${updatedBatch?.completed})`,
  );

  if (expectMedia) {
    assert(mediaRows.length > 0, `found ${mediaRows.length} media items`);
    mediaRows
      .slice(0, 3)
      .forEach((m) =>
        console.log(`    ${m.type}: ${m.mediaUrl.substring(0, 80)}`),
      );
  } else {
    console.log(
      `    (${mediaRows.length} media items — not asserting count for this URL)`,
    );
  }
}

// Run tests
console.log("Starting integration tests...");
const worker = startWorker();

for (const { url, expectMedia } of TEST_URLS) {
  await testScrape(url, expectMedia);
}

await worker.close();

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
