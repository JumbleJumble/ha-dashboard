export type HaEntityState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & {
    friendly_name?: string;
    brightness?: number;
    color_temp_kelvin?: number;
    supported_color_modes?: string[];
    device_class?: string;
    unit_of_measurement?: string;
  };
  last_changed: string;
  last_updated: string;
};

export type GradientChannelStop<V> = { at: number; value: V };

export type GradientChannels = {
  brightness?: GradientChannelStop<number>[];
  kelvin?: GradientChannelStop<number>[];
  rgb?: GradientChannelStop<[number, number, number]>[];
  hs?: GradientChannelStop<[number, number]>[];
};

export type RoomWidget =
  | { type: "group-toggle" }
  | { type: "group-brightness" }
  | { type: "group-color-temp" }
  | {
      type: "gradient";
      label: string;
      channels: GradientChannels;
      /** Visual-only channels. When present, the slider track renders from
       *  these; the functional values sent to lights come from `channels`. */
      displayChannels?: GradientChannels;
    }
  | { type: "climate"; entityId: string };

export type RoomDashboardPage = {
  label?: string;
  widgets: RoomWidget[];
};

export type RoomDashboard = {
  /** Optional HA group / Zigbee group entity id. When set, dashboard
   *  widgets fire service calls at this single entity instead of iterating
   *  over individual bulbs. */
  group?: string;
  pages: RoomDashboardPage[];
};

export type Room = {
  id: string;
  label: string;
  entities: string[];
  dashboard?: RoomDashboard;
};

export type DashboardSection = {
  label?: string;
  entities: string[];
};

export type DashboardSummary = {
  id: string;
  label: string;
};

export type Dashboard = DashboardSummary & {
  sections: DashboardSection[];
};

export type HaClientConfig = {
  url: string;
  token: string;
};

/* ------------------------------ Scenes ------------------------------ */

export type SceneState = {
  brightness?: number; // 0-100 %
  kelvin?: number;
  rgb?: [number, number, number];
};

export type SceneGroup = {
  id: string;
  lights: string[];
  state: SceneState;
};

export type Scene = {
  id: string;
  name: string;
  roomId: string;
  groups: SceneGroup[];
};

export type HaConnectionStatus =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "reconnecting"; attempt: number }
  | { kind: "error"; message: string };
