export type HaEntity = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & { friendly_name?: string };
  last_changed: string;
  last_updated: string;
};

export type HaConfig = {
  url: string;
  token: string;
};

export function readHaConfig(): HaConfig | null {
  const url = process.env.HA_URL;
  const token = process.env.HA_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export async function fetchStates(cfg: HaConfig): Promise<HaEntity[]> {
  const res = await fetch(`${cfg.url}/api/states`, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`HA /api/states returned ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as HaEntity[];
}

export function groupByDomain(entities: HaEntity[]): Map<string, HaEntity[]> {
  const groups = new Map<string, HaEntity[]>();
  for (const e of entities) {
    const domain = e.entity_id.split(".")[0] ?? "unknown";
    const list = groups.get(domain) ?? [];
    list.push(e);
    groups.set(domain, list);
  }
  return new Map(
    [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([domain, list]) => [
        domain,
        list.sort((a, b) => a.entity_id.localeCompare(b.entity_id)),
      ]),
  );
}

export function logEntitiesByDomain(entities: HaEntity[]): void {
  const groups = groupByDomain(entities);
  console.log(
    `[ha] discovered ${entities.length} entities across ${groups.size} domains`,
  );
  const interesting = ["light", "switch", "scene", "binary_sensor", "sensor", "automation"];
  for (const domain of interesting) {
    const list = groups.get(domain);
    if (!list || list.length === 0) continue;
    console.log(`\n[ha] ${domain} (${list.length}):`);
    for (const e of list) {
      const name = e.attributes.friendly_name ?? "";
      console.log(`  ${e.entity_id.padEnd(45)} ${e.state.padEnd(15)} ${name}`);
    }
  }
  const other = [...groups.keys()].filter((d) => !interesting.includes(d));
  if (other.length > 0) {
    console.log(`\n[ha] other domains present: ${other.join(", ")}`);
  }
}
