/* ------------------------------ Gradients ------------------------------ */

export type GradientChannelStop<V> = { at: number; value: V };

export type GradientChannels = {
  brightness?: GradientChannelStop<number>[];
  kelvin?: GradientChannelStop<number>[];
  rgb?: GradientChannelStop<[number, number, number]>[];
  hs?: GradientChannelStop<[number, number]>[];
};

export type Gradient = {
  channels: GradientChannels;
  /** Optional visual-only override. When present, gradient tracks/swatches
   *  render from these channels instead of `channels`. The functional values
   *  sent to bulbs always come from `channels`. Useful when you want e.g. a
   *  cooler-looking Kelvin slider than the lights' real max temperature. */
  displayChannels?: GradientChannels;
};

export type GradientsFile = {
  gradients: Record<string, Gradient>;
};

/* ------------------------------ Widgets ------------------------------ */

/** As written in rooms.json — the gradient widget can either inline its
 *  channels or reference a named gradient from gradients.json. */
export type RoomWidgetConfig =
  | { type: "group-toggle" }
  | { type: "group-brightness" }
  | { type: "group-color-temp" }
  | {
      type: "gradient";
      label: string;
      /** Either `gradient` (ref into gradients.json) or `channels` (inline). */
      gradient?: string;
      channels?: GradientChannels;
      displayChannels?: GradientChannels;
    }
  | { type: "climate"; entityId: string };

/** Resolved form sent to the frontend. Gradient refs have been expanded. */
export type RoomWidget =
  | { type: "group-toggle" }
  | { type: "group-brightness" }
  | { type: "group-color-temp" }
  | {
      type: "gradient";
      label: string;
      channels: GradientChannels;
      displayChannels?: GradientChannels;
    }
  | { type: "climate"; entityId: string };

export type RoomDashboardPage = {
  label?: string;
  widgets: RoomWidget[];
};

export type RoomDashboardPageConfig = {
  label?: string;
  widgets: RoomWidgetConfig[];
};

export type RoomDashboard = {
  /** Optional HA group (or Zigbee group exposed as a light) entity id.
   *  When set, dashboard widgets issue service calls against this single
   *  entity instead of iterating over every bulb — gives one Zigbee
   *  group-broadcast per command instead of N per-bulb messages. */
  group?: string;
  pages: RoomDashboardPage[];
};

export type RoomDashboardConfig = {
  group?: string;
  pages: RoomDashboardPageConfig[];
};

export type Room = {
  id: string;
  label: string;
  entities: string[];
  dashboard?: RoomDashboard;
};

export type RoomConfig = {
  id: string;
  label: string;
  entities: string[];
  dashboard?: RoomDashboardConfig;
};

export type DashboardSection = {
  label?: string;
  entities: string[];
};

export type Dashboard = {
  id: string;
  label: string;
  sections: DashboardSection[];
};

export type RoomsFile = {
  rooms: RoomConfig[];
};

export type DashboardsFile = {
  dashboards: Dashboard[];
};

/* ------------------------------ Scenes ------------------------------ */

/** Per-group target state in a scene. Mutually exclusive: if `rgb` is set
 *  we target a colour; otherwise `kelvin` drives colour temperature. */
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

export type ScenesFile = {
  scenes: Scene[];
};
