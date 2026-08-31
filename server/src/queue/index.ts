import { PgBoss } from "pg-boss";

import { registerAutoResolveTicketWorker } from "./auto-resolve-ticket-worker";
import { registerClassifyTicketWorker } from "./classify-ticket-worker";

// The queue that carries "classify this ticket" jobs. Kept as a shared constant
// so the enqueue side (the webhook) and the consume side (the worker) can never
// drift apart on the name.
export const CLASSIFY_TICKET_QUEUE = "classify-ticket";

// The queue that carries "try to auto-resolve this ticket from the knowledge
// base" jobs. Separate from classification so the two run independently: a slow
// or failing resolution never holds up categorizing the ticket, and vice versa.
export const AUTO_RESOLVE_TICKET_QUEUE = "auto-resolve-ticket";

// The shape of a classification job's payload. Only the ticket id travels on the
// queue — the worker re-reads the ticket from the database when it runs, so the
// job can never carry a stale subject/body and there is a single source of truth.
export interface ClassifyTicketJob {
  ticketId: string;
}

// The shape of an auto-resolve job's payload. As with classification, only the
// ticket id travels — the worker re-reads the ticket when it runs.
export interface AutoResolveTicketJob {
  ticketId: string;
}

// pg-boss stores its jobs in the same PostgreSQL database as the rest of the app
// (in a dedicated `pgboss` schema it creates and manages itself). That makes
// classification durable: a job survives a server restart, is retried on a
// transient failure, and is processed by a worker off the request path — instead
// of the previous fire-and-forget promise that vanished if the process died
// mid-classification.
//
// One boss instance per process, created lazily so importing this module never
// opens a connection: the `PgBoss` constructor only builds config, and nothing
// connects until `start()`. Tests that mock this module therefore pay no DB
// cost, and `app` can be imported (e.g. by supertest) without a running queue.
let boss: PgBoss | null = null;

function getBoss(): PgBoss {
  if (boss) return boss;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to start the job queue");
  }

  boss = new PgBoss({ connectionString });
  // A queue-level error (dropped connection, a failed maintenance pass) must
  // never crash the process — log it and let pg-boss recover on its own.
  boss.on("error", (error) => console.error("pg-boss error", error));
  return boss;
}

/**
 * Starts the job queue and registers the ticket-classification worker. Called
 * once on server boot. `start()` creates/migrates pg-boss's own schema and
 * `createQueue` is idempotent, so this is safe to run on every deploy against an
 * existing database. The retry policy set here is inherited by every job sent to
 * the queue.
 */
export async function startQueue(): Promise<void> {
  const instance = getBoss();
  await instance.start();
  await instance.createQueue(CLASSIFY_TICKET_QUEUE, {
    // A failed classification is usually a transient Ollama blip (the daemon
    // restarting, the model still loading), so retry a few times with
    // exponential backoff rather than giving up on the first miss. Once the
    // retries are exhausted the job is marked failed and the ticket simply stays
    // uncategorized — the same end state as before, but only after recovery has
    // genuinely been attempted.
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
  });
  await instance.createQueue(AUTO_RESOLVE_TICKET_QUEUE, {
    // Same rationale as classification: a failed auto-resolve attempt is usually
    // a transient model/daemon blip, so retry with backoff. Once retries are
    // exhausted the ticket is simply left open for a human — the safe default.
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
  });
  await registerClassifyTicketWorker(instance);
  await registerAutoResolveTicketWorker(instance);
}

/**
 * Stops the queue, letting in-flight jobs finish first (graceful). Called on
 * shutdown so a classification that is mid-flight isn't torn out from under the
 * worker.
 */
export async function stopQueue(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true });
  boss = null;
}

/**
 * Enqueues a durable job to classify the given ticket. Returns once the job is
 * persisted (a fast insert), not once classification runs — the actual work
 * happens later in the worker. Callers treat a rejected enqueue as non-fatal:
 * the ticket is already saved, and an agent can categorize it by hand.
 */
export async function enqueueTicketClassification(ticketId: string): Promise<void> {
  const payload: ClassifyTicketJob = { ticketId };
  await getBoss().send(CLASSIFY_TICKET_QUEUE, payload);
}

/**
 * Enqueues a durable job to attempt auto-resolving the given ticket from the
 * knowledge base. Like classification, this returns once the job is persisted,
 * not once the work runs, and a rejected enqueue is non-fatal to the caller: the
 * ticket is already saved and stays open for a human if the job never lands.
 */
export async function enqueueTicketAutoResolve(ticketId: string): Promise<void> {
  const payload: AutoResolveTicketJob = { ticketId };
  await getBoss().send(AUTO_RESOLVE_TICKET_QUEUE, payload);
}
