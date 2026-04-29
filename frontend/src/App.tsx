import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import { connectToHa, fetchHaConfig } from "@/ha/connection";
import { useEntityStore } from "@/store/entities";
import { DashboardPage } from "@/pages/DashboardPage";
import { HomePage } from "@/pages/HomePage";
import { KaraRoomPage } from "@/pages/KaraRoomPage";
import { KitchenRoomPage } from "@/pages/KitchenRoomPage";
import { RoomPage } from "@/pages/RoomPage";
import { SceneEditorPage } from "@/pages/SceneEditorPage";
import { ScenePickerPage } from "@/pages/ScenePickerPage";

export function App(): JSX.Element {
  useEffect(() => {
    let cancelled = false;
    fetchHaConfig()
      .then((cfg) => {
        if (cancelled) return;
        return connectToHa(cfg);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        useEntityStore.getState().setStatus({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <BrowserRouter>
      <ConnectionStatusBadge />
      <Routes>
        <Route path="/" element={<HomePage />} />
        {/* Rooms with a fully bespoke dashboard get their own top-level route so
            they never share a component instance (or hook graph) with the
            generic RoomPage. Diagnostics for those rooms still falls through
            to the shared RoomPage view below. */}
        <Route path="/room/kara" element={<KaraRoomPage />} />
        <Route path="/room/kitchen" element={<KitchenRoomPage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
        <Route path="/room/:roomId/diagnostics" element={<RoomPage diagnostics />} />
        <Route path="/dashboards/:dashId" element={<DashboardPage />} />
        <Route path="/scenes" element={<ScenePickerPage />} />
        <Route path="/scenes/:roomId" element={<SceneEditorPage />} />
      </Routes>
    </BrowserRouter>
  );
}
