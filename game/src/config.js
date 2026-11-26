// Every tuning number and colour for Ridge Runner in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** The camera's focal length in logical pixels (about a 66 degree field of view). */
export const FOCAL = 640;

/** Where the horizon sits on screen when the nose is level. */
export const HORIZON_Y = 330;

/** The aircraft: a single-engine bush plane, the Kestrel K-2. */
export const PLANE = {
  /** Cruise speed the throttle aims for, metres per second. */
  minSpeed: 26,
  maxSpeed: 88,
  /** How fast speed chases its target, per second. */
  speedResponse: 0.55,
  /** Roll the stick commands, degrees; the plane banks toward it. */
  maxBank: 52,
  bankResponse: 2.6,
  /** Pitch the stick commands, degrees. */
  maxPitch: 16,
  pitchResponse: 2.4,
  /** Turn rate at full bank, degrees per second, scaled by speed. */
  turnRate: 26,
  /** Climb and descent from pitch, metres per second at cruise speed. */
  climbFactor: 0.9,
  /** Speed below which the wing stops flying properly. */
  stallSpeed: 30,
  /** Take-off rotation speed. */
  rotateSpeed: 34,
};

/** Fuel: 100 units at departure; the burn is the sortie's clock. */
export const FUEL = {
  start: 100,
  idleBurn: 0.15,
  fullBurn: 0.62,
  /** Below this the FUEL light comes on. */
  lowAt: 25,
};

/** The home runway: a strip along +z, centred on x = 0. */
export const RUNWAY = { halfWidth: 18, startZ: 0, endZ: 900, heading: 0 };

/** A signal ring: fly through its middle to score. */
export const RING = { radius: 26, points: 100 };

/** A waypoint beacon: come within this distance to tick it off. */
export const WAYPOINT = { radius: 130, points: 150 };

export const MISSION = {
  ringCount: 8,
  patrolSeconds: 240,
  landingBonus: 200,
  completionBonus: 150,
};

export const PALETTE = {
  skyTop: '#1d4e79',
  skyMid: '#5d94c4',
  skyHorizon: '#ffd9a3',
  sunCore: '#fff3c4',
  sunGlow: '#ffdf8a',
  mountainFar: '#7d94b5',
  mountainNear: '#4d6a4f',
  fieldGreen: '#6fa055',
  fieldLight: '#8fb45e',
  fieldGold: '#c9b458',
  forest: '#3e6b3a',
  town: '#b8a888',
  townRoof: '#8a6f5a',
  water: '#3f7fb5',
  waterDeep: '#2c5f8a',
  runway: '#4a4a52',
  runwayEdge: '#e8e8e8',
  runwayMark: '#f5d76e',
  planeCream: '#f2ead8',
  planeRed: '#c23b2e',
  planeDark: '#2e3138',
  canopy: '#274b63',
  panel: '#20242c',
  panelEdge: '#3a4150',
  gaugeFace: '#10141a',
  gaugeRing: '#c8ccd4',
  text: '#f2f4f7',
  muted: '#aab2bf',
  amber: '#ffb02e',
  green: '#58d68d',
  red: '#ff5a4e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
