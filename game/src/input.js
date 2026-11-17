// Keyboard + mouse input for Solmaris. Keys are read as a held set every
// frame; one-shot actions (interact, pause, weapon swap) are consumed once
// via takeActions. Mouse position is kept in canvas pixels for aiming.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_ATTACK = 8;
export const ACTION_MUTE = 16;

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseClicked = false;

  function codeOf(e) { return e.code; }

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat) pressed.add(codeOf(e));
    keys.add(codeOf(e));
  });
  window.addEventListener('keyup', (e) => keys.delete(codeOf(e)));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouseX = (e.clientX - r.left) * (canvas.width / r.width);
    mouseY = (e.clientY - r.top) * (canvas.height / r.height);
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouseDown = true; mouseClicked = true; }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });

  function held(...codes) { return codes.some((c) => keys.has(c)); }

  return {
    // Steering / movement axes in [-1, 1].
    axisX() { return (held('KeyD', 'ArrowRight') ? 1 : 0) - (held('KeyA', 'ArrowLeft') ? 1 : 0); },
    axisY() { return (held('KeyS', 'ArrowDown') ? 1 : 0) - (held('KeyW', 'ArrowUp') ? 1 : 0); },
    up() { return held('KeyW', 'ArrowUp'); },
    down() { return held('KeyS', 'ArrowDown'); },
    mouse() { return { x: mouseX, y: mouseY, down: mouseDown }; },
    weaponKey() {
      if (pressed.has('Digit1')) return 'fists';
      if (pressed.has('Digit2')) return 'bat';
      if (pressed.has('Digit3')) return 'pistol';
      return null;
    },
    takeActions() {
      let a = 0;
      if (pressed.has('Enter') || pressed.has('Space')) a |= ACTION_CONFIRM;
      if (pressed.has('Escape') || pressed.has('KeyP')) a |= ACTION_PAUSE;
      if (pressed.has('KeyE')) a |= ACTION_INTERACT;
      if (pressed.has('KeyF') || mouseClicked) a |= ACTION_ATTACK;
      if (pressed.has('KeyM')) a |= ACTION_MUTE;
      pressed.clear();
      mouseClicked = false;
      return a;
    },
    // Test / autopilot hook: pretend a key is held.
    setKey(code, on) { if (on) keys.add(code); else keys.delete(code); },
    press(code) { pressed.add(code); },
  };
}
