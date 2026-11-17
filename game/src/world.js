// Solmaris world: the whole game state and one fixed step. Player movement
// (on foot and in a car), stealing, combat, the wanted system, BUSTED /
// WASTED, the economy and shops, and the localStorage save. Rendering lives
// in render.js; this file only moves numbers.
import { MISSIONS, SAVE_KEY, SHOPS, STEP, TUNING, WEAPONS, WORLD_H, WORLD_W } from './config.js';
import { createRandom, angleDiff, clamp, dist2 } from './random.js';
import { buildCity, collideBuildings, nearestRoadPoint } from './city.js';
import { createTraffic, createPedestrians, createPolice, updateTraffic, updatePedestrians, updatePolice } from './entities.js';
import { createMissionState, currentMission, currentStep, missionMarker, noteKill, startMission, updateMissions } from './missions.js';

const CAR_COLORS = ['#c94f3d', '#3d7ac9', '#e0b13c', '#4fae62', '#8e6fc0', '#d8d8d8'];

export function createWorld(rng) {
  const city = buildCity(rng);
  const state = {
    rng, city,
    time: 0,
    player: {
      x: 1800, y: 920, angle: -Math.PI / 2, r: 14,
      health: 100, armor: 0, money: TUNING.startMoney,
      inCar: false, car: null, carAngle: 0, carSpeed: 0,
      weapon: 'fists', owned: { fists: true }, ammo: 0,
      attackCooldown: 0, hurtCooldown: 0, speed: 0,
    },
    traffic: createTraffic(rng, TUNING.trafficCount),
    peds: createPedestrians(rng, TUNING.pedCount),
    police: createPolice(),
    lookouts: [],
    wanted: 0,
    quietTime: 0,
    decayTimer: 0,
    bustedTimer: 0,
    busted: false,
    wasted: false,
    status: 'playing', // playing | busted | wasted | complete
    statusTimer: 0,
    missions: createMissionState(),
    interactHeld: false,
    shopOpen: null,
    particles: [],
    shotsFired: 0,
    carsStolen: 0,
    events: [],
  };
  startMission(state.missions, 0);
  return state;
}

export function saveGame(state) {
  try {
    const p = state.player;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      x: p.x, y: p.y, health: p.health, money: p.money,
      mission: state.missions.index, weapon: p.weapon,
      owned: p.owned, ammo: p.ammo, armor: p.armor,
    }));
  } catch { /* storage off: play on without saving */ }
}

export function loadGame(state) {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    const p = state.player;
    p.x = d.x ?? p.x; p.y = d.y ?? p.y;
    p.health = d.health ?? 100; p.money = d.money ?? TUNING.startMoney;
    p.weapon = d.weapon ?? 'fists'; p.owned = d.owned ?? { fists: true };
    p.ammo = d.ammo ?? 0; p.armor = d.armor ?? 0;
    if (typeof d.mission === 'number' && d.mission >= 0 && d.mission < MISSIONS.length) {
      startMission(state.missions, d.mission);
    }
    return true;
  } catch { return false; }
}

function spawnLookouts(state) {
  if (state.lookouts.length > 0) return;
  const spots = [[560, 1960], [680, 2040], [520, 2080]];
  for (const [x, y] of spots) {
    state.lookouts.push({ x, y, health: 50, shootTimer: state.rng.range(1, 2.5), angle: 0 });
  }
}

function addCrime(state, stars) {
  state.wanted = clamp(state.wanted + stars, 0, 5);
  state.quietTime = 0;
  state.decayTimer = 0;
}

function hurtPlayer(state, amount) {
  const p = state.player;
  if (p.hurtCooldown > 0) return;
  p.hurtCooldown = 0.5;
  let left = amount;
  if (p.armor > 0) { const absorbed = Math.min(p.armor, left); p.armor -= absorbed; left -= absorbed; }
  p.health -= left;
  if (p.health <= 0) {
    p.health = 0;
    state.wasted = true;
    state.status = 'wasted';
    state.statusTimer = 0;
  }
}

function nearestCar(state, x, y, maxD) {
  let best = null; let bestD = maxD * maxD;
  for (const c of state.traffic) {
    const d2 = dist2(x, y, c.x, c.y);
    if (d2 < bestD) { bestD = d2; best = c; }
  }
  return best;
}

function burst(state, x, y, color, n, speed) {
  for (let i = 0; i < n; i += 1) {
    const a = state.rng.range(0, Math.PI * 2);
    const s = state.rng.range(speed * 0.3, speed);
    state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, color });
  }
  if (state.particles.length > 220) state.particles.splice(0, state.particles.length - 220);
}

// --- Combat ---------------------------------------------------------------
function playerAttack(state, aimAngle) {
  const p = state.player;
  if (p.attackCooldown > 0) return;
  const w = WEAPONS[p.weapon];
  p.attackCooldown = w.rate;
  if (p.weapon === 'pistol') {
    if (p.ammo <= 0) { state.events.push('click'); return; }
    p.ammo -= 1;
    state.shotsFired += 1;
    state.events.push('shoot');
    addCrime(state, 1);
    const range = w.range;
    let hit = null; let hitD = range;
    const targets = [];
    for (const l of state.lookouts) targets.push({ x: l.x, y: l.y, r: 16, kind: 'lookout', ref: l });
    for (const f of state.police.foot) targets.push({ x: f.x, y: f.y, r: 14, kind: 'cop', ref: f });
    for (const ped of state.peds) targets.push({ x: ped.x, y: ped.y, r: 12, kind: 'ped', ref: ped });
    for (const t of targets) {
      const dx = t.x - p.x; const dy = t.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > range || d < 1) continue;
      const ang = Math.atan2(dy, dx);
      if (Math.abs(angleDiff(aimAngle, ang)) < 0.12 && d < hitD) { hit = t; hitD = d; }
    }
    const ex = p.x + Math.cos(aimAngle) * hitD;
    const ey = p.y + Math.sin(aimAngle) * hitD;
    burst(state, ex, ey, '#ffd34d', 5, 120);
    if (hit) {
      burst(state, hit.x, hit.y, '#c94f3d', 8, 160);
      if (hit.kind === 'lookout') {
        hit.ref.health -= w.damage;
        if (hit.ref.health <= 0) {
          state.lookouts = state.lookouts.filter((l) => l !== hit.ref);
          noteKill(state.missions);
          state.events.push('kill');
        }
      } else if (hit.kind === 'cop') {
        state.police.foot = state.police.foot.filter((f) => f !== hit.ref);
        addCrime(state, 2);
      } else {
        addCrime(state, 1);
        state.peds = state.peds.filter((q) => q !== hit.ref);
      }
    }
  } else {
    // Melee swing in an arc ahead of the player.
    state.events.push('punch');
    const reach = w.range;
    let struck = false;
    const tryHit = (t, r, onHit) => {
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d > reach + r) return;
      if (Math.abs(angleDiff(aimAngle, Math.atan2(t.y - p.y, t.x - p.x))) > 1.1) return;
      struck = true;
      onHit();
    };
    for (const l of [...state.lookouts]) {
      tryHit(l, 16, () => {
        l.health -= w.damage;
        burst(state, l.x, l.y, '#ffd34d', 6, 140);
        if (l.health <= 0) { state.lookouts = state.lookouts.filter((q) => q !== l); noteKill(state.missions); }
      });
    }
    for (const f of [...state.police.foot]) {
      tryHit(f, 14, () => {
        state.police.foot = state.police.foot.filter((q) => q !== f);
        addCrime(state, 2);
      });
    }
    for (const ped of [...state.peds]) {
      tryHit(ped, 12, () => {
        addCrime(state, 1);
        state.peds = state.peds.filter((q) => q !== ped);
      });
    }
    if (!struck) burst(state, p.x + Math.cos(aimAngle) * 30, p.y + Math.sin(aimAngle) * 30, '#ffffff', 2, 60);
  }
}

// --- Shops ----------------------------------------------------------------
export function shopNear(state) {
  const p = state.player;
  for (const s of SHOPS) {
    if (dist2(p.x, p.y, s.x, s.y) < 70 * 70) return s;
  }
  return null;
}

export function buyFromShop(state, shop, index) {
  const p = state.player;
  const good = shop.goods[index];
  if (!good || p.money < good.price) return false;
  p.money -= good.price;
  if (good.key === 'snack') p.health = Math.min(100, p.health + 40);
  else if (good.key === 'meal') p.health = 100;
  else if (good.key === 'bat') p.owned.bat = true;
  else if (good.key === 'vest') p.armor = Math.min(100, p.armor + 50);
  else if (good.key === 'pistol') { p.owned.pistol = true; p.ammo += 6; }
  else if (good.key === 'ammo') p.ammo += 12;
  state.events.push('cash');
  return true;
}

// --- Main step ------------------------------------------------------------
export function stepWorld(state, dt, input) {
  const p = state.player;
  state.time += dt;
  state.events = [];
  if (state.status !== 'playing') {
    state.statusTimer += dt;
    return state.events;
  }
  if (p.attackCooldown > 0) p.attackCooldown -= dt;
  if (p.hurtCooldown > 0) p.hurtCooldown -= dt;

  // Shop menu pauses the world while open.
  if (state.shopOpen) {
    if (input.shopChoice !== null && input.shopChoice !== undefined) {
      buyFromShop(state, state.shopOpen, input.shopChoice);
      input.shopChoice = null;
    }
    if (input.closeShop) { state.shopOpen = null; input.closeShop = false; }
    return state.events;
  }

  const mission = currentMission(state.missions);
  const step = currentStep(state.missions);
  if (mission && mission.id === 3 && step && step.type === 'shoot') spawnLookouts(state);

  // --- Player movement ---
  const ax = input.axisX;
  const ay = input.axisY;
  if (p.inCar && p.car) {
    const car = p.car;
    const prevX = car.x;
    const prevY = car.y;
    const throttle = ay < 0 ? 1 : ay > 0 ? -0.6 : 0; // W = forward
    if (throttle > 0) p.carSpeed += TUNING.carAccel * dt;
    else if (throttle < 0) {
      if (p.carSpeed > 5) p.carSpeed -= TUNING.carBrake * dt;
      else p.carSpeed -= TUNING.carAccel * 0.55 * dt;
    } else {
      p.carSpeed -= Math.sign(p.carSpeed) * Math.min(Math.abs(p.carSpeed), 140 * dt);
    }
    p.carSpeed = clamp(p.carSpeed, -TUNING.carReverseMax, TUNING.carMax);
    const steer = ax * TUNING.carTurn * clamp(Math.abs(p.carSpeed) / 160, 0, 1);
    p.carAngle += steer * dt * Math.sign(p.carSpeed || 1);
    car.x += Math.cos(p.carAngle) * p.carSpeed * dt;
    car.y += Math.sin(p.carAngle) * p.carSpeed * dt;
    car.angle = p.carAngle;
    car.x = clamp(car.x, 130, WORLD_W - 30);
    car.y = clamp(car.y, 30, WORLD_H - 30);
    p.x = car.x; p.y = car.y;
    p.speed = Math.abs(p.carSpeed);
    const carBody = { x: car.x, y: car.y, r: 20 };
    if (collideBuildings(state.city, carBody)) {
      // Slide, don't grind: go back to the last clear spot and lose speed,
      // so a nose-against-wall car can always steer away again.
      const wasFast = Math.abs(p.carSpeed) > 180;
      car.x = prevX; car.y = prevY; p.x = car.x; p.y = car.y;
      p.carSpeed *= 0.5;
      if (wasFast) { state.events.push('crash'); burst(state, car.x, car.y, '#ffb347', 10, 200); }
    }
    // Running over pedestrians is a crime.
    for (const ped of [...state.peds]) {
      if (Math.abs(p.carSpeed) > 120 && dist2(car.x, car.y, ped.x, ped.y) < 26 * 26) {
        state.peds = state.peds.filter((q) => q !== ped);
        burst(state, ped.x, ped.y, '#c94f3d', 8, 160);
        addCrime(state, 1);
      }
    }
  } else {
    const moving = ax !== 0 || ay !== 0;
    if (moving) {
      const len = Math.hypot(ax, ay) || 1;
      p.angle = Math.atan2(ay / len, ax / len);
      p.x += (ax / len) * TUNING.walkSpeed * dt;
      p.y += (ay / len) * TUNING.walkSpeed * dt;
      p.speed = TUNING.walkSpeed;
    } else {
      p.speed = 0;
    }
    p.x = clamp(p.x, 120, WORLD_W - 20);
    p.y = clamp(p.y, 20, WORLD_H - 20);
    collideBuildings(state.city, p);
    // Aim follows the mouse when armed; otherwise faces movement.
    if (input.aim) p.angle = input.aim;
  }

  // --- Interact: steal / exit car, open shop, hold at vault ---
  state.interactHeld = !!input.interactHeld;
  if (input.interact) {
    input.interact = false;
    const shop = shopNear(state);
    if (shop && !p.inCar) {
      state.shopOpen = shop;
      state.events.push('click');
    } else if (p.inCar && p.car) {
      // Step out beside the car.
      const car = p.car;
      car.stolen = false;
      p.inCar = false;
      p.car = null;
      p.x = car.x + Math.cos(p.carAngle + Math.PI / 2) * 26;
      p.y = car.y + Math.sin(p.carAngle + Math.PI / 2) * 26;
      p.carSpeed = 0;
      state.events.push('click');
    } else {
      const car = nearestCar(state, p.x, p.y, 64);
      if (car) {
        p.inCar = true;
        p.car = car;
        car.stolen = true;
        p.carAngle = car.angle;
        p.carSpeed = 0;
        p.x = car.x; p.y = car.y;
        state.carsStolen += 1;
        addCrime(state, 1);
        state.events.push('steal');
      }
    }
  }

  // --- Attack ---
  if (input.attack) {
    input.attack = false;
    if (!p.inCar) playerAttack(state, input.aim ?? p.angle);
    else if (Math.abs(p.carSpeed) > 60) {
      // Drive-by bump: shove nearby foot cops away.
      for (const f of [...state.police.foot]) {
        if (dist2(p.x, p.y, f.x, f.y) < 60 * 60) {
          state.police.foot = state.police.foot.filter((q) => q !== f);
          addCrime(state, 1);
        }
      }
    }
  }
  if (input.weapon) {
    if (p.owned[input.weapon]) p.weapon = input.weapon;
    input.weapon = null;
  }

  // --- Traffic, pedestrians, police ---
  const playerCar = p.inCar ? { x: p.x, y: p.y } : null;
  updateTraffic(state.traffic, dt, state.rng, playerCar);
  const dangers = [{ x: p.x, y: p.y, r: p.inCar && Math.abs(p.carSpeed) > 200 ? 170 : 60 }];
  if (state.shotsFired > 0) dangers.push({ x: p.x, y: p.y, r: 260 });
  updatePedestrians(state.peds, dt, state.rng, dangers);
  // Top up pedestrians so the streets stay alive.
  while (state.peds.length < TUNING.pedCount) {
    const fresh = createPedestrians(state.rng, 1);
    state.peds.push(fresh[0]);
  }
  updatePolice(state.police, dt, state.rng, { x: p.x, y: p.y, inCar: p.inCar, carAngle: p.carAngle, angle: p.angle }, state.wanted, state.city);

  // Cop cars ram the player; foot cops grab the player.
  for (const c of state.police.cars) {
    if (dist2(c.x, c.y, p.x, p.y) < 34 * 34) {
      if (p.inCar) {
        p.carSpeed *= 0.55;
        burst(state, p.x, p.y, '#ffb347', 6, 160);
        state.events.push('crash');
      } else {
        hurtPlayer(state, 8);
      }
      // Shove the cop car back so it does not stick.
      c.x -= Math.cos(c.angle) * 30;
      c.y -= Math.sin(c.angle) * 30;
    }
  }
  if (!p.inCar) {
    let touching = false;
    for (const f of state.police.foot) {
      if (dist2(f.x, f.y, p.x, p.y) < 26 * 26) { touching = true; break; }
    }
    if (touching && state.wanted > 0) {
      state.bustedTimer += dt;
      if (state.bustedTimer > 1.2) {
        state.busted = true;
        state.status = 'busted';
        state.statusTimer = 0;
        p.money = Math.max(0, p.money - TUNING.bustedFine);
        state.wanted = 0;
        state.events.push('busted');
      }
    } else {
      state.bustedTimer = 0;
    }
  }

  // Lookouts shoot back at the player.
  for (const l of state.lookouts) {
    l.shootTimer -= dt;
    const d = Math.hypot(p.x - l.x, p.y - l.y);
    if (d < 380 && l.shootTimer <= 0) {
      l.shootTimer = state.rng.range(1.4, 2.6);
      l.angle = Math.atan2(p.y - l.y, p.x - l.x);
      if (state.rng.chance(0.55)) hurtPlayer(state, 9);
      burst(state, l.x + Math.cos(l.angle) * 22, l.y + Math.sin(l.angle) * 22, '#ffd34d', 3, 100);
    }
  }

  // --- Wanted decay: quiet + unseen = the heat fades. ---
  state.quietTime += dt;
  if (state.wanted > 0 && state.quietTime > TUNING.wantedDecayQuiet) {
    let seen = false;
    for (const c of state.police.cars) if (dist2(c.x, c.y, p.x, p.y) < 260 * 260) { seen = true; break; }
    if (!seen) {
      for (const f of state.police.foot) if (dist2(f.x, f.y, p.x, p.y) < 200 * 200) { seen = true; break; }
    }
    if (!seen) {
      state.decayTimer += dt;
      if (state.decayTimer > TUNING.wantedDecayPerStar) {
        state.wanted -= 1;
        state.decayTimer = 0;
        if (state.wanted === 0) state.quietTime = 0;
      }
    } else {
      state.decayTimer = 0;
    }
  }

  // --- Missions ---
  const result = updateMissions(state.missions, dt, state);
  if (result) {
    p.money += result.reward;
    state.events.push('mission');
    saveGame(state);
  }

  // Health regen out of trouble.
  if (state.wanted === 0 && p.health > 0 && p.health < 100) p.health = Math.min(100, p.health + 1.2 * dt);

  // Particles.
  for (const pt of state.particles) {
    pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);

  // Periodic autosave.
  if (Math.floor(state.time) % 20 === 0 && Math.floor(state.time - dt) % 20 !== 0) saveGame(state);

  return state.events;
}

export function respawnAfterBusted(state) {
  const p = state.player;
  p.x = 1800; p.y = 920; p.health = 100; p.inCar = false; p.car = null; p.carSpeed = 0;
  state.police.cars = []; state.police.foot = []; state.police.roadblocks = [];
  state.busted = false; state.wasted = false; state.status = 'playing'; state.statusTimer = 0;
  state.bustedTimer = 0;
}

export function restartWorld(state) {
  const fresh = createWorld(state.rng);
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, fresh);
  state.status = 'playing';
}
