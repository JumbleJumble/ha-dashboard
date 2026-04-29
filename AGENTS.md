# Agent notes

Notes that future sessions should know when helping with this repo. Keep
entries short and concrete.

## Room layouts

### Kitchen

Physical layout, one end → other end:

- **Table end** — `light.hall_door`, plus `light.table_a`, `light.table_b`,
  `light.table_c`, `light.table_d` (lamps *above* the table).
- **Gap** — `light.gap_a`, `light.gap_b` (between table and breakfast bar).
- **Bar** — `light.bar_a`, `light.bar_b` (breakfast bar).
- **Cooking end** — `light.hob_a`, `light.hob_b`, `light.sink_a`,
  `light.sink_b`, `light.utility_door`.

These four groupings ("Table", "Gap", "Bar", "Cooking") are **not** formalised
in `rooms.json` or anywhere else — they're a mental model for designing
scenes via chat. When the user says something like "set the table lights
warm and dim the cooking end", translate into the corresponding entity lists
above.
