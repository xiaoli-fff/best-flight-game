// Drawing only: the flight's state in, pixels out. A pseudo-3D chase view —
// sky, ridgelines, a projected patchwork valley, glowing rings, the Kestrel
// drawn part by part, and a lit instrument panel — over a fixed 1280x720
// playfield scaled to fit the window.
import { FIELD, FOCAL, FUEL, HORIZON_Y, PALETTE, FONT, RING, RUNWAY } from './config.js';
import { hash2, wrapAngle } from './random.js';
import { groundKind, terrainHeight, PASS_GATE, KIND_FIELD, KIND_FIELD_LIGHT, KIND_FIELD_GOLD, KIND_FOREST, KIND_TOWN, KIND_WATER, KIND_RUNWAY } from './terrain.js';
import { altitudeFeet, speedKnots } from './flight.js';
import { MISSION_INFO, objectiveLine } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const DEG = Math.PI / 180;
const GROUND_ROWS = 30;
const GROUND_HALF = 1600;
const GROUND_CELL = 200;

const KIND_COLORS = {
  [KIND_FIELD]: PALETTE.fieldGreen,
  [KIND_FIELD_LIGHT]: PALETTE.fieldLight,
  [KIND_FIELD_GOLD]: PALETTE.fieldGold,
  [KIND_FOREST]: PALETTE.forest,
  [KIND_TOWN]: PALETTE.town,
  [KIND_WATER]: PALETTE.water,
  [KIND_RUNWAY]: PALETTE.runway,
};

function hexRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Mix a colour toward the hazy horizon colour with distance. */
function shadeColor(hex, fog) {
  const [r, g, b] = hexRgb(hex);
  const t = Math.min(0.75, Math.max(0, fog));
  const mix = (channel, target) => Math.round(channel + (target - channel) * t);
  return `rgb(${mix(r, 255)},${mix(g, 217)},${mix(b, 163)})`;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.arcTo(x + width, y, x + width, y + radius, radius);
  context.lineTo(x + width, y + height - radius);
  context.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  context.lineTo(x + radius, y + height);
  context.arcTo(x, y + height, x, y + height - radius, radius);
  context.lineTo(x, y + radius);
  context.arcTo(x, y, x + radius, y, radius);
  context.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.scale = scale;
    view.x = (width - FIELD.width * scale) / 2;
    view.y = (height - FIELD.height * scale) / 2;
  }

  window.addEventListener('resize', resize);
  resize();

  function text(str, x, y, size, color, align = 'left', weight = '600') {
    context.font = `${weight} ${size}px ${FONT}`;
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(str, x, y);
  }

  /** Project a world point to logical screen coordinates, or null behind us. */
  function projectPoint(wx, wy, wz, cam) {
    const dx = wx - cam.x;
    const dy = wy - cam.y;
    const dz = wz - cam.z;
    const forward = dx * cam.sinH + dz * cam.cosH;
    const lateral = dx * cam.cosH - dz * cam.sinH;
    const f2 = forward * cam.cosP + dy * cam.sinP;
    const v2 = -forward * cam.sinP + dy * cam.cosP;
    if (f2 < 6) return null;
    return {
      x: FIELD.width / 2 + (lateral / f2) * FOCAL,
      y: cam.horizonY - (v2 / f2) * FOCAL,
      f: f2,
    };
  }

  function drawSky(flight, time) {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.45, PALETTE.skyMid);
    gradient.addColorStop(0.62, PALETTE.skyHorizon);
    gradient.addColorStop(1, '#2c3a2e');
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // The morning sun hangs west; it slides across the sky as you turn.
    const sunRel = wrapAngle(250 - flight.heading);
    if (Math.abs(sunRel) < 85) {
      const sunX = FIELD.width / 2 + Math.tan(sunRel * DEG) * FOCAL * 0.55;
      const sunY = HORIZON_Y - 170;
      const glow = context.createRadialGradient(sunX, sunY, 8, sunX, sunY, 150);
      glow.addColorStop(0, PALETTE.sunGlow);
      glow.addColorStop(0.25, 'rgba(255, 223, 138, 0.45)');
      glow.addColorStop(1, 'rgba(255, 223, 138, 0)');
      context.fillStyle = glow;
      context.fillRect(sunX - 150, sunY - 150, 300, 300);
      context.fillStyle = PALETTE.sunCore;
      context.beginPath();
      context.arc(sunX, sunY, 26, 0, Math.PI * 2);
      context.fill();
    }
    // Drifting clouds, parallaxed by heading.
    context.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (let index = 0; index < 8; index += 1) {
      const base = hash2(index, 7) * FIELD.width * 1.6 - 200;
      const drift = time * (2 + index) + flight.heading * 9;
      let x = (base - drift) % (FIELD.width + 320);
      if (x < -160) x += FIELD.width + 320;
      const y = 40 + hash2(index, 3) * 180;
      const scale = 0.7 + hash2(index, 11) * 0.9;
      context.beginPath();
      context.ellipse(x, y, 70 * scale, 18 * scale, 0, 0, Math.PI * 2);
      context.ellipse(x + 42 * scale, y + 6, 48 * scale, 14 * scale, 0, 0, Math.PI * 2);
      context.ellipse(x - 44 * scale, y + 7, 44 * scale, 13 * scale, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawMountains(cam) {
    const layers = [
      { color: PALETTE.mountainFar, base: 46, amp: 42, parallax: 0.35, seed: 5 },
      { color: PALETTE.mountainNear, base: 22, amp: 30, parallax: 0.8, seed: 9 },
    ];
    for (const layer of layers) {
      context.fillStyle = layer.color;
      context.beginPath();
      context.moveTo(0, cam.horizonY + 2);
      for (let x = 0; x <= FIELD.width; x += 16) {
        const ridge =
          layer.base +
          layer.amp * (0.6 * Math.sin(x * 0.008 + cam.heading * 0.02 * layer.parallax + layer.seed) +
            0.4 * Math.sin(x * 0.021 + cam.heading * 0.05 * layer.parallax + layer.seed * 2));
        context.lineTo(x, cam.horizonY - Math.max(4, ridge));
      }
      context.lineTo(FIELD.width, cam.horizonY + 2);
      context.closePath();
      context.fill();
    }
  }

  function drawGround(flight, cam) {
    // Rows grow geometrically with distance; far rows paint first. Both the
    // columns and the row edges snap to the world's own grid, so a field
    // stays where it is instead of swimming past as the plane moves. Each
    // row is as wide as its far edge needs — the valley opens up with
    // distance, so no sky shows through at the sides.
    const distances = [];
    for (let index = 0; index <= GROUND_ROWS; index += 1) distances.push(26 * Math.pow(1.17, index));
    for (let row = GROUND_ROWS - 1; row >= 0; row -= 1) {
      let zNear = Math.floor((cam.z + distances[row]) / 40) * 40;
      let zFar = Math.floor((cam.z + distances[row + 1]) / 40) * 40;
      if (zFar <= zNear) zFar = zNear + 40;
      if (zFar < -400) continue;
      const halfWidth = GROUND_HALF + Math.max(0, zFar - cam.z) * 1.2;
      const xStart = Math.floor((flight.x - halfWidth) / GROUND_CELL) * GROUND_CELL;
      const colCount = Math.ceil((halfWidth * 2) / GROUND_CELL) + 1;
      for (let col = 0; col < colCount; col += 1) {
        const wxLeft = xStart + col * GROUND_CELL;
        const wxRight = wxLeft + GROUND_CELL;
        const centreX = (wxLeft + wxRight) / 2;
        const centreZ = (zNear + zFar) / 2;
        const kind = groundKind(centreX, centreZ);
        const fog = (zFar - cam.z) / 3200;
        const p1 = projectPoint(wxLeft, terrainHeight(wxLeft, zNear), zNear, cam);
        const p2 = projectPoint(wxRight, terrainHeight(wxRight, zNear), zNear, cam);
        const p3 = projectPoint(wxRight, terrainHeight(wxRight, zFar), zFar, cam);
        const p4 = projectPoint(wxLeft, terrainHeight(wxLeft, zFar), zFar, cam);
        if (!p1 || !p2 || !p3 || !p4) continue;
        context.fillStyle = shadeColor(KIND_COLORS[kind], fog);
        context.beginPath();
        context.moveTo(p1.x, p1.y);
        context.lineTo(p2.x, p2.y);
        context.lineTo(p3.x, p3.y);
        context.lineTo(p4.x, p4.y);
        context.closePath();
        context.fill();
        // A town cell gets a rooftop or two, so the town reads as a town.
        if (kind === KIND_TOWN && hash2(Math.floor(centreX / 200), Math.floor(centreZ / 200)) > 0.45) {
          const base = projectPoint(centreX, terrainHeight(centreX, centreZ), centreZ, cam);
          const top = projectPoint(centreX, terrainHeight(centreX, centreZ) + 12, centreZ, cam);
          if (base && top) {
            const width = Math.max(2, 16 * (FOCAL / base.f));
            context.fillStyle = shadeColor(PALETTE.townRoof, fog);
            context.fillRect(base.x - width / 2, top.y, width, base.y - top.y);
          }
        }
      }
    }
  }

  function drawRunway(cam) {
    // The home strip, drawn crisp over the ground cells: asphalt, centre dashes,
    // threshold bars, and a windsock by the numbers. Only the part ahead of
    // the camera is drawn; the part behind it is out of frame anyway.
    const z0 = Math.max(RUNWAY.startZ, Math.floor(cam.z) + 8);
    const strip = [];
    for (const z of [z0, RUNWAY.endZ]) {
      const left = projectPoint(-RUNWAY.halfWidth, 0.4, z, cam);
      const right = projectPoint(RUNWAY.halfWidth, 0.4, z, cam);
      if (left && right) strip.push({ z, left, right });
    }
    if (strip.length === 2) {
      context.fillStyle = PALETTE.runway;
      context.beginPath();
      context.moveTo(strip[0].left.x, strip[0].left.y);
      context.lineTo(strip[0].right.x, strip[0].right.y);
      context.lineTo(strip[1].right.x, strip[1].right.y);
      context.lineTo(strip[1].left.x, strip[1].left.y);
      context.closePath();
      context.fill();
      context.strokeStyle = PALETTE.runwayEdge;
      context.lineWidth = 2;
      context.stroke();
      // Centreline dashes, one per 60 m of strip.
      for (let z = Math.max(30, z0); z < RUNWAY.endZ; z += 60) {
        const a = projectPoint(-1.6, 0.6, z, cam);
        const b = projectPoint(1.6, 0.6, z, cam);
        const c = projectPoint(1.6, 0.6, z + 28, cam);
        const d = projectPoint(-1.6, 0.6, z + 28, cam);
        if (!a || !b || !c || !d) continue;
        context.fillStyle = PALETTE.runwayMark;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.lineTo(c.x, c.y);
        context.lineTo(d.x, d.y);
        context.closePath();
        context.fill();
      }
      // Threshold bars at each end.
      for (const z of [RUNWAY.startZ + 8, RUNWAY.endZ - 8]) {
        for (let index = -2; index <= 2; index += 1) {
          const a = projectPoint(index * 6 - 2, 0.6, z, cam);
          const b = projectPoint(index * 6 + 2, 0.6, z, cam);
          const c = projectPoint(index * 6 + 2, 0.6, z + 14, cam);
          const d = projectPoint(index * 6 - 2, 0.6, z + 14, cam);
          if (!a || !b || !c || !d) continue;
          context.fillStyle = '#ffffff';
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.lineTo(c.x, c.y);
          context.lineTo(d.x, d.y);
          context.closePath();
          context.fill();
        }
      }
    }
    // Windsock beside the threshold.
    const sockBase = projectPoint(34, 0, 60, cam);
    const sockTop = projectPoint(34, 9, 60, cam);
    if (sockBase && sockTop) {
      context.strokeStyle = '#d8d8d8';
      context.lineWidth = Math.max(1, 2 * (FOCAL / sockBase.f));
      context.beginPath();
      context.moveTo(sockBase.x, sockBase.y);
      context.lineTo(sockTop.x, sockTop.y);
      context.stroke();
      context.fillStyle = '#ff7f2a';
      context.beginPath();
      context.moveTo(sockTop.x, sockTop.y);
      context.lineTo(sockTop.x + 16 * (FOCAL / sockBase.f) * 0.05 + 14, sockTop.y + 4);
      context.lineTo(sockTop.x, sockTop.y + 7);
      context.closePath();
      context.fill();
    }
  }

  function drawRing(ring, cam, next, passed, time) {
    const centre = projectPoint(ring.x, ring.y, ring.z, cam);
    if (!centre) return;
    // Rings from the course carry no radius of their own; the pass gate does.
    const radius = ring.radius ?? RING.radius;
    const radiusPx = (radius * FOCAL) / centre.f;
    if (radiusPx < 3 || radiusPx > 900) return;
    // A stem down to the ground, so the ring's height reads at a glance.
    const ground = projectPoint(ring.x, terrainHeight(ring.x, ring.z), ring.z, cam);
    if (ground) {
      context.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(centre.x, centre.y);
      context.lineTo(ground.x, ground.y);
      context.stroke();
    }
    const pulse = next ? 0.75 + 0.25 * Math.sin(time * 5) : 1;
    const color = passed ? '#58d68d' : next ? '#ffb02e' : '#39c6ff';
    context.save();
    // A faint fill so the ring reads as a target, not just a wire.
    context.globalAlpha = passed ? 0.1 : 0.14 * pulse;
    context.fillStyle = color;
    context.beginPath();
    context.arc(centre.x, centre.y, radiusPx, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = passed ? 0.45 : 0.95 * pulse;
    context.strokeStyle = color;
    context.lineWidth = Math.max(2.5, radiusPx * 0.09);
    context.shadowColor = color;
    context.shadowBlur = 18;
    context.beginPath();
    context.arc(centre.x, centre.y, radiusPx, 0, Math.PI * 2);
    context.stroke();
    context.shadowBlur = 0;
    context.globalAlpha = passed ? 0.35 : 0.8;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(centre.x, centre.y, radiusPx * 0.72, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    if (next) {
      text(`${Math.round(centre.f)}m`, centre.x, centre.y - radiusPx - 10, 15, '#ffffff', 'center');
    }
  }

  function drawBeacon(stop, cam, time) {
    const top = projectPoint(stop.x, stop.y + 120, stop.z, cam);
    const base = projectPoint(stop.x, terrainHeight(stop.x, stop.z), stop.z, cam);
    const mid = projectPoint(stop.x, stop.y, stop.z, cam);
    if (!top || !base || !mid) return;
    const pulse = 0.6 + 0.4 * Math.sin(time * 4);
    context.save();
    context.globalAlpha = 0.5 * pulse;
    context.strokeStyle = '#ffb02e';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(base.x, base.y);
    context.lineTo(top.x, top.y);
    context.stroke();
    context.restore();
    const size = Math.max(6, (26 * FOCAL) / mid.f * 0.4);
    context.save();
    context.translate(mid.x, mid.y);
    context.rotate(Math.PI / 4);
    context.fillStyle = '#ffb02e';
    context.fillRect(-size / 2, -size / 2, size, size);
    context.restore();
    const dist = Math.round(Math.hypot(stop.x - cam.x, stop.z - cam.z));
    text(`${stop.name}  ${dist}m`, mid.x, mid.y - size - 8, 15, '#ffffff', 'center');
  }

  function drawPlaneShadow(flight, cam) {
    if (!flight.airborne) return;
    const groundY = terrainHeight(flight.x, flight.z);
    const height = flight.y - groundY;
    if (height < 2 || height > 400) return;
    const shadow = projectPoint(flight.x, groundY + 0.6, flight.z, cam);
    if (!shadow) return;
    const width = Math.max(4, (46 * FOCAL) / shadow.f);
    context.fillStyle = `rgba(0, 0, 0, ${Math.max(0.08, 0.3 - height * 0.0006)})`;
    context.beginPath();
    context.ellipse(shadow.x, shadow.y, width, width * 0.28, 0, 0, Math.PI * 2);
    context.fill();
  }

  /** The Kestrel K-2 from behind: fuselage, wings, tail, canopy and lights. */
  function drawPlane(flight, time) {
    const bob = Math.sin(time * 7) * 1.5;
    const centreX = FIELD.width / 2;
    const centreY = 478 + bob - flight.pitch * 1.2;
    context.save();
    context.translate(centreX, centreY);
    context.rotate(flight.bank * 0.85 * DEG);
    // Main wings, swept slightly back, red tips.
    for (const side of [-1, 1]) {
      context.fillStyle = PALETTE.planeCream;
      context.beginPath();
      context.moveTo(side * 14, -8);
      context.lineTo(side * 158, 22);
      context.lineTo(side * 146, 44);
      context.lineTo(side * 12, 20);
      context.closePath();
      context.fill();
      context.fillStyle = PALETTE.planeRed;
      context.beginPath();
      context.moveTo(side * 128, 16);
      context.lineTo(side * 158, 22);
      context.lineTo(side * 146, 44);
      context.lineTo(side * 120, 38);
      context.closePath();
      context.fill();
    }
    // Tailplane.
    context.fillStyle = PALETTE.planeCream;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.moveTo(side * 8, -52);
      context.lineTo(side * 64, -40);
      context.lineTo(side * 60, -28);
      context.lineTo(side * 8, -38);
      context.closePath();
      context.fill();
    }
    // Vertical fin with the red flash.
    context.fillStyle = PALETTE.planeRed;
    context.beginPath();
    context.moveTo(0, -92);
    context.lineTo(-15, -34);
    context.lineTo(15, -34);
    context.closePath();
    context.fill();
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(0, -92);
    context.lineTo(-7, -52);
    context.lineTo(7, -52);
    context.closePath();
    context.fill();
    // Fuselage: narrow at the tail, wide toward the camera.
    const body = context.createLinearGradient(-24, 0, 24, 0);
    body.addColorStop(0, '#d9cfb6');
    body.addColorStop(0.5, PALETTE.planeCream);
    body.addColorStop(1, '#cfc3a8');
    context.fillStyle = body;
    context.beginPath();
    context.moveTo(-9, -72);
    context.quadraticCurveTo(-26, -10, -24, 34);
    context.quadraticCurveTo(-22, 52, 0, 54);
    context.quadraticCurveTo(22, 52, 24, 34);
    context.quadraticCurveTo(26, -10, 9, -72);
    context.closePath();
    context.fill();
    // Red cheatline down the fuselage sides.
    context.fillStyle = PALETTE.planeRed;
    context.fillRect(-24, 8, 48, 5);
    // Rear window and the pilot's headrest.
    context.fillStyle = PALETTE.canopy;
    roundRect(context, -11, -34, 22, 16, 6);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.35)';
    context.fillRect(-8, -32, 6, 12);
    // Twin exhausts, glowing.
    for (const side of [-1, 1]) {
      const glow = context.createRadialGradient(side * 11, 48, 1, side * 11, 48, 12);
      glow.addColorStop(0, 'rgba(255, 170, 60, 0.95)');
      glow.addColorStop(1, 'rgba(255, 120, 30, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(side * 11, 48, 12, 0, Math.PI * 2);
      context.fill();
    }
    // Navigation lights: red port, green starboard, white strobe on the tail.
    context.fillStyle = '#ff3b30';
    context.beginPath();
    context.arc(-156, 32, 4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#35e08a';
    context.beginPath();
    context.arc(156, 32, 4, 0, Math.PI * 2);
    context.fill();
    if (Math.sin(time * 6) > 0) {
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(0, -92, 4, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawCockpit(flight, time) {
    // Canopy struts and the nose cowl; the world stays the same, the pilot
    // just sits inside it now.
    context.fillStyle = 'rgba(20, 26, 34, 0.92)';
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(180, 0);
    context.lineTo(430, FIELD.height);
    context.lineTo(330, FIELD.height);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(FIELD.width, 0);
    context.lineTo(FIELD.width - 180, 0);
    context.lineTo(FIELD.width - 430, FIELD.height);
    context.lineTo(FIELD.width - 330, FIELD.height);
    context.closePath();
    context.fill();
    // Nose cowl at the bottom centre, exhausts glowing.
    const cowl = context.createLinearGradient(0, 560, 0, FIELD.height);
    cowl.addColorStop(0, '#8a7f68');
    cowl.addColorStop(1, '#3a352c');
    context.fillStyle = cowl;
    context.beginPath();
    context.moveTo(FIELD.width / 2 - 190, FIELD.height);
    context.quadraticCurveTo(FIELD.width / 2 - 150, 600, FIELD.width / 2, 596);
    context.quadraticCurveTo(FIELD.width / 2 + 150, 600, FIELD.width / 2 + 190, FIELD.height);
    context.closePath();
    context.fill();
    for (const side of [-1, 1]) {
      const glow = context.createRadialGradient(FIELD.width / 2 + side * 70, 660, 2, FIELD.width / 2 + side * 70, 660, 16);
      glow.addColorStop(0, 'rgba(255, 170, 60, 0.9)');
      glow.addColorStop(1, 'rgba(255, 120, 30, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(FIELD.width / 2 + side * 70, 660, 16, 0, Math.PI * 2);
      context.fill();
    }
    void time;
    void flight;
  }

  function drawGauge(x, y, radius, label, value, min, max, unit) {
    context.save();
    context.translate(x, y);
    context.fillStyle = PALETTE.gaugeFace;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.gaugeRing;
    context.lineWidth = 2;
    context.stroke();
    for (let index = 0; index <= 10; index += 1) {
      const angle = (-225 + index * 27) * DEG;
      const inner = radius - (index % 5 === 0 ? 12 : 7);
      context.strokeStyle = '#c8ccd4';
      context.lineWidth = index % 5 === 0 ? 2 : 1;
      context.beginPath();
      context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      context.lineTo(Math.cos(angle) * (radius - 3), Math.sin(angle) * (radius - 3));
      context.stroke();
    }
    const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const needle = (-225 + fraction * 270) * DEG;
    context.strokeStyle = '#ffb02e';
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(Math.cos(needle) * (radius - 8), Math.sin(needle) * (radius - 8));
    context.stroke();
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(0, 0, 3, 0, Math.PI * 2);
    context.fill();
    context.font = `600 11px ${FONT}`;
    context.fillStyle = PALETTE.muted;
    context.textAlign = 'center';
    context.fillText(label, 0, radius + 16);
    context.font = `700 13px ${FONT}`;
    context.fillStyle = '#ffffff';
    context.fillText(`${Math.round(value)}${unit}`, 0, radius - 8);
    context.restore();
  }

  function drawAttitude(x, y, radius, flight) {
    context.save();
    context.translate(x, y);
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.clip();
    context.save();
    context.rotate(-flight.bank * DEG);
    context.translate(0, flight.pitch * 1.6);
    context.fillStyle = '#3f7fc4';
    context.fillRect(-radius - 4, -radius * 2 - 4, radius * 2 + 8, radius * 2 + 4);
    context.fillStyle = '#7a5230';
    context.fillRect(-radius - 4, 0, radius * 2 + 8, radius * 2 + 4);
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-radius, 0);
    context.lineTo(radius, 0);
    context.stroke();
    context.restore();
    // Fixed aircraft symbol: the wings never bank, the world does.
    context.strokeStyle = '#ffffff';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(-radius * 0.55, 0);
    context.lineTo(-radius * 0.15, 0);
    context.moveTo(radius * 0.15, 0);
    context.lineTo(radius * 0.55, 0);
    context.stroke();
    context.fillStyle = '#ffb02e';
    context.beginPath();
    context.arc(0, 0, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.strokeStyle = PALETTE.gaugeRing;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();
    context.font = `600 11px ${FONT}`;
    context.fillStyle = PALETTE.muted;
    context.textAlign = 'center';
    context.fillText('ATTITUDE', x, y + radius + 16);
  }

  function drawCompassTape(flight) {
    const centreX = FIELD.width / 2;
    const y = 58;
    context.fillStyle = 'rgba(16, 20, 26, 0.72)';
    roundRect(context, centreX - 210, y - 20, 420, 34, 8);
    context.fill();
    context.save();
    context.beginPath();
    roundRect(context, centreX - 210, y - 20, 420, 34, 8);
    context.clip();
    for (let offset = -180; offset <= 180; offset += 10) {
      const heading = Math.round((flight.heading + offset) / 10) * 10;
      const wrapped = ((heading % 360) + 360) % 360;
      const x = centreX + offset * 2.1;
      const major = wrapped % 30 === 0;
      context.strokeStyle = major ? '#ffffff' : '#8b93a3';
      context.lineWidth = major ? 2 : 1;
      context.beginPath();
      context.moveTo(x, y - 8);
      context.lineTo(x, y + (major ? 8 : 2));
      context.stroke();
      if (major) {
        const label = wrapped === 0 ? 'N' : wrapped === 90 ? 'E' : wrapped === 180 ? 'S' : wrapped === 270 ? 'W' : String(wrapped / 10);
        text(label, x, y + 24, 11, '#ffffff', 'center');
      }
    }
    context.restore();
    context.fillStyle = '#ffb02e';
    context.beginPath();
    context.moveTo(centreX - 6, y - 20);
    context.lineTo(centreX + 6, y - 20);
    context.lineTo(centreX, y - 8);
    context.closePath();
    context.fill();
    text(`${String(Math.round(((flight.heading % 360) + 360) % 360)).padStart(3, '0')}°`, centreX, y - 28, 15, '#ffffff', 'center', '700');
  }

  function drawHud(flight, mission, time) {
    // Top-left: speed and altitude, big enough to read at a glance.
    context.fillStyle = 'rgba(16, 20, 26, 0.72)';
    roundRect(context, 16, 12, 190, 74, 10);
    context.fill();
    text('SPD', 30, 34, 12, PALETTE.muted);
    text(`${speedKnots(flight)}`, 30, 66, 30, '#ffffff', 'left', '800');
    text('KT', 118, 66, 14, PALETTE.muted);
    text('ALT', 30, 82, 12, PALETTE.muted);
    text(`${altitudeFeet(flight)}`, 96, 82, 16, '#ffffff', 'left', '700');
    text('FT', 158, 82, 12, PALETTE.muted);
    drawCompassTape(flight);
    // Top-right: fuel, score, and the objective.
    context.fillStyle = 'rgba(16, 20, 26, 0.72)';
    roundRect(context, FIELD.width - 216, 12, 200, 74, 10);
    context.fill();
    text('FUEL', FIELD.width - 202, 34, 12, PALETTE.muted);
    const fuelWidth = 120;
    context.fillStyle = '#333a45';
    roundRect(context, FIELD.width - 202, 42, fuelWidth, 12, 6);
    context.fill();
    context.fillStyle = flight.fuel < FUEL.lowAt ? PALETTE.red : PALETTE.green;
    if (flight.fuel > 0) {
      roundRect(context, FIELD.width - 202, 42, Math.max(6, (fuelWidth * flight.fuel) / 100), 12, 6);
      context.fill();
    }
    text(`${Math.round(flight.fuel)}%`, FIELD.width - 74, 54, 13, '#ffffff', 'left', '700');
    text('SCORE', FIELD.width - 202, 82, 12, PALETTE.muted);
    text(String(mission.score), FIELD.width - 140, 82, 16, '#ffffff', 'left', '700');
    // Objective line under the compass.
    text(objectiveLine(mission), FIELD.width / 2, 100, 15, '#ffe9b0', 'center');
    // Warning lights.
    let warnX = 16;
    const warnY = 100;
    if (flight.fuel < FUEL.lowAt) {
      context.fillStyle = Math.sin(time * 8) > 0 ? PALETTE.amber : '#7a5a10';
      roundRect(context, warnX, warnY, 92, 24, 6);
      context.fill();
      text('LOW FUEL', warnX + 46, warnY + 17, 12, '#111111', 'center', '800');
      warnX += 100;
    }
    if (flight.airborne && flight.speed < 30) {
      context.fillStyle = Math.sin(time * 8) > 0 ? PALETTE.red : '#7a1d18';
      roundRect(context, warnX, warnY, 76, 24, 6);
      context.fill();
      text('STALL', warnX + 38, warnY + 17, 12, '#ffffff', 'center', '800');
      warnX += 84;
    }
    if (flight.damage > 0) {
      context.fillStyle = PALETTE.red;
      roundRect(context, warnX, warnY, 96, 24, 6);
      context.fill();
      text(`DMG ${Math.round(flight.damage)}%`, warnX + 48, warnY + 17, 12, '#ffffff', 'center', '800');
    }
    // Flash message from the mission, centre screen.
    if (mission.message && mission.messageTime > 0) {
      const alpha = Math.min(1, mission.messageTime);
      context.save();
      context.globalAlpha = alpha;
      context.font = `800 30px ${FONT}`;
      const width = context.measureText(mission.message).width;
      context.fillStyle = 'rgba(16, 20, 26, 0.78)';
      roundRect(context, FIELD.width / 2 - width / 2 - 22, 148, width + 44, 48, 10);
      context.fill();
      text(mission.message, FIELD.width / 2, 180, 30, '#ffe9b0', 'center', '800');
      context.restore();
    }
  }

  function drawPanel(flight, mission, view) {
    const height = view === 'cockpit' ? 168 : 112;
    const top = FIELD.height - height;
    const gradient = context.createLinearGradient(0, top, 0, FIELD.height);
    gradient.addColorStop(0, '#2b313c');
    gradient.addColorStop(0.12, PALETTE.panel);
    gradient.addColorStop(1, '#171b21');
    context.fillStyle = gradient;
    context.fillRect(0, top, FIELD.width, height);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, top, FIELD.width, 2);
    const centreY = top + height / 2 - 4;
    const radius = view === 'cockpit' ? 52 : 40;
    drawAttitude(78, centreY, radius, flight);
    drawGauge(196, centreY, radius, 'ALTITUDE', altitudeFeet(flight), 0, 12000, 'ft');
    drawGauge(312, centreY, radius, 'AIRSPEED', speedKnots(flight), 0, 200, 'kt');
    // Throttle lever and fuel, right of the gauges.
    const leverX = 430;
    text('THR', leverX, centreY - radius + 6, 11, PALETTE.muted, 'center');
    context.fillStyle = '#333a45';
    roundRect(context, leverX - 8, centreY - radius + 16, 16, radius * 2 - 16, 8);
    context.fill();
    const leverY = centreY + radius - 16 - (flight.throttle * (radius * 2 - 16));
    context.fillStyle = PALETTE.amber;
    roundRect(context, leverX - 14, leverY - 6, 28, 12, 6);
    context.fill();
    text(`${Math.round(flight.throttle * 100)}%`, leverX, centreY + radius + 16, 12, '#ffffff', 'center', '700');
    // Centre: the sortie's own numbers.
    const centreX = FIELD.width / 2;
    text(MISSION_INFO[mission.kind].name.toUpperCase(), centreX, centreY - 22, 15, '#ffe9b0', 'center', '800');
    text(`TIME ${Math.floor(flight.elapsed / 60)}:${String(Math.floor(flight.elapsed % 60)).padStart(2, '0')}   DIST ${(flight.distance / 1000).toFixed(1)}km   MAX ALT ${Math.round(flight.maxAltitude * 3.281)}ft`, centreX, centreY + 2, 13, PALETTE.muted, 'center');
    text('ARROWS fly  ·  SHIFT/CTRL throttle  ·  C cockpit  ·  P pause', centreX, centreY + 24, 12, '#7d8593', 'center');
    // Right: damage bar.
    const dmgX = FIELD.width - 220;
    text('AIRFRAME', dmgX, centreY - radius + 6, 11, PALETTE.muted);
    context.fillStyle = '#333a45';
    roundRect(context, dmgX, centreY - radius + 18, 180, 12, 6);
    context.fill();
    context.fillStyle = flight.damage > 60 ? PALETTE.red : flight.damage > 0 ? PALETTE.amber : PALETTE.green;
    if (flight.damage > 0) {
      roundRect(context, dmgX, centreY - radius + 18, Math.max(6, (180 * flight.damage) / 100), 12, 6);
      context.fill();
    }
    text(flight.damage > 0 ? `${Math.round(flight.damage)}% damage` : 'airframe clean', dmgX, centreY - radius + 44, 12, '#ffffff');
    text('KESTREL K-2 · VALLEY AIR MAIL', dmgX, centreY + 24, 11, '#7d8593');
  }

  function drawTitle(flight, mission, best) {
    context.fillStyle = 'rgba(10, 16, 26, 0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = 'rgba(16, 20, 26, 0.88)';
    roundRect(context, 290, 92, 700, 536, 16);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    roundRect(context, 290, 92, 700, 536, 16);
    context.stroke();
    text('RIDGE RUNNER', 640, 168, 54, '#ffffff', 'center', '800');
    text('VALLEY AIR MAIL  ·  KESTREL K-2', 640, 198, 17, '#ffb02e', 'center', '700');
    text('A bush pilot’s morning in the valley: rings to thread, mail to drop,', 640, 232, 15, PALETTE.muted, 'center');
    text('and one runway to bring her home to.', 640, 254, 15, PALETTE.muted, 'center');
    const rows = [
      { key: '1', name: 'Ring Run', blurb: MISSION_INFO.rings.blurb },
      { key: '2', name: 'Valley Circuit', blurb: MISSION_INFO.circuit.blurb },
      { key: '3', name: 'Air Mail Patrol', blurb: MISSION_INFO.patrol.blurb },
    ];
    rows.forEach((row, index) => {
      const y = 292 + index * 74;
      context.fillStyle = index === 0 ? 'rgba(255, 176, 46, 0.16)' : 'rgba(255,255,255,0.05)';
      roundRect(context, 322, y, 636, 62, 10);
      context.fill();
      context.fillStyle = '#ffb02e';
      context.beginPath();
      context.arc(352, y + 31, 17, 0, Math.PI * 2);
      context.fill();
      text(row.key, 352, y + 37, 18, '#111111', 'center', '800');
      text(row.name, 382, y + 27, 19, '#ffffff', 'left', '700');
      text(row.blurb, 382, y + 48, 13, PALETTE.muted);
    });
    text('Click a sortie, or press 1 / 2 / 3 — then fly with the arrow keys.', 640, 528, 15, '#ffffff', 'center');
    text('↑ climb  ↓ dive  ← → bank  ·  SHIFT more throttle, CTRL less  ·  mouse drag steers too', 640, 554, 13, PALETTE.muted, 'center');
    text('C toggles the cockpit view  ·  P pauses  ·  R restarts the sortie', 640, 578, 13, PALETTE.muted, 'center');
    if (best > 0) text(`Best score so far: ${best}`, 640, 610, 14, '#ffe9b0', 'center', '700');
    void flight;
    void mission;
  }

  function drawPaused() {
    context.fillStyle = 'rgba(10, 16, 26, 0.6)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('PAUSED', FIELD.width / 2, 330, 52, '#ffffff', 'center', '800');
    text('P to keep flying  ·  R to restart  ·  M for the main menu', FIELD.width / 2, 372, 16, PALETTE.muted, 'center');
  }

  function drawOver(flight, mission, best) {
    context.fillStyle = 'rgba(10, 16, 26, 0.62)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = 'rgba(16, 20, 26, 0.92)';
    roundRect(context, 340, 150, 600, 380, 16);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    roundRect(context, 340, 150, 600, 380, 16);
    context.stroke();
    let title = 'SORTIE OVER';
    let color = '#ffffff';
    if (mission.done) { title = 'SORTIE COMPLETE'; color = '#58d68d'; }
    else if (flight.crashed) { title = 'CRASHED'; color = '#ff5a4e'; }
    else if (flight.engineOut && flight.fuel <= 0) { title = 'OUT OF FUEL'; color = '#ffb02e'; }
    else if (mission.failed) { title = 'OUT OF TIME'; color = '#ffb02e'; }
    text(title, 640, 216, 44, color, 'center', '800');
    text(MISSION_INFO[mission.kind].name, 640, 248, 18, '#ffe9b0', 'center', '700');
    const lines = [
      ['Score', String(mission.score)],
      ['Best', String(Math.max(best, mission.score))],
      ['Flight time', `${Math.floor(flight.elapsed / 60)}:${String(Math.floor(flight.elapsed % 60)).padStart(2, '0')}`],
      ['Distance', `${(flight.distance / 1000).toFixed(1)} km`],
      ['Max altitude', `${Math.round(flight.maxAltitude * 3.281)} ft`],
      ['Fuel left', `${Math.round(flight.fuel)}%`],
    ];
    lines.forEach((line, index) => {
      const y = 292 + index * 30;
      text(line[0], 420, y, 16, PALETTE.muted);
      text(line[1], 860, y, 16, '#ffffff', 'right', '700');
    });
    text('R — fly it again    M — main menu', 640, 496, 16, '#ffffff', 'center');
  }

  function cameraFor(flight) {
    const headingRad = flight.heading * DEG;
    const pitchRad = flight.pitch * 0.6 * DEG;
    return {
      x: flight.x,
      y: flight.y + 1.5,
      z: flight.z,
      sinH: Math.sin(headingRad),
      cosH: Math.cos(headingRad),
      sinP: Math.sin(pitchRad),
      cosP: Math.cos(pitchRad),
      heading: flight.heading,
      horizonY: HORIZON_Y + Math.tan(pitchRad) * FOCAL,
    };
  }

  return {
    /** Paint one frame of the given world: flight, mission, screen, view, time. */
    draw(world) {
      const { flight, mission, screen, view, time } = world;
      resize();
      context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
      const cam = cameraFor(flight);
      drawSky(flight, time);
      context.save();
      context.translate(FIELD.width / 2, cam.horizonY);
      context.rotate(flight.bank * DEG);
      context.translate(-FIELD.width / 2, -cam.horizonY);
      drawMountains(cam);
      drawGround(flight, cam);
      drawRunway(cam);
      // Rings and beacons, far first so near ones paint over.
      const rings = mission.rings.map((ring, index) => ({ ring, index }));
      rings.sort((a, b) => b.ring.z - a.ring.z);
      for (const item of rings) {
        drawRing(item.ring, cam, item.index === mission.ringIndex, item.ring.passed, time);
      }
      if (mission.kind === 'circuit' && !mission.gatePassed) {
        drawRing(PASS_GATE, cam, true, false, time);
      }
      for (const stop of mission.stops) {
        if (!stop.done) drawBeacon(stop, cam, time);
      }
      drawPlaneShadow(flight, cam);
      context.restore();
      if (view === 'cockpit') drawCockpit(flight, time);
      else drawPlane(flight, time);
      drawHud(flight, mission, time);
      drawPanel(flight, mission, view);
      if (screen === SCREEN_TITLE) drawTitle(flight, mission, world.best);
      else if (screen === SCREEN_PAUSED) drawPaused();
      else if (screen === SCREEN_OVER) drawOver(flight, mission, world.best);
    },
  };
}
