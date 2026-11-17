// Solmaris city: the road graph (9 avenues x 7 streets), the buildings that
// fill every block, the open plazas where missions happen, the shops, and the
// district lookup. Built once from the seeded RNG; everything else reads it.
import { AVENUES, DISTRICTS, DISTRICT_COLORS, ROAD_HALF, SHOPS, STREETS, WORLD_H, WORLD_W } from './config.js';

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[2];
}

export function buildCity(rng) {
  const buildings = [];
  // One or two buildings per block, inset from the roads, never on a plaza.
  const plazas = [
    { x: 1800, y: 920, r: 110, name: 'Palm Court Plaza' },
    { x: 600, y: 560, r: 100, name: 'Marina Steps' },
    { x: 600, y: 920, r: 100, name: 'Marina Vault Square' },
    { x: 1800, y: 1640, r: 110, name: 'Hideout Court' },
    { x: 1000, y: 2000, r: 100, name: 'Harbor Yard' },
  ];
  function inPlaza(x, y, w, h) {
    for (const p of plazas) {
      if (x < p.x + p.r && x + w > p.x - p.r && y < p.y + p.r && y + h > p.y - p.r) return true;
    }
    return false;
  }
  for (let i = 0; i < AVENUES.length - 1; i += 1) {
    for (let j = 0; j < STREETS.length - 1; j += 1) {
      const x0 = AVENUES[i] + ROAD_HALF + 14;
      const x1 = AVENUES[i + 1] - ROAD_HALF - 14;
      const y0 = STREETS[j] + ROAD_HALF + 14;
      const y1 = STREETS[j + 1] - ROAD_HALF - 14;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      const colors = DISTRICT_COLORS[district.name];
      const count = rng.chance(0.45) ? 2 : 1;
      for (let k = 0; k < count; k += 1) {
        let w; let h; let x; let y;
        if (count === 1) { w = rng.range(150, x1 - x0 - 20); h = rng.range(120, y1 - y0 - 20); x = x0 + (x1 - x0 - w) / 2; y = y0 + (y1 - y0 - h) / 2; }
        else {
          w = (x1 - x0) / 2 - 24; h = rng.range(110, y1 - y0 - 20);
          x = k === 0 ? x0 + 8 : x0 + (x1 - x0) / 2 + 16;
          y = y0 + (y1 - y0 - h) / 2;
        }
        if (inPlaza(x, y, w, h)) continue;
        buildings.push({
          x, y, w, h,
          height: rng.range(10, district.name === 'Coral Heights' ? 46 : 30),
          color: rng.pick(colors),
          district: district.name,
          windows: rng.int(2, 5),
        });
      }
    }
  }
  // Marina water strip along the west edge + a beach; the harbor basin south-west.
  const water = [
    { x: 0, y: 0, w: 110, h: WORLD_H },
    { x: 0, y: 2360, w: 700, h: 240 },
  ];
  return { buildings, plazas, water, shops: SHOPS };
}

// Is the point on a road (drivable / walkable) rather than inside a block?
export function onRoad(x, y) {
  for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_HALF + 6) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_HALF + 6) return true;
  return false;
}

// Push a circle (x, y, r) out of every building it overlaps. Returns true on hit.
export function collideBuildings(city, body) {
  let hit = false;
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - nx;
    const dy = body.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < body.r * body.r) {
      hit = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        body.x = nx + (dx / d) * body.r;
        body.y = ny + (dy / d) * body.r;
      } else {
        body.y = b.y - body.r;
      }
    }
  }
  return hit;
}

// Nearest point on the road graph to (x, y) — used to spawn cars and cops.
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const ax of AVENUES) {
    const d = Math.abs(x - ax);
    if (d < bestD) { bestD = d; best = { x: ax, y, vertical: true }; }
  }
  for (const sy of STREETS) {
    const d = Math.abs(y - sy);
    if (d < bestD) { bestD = d; best = { x, y: sy, vertical: false }; }
  }
  return best;
}
