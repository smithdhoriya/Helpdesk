// Minimal static file server for the built SPA (client/dist). Kept as a plain
// Bun script rather than pulling in a new dependency, matching the rest of
// the stack's "Bun runtime" convention. Unknown paths fall back to
// index.html so React Router's client-side routes work on hard reload.
import { join } from "path";

const DIST_DIR = join(import.meta.dir, "dist");
const PORT = Number(process.env.PORT ?? 4173);
const indexHtml = Bun.file(join(DIST_DIR, "index.html"));

Bun.serve({
  port: PORT,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname !== "/") {
      const file = Bun.file(join(DIST_DIR, pathname));
      if (await file.exists()) return new Response(file);
    }
    return new Response(indexHtml);
  },
});

console.log(`Serving client on port ${PORT}`);
