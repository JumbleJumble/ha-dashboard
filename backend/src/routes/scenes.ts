import type { FastifyInstance } from "fastify";
import { deleteScene, getScene, listScenes, upsertScene } from "../scenes.js";
import type { Scene } from "../types/config.js";

export async function registerSceneRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { roomId: string } }>(
    "/api/rooms/:roomId/scenes",
    async (req) => listScenes(req.params.roomId),
  );

  app.get<{ Params: { roomId: string; sceneId: string } }>(
    "/api/rooms/:roomId/scenes/:sceneId",
    async (req, reply) => {
      const scene = await getScene(req.params.roomId, req.params.sceneId);
      if (!scene) return reply.code(404).send({ error: "not_found" });
      return scene;
    },
  );

  app.put<{ Params: { roomId: string; sceneId: string }; Body: Scene }>(
    "/api/rooms/:roomId/scenes/:sceneId",
    async (req, reply) => {
      const { roomId, sceneId } = req.params;
      const incoming = req.body;
      const scene: Scene = { ...incoming, id: sceneId, roomId };
      try {
        return await upsertScene(scene);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.code(400).send({ error: "invalid_scene", message });
      }
    },
  );

  app.delete<{ Params: { roomId: string; sceneId: string } }>(
    "/api/rooms/:roomId/scenes/:sceneId",
    async (req, reply) => {
      const ok = await deleteScene(req.params.roomId, req.params.sceneId);
      if (!ok) return reply.code(404).send({ error: "not_found" });
      return { ok: true };
    },
  );
}
