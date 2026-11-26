// Keyboard and pointer input. Held keys give a steering direction; one-shot
// presses (start, pause, view, mission choice) are queued as bit flags and
// taken once by the loop, so a press between two frames is never lost.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_VIEW = 4;
export const ACTION_RESTART = 8;
export const ACTION_MENU = 16;
export const ACTION_MISSION_1 = 32;
export const ACTION_MISSION_2 = 64;
export const ACTION_MISSION_3 = 128;

const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'KeyQ']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const VIEW = new Set(['KeyC', 'KeyV']);
const RESTART = new Set(['KeyR']);
const MENU = new Set(['KeyM']);

export function createInput(canvas) {
  let rollLeft = false;
  let rollRight = false;
  let pitchUp = false;
  let pitchDown = false;
  let throttleUp = false;
  let throttleDown = false;
  let actions = 0;
  let mouseDown = false;
  let mouseX = 0;
  let mouseY = 0;

  window.addEventListener('keydown', (event) => {
    if (ROLL_LEFT.has(event.code)) rollLeft = true;
    else if (ROLL_RIGHT.has(event.code)) rollRight = true;
    else if (PITCH_UP.has(event.code)) pitchUp = true;
    else if (PITCH_DOWN.has(event.code)) pitchDown = true;
    else if (THROTTLE_UP.has(event.code)) throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = true;
    else if (CONFIRM.has(event.code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else if (PAUSE.has(event.code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (VIEW.has(event.code)) { if (!event.repeat) actions |= ACTION_VIEW; }
    else if (RESTART.has(event.code)) { if (!event.repeat) actions |= ACTION_RESTART; }
    else if (MENU.has(event.code)) { if (!event.repeat) actions |= ACTION_MENU; }
    else if (event.code === 'Digit1') { if (!event.repeat) actions |= ACTION_MISSION_1; }
    else if (event.code === 'Digit2') { if (!event.repeat) actions |= ACTION_MISSION_2; }
    else if (event.code === 'Digit3') { if (!event.repeat) actions |= ACTION_MISSION_3; }
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (ROLL_LEFT.has(event.code)) rollLeft = false;
    else if (ROLL_RIGHT.has(event.code)) rollRight = false;
    else if (PITCH_UP.has(event.code)) pitchUp = false;
    else if (PITCH_DOWN.has(event.code)) pitchDown = false;
    else if (THROTTLE_UP.has(event.code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = false;
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    rollLeft = false;
    rollRight = false;
    pitchUp = false;
    pitchDown = false;
    throttleUp = false;
    throttleDown = false;
    mouseDown = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    mouseX = event.clientX;
    mouseY = event.clientY;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });
  window.addEventListener('pointerup', () => { mouseDown = false; });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    actions |= event.deltaY < 0 ? 256 : 512;
  }, { passive: false });

  return {
    /** -1 for left, 1 for right, 0 for neither or both; mouse drag steers too. */
    rollAxis(width) {
      let roll = (rollRight ? 1 : 0) - (rollLeft ? 1 : 0);
      if (roll === 0 && mouseDown) {
        roll = Math.max(-1, Math.min(1, (mouseX - width / 2) / (width * 0.28)));
      }
      return roll;
    },
    /** 1 for climb, -1 for dive; mouse drag pitches too. */
    pitchAxis(height) {
      let pitch = (pitchUp ? 1 : 0) - (pitchDown ? 1 : 0);
      if (pitch === 0 && mouseDown) {
        pitch = Math.max(-1, Math.min(1, (height * 0.55 - mouseY) / (height * 0.3)));
      }
      return pitch;
    },
    /** -1, 0 or 1: which way the throttle lever is being moved. */
    throttleAxis() {
      return (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Where the pointer last was, for clickable menus. */
    pointer() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
  };
}
