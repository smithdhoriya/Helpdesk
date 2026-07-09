import express from "express";

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:5173");
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "Helpdesk API" });
});

app.listen(PORT, () => {
  console.log(`Helpdesk server listening on http://localhost:${PORT}`);
});
