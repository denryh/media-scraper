// HTML fixtures for the k6 load test. The backend fetches every URL it
// receives, so we need real HTTP responses to scrape.
//
// Two variants — same media tags, different body sizes:
//   GET /*         → small page (~200 B)
//   GET /heavy/*   → heavy page (~3 MB), padding only, same extracted items
//
// The pair is the experimental design behind the SAX-streaming claim
// ("memory per job ∝ extracted items, not page size"): if the claim holds,
// running the load test against /heavy should NOT raise backend RSS vs the
// /* baseline, because the parser streams body bytes through without buffering.
//
// Run on the host so the backend container can reach it via
// host.docker.internal (Docker Desktop / macOS / Windows). On Linux, add
//   extra_hosts: ["host.docker.internal:host-gateway"]
// to the backend service in docker-compose.yml.
//
//   bun run backend/tests/load/fixture-server.ts

const PORT = Number(process.env.FIXTURE_PORT) || 9099;

// Same media tag set on both fixtures so any RSS delta between runs is
// attributable to body size, not extracted-item count.
const MEDIA_BODY = `
  <img src="https://cdn.example.com/img-1.jpg" />
  <img src="https://cdn.example.com/img-2.jpg" />
  <video src="https://cdn.example.com/vid-1.mp4"></video>
`;

const SMALL_HTML = `<!doctype html>
<html><head><title>fixture</title></head>
<body>${MEDIA_BODY}</body></html>`;

// ~3 MB of HTML comment as filler. htmlparser2 reads every byte but emits no
// tag callbacks for comment content, so this exercises the "bytes flow
// through SAX without being held" path. If the claim is wrong, RSS would
// scale with body size (e.g. via response-buffering).
const FILLER = `<!-- ${'x'.repeat(1_500_000)} -->`;
const HEAVY_HTML = `<!doctype html>
<html><head><title>heavy fixture</title></head>
<body>
${FILLER}
${MEDIA_BODY}
${FILLER}
</body></html>`;

Bun.serve({
  port: PORT,
  fetch(req) {
    const path = new URL(req.url).pathname;
    const html = path.startsWith('/heavy') ? HEAVY_HTML : SMALL_HTML;
    return new Response(html, { headers: { 'content-type': 'text/html' } });
  },
});

console.log(
  `fixture server listening on :${PORT}\n` +
    `  small: GET /*         (${SMALL_HTML.length.toLocaleString()} bytes)\n` +
    `  heavy: GET /heavy/*   (${HEAVY_HTML.length.toLocaleString()} bytes)`,
);
