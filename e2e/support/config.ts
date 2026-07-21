// Isolated E2E API port, matching `e2e/playwright.config.ts` and
// `server/.env.test`. Used for direct API requests (e.g. seeding a fresh
// test user) that bypass the UI.
export const API_URL = "http://localhost:4001";
