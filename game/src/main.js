// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, the renderer paints what is there. Screens: title,
// play, paused, wasted, busted, complete. Shop keys and weapon keys are
// translated here into the world's input object.
//
// ?seed=N fixes the city. ?shot=title|driving|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, loadGame, respawnAfterBusted, restartWorld, saveGame, stepWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createSound } from './audio.js';
import { createRenderer, CAM_ZOOM, SCREEN_BUSTED, SCREEN_COMPLETE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const sound = createSound();

function announce(message) { status.textContent = message; }

function playEvents(events) {
  for (const e of events) {
    if (e === 'shoot') sound.shoot();
    else if (e === 'punch') sound.punch();
    else if (e === 'crash') sound.crash();
    else if (e === 'mission') sound.mission();
    else if (e === 'cash') sound.cash();
    else if (e === 'busted') sound.busted();
    else if (e === 'steal') sound.pickup();
    else if (e === 'click') sound.click();
  }
  if (world.status === 'wasted') sound.wasted();
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  window.__solmaris = { world, screen: scene.screen, shot: name };
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = 0;
  try { best = Number.parseInt(window.localStorage.getItem('solmaris-best-v5') ?? '0', 10) || 0; } catch { best = 0; }
  let accumulator = 0;
  let last = performance.now();
  let hadSave = false;

  function camera() {
    const visW = 1280 / CAM_ZOOM;
    const visH = 720 / CAM_ZOOM;
    return {
      x: Math.max(0, Math.min(3600 - visW, world.player.x - visW / 2)),
      y: Math.max(0, Math.min(2600 - visH, world.player.y - visH / 2)),
    };
  }

  function aimAngle() {
    const m = input.mouse();
    const rect = canvas.getBoundingClientRect();
    const vx = (m.x / canvas.width) * 1280;
    const vy = (m.y / canvas.height) * 720;
    void rect;
    const cam = camera();
    return Math.atan2(cam.y + vy / CAM_ZOOM - world.player.y, cam.x + vx / CAM_ZOOM - world.player.x);
  }

  function readInput() {
    const w = input.weaponKey();
    const actions = input.takeActions();
    const mouse = input.mouse();
    const worldInput = {
      axisX: input.axisX(),
      axisY: input.axisY(),
      interact: !!(actions & ACTION_INTERACT),
      interactHeld: false,
      attack: false,
      aim: null,
      weapon: null,
      shopChoice: null,
      closeShop: false,
    };
    // E held (for the vault hold step) is read from the live key set.
    worldInput.interactHeld = false;
    try {
      worldInput.interactHeld = !!document.querySelector('body') && (window.__keysE || false);
    } catch { /* noop */ }
    if (w) worldInput.weapon = w;
    if (mouse.down || (actions & 8)) worldInput.attack = true;
    worldInput.aim = aimAngle();
    return { actions, worldInput };
  }

  function startGame(fresh) {
    sound.unlock();
    if (fresh) {
      restartWorld(world);
      try { window.localStorage.removeItem('solmaris-save-v5'); } catch { /* noop */ }
      hadSave = false;
    } else if (!hadSave) {
      hadSave = loadGame(world);
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing Solmaris. Follow the gold marker.');
  }

  function endStatus(next) {
    screen = next;
    if (next === SCREEN_WASTED) announce('Wasted. Press Enter to get back up.');
    else if (next === SCREEN_BUSTED) announce('Busted. Press Enter to walk free.');
    else if (next === SCREEN_COMPLETE) announce('The Solmaris Job is done. Press Enter to keep cruising.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const { actions, worldInput } = readInput();

    if (actions & ACTION_MUTE) {
      const muted = sound.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }

    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame(false);
      else {
        // N starts a brand-new game from the title screen.
        try {
          if (window.__keyN) { window.__keyN = false; startGame(true); }
        } catch { /* noop */ }
        stepWorld(world, STEP, { axisX: 0, axisY: 0, interact: false, interactHeld: false, attack: false, aim: null, weapon: null, shopChoice: null, closeShop: false });
        while (accumulator >= STEP) accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
        accumulator = 0;
      } else {
        // Shop input takes over while a shop is open.
        if (world.shopOpen) {
          if (worldInput.weapon === 'fists') worldInput.shopChoice = 0;
          else if (worldInput.weapon === 'bat') worldInput.shopChoice = 1;
          worldInput.weapon = null;
          if (worldInput.interact || (actions & ACTION_PAUSE)) worldInput.closeShop = true;
          worldInput.attack = false;
        }
        while (accumulator >= STEP) {
          const events = stepWorld(world, STEP, worldInput);
          playEvents(events);
          accumulator -= STEP;
          if (world.status === 'wasted') { endStatus(SCREEN_WASTED); break; }
          if (world.status === 'busted') { endStatus(SCREEN_BUSTED); break; }
          if (world.missions.done && screen === SCREEN_PLAY) { endStatus(SCREEN_COMPLETE); break; }
          // Fresh one-shot inputs must not repeat across substeps.
          worldInput.interact = false;
          worldInput.attack = false;
          worldInput.weapon = null;
          worldInput.shopChoice = null;
          worldInput.closeShop = false;
        }
        sound.update(STEP, world.player.speed, world.wanted);
        sound.siren(world.wanted > 0);
        if (world.player.money > best) {
          best = world.player.money;
          try { window.localStorage.setItem('solmaris-best-v5', String(best)); } catch { /* noop */ }
        }
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      accumulator = 0;
    } else if (screen === SCREEN_WASTED || screen === SCREEN_BUSTED || screen === SCREEN_COMPLETE) {
      if (actions & ACTION_CONFIRM) {
        if (screen === SCREEN_COMPLETE) {
          world.missions.done = false;
          screen = SCREEN_PLAY;
        } else {
          respawnAfterBusted(world);
          screen = SCREEN_PLAY;
        }
        announce('Playing.');
      }
      accumulator = 0;
    }

    renderer.draw(world, screen, best);
  }

  // E-held and N key tracking (the input module exposes pressed keys only
  // as one-shot actions, so these two live here).
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') window.__keysE = true;
    if (e.code === 'KeyN') window.__keyN = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyE') window.__keysE = false;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  window.__solmaris = { world, get screen() { return screen; } };
  announce('Solmaris. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
