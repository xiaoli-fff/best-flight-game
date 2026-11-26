// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between four screens: title,
// play, paused and game over.
//
// ?seed=N fixes the valley. ?shot=start|play|end|cockpit (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { FIELD, STEP } from './config.js';
import { createRandom } from './random.js';
import { createFlight, resetFlight, stepFlight, EVENT_TAKEOFF, EVENT_TOUCHDOWN, EVENT_CRASH, EVENT_FUEL_EMPTY, EVENT_HARD_LANDING } from './flight.js';
import { createMission, stepMission, MISSION_RINGS, MISSION_CIRCUIT, MISSION_PATROL } from './missions.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_VIEW, ACTION_RESTART, ACTION_MENU, ACTION_MISSION_1, ACTION_MISSION_2, ACTION_MISSION_3, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
void random;

const flight = createFlight();
let mission = createMission(MISSION_RINGS);
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

let screen = SCREEN_TITLE;
let view = 'chase';
let best = 0;
let throttle = 0;
let missionKind = MISSION_RINGS;

/** The game object the screenshot scenes drive: reset, then step forward. */
const game = {
  flight,
  get mission() {
    return mission;
  },
  resetMission(kind) {
    missionKind = kind;
    mission = createMission(kind);
    resetFlight(flight);
    screen = SCREEN_PLAY;
    throttle = 0;
  },
  stepWorld(dt, control) {
    throttle = control.throttle;
    const events = stepFlight(flight, control, dt);
    const done = stepMission(mission, flight, dt);
    return done || flight.crashed || mission.failed;
  },
};

function startMission(kind) {
  game.resetMission(kind);
  screen = SCREEN_PLAY;
  status.textContent = 'Flying. Arrow keys steer, Shift and Ctrl work the throttle.';
}

function endSortie() {
  screen = SCREEN_OVER;
  if (mission.score > best) best = mission.score;
  status.textContent = mission.done ? 'Sortie complete.' : 'Sortie over.';
}

function runShot(name) {
  const scene = stageShot(name, game);
  screen = scene.screen;
  view = scene.view;
  best = scene.best;
  let painted = 0;
  function paint() {
    renderer.draw({ flight, mission, screen, view, time: flight.elapsed, best });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function toLogical(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = FIELD.width / rect.width;
  const scaleY = FIELD.height / rect.height;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

/** Which mission row, if any, a title-screen click lands on. */
function missionRowAt(point) {
  if (point.x < 322 || point.x > 958) return null;
  for (let index = 0; index < 3; index += 1) {
    const y = 292 + index * 74;
    if (point.y >= y && point.y <= y + 62) return [MISSION_RINGS, MISSION_CIRCUIT, MISSION_PATROL][index];
  }
  return null;
}

function runGame() {
  let last = performance.now();
  let accumulator = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    audio.unlock();
    const actions = input.takeActions();
    const pointer = input.pointer();

    if (actions & ACTION_VIEW) view = view === 'chase' ? 'cockpit' : 'chase';
    if (actions & ACTION_MENU) {
      screen = SCREEN_TITLE;
      resetFlight(flight);
      mission = createMission(missionKind);
    }
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) startMission(missionKind);

    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_MISSION_1) startMission(MISSION_RINGS);
      else if (actions & ACTION_MISSION_2) startMission(MISSION_CIRCUIT);
      else if (actions & ACTION_MISSION_3) startMission(MISSION_PATROL);
      else if (actions & ACTION_CONFIRM) {
        if (pointer.down) {
          const row = missionRowAt(toLogical(pointer.x, pointer.y));
          if (row) startMission(row);
        } else {
          startMission(MISSION_RINGS);
        }
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
      } else {
        const throttleAxis = input.throttleAxis();
        throttle = Math.max(0, Math.min(1, throttle + throttleAxis * 0.6 * elapsed));
        if (actions & 256) throttle = Math.min(1, throttle + 0.1);
        if (actions & 512) throttle = Math.max(0, throttle - 0.1);
        accumulator += elapsed;
        while (accumulator >= STEP) {
          accumulator -= STEP;
          const control = {
            roll: input.rollAxis(window.innerWidth),
            pitch: input.pitchAxis(window.innerHeight),
            throttle,
          };
          const events = stepFlight(flight, control, STEP);
          if (events & EVENT_TAKEOFF) audio.takeoff();
          if (events & EVENT_TOUCHDOWN) audio.touchdown();
          if (events & EVENT_HARD_LANDING) audio.warning();
          if (events & EVENT_FUEL_EMPTY) audio.warning();
          if (events & EVENT_CRASH) {
            audio.crash();
            endSortie();
            break;
          }
          const done = stepMission(mission, flight, STEP);
          if (done) {
            audio.complete();
            endSortie();
            break;
          }
          if (mission.failed) {
            endSortie();
            break;
          }
          if (flight.engineOut && !flight.airborne && !flight.crashed) {
            endSortie();
            break;
          }
          audio.update(throttle, flight.speed, flight.airborne);
        }
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) screen = SCREEN_PLAY;
    } else if (screen === SCREEN_OVER) {
      if (actions & ACTION_RESTART) startMission(missionKind);
    }

    renderer.draw({ flight, mission, screen, view, time: flight.elapsed, best });
  }

  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
