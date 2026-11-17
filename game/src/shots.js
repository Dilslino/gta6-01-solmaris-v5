// Deterministic screenshot scenes behind ?shot=title|driving|chase|mission.
// Each one plays the real rules forward from a fresh world for a fixed
// number of steps, steered by a route-following autopilot (waypoints on the
// road graph, slowing for sharp turns, so the car never grinds into a
// building), so the frame is what real play looks like and the same seed
// always gives the same frame.
import { STEP } from './config.js';
import { stepWorld } from './world.js';
import { SCREEN_TITLE, SCREEN_PLAY } from './render.js';

// The autopilot: follow a route of road waypoints. Steer toward the current
// one, ease off the throttle for sharp turns, brake when the turn is very
// sharp — a full-speed U-turn would swing off the road.
function makePilot(route) {
  let wp = 0;
  let reverseTime = 0;
  let trailX = 0;
  let trailY = 0;
  let trailAge = 0;
  return function driveInput(world) {
    const p = world.player;
    const input = { axisX: 0, axisY: 0, interact: false, interactHeld: false, attack: false, aim: null, weapon: null, shopChoice: null, closeShop: false };
    if (!p.inCar) {
      // Walk toward the nearest traffic car and steal it.
      let best = null; let bestD = Infinity;
      for (const c of world.traffic) {
        const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best) {
        const dx = best.x - p.x; const dy = best.y - p.y;
        input.axisX = Math.abs(dx) > 6 ? Math.sign(dx) : 0;
        input.axisY = Math.abs(dy) > 6 ? Math.sign(dy) : 0;
        if (bestD < 60 * 60) input.interact = true;
      }
      return input;
    }
    // Stuck against a wall? Reverse out for a moment, then carry on.
    // Judged over a whole second of travel, so a slow turn never counts.
    if (reverseTime > 0) {
      reverseTime -= 1;
      input.axisY = 1; // reverse
      input.axisX = -1;
      return input;
    }
    trailAge += 1;
    if (trailAge === 1) { trailX = p.x; trailY = p.y; }
    if (trailAge >= 60) {
      const travelled = Math.hypot(p.x - trailX, p.y - trailY);
      trailAge = 0;
      if (travelled < 25 && Math.abs(p.carSpeed) < 40) {
        reverseTime = 45;
        input.axisY = 1;
        return input;
      }
    }
    const target = route[Math.min(wp, route.length - 1)];
    const dx = target.x - p.x; const dy = target.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 80 && wp < route.length - 1) wp += 1;
    if (wp === route.length - 1 && dist < 80) {
      // Past the last waypoint: keep driving straight so the shot catches
      // the car in motion, never parked on its destination.
      input.axisX = 0;
      input.axisY = -1;
      return input;
    }
    const want = Math.atan2(target.y - p.y, target.x - p.x);
    let diff = want - p.carAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    input.axisX = diff > 0.12 ? 1 : diff < -0.12 ? -1 : 0;
    // Slow for the corner BEFORE reaching it: a tight turn at full speed
    // swings the car off the road and into a building. But a stopped car
    // cannot steer at all (turn rate scales with speed), so always throttle
    // while slow — low-speed turns are tight (radius ~60px) and safe.
    const wantSpeed = dist > 420 ? 430 : dist > 220 ? 210 : 120;
    const sharp = Math.abs(diff);
    if (p.carSpeed < -5) input.axisY = -1; // rolling backwards: drive forward again
    else if (p.carSpeed < 150) input.axisY = -1; // too slow to steer: throttle
    else if (p.carSpeed > wantSpeed) input.axisY = 1; // brake (forward only)
    else if (sharp > 0.45) input.axisY = 0; // coast through the turn
    else input.axisY = -1; // W = forward
    return input;
  };
}

// Put the player in a car right away (teleport onto the nearest one) so the
// driving scenes never depend on the walk-to-car phase.
function giveCar(world) {
  const p = world.player;
  let best = null; let bestD = Infinity;
  for (const c of world.traffic) {
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  if (!best) return;
  best.x = 1800; best.y = 920; best.angle = -Math.PI / 2;
  p.x = 1800; p.y = 920;
  p.inCar = true; p.car = best; best.stolen = true;
  p.carAngle = -Math.PI / 2; p.carSpeed = 0;
}

function runFor(world, seconds, pilot) {
  for (let i = 0; i < seconds / STEP; i += 1) stepWorld(world, STEP, pilot(world));
}

export function stageShot(name, world) {
  if (name === 'title') {
    // Fresh world, camera over Palm Court plaza, title screen on top.
    runFor(world, 5, () => ({ axisX: 0, axisY: 0, interact: false, interactHeld: false, attack: false, aim: null, weapon: null, shopChoice: null, closeShop: false }));
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'driving') {
    giveCar(world);
    // A tour around Palm Court / Sunvale, still moving at the end.
    const pilot = makePilot([
      { x: 1800, y: 560 }, { x: 2200, y: 560 }, { x: 2200, y: 1280 },
      { x: 2600, y: 1280 }, { x: 2600, y: 920 }, { x: 3000, y: 920 },
      { x: 3000, y: 1280 }, { x: 3400, y: 1280 }, { x: 3400, y: 1640 },
    ]);
    runFor(world, 11, pilot);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'chase') {
    giveCar(world);
    world.wanted = 3;
    world.quietTime = 0;
    const pilot = makePilot([
      { x: 1800, y: 560 }, { x: 2200, y: 560 }, { x: 2200, y: 1280 },
      { x: 2600, y: 1280 }, { x: 2600, y: 1640 }, { x: 2200, y: 1640 },
      { x: 2200, y: 2000 }, { x: 1800, y: 2000 },
    ]);
    for (let i = 0; i < 11 / STEP; i += 1) {
      // Keep the heat on: the autopilot never lets the wanted level decay.
      world.wanted = Math.max(world.wanted, 3);
      world.quietTime = 0;
      stepWorld(world, STEP, pilot(world));
    }
    world.wanted = 3;
    return { screen: SCREEN_PLAY, best: 0 };
  }
  // mission: mission 2 in progress, driving the delivery route to Marina Bay.
  giveCar(world);
  world.missions.index = 1;
  world.missions.step = 1;
  world.missions.message = 'Mara Kade: "Taco Sol has a package for the Marina. Pick it up, keep it quiet, and be quick."';
  world.missions.messageTime = 30;
  const pilot = makePilot([
    { x: 1800, y: 560 }, { x: 1400, y: 560 }, { x: 1400, y: 920 },
    { x: 1000, y: 920 }, { x: 600, y: 920 }, { x: 600, y: 560 },
  ]);
  runFor(world, 9, pilot);
  return { screen: SCREEN_PLAY, best: 0 };
}
