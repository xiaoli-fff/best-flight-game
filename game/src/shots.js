// The screenshot scenes behind ?shot=start|play|end|cockpit. Each one plays
// the real rules forward from a fresh valley for a fixed number of steps,
// steered by a simple autopilot (bank toward the next target, pitch toward
// its height, throttle to keep flying), so the frame is what a real sortie
// looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { wrapAngle } from './random.js';
import { currentTarget } from './missions.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_LIMIT_SECONDS = 90;
const END_LIMIT_SECONDS = 300;
const SAMPLE = STEP;

/** Landing pattern state: final approach, or a go-around after an overshoot. */
let landingPattern = 'final';

/** Steer toward the mission's current target, like a calm pilot would. */
export function autopilot(flight, mission) {
  const target = currentTarget(mission);
  if (!target) return { roll: 0, pitch: 0, throttle: 0.7 };

  if (target.label === 'HOME RUNWAY') {
    // Land on the runway's extended centreline, not on the point: fly
    // southbound down a shallow glide slope to the numbers. A plane that
    // runs past the far end climbs out north and rejoins the pattern.
    if (landingPattern === 'goaround') {
      const roll = Math.max(-1, Math.min(1, wrapAngle(0 - flight.heading) / 25));
      const pitch = Math.max(-1, Math.min(1, (150 - flight.y) / 60));
      if (flight.z > 2500) landingPattern = 'final';
      return { roll, pitch, throttle: 0.7 };
    }
    if (flight.z < -50 && flight.y > 5) {
      landingPattern = 'goaround';
      return autopilot(flight, mission);
    }
    // Aim the glide slope at a touchdown point mid-strip, and let it run
    // below the ground past that point: the plane must settle onto the
    // runway, not float two metres above it forever.
    const glide = (flight.z - 500) * 0.02;
    const desiredHeading = 180 + Math.max(-20, Math.min(20, flight.x * 0.06));
    const headingError = wrapAngle(desiredHeading - flight.heading);
    const roll = Math.max(-1, Math.min(1, headingError / 25));
    const pitch = Math.max(-1, Math.min(1, (glide - flight.y) / 50));
    const throttle = flight.z < 2000 ? 0.3 : 0.5;
    return { roll, pitch, throttle };
  }

  const dx = target.x - flight.x;
  const dz = target.z - flight.z;
  const desiredHeading = (Math.atan2(dx, dz) * 180) / Math.PI;
  const headingError = wrapAngle(desiredHeading - flight.heading);
  const roll = Math.max(-1, Math.min(1, headingError / 25));
  const desiredAltitude = target.y;
  const altitudeError = desiredAltitude - flight.y;
  const pitch = Math.max(-1, Math.min(1, altitudeError / 60));
  let throttle = 0.78;
  if (flight.y > desiredAltitude + 120) throttle = 0.45;
  if (!flight.airborne) throttle = 0.9;
  return { roll, pitch, throttle };
}

/**
 * Set the game to the named scene (start, play, end or cockpit; any other
 * name is start) and return the screen to draw over it, the view, and the
 * best score to show.
 */
export function stageShot(name, game) {
  landingPattern = 'final';
  game.resetMission('rings');
  if (name !== 'play' && name !== 'end' && name !== 'cockpit') {
    for (let index = 0; index < START_SECONDS / SAMPLE; index += 1) {
      game.stepWorld(SAMPLE, { roll: 0, pitch: 0, throttle: 0 });
    }
    return { screen: SCREEN_TITLE, view: 'chase', best: 0 };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_LIMIT_SECONDS;
  for (let index = 0; index < limit / SAMPLE; index += 1) {
    const done = game.stepWorld(SAMPLE, autopilot(game.flight, game.mission));
    if (done) break;
    if (name !== 'end') {
      // Stop with the third ring close ahead: the cover wants a ring in frame.
      const target = currentTarget(game.mission);
      if (game.mission.ringIndex >= 2 && target) {
        const distance = Math.hypot(target.x - game.flight.x, target.z - game.flight.z);
        if (distance < 380 && distance > 120) break;
      }
    }
  }
  const over = game.flight.crashed || game.mission.done || game.mission.failed;
  return {
    screen: over ? SCREEN_OVER : SCREEN_PLAY,
    view: name === 'cockpit' ? 'cockpit' : 'chase',
    best: game.mission.score,
  };
}
