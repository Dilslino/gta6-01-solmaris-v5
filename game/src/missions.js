// The Solmaris Job: the six-mission chain and its step machine. A mission
// is a list of generic steps; the machine watches the world (position,
// wanted level, kills, held keys) and advances, pays out, and hands the next
// mission over. It knows nothing about rendering.
import { MISSIONS, STORY } from './config.js';
import { dist2 } from './random.js';

export function createMissionState() {
  return { index: 0, step: 0, done: false, kills: 0, holdTime: 0, stepTime: 0, timer: 0, message: '', messageTime: 0 };
}

export function currentMission(state) {
  if (state.index >= MISSIONS.length) return null;
  return MISSIONS[state.index];
}

export function currentStep(state) {
  const m = currentMission(state);
  if (!m) return null;
  return m.steps[state.step] || null;
}

export function missionObjective(state) {
  const m = currentMission(state);
  if (!m) return STORY.outro;
  const s = currentStep(state);
  if (!s) return m.title;
  let extra = '';
  if (s.type === 'shoot') extra = ` (${state.kills}/${s.count})`;
  if (s.type === 'hold' && state.holdTime > 0) extra = ` (${Math.ceil(s.seconds - state.holdTime)}s)`;
  if (s.type === 'goto' && s.time) extra = ` — ${Math.max(0, Math.ceil(s.time - state.stepTime))}s left`;
  return `${m.id}. ${m.title} — ${s.text}${extra}`;
}

export function missionMarker(state) {
  const s = currentStep(state);
  if (!s) return null;
  if (s.x !== undefined) return { x: s.x, y: s.y, r: s.r || 90 };
  return null;
}

export function startMission(state, index) {
  state.index = index;
  state.step = 0;
  state.kills = 0;
  state.holdTime = 0;
  state.stepTime = 0;
  state.timer = 0;
  const m = currentMission(state);
  if (m) {
    state.message = m.brief;
    state.messageTime = 7;
  }
}

export function noteKill(state) {
  const s = currentStep(state);
  if (s && s.type === 'shoot') state.kills += 1;
}

// Advance the step machine. Returns { completed, reward } when a mission
// finishes, otherwise null. `world` is the live game state the steps read.
export function updateMissions(state, dt, world) {
  if (state.done) return null;
  const m = currentMission(state);
  if (!m) { state.done = true; return null; }
  const s = currentStep(state);
  if (!s) return null;
  state.stepTime += dt;
  if (state.messageTime > 0) state.messageTime -= dt;

  let advance = false;
  if (s.type === 'goto') {
    if (dist2(world.player.x, world.player.y, s.x, s.y) < s.r * s.r) advance = true;
    else if (s.time && state.stepTime > s.time) {
      // Out of time on a timed drop: restart just this step.
      state.stepTime = 0;
      state.message = 'Too slow — Mara gives you another shot at this drop.';
      state.messageTime = 4;
    }
  } else if (s.type === 'steal') {
    if (world.player.inCar) advance = true;
  } else if (s.type === 'shoot') {
    if (state.kills >= s.count) advance = true;
  } else if (s.type === 'getHeat') {
    if (world.wanted >= s.level) advance = true;
  } else if (s.type === 'escape') {
    if (world.wanted === 0) advance = true;
  } else if (s.type === 'hold') {
    const near = dist2(world.player.x, world.player.y, s.x, s.y) < s.r * s.r;
    if (near && world.interactHeld) {
      state.holdTime += dt;
      if (state.holdTime >= s.seconds) advance = true;
    } else {
      state.holdTime = Math.max(0, state.holdTime - dt * 2);
    }
  }

  if (!advance) return null;
  state.step += 1;
  state.kills = 0;
  state.holdTime = 0;
  state.stepTime = 0;
  if (state.step >= m.steps.length) {
    const reward = m.reward;
    state.index += 1;
    state.step = 0;
    if (state.index >= MISSIONS.length) {
      state.done = true;
      state.message = STORY.outro;
      state.messageTime = 9;
    } else {
      const next = MISSIONS[state.index];
      state.message = `Mission complete — $${reward}. Next: ${next.title}. ${next.brief}`;
      state.messageTime = 8;
    }
    return { completed: m, reward };
  }
  return null;
}
