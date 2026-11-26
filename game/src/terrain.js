// The valley the game flies over: procedural rolling hills, a river, a lake,
// a lakeside town, and one flat home runway. Nothing here draws; it answers
// two questions — how high is the ground here, and what does it look like —
// so the flight model and the renderer agree about the world.
import { RUNWAY } from './config.js';
import { hash2, smoothstep } from './random.js';

export const KIND_FIELD = 0;
export const KIND_FIELD_LIGHT = 1;
export const KIND_FIELD_GOLD = 2;
export const KIND_FOREST = 3;
export const KIND_TOWN = 4;
export const KIND_WATER = 5;
export const KIND_RUNWAY = 6;

/** The river snakes north through the valley; its centre line at height z. */
export function riverX(z) {
  return 420 * Math.sin(z * 0.00045) + 150 * Math.sin(z * 0.0013 + 1.2);
}

/** The lake near the patrol's second waypoint. */
export const LAKE = { x: -700, z: 3800, radius: 260 };

/** The lakeside town near the patrol's first waypoint. */
export const TOWN = { x: 600, z: 2500, radius: 320 };

/** How far a point is from the runway strip, in metres (0 inside it). */
export function runwayDistance(x, z) {
  const dx = Math.max(0, Math.abs(x) - RUNWAY.halfWidth);
  const dz = Math.max(0, Math.max(RUNWAY.startZ - z, z - RUNWAY.endZ));
  return Math.hypot(dx, dz);
}

/** Ground height in metres at world (x, z). Flat on the runway, hills elsewhere. */
export function terrainHeight(x, z) {
  let h =
    24 * Math.sin(x * 0.0016 + 1.7) * Math.cos(z * 0.0011) +
    18 * Math.sin(x * 0.0007 - 0.5) * Math.sin(z * 0.0009 + 2.0) +
    9 * Math.sin(x * 0.004 + z * 0.002 + 0.8) +
    5 * Math.sin(x * 0.011 - z * 0.007);
  // Mountains rise at the valley's edges and far to the north.
  const edge = Math.max(0, Math.abs(x) - 1200);
  h += edge * edge * 0.00012;
  h += Math.max(0, z - 6200) * 0.05;
  // The lake bed dips below the waterline.
  const lakeD = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (lakeD < LAKE.radius + 80) {
    h = h * smoothstep(LAKE.radius - 60, LAKE.radius + 80, lakeD) - 8 * (1 - smoothstep(LAKE.radius - 60, LAKE.radius + 80, lakeD));
  }
  // The river carves a shallow channel.
  const riverD = Math.abs(x - riverX(z));
  if (riverD < 90) h = Math.min(h, 2 + riverD * 0.12);
  // The runway apron is graded flat.
  const flat = 1 - smoothstep(60, 260, runwayDistance(x, z));
  return h * (1 - flat);
}

/** What the ground looks like at world (x, z): field, forest, town, water, runway. */
export function groundKind(x, z) {
  if (Math.abs(x) <= RUNWAY.halfWidth && z >= RUNWAY.startZ && z <= RUNWAY.endZ) return KIND_RUNWAY;
  const riverD = Math.abs(x - riverX(z));
  if (riverD < 42) return KIND_WATER;
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.radius) return KIND_WATER;
  if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.radius) return KIND_TOWN;
  const cellX = Math.floor(x / 200);
  const cellZ = Math.floor(z / 200);
  const roll = hash2(cellX, cellZ);
  if (roll < 0.16) return KIND_FOREST;
  if (roll < 0.3) return KIND_FIELD_GOLD;
  if (roll < 0.58) return KIND_FIELD_LIGHT;
  return KIND_FIELD;
}

/**
 * The ring course for the Ring Run: eight glowing rings strung north along
 * the valley, weaving side to side and up and down.
 */
export function buildRingCourse() {
  const rings = [];
  for (let index = 0; index < 8; index += 1) {
    rings.push({
      x: 380 * Math.sin(index * 0.9),
      y: 150 + 90 * Math.sin(index * 1.3 + 0.4),
      z: 1400 + index * 520,
      passed: false,
    });
  }
  return rings;
}

/** The mountain-pass gate the Valley Circuit flies through before landing. */
export const PASS_GATE = { x: 0, y: 240, z: 4200, radius: 60 };

/** The three Air Mail Patrol stops: town, lake, mountain pass. */
export function buildPatrolStops() {
  return [
    { name: 'Lakeside Town', x: TOWN.x, z: TOWN.z, y: 180, done: false },
    { name: 'Mirror Lake', x: LAKE.x, z: LAKE.z, y: 180, done: false },
    { name: 'North Pass', x: PASS_GATE.x, z: PASS_GATE.z, y: 300, done: false },
  ];
}
