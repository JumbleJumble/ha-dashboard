import type { FastifyInstance } from "fastify";
import { loadDashboards, loadRooms } from "../config.js";
import { readHaConfig } from "../ha/client.js";

export async function registerConfigRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/config/ha", async (_req, reply) => {
    const cfg = readHaConfig();
    if (!cfg) {
      return reply.code(503).send({
        error: "ha_not_configured",
        message: "HA_URL and HA_TOKEN environment variables are not set",
      });
    }
    return { url: cfg.url, token: cfg.token };
  });

  app.get("/api/rooms", async () => {
    return loadRooms();
  });

  app.get<{ Params: { roomId: string } }>("/api/rooms/:roomId", async (req, reply) => {
    const rooms = await loadRooms();
    const room = rooms.find((r) => r.id === req.params.roomId);
    if (!room) return reply.code(404).send({ error: "not_found" });
    return room;
  });

  app.get("/api/dashboards", async () => {
    const dashboards = await loadDashboards();
    return dashboards.map(({ id, label }) => ({ id, label }));
  });

  app.get<{ Params: { dashId: string } }>("/api/dashboards/:dashId", async (req, reply) => {
    const dashboards = await loadDashboards();
    const dash = dashboards.find((d) => d.id === req.params.dashId);
    if (!dash) return reply.code(404).send({ error: "not_found" });
    return dash;
  });
}
