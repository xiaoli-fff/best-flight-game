// The three sorties of Ridge Runner: each one is a different kind of flying,
// scored its own way, so a sortie is a decision, not a lap.
//   1. Ring Run — thread eight signal rings down the valley.
//   2. Valley Circuit — take off, thread the North Pass gate, land back home.
//   3. Air Mail Patrol — visit town, lake and pass before the clock runs out.
import { MISSION, RING, WAYPOINT } from './config.js';
import { buildPatrolStops, buildRingCourse, PASS_GATE } from './terrain.js';

export const MISSION_RINGS = 'rings';
export const MISSION_CIRCUIT = 'circuit';
export const MISSION_PATROL = 'patrol';

export const MISSION_INFO = {
  [MISSION_RINGS]: {
    name: 'Ring Run',
    blurb: 'Thread all 8 signal rings down the valley. Fast, clean flying wins.',
  },
  [MISSION_CIRCUIT]: {
    name: 'Valley Circuit',
    blurb: 'Take off, thread the North Pass gate, and land back on the home strip.',
  },
  [MISSION_PATROL]: {
    name: 'Air Mail Patrol',
    blurb: 'Drop the mail at the town, the lake and the pass — inside 4 minutes.',
  },
};

/** A fresh mission of the given kind, with its own rings, stops and clock. */
export function createMission(kind) {
  return {
    kind,
    rings: kind === MISSION_RINGS ? buildRingCourse() : [],
    ringIndex: 0,
    gatePassed: false,
    stops: kind === MISSION_PATROL ? buildPatrolStops() : [],
    timeLeft: kind === MISSION_PATROL ? MISSION.patrolSeconds : 0,
    score: 0,
    done: false,
    failed: false,
    message: '',
    messageTime: 0,
  };
}

/** The next thing the pilot should fly at: a ring, the pass gate, or a stop. */
export function currentTarget(mission) {
  if (mission.kind === MISSION_RINGS) {
    const ring = mission.rings[mission.ringIndex];
    return ring ? { x: ring.x, y: ring.y, z: ring.z, radius: RING.radius, label: `RING ${mission.ringIndex + 1}/8` } : null;
  }
  if (mission.kind === MISSION_CIRCUIT) {
    if (!mission.gatePassed) {
      return { x: PASS_GATE.x, y: PASS_GATE.y, z: PASS_GATE.z, radius: PASS_GATE.radius, label: 'NORTH PASS' };
    }
    return { x: 0, y: 0, z: 450, radius: 18, label: 'HOME RUNWAY' };
  }
  const stop = mission.stops.find((item) => !item.done);
  return stop ? { x: stop.x, y: stop.y, z: stop.z, radius: WAYPOINT.radius, label: stop.name.toUpperCase() } : null;
}

/** One line for the HUD telling the pilot what to do next. */
export function objectiveLine(mission) {
  if (mission.kind === MISSION_RINGS) return `Rings ${mission.ringIndex}/8 — thread the glowing ring`;
  if (mission.kind === MISSION_CIRCUIT) {
    return mission.gatePassed ? 'Gate threaded — land on the home runway' : 'Climb out and thread the North Pass gate';
  }
  const left = mission.stops.filter((item) => !item.done).length;
  return `Mail stops left: ${left} — ${Math.ceil(mission.timeLeft)}s on the clock`;
}

function announce(mission, text) {
  mission.message = text;
  mission.messageTime = 3;
}

/**
 * Check the plane against the mission's targets. Returns true when the
 * mission just finished. Call once per step, after the flight step.
 */
export function stepMission(mission, flight, dt) {
  if (mission.done || mission.failed) return false;
  if (mission.messageTime > 0) mission.messageTime -= dt;
  if (mission.kind === MISSION_PATROL) {
    mission.timeLeft -= dt;
    if (mission.timeLeft <= 0 && mission.stops.some((item) => !item.done)) {
      mission.failed = true;
      announce(mission, 'OUT OF TIME — the mail never arrived');
      return false;
    }
  }

  if (mission.kind === MISSION_RINGS) {
    const ring = mission.rings[mission.ringIndex];
    if (ring && flight.airborne) {
      const dx = flight.x - ring.x;
      const dy = flight.y - ring.y;
      const dz = flight.z - ring.z;
      if (Math.abs(dz) < 14 && Math.hypot(dx, dy) < RING.radius) {
        ring.passed = true;
        mission.ringIndex += 1;
        mission.score += RING.points;
        if (mission.ringIndex >= mission.rings.length) {
          mission.done = true;
          mission.score += MISSION.completionBonus + Math.round(flight.fuel);
          announce(mission, 'ALL RINGS — course complete!');
          return true;
        }
        announce(mission, `RING ${mission.ringIndex}/8 — nice flying!`);
      }
    }
    return false;
  }

  if (mission.kind === MISSION_CIRCUIT) {
    if (!mission.gatePassed && flight.airborne) {
      const dx = flight.x - PASS_GATE.x;
      const dy = flight.y - PASS_GATE.y;
      const dz = flight.z - PASS_GATE.z;
      if (Math.abs(dz) < 20 && Math.hypot(dx, dy) < PASS_GATE.radius) {
        mission.gatePassed = true;
        mission.score += 150;
        announce(mission, 'PASS GATE — now bring her home');
      }
    }
    if (mission.gatePassed && flight.landed) {
      mission.done = true;
      mission.score += MISSION.landingBonus + Math.round(flight.fuel);
      announce(mission, 'DOWN SAFE — circuit complete!');
      return true;
    }
    return false;
  }

  // Patrol: fly within the beacon's radius, above the ground, to tick it off.
  for (const stop of mission.stops) {
    if (stop.done) continue;
    const dx = flight.x - stop.x;
    const dz = flight.z - stop.z;
    if (Math.hypot(dx, dz) < WAYPOINT.radius && flight.airborne && flight.y > 30) {
      stop.done = true;
      mission.score += WAYPOINT.points;
      if (mission.stops.every((item) => item.done)) {
        mission.done = true;
        mission.score += MISSION.completionBonus + Math.round(flight.fuel);
        announce(mission, 'ALL MAIL DELIVERED — patrol complete!');
        return true;
      }
      announce(mission, `${stop.name} — mail dropped!`);
    }
  }
  return false;
}
