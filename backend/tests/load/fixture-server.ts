// Tiny HTML fixture for the k6 load test. The backend fetches every URL it
// receives, so we need real HTTP responses to scrape. This serves the same
// minimal media-bearing HTML on every path.
//
// Run on the host so the backend container can reach it via
// host.docker.internal (Docker Desktop / macOS / Windows). On Linux, add
//   extra_hosts: ["host.docker.internal:host-gateway"]
// to the backend service in docker-compose.yml.
//
//   bun run backend/tests/load/fixture-server.ts

const PORT = Number(process.env.FIXTURE_PORT) || 9099;

const HTML = `<!doctype html>
<html><head><title>fixture</title></head>
<body>
  <img src="https://cdn.example.com/img-1.jpg" />
  <img src="https://cdn.example.com/img-2.jpg" />
  <video src="https://cdn.example.com/vid-1.mp4"></video>
</body></html>`;

Bun.serve({
  port: PORT,
  fetch() {
    return new Response(HTML, { headers: { 'content-type': 'text/html' } });
  },
});

console.log(`fixture server listening on :${PORT}`);
