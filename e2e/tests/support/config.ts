// Isolated E2E test ports, matching `e2e/playwright.config.ts` and
// `server/.env.test` / `client/.env.test`. These are intentionally NOT the
// dev ports (5173/4000) so `bun run dev` can keep running alongside the
// E2E suite.
export const API_URL = "http://localhost:4001";
