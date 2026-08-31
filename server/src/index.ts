import { app } from "./app";
import { startQueue, stopQueue } from "./queue";

const PORT = process.env.PORT ?? 4000;

const server = app.listen(PORT, () => {
  console.log(`Helpdesk server listening on http://localhost:${PORT}`);
});

// Start the durable job queue and its ticket-classification worker. If it can't
// start (e.g. the database is briefly unreachable), the API still serves: new
// tickets are created and simply stay uncategorized until the queue recovers.
startQueue().catch((error) => {
  console.error("Failed to start the job queue", error);
});

// Graceful shutdown: stop accepting new connections, let any in-flight
// classification job finish, then exit.
async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down...`);
  server.close();
  try {
    await stopQueue();
  } catch (error) {
    console.error("Error stopping the job queue", error);
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
