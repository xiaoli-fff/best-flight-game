// The flight model: an arcade bush plane with real trade-offs — throttle sets
// the speed, banking turns the nose, pitch trades speed for height, and the
// wing quits flying below the stall speed. No drawing and no browser in it.
import { FUEL, PLANE } from './config.js';
import { approach, wrapAngle } from './random.js';
import { runwayDistance, terrainHeight } from './terrain.js';

export const EVENT_TAKEOFF = 1;
export const EVENT_TOUCHDOWN = 2;
export const EVENT_HARD_LANDING = 4;
export const EVENT_CRASH = 8;
export const EVENT_FUEL_EMPTY = 16;

const DEG = Math.PI / 180;

export function createFlight() {
  const state = {
    x: 0,
    y: 0,
    z: 120,
    heading: 0,
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0,
    fuel: FUEL.start,
    damage: 0,
    airborne: false,
    crashed: false,
    landed: false,
    engineOut: false,
    verticalSpeed: 0,
    /** Seconds since the wheels left the ground; the ground check waits for it. */
    airborneTime: 0,
    elapsed: 0,
    distance: 0,
    maxAltitude: 0,
  };
  return state;
}

/** Put the plane back on the runway, engines warm, ready to roll. */
export function resetFlight(state) {
  state.x = 0;
  state.y = 0;
  state.z = 120;
  state.heading = 0;
  state.pitch = 0;
  state.bank = 0;
  state.speed = 0;
  state.throttle = 0;
  state.fuel = FUEL.start;
  state.damage = 0;
  state.airborne = false;
  state.crashed = false;
  state.landed = false;
  state.engineOut = false;
  state.verticalSpeed = 0;
  state.airborneTime = 0;
  state.elapsed = 0;
  state.distance = 0;
  state.maxAltitude = 0;
}

/**
 * Advance the plane one fixed step. `control` is { roll, pitch, throttle }
 * with roll/pitch in -1..1 and throttle 0..1. Returns event flags.
 */
export function stepFlight(state, control, dt) {
  if (state.crashed) return 0;
  let events = 0;
  state.elapsed += dt;

  // Throttle: the engine answers at once; an empty tank answers not at all.
  state.throttle = control.throttle;
  if (state.fuel <= 0) {
    if (!state.engineOut) {
      state.engineOut = true;
      events |= EVENT_FUEL_EMPTY;
    }
    state.throttle = 0;
  }
  state.fuel = Math.max(0, state.fuel - (FUEL.idleBurn + state.throttle * (FUEL.fullBurn - FUEL.idleBurn)) * dt);

  // Banking and pitching chase the stick, slower than the stick itself.
  const targetBank = control.roll * PLANE.maxBank;
  state.bank = approach(state.bank, targetBank, PLANE.bankResponse * PLANE.maxBank * dt);
  const stalled = state.airborne && state.speed < PLANE.stallSpeed;
  const pitchAuthority = stalled ? 0.35 : 1;
  const targetPitch = control.pitch * PLANE.maxPitch * pitchAuthority;
  state.pitch = approach(state.pitch, targetPitch, PLANE.pitchResponse * PLANE.maxPitch * dt);

  // Speed chases the throttle; climbing and hard banking bleed it off.
  // On the ground the wheels answer only to the throttle: idle means parked.
  let targetSpeed = state.airborne
    ? PLANE.minSpeed + state.throttle * (PLANE.maxSpeed - PLANE.minSpeed)
    : state.throttle * PLANE.maxSpeed;
  if (state.airborne) {
    targetSpeed -= Math.max(0, state.pitch) * 0.9;
    targetSpeed -= Math.abs(state.bank) * 0.12;
  }
  targetSpeed = Math.max(0, targetSpeed);
  state.speed = approach(state.speed, targetSpeed, PLANE.speedResponse * PLANE.maxSpeed * dt);

  // A banked wing turns the nose; faster flight turns harder.
  const speedFactor = Math.min(1, state.speed / 60);
  if (state.airborne) {
    state.heading = wrapAngle(state.heading + (state.bank / PLANE.maxBank) * PLANE.turnRate * speedFactor * dt);
  }

  const headingRad = state.heading * DEG;
  const pitchRad = state.pitch * DEG;
  const forwardX = Math.sin(headingRad);
  const forwardZ = Math.cos(headingRad);

  if (!state.airborne) {
    // Rolling down the runway: straight, on the ground, gathering speed.
    state.z += state.speed * dt;
    state.y = 0;
    state.verticalSpeed = 0;
    if (state.speed > PLANE.rotateSpeed && control.pitch > 0.25) {
      state.airborne = true;
      state.landed = false;
      state.airborneTime = 0;
      events |= EVENT_TAKEOFF;
    }
  } else {
    state.airborneTime += dt;
    state.verticalSpeed = state.speed * Math.sin(pitchRad) * PLANE.climbFactor;
    if (stalled) state.verticalSpeed -= (PLANE.stallSpeed - state.speed) * 0.35;
    state.x += forwardX * state.speed * dt;
    state.z += forwardZ * state.speed * dt;
    state.y += state.verticalSpeed * dt;
    state.distance += state.speed * dt;
    if (state.y > state.maxAltitude) state.maxAltitude = state.y;
  }

  // The ground: a gentle touchdown on the runway, a crash anywhere else.
  // Just after rotation the wheels are still in the grass, so the check
  // waits half a second — and it only fires while the plane is coming down
  // or is actually touching the ground, never while it is climbing away.
  const ground = terrainHeight(state.x, state.z);
  const comingDown = state.verticalSpeed < -0.5 || state.y <= ground + 0.3;
  if (state.airborne && state.airborneTime > 0.5 && state.y <= ground + 1.5 && comingDown) {
    const onRunway = runwayDistance(state.x, state.z) < 1;
    const gentle = state.verticalSpeed > -6 && Math.abs(state.bank) < 20 && state.speed < 55;
    if (onRunway && gentle) {
      const touchdownVs = state.verticalSpeed;
      state.y = 0;
      state.airborne = false;
      state.landed = true;
      state.verticalSpeed = 0;
      events |= EVENT_TOUCHDOWN;
      if (touchdownVs < -3.5 || state.speed > 48) {
        state.damage += 30;
        events |= EVENT_HARD_LANDING;
      }
    } else {
      state.crashed = true;
      events |= EVENT_CRASH;
    }
  }
  if (state.damage >= 100) {
    state.crashed = true;
    events |= EVENT_CRASH;
  }
  // The valley ends at the map's edge: turn the pilot back, kindly.
  if (state.z > 7200 || state.z < -600 || Math.abs(state.x) > 2600) {
    state.heading = wrapAngle(state.heading + 180);
    state.x = Math.max(-2400, Math.min(2400, state.x));
    state.z = Math.max(-400, Math.min(7000, state.z));
  }
  return events;
}

/** Knots for the HUD: 1 m/s is about 1.94 knots. */
export function speedKnots(state) {
  return Math.round(state.speed * 1.944);
}

/** Feet for the HUD: 1 metre is about 3.28 feet. */
export function altitudeFeet(state) {
  return Math.round(state.y * 3.281);
}
