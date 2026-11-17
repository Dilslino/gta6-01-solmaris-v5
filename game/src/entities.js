// Traffic, pedestrians, police and the helicopter: every moving actor that
// is not the player. Traffic follows the road graph and turns at
// intersections; pedestrians walk the sidewalks and run from danger; police
// chase and ram; the helicopter circles and paints a searchlight.
import { AVENUES, STREETS, TUNING, WORLD_H, WORLD_W } from './config.js';
import { collideBuildings } from './city.js';
import { angleDiff, clamp, dist2 } from './random.js';

const CAR_COLORS = ['#c94f3d', '#3d7ac9', '#e0b13c', '#4fae62', '#8e6fc0', '#d8d8d8', '#2e2e34', '#c97b3d'];
const PED_COLORS = ['#e2703a', '#3f6d8e', '#7a5fd0', '#4fae62', '#c94f7a', '#2e8e7a', '#d8a03c'];

function randomRoadSpot(rng) {
  if (rng.chance(0.5)) {
    return { x: rng.pick(AVENUES), y: rng.range(120, WORLD_H - 120), vertical: true, dir: rng.chance(0.5) ? 1 : -1 };
  }
  return { x: rng.range(120, WORLD_W - 120), y: rng.pick(STREETS), vertical: false, dir: rng.chance(0.5) ? 1 : -1 };
}

export function createTraffic(rng, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const s = randomRoadSpot(rng);
    cars.push({
      id: i, x: s.x, y: s.y, vertical: s.vertical, dir: s.dir,
      speed: rng.range(120, 185), color: rng.pick(CAR_COLORS),
      angle: s.vertical ? (s.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (s.dir > 0 ? 0 : Math.PI),
      lane: rng.chance(0.5) ? 10 : -10, wait: 0,
    });
  }
  return cars;
}

export function updateTraffic(cars, dt, rng, playerCar) {
  for (const c of cars) {
    if (c.stolen) continue; // the player is driving this one
    // Slow down for a car (or the player) directly ahead.
    let ahead = false;
    for (const o of cars) {
      if (o === c) continue;
      const dx = o.x - c.x; const dy = o.y - c.y;
      const forward = c.vertical ? dy * c.dir : dx * c.dir;
      const side = c.vertical ? Math.abs(dx) : Math.abs(dy);
      if (forward > 0 && forward < 70 && side < 26) { ahead = true; break; }
    }
    if (playerCar && !ahead) {
      const dx = playerCar.x - c.x; const dy = playerCar.y - c.y;
      const forward = c.vertical ? dy * c.dir : dx * c.dir;
      const side = c.vertical ? Math.abs(dx) : Math.abs(dy);
      if (forward > 0 && forward < 80 && side < 30) ahead = true;
    }
    const target = ahead ? 0 : c.speed;
    c.wait = ahead ? c.wait + dt : 0;
    const cur = c.vertical ? Math.abs(c.vy || c.speed) : c.speed;
    const speed = Math.max(0, Math.min(target, (c.curSpeed ?? c.speed) + (target - (c.curSpeed ?? c.speed)) * Math.min(1, dt * 2)));
    c.curSpeed = speed;
    if (c.vertical) c.y += c.dir * speed * dt;
    else c.x += c.dir * speed * dt;
    // At an intersection, sometimes turn onto the crossing road.
    const onAve = AVENUES.some((ax) => Math.abs(c.x - ax) < 6);
    const onSt = STREETS.some((sy) => Math.abs(c.y - sy) < 6);
    if (onAve && onSt && rng.chance(dt * 0.55)) {
      if (c.vertical && rng.chance(0.5)) {
        c.vertical = false;
        c.y = STREETS.reduce((a, b) => (Math.abs(b - c.y) < Math.abs(a - c.y) ? b : a));
        c.dir = rng.chance(0.5) ? 1 : -1;
      } else if (!c.vertical && rng.chance(0.5)) {
        c.vertical = true;
        c.x = AVENUES.reduce((a, b) => (Math.abs(b - c.x) < Math.abs(a - c.x) ? b : a));
        c.dir = rng.chance(0.5) ? 1 : -1;
      }
    }
    c.angle += angleDiff(c.angle, c.vertical ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI)) * Math.min(1, dt * 6);
    // Wrap around the far edge so the streets never empty out.
    if (c.x < 60) c.x = WORLD_W - 60;
    if (c.x > WORLD_W - 60) c.x = 60;
    if (c.y < 60) c.y = WORLD_H - 60;
    if (c.y > WORLD_H - 60) c.y = 60;
    void cur;
  }
}

export function createPedestrians(rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const s = randomRoadSpot(rng);
    peds.push({
      id: i, x: clamp(s.x + (s.vertical ? 44 : 0), 40, WORLD_W - 40),
      y: clamp(s.y + (s.vertical ? 0 : 44), 40, WORLD_H - 40),
      angle: rng.range(0, Math.PI * 2), speed: rng.range(38, 62),
      color: rng.pick(PED_COLORS), flee: 0, panic: 0, walkPhase: rng.range(0, 6),
    });
  }
  return peds;
}

export function updatePedestrians(peds, dt, rng, dangers) {
  for (const p of peds) {
    let fx = 0; let fy = 0; let scared = false;
    for (const d of dangers) {
      const d2 = dist2(p.x, p.y, d.x, d.y);
      if (d2 < d.r * d.r) {
        const dist = Math.sqrt(d2) || 1;
        fx += (p.x - d.x) / dist; fy += (p.y - d.y) / dist;
        scared = true;
      }
    }
    if (scared) { p.flee = 2.5; p.panic = Math.min(3, p.panic + dt); }
    if (p.flee > 0) {
      p.flee -= dt;
      const len = Math.hypot(fx, fy) || 1;
      p.angle = Math.atan2(fy / len, fx / len);
      p.x += Math.cos(p.angle) * 150 * dt;
      p.y += Math.sin(p.angle) * 150 * dt;
    } else {
      p.walkPhase += dt * 6;
      p.x += Math.cos(p.angle) * p.speed * dt;
      p.y += Math.sin(p.angle) * p.speed * dt;
      if (rng.chance(dt * 0.25)) p.angle += rng.range(-1.2, 1.2);
      if (p.x < 130 || p.x > WORLD_W - 40 || p.y < 40 || p.y > WORLD_H - 40) p.angle += Math.PI;
    }
    p.x = clamp(p.x, 120, WORLD_W - 20);
    p.y = clamp(p.y, 20, WORLD_H - 20);
  }
}

// --- Police ---------------------------------------------------------------
export function createPolice() {
  return { cars: [], foot: [], roadblocks: [], heli: null, heliAngle: 0 };
}

export function updatePolice(police, dt, rng, player, wanted, city) {
  const wantCars = wanted === 0 ? 0 : Math.min(TUNING.copCarMax, 1 + wanted);
  // Spawn cop cars at road points near the player, off-screen-ish.
  while (police.cars.length < wantCars) {
    const a = rng.range(0, Math.PI * 2);
    const px = clamp(player.x + Math.cos(a) * rng.range(500, 800), 150, WORLD_W - 150);
    const py = clamp(player.y + Math.sin(a) * rng.range(500, 800), 150, WORLD_H - 150);
    police.cars.push({ x: px, y: py, angle: 0, speed: 0, color: '#1c2f4a', siren: rng.next() });
  }
  while (police.cars.length > wantCars) police.cars.pop();
  for (const c of police.cars) {
    const want = Math.atan2(player.y - c.y, player.x - c.x);
    c.angle += clamp(angleDiff(c.angle, want), -2.4 * dt, 2.4 * dt);
    const target = 330 + wanted * 18;
    c.speed += (target - c.speed) * Math.min(1, dt * 1.2);
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    c.siren += dt;
    if (city) {
      const body = { x: c.x, y: c.y, r: 20 };
      if (collideBuildings(city, body)) { c.x = body.x; c.y = body.y; c.speed *= 0.6; }
    }
  }
  // Foot cops when the player is on foot and wanted.
  const wantFoot = wanted > 0 && !player.inCar ? Math.min(3, wanted) : 0;
  while (police.foot.length < wantFoot) {
    const a = rng.range(0, Math.PI * 2);
    police.foot.push({ x: clamp(player.x + Math.cos(a) * 300, 130, WORLD_W - 130), y: clamp(player.y + Math.sin(a) * 300, 60, WORLD_H - 60), speed: 150 + wanted * 8 });
  }
  while (police.foot.length > wantFoot) police.foot.pop();
  for (const f of police.foot) {
    const a = Math.atan2(player.y - f.y, player.x - f.x);
    f.x += Math.cos(a) * f.speed * dt;
    f.y += Math.sin(a) * f.speed * dt;
  }
  // Roadblocks at wanted >= 3: two parked cop cars across the road ahead.
  if (wanted >= 3 && police.roadblocks.length === 0) {
    const ahead = player.inCar ? player.carAngle : player.angle;
    const bx = player.x + Math.cos(ahead) * 420;
    const by = player.y + Math.sin(ahead) * 420;
    police.roadblocks = [
      { x: bx, y: by, angle: ahead + Math.PI / 2 },
      { x: bx + Math.cos(ahead + Math.PI / 2) * 46, y: by + Math.sin(ahead + Math.PI / 2) * 46, angle: ahead + Math.PI / 2 },
    ];
  }
  if (wanted < 3) police.roadblocks = [];
  // Helicopter at wanted >= 4.
  if (wanted >= 4) {
    if (!police.heli) police.heli = { x: player.x, y: player.y - 260 };
    police.heliAngle += dt * 0.55;
    const tx = player.x + Math.cos(police.heliAngle) * 190;
    const ty = player.y + Math.sin(police.heliAngle) * 190 - 60;
    police.heli.x += (tx - police.heli.x) * Math.min(1, dt * 1.5);
    police.heli.y += (ty - police.heli.y) * Math.min(1, dt * 1.5);
  } else {
    police.heli = null;
  }
}
