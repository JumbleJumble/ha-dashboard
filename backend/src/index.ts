import cors from "@fastify/cors";
import Fastify, { type FastifyBaseLogger } from "fastify";
import { configDir } from "./config.js";
import { fetchStates, logEntitiesByDomain, readHaConfig } from "./ha/client.js";
import { registerConfigRoutes } from "./routes/config.js";
import { registerSceneRoutes } from "./routes/scenes.js";

const PORT = Number(process.env.PORT ?? 5000);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main(): Promise<void> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
  });

  // Any unhandled rejection or synchronous throw outside a request handler
  // would otherwise take the process down silently (or with a bare stack).
  // We want loud, structured logs *and* a clean non-zero exit so the eventual
  // Docker restart policy can take over. Exiting after a small delay lets
  // pino flush its buffered writes first.
  installProcessLevelCrashHandlers(app.log);

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  app.get("/api/health", async () => ({ status: "ok" }));

  await registerConfigRoutes(app);
  await registerSceneRoutes(app);

  // Last-resort error hook: logs every error that escapes a route handler
  // with the request context attached, so we can correlate a crash with the
  // URL/method/ip that triggered it.
  app.setErrorHandler((err, req, reply) => {
    req.log.error(
      {
        err: serialiseError(err),
        method: req.method,
        url: req.url,
      },
      "unhandled route error",
    );
    if (!reply.sent) {
      void reply.status(500).send({ error: "internal_error" });
    }
  });

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`config dir: ${configDir()}`);
  } catch (err) {
    app.log.error({ err }, "failed to start server");
    process.exit(1);
  }

  discoverEntities().catch((err) => {
    app.log.warn({ err: err instanceof Error ? err.message : err }, "entity discovery failed");
  });
}

async function discoverEntities(): Promise<void> {
  const cfg = readHaConfig();
  if (!cfg) {
    console.warn(
      "\n[ha] HA_URL or HA_TOKEN not set — skipping entity discovery.\n" +
        "     Copy .env.example to .env and fill in values to see your entities listed here.\n",
    );
    return;
  }
  try {
    const states = await fetchStates(cfg);
    logEntitiesByDomain(states);
  } catch (err) {
    console.warn(
      `\n[ha] entity discovery failed: ${err instanceof Error ? err.message : err}\n` +
        "     Check HA_URL, HA_TOKEN, and that Home Assistant is reachable.\n",
    );
  }
}

/**
 * Catch anything that escapes request handling. Log it loudly, then exit so
 * the supervisor (Docker restart policy, systemd, nodemon in dev, ...) brings
 * us back up in a known-good state rather than leaving us limping along with
 * half-torn-down internals.
 */
function installProcessLevelCrashHandlers(log: FastifyBaseLogger): void {
  const exitSoon = (code: number) => {
    // Give pino ~250ms to flush the final log line to stdout before we die.
    setTimeout(() => process.exit(code), 250).unref();
  };
  process.on("uncaughtException", (err) => {
    log.fatal({ err: serialiseError(err) }, "uncaughtException");
    exitSoon(1);
  });
  process.on("unhandledRejection", (reason) => {
    log.fatal({ err: serialiseError(reason) }, "unhandledRejection");
    exitSoon(1);
  });
  process.on("warning", (w) => {
    log.warn({ warning: { name: w.name, message: w.message, stack: w.stack } }, "process warning");
  });
  process.on("SIGTERM", () => {
    log.info("received SIGTERM — shutting down");
    exitSoon(0);
  });
  process.on("SIGINT", () => {
    log.info("received SIGINT — shutting down");
    exitSoon(0);
  });
}

/** Pull the useful fields off an error-shaped value into something pino can render. */
function serialiseError(e: unknown): Record<string, unknown> {
  if (e instanceof Error) {
    return { name: e.name, message: e.message, stack: e.stack };
  }
  return { raw: typeof e === "string" ? e : JSON.stringify(e) };
}

main().catch((err) => {
  // Main itself can reject (e.g. during plugin registration) before we've
  // set up Fastify's error hook. Fall back to console so we still get
  // something useful before the process dies.
  console.error("fatal: startup failed", err);
  process.exit(1);
});
