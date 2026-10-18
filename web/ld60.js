const $ = selector => document.querySelector(selector);
const [canvas, status, playersLabel, joinForm, nameInput, micCheckbox, enterButton, muteButton, touchPad, stick, knob, jumpButton, crouchButton, proneButton, voices, prompt, chatBar, chatForm, echo, notice, bubbles, chatLine, actButton, act2Button, cancelButton, lowerButton, chatOpen, connectPrompt, hintF, hintE, pickupBanner, keycapsBox, linkup, linkupLcd, linkupTitle, linkupText, linkupButtons, tugButton] = ["#game", "#status", "#players", "#join", "#name", "#mic", "#enter", "#mute", "#touch", "#stick", "#knob", "#jump", "#crouch", "#prone", "#voices", "#prompt", "#chatbar", "#say", "#echo", "#notice", "#bubbles", "#line", "#act", "#act2", "#cancel", "#lower", "#chat-open", "#connect", "#hint-f", "#hint-e", "#pickup", "#keycaps", "#linkup", "#linkup-lcd", "#linkup-title", "#linkup-text", "#linkup-buttons", "#tug"].map($);
const PARTNER_RANGE = 10;

const POINTER_END = ["pointerup", "pointercancel", "lostpointercapture"];
const SEND_INTERVAL_MS = 50;
const SEND_BACKLOG = 4096;
const SEND_BACKLOG_TEXT = 65536;
const SUBSTEP = 0.025;
const FOG_COLOR = [0.93, 0.94, 0.96];
const FOG_GB = [0.059, 0.220, 0.059];
const FOG_DENSITY = 0.021;
const WALL_HEIGHT = 600;
const INFECT_FULL = 150, INFECT_SPEED = 14;
const VOICE_MAX_DISTANCE = 24;
const VOICE_REF_DISTANCE = 2.25;
const VOICE_OPEN_DISTANCE = 26, VOICE_CLOSE_DISTANCE = 32, VOICE_PEERS = 12, VOICE_PEERS_HARD = 16, VOICE_DIAL_MS = 400;
const VOICE_CONNECT_MS = 15000, VOICE_RETRY_MS = 20000;
const voiceGain = (d, partner, partnered) => {
  const scale = partner ? 2 : 1, ref = VOICE_REF_DISTANCE * scale, max = VOICE_MAX_DISTANCE * scale;
  const others = !partner && partnered, drop = others ? 2 : 1, volume = others ? 0.5 : 1;
  return volume * Math.max(0, Math.min(1, 1 - drop * Math.max(0, d - ref) / (max - ref)));
};
const FLAG_GROUNDED = 1, FLAG_SPEAKING = 2, FLAG_MOVING = 4, FLAG_CROUCH = 8, FLAG_PRONE = 16, FLAG_HOLDING = 32, FLAG_PLAYING = 64, FLAG_KO = 128;
const SLOT = 9;
const PIN_PLANE = 0.4, PIN_BALL_OUT = 0.2;
const PIN_SCALE = 1.5 * 14 / 148, PIN_BALL = 0.6, PIN_REST = 10;
const PIN_B_SCALE = 0.078, PIN_B_PLANE = 1.5;
const pinScale = (table = "ember") => (table === "tide" ? PIN_B_SCALE : PIN_SCALE);
const pinBase = (table = "ember") => MIRROR.beamTop(STAND_LEVEL[1] + (table === "tide" ? 1 : 0)) - PIN_REST * pinScale(table) - PIN_BALL;
const pinPoint = (side, back, x, y, h, dz = 0, table = "ember") => {
  const s = pinScale(table), sx = (x - 80) * s, plane = table === "tide" ? PIN_B_PLANE : back - PIN_PLANE;
  return [side === 0 ? sx : -sx, pinBase(table) + (h - y) * s, (side === 0 ? -plane : plane) + (side === 0 ? dz : -dz)];
};
const PIN_CUBE = [0.98, 0.78, 0.2, 1];
const restTables = (() => {
  let cache = null;
  return () => cache || (cache = Object.fromEntries(PINBALL.TABLE_IDS.map(id => {
    const g = PINBALL.create(1); PINBALL.startGame(g, id); PINBALL.step(g, 1, {}); const p = g.p;
    return [id, { table: id, ball: [p.ball.x, p.ball.y], fl: p.fl.map(f => f.a), flash: [], sling: [], cubes: 0, idle: true }];
  })));
})();
const allTables = live => {
  const all = [...live];
  for (let side = 0; side < 2; side++) for (const id of PINBALL.TABLE_IDS) if (!live.some(pin => pin.side === side && pin.table === id)) all.push({ ...restTables()[id], side });
  return all;
};
const PIN_SOLID_RANGE = 60;
const PIN_MASCOT_SIZE = 2.6, PIN_MASCOT_OUT = 1.8, PIN_STEPS = 3;
const pinMascotBounds = (pin, back) => {
  const T = PINBALL.TABLES[pin.table]; if (!T) return null;
  const spot = PIN_SPOTS[pin.table] || [74, 64], k = pinScale(pin.table) / PIN_SCALE, size = PIN_MASCOT_SIZE * k, out = pin.table === "tide" ? 0.5 : PIN_MASCOT_OUT;
  const c = pinPoint(pin.side, back, spot[0], spot[1], T.h, 0, pin.table), f = pinPoint(pin.side, back, spot[0], spot[1], T.h, out, pin.table);
  return [c[0] - size / 2, c[1] - size / 2, Math.min(c[2], f[2]), c[0] + size / 2, c[1] + size / 2, Math.max(c[2], f[2])];
};
const pinMascot = (pin, back) => {
  const m = pinMascotBounds(pin, back); if (!m) return [];
  const rise = (m[4] - m[1]) * 0.277, depth = (m[5] - m[2]) / PIN_STEPS;
  return Array.from({ length: PIN_STEPS }, (_, k) => {
    const z0 = pin.side === 0 ? m[2] + depth * k : m[5] - depth * (k + 1);
    return [m[0], m[1], z0, m[3], m[4] - rise * (PIN_STEPS - 1 - k), z0 + depth];
  });
};
const PIN_CUBE_SIZE = 2.1, PIN_CUBE_MAX = 3, PIN_STAIR_MIN = 0.15;
const STAIR_OUT_S = 1, STAIR_HOLD_S = 5, STAIR_GONE_S = 120;
const stairOut = age => age < 0 ? 0 : age < STAIR_OUT_S ? 1 - (1 - age / STAIR_OUT_S) ** 2 : age < STAIR_HOLD_S ? 1 : Math.max(0, 1 - (age - STAIR_HOLD_S) / (STAIR_GONE_S - STAIR_HOLD_S));
const pinCubes = (pin, back, solid = true) => {
  const m = pin.table === "tide" ? null : pinMascotBounds(pin, back); if (!m) return [];
  const grown = Math.max(0, Math.min(1, pin.extend ?? 0)), out = pin.side === 0 ? 1 : -1, h = PIN_CUBE_SIZE / 2, cx = (m[0] + m[3]) / 2;
  const deck = MIRROR.beamTop(STAND_LEVEL[1] + 1), rise = (deck - m[4]) / PIN_CUBE_MAX;
  const start = pin.side === 0 ? m[5] : m[2], end = out * (-MIRROR.C / 2 + 0.2), depth = Math.abs(end - start) / PIN_CUBE_MAX;
  if (depth * grown < (solid ? PIN_STAIR_MIN : 0.01)) return [];
  return Array.from({ length: PIN_CUBE_MAX }, (_, k) => {
    const z0 = start + out * depth * k, z1 = z0 + out * depth * grown, top = m[4] + rise * (k + 1);
    return [cx - h, top - PIN_CUBE_SIZE, Math.min(z0, z1), cx + h, top, Math.max(z0, z1)];
  });
};
const stairCode = cubes => (cubes > 0 ? ((cubes - 1) % 3) + 1 : 0);
const PIN_FIELD = [0.97, 0.98, 1, 1], PIN_CABINET = [0.62, 0.8, 0.98, 1], PIN_GUIDE = [0.15, 0.62, 0.22, 1], PIN_LANE = [0.98, 0.86, 0.2, 1];
const PIN_BUMPER_RING = [0.98, 0.95, 0.95, 1], PIN_BUMPER_FACE = [0.95, 0.2, 0.25, 1], PIN_POST_FACE = [1, 0.95, 0.6, 1], PIN_HOLE = [0.18, 0.08, 0.3, 1], PIN_HOLE_RIM = [0.55, 0.32, 0.85, 1];
const PIN_ARROW = [0.2, 0.42, 0.95, 1], PIN_MASCOT = [0.98, 0.62, 0.78, 1], PIN_INK = [0.12, 0.08, 0.2, 1];
const PIN_SPOTS = { ember: [74, 98], tide: [96, 132], mound: [74, 60], specter: [74, 60], vault: [74, 60] };
const PIN_WALL = [0.25, 0.3, 0.75, 1], PIN_GATE = [0.5, 0.75, 0.95, 1], PIN_SLING = [0.95, 0.55, 0.15, 1], PIN_POST = [0.95, 0.85, 0.2, 1];
const PIN_BUMPER = [0.85, 0.15, 0.25, 1], PIN_FLASH = [1, 0.95, 0.6, 1], PIN_FLIPPER = [0.96, 0.96, 0.98, 1], PIN_BALL_COLOUR = [0.82, 0.84, 0.9, 1];
const SCREEN_IDLE_MS = 66;
const FINISH_WHITE = [0.97, 0.97, 0.97, 1], FINISH_BLACK = [0.06, 0.06, 0.07, 1], LIFT_GOLD = [1, 0.78, 0.18, 1], LIFT_SHINE = [1, 0.95, 0.62, 1];
const SLIP_HANG = 1.2, SLIP_SWING = 0.06, SLIP_MAX = 3.0;
const MICRO_GOAL = 6, MICRO_FINISH_MIN = 60;
const GHOST_ALPHA = 0.25, RACK_SINK = 2.7, DROPPED_SECONDS = 30;
const STAND_LEVEL = { 1: 2, 2: 4 };
const MUSIC_GAIN = 0.33, MUSIC_DUCK = 0.5;
const SONG_CREDITS = {
  menu: { title: "Title Theme (8-Bit Style)", by: "Kat", url: "https://opengameart.org/content/title-theme-8-bit-style" },
  summit: { title: "TuNiNuNiNiNu", by: "MatiasVME", url: "https://opengameart.org/node/88716" },
  stage1: { title: "Stage 1", by: "Juhani Junkala", url: "https://opengameart.org/content/4-chiptunes-adventure" },
  stage2: { title: "Stage 2", by: "Juhani Junkala", url: "https://opengameart.org/content/4-chiptunes-adventure" },
  select: { title: "Stage Select", by: "Juhani Junkala", url: "https://opengameart.org/content/4-chiptunes-adventure" },
};
const SFX_TRIM = { pinball: 1.25, micro: 1.25, move: 2.75, rotate: 2.43, lock: 1.16, clear: 2.24, over: 1.51, pause: 2.6, click: 2.07, release: 3.27, step: 6.0, jump: 1.84, land: 6.53 };
const BUTTON_BITS = { up: 1, down: 2, left: 4, right: 8, a: 16, b: 32, select: 64, start: 128 };
const BUBBLE_RANGE = 22;
const CADENCE_SLIP = 0.85;
const strideFor = (gait, stride) => stride * Math.min(1, gait * 1.6);
const STANCES = {
  hip:       [0.68,                    0.30,                   0.17],
  lean:      [0,                       1.15,                   Math.PI / 2],
  speed:     [4.2,                     2.0,                    0.9],
  stride:    [0.34,                    0.2,                    0.12],
  footZ:     [0,                       -0.08,                  0.55],
  footY:     [0.06,                    0.06,                   0.07],
  footX:     [1.05,                    1.5,                    1.35],
  liftUp:    [0.15,                    0.08,                   0.02],
  liftOut:   [0,                       0.02,                   0.12],
  knee:      [[0, 0.2, -1],            [0, 1, -0.35],          [1, 0.3, 0]],
  elbow:     [[1.6, -0.7, 0.4],        [1.4, -1, 0.2],         [1, -0.6, 0]],
  grip:      [[0.14, -0.24, -0.52],    [0.15, -0.19, -0.3],   [0.14, -0.07, -0.2]],
  eyeAhead:  [0.18,                    0,                      0],
  eyeUp:     [0,                       0,                      0.03],
};
const stancePose = (crouch, prone) => {
  const w = [Math.max(0, 1 - crouch - prone), crouch, prone];
  const pose = {};
  for (const [key, values] of Object.entries(STANCES)) {
    pose[key] = Array.isArray(values[0])
      ? values[0].map((_, n) => values[0][n] * w[0] + values[1][n] * w[1] + values[2][n] * w[2])
      : values[0] * w[0] + values[1] * w[1] + values[2] * w[2];
  }
  pose.stand = w[0]; pose.prone = prone;
  pose.up = [0, Math.cos(pose.lean), -Math.sin(pose.lean)];
  pose.chestForward = [0, -Math.sin(pose.lean), -Math.cos(pose.lean)];
  pose.neck = [0, pose.hip + pose.up[1] * 0.84, pose.up[2] * 0.84];
  pose.eye = [0, pose.neck[1] + pose.eyeUp, pose.neck[2] - pose.eyeAhead];
  pose.head = [0, pose.neck[1] + 0.045 * (1 - prone) + 0.025 * prone, pose.neck[2] - 0.19 * prone];
  return pose;
};
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const add = (a, b, k = 1) => [a[0]+b[0]*k, a[1]+b[1]*k, a[2]+b[2]*k];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
const apply = (m, p) => [m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12], m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13], m[2]*p[0] + m[6]*p[1] + m[10]*p[2] + m[14]];
const project = (m, x, y, z) => {
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [((m[0] * x + m[4] * y + m[8] * z + m[12]) / cw + 1) / 2, (1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw) / 2, cw];
};
const screenInView = (vp, model, lcd, eye = null) => {
  const [lx, ly, lw, lh, lz] = lcd, z = lz + 0.02;
  if (eye) {
    const nx = model[1] * model[6] - model[2] * model[5];
    const ny = model[2] * model[4] - model[0] * model[6];
    const nz = model[0] * model[5] - model[1] * model[4];
    const dx = eye[0] - (model[0] * lx + model[4] * ly + model[8] * z + model[12]);
    const dy = eye[1] - (model[1] * lx + model[5] * ly + model[9] * z + model[13]);
    const dz = eye[2] - (model[2] * lx + model[6] * ly + model[10] * z + model[14]);
    const facing = nx * dx + ny * dy + nz * dz;
    if (facing < 0 && facing * facing > 1e-12 * (nx * nx + ny * ny + nz * nz) * (dx * dx + dy * dy + dz * dz)) return false;
  }
  let outside = 63;
  for (let corner = 0; corner < 4; corner++) {
    const x = lx + (corner & 1 ? lw : 0), y = ly + (corner & 2 ? lh : 0);
    const wx = model[0] * x + model[4] * y + model[8] * z + model[12];
    const wy = model[1] * x + model[5] * y + model[9] * z + model[13];
    const wz = model[2] * x + model[6] * y + model[10] * z + model[14];
    const cx = vp[0] * wx + vp[4] * wy + vp[8] * wz + vp[12];
    const cy = vp[1] * wx + vp[5] * wy + vp[9] * wz + vp[13];
    const cz = vp[2] * wx + vp[6] * wy + vp[10] * wz + vp[14];
    const cw = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];
    const w = cw + 1e-5 * Math.max(1, Math.abs(cw));
    outside &= (cx < -w ? 1 : 0) | (cx > w ? 2 : 0) | (cy < -w ? 4 : 0) |
      (cy > w ? 8 : 0) | (cz < -w ? 16 : 0) | (cz > w ? 32 : 0);
    if (!outside) return true;
  }
  return false;
};
const toWorld = (x, y, z, yaw, p) => [x + Math.cos(yaw) * p[0] + Math.sin(yaw) * p[2], y + p[1], z - Math.sin(yaw) * p[0] + Math.cos(yaw) * p[2]];
let colliders = { room: Infinity, well: Infinity, boxes: [] };
const MIRROR_CELL = 1.4, MIRROR_ROWS = 18;
const PILLAR_OFFSETS = [-5.5 * MIRROR_CELL, 5.5 * MIRROR_CELL], PILLAR_HEIGHT = MIRROR_ROWS * MIRROR_CELL;
const worldBoxes = (world, well, rackX, rackZ) => [
  ...(world & 1 ? [[0, 0, rackX, rackZ, 1.25]] : []),
  ...(world & 2 ? PILLAR_OFFSETS.flatMap(u => [[u, -well + MIRROR_CELL / 2, MIRROR_CELL / 2, MIRROR_CELL / 2, PILLAR_HEIGHT], [u, well - MIRROR_CELL / 2, MIRROR_CELL / 2, MIRROR_CELL / 2, PILLAR_HEIGHT]]) : []),
];
const LIMB_SKIN = 0.05;
const colliderGap = (x, z) => colliders.boxes.reduce((gap, [cx, cz, hx, hz]) =>
  Math.min(gap, Math.max(Math.abs(x - cx) - hx, Math.abs(z - cz) - hz)), Math.min(colliders.room - Math.abs(x), colliders.room - Math.abs(z)));
const clearance = (x, z, dx, dz, skin, y = NaN) => {
  const wall = colliders.room - skin;
  let t = Infinity;
  for (const [p, d] of [[x, dx], [z, dz]]) {
    if (d > 1e-6) t = Math.min(t, (wall - p) / d);
    else if (d < -1e-6) t = Math.min(t, (-wall - p) / d);
  }
  for (const [cx, cz, hx, hz] of colliders.boxes) {
    let enter = -Infinity, exit = Infinity;
    for (const [p, d, half] of [[x - cx, dx, hx + skin], [z - cz, dz, hz + skin]]) {
      if (Math.abs(d) < 1e-6) { if (Math.abs(p) >= half) exit = -Infinity; continue; }
      const a = (-half - p) / d, b = (half - p) / d;
      enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    }
    if (enter <= exit && exit > 0) t = Math.min(t, enter);
  }
  if (colliders.cellAt && Number.isFinite(y)) {
    const reach = Math.min(t, 2.5);
    for (let s = 0; s <= reach; s += 0.05) {
      const px = x + dx * s, pz = z + dz * s;
      if (colliders.cellAt(px, y, pz) || colliders.cellAt(px, y - 0.15, pz)) { t = Math.max(0, s - skin); break; }
    }
  }
  return Math.max(0, t);
};
const reachable = (x, z, yaw, anchor, target, skin = LIMB_SKIN, y = NaN) => {
  const a = toWorld(x, 0, z, yaw, anchor), b = toWorld(x, 0, z, yaw, target);
  const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
  if (length < 1e-5) return target;
  const k = Math.min(1, clearance(a[0], a[2], dx / length, dz / length, skin, Number.isFinite(y) ? y + target[1] : NaN) / length);
  return [anchor[0] + (target[0] - anchor[0]) * k, target[1], anchor[2] + (target[2] - anchor[2]) * k];
};
const footPath = (phase, stride) => {
  const u = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  if (u < 0.5) return { z: stride * (4 * u - 1), lift: 0, stance: true };
  const s = (u - 0.5) * 2;
  return { z: stride * Math.cos(Math.PI * s), lift: Math.sin(Math.PI * s), stance: false };
};

const GB_PORT_MM = [90, 118, 16], GB_PLUG_TAIL_MM = [111, 118, 16], GB_CASE_MM = [90, 148], GB_VIEW_SHARE = 0.9, GB_FACE_DISTANCE = 0.113;
const FOV = Math.PI / 180 * 72;
const GB_VIEW_LIFT = 0.03;
const GAZE_RANGE = 3.8;
const GBA_BUTTONS_MM = {
  up: { at: [24, 61, 28.5], key: "W", hand: "L" }, down: { at: [24, 46, 28.5], key: "S", hand: "L" },
  left: { at: [16.5, 53.5, 28.5], key: "A", hand: "L" }, right: { at: [31.5, 53.5, 28.5], key: "D", hand: "L" },
  start: { at: [29.9, 31.6, 25.9], key: "C", hand: "L" }, select: { at: [28.6, 21.4, 25.9], key: "Z", hand: "L" },
  b: { at: [114.7, 50.5, 27.6], key: "L-click", hand: "R" }, a: { at: [125.3, 54.3, 27.6], key: "R-click", hand: "R" },
};
const GBC_BUTTONS_MM = {
  up: { at: [17, 50, 30.4], key: "W", hand: "L" }, down: { at: [17, 34, 30.4], key: "S", hand: "L" },
  left: { at: [9, 42, 30.4], key: "A", hand: "L" }, right: { at: [25, 42, 30.4], key: "D", hand: "L" },
  select: { at: [30, 19, 28.6], key: "Z", hand: "L" }, start: { at: [45, 19, 28.6], key: "C", hand: "R" },
  b: { at: [52, 39, 30.4], key: "L-click", hand: "R" }, a: { at: [64, 46, 30.4], key: "R-click", hand: "R" },
};
const GB_BUTTONS_MM = {
  up: { at: [20, 53, 37], key: "W", hand: "L" }, down: { at: [20, 35, 37], key: "S", hand: "L" },
  left: { at: [11, 44, 37], key: "A", hand: "L" }, right: { at: [29, 44, 37], key: "D", hand: "L" },
  select: { at: [37, 22, 34], key: "Z", hand: "L" }, start: { at: [52, 22, 34], key: "C", hand: "R" },
  b: { at: [62, 45, 36], key: "L-click", hand: "R" }, a: { at: [76, 52, 36], key: "R-click", hand: "R" },
};
const gbFaceDistance = (fov, aspect, device = DEVICES[0]) => {
  const perMetre = 2 * Math.tan(fov / 2) * GB_VIEW_SHARE;
  return Math.max(device.case[1] / 1000 / perMetre, device.case[0] / 1000 / (perMetre * aspect));
};
const GB_HAND_RADIUS = 0.055, GB_WRIST_DROP = 0;
const DEVICES = [
  { name: "Game Boy", case: [90, 148, 32], centre: [45, 74, 16], port: [90, 118, 16], tail: [111, 118, 16], lcd: [21.5, 81, 47, 43, 32.75], buttons: GB_BUTTONS_MM,
    hold: { L: [8, 46, -6], R: [82, 46, -6] }, rest: { L: [20, 44, 50], R: [69, 48, 50] }, palm: [0.045 + GB_HAND_RADIUS + 0.015, -0.07] },
  { name: "Game Boy Color", case: [75, 133.5, 27.4], centre: [37.5, 66.75, 13.7], port: [75, 112, 13.7], tail: [96, 112, 13.7], lcd: [15.5, 81, 44, 40, 28.15], buttons: GBC_BUTTONS_MM,
    hold: { L: [7, 42, -6], R: [68, 42, -6] }, rest: { L: [17, 40, 45], R: [57, 43, 45] }, palm: [0.0375 + GB_HAND_RADIUS + 0.015, -0.068] },
  { name: "Game Boy Advance", case: [144.5, 82, 24.5], centre: [72.25, 41, 12.25], port: [72.25, 82, 12.25], tail: [72.25, 103, 12.25], lcd: [41.65, 25.2, 61.2, 40.8, 25.25], buttons: GBA_BUTTONS_MM,
    hold: { L: [10, 48, -6], R: [134.5, 48, -6] }, rest: { L: [24, 53.5, 42.5], R: [120, 52.4, 42.5] }, palm: [0.072 + GB_HAND_RADIUS + 0.015, -0.03] },
];
const TIER_FOG = [FOG_GB, [0.10, 0.08, 0.22], [0.14, 0.10, 0.20]];
const gameBoyFrame = (pose, play, pitch, eye, distance = GB_FACE_DISTANCE) => {
  const tilt = 0.75, sp = Math.sin(pitch), cp = Math.cos(pitch);
  const low = [pose.neck[0], pose.neck[1] + pose.grip[1] + 0.08, pose.neck[2] + pose.grip[2] + 0.03];
  const fwd = [0, sp, -cp], up = [0, cp, sp], d = distance + 0.016;
  const w = play * play * (3 - 2 * play);
  const lift = d * Math.tan(FOV / 2) * GB_VIEW_LIFT;
  const face = [0, 1, 2].map(n => eye[n] + fwd[n] * d + up[n] * lift);
  const origin = low.map((v, n) => v + (face[n] - v) * w);
  const lowUp = [0, Math.cos(tilt), -Math.sin(tilt)];
  const ax = [1, 0, 0], az = norm(cross(ax, lowUp.map((v, n) => v + (up[n] - v) * w)));
  return { origin, ax, ay: cross(az, ax), az };
};

const LINK_LENGTH = 21, LINK_SEGMENTS = 168, LINK_RADIUS = 0.006;
const REEL_RATE = 3.0, REEL_OUT_RATE = 8.0, REEL_MIN = 1.0, REEL_STALL = 2.0, REEL_MEMORY_MS = 500;
const PARTNER_SHIFT_MAX = 3.0, PARTNER_SHIFT_RATE = 12;
const CABLE_SAMPLES = 32, CABLE_ROUND = 0.14, CABLE_SAG_EASE = 5, CABLE_STRAIGHTEN = 25, CABLE_PULL = 0.6, COIL_MIN = 0.25, COIL_PITCH = 0.015, COIL_START = 0.05, COIL_HEAP = 0.07;
const smoothMax = (a, b, k) => (a + b + Math.sqrt((a - b) * (a - b) + k * k)) / 2;
const cableShape = (rope, a, b, length, floorA, floorB, dt, coarse = false) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], d = Math.hypot(dx, dy, dz), slack = Math.max(0, length - d);
  const f = Math.min(1, slack / CABLE_PULL), fade = f * f * (3 - 2 * f);
  const target = (d > 0.05 ? (2 / Math.PI) * Math.sqrt(d * slack) : slack / 2) * fade;
  const ease = target < (rope.h ?? 0) ? CABLE_STRAIGHTEN : CABLE_SAG_EASE;
  rope.h = rope.h === undefined || !Number.isFinite(rope.h) ? target : rope.h + (target - rope.h) * Math.min(1, dt * ease);
  const N = CABLE_SAMPLES, lift = LINK_RADIUS * 1.5;
  const base = rope.base || (rope.base = new Float32Array((N + 1) * 3));
  let curve = 0, touchFrom = -1, touchTo = -1;
  for (let i = 0; i <= N; i++) {
    const t = i / N, floor = floorA + (floorB - floorA) * t + lift;
    const y = smoothMax(a[1] + dy * t - rope.h * Math.sin(Math.PI * t), floor, CABLE_ROUND);
    base[i * 3] = a[0] + dx * t; base[i * 3 + 1] = i === 0 ? a[1] : i === N ? b[1] : y; base[i * 3 + 2] = a[2] + dz * t;
    if (y - floor < CABLE_ROUND * 0.6) { if (touchFrom < 0) touchFrom = i; touchTo = i; }
    if (i) curve += Math.hypot(base[i * 3] - base[i * 3 - 3], base[i * 3 + 1] - base[i * 3 - 2], base[i * 3 + 2] - base[i * 3 - 1]);
  }
  const spare = touchFrom >= 0 ? length - curve : 0, coil = [];
  if (spare > COIL_MIN) {
    const c = (touchFrom + touchTo) >> 1, cx = base[c * 3], cy = base[c * 3 + 1], cz = base[c * 3 + 2];
    const heading = Math.atan2(dz, dx), step = coarse ? 0.35 : 0.12;
    let used = 0, theta = 0;
    while (used < spare && coil.length < 3 * 400) {
      const r = COIL_START + COIL_PITCH * theta / (Math.PI * 2);
      const x = cx + Math.cos(heading + theta) * r, z = cz + Math.sin(heading + theta) * r;
      if (coil.length) used += Math.hypot(x - coil[coil.length - 3], z - coil[coil.length - 1]);
      coil.push(x, cy, z);
      theta += step / Math.max(r, COIL_START);
    }
    const outer = Math.max(COIL_START, Math.hypot(coil[coil.length - 3] - cx, coil[coil.length - 1] - cz));
    for (let k = 0; k < coil.length; k += 3) coil[k + 1] += COIL_HEAP * (1 - Math.hypot(coil[k] - cx, coil[k + 2] - cz) / outer);
    coil.push(cx, cy + COIL_HEAP * 0.5, cz);
    rope.coilAt = c;
  } else rope.coilAt = -1;
  const n = N + 1 + coil.length / 3;
  if (!rope.pos || rope.pos.length < n * 3) rope.pos = new Float32Array(Math.max(n * 3, (N + 1) * 3 * 2));
  let motion = 0;
  const prev = rope.prevBase;
  if (prev) for (let k = 0; k < base.length; k++) motion = Math.max(motion, Math.abs(base[k] - prev[k]));
  rope.motion = motion; rope.prevBase = base.slice();
  const c = rope.coilAt;
  if (c < 0) rope.pos.set(base);
  else { rope.pos.set(base.subarray(0, (c + 1) * 3)); rope.pos.set(coil, (c + 1) * 3); rope.pos.set(base.subarray((c + 1) * 3), (c + 1) * 3 + coil.length); }
  rope.n = n; rope.spare = spare; rope.length = length;
  return rope;
};

const say = text => { status.textContent = text; };

const gameOf = game => (game.kind === "pinball" ? PINBALL : game.kind === "micro" ? MICRO : BRICKS);
const microDemo = n => Object.assign(MICRO.create(0x2001 + n * 7919 + Math.floor(Math.random() * 1e6)), { mode: "demo" });
const microIdle = (g, dt, input = {}) => { if (g.mode === "demo" && g.phase === "menu" && g.t > 240) input = { a: !g.demoTap }, g.demoTap = !g.demoTap; const changed = MICRO.step(g, dt, input); if (g.mode === "demo") { MICRO.drainEvents(g); if (g.phase === "over") MICRO.reset(g, undefined, false); } return changed; };
const anyStep = (g, dt, input = {}) => (g.kind === "pinball" ? pinballStep(g, dt, input) : g.kind === "micro" ? microIdle(g, dt, input) : BRICKS.step(g, dt, input));
const pinballReady = g => {
  if (g.kind !== "pinball" || g.scene === "play") return g;
  if (g.mode === "play" && g.scene !== "over") return g.scene === "select" ? g : PINBALL.openSelect(g);
  if (g.scene === "over") { g.overAt = g.overAt || performance.now(); if (performance.now() - g.overAt < 3000) return g; }
  g.overAt = 0; PINBALL.startGame(g, g.lastTable || "ember");
  return g;
};
const pinballStep = (g, dt, input) => { pinballReady(g); return PINBALL.step(g, dt, input); };
const PINBALL_COLORS = (() => {
  const c = (r, g, b) => [r, g, b].map(v => Math.round(v * 255 / 31));
  const P = {
    ember: [[c(31, 21, 11), c(31, 12, 3), c(21, 3, 2), c(5, 1, 2)], [c(31, 28, 7), c(31, 17, 0), c(23, 5, 0), c(7, 1, 0)], [c(25, 14, 31), c(18, 6, 25), c(10, 2, 16), c(3, 0, 6)], [c(19, 26, 31), c(9, 15, 28), c(3, 6, 18), c(1, 1, 8)]],
    tide: [[c(11, 22, 31), c(5, 13, 28), c(2, 6, 18), c(0, 1, 8)], [c(14, 29, 24), c(4, 21, 16), c(1, 11, 9), c(0, 4, 3)], [c(31, 27, 12), c(29, 17, 2), c(19, 8, 1), c(7, 2, 0)], [c(25, 20, 31), c(17, 11, 30), c(9, 4, 21), c(3, 1, 10)]],
    bonus: [[c(24, 15, 31), c(16, 7, 27), c(9, 2, 18), c(3, 0, 8)], [c(20, 30, 14), c(11, 23, 5), c(5, 13, 2), c(1, 5, 1)], [c(31, 24, 14), c(31, 14, 6), c(21, 5, 5), c(7, 1, 3)], [c(14, 27, 29), c(5, 19, 24), c(2, 9, 15), c(0, 3, 6)]],
    title: [[c(31, 30, 18), c(31, 19, 2), c(26, 4, 4), c(6, 1, 7)], [c(22, 31, 18), c(10, 24, 9), c(3, 13, 5), c(1, 4, 2)], [c(18, 25, 31), c(8, 14, 30), c(3, 5, 21), c(1, 1, 9)], [c(30, 22, 31), c(23, 11, 27), c(12, 3, 17), c(4, 1, 7)]],
    bar: [c(4, 4, 10), c(14, 16, 24), c(24, 26, 31), c(31, 31, 31)],
    ball: [c(31, 31, 31), c(21, 22, 25), c(8, 8, 12)],
  };
  const tileOut = new Uint8Array(PINBALL.W * PINBALL.H);
  const paint = (game, shades, rgba, dim = false) => {
    const W = PINBALL.W, H = PINBALL.H, p = game.p, scene = game.scene;
    const set = scene === "play" && p ? (p.tableId === "ember" || p.tableId === "tide" ? P[p.tableId] : P.bonus) : P.title;
    const cam = scene === "play" && p ? Math.round(p.cam) : 0, rows = scene === "play" && p ? p.T.h : H;
    const ball = scene === "play" && p?.ball && p.ball.state !== "gone" ? [p.ball.x, p.ball.y - cam] : null;
    for (let ty = 0; ty < H / 8; ty++) for (let tx = 0; tx < W / 8; tx++) {
      let pal;
      if (ty === H / 8 - 1) pal = P.bar;
      else if (scene === "play") { const y = (ty * 8 + cam) / rows; pal = tx >= 17 ? set[3] : y < 0.3 ? set[1] : y < 0.62 ? set[0] : set[2]; }
      else if (scene === "select") {
        const own = tx < W / 16 ? P.ember : P.tide, y = (ty * 8 + 4 - 13) / 109;
        pal = ty < 1 ? P.title[0] : ty >= 15 ? own[0] : y < 0.3 ? own[1] : y < 0.62 ? own[0] : own[2];
      } else pal = ty < 6 ? set[0] : ty < 11 ? set[1] : ty < 15 ? set[2] : set[3];
      for (let y = ty * 8; y < ty * 8 + 8; y++) for (let x = tx * 8; x < tx * 8 + 8; x++) {
        const i = y * W + x, sh = shades[i] & 3;
        let col = pal[sh];
        if (ball && sh && Math.hypot(x + 0.5 - ball[0], y + 0.5 - ball[1]) <= 3.6) col = P.ball[Math.min(2, sh - 1)];
        const o = i * 4, k = dim ? 0.55 : 1;
        rgba[o] = dim ? Math.round(Math.round(col[0] * k / 255 * 31) * 255 / 31) : col[0];
        rgba[o + 1] = dim ? Math.round(Math.round(col[1] * k / 255 * 31) * 255 / 31) : col[1];
        rgba[o + 2] = dim ? Math.round(Math.round(col[2] * k / 255 * 31) * 255 / 31) : col[2];
        rgba[o + 3] = 255;
      }
    }
  };
  return { paint, render: (game, rgba) => { PINBALL.render(game, tileOut); paint(game, tileOut, rgba, Boolean(game.paused)); } };
})();
const CLONE_PIECES = 3;
const BRAND = /game boy/gi;
const brandShuffle = (rows, ch, salt) => {
  const cells = rows.join(""), w = rows[0]?.length || 5;
  if (!cells) return rows;
  let seed = (ch.charCodeAt(0) * 2654435761 + salt * 40503) >>> 0;
  const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const order = [...cells];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return Array.from({ length: rows.length }, (_, r) => order.slice(r * w, r * w + w).join(""));
};
const brandMask = string => {
  const mask = new Uint8Array(string.length);
  for (const m of string.matchAll(BRAND)) mask.fill(1, m.index, m.index + m[0].length);
  return mask;
};
const brandPage = font => {
  const draw = (canvas, word, style) => {
    const size = parseFloat(style.fontSize) || 14, scale = Math.max(1, Math.round(size / 9)), ratio = Math.min(2, window.devicePixelRatio || 1);
    const w = word.length * 6 * scale, h = 7 * scale;
    canvas.width = Math.ceil(w * ratio); canvas.height = Math.ceil(h * ratio);
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d"); ctx.scale(ratio, ratio); ctx.fillStyle = style.color || "#000";
    [...word].forEach((ch, n) => brandShuffle(font[ch.toUpperCase()] || [], ch.toUpperCase(), n).forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === "#") ctx.fillRect(n * 6 * scale + c * scale, r * scale, scale, scale);
    }));
  };
  const skip = node => node.parentElement?.closest(".brand, #prompt, input, textarea, script, style, [contenteditable]");
  const swap = node => {
    if (node.nodeType !== 3 || skip(node)) return;
    const text = node.nodeValue; BRAND.lastIndex = 0;
    if (!BRAND.test(text)) return;
    BRAND.lastIndex = 0;
    const out = document.createDocumentFragment(); let at = 0;
    for (const m of text.matchAll(BRAND)) {
      if (m.index > at) out.append(text.slice(at, m.index));
      const brand = document.createElement("span"); brand.className = "brand";
      const canvas = document.createElement("canvas"); canvas.setAttribute("aria-hidden", "true");
      const words = document.createElement("span"); words.className = "brand-words"; words.textContent = m[0];
      brand.append(canvas, words); out.append(brand);
      at = m.index + m[0].length;
    }
    if (at < text.length) out.append(text.slice(at));
    const parent = node.parentElement;
    node.replaceWith(out);
    if (parent) { const style = getComputedStyle(parent); for (const b of parent.querySelectorAll(".brand")) if (!b.dataset.drawn) { draw(b.firstChild, b.lastChild.textContent, style); b.dataset.drawn = "1"; } }
  };
  const walk = root => { const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = []; while (it.nextNode()) nodes.push(it.currentNode); nodes.forEach(swap); };
  new MutationObserver(list => { for (const m of list) { if (m.type === "characterData") swap(m.target); else for (const n of m.addedNodes) n.nodeType === 3 ? swap(n) : n.nodeType === 1 && walk(n); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true });
  walk(document.body);
};
const BRICKS = (() => {
  const W = 160, H = 144, COLS = 10, ROWS = 18, WELL_X = 16;
  const FRAME = 1 / 59.73, CURTAIN_ROW = 1 / 6, OVER_HOLD = 6, ENTRY_FRAMES = 2, CLEAR_FRAMES = 40, FADE_TICKS = 36;
  const SPEEDS = [53, 49, 45, 41, 37, 33, 28, 22, 17, 11, 10, 9, 8, 7, 6, 6, 5, 5, 4, 4, 3];
  const GRAVITY = SPEEDS[0] * FRAME, SOFT_DROP = 3, DAS_DELAY = 24, DAS_REPEAT = 9;
  const LINE_SCORES = [0, 40, 100, 300, 1200];
  const SHAPES = {
    I: [[-2, 0], [-1, 0], [0, 0], [1, 0]],
    O: [[-1, 0], [0, 0], [-1, 1], [0, 1]],
    T: [[-1, 0], [0, 0], [1, 0], [0, 1]],
    J: [[-1, 0], [0, 0], [1, 0], [1, 1]],
    L: [[-1, 0], [0, 0], [1, 0], [-1, 1]],
    S: [[0, 0], [1, 0], [-1, 1], [0, 1]],
    Z: [[-1, 0], [0, 0], [0, 1], [1, 1]],
  };
  const STATES = { I: 2, O: 1, T: 4, J: 4, L: 4, S: 2, Z: 2 };
  const PIVOT = [5, 0];
  const PIECES = Object.fromEntries(Object.entries(SHAPES).map(([k, cells]) => [k, cells.map(([dx, dy]) => [PIVOT[0] + dx, PIVOT[1] + dy])]));
  const NAMES = Object.keys(PIECES);
  const tile = rows => rows.map(r => [...r].map(Number));
  const BLOCKS = {
    I: tile(["33333333", "21212111", "11111121", "11211111", "21111211", "11121112", "12111211", "33333333"]),
    O: tile(["33333333", "30000003", "30333303", "30333303", "30333303", "30333303", "30000003", "33333333"]),
    T: tile(["33333333", "31111113", "31000013", "31011313", "31011313", "31333313", "31111113", "33333333"]),
    J: tile(["33333333", "31111113", "31333313", "31300313", "31300313", "31333313", "31111113", "33333333"]),
    L: tile(["33333333", "32222223", "32222223", "32222223", "32222223", "32222223", "32222223", "33333333"]),
    S: tile(["33333333", "32222223", "32333323", "32300323", "32300323", "32333323", "32222223", "33333333"]),
    Z: tile(["33333333", "31111113", "31111113", "31133113", "31133113", "31111113", "31111113", "33333333"]),
  };
  const I_TILES = {
    left: tile(["33333333", "31211211", "31111111", "32112121", "31111111", "31211121", "31112111", "33333333"]),
    right: tile(["33333333", "21112113", "11211113", "11111213", "12121113", "11111123", "11212113", "33333333"]),
    top: tile(["33333333", "31112113", "31211123", "31111113", "32112113", "31111123", "31212113", "31111113"]),
    middle: tile(["31121123", "32111113", "31112123", "31211113", "31111123", "32121113", "31111213", "31211113"]),
    bottom: tile(["31111123", "31121113", "32111213", "31121113", "32111123", "31112113", "31211113", "33333333"]),
  };
  const blockAt = (type, isI, c, r) => {
    if (type !== "I") return BLOCKS[type];
    const l = isI(c - 1, r), rt = isI(c + 1, r), u = isI(c, r - 1), d = isI(c, r + 1);
    if (l || rt) return l && rt ? BLOCKS.I : l ? I_TILES.right : I_TILES.left;
    if (u || d) return u && d ? I_TILES.middle : u ? I_TILES.bottom : I_TILES.top;
    return BLOCKS.I;
  };
  const BRICK = tile(["33333333", "01113011", "11123112", "22223222", "33333333", "30111301", "31112311", "32222322"]);
  const CURTAIN = tile(["33333333", "32222223", "32111123", "32122123", "32122123", "32111123", "32222223", "33333333"]);
  const FONT = {
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."], "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "..##.", ".#...", "#....", "#####"], "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."], "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."], "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."], "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
    A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"], C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
    E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"], G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
    I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."], L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"], N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
    O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."], P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"], S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."], V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."], "♥": [".....", ".#.#.", "#####", "#####", ".###.", "..#..", "....."],
    B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."], D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."], H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."], K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"], U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"], X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"], ".": [".....", ".....", ".....", ".....", ".....", "..##.", "..##."],
    ",": [".....", ".....", ".....", ".....", "..##.", "..##.", ".##.."], "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
    "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."], "'": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
    "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."], ":": [".....", "..##.", "..##.", ".....", "..##.", "..##.", "....."],
    "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."], ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
    "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."], "►": ["#....", "##...", "###..", "####.", "###..", "##...", "#...."],
    "▼": [".....", ".....", "#####", ".###.", "..#..", ".....", "....."],
  };

  const random = seed => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const create = (seed, mode = "demo") => {
    const rng = random(seed >>> 0);
    const game = { rng, mode, well: [], piece: null, next: null, phase: "play", timer: 0, curtain: 0, games: 0, pieces: 0,
      score: 0, lines: 0, level: 0, clearing: [], acc: 0, gravity: 0, entry: 0, clearFrames: 0, held: {}, das: 0, version: 0, recent: [], fade: null };
    reset(game);
    return game;
  };
  const draw = game => NAMES[Math.floor(game.rng() * NAMES.length)];
  const reset = game => {
    game.well = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    game.next = draw(game); game.phase = "play"; game.timer = 0; game.curtain = 0; game.pieces = 0; game.games += 1;
    game.score = 0; game.lines = 0; game.level = 0; game.clearing = []; game.gravity = 0; game.entry = 0; game.recent = []; game.fade = null;
    spawn(game);
  };
  const shapeOf = piece => {
    let cells = SHAPES[piece.type];
    const turns = ((piece.rot % 4) + 4) % 4;
    for (let n = 0; n < turns; n++) cells = cells.map(([dx, dy]) => [-dy, dx]);
    return cells;
  };
  const cells = (piece, dx = 0, dy = 0) => shapeOf(piece).map(([cx, cy]) => [piece.col + cx + dx, piece.row + cy + dy]);
  const fits = (game, list) => list.every(([c, r]) => c >= 0 && c < COLS && r < ROWS && (r < 0 || !game.well[r][c]));
  const spawn = game => {
    const piece = { type: game.next, col: PIVOT[0], row: PIVOT[1], rot: 0 };
    game.next = draw(game);
    game.gravity = 0;
    game.piece = piece;
    if (!fits(game, cells(piece))) { game.phase = "curtain"; game.timer = 0; emit(game, "over"); return; }
    game.pieces += 1;
    game.recent.push({ type: piece.type, cells: null });
    if (game.recent.length > CLONE_PIECES) game.fade = { ...game.recent.shift(), ticks: FADE_TICKS };
  };
  const rotate = (game, dir) => {
    const piece = game.piece, states = STATES[piece.type];
    if (states === 1) return false;
    const rot = states === 2 ? (piece.rot === 0 ? 1 : 0) : piece.rot + dir;
    const turned = { ...piece, rot };
    if (!fits(game, cells(turned))) return false;
    piece.rot = rot;
    emit(game, "rotate");
    return true;
  };
  const move = (game, dx) => {
    if (!fits(game, cells(game.piece, dx, 0))) return false;
    game.piece.col += dx;
    emit(game, "move");
    return true;
  };
  const emit = (game, name, value = 0) => {
    if (game.mode !== "play") return;
    const events = game.events || (game.events = []);
    if (events.length < 64) events.push([name, value]);
  };
  const lock = game => {
    const list = cells(game.piece);
    for (const [c, r] of list) if (r >= 0) game.well[r][c] = game.piece.type;
    const last = game.recent[game.recent.length - 1];
    if (last && !last.cells) last.cells = list.filter(([, r]) => r >= 0);
    if (list.some(([, r]) => r < 0)) { game.phase = "curtain"; game.timer = 0; emit(game, "over"); return; }
    game.piece = null;
    game.clearing = [];
    for (let r = 0; r < ROWS; r++) if (game.well[r].every(Boolean)) game.clearing.push(r);
    emit(game, "lock");
    if (game.clearing.length) { game.phase = "clear"; game.clearFrames = 0; emit(game, "clear", game.clearing.length); }
    else game.entry = ENTRY_FRAMES;
  };
  const tick = (game, input) => {
    game.ticks = (game.ticks || 0) + 1;
    if (game.fade && --game.fade.ticks <= 0) game.fade = null;
    const was = game.held;
    const pressed = key => input[key] && !was[key];
    game.held = { ...input };
    if (game.mode === "play" && (pressed("start") || pressed("select")) && (game.phase === "play" || game.phase === "pause")) {
      game.phase = game.phase === "pause" ? "play" : "pause";
      emit(game, "pause");
      return true;
    }
    if (game.phase === "pause") return false;
    if (game.phase === "play") {
      if (!game.piece) {
        if (--game.entry <= 0) spawn(game);
        return true;
      }
      let changed = false;
      if (game.mode === "play") {
        if (pressed("a")) changed = rotate(game, 1) || changed;
        if (pressed("b")) changed = rotate(game, -1) || changed;
        const dir = input.left && !input.right ? -1 : input.right && !input.left ? 1 : 0;
        if (dir && (pressed("left") || pressed("right"))) { changed = move(game, dir) || changed; game.das = 0; }
        else if (dir && ++game.das >= DAS_DELAY) { changed = move(game, dir) || changed; game.das = DAS_DELAY - DAS_REPEAT; }
        if (!dir) game.das = 0;
      }
      const soft = game.mode === "play" && input.down;
      const rate = soft ? Math.min(SOFT_DROP, SPEEDS[Math.min(game.level, SPEEDS.length - 1)]) : SPEEDS[Math.min(game.level, SPEEDS.length - 1)];
      game.rate = rate;
      if (++game.gravity >= rate) {
        game.gravity = 0;
        if (fits(game, cells(game.piece, 0, 1))) { game.piece.row += 1; if (soft) game.score += 1; if (game.trail) game.trail.push(cells(game.piece)); }
        else { if (game.trail) game.trail.push(cells(game.piece)); lock(game); }
        changed = true;
      }
      return changed;
    }
    if (game.phase === "clear") {
      if (++game.clearFrames < CLEAR_FRAMES) return game.clearFrames % 10 === 0;
      const n = game.clearing.length;
      game.well = game.well.filter((_, r) => !game.clearing.includes(r));
      while (game.well.length < ROWS) game.well.unshift(new Array(COLS).fill(null));
      game.score += LINE_SCORES[n] * (game.level + 1);
      game.lines += n;
      game.level = Math.max(game.level, Math.floor(game.lines / 10));
      game.clearing = [];
      game.phase = "play"; game.entry = ENTRY_FRAMES;
      return true;
    }
    return false;
  };
  const step = (game, dt, input = {}) => {
    const before = game.version;
    if (game.phase === "play" || game.phase === "clear" || game.phase === "pause") {
      game.acc += dt;
      while (game.acc >= FRAME && (game.phase === "play" || game.phase === "clear" || game.phase === "pause")) {
        game.acc -= FRAME;
        if (tick(game, input)) game.version++;
      }
      if (game.phase === "curtain") game.timer = 0;
      return game.version !== before;
    }
    game.timer += dt;
    if (game.phase === "curtain") {
      const rows = Math.min(ROWS, Math.floor(game.timer / CURTAIN_ROW));
      if (rows !== game.curtain) { game.curtain = rows; game.version++; }
      if (rows >= ROWS) { game.phase = "over"; game.timer = 0; game.version++; }
    } else if (game.timer >= OVER_HOLD) {
      reset(game); game.acc = 0; game.version++;
    }
    return game.version !== before;
  };

  const blit = (px, art, x, y) => { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) px[(y + r) * W + x + c] = art[r][c]; };
  const fill = (px, x0, y0, x1, y1, shade) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px[y * W + x] = shade; };
  const text = (px, string, x, y, shade = 3) => { const mask = brandMask(string); [...string].forEach((ch, n) => (mask[n] ? brandShuffle(FONT[ch] || [], ch, n) : FONT[ch] || []).forEach((row, r) => {
    for (let c = 0; c < 5; c++) if (row[c] === "#") for (const dx of [0, 1]) {
      const xx = x + n * 8 + c + dx + 1, yy = y + r + 1;
      if (xx >= 0 && xx < W && yy >= 0 && yy < H) px[yy * W + xx] = shade;
    }
  })); };
  const frame = (px, x0, y0, x1, y1) => {
    fill(px, x0, y0, x1, y1, 3); fill(px, x0 + 1, y0 + 1, x1 - 1, y1 - 1, 0);
    for (const [x, y] of [[x0, y0], [x1 - 1, y0], [x0, y1 - 1], [x1 - 1, y1 - 1]]) px[y * W + x] = 1;
  };
  const number = (px, value, right, y) => { const s = String(value); text(px, s, right - s.length * 8, y); };
  const render = (game, px = new Uint8Array(W * H)) => {
    px.fill(0);
    for (let row = 0; row < ROWS; row++) for (const col of [0, 1, 12]) blit(px, BRICK, col * 8, row * 8);
    frame(px, 107, 5, 151, 20); text(px, "SCORE", 109, 8);
    frame(px, 115, 22, 155, 36); number(px, game.score, 151, 25);
    frame(px, 107, 43, 151, 68); text(px, "LEVEL", 109, 46); number(px, game.level, 147, 56);
    frame(px, 107, 70, 151, 95); text(px, "LINES", 109, 73); number(px, game.lines, 147, 83);
    frame(px, 113, 97, 151, 137);
    if (game.next) {
      const shape = PIECES[game.next], minC = Math.min(...shape.map(([c]) => c)), maxC = Math.max(...shape.map(([c]) => c));
      const ox = 132 - (maxC - minC + 1) * 4, oy = 109;
      const own = (c, r) => shape.some(([x, y]) => x === c && y === r);
      for (const [c, r] of shape) blit(px, blockAt(game.next, own, c, r), ox + (c - minC) * 8, oy + r * 8);
    }
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      if (game.phase === "clear" && game.clearing.includes(row) && Math.floor(game.clearFrames / 10) % 2 === 1) continue;
      const type = game.well[row][col];
      if (type) blit(px, blockAt(type, (c, r) => game.well[r]?.[c] === "I", col, row), WELL_X + col * 8, row * 8);
    }
    if (game.piece) {
      const list = cells(game.piece), own = (c, r) => list.some(([x, y]) => x === c && y === r);
      for (const [c, r] of list) if (r >= 0 && r < ROWS) blit(px, blockAt(game.piece.type, own, c, r), WELL_X + c * 8, r * 8);
    }
    if (game.phase === "pause") {
      frame(px, 30, 58, 84, 78);
      text(px, "PAUSE", 36, 64);
      return px;
    }
    if (game.phase !== "play") {
      for (let n = 0; n < game.curtain; n++) for (let col = 0; col < COLS; col++) blit(px, CURTAIN, WELL_X + col * 8, (ROWS - 1 - n) * 8);
    }
    if (game.phase === "over") {
      frame(px, 24, 32, 88, 80); text(px, "GAME", 40, 42); text(px, "OVER", 40, 58);
      fill(px, 16, 100, 96, 136, 0); text(px, "PLEASE", 32, 104); text(px, "TRY AGAIN♥", 16, 120);
    }
    return px;
  };
  const topOut = game => {
    if (game.phase !== "play" && game.phase !== "clear") return false;
    game.phase = "curtain"; game.timer = 0; game.curtain = 0; game.version++;
    emit(game, "over");
    return true;
  };
  return { W, H, COLS, ROWS, FRAME, GRAVITY, CURTAIN_ROW, OVER_HOLD, FADE_TICKS, SPEEDS, DAS_DELAY, DAS_REPEAT, PIECES, BLOCKS, CURTAIN, FONT, create, step, render, cells, topOut, text, fill, frame };
})();
brandPage(BRICKS.FONT);

const MIRROR = (() => {
  const C = 1.4, COLS = 10, ROWS = 18, TYPES = "IOTJLSZ";
  const SUMMIT_RISE = 0.7, SUMMIT_THICK = 0.4, LEVELS = 5, LEVEL_H = ROWS * C + SUMMIT_RISE;
  const BEAM_DROP = { 2: 3 * C };
  const beamTop = k => k * LEVEL_H - (BEAM_DROP[k] || 0);

  const box = (side, back, col, row) => {
    const x0 = side === 0 ? -5 * C + col * C : 5 * C - (col + 1) * C;
    const z0 = side === 0 ? -back : back - C;
    const y0 = (ROWS - 1 - row) * C;
    return [x0, y0, z0, x0 + C, y0 + C, z0 + C];
  };
  const locked = (side, back, well, curtain = 0) => {
    const out = [];
    for (let r = 0; r < ROWS; r++) {
      const covered = ROWS - 1 - r < curtain;
      for (let c = 0; c < COLS; c++) if (covered) out.push([...box(side, back, c, r), "X"]); else if (well[r][c]) out.push([...box(side, back, c, r), well[r][c]]);
    }
    return out;
  };
  const clone = (side, col, row, level = 0) => {
    const x0 = side === 0 ? -2 * C : C, z0 = -5 * C + col * C, y0 = (ROWS - 1 - row) * C + level * LEVEL_H;
    return [x0, y0, z0, x0 + C, y0 + C, z0 + C];
  };
  const cloneCells = (side, list, frac = 0, level = 0) => list.filter(([, r]) => r + frac > -1).map(([c, r]) => [...clone(side, c, r + frac, level)]);
  const ACROSS = 2;
  const bridge = (back, level = 0) => {
    const top = beamTop(level + 1);
    return level === ACROSS ? [-back + C, top - SUMMIT_THICK, -C / 2, back - C, top, C / 2] : [-C / 2, top - SUMMIT_THICK, -back + C, C / 2, top, back - C];
  };
  const bridges = (back, level = 0, open = true) => (level === ACROSS && !open ? [] : [level === FINISH_LEVEL ? finish(back) : bridge(back, level)]);
  const FINISH_LEVEL = LEVELS - 1, FINISH_HALF = 1.45;
  const finish = back => { const top = beamTop(LEVELS); return [-FINISH_HALF, top - SUMMIT_THICK, -back + C, FINISH_HALF, top, back - C]; };
  const LIFT = { x: FINISH_HALF + 0.1 + 0.4, z: 1.8, half: 0.4, thick: 0.25, base: () => beamTop(LEVELS - 1) + 0.35, top: () => beamTop(LEVELS) };
  const lift = (side, top) => { const x = side === 0 ? LIFT.x : -LIFT.x; return [x - LIFT.half, top - LIFT.thick, LIFT.z - LIFT.half, x + LIFT.half, top, LIFT.z + LIFT.half]; };
  const onFinish = (back, x, y, z) => Math.abs(y - beamTop(LEVELS)) < 0.2 && Math.abs(x) <= FINISH_HALF + 0.2 && Math.abs(z) <= back - C + 0.2;
  const falling = (side, back, cells, frac) => cells.filter(([, r]) => r + frac > -1).map(([c, r]) => [...box(side, back, c, r + frac), "fall"]);
  const fitsBelow = (well, cells) => cells.every(([c, r]) => r + 1 < ROWS && (r + 1 < 0 || !well[r + 1][c]));
  const squishes = (player, boxes, margin = 0.08) => boxes.some(([x0, y0, z0, x1, y1, z1]) =>
    player.x > x0 - player.r + margin && player.x < x1 + player.r - margin &&
    player.z > z0 - player.r + margin && player.z < z1 + player.r - margin &&
    player.y < y1 - margin && player.y + player.h > y0 + margin);
  const solidAt = (wells, back, x, y, z) => {
    for (let side = 0; side < 2; side++) {
      const well = wells[side];
      if (!well) continue;
      const depth = side === 0 ? z + back : back - z;
      if (depth < 0 || depth >= C) continue;
      const col = Math.floor(side === 0 ? (x + 5 * C) / C : (5 * C - x) / C), row = ROWS - 1 - Math.floor(y / C);
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS || !well[row][col]) continue;
      return box(side, back, col, row);
    }
    return null;
  };
  const wellKey = well => well.map(row => row.map(c => c || ".").join("")).join("");
  const snapshot = (game, full) => {
    const p = game.piece, live = game.phase === "play" && p;
    const prev = game.recent.slice(0, -1).filter(r => r.cells);
    const snap = { ph: game.phase, p: live ? [p.type, p.col, p.row, p.rot] : null,
      g: live ? Math.round((game.gravity / (game.rate || 53)) * 100) / 100 : 0, r: game.rate || 53, s: game.score, cu: game.curtain || 0,
      rc: prev.length ? prev.map(r => [r.type, ...r.cells.flat()]) : null, rf: game.fade?.cells ? [game.fade.type, game.fade.ticks, ...game.fade.cells.flat()] : null };
    if (full) snap.w = wellKey(game.well);
    return snap;
  };
  const parseWell = w => Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => (w[r * COLS + c] !== "." && TYPES.includes(w[r * COLS + c])) ? w[r * COLS + c] : null));
  const walkways = back => [0, 1].map(side => {
    const top = beamTop(2), x1 = (148 - 80) * PIN_SCALE + PIN_BALL + 0.4, z0 = -back + PIN_PLANE + 0.95, z1 = -back + PIN_PLANE + 2.35;
    return side === 0 ? [0.5, top - SUMMIT_THICK, z0, x1, top, z1] : [-x1, top - SUMMIT_THICK, -z1, -0.5, top, -z0];
  });
  const clonePillars = level => [0, 1].flatMap(side => {
    const x0 = side === 0 ? -2 * C : C, y0 = level * LEVEL_H, y1 = y0 + C * Math.min(ROWS, Math.floor((pinBase() - 0.05 - y0) / C));
    return [[x0, y0, -5 * C - C, x0 + C, y1, -5 * C], [x0, y0, 5 * C, x0 + C, y1, 5 * C + C]];
  });
  return { C, COLS, ROWS, SUMMIT_RISE, LEVELS, LEVEL_H, ACROSS, FINISH_LEVEL, FINISH_HALF, LIFT, lift, onFinish, beamTop, walkways, clonePillars, box, locked, bridge, bridges, clone, cloneCells, falling, fitsBelow, squishes, solidAt, wellKey, snapshot, parseWell };
})();

const validSignal = (() => {
  const num = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
  const int = (v, lo, hi) => Number.isInteger(v) && num(v, lo, hi);
  const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
  const keys = (v, required, optional = []) => object(v) && required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => required.includes(k) || optional.includes(k));
  const array = (v, n, check) => Array.isArray(v) && v.length === n && v.every(check);
  const type = v => typeof v === "string" && /^[IOTJLSZ]$/.test(v);
  const cells = (v, fade = false) => {
    const start = fade ? 2 : 1;
    return Array.isArray(v) && v.length >= start && v.length <= start + 8 && (v.length - start) % 2 === 0 && type(v[0]) &&
      (!fade || int(v[1], 0, 36)) && v.slice(start).every((x, i) => int(x, 0, i % 2 ? 17 : 9));
  };
  const mirror = v => {
    if (!keys(v, ["ph", "p", "g", "r", "s", "cu", "rc", "rf"], ["w"])) return false;
    const p = v.p;
    return ["play", "pause", "clear", "curtain", "over"].includes(v.ph) &&
      (p === null || Array.isArray(p) && p.length === 4 && type(p[0]) && int(p[1], 0, 9) && int(p[2], -4, 17) && int(p[3], -2147483648, 2147483647)) &&
      num(v.g, 0, 1) && num(v.r, 1, 53) && int(v.s, 0, Number.MAX_SAFE_INTEGER) && int(v.cu, 0, 18) &&
      (v.rc === null || Array.isArray(v.rc) && v.rc.length <= 2 && v.rc.every(c => cells(c))) && (v.rf === null || cells(v.rf, true)) &&
      (!Object.hasOwn(v, "w") || typeof v.w === "string" && /^[.IOTJLSZ]{180}$/.test(v.w));
  };
  const candidate = v => keys(v, ["candidate"], ["sdpMid", "sdpMLineIndex", "usernameFragment"]) && typeof v.candidate === "string" && v.candidate.length <= 2048 &&
    ["sdpMid", "usernameFragment"].every(k => v[k] == null || typeof v[k] === "string" && v[k].length <= 256) &&
    (v.sdpMLineIndex == null || int(v.sdpMLineIndex, 0, 63));
  const tables = { ember: [300, 3], tide: [320, 4], mound: [190, 2], specter: [190, 1], vault: [190, 2] };
  return data => {
    if (!object(data)) return false;
    if (keys(data, ["tier"], ["at"])) return int(data.tier, 0, 2) && (!Object.hasOwn(data, "at") || array(data.at, 3, x => num(x, -200, 200)));
    if (keys(data, ["pinHit"], ["at"])) return ["x", "y"].includes(data.pinHit) && (data.at == null || num(data.at, -50, 400));
    const fields = Object.keys(data);
    if (fields.length !== 1) return false;
    const kind = fields[0], v = data[kind];
    switch (kind) {
      case "mirror": return mirror(v);
      case "pin": {
        if (v === null) return true;
        if (!keys(v, ["t", "b", "s", "f", "i", "c", "at"], ["h", "r"]) || typeof v.t !== "string" || !Object.hasOwn(tables, v.t)) return false;
        if (v.h != null && !["cave", "slotA", "slotB"].includes(v.h)) return false;
        if (v.r != null && !(Array.isArray(v.r) && v.r.length === 2 && int(v.r[0], 0, 3) && int(v.r[1], 0, 60))) return false;
        const [height] = tables[v.t];
        return Array.isArray(v.b) && v.b.length === 4 && num(v.b[0], -40, 200) && num(v.b[1], -40, height + 40) && num(v.b[2], -5000, 5000) && num(v.b[3], -5000, 5000) &&
          typeof v.s === "string" && /^[a-z]{1,12}$/.test(v.s) && array(v.f, 4, x => num(x, -1000, 1000)) && int(v.i, 0, 3) && int(v.c, 0, 3) && num(v.at, 0, 1e13);
      }
      case "squish": case "over": case "cube": return v === 1;
      case "micro": return keys(v, ["w", "l"]) && int(v.w, 0, 1000) && int(v.l, 0, 3);
      case "ride": return Array.isArray(v) && v.length === 3 && int(v[0], -1, 1) && num(v[1], -3, 3) && num(v[2], -3, 3);
      case "teleport": return int(v, 0, 5);
      case "reel": return Array.isArray(v) && v.length === 2 && num(v[0], 1, 21) && int(v[1], 0, 1);
      case "description": return keys(v, ["type", "sdp"]) && ["offer", "answer"].includes(v.type) && typeof v.sdp === "string" && v.sdp.length <= 14000;
      case "candidate": return candidate(v);
      case "candidates": return Array.isArray(v) && v.length <= 20 && v.every(candidate);
      default: return false;
    }
  };
})();

const m4 = {
  identity: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
  multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      out[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
    }
    return out;
  },
  translate: (x, y, z) => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]),
  scale: (x, y, z) => new Float32Array([x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]),
  rotateX(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); },
  rotateY(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); },
  perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
    return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
  },
  lookAt(eye, target, up) {
    let zx = eye[0]-target[0], zy = eye[1]-target[1], zz = eye[2]-target[2];
    let len = Math.hypot(zx, zy, zz) || 1; zx /= len; zy /= len; zz /= len;
    let xx = up[1]*zz - up[2]*zy, xy = up[2]*zx - up[0]*zz, xz = up[0]*zy - up[1]*zx;
    len = Math.hypot(xx, xy, xz) || 1; xx /= len; xy /= len; xz /= len;
    const yx = zy*xz - zz*xy, yy = zz*xx - zx*xz, yz = zx*xy - zy*xx;
    return new Float32Array([xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0,
      -(xx*eye[0]+xy*eye[1]+xz*eye[2]), -(yx*eye[0]+yy*eye[1]+yz*eye[2]), -(zx*eye[0]+zy*eye[1]+zz*eye[2]), 1]);
  },
};
const chain = (...ms) => ms.reduce((acc, m) => m4.multiply(acc, m));

const VERT = `#version 300 es
precision highp float;
in vec3 aPosition; in vec3 aNormal;
in vec4 aModel0, aModel1, aModel2, aModel3; in vec4 aColor;
uniform mat4 uProjection, uView;
out vec3 vWorld; out vec3 vNormal; out vec3 vLocal; out vec3 vLocalNormal; out float vDepth; flat out vec4 vColor;
void main() {
  mat4 model = mat4(aModel0, aModel1, aModel2, aModel3);
  vec4 world = model * vec4(aPosition, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(model) * aNormal);
  vLocal = aPosition + 0.5; vLocalNormal = aNormal;
  vColor = aColor;
  vec4 view = uView * world;
  vDepth = length(view.xyz);
  gl_Position = uProjection * view;
}`;
const FRAG = `#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vNormal; in vec3 vLocal; in vec3 vLocalNormal; in float vDepth; flat in vec4 vColor;
uniform vec3 uFogColor; uniform float uFogDensity; uniform int uGrid; uniform sampler2D uTiles;
out vec4 outColor;
#ifdef INFECT
uniform vec4 uInfect;
#endif
uniform int uTierFrom, uTierTo;
const vec3 GB0 = vec3(0.608, 0.737, 0.059), GB1 = vec3(0.545, 0.675, 0.059), GB2 = vec3(0.188, 0.384, 0.188), GB3 = vec3(0.059, 0.220, 0.059);
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec3 gameBoy(vec3 c) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return l > 0.82 ? GB0 : l > 0.6 ? GB1 : l > 0.32 ? GB2 : GB3;
}
// The tiers, each within its hardware: the Game Boy's four greens; the Color's 15-bit colour but
// only 56 on screen at once (eight palettes of four and eight of three), so the room snaps to a
// small set: 8 hues x 7 values, and 7 greys, pushed bright as its LCD did; the Advance's full
// 15-bit colour (5 bits a channel, up to 512 on screen), richer but no more than the hardware.
vec3 sat(vec3 c, float k) { float l = dot(c, vec3(0.299, 0.587, 0.114)); return clamp(mix(vec3(l), c, k), 0.0, 1.0); }
vec3 hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0), p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)), q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y); return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 rgb555(vec3 c) { return floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5) / 31.0; }
vec3 tinted(vec3 c, int t) {
  if (t == 0) return gameBoy(c);
  if (t == 1) {
    vec3 h = rgb2hsv(sat(c, 1.6));
    float v = floor(h.z * 6.0 + 0.5) / 6.0;
    if (h.y < 0.18) return rgb555(vec3(v));
    return rgb555(hsv2rgb(vec3(floor(h.x * 8.0 + 0.5) / 8.0, 0.85, max(v, 1.0 / 6.0))));
  }
  if (t == 2) return rgb555(sat(c, 1.35) * vec3(1.02, 0.99, 0.96));
  return c;
}
vec3 fogOf(int t, vec3 base) { return t == 0 ? GB3 : t == 1 ? vec3(0.10, 0.08, 0.22) : t == 2 ? vec3(0.14, 0.10, 0.20) : base; }
void main() {
  vec3 color = vColor.rgb;
  float kind = abs(vColor.a);
  if (kind >= 2.0) {
    vec3 n = abs(vLocalNormal);
    vec2 uv = n.z > 0.5 ? vec2(vLocal.x, 1.0 - vLocal.y) : (n.x > 0.5 ? vec2(vLocal.z, 1.0 - vLocal.y) : vec2(vLocal.x, vLocal.z));
    color = texture(uTiles, vec2((clamp(uv.x, 0.0, 1.0) + floor(kind - 1.5)) / 8.0, clamp(uv.y, 0.0, 1.0))).rgb;
  } else if (uGrid == 1) {
    vec3 n = abs(vNormal);
    vec2 coord = n.y > 0.5 ? vWorld.xz : (n.x > 0.5 ? vWorld.zy : vWorld.xy);
    vec2 g = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    vec2 g5 = abs(fract(coord / 5.0 - 0.5) - 0.5) / fwidth(coord / 5.0);
    float line5 = 1.0 - min(min(g5.x, g5.y), 1.0);
    color = mix(color, vec3(0.70, 0.73, 0.78), line * 0.55);
    color = mix(color, vec3(0.52, 0.57, 0.64), line5 * 0.7);
  }
  vec3 fogColor = uFogColor;
#ifdef PLAIN
  color = mix(color, tinted(color, uTierFrom), step(0.0, vColor.a));
  fogColor = fogOf(uTierFrom, uFogColor);
#endif
#ifdef FULL
  color = mix(color, tinted(color, uTierTo), step(0.0, vColor.a));
  fogColor = fogOf(uTierTo, uFogColor);
#endif
#ifdef INFECT
  // A separate program variant: software GL (SwiftShader) pays for this noise on every pixel even behind a uniform branch.
  {
    float reach = length(vWorld.xz - uInfect.xz) + max(vWorld.y - uInfect.y, 0.0) * 0.6;
    float wobble = (noise(vWorld.xz * 0.7 + vWorld.y * 0.3) + 0.5 * noise(vWorld.xz * 2.3 - vWorld.y)) * 1.6;
    float edge = reach + wobble - uInfect.w;
    float front = 1.0 - smoothstep(-0.35, 0.0, edge);
    float keep = step(0.0, vColor.a);
    color = mix(color, mix(tinted(color, uTierFrom), tinted(color, uTierTo), front), keep);
    fogColor = mix(fogOf(uTierFrom, uFogColor), fogOf(uTierTo, uFogColor), front);
  }
#endif
  float fog = 1.0 - exp(-vDepth * vDepth * uFogDensity * uFogDensity);
  outColor = vec4(mix(color, fogColor, clamp(fog, 0.0, 1.0)), abs(vColor.a));
}`;

const SCREEN_VERT = `#version 300 es
precision highp float;
in vec3 aPosition; in vec2 aUV;
uniform mat4 uProjection, uView, uModel;
out vec2 vUV; out float vDepth;
void main() {
  vec4 view = uView * uModel * vec4(aPosition, 1.0);
  vUV = aUV; vDepth = length(view.xyz);
  gl_Position = uProjection * view;
}`;
const SCREEN_FRAG = `#version 300 es
precision highp float;
in vec2 vUV; in float vDepth;
uniform sampler2D uScreen; uniform vec3 uFogColor; uniform float uFogDensity;
out vec4 outColor;
void main() {
  vec3 color = texture(uScreen, vUV).rgb;
  float fog = 1.0 - exp(-vDepth * vDepth * uFogDensity * uFogDensity);
  outColor = vec4(mix(color, uFogColor, clamp(fog, 0.0, 1.0)), 1.0);
}`;

function createRenderer(gl, quality = "high") {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Shader: " + gl.getShaderInfoLog(shader));
    return shader;
  };
  const ATTRIBUTES = ["aPosition", "aNormal", "aModel0", "aModel1", "aModel2", "aModel3", "aColor"], A_MODEL = 2, A_COLOR = 6;
  const variant = defines => {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG.replace("precision highp float;", defines + "precision highp float;")));
    ATTRIBUTES.forEach((name, index) => gl.bindAttribLocation(prog, index, name));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("Program: " + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const u = name => gl.getUniformLocation(prog, name);
    const locations = { infect: u("uInfect"), projection: u("uProjection"), view: u("uView"),
      fogColor: u("uFogColor"), fogDensity: u("uFogDensity"), grid: u("uGrid"), tiles: u("uTiles"), tierFrom: u("uTierFrom"), tierTo: u("uTierTo") };
    gl.uniform1i(locations.tierFrom, -1); gl.uniform1i(locations.tierTo, -1);
    gl.uniform3fv(locations.fogColor, FOG_COLOR);
    gl.uniform1f(locations.fogDensity, FOG_DENSITY);
    gl.uniform1i(locations.tiles, 1);
    return { prog, locations };
  };
  const plain = variant("#define PLAIN\n"), infecting = variant("#define INFECT\n"), full = variant("#define FULL\n");
  let program = plain.prog, uniforms = plain.locations;
  gl.useProgram(program);

  const mesh = (positions, normals) => {
    const buffers = [positions, normals].map(data => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      return buffer;
    });
    const vertexArray = () => {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      buffers.forEach((buffer, index) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(index);
        gl.vertexAttribPointer(index, 3, gl.FLOAT, false, 0, 0);
      });
      return vao;
    };
    const vao = vertexArray(), instanced = vertexArray(), instances = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    for (let n = 0; n < 5; n++) {
      gl.enableVertexAttribArray(A_MODEL + n);
      gl.vertexAttribPointer(A_MODEL + n, 4, gl.FLOAT, false, 80, n * 16);
      gl.vertexAttribDivisor(A_MODEL + n, 1);
    }
    gl.bindVertexArray(null);
    return { vao, count: positions.length / 3, instanced, instances, batch: new Float32Array(20 * 16), queued: 0 };
  };
  const faces = [[[1,0,0],[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]], [[-1,0,0],[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]],
    [[0,1,0],[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]], [[0,-1,0],[-1,-1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1]],
    [[0,0,1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]], [[0,0,-1],[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]];
  const cubePositions = [], cubeNormals = [];
  for (const [normal, a, b, c, d] of faces) {
    for (const v of [a, b, c, a, c, d]) { cubePositions.push(v[0]/2, v[1]/2, v[2]/2); cubeNormals.push(...normal); }
  }
  const cube = mesh(cubePositions, cubeNormals);
  const sphere = (S, R) => {
    const P = [], N = [];
    const at = (i, j) => { const th = Math.PI * j / R, ph = 2 * Math.PI * i / S; return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; };
    for (let j = 0; j < R; j++) for (let i = 0; i < S; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      for (const v of j === 0 ? [a, c, d] : j === R - 1 ? [a, b, c] : [a, b, c, a, c, d]) { P.push(v[0] / 2, v[1] / 2, v[2] / 2); N.push(...v); }
    }
    return mesh(P, N);
  };
  const cylinder = S => {
    const P = [], N = [];
    const at = (k, y) => { const ph = 2 * Math.PI * k / S; return [Math.cos(ph) / 2, y, Math.sin(ph) / 2]; };
    for (let k = 0; k < S; k++) {
      const a = at(k, -0.5), b = at(k + 1, -0.5), c = at(k + 1, 0.5), d = at(k, 0.5);
      for (const v of [a, c, b, a, d, c]) { P.push(...v); N.push(v[0] * 2, 0, v[2] * 2); }
    }
    return mesh(P, N);
  };
  const low = quality === "low";
  const ballLods = [[28, 16], [14, 9], [8, 5], [6, 4]].map(([S, R]) => sphere(S, R));
  const rodLods = [24, 12, 6, 6].map(cylinder);
  const LOD_PIXELS = low ? [Infinity, 30, 20, 10] : [Infinity, 15, 10, 5];
  const tube = (() => {
    const P = [], N = [];
    const sides = [[[0.5, 0, 0], [0, 0, 1]], [[0, 0, 0.5], [-1, 0, 0]], [[-0.5, 0, 0], [0, 0, -1]], [[0, 0, -0.5], [1, 0, 0]]];
    for (const [c, t] of sides) {
      const n = [c[0] * 2, 0, c[2] * 2], corner = (s, y) => [c[0] + t[0] * 0.5 * s, y, c[2] + t[2] * 0.5 * s];
      const a = corner(-1, -0.5), b = corner(1, -0.5), cc = corner(1, 0.5), d = corner(-1, 0.5);
      for (const v of [a, cc, b, a, d, cc]) { P.push(...v); N.push(...n); }
    }
    return mesh(P, N);
  })();
  const quad = (corners, normal) => {
    const [a, b, c, d] = corners;
    return mesh([...a, ...b, ...c, ...a, ...c, ...d], [...normal, ...normal, ...normal, ...normal, ...normal, ...normal]);
  };
  const h = wasm.room_half(), H = WALL_HEIGHT;
  const room = [
    quad([[-h,0,h],[h,0,h],[h,0,-h],[-h,0,-h]], [0,1,0]),
    quad([[-h,0,-h],[h,0,-h],[h,H,-h],[-h,H,-h]], [0,0,1]),
    quad([[h,0,h],[-h,0,h],[-h,H,h],[h,H,h]], [0,0,-1]),
    quad([[-h,0,h],[-h,0,-h],[-h,H,-h],[-h,H,h]], [1,0,0]),
    quad([[h,0,-h],[h,0,h],[h,H,h],[h,H,-h]], [-1,0,0]),
  ];
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.clearColor(FOG_COLOR[0], FOG_COLOR[1], FOG_COLOR[2], 1);

  const drawGrid = (m, model, color) => {
    for (let n = 0; n < 4; n++) gl.vertexAttrib4f(A_MODEL + n, model[n * 4], model[n * 4 + 1], model[n * 4 + 2], model[n * 4 + 3]);
    gl.vertexAttrib4f(A_COLOR, color[0], color[1], color[2], color[3]);
    gl.uniform1i(uniforms.grid, 1);
    gl.bindVertexArray(m.vao);
    gl.drawArrays(gl.TRIANGLES, 0, m.count);
    gl.uniform1i(uniforms.grid, 0);
  };
  const queuedMeshes = new Set();
  let drawingFigure = false, ghostAlpha = 1;
  const slot = (m, color) => {
    if (m.batch.length < (m.queued + 1) * 20) { const grown = new Float32Array(m.batch.length * 2); grown.set(m.batch); m.batch = grown; }
    const at = m.queued++ * 20;
    m.batch[at + 16] = color[0]; m.batch[at + 17] = color[1]; m.batch[at + 18] = color[2];
    m.batch[at + 19] = (drawingFigure ? -Math.abs(color[3]) : color[3]) * ghostAlpha;
    queuedMeshes.add(m);
    return at;
  };
  let drawLift = 0;
  const draw = (m, model, color) => { const at = slot(m, color); m.batch.set(model, at); if (drawLift) m.batch[at + 13] += drawLift; };
  const drawProduct = (m, a, b, color) => {
    const at = slot(m, color), out = m.batch;
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      for (let r = 0; r < 4; r++) out[at + c * 4 + r] = a[r] * b0 + a[4 + r] * b1 + a[8 + r] * b2 + a[12 + r] * b3;
    }
  };
  const uploadInstances = m => {
    const length = m.queued * 20;
    let changed = m.uploadedLength !== length;
    if (!changed) for (let i = 0; i < length; i++) {
      if (m.uploaded[i] !== m.batch[i]) { changed = true; break; }
    }
    if (!changed) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.instances);
    gl.bufferData(gl.ARRAY_BUFFER, m.batch, gl.STREAM_DRAW, 0, length);
    if (!m.uploaded || m.uploaded.length !== m.batch.length) m.uploaded = new Float32Array(m.batch.length);
    m.uploaded.set(m.batch);
    m.uploadedLength = length;
  };
  const flush = () => {
    for (const m of queuedMeshes) {
      uploadInstances(m);
      gl.bindVertexArray(m.instanced);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, m.count, m.queued);
      m.queued = 0;
    }
    queuedMeshes.clear();
  };
  const box = (model, color) => draw(cube, model, color);

  const solve = (root, target, l1, l2, pole) => {
    const toward = sub(target, root), dir = norm(toward);
    const d = Math.min(Math.max(Math.hypot(...toward), Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
    const along = (l1*l1 - l2*l2 + d*d) / (2*d), h = Math.sqrt(Math.max(0, l1*l1 - along*along));
    const bend = norm(add(pole, dir, -dot(pole, dir)));
    return { joint: add(add(root, dir, along), bend, h), end: add(root, dir, d) };
  };
  const segmentModel = new Float32Array(16), segmentSide = [1, 0, 0];
  segmentModel[15] = 1;
  const segment = (a, b, w, depth, side = segmentSide) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
    const yl = len || 1, yx = dx / yl, yy = dy / yl, yz = dz / yl;
    const along = side[0] * yx + side[1] * yy + side[2] * yz;
    let xx = side[0] - yx * along, xy = side[1] - yy * along, xz = side[2] - yz * along;
    if (Math.hypot(xx, xy, xz) < 1e-3) { xx = -yx * yz; xy = -yy * yz; xz = 1 - yz * yz; }
    const xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;
    const m = segmentModel;
    m[0] = xx * w; m[1] = xy * w; m[2] = xz * w;
    m[4] = yx * len; m[5] = yy * len; m[6] = yz * len;
    m[8] = (xy * yz - xz * yy) * depth; m[9] = (xz * yx - xx * yz) * depth; m[10] = (xx * yy - xy * yx) * depth;
    m[12] = a[0] + dx * 0.5; m[13] = a[1] + dy * 0.5; m[14] = a[2] + dz * 0.5;
    return m;
  };
  const THIGH = 0.35, SHIN = 0.33, UPPER_ARM = 0.3, FOREARM = 0.29;

  let limbGap = Infinity, gbGap = Infinity, faceDistance = GB_FACE_DISTANCE, screenDistance = 0, viewProjection = null, gbFit = null, selfGbModel = null;
  const fingerTips = new Map();
  const gazes = new Map();
  const FINGER_PRESS = 3, FINGER_MAX = { L: 5, R: 3 };
  const drawFingers = (c, gb, wrists, busy, color, rod, ball, device) => {
    const k = 0.001, { origin, ax, ay, az } = gb, [cx, cy, cz] = device.centre;
    const at = ([x, y, z]) => add(add(add(origin, ax, (x - cx) * k), ay, (y - cy) * k), az, (z - cz) * k);
    let tips = fingerTips.get(c.id);
    if (!tips || tips.device !== device) fingerTips.set(c.id, tips = { L: [], R: [], device });
    const ease = Math.min(1, (c.dt || 0.016) * 40);
    for (const hand of ["L", "R"]) {
      const from = wrists[hand];
      if (!from || busy[hand]) continue;
      const hold = at(device.hold[hand]);
      rod(from, hold, 0.007, color.skin); ball(hold, 0.0045, color.skin);
      const pressing = (c.held || []).filter(name => device.buttons[name]?.hand === hand).slice(0, FINGER_MAX[hand]);
      const targets = pressing.length ? pressing.map(name => { const b = device.buttons[name].at; return [b[0], b[1], b[2] + FINGER_PRESS]; }) : [device.rest[hand]];
      const list = tips[hand];
      let prev = from;
      targets.forEach((target, n) => {
        if (!list[n]) list[n] = (list[n - 1] || target).slice();
        for (let i = 0; i < 3; i++) list[n][i] += (target[i] - list[n][i]) * ease;
        const tip = at(list[n]);
        rod(prev, tip, 0.007, color.skin); ball(tip, 0.0045, color.skin);
        prev = tip;
      });
      list.length = targets.length;
    }
  };
  let lodEye = [0, 0, 0], lodScale = 1, heldTier = () => 0;
  const ballModel = new Float32Array(16);
  const held = [];
  const drawCharacter = c => {
    drawingFigure = true;
    try { drawFigure(c); } finally { drawingFigure = false; }
  };
  const drawFigure = c => {
    const { x, y, z, yaw, pitch, color, phase, gait, time, speaking, partnered } = c;
    const self = c.id < 0;
    const base = c.ko ? chain(m4.translate(x, y, z), m4.rotateY(yaw), m4.scale(1.2, 0.22, 1.2)) : chain(m4.translate(x, y, z), m4.rotateY(yaw));
    const part = (model, colour) => drawProduct(cube, base, model, colour);
    const lod = (lods, p, r) => {
      const dx = base[0] * p[0] + base[4] * p[1] + base[8] * p[2] + base[12] - lodEye[0];
      const dy = base[1] * p[0] + base[5] * p[1] + base[9] * p[2] + base[13] - lodEye[1];
      const dz = base[2] * p[0] + base[6] * p[1] + base[10] * p[2] + base[14] - lodEye[2];
      const pixels = r * lodScale / Math.max(Math.hypot(dx, dy, dz), 1e-3);
      let n = 3;
      while (n > 0 && pixels > LOD_PIXELS[n]) n--;
      return lods[Math.max(n, low ? 1 : 0)];
    };
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const rod = (a, b, d, colour) => drawProduct(lod(rodLods, mid(a, b), d / 2), base, segment(a, b, d, d), colour);
    const ball = (p, r, colour) => {
      const s = 2 * r;
      for (let n = 0; n < 12; n++) ballModel[n] = base[n] * s;
      for (let n = 0; n < 4; n++) ballModel[12 + n] = base[n] * p[0] + base[4 + n] * p[1] + base[8 + n] * p[2] + base[12 + n];
      draw(lod(ballLods, p, r), ballModel, colour);
    };
    const egg = (a, b, w, depth, colour, side) =>
      drawProduct(lod(ballLods, mid(a, b), Math.max(w, depth, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])) / 2), base, segment(a, b, w, depth, side), colour);
    const pose = c.pose || stancePose(c.crouch, c.prone);
    const touch = p => { if (self) { const w = toWorld(x, 0, z, yaw, p); limbGap = Math.min(limbGap, colliderGap(w[0], w[2])); } };
    if (self) { limbGap = Infinity; gbGap = Infinity; }
    const air = c.air;
    const stride = strideFor(gait, pose.stride), stepping = Math.min(1, gait * 1.6);
    const feet = [footPath(phase, stride), footPath(phase + Math.PI, stride)];
    const drop = (0.03 * stepping * Math.cos(phase) ** 2 + 0.05 * air) * pose.stand;
    const breath = Math.sin(time * 1.9) * 0.006 * (1 - gait);
    const pelvis = [0, pose.hip - drop + breath, 0];
    const up = pose.up, ahead = pose.chestForward;
    const along = (from, k) => add(from, up, k);
    for (const [sideSign, path] of [[-1, feet[0]], [1, feet[1]]]) {
      const hip = add(pelvis, [0.11 * sideSign, 0, 0]);
      const foot = reachable(x, z, yaw, hip, [0.11 * sideSign * pose.footX + sideSign * (pose.liftOut * stepping * path.lift + 0.12 * (c.play || 0) * pose.stand),
        pose.footY + pose.liftUp * stepping * path.lift + 0.2 * air,
        pose.footZ + path.z * (1 - air) - 0.06 * air], LIMB_SKIN + 0.14);
      touch(foot);
      const { joint: knee, end: ankle } = solve(hip, foot, THIGH, SHIN, [pose.knee[0] * sideSign, pose.knee[1], pose.knee[2]]);
      ball(hip, 0.085, color.dark);
      rod(hip, knee, 0.12, color.dark);
      ball(knee, 0.08, color.dark);
      rod(knee, ankle, 0.105, color.dark);
      ball(ankle, 0.072, color.dark);
      const toe = norm([0, -0.25 * pose.prone, -1 + 1.6 * pose.prone]);
      const sole = add(ankle, [0, -0.03, 0]);
      egg(add(sole, toe, -0.05), add(sole, toe, 0.15), 0.09, 0.15, [0.22, 0.24, 0.3, 1], [0, 1, 0]);
    }
    egg(pelvis, along(pelvis, 0.3), 0.44, 0.3, color.body);
    drawProduct(lod(rodLods, along(pelvis, 0.32), 0.22), base, segment(along(pelvis, 0.15), along(pelvis, 0.49), 0.44, 0.3), color.body);
    egg(along(pelvis, 0.34), along(pelvis, 0.64), 0.44, 0.3, color.body);
    const bob = drop * 0.6 + breath + 0.04 * air * pose.stand;
    const sway = (0.006 * pose.stand + 0.03 * pose.prone) * stepping * Math.sin(phase);
    const neck = add(pelvis, up, 0.84);
    const device = DEVICES[c.device || 0];
    const gb = c.holds ? gameBoyFrame(pose, c.play, pitch, c.eyeLocal || pose.eye, self ? faceDistance : GB_FACE_DISTANCE) : null;
    const palm = s => add(add(gb.origin, gb.ax, device.palm[0] * s), gb.ay, device.palm[1] - GB_WRIST_DROP);
    const wrists = {}, busy = {};
    for (const sideSign of [1, -1]) {
      const shoulder = add(along(pelvis, 0.56), [0.25 * sideSign, 0, 0]);
      rod(along(pelvis, 0.56), shoulder, 0.1, color.body);
      const pocket = sideSign === -1 ? c.pocket : 0;
      let target = gb ? palm(sideSign) : add(neck, [pose.grip[0] * sideSign + sway, pose.grip[1] + bob, pose.grip[2]]);
      if (pocket > 0) target = target.map((v, n) => v + ([-0.24, pelvis[1] - 0.02, 0.05][n] - v) * pocket);
      if (gb && sideSign === -1 && c.plug > 0) {
        const out = [0, 1].map(n => Math.sign(device.tail[n] - device.port[n]) * 0.035);
        const port = add(add(add(gb.origin, gb.ax, (device.port[0] - device.centre[0]) / 1000 + out[0]), gb.ay, (device.port[1] - device.centre[1]) / 1000 + out[1]), gb.az, 0.03);
        target = target.map((v, n) => v + (port[n] - v) * c.plug);
      }
      const grip = reachable(x, z, yaw, shoulder, target, LIMB_SKIN + 0.09, y);
      touch(grip);
      const { joint: elbow, end: wrist } = solve(shoulder, grip, UPPER_ARM, FOREARM, [pose.elbow[0] * sideSign, pose.elbow[1], pose.elbow[2]]);
      if (gb && sideSign === 1) gb.origin = add(gb.origin, sub(wrist, target), 1 - (c.play || 0));
      if (sideSign === -1) c.leftHand = apply(base, wrist);
      ball(shoulder, 0.065, color.body);
      rod(shoulder, elbow, 0.085, color.body);
      ball(elbow, 0.062, color.body);
      rod(elbow, wrist, 0.075, color.body);
      const reach = norm(add(norm(sub(wrist, elbow)), [0, 0, -1], 1.5));
      ball(gb && pocket < 0.5 ? wrist : add(wrist, reach, 0.03), GB_HAND_RADIUS, color.skin);
      wrists[sideSign === 1 ? "R" : "L"] = wrist; busy[sideSign === 1 ? "R" : "L"] = pocket > 0.01 || (sideSign === -1 && c.plug > 0.01);
    }
    if (gb) drawFingers(c, gb, wrists, busy, color, rod, ball, device);
    if (gb) {
      const { origin, ax, ay, az } = gb, k = 0.001, [cx, cy, cz] = device.centre;
      const morph = c.morph ?? 1, o = [0, 1, 2].map(n => origin[n] - (ax[n] * cx + ay[n] * cy + az[n] * cz) * k * morph);
      const model = chain(base, new Float32Array([ax[0] * k * morph, ax[1] * k * morph, ax[2] * k * morph, 0, ay[0] * k * morph, ay[1] * k * morph, ay[2] * k * morph, 0, az[0] * k * morph, az[1] * k * morph, az[2] * k * morph, 0, o[0], o[1], o[2], 1]));
      held.push({ model, screen: c.screen, plug: Boolean(c.plugged), tier: c.device || 0 });
      if (self) selfGbModel = model;
      c.port = apply(model, c.plugged ? device.tail : device.port);
      c.portDir = c.plugged ? norm(sub(apply(model, device.tail.map((v, n) => v + (v - device.port[n]) / 2)), c.port)) : null;
      if (self) {
        const w = apply(model, device.centre); gbGap = colliderGap(w[0], w[2]);
        const lcd = apply(model, [device.lcd[0] + device.lcd[2] / 2, device.lcd[1] + device.lcd[3] / 2, device.lcd[4]]); screenDistance = Math.hypot(lcd[0] - lodEye[0], lcd[1] - lodEye[1], lcd[2] - lodEye[2]);
        const m = viewProjection, fit = [Infinity, -Infinity, Infinity, -Infinity], [W, H, D] = device.case;
        for (const corner of [[0, 0, D], [W, 0, D], [W, H, D], [0, H, D]]) {
          const [x, y, z] = apply(model, corner);
          const [sx, sy] = project(m, x, y, z);
          fit[0] = Math.min(fit[0], sx); fit[1] = Math.max(fit[1], sx); fit[2] = Math.min(fit[2], sy); fit[3] = Math.max(fit[3], sy);
        }
        gbFit = fit;
      }
    }
    if (self) return;
    const head = add(pose.head, [0, pelvis[1] - pose.hip, 0]);
    const headColor = speaking ? color.light : color.skin;
    rod(along(pelvis, 0.56), head, 0.17, color.skin);
    const face = chain(base, m4.translate(...head), m4.rotateX(pitch * 0.6));
    drawProduct(lod(ballLods, head, 0.19), face, m4.scale(0.38, 0.38, 0.38), headColor);
    let gaze = gazes.get(c.id);
    if (!gaze) gazes.set(c.id, gaze = [0, 0]);
    let wantX = 0, wantY = 0;
    if (c.gaze) {
      const hw = apply(base, head), dx = c.gaze[0] - hw[0], dy = c.gaze[1] - hw[1], dz = c.gaze[2] - hw[2];
      const cy = Math.cos(yaw), sy = Math.sin(yaw), lx = cy * dx - sy * dz, lz0 = sy * dx + cy * dz;
      const a = pitch * 0.6, ca = Math.cos(a), sa = Math.sin(a), ly = ca * dy + sa * lz0, lz = -sa * dy + ca * lz0;
      const len = Math.hypot(lx, ly, lz) || 1;
      wantX = Math.max(-1, Math.min(1, lx / len * 1.5)) * 0.028; wantY = Math.max(-1, Math.min(1, ly / len * 1.5)) * 0.03;
      if (lz > 0) wantX = wantY = 0;
    }
    const gk = Math.min(1, (c.dt || 0.016) * 8);
    gaze[0] += (wantX - gaze[0]) * gk; gaze[1] += (wantY - gaze[1]) * gk;
    const eye = lod(ballLods, head, 0.045);
    const alongNormal = (n, ex, ey, r, sx, sy, sz, ox = 0, oy = 0) => new Float32Array([
      ex[0] * sx, ex[1] * sx, ex[2] * sx, 0, ey[0] * sy, ey[1] * sy, ey[2] * sy, 0, n[0] * sz, n[1] * sz, n[2] * sz, 0,
      n[0] * r + ex[0] * ox + ey[0] * oy, n[1] * r + ex[1] * ox + ey[1] * oy, n[2] * r + ex[2] * ox + ey[2] * oy, 1]);
    for (const side of [-1, 1]) {
      const n = norm([0.07 * side, 0.03, -0.172]), ex = norm(cross(n, [0, 1, 0])), ey = cross(ex, n);
      drawProduct(eye, face, alongNormal(n, ex, ey, 0.186, 0.075, 0.09, -0.05), [0.97, 0.97, 0.97, 1]);
      drawProduct(eye, face, alongNormal(n, ex, ey, 0.208, 0.036, 0.044, -0.016, gaze[0], gaze[1]), [0.08, 0.08, 0.1, 1]);
    }
    if (speaking) part(chain(m4.translate(head[0], head[1] + 0.29 + Math.sin(time * 4) * 0.03, head[2]), m4.rotateY(time * 2), m4.scale(0.12, 0.12, 0.12)), [1, 0.85, 0.3, 1]);
  };

  const RACK_W = 2 * wasm.rack_half_z(), RACK_D = 2 * wasm.rack_half_x();
  const rackModel = m4.rotateY(Math.PI / 2);
  const baked = new Map();
  let bakeInto = baked;
  const solid = (m, polygon, z0, z1, color, back = true, shut = []) => {
    const key = color.join();
    if (!bakeInto.has(key)) bakeInto.set(key, { color, positions: [], normals: [] });
    const out = bakeInto.get(key);
    const lo = polygon.map(([x, y]) => apply(m, [x, y, z0])), hi = polygon.map(([x, y]) => apply(m, [x, y, z1]));
    const all = [...lo, ...hi], centre = all.reduce((c, p) => add(c, p, 1 / all.length), [0, 0, 0]);
    const tri = (a, b, c) => {
      let n = cross(sub(b, a), sub(c, a));
      if (dot(n, sub(a, centre)) < 0) { [b, c] = [c, b]; n = n.map(v => -v); }
      n = norm(n);
      out.positions.push(...a, ...b, ...c);
      out.normals.push(...n, ...n, ...n);
    };
    for (let i = 1; i + 1 < polygon.length; i++) { if (back) tri(lo[0], lo[i], lo[i+1]); tri(hi[0], hi[i], hi[i+1]); }
    for (let i = 0; i < polygon.length; i++) {
      if (shut.includes(i)) continue;
      const j = (i + 1) % polygon.length;
      tri(lo[i], lo[j], hi[j]); tri(lo[i], hi[j], hi[i]);
    }
  };
  const block = (m, x0, y0, z0, x1, y1, z1, color, back, shut) => solid(m, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1, color, back, shut);
  const arc = (cx, cy, r, from, to, steps) => Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + (to - from) * i / steps;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const disc = (m, cx, cy, r, z0, z1, color, back) => solid(m, arc(cx, cy, r, 0, Math.PI * 2, 14).slice(0, 14), z0, z1, color, back);
  const pill = (m, cx, cy, length, width, angle, z0, z1, color, back) => {
    const r = width / 2, half = length / 2 - r, c = Math.cos(angle), s = Math.sin(angle);
    const outline = [...arc(half, 0, r, -Math.PI / 2, Math.PI / 2, 5), ...arc(-half, 0, r, Math.PI / 2, Math.PI * 1.5, 5)];
    solid(m, outline.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]), z0, z1, color, back);
  };
  const GLYPHS = {
    A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
    I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
    M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
    O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  };
  const scrambled = (ch, salt) => {
    const cells = (GLYPHS[ch] || []).join("");
    if (!cells) return [];
    let seed = (ch.charCodeAt(0) * 2654435761 + salt * 40503) >>> 0;
    const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const order = [...cells];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return Array.from({ length: 7 }, (_, r) => order.slice(r * 5, r * 5 + 5).join(""));
  };
  const lettering = (m, string, cx, cy, px, z0, z1, color, slant = 0, plain = false) => {
    const width = string.length * 6 - 1;
    [...string].forEach((ch, n) => {
      const emit = (start, length, top, bottom) => {
        const x = cx + (n * 6 + start - width / 2) * px + (3 - top) * slant * px;
        block(m, x, cy + (3 - bottom) * px - px / 2, z0, x + length * px, cy + (3 - top) * px + px / 2, z1, color, false);
      };
      let open = new Map();
      const rows = plain ? BRICKS.FONT[ch] || [] : scrambled(ch, n + string.length * 17);
      rows.forEach((row, r) => {
        const next = new Map();
        for (const run of row.matchAll(/#+/g)) {
          const key = `${run.index},${run[0].length}`;
          next.set(key, [run.index, run[0].length, slant === 0 && open.has(key) ? open.get(key)[2] : r]);
          if (slant !== 0 || !open.has(key)) continue;
          open.delete(key);
        }
        for (const [start, length, top] of open.values()) emit(start, length, top, r - 1);
        open = next;
      });
      for (const [start, length, top] of open.values()) emit(start, length, top, rows.length - 1);
    });
  };

  const CHARCOAL = [0.16, 0.16, 0.18, 1], PLINTH = [0.07, 0.07, 0.08, 1], RED = [0.78, 0.07, 0.11, 1];
  const DECK = [0.66, 0.66, 0.64, 1], WHITE = [0.96, 0.95, 0.92, 1], NAVY = [0.13, 0.14, 0.36, 1];
  const CHROME = [0.72, 0.73, 0.76, 1], BLACK = [0.08, 0.08, 0.09, 1], MAGENTA = [0.5, 0.13, 0.32, 1];
  const hw = RACK_W / 2, hd = RACK_D / 2, FRONT_TOP = 0.95, BACK_TOP = 1.25, DECK_BACK = -0.07;
  const I = m4.identity();
  block(I, -hw + 0.03, 0, -hd + 0.03, hw - 0.03, 0.08, hd - 0.03, PLINTH);
  const profile = new Float32Array([0,0,1,0, 0,1,0,0, 1,0,0,0, 0,0,0,1]);
  solid(profile, [[hd, 0.08], [hd, FRONT_TOP], [DECK_BACK, BACK_TOP], [-hd, BACK_TOP], [-hd, 0.08]], -hw, hw, CHARCOAL);
  block(I, -hw - 0.006, 0.7, -hd - 0.006, hw + 0.006, 0.76, hd + 0.006, RED);
  const front = m4.translate(0, 0, hd);
  block(front, -0.25, 0.36, 0, 0.25, 0.5, 0.008, RED, false);
  lettering(front, "HANDHELD", 0, 0.43, 0.009, 0.008, 0.012, WHITE);
  const rise = BACK_TOP - FRONT_TOP, run = hd - DECK_BACK, DECK_LEN = Math.hypot(rise, run);
  const uy = rise / DECK_LEN, uz = -run / DECK_LEN;
  const deck = new Float32Array([1,0,0,0, 0,uy,uz,0, 0,-uz,uy,0, 0,FRONT_TOP,hd,1]);
  block(deck, -hw + 0.04, 0.03, 0, hw - 0.04, DECK_LEN - 0.03, 0.006, DECK, false);
  block(deck, -hw + 0.04, DECK_LEN - 0.075, 0.006, hw - 0.04, DECK_LEN - 0.065, 0.008, MAGENTA, false);
  block(deck, -hw + 0.04, DECK_LEN - 0.058, 0.006, hw - 0.04, DECK_LEN - 0.048, 0.008, NAVY, false);
  block(deck, -hw + 0.02, 0, 0, hw - 0.02, 0.025, 0.035, RED, false);
  for (const x of [-0.42, 0.42]) block(I, x - 0.02, BACK_TOP, -0.27, x + 0.02, 1.72, -0.23, CHROME);
  block(I, -hw, 1.71, -0.275, hw, 2.05, -0.225, RED);
  for (const face of [m4.translate(0, 0, -0.226), chain(m4.translate(0, 0, -0.274), m4.rotateY(Math.PI))]) {
    block(face, -hw + 0.03, 1.74, 0, hw - 0.03, 2.02, 0.004, WHITE, false);
    lettering(face, "HANDHELD", 0, 1.975, 0.007, 0.004, 0.008, RED);
    lettering(face, "GAME BOY", 0, 1.86, 0.019, 0.004, 0.01, NAVY, 0.25);
  }

  const colorRack = new Map();
  bakeInto = colorRack;
  {
    const PURPLE = [0.36, 0.2, 0.58, 1], DEEP = [0.2, 0.1, 0.36, 1], TEAL = [0.1, 0.62, 0.62, 1], YELLOW = [0.98, 0.82, 0.15, 1];
    block(I, -hw + 0.03, 0, -hd + 0.03, hw - 0.03, 0.08, hd - 0.03, DEEP);
    solid(profile, [[hd, 0.08], [hd, FRONT_TOP], [DECK_BACK, BACK_TOP], [-hd, BACK_TOP], [-hd, 0.08]], -hw, hw, PURPLE);
    block(I, -hw - 0.006, 0.7, -hd - 0.006, hw + 0.006, 0.76, hd + 0.006, TEAL);
    block(front, -0.3, 0.3, 0, 0.3, 0.56, 0.008, WHITE, false);
    lettering(front, "GAME BOY", -0.06, 0.43, 0.012, 0.008, 0.012, NAVY);
    [[0.9, 0.18, 0.2], [0.55, 0.3, 0.85], [0.25, 0.75, 0.3], [0.97, 0.8, 0.15], [0.2, 0.45, 0.95]].forEach((c, n) =>
      lettering(front, "COLOR"[n], 0.16 + n * 0.072, 0.43, 0.012, 0.008, 0.014, [...c, 1]));
    block(deck, -hw + 0.04, 0.03, 0, hw - 0.04, DECK_LEN - 0.03, 0.006, DEEP, false);
    block(deck, -hw + 0.04, DECK_LEN - 0.075, 0.006, hw - 0.04, DECK_LEN - 0.065, 0.008, YELLOW, false);
    block(deck, -hw + 0.04, DECK_LEN - 0.058, 0.006, hw - 0.04, DECK_LEN - 0.048, 0.008, TEAL, false);
    block(deck, -hw + 0.02, 0, 0, hw - 0.02, 0.025, 0.035, TEAL, false);
    for (const xc of [-0.2, 0.2]) {
      for (let k = 0; k < 9; k++) disc(chain(deck, m4.translate(xc, 0.04 + k * 0.012, 0.012)), 0, 0, 0.007, -0.002, 0.002, BLACK, false);
      block(deck, xc - 0.025, 0.028, 0.006, xc + 0.025, 0.05, 0.03, CHROME, false);
    }
    for (const x of [-0.42, 0.42]) block(I, x - 0.02, BACK_TOP, -0.27, x + 0.02, 1.72, -0.23, CHROME);
    block(I, -hw, 1.71, -0.275, hw, 2.05, -0.225, PURPLE);
    for (const face of [m4.translate(0, 0, -0.226), chain(m4.translate(0, 0, -0.274), m4.rotateY(Math.PI))]) {
      block(face, -hw + 0.03, 1.74, 0, hw - 0.03, 2.02, 0.004, WHITE, false);
      lettering(face, "HANDHELD", 0, 1.975, 0.007, 0.004, 0.008, [0.78, 0.07, 0.11, 1]);
      lettering(face, "GAME BOY", -0.13, 1.86, 0.016, 0.004, 0.01, NAVY, 0.25);
      [[0.9, 0.18, 0.2], [0.55, 0.3, 0.85], [0.25, 0.75, 0.3], [0.97, 0.8, 0.15], [0.2, 0.45, 0.95]].forEach((c, n) =>
        lettering(face, "COLOR"[n], 0.17 + n * 0.096, 1.86, 0.016, 0.004, 0.012, [...c, 1], 0.25));
      block(face, -hw + 0.03, 1.76, 0.004, hw - 0.03, 1.775, 0.006, TEAL, false);
    }
  }
  bakeInto = baked;
  const GB_SCALE = 1 / 1000, GB_BOTTOM = 0.16;
  const GREY = [0.78, 0.77, 0.73, 1], GROOVE = [0.64, 0.63, 0.6, 1], BEZEL = [0.3, 0.31, 0.38, 1];
  const BUTTON = [0.56, 0.11, 0.33, 1], RUBBER = [0.42, 0.42, 0.45, 1], CART = [0.55, 0.55, 0.57, 1];
  const LCD_X = 21.5, LCD_Y = 81, LCD_W = 47, LCD_H = 43, LCD_Z = 32.75;
  const bakeHandheld = (shell, trim, lcdShade) => {
    const g = m4.identity();
    solid(g, [[0, 0], ...arc(72, 18, 18, -Math.PI / 2, 0, 6), [90, 148], [0, 148]], 0, 32, shell);
    block(g, 2, 134, 32, 88, 135, 32.3, GROOVE, false);
    solid(g, [[9, 75], ...arc(71, 85, 10, -Math.PI / 2, 0, 4), [81, 131], [9, 131]], 32, 32.6, BEZEL, false);
    if (trim) { block(g, 12, 127.5, 32.6, 78, 128.3, 32.7, MAGENTA, false); block(g, 12, 129, 32.6, 78, 129.8, 32.7, NAVY, false); }
    disc(g, 15, 106, 1.6, 32.6, 33, [0.9, 0.12, 0.1, 1], false);
    block(g, LCD_X, LCD_Y, 32.6, LCD_X + LCD_W, LCD_Y + LCD_H, LCD_Z, lcdShade, false);
    block(g, 9, 66.5, 32, 25, 70, 32.3, trim ? NAVY : BLACK, false);
    lettering(g, "GAME BOY", 50, 68.2, 0.8, 32, 32.3, trim ? NAVY : BLACK, 0.25);
    disc(g, 20, 44, 13, 32, 32.2, GROOVE, false);
    block(g, 9, 40.2, 32, 31, 47.8, 36, BLACK, false);
    block(g, 16.2, 33, 32, 23.8, 55, 36, BLACK, false);
    disc(g, 76, 52, 5, 32, 35, BUTTON, false);
    disc(g, 62, 45, 5, 32, 35, BUTTON, false);
    for (const x of [37, 52]) pill(g, x, 22, 11, 3.6, 0.44, 32, 33.6, RUBBER, false);
    for (let i = 0; i < 6; i++) pill(g, 64 + i * 3.46, 17 + i * 2, 20, 2.2, -Math.PI / 3, 32, 32.3, GROOVE, false);
    block(g, 12, 139, 5, 78, 152, 22, CART);
    block(g, 16, 149, 22, 74, 150, 22.4, GROOVE, false);
    block(g, 90, 109, 9, 90.4, 127, 23, GROOVE, false);
    block(g, 90.4, 111.5, 11.5, 90.8, 124.5, 20.5, BLACK, false);
    block(g, 90.8, 113, 13, 91.0, 123, 19, [0.2, 0.2, 0.22, 1], false);
  };
  const bakeColor = shell => {
    const g = m4.identity(), W = 75, H = 133.5, D = 27.4;
    const LENS = [0.13, 0.13, 0.16, 1], SHELL_DARK = shell.map((v, i) => i < 3 ? v * 0.72 : v);
    const chin = Array.from({ length: 13 }, (_, i) => { const t = i / 12, x = W * (1 - t); return [x, 16 - 16 * Math.sin(Math.PI * t) ** 0.6 * (1 - 0.15 * Math.abs(0.5 - t))]; });
    solid(g, [...chin, ...arc(4, H - 4, 4, Math.PI, Math.PI / 2, 3).reverse(), ...arc(W - 4, H - 4, 4, Math.PI / 2, 0, 3).reverse()].reverse(), 0, D, shell);
    solid(g, [...arc(10, 72, 4, Math.PI, Math.PI * 1.5, 3), ...arc(W - 10, 72, 4, Math.PI * 1.5, Math.PI * 2, 3), ...arc(W - 10, 125, 4, 0, Math.PI / 2, 3), ...arc(10, 125, 4, Math.PI / 2, Math.PI, 3)], D, D + 0.6, LENS, false);
    block(g, 15.5, 81, D + 0.6, 59.5, 121, D + 0.75, [0.5, 0.55, 0.5, 1], false);
    disc(g, 10.5, 104, 1.1, D + 0.6, D + 0.9, [0.95, 0.15, 0.2, 1], false);
    lettering(g, "GAME BOY", 30, 75.6, 0.45, D + 0.6, D + 0.8, [0.9, 0.9, 0.92, 1]);
    [[0.9, 0.18, 0.2], [0.55, 0.3, 0.85], [0.25, 0.75, 0.3], [0.97, 0.8, 0.15], [0.2, 0.45, 0.95]].forEach((c, n) =>
      lettering(g, "COLOR"[n], 46 + n * 6 * 0.45, 75.6, 0.45, D + 0.6, D + 0.8, [...c, 1]));
    lettering(g, "HANDHELD", W / 2, 66, 0.4, D, D + 0.25, SHELL_DARK);
    disc(g, 17, 42, 11.5, D, D + 0.2, SHELL_DARK, false);
    block(g, 7, 38.5, D, 27, 45.5, D + 3, BLACK, false);
    block(g, 13.5, 32, D, 20.5, 52, D + 3, BLACK, false);
    pill(g, 58, 42.5, 22, 13, 0.55, D, D + 0.2, SHELL_DARK, false);
    for (const [x, y] of [[52, 39], [64, 46]]) disc(g, x, y, 4.6, D, D + 3, [0.42, 0.36, 0.55, 1], false);
    for (const x of [30, 45]) pill(g, x, 19, 9, 3.2, 0, D, D + 1.2, RUBBER, false);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4 - (r === 0 ? 1 : 0); c++) disc(g, 56 + c * 3.4 + r * 1.2, 10 + r * 3.4, 0.9, D, D + 0.05, BLACK, false);
    block(g, 9, H - 6, 4, 66, H + 6, 20, CART);
    block(g, 22, H - 0.5, 20, 34, H + 0.3, 25, [0.45, 0.05, 0.1, 1], false);
    block(g, 4, H - 0.5, 8, 9, H + 1, 14, SHELL_DARK, false);
    block(g, W, 106, 8, W + 0.4, 118, 19.4, SHELL_DARK, false);
    block(g, W + 0.4, 108, 10.5, W + 0.8, 116, 17, BLACK, false);
  };
  const bakeAdvance = shell => {
    const g = m4.identity(), W = 144.5, H = 82, D = 24.5, LENS = [0.13, 0.13, 0.16, 1], GREYKEY = [0.66, 0.66, 0.7, 1], INK = [0.82, 0.84, 0.9, 1];
    const dish = [shell[0] * 0.8, shell[1] * 0.8, shell[2] * 0.8, 1];
    const topAt = x => { const e = t => t * t * (3 - 2 * t), f = Math.min(1, Math.max(0, (x - 26) / 12)), r = Math.min(1, Math.max(0, (W - 26 - x) / 12)); return 76.5 + 5.5 * e(Math.min(f, r)); };
    const top = []; for (let x = W - 16; x >= 16; x -= 4) top.push([x, topAt(x)]);
    solid(g, [...arc(32, 32, 32, Math.PI, Math.PI * 1.5, 10), ...arc(W - 32, 32, 32, Math.PI * 1.5, Math.PI * 2, 10), ...arc(W - 14, 62.5, 14, 0, Math.PI / 2, 6), ...top, ...arc(14, 62.5, 14, Math.PI / 2, Math.PI, 6)], 0, D, shell);
    const lens = [...arc(47.9, 19.7, 14, Math.PI, Math.PI * 1.5, 4), ...arc(96.6, 19.7, 14, Math.PI * 1.5, Math.PI * 2, 4), ...arc(104.6, 69.7, 6, 0, Math.PI / 2, 3), ...arc(39.9, 69.7, 6, Math.PI / 2, Math.PI, 3)];
    solid(g, lens, D, D + 0.6, LENS, false);
    block(g, 41.65, 25.2, D + 0.6, 102.85, 66.0, D + 0.72, [0.5, 0.55, 0.5, 1], false);
    lettering(g, "GAME BOY ADVANCE", 72.25, 15.4, 0.55, D + 0.6, D + 0.7, INK);
    pill(g, 73, 79, 18, 4, 0, D, D + 0.15, dish, false);
    disc(g, 111.5, 70.3, 1.0, D, D + 0.4, [0.3, 0.85, 0.35, 1], false);
    lettering(g, "POWER", 119, 70.3, 0.32, D, D + 0.1, dish, 0, true);
    disc(g, 24, 53.5, 12, D, D + 0.25, dish, false);
    block(g, 14.75, 50, D, 33.25, 57, D + 4, GREYKEY, false);
    block(g, 20.5, 44.25, D, 27.5, 62.75, D + 4, GREYKEY, false);
    for (const [x, y] of [[114.7, 50.5], [125.3, 54.3]]) { disc(g, x, y, 5.4, D, D + 0.25, dish, false); disc(g, x, y, 4.3, D, D + 3.1, GREYKEY, false); }
    for (const [x, y] of [[29.9, 31.6], [28.6, 21.4]]) { disc(g, x, y, 2.6, D, D + 0.2, dish, false); disc(g, x, y, 2.15, D, D + 1.4, GREYKEY, false); }
    for (const [x, y, word] of [[20.5, 31.6, "START"], [19.2, 21.4, "SELECT"]]) { pill(g, x, y, 11, 3.4, 0, D, D + 0.12, dish, false); lettering(g, word, x, y, 0.28, D + 0.12, D + 0.2, INK, 0, true); }
    for (let n = 0; n < 6; n++) pill(g, 120.6, 18.2 + n * 3.4, 14.5, 1.1, 0.06, D, D + 0.05, BLACK, false);
    for (const [x0, x1] of [[4, 34], [W - 34, W - 4]]) block(g, x0, 74.5, 9, x1, 78.2, 21, GREYKEY);
    block(g, 64.25, H - 0.6, 7.5, 80.25, H + 0.35, 17, GROOVE, false);
    block(g, 66.75, H + 0.35, 9.5, 77.75, H + 0.7, 15, BLACK, false);
    block(g, 42, H - 14, 1.2, 102.5, H + 1.2, 6.2, [0.55, 0.55, 0.6, 1]);
    block(g, 12, -0.5, 10, 26, 0, 15, GROOVE, false);
    block(g, 113.3, -0.4, 10.5, 116.3, 0, 13.5, BLACK, false);
    block(g, 121, -0.5, 10, 128, 0, 15, GROOVE, false);
  };
  const deviceBaked = [new Map(), new Map(), new Map()];
  bakeInto = deviceBaked[0]; bakeHandheld(GREY, true, [0.61, 0.74, 0.06, 1]);
  bakeInto = deviceBaked[1]; bakeColor([0.42, 0.24, 0.62, 1]);
  bakeInto = deviceBaked[2]; bakeAdvance([0.36, 0.3, 0.62, 1]);
  const plugBaked = new Map();
  bakeInto = plugBaked;
  {
    const g = m4.identity();
    block(g, 90, 106, 6, 92.5, 130, 26, BLACK);
    block(g, 92.5, 108.5, 8.5, 105, 127.5, 23.5, RUBBER);
    block(g, 95, 128, 12, 102, 129, 20, GROOVE, false);
    block(g, 105, 110.5, 8.5, 113, 125.5, 23.5, BLACK);
  }
  bakeInto = baked;
  const deviceParts = deviceBaked.map(m => [...m.values()].map(({ color, positions, normals }) => ({ color, mesh: mesh(positions, normals) })));
  const gameBoyParts = deviceParts[0];
  const plugParts = [...plugBaked.values()].map(({ color, positions, normals }) => ({ color, mesh: mesh(positions, normals) }));
  const plugShift = DEVICES.map(d => {
    const up = d.tail[1] !== d.port[1];
    if (!up) return m4.translate(d.port[0] - GB_PORT_MM[0], d.port[1] - GB_PORT_MM[1], d.port[2] - GB_PORT_MM[2]);
    return chain(m4.translate(...d.port), new Float32Array([0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), m4.translate(-GB_PORT_MM[0], -GB_PORT_MM[1], -GB_PORT_MM[2]));
  });
  const newScreen = game => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, low ? gl.LINEAR : gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const [w, h] = game?.kind === "micro" ? [MICRO.W, MICRO.H] : [BRICKS.W, BRICKS.H];
    gl.texStorage2D(gl.TEXTURE_2D, low ? 1 : 1 + Math.floor(Math.log2(Math.max(w, h))), gl.RGBA8, w, h);
    return { texture, game, dirty: true, w, h };
  };
  const transientScreens = new Set();
  const retainScreens = held => {
    const now = performance.now();
    for (let i = dropped.length - 1; i >= 0; i--) if (now - dropped[i].at > DROPPED_SECONDS * 1000) dropped.splice(i, 1);
    const keep = new Set([...held, ...dropped.map(d => d.screen)]);
    for (const screen of transientScreens) if (!keep.has(screen)) {
      gl.deleteTexture(screen.texture); screen.texture = null; transientScreens.delete(screen);
    }
  };
  const demo = n => BRICKS.create(0x1989 + n * 7919 + Math.floor(Math.random() * 1e6));
  const pinballDemo = n => pinballReady(Object.assign(PINBALL.create(0x1998 + n * 7919 + Math.floor(Math.random() * 1e6)), { mode: "demo" }));
  const gameBoys = [-0.2, 0.2].map((xc, n) => {
    block(deck, xc - 0.02, 0.03, 0.006, xc + 0.02, 0.06, 0.03, CHROME, false);
    const local = chain(deck, m4.translate(xc, GB_BOTTOM, 0.006), m4.scale(GB_SCALE, GB_SCALE, GB_SCALE), m4.translate(-45, 0, 0));
    const model = chain(rackModel, local);
    return { model, cord: chain(rackModel, deck, m4.translate(xc, (0.035 + GB_BOTTOM - 0.002) / 2, 0.009), m4.scale(0.006, GB_BOTTOM - 0.002 - 0.035, 0.006)),
      centre: apply(model, [45, 74, 16]), screen: newScreen(demo(n)), taken: false };
  });
  const stands = [1, 2].flatMap(tier => [-0.2, 0.2].map((xc, n) => {
    const lift = m4.translate(0, MIRROR.beamTop(STAND_LEVEL[tier]), 0), device = DEVICES[tier];
    const local = chain(deck, m4.translate(xc, GB_BOTTOM, 0.006), m4.scale(GB_SCALE, GB_SCALE, GB_SCALE), m4.translate(-device.centre[0], 0, 0));
    const model = chain(lift, rackModel, local);
    return { tier, level: tier, model, rack: chain(lift, rackModel), centre: apply(model, device.centre), screen: newScreen(tier === 1 ? pinballDemo(n) : tier === 2 ? microDemo(n) : demo(3 + tier * 2 + n)), taken: false };
  }));
  const practice = [];
  const practiceAt = tier => [-11.6, 0, -3 + 3 * tier];
  const addPractice = tier => {
    if (!DEVICES[tier] || practice.some(st => st.tier === tier)) return false;
    const [x, , z] = practiceAt(tier), device = DEVICES[tier], rack = chain(m4.translate(x, 0, z), rackModel);
    const local = chain(deck, m4.translate(0, GB_BOTTOM, 0.006), m4.scale(GB_SCALE, GB_SCALE, GB_SCALE), m4.translate(-device.centre[0], 0, 0));
    const model = chain(rack, local);
    practice.push({ tier, model, rack, centre: apply(model, device.centre), screen: newScreen(tier === 1 ? pinballDemo(7) : tier === 2 ? microDemo(7) : demo(11 + tier)), taken: false });
    return true;
  };
  const practiceBoxes = () => practice.map(st => { const [x, , z] = practiceAt(st.tier); return [x, z, wasm.rack_half_x(), wasm.rack_half_z(), 1.25]; });
  const remoteScreen = newScreen(demo(2)), remotePinball = newScreen(pinballDemo(5)), remoteMicro = newScreen(microDemo(5));
  const rackParts = [...baked.values()].map(({ color, positions, normals }) => ({ color, mesh: mesh(positions, normals) }));
  const colorRackParts = [...colorRack.values()].map(({ color, positions, normals }) => ({ color, mesh: mesh(positions, normals) }));

  const MORTAR = [0.12, 0.12, 0.13, 1], BRICK_FACE = [0.5, 0.5, 0.52, 1], BRICK_TOP = [0.72, 0.72, 0.74, 1];
  const pillar = (m, rows = MIRROR_ROWS) => {
    const c = MIRROR_CELL, half = c / 2;
    block(m, -half + 0.02, 0, 0.007, half - 0.02, rows * c, c - 0.02, MORTAR);
    for (let r = 0; r < rows; r++) {
      block(m, -half, r * c + 0.07, 0, half, r * c + 1.16, c, BRICK_FACE, true, [2]);
      block(m, -half, r * c + 1.16, 0, half, r * c + 1.33, c + 0.007, BRICK_TOP, true, [0]);
    }
  };
  const wellZ = wasm.well_z();
  const wallFrames = [u => chain(m4.translate(u, 0, -wellZ), m4.rotateY(0)), u => chain(m4.translate(u, 0, wellZ), m4.rotateY(Math.PI))];
  const pillarParts = wallFrames.map(frameAt => {
    const map = new Map();
    bakeInto = map;
    for (const u of PILLAR_OFFSETS) pillar(frameAt(u));
    bakeInto = baked;
    return [...map.values()].map(({ color, positions, normals }) => ({ color, mesh: mesh(positions, normals) }));
  });
  const clonePillarParts = (() => {
    const map = new Map();
    bakeInto = map;
    for (const b of MIRROR.clonePillars(1)) {
      const rows = Math.round((b[4] - b[1]) / MIRROR_CELL), xc = (b[0] + b[3]) / 2;
      pillar(b[2] < 0 ? m4.translate(xc, b[1], b[2]) : chain(m4.translate(xc, b[1], b[5]), m4.rotateY(Math.PI)), rows);
    }
    bakeInto = baked;
    return [...map.values()].map(({ color, positions, normals }) => ({ color, mesh: mesh(positions, normals) }));
  })();
  const beams = Array.from({ length: MIRROR.LEVELS }, (_, level) => MIRROR.bridges(wellZ, level)).flat().map(([x0, y0, z0, x1, y1, z1]) =>
    new Float32Array([x1 - x0, 0, 0, 0, 0, y1 - y0, 0, 0, 0, 0, z1 - z0, 0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 1])), beamY = beams.map(b => b[13]);
  const TOWER_SINK = MIRROR.beamTop(MIRROR.LEVELS) + MIRROR.SUMMIT_RISE + 2.0;
  const sinkBy = (rise, w) => -(1 - rise) * (w === 1 ? TOWER_SINK : PILLAR_HEIGHT + MIRROR.SUMMIT_RISE + 1.0);
  const drawPillars = () => world.rise.forEach((rise, w) => {
    if (rise <= 0) return;
    const lift = sinkBy(rise, w);
    const model = m4.translate(0, lift, 0);
    for (const part of pillarParts[w]) draw(part.mesh, model, part.color);
    if (w === 1) {
      beams.forEach((beam, level) => { if ((level === MIRROR.ACROSS && !world.platform) || level === MIRROR.FINISH_LEVEL) return; beam[13] = beamY[level] + lift; draw(cube, beam, BRICK_TOP); });
      {
        const [x0, y0, z0, x1, y1, z1] = MIRROR.bridges(wellZ, MIRROR.FINISH_LEVEL)[0], n = 4, step = (x1 - x0) / n, m = Math.round((z1 - z0) / step), sz = (z1 - z0) / m;
        for (let i = 0; i < n; i++) for (let j = 0; j < m; j++)
          draw(cube, new Float32Array([step, 0, 0, 0, 0, y1 - y0, 0, 0, 0, 0, sz, 0, x0 + (i + 0.5) * step, (y0 + y1) / 2 + lift, z0 + (j + 0.5) * sz, 1]), (i + j) % 2 ? FINISH_BLACK : FINISH_WHITE);
      }
      for (let side = 0; side < 2; side++) {
        const b = MIRROR.lift(side, (world.lifts || [])[side] ?? MIRROR.LIFT.base());
        const colour = (world.liftColors || [])[side] || LIFT_GOLD, shine = [0, 1, 2].map(n => colour[n] + (1 - colour[n]) * 0.45).concat(1);
        draw(cube, new Float32Array([b[3] - b[0], 0, 0, 0, 0, b[4] - b[1], 0, 0, 0, 0, b[5] - b[2], 0, (b[0] + b[3]) / 2, (b[1] + b[4]) / 2 + lift, (b[2] + b[5]) / 2, 1]), colour);
        draw(cube, new Float32Array([b[3] - b[0] - 0.12, 0, 0, 0, 0, 0.03, 0, 0, 0, 0, b[5] - b[2] - 0.12, 0, (b[0] + b[3]) / 2, b[4] + 0.015 + lift, (b[2] + b[5]) / 2, 1]), shine);
      }
      const solid = (b, colour) => draw(cube, new Float32Array([b[3] - b[0], 0, 0, 0, 0, b[4] - b[1], 0, 0, 0, 0, b[5] - b[2], 0, (b[0] + b[3]) / 2, (b[1] + b[4]) / 2 + lift, (b[2] + b[5]) / 2, 1]), colour);
      for (const b of MIRROR.walkways(wellZ)) solid(b, BRICK_TOP);
      const top = MIRROR.beamTop(2) + lift, pulse = Math.floor(performance.now() / 250) % 4;
      for (const side of [0, 1]) {
        const sz = side === 0 ? -1 : 1, x1 = MIRROR.walkways(wellZ)[side][side === 0 ? 3 : 0];
        const arrow = (x, z, dx, dz, n, k) => {
          const colour = (n - k + 400) % 4 === pulse ? PIN_FLASH : PIN_POST;
          for (const s2 of [-1, 1]) {
            const ax = x - dx * 0.35 + -dz * 0.35 * s2, az = z - dz * 0.35 + dx * 0.35 * s2, bx = x + dx * 0.25, bz = z + dz * 0.25;
            const l = Math.hypot(bx - ax, bz - az), cx = (ax + bx) / 2, cz = (az + bz) / 2, ux = (bx - ax) / l, uz = (bz - az) / l;
            draw(cube, new Float32Array([ux * l, 0, uz * l, 0, 0, 0.003, 0, 0, -uz * 0.04, 0, ux * 0.04, 0, cx, top + 0.0015, cz, 1]), colour);
          }
        };
        let k = 0;
        for (let z = 1.6; z <= 5.8; z += 1.05) arrow(0, z * sz, 0, sz, 9, k++);
        const zw = (MIRROR.walkways(wellZ)[side][2] + MIRROR.walkways(wellZ)[side][5]) / 2;
        for (let x = 1.4; x <= Math.abs(x1) - 0.5; x += 1.05) arrow(x * (side === 0 ? 1 : -1), zw, side === 0 ? 1 : -1, 0, 9, k++);
      }
      for (const part of clonePillarParts) draw(part.mesh, model, part.color);
    }
  });
  const world = { infect: [0, 0, 0, -1], sink: 0, rise: [0, 0], progress: 0, mirror: [], tierFrom: -1, tierTo: 0, platform: false };
  const TILE_TYPES = "IOTJLSZX";
  const CELL_COLORS = Object.fromEntries([...TILE_TYPES].map((k, n) => [k, [0, 0, 0, -(2 + n)]]));
  const COLOR_CELLS = { I: [0.2, 0.8, 0.9, -1], O: [0.95, 0.85, 0.2, -1], T: [0.6, 0.3, 0.8, -1], J: [0.25, 0.35, 0.9, -1], L: [0.95, 0.55, 0.2, -1], S: [0.3, 0.8, 0.3, -1], Z: [0.9, 0.25, 0.25, -1], X: [0.5, 0.5, 0.55, -1] };
  const cellModel = m4.identity();
  const GLITCH = [[0.02, 0.02, 0.02, -1], [0.97, 0.97, 0.97, -1]];
  const pinStatic = new Map(), slingEdges = new Map(), IDENTITY_MODEL = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const TABLE_NEAR = 70;
  const inView = points => {
    const m = viewProjection; if (!m) return true;
    const clip = points.map(([x, y, z]) => [0, 1, 2, 3].map(r => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]));
    for (const [axis, sign] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1]]) if (clip.every(c => sign * c[axis] > c[3])) return false;
    return !clip.every(c => c[3] < 0);
  };
  const drawPinballs = () => {
    const rise = world.rise[1];
    if (rise <= 0) { canvas.dataset.tables = "0"; canvas.dataset.tablesDrawn = "0"; return; }
    const all = allTables(world.pinballs || []);
    drawLift = sinkBy(rise, 1);
    try { for (const pin of all) drawPinball(pin); } finally { drawLift = 0; }
    canvas.dataset.tables = `${all.length}:${rise.toFixed(2)}`; canvas.dataset.tablesDrawn = String(tablesDrawn); tablesDrawn = 0;
  };
  let tablesDrawn = 0;
  const drawPinball = pin => {
    {
      const T = PINBALL.TABLES[pin.table]; if (!T) return;
      const h = T.h, at = (x, y, dz = 0) => pinPoint(pin.side, colliders.well, x, y, h, dz, pin.table), out = pin.side === 0 ? 1 : -1;
      const corners = [[0, 0, -1], [160, 0, -1], [0, h, -1], [160, h, -1], [0, 0, 3], [160, 0, 3], [0, h, 3], [160, h, 3]].map(([x, y, dz]) => { const q = at(x, y, dz); q[1] += drawLift; return q; });
      if (!inView(corners)) return;
      tablesDrawn++;
      const mid = at(80, h / 2), far = Math.hypot(mid[0] - lodEye[0], mid[1] + drawLift - lodEye[1], mid[2] - lodEye[2]) > TABLE_NEAR;
      const key = `${pin.table}:${pin.side}:${colliders.well}`;
      let cached = pinStatic.get(key), building = !cached;
      if (building) cached = [];
      let emit = building ? (m, model, colour) => cached.push([m, model, colour]) : null;
      const slab = (a, b, width, depth, colour, dz = 0) => {
        const p0 = at(a[0], a[1], dz), p1 = at(b[0], b[1], dz), d = sub(p1, p0), len = Math.hypot(...d) || 1e-3, u = d.map(v => v / len), v = [-u[1], u[0], 0];
        emit(cube, new Float32Array([v[0] * width, v[1] * width, 0, 0, u[0] * len, u[1] * len, u[2] * len, 0, 0, 0, depth * out, 0, (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2, 1]), colour);
      };
      const box3 = (x, y, w, hgt, depth, colour, dz = 0) => { const c3 = at(x, y, dz); emit(cube, new Float32Array([w, 0, 0, 0, 0, hgt, 0, 0, 0, 0, depth, 0, c3[0], c3[1], c3[2], 1]), colour); };
      const prism = (poly, dz0, dz1) => {
        const back = poly.map(([x, y]) => at(x, y, dz0)), front = poly.map(([x, y]) => at(x, y, dz1)), n = poly.length;
        const centre = [0, 1, 2].map(k => [...back, ...front].reduce((t, p) => t + p[k], 0) / (2 * n));
        const positions = [], normals = [];
        const tri = (p, q, r) => {
          let nv = cross(sub(q, p), sub(r, p)); const len = Math.hypot(...nv) || 1; nv = nv.map(v => v / len);
          const mid = [0, 1, 2].map(k => (p[k] + q[k] + r[k]) / 3);
          if ((mid[0] - centre[0]) * nv[0] + (mid[1] - centre[1]) * nv[1] + (mid[2] - centre[2]) * nv[2] < 0) { [q, r] = [r, q]; nv = nv.map(v => -v); }
          positions.push(...p, ...q, ...r); for (let k = 0; k < 3; k++) normals.push(...nv);
        };
        for (let i = 1; i + 1 < n; i++) { tri(back[0], back[i], back[i + 1]); tri(front[0], front[i], front[i + 1]); }
        for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(back[i], back[j], front[j]); tri(back[i], front[j], front[i]); }
        return mesh(positions, normals);
      };
      const drum = (x, y, r, depth, colour, face = colour, dz = 0) => {
        emit(rodLods[1], segment(at(x, y, dz - depth / 2), at(x, y, dz + depth / 2), r * 2, r * 2), colour);
        const f = at(x, y, dz + depth / 2);
        emit(ballLods[2], new Float32Array([r * 2, 0, 0, 0, 0, r * 2, 0, 0, 0, 0, 0.04, 0, f[0], f[1], f[2], 1]), face);
      };
      const S = pinScale(pin.table);
      if (building) for (const [x0, x1] of [[0, 6], [154, 160]]) { const c0 = at((x0 + x1) / 2, h / 2, -0.1); emit(cube, new Float32Array([(x1 - x0) * S, 0, 0, 0, 0, h * S, 0, 0, 0, 0, 0.8, 0, c0[0], c0[1], c0[2], 1]), PIN_CABINET); }
      const low = y => y > h - 92;
      if (building) for (const w of T.walls) {
        const outer = (Math.abs(w[0] - w[2]) < 0.5 && [6, 142, 154].some(x => Math.abs(w[0] - x) < 0.5)) || (Math.abs(w[1] - w[3]) < 0.5 && w[1] >= h - 7);
        const guide = !outer && low(Math.max(w[1], w[3]));
        slab([w[0], w[1]], [w[2], w[3]], guide ? 0.45 : 0.32, guide ? 0.7 : 0.9, guide ? PIN_GUIDE : PIN_WALL);
      }
      if (building) for (const w of T.gates) slab([w[0], w[1]], [w[2], w[3]], 0.12, 0.5, PIN_GATE);
      if (building) {
        const edges = [];
        T.slings.forEach(w => {
          const a = [w[0], w[1]], c2 = [w[2], w[3]], top = a[1] < c2[1] ? a : c2, bottom = a[1] < c2[1] ? c2 : a, corner = [top[0], bottom[1]];
          emit(prism([corner, top, bottom], -0.25, 0.25), IDENTITY_MODEL, PIN_GUIDE);
          const dx = bottom[0] - top[0], dy = bottom[1] - top[1], l = Math.hypot(dx, dy) || 1, k = 0.35 / S;
          let nx = -dy / l, ny = dx / l;
          if ((corner[0] - top[0]) * nx + (corner[1] - top[1]) * ny < 0) { nx = -nx; ny = -ny; }
          edges.push(prism([top, bottom, [bottom[0] + nx * k, bottom[1] + ny * k], [top[0] + nx * k, top[1] + ny * k]], -0.4, 0.4));
        });
        slingEdges.set(key, edges);
      }
      if (building) for (const q of T.posts) drum(q[0], q[1], q[2] * S + 0.05, 0.6, PIN_POST, PIN_POST_FACE);
      if (building) T.lanes.forEach(l => drum(l[0], l[1], 0.42, 0.25, PIN_GUIDE, PIN_LANE));
      if (building) for (const name in T.holes) { const o = T.holes[name]; drum(o.x, o.y, 0.62, 0.12, PIN_HOLE_RIM, PIN_HOLE); }
      if (building) T.spinners.forEach(sp => box3(sp[0], sp[1], sp[2] * S, sp[3] * S, 0.15, PIN_WALL, 0.2));
      if (building) T.targets.forEach(t => slab([t.seg[0], t.seg[1]], [t.seg[2], t.seg[3]], 0.25, 0.4, PIN_POST));
      if (building) T.ramps.forEach(r => {
        const dx = r.exit[0] - r.enter[0], dy = r.exit[1] - r.enter[1], l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
        for (let k = 0; k < 3; k++) {
          const cx = r.enter[0] + ux * (k * 8 - 6), cy = r.enter[1] + uy * (k * 8 - 6), tip = [cx + ux * 5, cy + uy * 5];
          slab([cx + nx * 4, cy + ny * 4], tip, 0.16, 0.25, PIN_ARROW); slab([cx - nx * 4, cy - ny * 4], tip, 0.16, 0.25, PIN_ARROW);
        }
        for (let t = 10; t < l; t += 7) box3(r.enter[0] + dx * t / l, r.enter[1] + dy * t / l, 0.14, 0.14, 0.1, PIN_GATE);
      });
      const spot = PIN_SPOTS[pin.table] || [74, 64], m = at(spot[0], spot[1], 0.9);
      if (building) {
      const mb = pinMascotBounds(pin, colliders.well), mk = S / PIN_SCALE, face = Math.abs(mb[5] - mb[2]) + 0.02;
      for (const b of pinMascot(pin, colliders.well)) emit(cube, new Float32Array([b[3] - b[0], 0, 0, 0, 0, b[4] - b[1], 0, 0, 0, 0, b[5] - b[2], 0, (b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2, 1]), PIN_MASCOT);
      for (const ex of [-0.5, 0.5]) box3(spot[0] + ex * mk / S, spot[1] - 0.3 * mk / S, 0.36 * mk, 0.5 * mk, 0.1, PIN_INK, face);
      box3(spot[0], spot[1] + 0.55 * mk / S, 0.9 * mk, 0.14 * mk, 0.1, PIN_INK, face);
      box3(spot[0], spot[1] + 19 + 2.5, 40 * S, 5 * S, 0.2, PIN_HOLE_RIM, 0.1);
      box3(75, h - 39, 34 * S, 8 * S, 0.25, PIN_WALL, 0.15); box3(75, h - 39, 30 * S, 5 * S, 0.1, PIN_FIELD, 0.3);
      pinStatic.set(key, cached);
      }
      for (const [m3, model, colour] of cached) draw(m3, model, colour);
      emit = draw;
      if (!far) (slingEdges.get(key) || []).forEach((edge, i) => draw(edge, IDENTITY_MODEL, pin.sling?.[i] ? PIN_FLASH : PIN_SLING));
      if (!far) T.bumpers.forEach((q, i) => {
        const lit = pin.flash?.[i], r = q[2] * S + 0.15;
        drum(q[0], q[1], r, 0.9, lit ? PIN_FLASH : PIN_BUMPER, PIN_BUMPER_RING);
        drum(q[0], q[1], r * 0.62, 0.3, lit ? PIN_FLASH : PIN_BUMPER, lit ? PIN_FLASH : PIN_BUMPER_FACE, 0.45);
      });

      if (!far) T.flippers.forEach((spec, i) => {
        const a = pin.fl?.[i] ?? 0.5, end = [spec.px + spec.side * spec.len * Math.cos(a), spec.py + spec.len * Math.sin(a)];
        slab([spec.px, spec.py], end, 0.42, 0.55, PIN_FLIPPER); drum(spec.px, spec.py, 0.24, 0.6, PIN_FLIPPER, PIN_INK);
      });
      for (const [x0, y0, z0, x1, y1, z1] of pinCubes(pin, colliders.well, false))
        draw(cube, new Float32Array([x1 - x0, 0, 0, 0, 0, y1 - y0, 0, 0, 0, 0, z1 - z0, 0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 1]), PIN_CUBE);
      if (pin.ball) {
        const b = at(pin.ball[0], pin.ball[1], PIN_BALL_OUT), r = PIN_BALL;
        draw(ballLods[1], new Float32Array([2 * r, 0, 0, 0, 0, 2 * r, 0, 0, 0, 0, 2 * r, 0, b[0], b[1], b[2], 1]), PIN_BALL_COLOUR);
      }
    }
  };

  let lastMirror = [];
  const drawMirror = () => {
    const tick = Math.floor(performance.now() / 40);
    if (world.mirror.length) lastMirror = world.mirror;
    else if (world.rise.every(r => r <= 0)) lastMirror = [];
    const cells = world.mirror.length ? world.mirror : lastMirror, sinking = !world.mirror.length;
    cells.forEach(([x0, y0, z0, x1, y1, z1, type, left], i) => {
      const palette = (world.infect[3] > 0 ? world.tierTo : world.tierFrom) >= 1 ? COLOR_CELLS : CELL_COLORS;
      let size = x1 - x0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, colour = palette[type] ?? palette.O;
      if (left !== undefined) {
        const h = k => (Math.sin((tick * 7 + i * 13 + k) * 12.9898) * 43758.5453) % 1;
        const amp = 0.6 * (1 - left);
        cx += (h(1) - 0.5) * amp; cy += (h(2) - 0.5) * amp; cz += (h(3) - 0.5) * amp;
        size *= 0.3 + 0.7 * left;
        if ((tick + i) % 3) colour = GLITCH[(tick + i) % 2];
      }
      const turn = z0 > 0 ? -1 : 1;
      cellModel[0] = cellModel[10] = size * turn; cellModel[5] = size;
      if (sinking) cy += sinkBy(world.rise[y0 >= MIRROR.LEVEL_H - 1 ? 1 : 0], y0 >= MIRROR.LEVEL_H - 1 ? 1 : 0);
      cellModel[12] = cx; cellModel[13] = cy; cellModel[14] = cz;
      draw(cube, cellModel, colour);
    });
  };

  const SHADES = [[155, 188, 15], [139, 172, 15], [48, 98, 48], [15, 56, 15]];
  {
    const atlas = new Uint8Array(TILE_TYPES.length * 8 * 8 * 4), stride = TILE_TYPES.length * 8;
    [...TILE_TYPES].forEach((type, n) => {
      const art = type === "X" ? BRICKS.CURTAIN : BRICKS.BLOCKS[type];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const i = (r * stride + n * 8 + c) * 4; atlas.set([...SHADES[art[r][c]], 255], i); }
    });
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, stride, 8, 0, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
  }
  const screenProgram = gl.createProgram();
  gl.attachShader(screenProgram, compile(gl.VERTEX_SHADER, SCREEN_VERT));
  gl.attachShader(screenProgram, compile(gl.FRAGMENT_SHADER, SCREEN_FRAG));
  gl.linkProgram(screenProgram);
  if (!gl.getProgramParameter(screenProgram, gl.LINK_STATUS)) throw new Error("Screen program: " + gl.getProgramInfoLog(screenProgram));
  const su = name => gl.getUniformLocation(screenProgram, name);
  const screenUniforms = { projection: su("uProjection"), view: su("uView"), model: su("uModel"), screen: su("uScreen"), fogColor: su("uFogColor"), fogDensity: su("uFogDensity") };
  gl.useProgram(screenProgram);
  gl.uniform3fv(screenUniforms.fogColor, FOG_COLOR);
  gl.uniform1f(screenUniforms.fogDensity, FOG_DENSITY);
  gl.uniform1i(screenUniforms.screen, 0);
  gl.useProgram(program);
  const screenQuads = DEVICES.map(device => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const [lx, ly, lw, lh, lz] = device.lcd, x0 = lx, x1 = lx + lw, y0 = ly, y1 = ly + lh, z = lz + 0.02;
    for (const [index, size, data] of [[0, 3, [x0,y0,z, x1,y0,z, x1,y1,z, x0,y0,z, x1,y1,z, x0,y1,z]], [1, 2, [0,1, 1,1, 1,0, 0,1, 1,0, 0,0]]]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index, size, gl.FLOAT, false, 0, 0);
    }
    gl.bindVertexArray(null);
    return vao;
  });
  const shades = new Uint8Array(BRICKS.W * BRICKS.H), rgba = new Uint8Array(BRICKS.W * BRICKS.H * 4), microRgba = new Uint8Array(MICRO.W * MICRO.H * 4);
  const pauseShades = new Uint8Array(PINBALL.W * PINBALL.H);
  const pixels = new Uint32Array(rgba.buffer), PALETTE = new Uint32Array(SHADES.map(([r, g, b]) => (255 << 24 | b << 16 | g << 8 | r) >>> 0));
  let lastRackTime;
  const upload = screen => {
    if (!screen.dirty) return;
    const now = performance.now();
    if (!screen.priority && now - (screen.uploadAt || 0) < SCREEN_IDLE_MS) return;
    screen.uploadAt = now;
    const size = screen.game.kind === "micro" ? [MICRO.W, MICRO.H] : [BRICKS.W, BRICKS.H];
    if (screen.w !== size[0] || screen.h !== size[1]) { gl.deleteTexture(screen.texture); Object.assign(screen, newScreen(screen.game), { game: screen.game }); }
    gl.bindTexture(gl.TEXTURE_2D, screen.texture);
    if (screen.game.kind === "micro") {
      MICRO.render(screen.game, microRgba);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MICRO.W, MICRO.H, gl.RGBA, gl.UNSIGNED_BYTE, microRgba);
      if (!low) gl.generateMipmap(gl.TEXTURE_2D);
      screen.dirty = false;
      return;
    }
    if (screen.game.kind === "pinball") {
      if (screen.game.scene === "play" && screen.game.p) {
        PINBALL_ART.render(screen.game, rgba);
        if (screen.game.paused) {
          for (let i = 0; i < rgba.length; i++) if ((i & 3) !== 3) rgba[i] = Math.round(Math.round(rgba[i] * 0.55 / 255 * 31) * 255 / 31);
          pauseShades.fill(255); PINBALL.drawPause(pauseShades, screen.game);
          for (let i = 0; i < pauseShades.length; i++) if (pauseShades[i] !== 255) rgba.set(PINBALL_ART.OBJ[Math.min(2, pauseShades[i])].concat(255), i * 4);
        }
      } else PINBALL_COLORS.render(screen.game, rgba);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PINBALL.W, PINBALL.H, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      if (!low) gl.generateMipmap(gl.TEXTURE_2D);
      screen.dirty = false;
      return;
    }
    BRICKS.render(screen.game, shades);
    for (let i = 0; i < shades.length; i++) pixels[i] = PALETTE[shades[i]];
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BRICKS.W, BRICKS.H, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    if (!low) gl.generateMipmap(gl.TEXTURE_2D);
    screen.dirty = false;
  };
  const drawGameBoys = (list, projection, view, screens = true) => {
    drawingFigure = true;
    try {
      for (const { model, plug, tier = 0 } of list) {
        for (const part of deviceParts[tier]) draw(part.mesh, model, part.color);
        if (plug) { const at = chain(model, plugShift[tier]); for (const part of plugParts) draw(part.mesh, at, part.color); }
      }
    } finally { drawingFigure = false; }
    flush();
    if (!screens) return;
    gl.useProgram(screenProgram);
    gl.uniformMatrix4fv(screenUniforms.projection, false, projection);
    gl.uniformMatrix4fv(screenUniforms.view, false, view);
    gl.activeTexture(gl.TEXTURE0);
    for (const { model, screen, tier = 0 } of list) {
      if (!screenInView(viewProjection, model, DEVICES[tier].lcd, lodEye)) continue;
      upload(screen);
      gl.bindTexture(gl.TEXTURE_2D, screen.texture);
      gl.uniformMatrix4fv(screenUniforms.model, false, model);
      gl.bindVertexArray(screenQuads[tier]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.useProgram(program);
  };
  const drawRack = (time, list) => {
    const dt = lastRackTime === undefined ? 0 : Math.min(Math.max(time - lastRackTime, 0), 0.25);
    lastRackTime = time;
    if (BRICKS.step(remoteScreen.game, dt)) remoteScreen.dirty = true;
    if (pinballStep(remotePinball.game, dt, {})) remotePinball.dirty = true;
    if (microIdle(remoteMicro.game, dt)) remoteMicro.dirty = true;
    if (world.sink <= 2.6) {
      const down = m4.translate(0, -world.sink, 0);
      for (const st of practice) {
        if (st.tier === 1) { drawingFigure = true; try { for (const part of colorRackParts) draw(part.mesh, chain(down, st.rack), part.color); } finally { drawingFigure = false; } }
        else for (const part of rackParts) draw(part.mesh, chain(down, st.rack), part.color);
        if (st.taken) continue;
        if (anyStep(st.screen.game, dt)) st.screen.dirty = true;
        list.push({ model: chain(down, st.model), screen: st.screen, tier: st.tier });
      }
    }
    if (world.sink > 2.6) return;
    const lift = m4.translate(0, -world.sink, 0);
    for (const part of rackParts) draw(part.mesh, chain(lift, rackModel), part.color);
    for (const gb of gameBoys) {
      if (gb.taken) continue;
      if (BRICKS.step(gb.screen.game, dt)) gb.screen.dirty = true;
      box(chain(lift, gb.cord), BLACK);
      list.push({ model: chain(lift, gb.model), screen: gb.screen });
    }
    canvas.dataset.bricks = gameBoys.map(gb => `${gb.taken ? "taken" : gb.screen.game.phase}:${gb.screen.game.pieces}`).join(",");
  };
  const drawStands = (time, list) => {
    if (world.rise[1] <= 0) return;
    const dt = Math.min(Math.max(time - (lastStandTime ?? time), 0), 0.25);
    lastStandTime = time;
    const lift = sinkBy(world.rise[1], 1), up = m4.translate(0, lift, 0);
    for (const part of rackParts) draw(part.mesh, chain(up, stands.find(st => st.tier === 2).rack), part.color);
    drawingFigure = true;
    try { for (const part of colorRackParts) draw(part.mesh, chain(up, stands.find(st => st.tier === 1).rack), part.color); } finally { drawingFigure = false; }
    for (const st of stands) {
      if (st.taken) continue;
      if (anyStep(st.screen.game, dt)) st.screen.dirty = true;
      list.push({ model: chain(up, st.model), screen: st.screen, tier: st.tier });
    }
    for (const d of dropped) {
      if (anyStep(d.screen.game, dt)) d.screen.dirty = true;
      if (d.screen.game.events) d.screen.game.events.length = 0;
      list.push(d);
    }
  };
  let lastStandTime;
  const dropped = [];
  const CABLE = [0.18, 0.18, 0.2, 1], PLUG = [0.6, 0.6, 0.62, 1], CABLE_STRIDE = low ? 2 : 1, cableModel = new Float32Array(16);
  cableModel[15] = 1;
  const drawRope = rope => {
    const { pos, n } = rope, w = 0.012;
    for (let i = 0; i < n - 1; i += CABLE_STRIDE) {
      const j = Math.min(i + CABLE_STRIDE, n - 1), ax = pos[i * 3], ay = pos[i * 3 + 1], az = pos[i * 3 + 2];
      const dx = pos[j * 3] - ax, dy = pos[j * 3 + 1] - ay, dz = pos[j * 3 + 2] - az, len = Math.hypot(dx, dy, dz);
      if (len < 1e-4) continue;
      const yx = dx / len, yy = dy / len, yz = dz / len;
      let xx = 1 - yx * yx, xy = -yx * yy, xz = -yx * yz;
      if (Math.hypot(xx, xy, xz) < 1e-3) { xx = -yz * yx; xy = -yz * yy; xz = 1 - yz * yz; }
      const xl = Math.hypot(xx, xy, xz);
      xx /= xl; xy /= xl; xz /= xl;
      const m = cableModel;
      m[0] = xx * w; m[1] = xy * w; m[2] = xz * w;
      m[4] = dx; m[5] = dy; m[6] = dz;
      m[8] = (xy * yz - xz * yy) * w; m[9] = (xz * yx - xx * yz) * w; m[10] = (xx * yy - xy * yx) * w;
      m[12] = ax + dx / 2; m[13] = ay + dy / 2; m[14] = az + dz / 2;
      draw(tube, m, CABLE);
    }
    for (const [end, next, cap] of [[0, 1, rope.caps[0]], [n - 1, n - 2, rope.caps[1]]]) {
      if (!cap) continue;
      const a = [pos[end * 3], pos[end * 3 + 1], pos[end * 3 + 2]], b = [pos[next * 3], pos[next * 3 + 1], pos[next * 3 + 2]];
      if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 1e-4) continue;
      const dir = norm(sub(b, a));
      box(segment(add(a, dir, -0.005), add(a, dir, 0.03), 0.017, 0.017), PLUG);
    }
  };

  return {
    retainScreens,
    forgetPlayer(id) { fingerTips.delete(id); gazes.delete(id); },
    limbGap: () => limbGap,
    gbGap: () => gbGap,
    faceDistance: () => faceDistance,
    screenDistance: () => screenDistance,
    fit: () => gbFit,
    selfGameBoy: () => selfGbModel,
    setHeldTier(fn) { heldTier = fn; },
    songSources: tier => [...(tier === 0 ? gameBoys.filter(gb => !gb.taken).map(gb => [...gb.centre, Math.max(0, 1 - world.sink / RACK_SINK)]) : stands.filter(st => st.tier === tier && !st.taken && world.rise[1] > 0).map(st => [...st.centre, 1])), ...practice.filter(st => st.tier === tier && !st.taken).map(st => [...st.centre, 1]), ...dropped.filter(d => d.tier === tier).map(d => [d.model[12], d.model[13], d.model[14], 1])].filter(at => at[3] > 0),
    kiosk: () => [...gameBoys.map((gb, index) => ({ index, centre: gb.centre, taken: gb.taken, tier: 0 })), ...stands.map((st, n) => ({ index: gameBoys.length + n, centre: st.centre, taken: st.taken, tier: st.tier })), ...practice.map((st, n) => ({ index: gameBoys.length + stands.length + n, centre: st.centre, taken: st.taken, tier: st.tier, practice: true }))],
    take(index) { const gb = index < gameBoys.length ? gameBoys[index] : index < gameBoys.length + stands.length ? stands[index - gameBoys.length] : practice[index - gameBoys.length - stands.length]; gb.taken = true; this.pickUpDropped(gb.screen); return gb.screen; },
    addPractice, practiceBoxes,
    drop(tier, x, z, yaw, screen) {
      this.pickUpDropped(screen);
      const device = DEVICES[tier];
      const model = chain(m4.translate(x, device.case[2] / 1000 + 0.004, z), m4.rotateY(yaw), m4.rotateX(-Math.PI / 2), m4.scale(0.001, 0.001, 0.001), m4.translate(-device.centre[0], -device.centre[1], 0));
      dropped.push({ model, screen, tier, at: performance.now() });
    },
    remoteScreen, remoteScreenFor: tier => (tier === 1 ? remotePinball : tier === 2 ? remoteMicro : remoteScreen),
    newScreen() { const screen = newScreen(demo(9)); transientScreens.add(screen); return screen; },
    refillGameBoys() { gameBoys.forEach((gb, n) => { if (gb.taken) { gb.taken = false; transientScreens.add(gb.screen); gb.screen = newScreen(demo(n)); } }); },
    release(index) { const st = index < gameBoys.length + stands.length ? stands[index - gameBoys.length] : practice[index - gameBoys.length - stands.length]; if (st) { st.taken = false; st.screen.game.mode = "demo"; } },
    pickUpDropped(screen) { const i = dropped.findIndex(d => d.screen === screen); if (i >= 0) dropped.splice(i, 1); },
    setWorld(next) { Object.assign(world, next); },
    world: () => world,
    resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, low ? 1 : 2);
      const w = Math.round(canvas.clientWidth * ratio), hh = Math.round(canvas.clientHeight * ratio);
      if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    frame(camera, characters, scene = {}) {
      const fogFor = t => (t >= 0 ? TIER_FOG[t] : FOG_COLOR), k = world.progress, fromFog = fogFor(world.tierFrom), toFog = fogFor(world.tierTo);
      const sky = fromFog.map((v, n) => v + (toFog[n] - v) * k);
      gl.clearColor(sky[0], sky[1], sky[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const active = world.infect[3] >= INFECT_FULL ? full : world.infect[3] > 0 ? infecting : plain;
      program = active.prog; uniforms = active.locations;
      gl.useProgram(program);
      if (uniforms.infect) gl.uniform4fv(uniforms.infect, world.infect);
      gl.uniform1i(uniforms.tierFrom, world.tierFrom); gl.uniform1i(uniforms.tierTo, world.tierTo);
      gl.uniform3fv(uniforms.fogColor, sky);
      gl.useProgram(screenProgram); gl.uniform3fv(screenUniforms.fogColor, sky); gl.useProgram(program);
      const aspect = canvas.width / Math.max(1, canvas.height);
      faceDistance = gbFaceDistance(FOV, aspect, DEVICES[heldTier()]);
      const projection = m4.perspective(FOV, aspect, 0.02, 1200), view = m4.lookAt(camera.eye, camera.target, [0, 1, 0]);
      viewProjection = m4.multiply(projection, view);
      lodEye = camera.eye; lodScale = canvas.height / (2 * Math.tan(FOV / 2));
      gl.uniformMatrix4fv(uniforms.projection, false, projection);
      gl.uniformMatrix4fv(uniforms.view, false, view);
      const identity = m4.identity();
      drawGrid(room[0], identity, [0.955, 0.96, 0.97, 1]);
      for (let n = 1; n < room.length; n++) drawGrid(room[n], identity, [0.975, 0.978, 0.985, 1]);
      drawPillars();
      drawMirror();
      drawPinballs();
      const list = [];
      held.length = 0;
      drawRack(camera.time, list);
      drawStands(camera.time, list);
      selfGbModel = null;
      const ghosts = characters.filter(c => c.ghost);
      for (const c of characters) { c.port = null; if (!c.ghost) drawCharacter(c); }
      scene.afterCharacters?.();
      for (const rope of scene.ropes || []) drawRope(rope);
      if (scene.plugs?.length) {
        drawingFigure = true;
        try { for (const model of scene.plugs) for (const part of plugParts) draw(part.mesh, model, part.color); } finally { drawingFigure = false; }
      }
      drawGameBoys([...list, ...held], projection, view);
      if (ghosts.length) {
        held.length = 0;
        gl.colorMask(false, false, false, false);
        for (const c of ghosts) drawCharacter(c);
        drawGameBoys(held, projection, view, false);
        held.length = 0;
        gl.colorMask(true, true, true, true);
        gl.depthFunc(gl.LEQUAL); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        ghostAlpha = GHOST_ALPHA;
        for (const c of ghosts) { const dt = c.dt; c.dt = 1e-9; drawCharacter(c); c.dt = dt; }
        drawGameBoys(held, projection, view, false);
        ghostAlpha = 1;
        gl.disable(gl.BLEND); gl.depthFunc(gl.LESS);
      }
      return viewProjection;
    },
  };
}

function colorFor(id) {
  const hue = (id * 137.508) % 360;
  const rgb = (l, s = 0.55) => {
    const k = n => (n + hue / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0), f(8), f(4), 1];
  };
  return { body: rgb(0.5), dark: rgb(0.32), light: rgb(0.78, 0.7), skin: [0.93, 0.8, 0.68, 1] };
}

let wasm;
try {
  const response = await fetch(new URL("./ld60.wasm", import.meta.url));
  if (!response.ok) throw new Error(`Game download failed (${response.status})`);
  const { instance } = await WebAssembly.instantiateStreaming(response, {});
  wasm = instance.exports;
  for (const name of ["game_join", "game_look", "game_step", "game_toggle_stance", "game_stance", "game_set_holding", "game_set_buttons", "game_set_solid", "game_rider", "game_riders_clear", "game_carry", "game_glue", "game_solid_at", "game_tether", "game_set_world", "net_latest", "net_predicted", "net_anchor", "net_walking", "cells_clear", "cells_push", "game_set_ko", "game_place", "game_set_speaking", "game_publish", "net_pack_pose",
    "net_apply_state", "net_remove", "state_ptr", "state_len", "io_ptr", "io_len", "room_half", "eye_height", "max_players"]) {
    if (typeof wasm[name] !== "function") throw new Error(`Missing game export: ${name}`);
  }
  const params = new URLSearchParams(location.search);
  const softwareGL = (() => {
    const test = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!test) return true;
    const info = test.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(test.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : test.RENDERER));
    test.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
  })();
  const lowEnd = (() => {
    const phone = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) <= 600;
    const cores = navigator.hardwareConcurrency || 0, memory = navigator.deviceMemory || 0;
    return phone || (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4) || softwareGL;
  })();
  const quality = ["low", "high"].includes(params.get("quality")) ? params.get("quality") : lowEnd ? "low" : "high";
  canvas.dataset.quality = quality;
  const antialias = params.has("aa") ? params.get("aa") === "1" : quality === "high" && !softwareGL;
  canvas.dataset.antialias = String(antialias);
  const gl = canvas.getContext("webgl2", { antialias, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
  if (!gl) throw new Error("WebGL2 is unavailable");
  start(gl, quality);
} catch (error) {
  say("The game could not load. Reload to try again.");
  console.error(error);
}

function start(gl, quality = "high") {
  const renderer = createRenderer(gl, quality);
  let state = new Float32Array(wasm.memory.buffer, wasm.state_ptr(), wasm.state_len());
  let io = new Uint8Array(wasm.memory.buffer, wasm.io_ptr(), wasm.io_len());
  const refreshViews = () => {
    if (state.buffer === wasm.memory.buffer) return;
    state = new Float32Array(wasm.memory.buffer, wasm.state_ptr(), wasm.state_len());
    io = new Uint8Array(wasm.memory.buffer, wasm.io_ptr(), wasm.io_len());
  };
  const maxSlots = wasm.max_players();
  colliders = { room: wasm.room_half(), well: wasm.well_z(), boxes: worldBoxes(1, wasm.well_z(), wasm.rack_half_x(), wasm.rack_half_z()) };
  const keys = new Set();
  const movement = { KeyW: [1, 0], ArrowUp: [1, 0], KeyS: [-1, 0], ArrowDown: [-1, 0], KeyA: [0, -1], ArrowLeft: [0, -1], KeyD: [0, 1], ArrowRight: [0, 1] };
  let jumpQueued = false, joined = false;
  const stickInput = { forward: 0, strafe: 0 };
  const net = createNetwork();
  const voice = createVoice();
  wasm.game_join(0);

  canvas.addEventListener("keydown", event => {
    if (movement[event.code]) { keys.add(event.code); event.preventDefault(); }
    else if (event.code === "Space") { if (!playing) { jumpQueued = true; jumpedAt = performance.now(); glue = null; } event.preventDefault(); }
    else if (/^Digit[1-6]$/.test(event.code) && event.ctrlKey && event.altKey) { if (!event.repeat) teleportTo(Number(event.code.slice(5)) - 1, true); event.preventDefault(); }
    else if (event.code === "Equal" && event.ctrlKey && event.altKey) { if (!event.repeat) addCube(true); event.preventDefault(); }
    else if (event.code === "KeyM") voice.toggleMute();
    else if (event.code === "KeyE") { if (!event.repeat) useAction(); event.preventDefault(); }
    else if (event.code === "KeyF") { if (net.partnered() && dialog.kind() !== "menu") reel.held = true; else if (!event.repeat) linkAction(); event.preventDefault(); }
    else if (event.code === "KeyX") { if (!event.repeat && !cancelAction()) toggleVoip(); }
    else if (event.code === "KeyC") { if (playing && !event.repeat) tap("start"); event.preventDefault(); }
    else if (event.code === "KeyZ") { if (playing && !event.repeat) tap("select"); event.preventDefault(); }
    else if ((event.code === "Enter" || event.code === "NumpadEnter") && joined) { openChat(); event.preventDefault(); }
  });
  const openChat = () => { keys.clear(); chatForm.hidden = false; chatLine.focus(); };
  const closeChat = () => { chatLine.value = ""; chatForm.hidden = true; };
  chatForm.addEventListener("submit", event => {
    event.preventDefault();
    const text = chatLine.value.trim();
    if (text) net.chat(text);
    closeChat();
    canvas.focus();
  });
  chatLine.addEventListener("keydown", event => { if (event.key === "Escape") { closeChat(); canvas.focus(); } });
  chatLine.addEventListener("blur", () => { if (!chatLine.value.trim()) closeChat(); });
  const touchActions = { act: null, act2: null };
  actButton.addEventListener("click", () => { touchActions.act?.(); canvas.focus(); });
  pickupBanner.addEventListener("click", event => { event.stopPropagation(); if (nearKiosk >= 0) useAction(); canvas.focus(); });
  act2Button.addEventListener("click", () => { touchActions.act2?.(); canvas.focus(); });
  cancelButton.addEventListener("click", () => { cancelAction(); canvas.focus(); });
  lowerButton.addEventListener("click", () => { if (playing) setPlaying(false); canvas.focus(); });
  chatOpen.addEventListener("click", () => { if (joined) openChat(); });
  window.addEventListener("keyup", event => { keys.delete(event.code); if (event.code === "KeyF") reel.held = false; if (event.code === "KeyC") pad.start = false; if (event.code === "KeyZ") pad.select = false; });
  tugButton.addEventListener("pointerdown", event => { event.preventDefault(); tugButton.setPointerCapture(event.pointerId); reel.held = true; tugButton.classList.add("held"); });
  for (const type of POINTER_END) tugButton.addEventListener(type, () => { reel.held = false; tugButton.classList.remove("held"); });
  tugButton.addEventListener("contextmenu", event => event.preventDefault());
  const clearInput = () => { keys.clear(); stickInput.forward = stickInput.strafe = 0; reel.held = false; tugButton.classList.remove("held"); };
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", clearInput);
  canvas.addEventListener("click", () => {
    canvas.focus();
    if (!joinForm.hidden || coarsePointer.matches) return;
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
  });
  const coarsePointer = matchMedia("(pointer: coarse)");
  const LOOK = 0.0022;
  canvas.addEventListener("mousemove", event => {
    if (document.pointerLockElement === canvas && !playing && !rails) wasm.game_look(-event.movementX * LOOK, -event.movementY * LOOK);
  });
  const buttons = { a: false, b: false };
  canvas.addEventListener("mousedown", event => {
    if (!playing || document.pointerLockElement !== canvas) return;
    if (event.button === 0) buttons.b = true;
    if (event.button === 2) buttons.a = true;
    event.preventDefault();
  });
  window.addEventListener("mouseup", event => { if (event.button === 0) buttons.b = false; if (event.button === 2) buttons.a = false; });
  canvas.addEventListener("contextmenu", event => event.preventDefault());
  const lookTouches = new Map();
  canvas.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse") return;
    canvas.setPointerCapture(event.pointerId);
    lookTouches.set(event.pointerId, [event.clientX, event.clientY]);
  });
  canvas.addEventListener("pointermove", event => {
    const last = lookTouches.get(event.pointerId);
    if (!last) return;
    if (!playing && !rails) wasm.game_look(-(event.clientX - last[0]) * 0.006, -(event.clientY - last[1]) * 0.006);
    lookTouches.set(event.pointerId, [event.clientX, event.clientY]);
  });
  for (const name of POINTER_END) canvas.addEventListener(name, event => lookTouches.delete(event.pointerId));
  let stickPointer = null, stickOrigin = null;
  stick.addEventListener("pointerdown", event => {
    stick.setPointerCapture(event.pointerId); stickPointer = event.pointerId; stickOrigin = [event.clientX, event.clientY];
  });
  stick.addEventListener("pointermove", event => {
    if (event.pointerId !== stickPointer) return;
    const dx = Math.max(-45, Math.min(45, event.clientX - stickOrigin[0])), dy = Math.max(-45, Math.min(45, event.clientY - stickOrigin[1]));
    knob.style.setProperty("--kx", dx + "px"); knob.style.setProperty("--ky", dy + "px");
    stickInput.strafe = dx / 45; stickInput.forward = -dy / 45;
  });
  for (const name of POINTER_END) stick.addEventListener(name, event => {
    if (event.pointerId !== stickPointer) return;
    stickPointer = null; stickInput.forward = stickInput.strafe = 0;
    knob.style.setProperty("--kx", "0px"); knob.style.setProperty("--ky", "0px");
  });
  jumpButton.addEventListener("pointerdown", event => { event.preventDefault(); jumpQueued = true; jumpedAt = performance.now(); glue = null; });
  crouchButton.addEventListener("pointerdown", event => { event.preventDefault(); wasm.game_toggle_stance(1); });
  proneButton.addEventListener("pointerdown", event => { event.preventDefault(); wasm.game_toggle_stance(2); });
  const pad = { left: false, right: false, up: false, down: false, a: false, b: false, select: false, start: false };
  const tapped = Object.fromEntries(Object.keys(pad).map(k => [k, 0])), releasing = { ...pad };
  const tap = name => { pad[name] = true; tapped[name] = Math.min(2, tapped[name] + 1); };
  for (const button of touchPad.querySelectorAll("[data-pad]")) {
    const name = button.dataset.pad;
    button.addEventListener("pointerdown", event => { event.preventDefault(); button.setPointerCapture(event.pointerId); tap(name); });
    for (const type of POINTER_END) button.addEventListener(type, () => { pad[name] = false; });
  }
  const clearPad = () => { for (const name of Object.keys(pad)) { pad[name] = false; tapped[name] = 0; releasing[name] = false; } };
  window.addEventListener("blur", clearPad);
  if (coarsePointer.matches) touchPad.hidden = false;

  muteButton.addEventListener("click", () => { voice.toggleMute(); canvas.focus(); });
  const voipButton = $("#voip"), voipMode = voipButton.querySelector(".voip-mode");
  const VOIP_MODES = ["none", "partner", "lobby"];
  const VOIP_TEXT = { none: ["no voip", "Hearing: nobody (X for your partner only)"], partner: ["partner", "Hearing: your partner only (X for everyone near you)"], lobby: ["lobby", "Hearing: everyone near you (X for nobody)"] };
  const showVoip = mode => {
    voipMode.textContent = VOIP_TEXT[mode][0];
    voipButton.dataset.mode = mode; voipButton.setAttribute("aria-label", VOIP_TEXT[mode][1]);
    canvas.dataset.voip = mode;
  };
  const toggleVoip = () => {
    const mode = VOIP_MODES[(VOIP_MODES.indexOf(voice.mode()) + 1) % VOIP_MODES.length];
    voice.setMode(mode); showVoip(mode);
  };
  showVoip(voice.mode());
  voipButton.addEventListener("click", () => { toggleVoip(); canvas.focus(); });

  const speech = new Map();
  const bubbleLife = text => 4000 + Math.min(text.length, 200) * 60;
  let echoUntil = 0, noticeUntil = 0;
  const showBubble = (id, name, text) => {
    const now = performance.now();
    if (id === net.myId()) {
      echo.replaceChildren(Object.assign(document.createElement("b"), { textContent: "You: " }), document.createTextNode(text));
      echo.hidden = false; echoUntil = now + bubbleLife(text);
      return;
    }
    let entry = speech.get(id);
    if (!entry) {
      entry = { element: document.createElement("div"), until: 0 };
      entry.element.className = "bubble"; entry.element.dataset.id = String(id);
      bubbles.append(entry.element); speech.set(id, entry);
    }
    entry.element.replaceChildren(Object.assign(document.createElement("b"), { textContent: name + ": " }), document.createTextNode(text));
    entry.until = now + bubbleLife(text);
  };
  const dropBubble = id => { speech.get(id)?.element.remove(); speech.delete(id); };
  const showNotice = text => { notice.textContent = text; notice.hidden = false; noticeUntil = performance.now() + 5000; };
  const placeBubbles = (now, viewProjection, positions) => {
    if (echoUntil && now > echoUntil) { echo.hidden = true; echoUntil = 0; }
    if (noticeUntil && now > noticeUntil) { notice.hidden = true; noticeUntil = 0; }
    const w = canvas.clientWidth, h = canvas.clientHeight, m = viewProjection;
    for (const [id, entry] of speech) {
      const at = positions.get(id);
      if (now > entry.until || !at) { if (now > entry.until) dropBubble(id); else entry.element.hidden = true; continue; }
      const [x, y, z, distance] = at;
      const [fx, fy, cw] = project(m, x, y, z);
      if (cw <= 0.1 || distance > BUBBLE_RANGE) { entry.element.hidden = true; continue; }
      const sx = fx * w, sy = fy * h;
      const scale = Math.max(0.6, Math.min(1, 4 / Math.max(distance, 0.001)));
      entry.element.hidden = false;
      entry.element.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    }
  };

  let holding = null, playing = false, playWeight = 0, aim = null, nearKiosk = -1, simTime = 0, ropeQuietUntil = 0;
  let traceBuf = null, partnerShift = [0, 0, 0];
  const cost = { rope: 0, frame: 0, ropeMs: 0, frameMs: 0, steps: 0 };
  const reel = { held: false, heldUntil: 0, length: LINK_LENGTH, partner: null, sentAt: 0, sentFull: true };
  let partnerTier = 0, morph = null, worldTier = -1;
  const creditEl = $("#credit"), creditLink = $("#credit a"), escHint = $("#esc-hint"), credit = { want: "", shown: "", since: 0 };
  let runStart = 0, finished = null; const timerEl = $("#timer"), boardEl = $("#board");
  const clock = t => { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = t % 60; return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${sec.toFixed(2).padStart(5, "0")}`; };
  const finishRun = (now, claim = true) => {
    finished = { t: (now - runStart) / 1000, sentAt: now, tries: 1, answered: false };
    timerEl.textContent = clock(finished.t);
    const r = timerEl.getBoundingClientRect();
    timerEl.style.transform = `translate(${innerWidth / 2 - (r.left + r.width / 2)}px, ${innerHeight * 0.28 - (r.top + r.height / 2)}px) scale(3)`;
    timerEl.classList.add("finished");
    voice.play("clear");
    if (claim) net.sendJson({ t: "finish" });
  };
  const showBoard = result => {
    if (!finished && runStart) finishRun(performance.now(), false);
    if (!finished) return;
    finished.answered = true;
    if (Number.isFinite(result.seconds)) { finished.t = result.seconds; timerEl.textContent = clock(result.seconds); }
    const list = boardEl.querySelector("ol"); list.replaceChildren();
    const row = (e, mine) => { const li = document.createElement("li"); if (mine) li.className = "mine";
      for (const [cls, text] of [["rank", `#${e.rank}`], ["time", clock(e.seconds)], ["names", e.names]]) { const span = document.createElement("span"); span.className = cls; span.textContent = text; li.append(span); }
      list.append(li); };
    const entry = result.entry;
    for (const e of result.top || []) row(e, entry && e.rank === entry.rank && e.names === entry.names);
    if (entry && entry.rank > 10) row(entry, true);
    boardEl.querySelector("p").textContent = result.top ? "" : "The leaderboard is unavailable right now; your time stands.";
    boardEl.hidden = false;
  };
  const clearFinish = () => { finished = null; timerEl.classList.remove("finished"); timerEl.style.transform = ""; boardEl.hidden = true; };
  let clickBits = 0, summitTune = false, stage2Tune = false;
  const STEP_LENGTH = 0.7, lastStep = { walked: 0, air: 0, grounded: true };
  const MORPH_SECONDS = 0.8, DEMOTE_CELLS = 10, DEMOTE_SECONDS = 0.4;
  let belowSince = 0;
  renderer.setHeldTier(() => holding?.tier || 0);
  let heldCable = null;
  let rails = null;
  const stanceRopes = new Map();
  const REQUEST_TTL_MS = 30000;
  const RAILS_DISTANCE = 1.3;
  const nowSeconds = () => performance.now() / 1000;
  const dialog = (() => {
    const W = BRICKS.W, H = BRICKS.H, COLS = 18, TEXT_X = 8, TEXT_Y = 102, MENU_X = 80, ITEM_H = 16;
    const SHADES = [[155, 188, 15], [139, 172, 15], [48, 98, 48], [15, 56, 15]];
    const ctx = linkupLcd.getContext("2d"), image = ctx.createImageData(W, H), rgba = new Uint32Array(image.data.buffer);
    const palette = SHADES.map(([r, g, b]) => (255 << 24 | b << 16 | g << 8 | r) >>> 0);
    const px = new Uint8Array(W * H);
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    let timer = 0, raf = 0, shown = 0, current = null;
    const wrap = lines => lines.flatMap(line => {
      const out = []; let row = "";
      for (const word of line.toUpperCase().split(/\s+/)) {
        if (!word) continue;
        if (row && row.length + 1 + word.length > COLS) { out.push(row); row = word; }
        else row = row ? row + " " + word : word;
      }
      if (row) out.push(row);
      return out;
    });
    const handheld = (x, y, link) => {
      BRICKS.fill(px, x, y, x + 22, y + 36, 3); BRICKS.fill(px, x + 1, y + 1, x + 21, y + 35, 0);
      BRICKS.fill(px, x + 4, y + 4, x + 18, y + 16, link ? 1 : 2);
      BRICKS.fill(px, x + 4, y + 22, x + 9, y + 27, 3); BRICKS.fill(px, x + 13, y + 24, x + 15, y + 26, 3); BRICKS.fill(px, x + 16, y + 21, x + 18, y + 23, 3);
    };
    const draw = now => {
      const d = current;
      if (!d) return;
      px.fill(0);
      const linked = d.state === "linked";
      handheld(20, 42, linked); handheld(118, 42, linked);
      const y = 52, phase = still.matches ? 0 : Math.floor(now / 90) % 8;
      for (let x = 42; x < 118; x++) {
        const on = d.state === "calling" ? ((x + phase) % 8) < 5 : d.state !== "off";
        if (on) { px[y * W + x] = 3; px[(y + 1) * W + x] = 3; }
      }
      if (d.state === "off") BRICKS.text(px, "X", 76, 46);
      BRICKS.frame(px, 0, 96, W, H);
      const elapsed = (now - shown) / 1000, budget = still.matches ? Infinity : Math.floor(elapsed * 40);
      let left = budget, done = true;
      d.lines.forEach((line, n) => {
        const part = line.slice(0, Math.max(0, left)); left -= line.length;
        if (part.length < line.length) done = false;
        BRICKS.text(px, part, TEXT_X, TEXT_Y + n * 14);
      });
      if (done && (still.matches || Math.floor(now / 500) % 2 === 0)) BRICKS.text(px, "▼", W - 16, H - 12);
      if (d.items.length) {
        BRICKS.frame(px, MENU_X, 0, W, 8 + d.items.length * ITEM_H);
        d.items.forEach(([label, , key], n) => {
          const ty = 6 + n * ITEM_H;
          BRICKS.text(px, (n === 0 ? "►" : " ") + label, MENU_X + 4, ty);
          if (key && !coarsePointer.matches && label.length <= 6) BRICKS.text(px, key, W - 12, ty);
        });
      }
      for (let i = 0; i < px.length; i++) rgba[i] = palette[px[i]];
      ctx.putImageData(image, 0, 0);
      raf = (still.matches && done) ? 0 : requestAnimationFrame(draw);
    };
    const plate = linkup.querySelector(".plate"), lcdBox = linkup.querySelector(".lcd");
    const layout = () => {
      const width = plate.clientWidth;
      if (!width) return;
      const height = Math.round(width * 56 / 72), w = Math.round(width * 47 / 72), h = Math.round(w * 144 / 160);
      plate.style.height = `${height}px`;
      lcdBox.style.left = `${Math.round(width * 12.5 / 72)}px`; lcdBox.style.top = `${height - Math.round(width * 6 / 72) - h}px`;
      lcdBox.style.width = `${w}px`; lcdBox.style.height = `${h}px`;
      linkupLcd.style.width = `${w}px`; linkupLcd.style.height = `${h}px`;
    };
    window.addEventListener("resize", () => { if (!linkup.hidden) layout(); });
    const hide = () => { linkup.hidden = true; clearTimeout(timer); timer = 0; cancelAnimationFrame(raf); raf = 0; current = null; };
    const show = (title, lines, items, { ttl = 0, state = "plain", kind = "" } = {}) => {
      linkupTitle.textContent = title;
      linkupText.replaceChildren(...lines.map(text => Object.assign(document.createElement("p"), { textContent: text })));
      linkupButtons.replaceChildren(...items.map(([label, action, key], n) => {
        const button = document.createElement("button");
        button.type = "button"; button.textContent = label;
        button.setAttribute("aria-label", key && !coarsePointer.matches ? `${label} (${key})` : label);
        button.style.top = `${(4 + n * ITEM_H) / H * 100}%`; button.style.height = `${ITEM_H / H * 100}%`;
        button.addEventListener("click", () => { action(); canvas.focus(); });
        return button;
      }));
      current = { lines: wrap(lines).slice(0, 3), items, state, kind };
      shown = performance.now();
      linkup.hidden = false;
      layout();
      clearTimeout(timer); timer = ttl ? setTimeout(hide, ttl) : 0;
      cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
    };
    return { show, hide, visible: () => !linkup.hidden, kind: () => (linkup.hidden ? "" : current?.kind || "") };
  })();
  const endRails = () => { rails = null; dialog.hide(); };
  const PICKUP_RANGE = 1.4;
  const setPlaying = value => {
    playing = Boolean(value && holding);
    buttons.a = buttons.b = false;
    keys.clear(); clearPad();
    touchPad.classList.toggle("play", playing); document.body.classList.toggle("play", playing);
    wasm.game_set_holding(holding ? 1 : 0, playing ? 1 : 0);
  };
  const addCube = lead => {
    const p = holding?.game.p;
    if (p) { p.cubes = (p.cubes || 0) + 1; pinLast.state = ""; }
    if (lead && net.partnerId() >= 0) net.sendJson({ t: "signal", to: net.partnerId(), data: { cube: 1 } });
  };
  const teleportTo = (level, lead) => {
    if (!joined || level < 0 || level > MIRROR.LEVELS) return;
    const across = level === MIRROR.ACROSS + 1, y = level ? MIRROR.beamTop(level) : 0, x = !level ? 3 : across ? (lead ? -2 : 2) : 0, z = across ? 0 : lead ? -2 : 2;
    wasm.game_place(x, y + (level ? 0.05 : 0), z);
    riding.fill(false); glue = null;
    ropeQuietUntil = performance.now() + 3000;
    for (const link of links.all.values()) if (link.rope) link.rope = null;
    if (lead && net.partnerId() >= 0) net.sendJson({ t: "signal", to: net.partnerId(), data: { teleport: level } });
  };
  const pickUp = index => {
    const k = renderer.kiosk()[index];
    holding = renderer.take(index);
    holding.game.mode = "play";
    if (holding.game.kind === "pinball") PINBALL.openSelect(holding.game, true); else if (holding.game.kind === "micro") MICRO.reset(holding.game, undefined, false);
    holding.dirty = true; holding.tier = k.tier; holding.practice = Boolean(k.practice); holding.stand = index;
    holding.bricks = holding.game.kind === "pinball" ? BRICKS.create(0x1989 + Math.floor(Math.random() * 1e6)) : holding.game;
    heldStack.length = 0;
    wasm.game_set_holding(1, 0);
    if (k.tier > 0) setTier(k.tier, k.centre); else unlockTier(0);
  };
  const setTier = (tier, origin) => {
    if (!holding) return;
    const from = worldTier;
    holding.tier = tier;
    net.sendJson({ t: "signal", to: net.partnerId(), data: { tier, at: origin } });
    bleedTo(tier, origin);
    showNotice(tier > from ? `${DEVICES[tier].name}!` : `Back to the ${DEVICES[tier].name}.`);
    unlockTier(tier);
  };
  const heldStack = [];
  const unlocked = new Set();
  const practiceUp = () => (worldBits & 1) !== 0;
  const refreshBoxes = () => { colliders.boxes = [...worldBoxes(worldBits, colliders.well, wasm.rack_half_x(), wasm.rack_half_z()), ...(practiceUp() ? renderer.practiceBoxes() : [])]; };
  const pushPracticeCells = () => { if (practiceUp()) for (const [x, z, hx, hz, top] of renderer.practiceBoxes()) wasm.cells_push(x - hx, 0, z - hz, x + hx, top, z + hz); };
  const unlockTier = tier => {
    if (tier === 0 || unlocked.has(tier)) return;
    unlocked.add(tier);
    if (!renderer.addPractice(tier)) return;
    refreshBoxes();
    if (!cellsLive) { wasm.cells_clear(); pushPracticeCells(); }
    showNotice(`${DEVICES[tier].name} unlocked: a practice stand is set up on the floor.`);
  };
  const lastBalls = [null, null], riding = [false, false];
  let moving = []; const lastMoving = new Map(), ridingPieces = new Set();
  const upgrade = index => { morph = { start: performance.now(), tier: renderer.kiosk()[index].tier, done: false, index }; };
  const swapDevice = (tier, origin) => {
    if (!holding) return;
    const k = morph?.index >= 0 ? renderer.kiosk()[morph.index] : null;
    if ((k?.practice || (k && k.tier === 0 && holding.practice)) && tier !== holding.tier) {
      const old = holding, next = renderer.take(morph.index);
      renderer.drop(old.tier, state[1] + 0.5, state[3] + 0.3, state[4], old);
      if (old.practice) renderer.release(old.stand);
      heldStack.length = 0;
      next.game.mode = "play"; next.dirty = true;
      if (next.game.kind === "pinball") PINBALL.openSelect(next.game, true); else if (next.game.kind === "micro") MICRO.reset(next.game, undefined, false);
      holding = Object.assign(next, { tier, bricks: next.game.kind === "pinball" ? old.bricks : next.game, stand: morph.index, practice: true });
    } else if (tier > holding.tier && morph?.index >= 0) {
      if (tier === 1) renderer.refillGameBoys();
      const old = holding, next = renderer.take(morph.index);
      renderer.drop(old.tier, state[1] + 0.5, state[3] + 0.3, state[4], old);
      if (old.practice) renderer.release(old.stand);
      heldStack.push(old);
      next.game.mode = "play"; next.dirty = true;
      if (next.game.kind === "pinball") PINBALL.openSelect(next.game, true); else if (next.game.kind === "micro") MICRO.reset(next.game, undefined, false);
      holding = Object.assign(next, { tier, bricks: old.bricks, stand: morph.index, practice: false });
    } else if (tier < holding.tier) stepDown(tier);
    else holding.tier = tier;
    setTier(tier, origin);
  };
  const stepDown = tier => {
    if (!holding || holding.tier <= tier) return;
    const bricks = holding.bricks && holding.bricks.kind !== "pinball" ? holding.bricks : BRICKS.create(Math.floor(Math.random() * 2 ** 31));
    if (holding.stand >= 0 && holding.tier > 0) renderer.release(holding.stand);
    while (heldStack.length && (heldStack[heldStack.length - 1].tier || 0) > tier) {
      const passed = heldStack.pop();
      renderer.pickUpDropped(passed);
      if (passed.stand >= 0 && passed.tier > 0) renderer.release(passed.stand);
    }
    const back = heldStack.length && (heldStack[heldStack.length - 1].tier || 0) === tier ? heldStack.pop() : null;
    if (back) { renderer.pickUpDropped(back); holding = back; }
    else {
      heldStack.length = 0;
      const next = renderer.newScreen();
      next.game = tier === 0 ? bricks : tier === 2 ? MICRO.create(Math.floor(Math.random() * 1e6)) : PINBALL.openSelect(PINBALL.create(Math.floor(Math.random() * 1e6)), true);
      holding = Object.assign(next, { stand: -1 });
    }
    if (tier === 0 && holding.game.kind === "pinball") holding.game = bricks;
    holding.game.mode = "play"; holding.dirty = true;
    Object.assign(holding, { tier, bricks: tier === 0 ? holding.game : bricks, practice: false });
  };
  const demoteIfFallen = () => {
    const below = holding && holding.tier > 0 && !holding.practice && !morph && !riding.some(Boolean) && state[2] < MIRROR.beamTop(STAND_LEVEL[holding.tier]) - DEMOTE_CELLS * MIRROR.C;
    belowSince = below ? belowSince || performance.now() : 0;
    if (below && performance.now() - belowSince > DEMOTE_SECONDS * 1000) { belowSince = 0; morph = { start: performance.now(), tier: holding.tier - 1, done: false, index: -1 }; }
  };
  const useAction = () => {
    if (!joined) return;
    if (playing) { setPlaying(false); return; }
    if (holding && nearKiosk >= 0 && !morph && renderer.kiosk()[nearKiosk].tier !== holding.tier) { upgrade(nearKiosk); return; }
    if (holding) { setPlaying(true); return; }
    if (nearKiosk >= 0) { pickUp(nearKiosk); return; }
    if (aim) showNotice("Pick up a Game Boy from the stand first.");
  };
  const linkAction = () => {
    if (!joined || net.partnered()) return;
    if (playing) setPlaying(false);
    if (!holding) { showNotice("Pick up a Game Boy from the stand to link up."); return; }
    if (net.requestFrom() >= 0) { net.accept(); return; }
    if (net.pendingTo() >= 0) return;
    if (aim && aim.holding && !aim.partnered) {
      if (!heldCable) { heldCable = { start: nowSeconds(), rope: null }; net.cable(true); }
      net.propose(aim.id);
      rails = { id: aim.id, role: "caller", until: performance.now() + REQUEST_TTL_MS };
      dialog.show("LINK CABLE", ["Please wait...", `Connecting to ${net.nameOf(aim.id)}.`], [["CANCEL", cancelAction, "X"]], { state: "calling" });
      return;
    }
    if (aim && !aim.holding) { showNotice(`${net.nameOf(aim.id)} needs a Game Boy too.`); return; }
    if (heldCable) { heldCable = null; net.cable(false); }
    else { heldCable = { start: nowSeconds(), rope: null }; net.cable(true); }
  };
  const cancelAction = () => {
    if (!joined) return false;
    if (rails?.role === "asked" || (net.requestFrom() >= 0 && !net.partnered())) { net.decline(); endRails(); return true; }
    if (!net.partnered() && net.pendingTo() >= 0) { net.unpartner(); endRails(); return true; }
    if (heldCable && !net.partnered()) { heldCable = null; net.cable(false); return true; }
    if (dialog.visible()) { dialog.hide(); return true; }
    return false;
  };
  const disconnect = () => { if (net.partnered()) { net.unpartner(); endRails(); } dialog.hide(); };

  const updatePrompt = () => {
    let text = "", status = "", gameBoy = null, cable = null, cancel = "", connect = "";
    const partner = net.partnerId(), request = net.requestFrom(), pending = net.pendingTo();
    const play = ["Play", () => useAction()], pickUp = ["Pick up", () => useAction()], cableOut = ["Cable", () => linkAction()];
    if (playing) { text = "WASD D-pad · click B · right-click A · Z Select · C Start · E to lower"; }
    else if (holding && nearKiosk >= 0) { const k = renderer.kiosk()[nearKiosk]; text = `E to take the ${DEVICES[k.tier].name}`; gameBoy = [k.practice ? "Swap" : "Upgrade", () => useAction()]; }
    else if (partner >= 0) { text = `Linked with ${net.nameOf(partner)} · hold F to reel them in · E to play`; status = `Linked with ${net.nameOf(partner)}`; gameBoy = play; }
    else if (request >= 0) {
      text = holding ? `${net.nameOf(request)} wants to link · F to accept · X to decline` : `${net.nameOf(request)} wants to link · pick up a Game Boy first`;
      status = holding ? `${net.nameOf(request)} wants to connect` : `${net.nameOf(request)} wants to connect · get a Game Boy from the stand`;
      if (holding) cable = ["Accept", () => linkAction()]; else if (nearKiosk >= 0) gameBoy = pickUp;
      cancel = "Decline";
    }
    else if (pending >= 0) { text = `Calling ${net.nameOf(pending)} · X to cancel`; status = `Connecting to ${net.nameOf(pending)}…`; cancel = "Cancel the call"; }
    else if (aim && holding && aim.holding && !aim.partnered) { text = `F to link with ${net.nameOf(aim.id)}`; connect = `Connect ${net.nameOf(aim.id)}`; gameBoy = play; cable = [connect, () => linkAction()]; }
    else if (aim && holding && !aim.holding) { text = `${net.nameOf(aim.id)} has no Game Boy`; status = text; gameBoy = play; cable = cableOut; }
    else if (!holding && nearKiosk >= 0) { text = `E to pick up the ${DEVICES[renderer.kiosk()[nearKiosk].tier].name}`; gameBoy = pickUp; }
    else if (holding && heldCable) { text = "Link cable out · look at a player with a Game Boy and press F · X puts it away · E to play"; status = "Cable out · face someone to connect"; gameBoy = play; cable = ["Put away", () => linkAction()]; }
    else if (holding) { text = "F pulls out your link cable · E to play"; gameBoy = play; cable = cableOut; }
    if (coarsePointer.matches) text = status;
    if (prompt.textContent !== text) { prompt.textContent = text; prompt.hidden = !text; }
    if (connectPrompt.hidden === Boolean(connect)) connectPrompt.hidden = !connect;
    if (hintF.hidden === Boolean(holding)) hintF.hidden = !holding;
    if (hintE.hidden === Boolean(holding)) hintE.hidden = !holding;
    const fLabel = partner >= 0 ? "Tug" : "Plug";
    if (hintF.lastElementChild.textContent !== fLabel) hintF.lastElementChild.textContent = fLabel;
    const eLabel = holding && playing ? "Stop" : "Play";
    if (hintE.lastElementChild.textContent !== eLabel) { hintE.lastElementChild.textContent = eLabel; hintE.title = holding && playing ? "Lower the handheld" : "Raise the handheld to play"; }
    if (connect && connectPrompt.lastElementChild.textContent !== connect) connectPrompt.lastElementChild.textContent = connect;
    for (const [button, entry, slot] of [[actButton, gameBoy, "act"], [act2Button, cable, "act2"]]) {
      touchActions[slot] = entry ? entry[1] : null;
      if (button.hidden === Boolean(entry)) button.hidden = !entry;
      if (entry && button.textContent !== entry[0]) button.textContent = entry[0];
    }
    if (cancelButton.hidden === Boolean(cancel)) cancelButton.hidden = !cancel;
    const tug = coarsePointer.matches && partner >= 0 && !playing;
    if (tugButton.hidden === tug) tugButton.hidden = !tug;
    if (cancel && cancelButton.getAttribute("aria-label") !== cancel) { cancelButton.setAttribute("aria-label", cancel); cancelButton.title = cancel; }
  };
  const POCKET = 0.6, PLUG = 0.4, TOSS = 1.0, STANCE_LENGTH = 1.6;
  const STANCE_REST = STANCE_LENGTH / LINK_SEGMENTS, LINK_REST = LINK_LENGTH / LINK_SEGMENTS;
  const cableAnim = t => ({ pocket: t >= 0 && t < POCKET ? Math.sin(Math.PI * t / POCKET) : 0, plug: t >= POCKET && t < POCKET + PLUG ? Math.sin(Math.PI * (t - POCKET) / PLUG) : 0 });
  const plugOn = (id, seconds) => {
    const seated = start => seconds - start >= POCKET + PLUG * 0.5;
    for (const link of links.all.values()) {
      if (link.a === id) return !link.animated || seated(link.start);
      if (link.b === id) return !link.animated || Boolean(link.plugged);
    }
    if (id === net.myId()) return Boolean(heldCable) && seated(heldCable.start);
    const held = stanceRopes.get(id);
    return Boolean(held) && seated(held.start);
  };
  const links = (() => {
    const all = new Map();
    const key = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
    return {
      all,
      begin(initiator, other, elapsed = 0, rope = null) { all.set(key(initiator, other), { a: initiator, b: other, start: performance.now() / 1000 - elapsed, rope, animated: true }); },
      end(a, b) { all.delete(key(a, b)); },
      sync(pairs) {
        const live = new Set(pairs.map(([a, b]) => key(a, b)));
        for (const k of all.keys()) if (!live.has(k)) all.delete(k);
        for (const [a, b] of pairs) if (!all.has(key(a, b))) all.set(key(a, b), { a, b, start: -Infinity, rope: null, animated: false });
      },
    };
  })();

  nameInput.value = localStorage.getItem("ld60-name") || "";
  joinForm.hidden = false;
  enterButton.disabled = false;
  say("Ready. Enter a name to join the room.");
  joinForm.addEventListener("submit", async event => {
    event.preventDefault();
    enterButton.disabled = true;
    localStorage.setItem("ld60-name", nameInput.value.trim());
    try {
      if (micCheckbox.checked) await voice.enableMicrophone();
      else voice.ensureContext();
    } catch (error) {
      console.warn("microphone unavailable", error);
      say("Microphone unavailable; joining without voice. " + (error.message || ""));
    }
    net.connect(nameInput.value.trim());
    joinForm.hidden = true;
    chatBar.hidden = false;
    joined = true;
    canvas.focus();
  });

  const MIRROR_SEND_HZ = 10, MIRROR_FULL_MS = 2000, KO_SECONDS = 2.5;
  let cellsPushed = 0, ghost = null, mirrorSent = { checked: 0, key: "", full: 0, wellKey: "", sent: 0 }, cellsLive = false, lockedCells = [], koUntil = 0, koCount = 0, lastCloneKey = "";
  let probeWells = null;
  let squishSent = 0;
  const mirrorReceive = snap => {
    const rfAt = ghost && ghost.rf && snap.rf && ghost.rf.slice(2).join() === snap.rf.slice(2).join() ? ghost.rfAt : performance.now();
    ghost = { ...(ghost || {}), ...snap, at: performance.now(), rfAt };
    if (snap.w) ghost.well = MIRROR.parseWell(snap.w);
  };
  const emptyWell = Array.from({ length: MIRROR.ROWS }, () => new Array(MIRROR.COLS).fill(null));
  const sides = [0, 1].map(() => ({ well: null, version: -1, back: NaN, curtain: 0, key: null, cells: [] }));
  const forgetSides = () => sides.forEach(c => { c.well = null; c.key = null; });
  const readSide = (side, back, well, version, curtain) => {
    const c = sides[side];
    if (c.well === well && c.version === version && c.back === back && c.curtain === curtain) return false;
    c.well = well; c.version = version;
    const key = MIRROR.wellKey(well) + ":" + curtain;
    if (key === c.key && c.back === back) return false;
    c.key = key; c.back = back; c.curtain = curtain; c.cells = MIRROR.locked(side, back, well, curtain);
    return true;
  };
  const knockOut = byPartner => {
    koCount++; koUntil = performance.now() + KO_SECONDS * 1000;
    wasm.game_set_ko(1);
    setPlaying(false);
    if (holding && BRICKS.topOut(holding.bricks)) holding.dirty = true;
    if (!byPartner && net.partnerId() >= 0) net.sendJson({ t: "signal", to: net.partnerId(), data: { over: 1 } });
    showNotice("Squished! Game over for both.");
  };
  let partnerPin = null, pinSent = 0, pinInput = 0, pinLast = { bits: -1, state: "", table: "" }, pinMinDelay = Infinity;
  let partnerSim = null, partnerBits = 0;
  const PIN_MIN_GAP = 80, PIN_BEAT = 1000, PIN_ONE_WAY = 0.03;
  const pinPayload = (game, now) => {
    const p = game.p, b = p.ball;
    return { t: p.tableId, b: [b.x, b.y, b.vx, b.vy].map(v => Math.round(v * 100) / 100), s: game.scene === "play" ? b.state : "gone", h: b.state === "hole" ? b.hole : null, r: b.state === "ramp" && b.ramp ? [b.ramp.i, b.ramp.t] : null,
      f: p.fl.flatMap(f => [Math.round(f.a * 1000) / 1000, Math.round((f.w || 0) * 100) / 100]), i: pinInput, c: stairCode(p.cubes || 0), at: Math.round(now) };
  };
  const partnerInput = () => ({ left: Boolean(partnerBits & 1), b: false, right: Boolean(partnerBits & 2), a: false });
  const adoptPin = (d, now) => {
    if (!partnerSim || partnerSim.p?.tableId !== d.t) { partnerSim = PINBALL.create(1); PINBALL.startGame(partnerSim, d.t); partnerSim.events = []; }
    const p = partnerSim.p, b = p.ball;
    p.balls = 99;
    const T = p.T, hole = d.s === "hole" && d.h && T.holes[d.h] ? d.h : null, ramp = d.s === "ramp" && d.r && T.ramps[d.r[0]] ? { i: d.r[0], t: d.r[1] } : null;
    const state = (d.s === "hole" && !hole) || (d.s === "ramp" && !ramp) || !["play", "lane", "hole", "ramp", "gone"].includes(d.s) ? "play" : d.s;
    Object.assign(b, { x: d.b[0], y: d.b[1], vx: d.b[2], vy: d.b[3], state, ramp, hole, lock: 0 });
    d.f.forEach((v, k) => { const f = p.fl[k >> 1]; if (f) { if (k & 1) f.w = v; else f.a = v; } });
    p.cubes = d.c; partnerBits = d.i | 0;
    const gap = now - d.at; pinMinDelay = Math.min(pinMinDelay + 0.02, gap);
    const lag = Math.min(0.3, Math.max(0, (gap - pinMinDelay) / 1000) + PIN_ONE_WAY);
    PINBALL.step(partnerSim, lag, partnerInput()); partnerSim.events.length = 0;
  };
  const stairSeen = [0, 0], stairAt = [0, 0];
  const pinState = game => {
    const p = game.p, live = game.scene === "play";
    if (game.kind !== "pinball" || !p || !(live || (game.scene === "select" && game.resumable))) return null;
    return { table: p.tableId, ball: live && p.ball && p.ball.state !== "gone" ? [p.ball.x, p.ball.y] : null, fl: p.fl.map(f => f.a), flash: p.bumpFlash.map(v => (v > 0 ? 1 : 0)), sling: (p.slingFlash || []).map(v => (v > 0 ? 1 : 0)), cubes: stairCode(p.cubes || 0) };
  };
  let pinsAt = 0, dtPins = 0, pinOwners = [-1, -1];
  let platformOpen = false, platformPushed = false;
  const probeCeilings = []; let lastPins = [], ballRiders = 0; const ballMoves = [null, null];
  const pinSideOwner = side => pinOwners[side];
  const liftH = [null, null]; let liftAt = 0, partnerMicro = { w: 0, l: 0 }, microSent = "";
  const myMicro = () => (holding?.game?.kind === "micro" ? holding.game : null);
  const onLift = (side, x, y, z, top) => { const b = MIRROR.lift(side, top); return x > b[0] - 0.15 && x < b[3] + 0.15 && z > b[2] - 0.15 && z < b[5] + 0.15 && Math.abs(y - top) < 0.2; };
  const updateLifts = (now, px, py, pz, grounded) => {
    const dt = liftAt ? Math.min(0.1, (now - liftAt) / 1000) : 0; liftAt = now;
    const open = (worldBits & 2) !== 0, base = MIRROR.LIFT.base(), me = net.myId(), partnerId = net.partnerId();
    const owners = partnerId >= 0 ? [Math.min(me, partnerId), Math.max(me, partnerId)] : [me, -1];
    const winsOf = id => Math.min(MICRO_GOAL, id === me ? myMicro()?.wins || 0 : id === partnerId ? partnerMicro.w : 0);
    for (let side = 0; side < 2; side++) {
      const was = liftH[side] ?? base;
      const mine = grounded && onLift(side, px, py, pz, was);
      const target = base + (MIRROR.LIFT.top() - base) * winsOf(owners[side]) / MICRO_GOAL, step = 3.5 * dt;
      const h = Math.abs(target - was) <= step ? target : was + Math.sign(target - was) * step;
      liftH[side] = h;
      if (!open) continue;
      wasm.game_rider(...MIRROR.lift(side, h));
      if (mine && h !== was) wasm.game_carry(0, h - was, 0);
    }
    renderer.setWorld({ lifts: liftH.slice(), liftColors: owners.map(id => (id >= 0 ? paletteOf(id).body : LIFT_GOLD)) });
    const g = myMicro(), key = g ? `${g.wins}:${g.losses}` : "";
    if (net.partnerId() >= 0 && key && key !== microSent && net.sendJson({ t: "signal", to: net.partnerId(), data: { micro: { w: Math.min(1000, g.wins), l: Math.min(3, g.losses) } } })) microSent = key;
    if (g?.launched) {
      g.launched = false;
      const out = px >= 0 ? 1 : -1;
      wasm.game_launch(out * 7, 11, (pz >= 0 ? 1 : -1) * 2);
      voice.play("jump");
      showNotice("Three in a row lost: you're out! Climb back and jump on.");
      if (typeof MICRO !== "undefined") MICRO.reset(g);
    }
    canvas.dataset.lifts = liftH.map(h => (h ?? base).toFixed(2)).join(",");
    canvas.dataset.liftWins = owners.map(winsOf).join(",");
  };
  const updatePins = now => {
    dtPins = pinsAt ? Math.min(0.1, (now - pinsAt) / 1000) : 0; pinsAt = now;
    const partner = net.partnerId(), link = partner >= 0 ? links.all.get([net.myId(), partner].sort((a, b) => a - b).join(":")) : null;
    const pins = [];
    if (link && link.plugged && (worldBits & 2)) {
      pinOwners = [link.a, link.b];
      [link.a, link.b].forEach((owner, side) => {
        let pin = null;
        if (owner === net.myId()) {
          pin = holding ? pinState(holding.game) : null;
          if (pin) {
            const st = holding.game.scene === "play" ? holding.game.p.ball?.state || "" : "gone", changed = pinInput !== pinLast.bits || st !== pinLast.state || pin.table !== pinLast.table;
            if ((changed && now - pinSent >= PIN_MIN_GAP) || now - pinSent >= PIN_BEAT) {
              pinSent = now; pinLast = { bits: pinInput, state: st, table: pin.table };
              net.sendJson({ t: "signal", to: partner, data: { pin: pinPayload(holding.game, now) } });
            }
          } else if (pinSent > 0) { pinSent = 0; pinLast = { bits: -1, state: "", table: "" }; net.sendJson({ t: "signal", to: partner, data: { pin: null } }); }
        } else if (partnerSim && partnerPin) {
          PINBALL.step(partnerSim, dtPins, partnerInput()); partnerSim.events.length = 0;
          pin = pinState(partnerSim);
        }
        if (pin) pins.push({ ...pin, side });
      });
    }
    if (!link || !link.plugged) platformOpen = false;
    else if (pins.some(pin => pin.table === "ember" && (pin.cubes || 0) > 0)) platformOpen = true;
    renderer.setWorld({ pinballs: pins, platform: platformOpen }); lastPins = pins;
    wasm.game_riders_clear(); ballRiders = 0;
    const sides = [null, null];
    for (const pin of pins) if (pin.ball) sides[pin.side] = pinPoint(pin.side, colliders.well, pin.ball[0], pin.ball[1], PINBALL.TABLES[pin.table].h, PIN_BALL_OUT, pin.table);
    for (let side = 0; side < 2; side++) {
      const b = sides[side], was = lastBalls[side];
      ballMoves[side] = [b, was];
      if (b) { wasm.game_rider(b[0] - PIN_BALL, b[1] - PIN_BALL, b[2] - PIN_BALL, b[0] + PIN_BALL, b[1] + PIN_BALL, b[2] + PIN_BALL); ballRiders++; }
      lastBalls[side] = b;
    }
    {
      const x = state[1], y = state[2], z = state[3], r = 0.35;
      for (const piece of moving) {
        const was = lastMoving.get(piece.key), b0 = piece.boxes[0];
        if (b0 && was && ridingPieces.has(piece.key)) {
          const d = [b0[0] - was[0], b0[1] - was[1], b0[2] - was[2]];
          if (Math.hypot(...d) < 1.5) wasm.game_carry(d[0], d[1], d[2]);
        }
        if (b0) lastMoving.set(piece.key, b0.slice(0, 3));
        for (const [x0, y0, z0, x1, y1, z1] of piece.boxes) {
          const above = x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r && y < y0;
          if (!above) wasm.game_rider(x0, y0, z0, x1, y1, z1);
        }
      }
      for (const key of [...lastMoving.keys()]) if (!moving.some(m => m.key === key)) lastMoving.delete(key);
    }
    for (const box of probeCeilings) wasm.game_rider(...box);
    if (link && link.plugged && (worldBits & 2)) for (const pin of allTables(pins)) {
      if (!pin.idle) continue;
      const T = PINBALL.TABLES[pin.table], mid = pinPoint(pin.side, colliders.well, 80, T.h / 2, T.h, 0, pin.table);
      if (Math.hypot(mid[0] - state[1], mid[1] - state[2], mid[2] - state[3]) > PIN_SOLID_RANGE + T.h * pinScale(pin.table) / 2) continue;
      for (const step of pinMascot(pin, colliders.well)) wasm.game_rider(...step);
      const q = pinPoint(pin.side, colliders.well, pin.ball[0], pin.ball[1], T.h, PIN_BALL_OUT, pin.table);
      wasm.game_rider(q[0] - PIN_BALL, q[1] - PIN_BALL, q[2] - PIN_BALL, q[0] + PIN_BALL, q[1] + PIN_BALL, q[2] + PIN_BALL);
    }
    for (const pin of pins) {
      if (pin.table !== "ember") continue;
      const c = pin.cubes || 0;
      if (c !== stairSeen[pin.side]) { if (c > 0) stairAt[pin.side] = now; stairSeen[pin.side] = c; }
      pin.extend = stairAt[pin.side] ? stairOut((now - stairAt[pin.side]) / 1000) : 0;
    }
    for (const pin of pins) for (const step of pinMascot(pin, colliders.well)) wasm.game_rider(...step);
    for (const pin of pins) for (const box of pinCubes(pin, colliders.well)) wasm.game_rider(...box);
    for (let side = 0; side < 2; side++) {
      const [b, was] = ballMoves[side] || [];
      if (b && glue && glue.side === side) glueTo(side, b);
      else if (b && was && riding[side]) wasm.game_carry(b[0] - was[0], b[1] - was[1], b[2] - was[2]);
    }
    canvas.dataset.pins = String(pins.length);
  };
  let glue = null, jumpedAt = 0;
  const RIDER_HEIGHT = 1.9, RIDER_REACH = PIN_BALL + 0.35;
  const bounceBall = (side, axis, at) => {
    const mine = pinSideOwner(side) === net.myId(), game = mine ? holding?.game : partnerSim;
    const b = game?.p?.ball; if (!b) return;
    if (axis === "y") { if (Number.isFinite(at)) b.y = at; b.vy = Math.abs(b.vy) * 0.7; } else { if (Number.isFinite(at)) b.x = at; b.vx = -b.vx * 0.7; }
    if (mine) pinLast.state = "";
    else net.sendJson({ t: "signal", to: net.partnerId(), data: { pinHit: axis, at: Number.isFinite(at) ? Math.round(at * 10) / 10 : null } });
  };
  const RIDE_BLEND = 200;
  let rideSent = -2, rideSentOff = [0, 0], rideSentAt = 0, partnerRide = null, partnerRideOff = null;
  const rideSync = now => {
    const partner = net.partnerId();
    const side = glue ? glue.side : -1;
    const moved = glue && side === rideSent && Math.hypot(glue.ox - rideSentOff[0], glue.oz - rideSentOff[1]) > 0.03 && now - rideSentAt > 100;
    if (partner >= 0 && (side !== rideSent || moved)) {
      rideSent = side; rideSentAt = now; rideSentOff = glue ? [glue.ox, glue.oz] : [0, 0];
      net.sendJson({ t: "signal", to: partner, data: { ride: glue ? [side, +glue.ox.toFixed(3), +glue.oz.toFixed(3)] : [-1, 0, 0] } });
    }
    if (partner < 0) { rideSent = -2; partnerRide = partnerRideOff = null; return; }
    const base = (partner + 1) * SLOT;
    if (state[base] !== 1) return;
    const net3 = [state[base + 1], state[base + 2], state[base + 3]];
    let target = null, k = 0;
    if (partnerRide && lastBalls[partnerRide.side]) {
      const b = lastBalls[partnerRide.side];
      target = [b[0] + partnerRide.ox, b[1] + PIN_BALL, b[2] + partnerRide.oz];
      k = Math.min(1, (now - partnerRide.at) / RIDE_BLEND);
      partnerRideOff = { from: target, at: 0 };
    } else if (partnerRideOff?.at) {
      target = partnerRideOff.from; k = 1 - Math.min(1, (now - partnerRideOff.at) / RIDE_BLEND);
      if (k <= 0) partnerRideOff = null;
    }
    if (target && k > 0) {
      for (let n = 0; n < 3; n++) state[base + 1 + n] = net3[n] + (target[n] - net3[n]) * k;
      if (partnerRide) state[base + 6] = state[base + 6] | FLAG_GROUNDED;
    }
    canvas.dataset.partnerRide = partnerRide ? String(partnerRide.side) : "";
  };
  const partnerRideFrom = ([side, ox, oz]) => {
    if (side >= 0 && partnerRide && partnerRide.side === side) Object.assign(partnerRide, { ox, oz });
    else if (side >= 0) partnerRide = { side, ox, oz, at: performance.now() };
    else if (partnerRide) { partnerRide = null; if (partnerRideOff) partnerRideOff.at = performance.now(); }
  };
  const glueTo = (side, b) => {
    const pin = lastPins.find(q => q.side === side), T = pin && PINBALL.TABLES[pin.table], S = pinScale(pin?.table);
    let top = b[1] + PIN_BALL, cx = b[0];
    const prev = glue.prev || [cx, top], z = b[2] + glue.oz, solid = (px, py) => wasm.game_solid_at(px, py, z, ballRiders);
    if (T && top > prev[1]) {
      for (let y = prev[1] + RIDER_HEIGHT; y <= top + RIDER_HEIGHT + 0.05; y += 0.2) if (solid(cx + glue.ox, y + 0.05)) {
        top = Math.max(prev[1], y - RIDER_HEIGHT - 0.02); bounceBall(side, "y", T.h - (top - PIN_BALL - pinBase(pin.table)) / S); break;
      }
    }
    if (T && Math.abs(cx - prev[0]) > 0.01) {
      const dir = Math.sign(cx - prev[0]), mid = top + RIDER_HEIGHT * 0.5;
      for (let xx = prev[0]; dir * (cx - xx) >= -0.01; xx += dir * 0.2) if (solid(xx + glue.ox + dir * 0.4, mid)) {
        cx = xx - dir * 0.02; bounceBall(side, "x", 80 + (side === 0 ? cx : -cx) / S); break;
      }
    }
    glue.prev = [cx, top];
    wasm.game_glue(cx + glue.ox, top, z);
  };
  const keepGlued = () => {
    if (!glue) return;
    const b = lastBalls[glue.side];
    if (!b || performance.now() - jumpedAt < 300) { glue = null; return; }
    const step = 4.5 * Math.max(dtPins, 1 / 120) + 0.02, clampTo = (v, c) => Math.max(c - step, Math.min(c + step, v));
    const ox = clampTo(state[1] - (glue.prev?.[0] ?? b[0]), glue.ox), oz = clampTo(state[3] - b[2], glue.oz);
    if (Math.abs(ox) > RIDER_REACH || Math.abs(oz) > RIDER_REACH) { glue = null; return; }
    glue.ox = ox; glue.oz = oz;
    wasm.game_glue((glue.prev?.[0] ?? b[0]) + ox, glue.prev?.[1] ?? b[1] + PIN_BALL, b[2] + oz);
    wasm.game_publish(performance.now() / 1000);
  };
  const judgeRiding = () => {
    keepGlued();
    const x = state[1], y = state[2], z = state[3];
    ridingPieces.clear();
    for (const piece of moving) if (piece.boxes.some(([x0, , z0, x1, y1, z1]) => Math.abs(y - y1) < 0.08 && x > x0 - 0.35 && x < x1 + 0.35 && z > z0 - 0.35 && z < z1 + 0.35)) ridingPieces.add(piece.key);
    for (let side = 0; side < 2; side++) {
      const b = lastBalls[side];
      riding[side] = Boolean(b) && Math.abs(y - (b[1] + PIN_BALL)) < 0.08 && Math.abs(x - b[0]) < PIN_BALL + 0.35 && Math.abs(z - b[2]) < PIN_BALL + 0.35;
    }
    if (!glue) { const side = riding.findIndex(Boolean); if (side >= 0 && performance.now() - jumpedAt > 300) glue = { side, ox: x - lastBalls[side][0], oz: z - lastBalls[side][2], prev: [lastBalls[side][0], lastBalls[side][1] + PIN_BALL] }; }
    canvas.dataset.riding = riding.some(Boolean) || glue ? "1" : ridingPieces.size ? "piece" : "0";
  };
  const CLONE_LEVEL = 1;
  const updateMirror = (now, active, px, py, pz) => {
    const back = colliders.well;
    moving = [];
    if (koUntil && now >= koUntil) {
      koUntil = 0;
      const front = back - MIRROR.C - 0.8;
      wasm.game_place(px, 0, Math.abs(pz) > front ? Math.sign(pz) * front : pz);
      wasm.game_set_ko(0);
    }
    const link = active ? links.all.get([net.myId(), net.partnerId()].sort((a, b) => a - b).join(":")) : null;
    if (!link || !link.plugged) {
      if (holding) holding.bricks.trail = null;
      if (cellsLive) { wasm.cells_clear(); pushPracticeCells(); cellsLive = false; colliders.cellAt = null; forgetSides(); }
      return [];
    }
    const me = net.myId(), wells = [], deadly = [], counts = [0, 0], cloneSolid = [], cloneShow = [];
    moving = [];
    let mine = null, changed = false, cloneKey = "";
    [link.a, link.b].forEach((owner, side) => {
      let well = emptyWell, piece = null, frac = 0, version = 0, curtain = 0, prev = [], fade = null;
      if (owner === me && holding) {
        const g = holding.bricks;
        well = g.well; version = g.version; curtain = g.curtain || 0;
        if (g.phase === "play" && g.piece) { piece = g.piece; frac = g.gravity / (g.rate || 53); }
        prev = g.recent.slice(0, -1).filter(r => r.cells);
        if (g.fade?.cells) fade = { type: g.fade.type, cells: g.fade.cells, left: g.fade.ticks / BRICKS.FADE_TICKS };
      } else if (owner !== me && ghost) {
        well = ghost.well || emptyWell; curtain = ghost.cu || 0;
        if (ghost.ph === "play" && ghost.p) {
          piece = { type: ghost.p[0], col: ghost.p[1], row: ghost.p[2], rot: ghost.p[3] };
          frac = ghost.g + (now - ghost.at) / 1000 * 59.73 / (ghost.r || 53);
        }
        const pairs = a => Array.from({ length: (a.length - 1) / 2 }, (_, i) => [a[1 + i * 2], a[2 + i * 2]]);
        if (Array.isArray(ghost.rc)) prev = ghost.rc.filter(r => Array.isArray(r) && r.length === 9).slice(-(CLONE_PIECES - 1)).map(r => ({ type: r[0], cells: pairs(r) }));
        if (Array.isArray(ghost.rf) && ghost.rf.length === 10) {
          const left = ghost.rf[1] / BRICKS.FADE_TICKS - (now - ghost.rfAt) / 1000 / (BRICKS.FADE_TICKS * BRICKS.FRAME);
          if (left > 0) fade = { type: ghost.rf[0], cells: pairs(ghost.rf.slice(1)), left };
        }
      }
      wells[side] = well;
      changed = readSide(side, back, well, version, curtain) || changed;
      counts[side] = sides[side].cells.length;
      if (piece) {
        const cells = BRICKS.cells(piece);
        const fall = MIRROR.fitsBelow(well, cells) ? Math.min(0.999, frac) : 0;
        const falling = MIRROR.falling(side, back, cells, fall);
        moving.push({ key: `w${side}${piece.type}`, boxes: falling });
        for (const box of falling) box[6] = piece.type;
        deadly.push(...falling);
        if (owner === me) mine = falling;
        const cloneFall = MIRROR.cloneCells(side, cells, fall, CLONE_LEVEL);
        moving.push({ key: `c${side}${piece.type}`, boxes: cloneFall });
        for (const box of cloneFall) { box[6] = piece.type; cloneShow.push(box); }
      }
      for (const r of prev) for (const box of MIRROR.cloneCells(side, r.cells, 0, CLONE_LEVEL)) { box[6] = r.type; cloneSolid.push(box); }
      if (fade) for (const box of MIRROR.cloneCells(side, fade.cells, 0, CLONE_LEVEL)) { box[6] = fade.type; box[7] = fade.left; cloneShow.push(box); }
      cloneKey += prev.map(r => r.type + r.cells.join("")).join(";") + "|";
      if (owner === me && holding) {
        const trail = holding.bricks.trail || [];
        holding.bricks.trail = [];
        if (trail.length) mine = (mine || []).concat(...trail.map(cells => MIRROR.falling(side, back, cells, 0)));
      }
    });
    if (changed || !cellsLive || cloneKey !== lastCloneKey || platformOpen !== platformPushed) {
      cellsLive = true; lastCloneKey = cloneKey; platformPushed = platformOpen;
      lockedCells = sides[0].cells.concat(sides[1].cells);
      wasm.cells_clear(); pushPracticeCells();
      for (const [x0, y0, z0, x1, y1, z1] of lockedCells.concat(cloneSolid)) wasm.cells_push(x0, y0, z0, x1, y1, z1);
      for (let level = 0; level < MIRROR.LEVELS; level++) for (const b of MIRROR.bridges(back, level, platformOpen)) wasm.cells_push(...b);
      for (const box of [...MIRROR.walkways(back), ...MIRROR.clonePillars(CLONE_LEVEL)]) wasm.cells_push(...box);
      for (const tier of [1, 2]) { const top = MIRROR.beamTop(STAND_LEVEL[tier]), hx = wasm.rack_half_x(), hz = wasm.rack_half_z(); wasm.cells_push(-hx, top, -hz, hx, top + 1.25, hz); }
      cellsPushed = lockedCells.length + cloneSolid.length + MIRROR.LEVELS - (platformOpen ? 0 : 1);
      colliders.cellAt = (x, y, z) => MIRROR.solidAt(wells, back, x, y, z);
    }
    if (mine) {
      const heightOf = flags => flags & FLAG_PRONE ? 0.45 : flags & FLAG_CROUCH ? 1.0 : 1.8;
      if (!koUntil && MIRROR.squishes({ x: px, y: py, z: pz, r: 0.35, h: heightOf(state[6]) }, mine)) knockOut(false);
      const partner = net.partnerId(), slot = (partner + 1) * SLOT;
      if (partner >= 0 && state[slot] === 1 && !(state[slot + 6] & FLAG_KO) && now - squishSent > 1000 &&
        MIRROR.squishes({ x: wasm.net_latest(partner, 0), y: wasm.net_latest(partner, 1), z: wasm.net_latest(partner, 2), r: 0.35, h: heightOf(state[slot + 6]) }, mine)) {
        squishSent = now;
        net.sendJson({ t: "signal", to: partner, data: { squish: 1 } });
        if (holding && BRICKS.topOut(holding.bricks)) holding.dirty = true;
        showNotice(`You squished ${net.nameOf(partner)}! Game over for both.`);
      }
    }
    if (holding && now - mirrorSent.checked >= 1000 / MIRROR_SEND_HZ) {
      mirrorSent.checked = now;
      const wk = MIRROR.wellKey(holding.bricks.well);
      const full = wk !== mirrorSent.wellKey || now - mirrorSent.full >= MIRROR_FULL_MS;
      const snap = MIRROR.snapshot(holding.bricks, full);
      const k = JSON.stringify([snap.ph, snap.p, snap.s, snap.r, snap.cu, snap.rc, snap.rf && snap.rf.slice(2)]);
      if (k !== mirrorSent.key || full) {
        net.sendJson({ t: "signal", to: net.partnerId(), data: { mirror: snap } });
        mirrorSent.key = k; mirrorSent.wellKey = wk; mirrorSent.sent++;
        if (full) mirrorSent.full = now;
      }
    }
    canvas.dataset.mirror = `${counts[0]}:${counts[1]}:${deadly.length}`; canvas.dataset.clone = String(cloneSolid.length + cloneShow.length);
    probeWells = wells;
    return lockedCells.concat(deadly, cloneSolid, cloneShow);
  };

  let previous, lastSend = 0, lastCheck = 0, lastPose = "";
  const characters = [];
  const phases = new Float32Array(maxSlots + 1);
  const gaits = new Float32Array(maxSlots + 1);
  const crouches = new Float32Array(maxSlots + 1), prones = new Float32Array(maxSlots + 1), airs = new Float32Array(maxSlots + 1);
  const plays = new Float32Array(maxSlots + 1);
  const scene = { ropes: [], afterCharacters: null };
  const dpad = { left: false, right: false, up: false, down: false, a: false, b: false, select: false, start: false };
  const pressOrder = [];
  const trackPresses = (list, bits) => {
    for (let n = list.length - 1; n >= 0; n--) if (!(bits & BUTTON_BITS[list[n]])) list.splice(n, 1);
    for (const name of Object.keys(BUTTON_BITS)) if ((bits & BUTTON_BITS[name]) && !list.includes(name)) list.push(name);
  };
  const remotePresses = new Map();
  const keycaps = Object.fromEntries([...$("#keycaps")?.querySelectorAll("kbd") ?? []].map(el => [el.dataset.cap, el]));
  const padButtons = Object.fromEntries([...touchPad.querySelectorAll("[data-pad]")].map(el => [el.dataset.pad, el]));
  const WORLD_SECONDS = 5, UNWORLD_SECONDS = 3;
  const bleed = { from: -1, to: 0, origin: [0, 0, 0], progress: 0 };
  const bleedTo = (tier, origin) => { bleed.from = worldTier; bleed.to = tier; bleed.origin = origin.slice(); bleed.progress = 0; worldTier = tier; };
  let worldTarget = 0, worldProgress = 0, worldOrigin = [0, 0, 0], worldBits = 1;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const heads = new Map();
  const palettes = new Map(), stanceCache = [];
  const paletteOf = id => { let p = palettes.get(id); if (!p) palettes.set(id, p = colorFor(id)); return p; };
  const poseOf = (slot, crouch, prone) => {
    const c = stanceCache[slot];
    if (c && c.crouch === crouch && c.prone === prone) return c.pose;
    const pose = stancePose(crouch, prone);
    stanceCache[slot] = { crouch, prone, pose };
    return pose;
  };
  const frame = now => {
    try {
      const dt = previous === undefined ? 0 : Math.min((now - previous) / 1000, 0.25);
      refreshViews();
      previous = now;
      let forward = stickInput.forward, strafe = stickInput.strafe;
      for (const key of keys) { forward += movement[key][0]; strafe += movement[key][1]; }
      if (rails && (performance.now() > rails.until || !net.known(rails.id))) endRails();
      if (rails) {
        forward = strafe = 0; jumpQueued = false;
        const other = characters.find(c => c.id === rails.id);
        if (other) {
          const dx = other.x - state[1], dz = other.z - state[3], apart = Math.hypot(dx, dz);
          const dy = (other.y + other.pose.eye[1]) - (state[2] + (characters[0]?.pose.eye[1] ?? other.pose.eye[1]));
          const wantYaw = Math.atan2(-dx, -dz), wantPitch = Math.atan2(dy, apart);
          const turn = Math.atan2(Math.sin(wantYaw - state[4]), Math.cos(wantYaw - state[4])), k = Math.min(1, dt * 6);
          wasm.game_look(turn * k, (wantPitch - state[5]) * k);
          const gap = apart - RAILS_DISTANCE;
          if (Math.abs(turn) < 0.6) forward = gap > 0.15 ? Math.min(1, gap) : gap < -0.25 ? Math.max(-0.5, gap) : 0;
        }
      }
      if (holding) {
        for (const key of Object.keys(dpad)) dpad[key] = false;
        if (playing) {
          for (const name of Object.keys(pad)) dpad[name] = !releasing[name] && (pad[name] || tapped[name] > 0);
          dpad.left ||= keys.has("KeyA") || keys.has("ArrowLeft"); dpad.right ||= keys.has("KeyD") || keys.has("ArrowRight");
          dpad.up ||= keys.has("KeyW") || keys.has("ArrowUp"); dpad.down ||= keys.has("KeyS") || keys.has("ArrowDown");
          dpad.a ||= buttons.a; dpad.b ||= buttons.b;
          forward = strafe = 0; jumpQueued = false;
        }
        const ticksBefore = holding.game.ticks || 0;
        if (holding.game.kind === "pinball") {
          const g = holding.game, start = Boolean(dpad.start || dpad.select);
          if (start && !g.startWas && g.scene === "play") { g.paused = !g.paused; holding.dirty = true; voice.play("pause"); }
          g.startWas = start;
          pinInput = g.paused || g.scene !== "play" ? 0 : (dpad.left || dpad.b ? 1 : 0) | (dpad.right || dpad.a ? 2 : 0);
          if (pinballStep(g, dt, { ...dpad, start: false, select: false })) holding.dirty = true;
          g.ticks = (g.ticks || 0) + 1;
          for (const name of PINBALL.drainEvents(g)) voice.pinballSound(name);
        } else if (holding.game.kind === "micro") {
          if (!holding.game.look) holding.game.look = paletteOf(net.myId());
          if (MICRO.step(holding.game, dt, { ...dpad, start: Boolean(dpad.start || dpad.select), select: false })) holding.dirty = true;
          for (const name of MICRO.drainEvents(holding.game)) voice.microSound(name);
        } else if (BRICKS.step(holding.game, dt, dpad)) holding.dirty = true;
        if ((holding.game.ticks || 0) !== ticksBefore) {
          for (const name of Object.keys(tapped)) {
            if (releasing[name]) releasing[name] = false;
            else if (tapped[name] > 0 && dpad[name]) { tapped[name]--; if (!pad[name]) releasing[name] = true; }
          }
        }
      }
      {
        const bits = Object.keys(dpad).reduce((bits, name) => bits | (dpad[name] ? BUTTON_BITS[name] : 0), 0);
        if (playing && bits & ~clickBits) voice.play("click", holding?.tier || 0);
        if (playing && clickBits & ~bits) voice.play("release");
        clickBits = playing ? bits : 0;
        trackPresses(pressOrder, bits);
      }
      wasm.game_set_buttons(pressOrder.reduce((bits, name) => bits | BUTTON_BITS[name], 0));
      updatePins(now);
      updateLifts(now, state[1], state[2], state[3], (state[6] & FLAG_GROUNDED) !== 0);
      simTime += dt;
      const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
      for (let n = 0; n < steps; n++) { wasm.game_step(forward, strafe, jumpQueued && n === 0 ? 1 : 0, dt / steps); }

      jumpQueued = false;
      for (const c of characters) if (c.id >= 0) wasm.game_set_solid(c.id, net.partnerId() >= 0 ? c.id === net.partnerId() : !net.isPartnered(c.id));
      const partner = net.partnerId(), localLink = partner >= 0 ? links.all.get(net.myId() < partner ? `${net.myId()}:${partner}` : `${partner}:${net.myId()}`) : null;
      let taut = 0, slip = 0, cableLen = LINK_LENGTH;
      if (!localLink) { reel.held = reel.held && net.partnered(); reel.length = LINK_LENGTH; reel.partner = null; }
      if (localLink && localLink.plugged && state[(partner + 1) * SLOT] === 1 && now > ropeQuietUntil) {
        const px0 = state[1], py0 = state[2], pz0 = state[3], at = now / 1000;
        const ax = wasm.net_anchor(partner, 0, at), ay = wasm.net_anchor(partner, 1, at), az = wasm.net_anchor(partner, 2, at);
        const partnerMoving = wasm.net_walking(partner, at);
        const line = Math.hypot(ax - px0, ay - py0, az - pz0);
        if (reel.held) reel.length = Math.min(reel.length, Math.max(line, REEL_MIN));
        if (reel.held && line - reel.length < REEL_STALL) reel.length = Math.max(REEL_MIN, reel.length - REEL_RATE * dt);
        else if (!reel.held) reel.length = Math.min(LINK_LENGTH, reel.length + REEL_OUT_RATE * dt);
        const partnerReel = reel.partner && now < reel.partner.until ? reel.partner : null;
        if (reel.held) reel.heldUntil = now + REEL_MEMORY_MS;
        const hauling = reel.held || now < reel.heldUntil, partnerHauling = Boolean(partnerReel?.active) || (reel.partner && now < reel.partner.activeUntil);
        const partnerLength = partnerReel ? (partnerReel.active ? Math.max(REEL_MIN, partnerReel.length - REEL_RATE * (now - partnerReel.at) / 1000) : Math.min(LINK_LENGTH, partnerReel.length + REEL_OUT_RATE * (now - partnerReel.at) / 1000)) : LINK_LENGTH;
        cableLen = Math.min(reel.length, partnerLength);
        const full = reel.length >= LINK_LENGTH - 1e-3 && !reel.held;
        if ((!full || !reel.sentFull) && now - reel.sentAt >= 200) {
          net.sendJson({ t: "signal", to: partner, data: { reel: [+reel.length.toFixed(3), reel.held ? 1 : 0] } });
          reel.sentAt = now; reel.sentFull = full;
        }
        if (!glue) taut = wasm.game_tether(ax, ay, az, cableLen, dt, partnerMoving, hauling ? 1 : 0, partnerHauling ? 1 : 0) ? 1 : 0;
        {
          const pb = (partner + 1) * SLOT, pflags = state[pb + 6], pspeed = state[pb + 7];
          const below = py0 - ay, hx = ax - px0, hz = az - pz0, flat = Math.hypot(hx, hz);
          const hanging = !(pflags & FLAG_GROUNDED) && below > 0.5 && line > cableLen - 0.15 && (state[6] & FLAG_GROUNDED) && !glue && flat > 0.05;
          slip = hanging ? Math.min(SLIP_MAX, SLIP_HANG * (below / Math.max(line, 1)) + SLIP_SWING * pspeed * pspeed) : 0;
          if (slip > 0) wasm.game_carry(hx / flat * slip * dt, 0, hz / flat * slip * dt);
        }
      }
      playWeight += ((playing ? 1 : 0) - playWeight) * Math.min(1, dt * 8);
      wasm.game_set_speaking(voice.speaking() ? 1 : 0);
      const seconds = now / 1000;
      wasm.game_publish(seconds);
      judgeRiding();
      rideSync(now);

      characters.length = 0;
      for (let slot = 0; slot <= maxSlots; slot++) {
        const base = slot * SLOT;
        if (state[base] !== 1) continue;
        const id = slot - 1;
        if (slot > 0 && !net.known(id)) continue;
        const flags = state[base + 6];
        const ease = Math.min(1, dt * 7);
        crouches[slot] += ((flags & FLAG_CROUCH ? 1 : 0) - crouches[slot]) * ease;
        airs[slot] += ((flags & FLAG_GROUNDED ? 0 : 1) - airs[slot]) * Math.min(1, dt * 12);
        prones[slot] += ((flags & FLAG_PRONE ? 1 : 0) - prones[slot]) * ease;
        const pose = poseOf(slot, crouches[slot], prones[slot]);
        const speed = state[base + 7];
        gaits[slot] += (Math.min(1, speed / pose.speed) - gaits[slot]) * Math.min(1, dt * 10);
        const perMetre = CADENCE_SLIP * Math.PI / (2 * Math.max(strideFor(gaits[slot], pose.stride), 0.06));
        if (speed >= 0.05) phases[slot] = (phases[slot] + speed * dt * perMetre) % (Math.PI * 2);
        const holds = slot === 0 ? Boolean(holding) : (flags & FLAG_HOLDING) !== 0;
        plays[slot] = slot === 0 ? playWeight : plays[slot] + ((flags & FLAG_PLAYING ? 1 : 0) - plays[slot]) * Math.min(1, dt * 8);
        characters.push({ holds, play: plays[slot], screen: slot === 0 ? holding : renderer.remoteScreenFor(id === net.partnerId() ? partnerTier : 0), pocket: 0, plug: 0, plugged: plugOn(slot === 0 ? net.myId() : id, seconds), port: null, leftHand: null, id: slot === 0 ? -1 : id, x: state[base + 1], y: state[base + 2], z: state[base + 3], yaw: state[base + 4], pitch: state[base + 5],
          color: paletteOf(slot === 0 ? net.id() : id), phase: phases[slot], gait: gaits[slot], time: seconds, crouch: crouches[slot], prone: prones[slot], air: airs[slot], pose, speaking: (flags & FLAG_SPEAKING) !== 0, grounded: (flags & FLAG_GROUNDED) !== 0, ko: (flags & FLAG_KO) !== 0, buttons: state[base + 8],
          partnered: net.isPartnered(slot === 0 ? net.id() : id) });
        if (slot > 0) voice.place(id, ...toWorld(state[base + 1], state[base + 2], state[base + 3], state[base + 4], pose.eye));
      }
      {
        const c = partner >= 0 ? characters.find(c => c.id === partner) : null;
        let want = [0, 0, 0];
        if (c && taut === 1 && localLink && localLink.plugged) {
          const d = [c.x - state[1], c.y - state[2], c.z - state[3]], l = Math.hypot(d[0], d[1], d[2]);
          if (l > 0.5 && Math.abs(l - cableLen) < PARTNER_SHIFT_MAX) want = d.map(v => v * (cableLen / l - 1));
        }
        const ease = Math.min(1, dt * PARTNER_SHIFT_RATE);
        for (let k = 0; k < 3; k++) partnerShift[k] += (want[k] - partnerShift[k]) * ease;
        if (c) { c.x += partnerShift[0]; c.y = Math.max(0, c.y + partnerShift[1]); c.z += partnerShift[2]; }
        else partnerShift = [0, 0, 0];
      }

      const px = state[1], py = state[2], pz = state[3], yaw = state[4], pitch = state[5];
      const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
      const rigEye = characters[0].pose.eye, fitted = reachable(px, pz, yaw, [0, 0, 0], rigEye, 0.08);
      const eye = toWorld(px, py, pz, yaw, fitted);
      const forwardDir = [fx, fy, fz];

      aim = null;
      let aimDistance = PARTNER_RANGE;
      for (const c of characters) {
        if (c.id < 0) continue;
        const chest = toWorld(c.x, c.y, c.z, c.yaw, [0, (c.pose.hip + c.pose.neck[1]) / 2, c.pose.neck[2] / 2]);
        const v = [chest[0] - eye[0], chest[1] - eye[1], chest[2] - eye[2]], distance = Math.hypot(...v);
        const along = v[0] * fx + v[1] * fy + v[2] * fz;
        if (along <= 0 || distance >= aimDistance) continue;
        if (Math.sqrt(Math.max(0, distance * distance - along * along)) > 0.5) continue;
        aimDistance = distance; aim = { id: c.id, holding: c.holds, partnered: net.isPartnered(c.id) };
      }
      nearKiosk = -1;
      {
        let best = PICKUP_RANGE;
        for (const k of renderer.kiosk()) {
          const usable = k.practice ? (!holding || k.tier !== holding.tier) && worldProgress === 0
            : k.tier === 0 ? worldProgress === 0 && (!holding || (holding.practice && holding.tier !== 0))
            : holding ? (k.tier === holding.tier + 1 && worldBits & 2) : false;
          const d = Math.hypot(k.centre[0] - px, k.centre[2] - pz);
          if (usable && !k.taken && d < best && Math.abs(k.centre[1] - 1.1 - py) < 2) { best = d; nearKiosk = k.index; }
        }
      }
      if (morph) {
        const t = (now - morph.start) / 1000 / MORPH_SECONDS;
        if (t >= 0.5 && !morph.done) { morph.done = true; swapDevice(morph.tier, [px, py, pz]); }
        if (t >= 1) morph = null;
      }
      demoteIfFallen();
      renderer.retainScreens([holding, ...heldStack]);
      {
        const SONG_RANGE = 24;
        if (!summitTune && state[2] >= MIRROR.LEVEL_H - 0.1 && (state[6] & FLAG_GROUNDED)) summitTune = true;
        else if (summitTune && state[2] < MIRROR.LEVEL_H - 1.5) summitTune = false;
        const running = holding && (holding.game.kind === "pinball" ? !holding.game.paused : holding.game.kind === "micro" ? !holding.game.paused && holding.game.phase !== "over" : holding.game.phase === "play");
        const inHand = running ? (playing ? 1 : 0.85) : 0;
        voice.song("summit", holding && holding.tier === 0 && summitTune ? inHand : 0);
        const floor4 = MIRROR.beamTop(STAND_LEVEL[1] + 1), plat = MIRROR.bridge(colliders.well, MIRROR.ACROSS);
        const onPlatform = platformOpen && (state[6] & FLAG_GROUNDED) && Math.abs(state[2] - floor4) < 0.1 &&
          px > plat[0] - 0.35 && px < plat[3] + 0.35 && pz > plat[2] - 0.35 && pz < plat[5] + 0.35;
        const inBoardB = lastPins.some(pin => {
          if (pin.table !== "tide") return false;
          const T = PINBALL.TABLES.tide, a = pinPoint(pin.side, colliders.well, 0, T.h, T.h, -0.75, "tide"), b = pinPoint(pin.side, colliders.well, 160, 0, T.h, 1.0, "tide");
          return px > Math.min(a[0], b[0]) && px < Math.max(a[0], b[0]) && py > Math.min(a[1], b[1]) - 0.1 && py < Math.max(a[1], b[1]) && pz > Math.min(a[2], b[2]) && pz < Math.max(a[2], b[2]);
        });
        if (!stage2Tune && (onPlatform || inBoardB)) stage2Tune = true;
        else if (stage2Tune && state[2] < floor4 - 1.5) stage2Tune = false;
        const liftTune = (state[6] & FLAG_GROUNDED) !== 0 && [0, 1].some(side => liftH[side] !== null && onLift(side, px, py, pz, liftH[side]));
        voice.song("select", liftTune ? 1 : 0);
        voice.song("stage2", holding && holding.tier === 1 && stage2Tune && !liftTune ? inHand : 0);
        for (const [tier, name] of [[0, "menu"], [1, "stage1"]]) {
          let level = !liftTune && holding && holding.tier === tier && !(tier === 0 && summitTune) && !(tier === 1 && stage2Tune) ? inHand : 0;
          for (const at of renderer.songSources(tier)) {
            const d = Math.hypot(at[0] - px, at[1] - py, at[2] - pz);
            if (d < SONG_RANGE) level = Math.max(level, at[3] * 0.6 / (1 + d / 2) * (1 - d / SONG_RANGE));
          }
          voice.song(name, level);
        }
        const inside = bleed.progress <= 0 ? -1 : Math.hypot(px - bleed.origin[0], py - bleed.origin[1], pz - bleed.origin[2]) < bleed.progress * INFECT_FULL ? bleed.to : bleed.from;
        voice.setZone(worldProgress > 0.3 ? inside : -1);
        voice.setDuck(characters.some(c => c.id >= 0 && c.id === net.partnerId() && c.speaking));
        const grounded = (state[6] & FLAG_GROUNDED) !== 0, moved = Math.hypot(px - (lastStep.x ?? px), pz - (lastStep.z ?? pz));
        if (grounded && moved < 1) { lastStep.walked += moved; if (lastStep.walked > STEP_LENGTH) { lastStep.walked = 0; voice.play("step"); } }
        if (lastStep.grounded && !grounded && state[2] > lastStep.y + 0.005) voice.play("jump");
        if (!lastStep.grounded && grounded && lastStep.air > 0.25) voice.play("land");
        lastStep.air = grounded ? 0 : lastStep.air + dt;
        Object.assign(lastStep, { x: px, z: pz, y: state[2], grounded });
      }
      if (holding?.game.events?.length) { for (const [name, value] of holding.game.events) voice.play(name, value); holding.game.events.length = 0; }

      characters[0].eyeLocal = fitted;
      characters[0].screen = holding;
      characters[0].device = holding?.tier || 0;
      if (holding) holding.priority = true;
      characters[0].morph = morph ? Math.abs(Math.cos(Math.PI * Math.min(1, (now - morph.start) / 1000 / MORPH_SECONDS))) : 1;
      for (const c of characters) if (c.id >= 0) { c.device = c.id === net.partnerId() ? partnerTier : 0; c.ghost = net.partnerId() >= 0 && c.id !== net.partnerId(); }
      for (const c of characters) {
        if (c.id < 0) { c.gaze = null; continue; }
        let best = null, bestD = GAZE_RANGE;
        const gfx = -Math.sin(c.yaw), gfz = -Math.cos(c.yaw);
        for (const o of characters) {
          if (o === c) continue;
          const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, o.y - c.y, dz);
          if (d < bestD && dx * gfx + dz * gfz > 0) { bestD = d; best = o; }
        }
        c.gaze = best ? toWorld(best.x, best.y, best.z, best.yaw, best.pose.eye) : null;
      }
      characters[0].held = pressOrder;
      for (const c of characters) {
        if (c.id < 0) continue;
        let list = remotePresses.get(c.id);
        if (!list) remotePresses.set(c.id, list = []);
        trackPresses(list, c.buttons | 0);
        c.held = list;
      }
      for (const c of characters) c.dt = dt;

      const characterOf = id => characters.find(c => (c.id < 0 ? net.myId() : c.id) === id);
      const portOf = id => characterOf(id)?.port, portDirOf = id => characterOf(id)?.portDir ?? null;
      const animateHands = (id, start) => {
        const c = characterOf(id);
        if (!c) return;
        const a = cableAnim(seconds - start);
        c.pocket = Math.max(c.pocket, a.pocket); c.plug = Math.max(c.plug, a.plug);
      };
      for (const link of links.all.values()) if (link.animated) animateHands(link.a, link.start);
      if (heldCable && !net.partnered()) animateHands(net.myId(), heldCable.start);
      for (const [id, stance] of stanceRopes) if (!net.isPartnered(id)) animateHands(id, stance.start);
      scene.ropes.length = 0;
      scene.plugs = [];
      const handOf = id => characterOf(id)?.leftHand;
      const plugModel = (rope, at) => {
        const n = rope.n, px = rope.pos[(n - 2) * 3], py = rope.pos[(n - 2) * 3 + 1], pz = rope.pos[(n - 2) * 3 + 2];
        let ax = norm([px - at[0], py - at[1], pz - at[2]]);
        if (!Number.isFinite(ax[0]) || Math.hypot(...ax) < 0.5) ax = [1, 0, 0];
        let az = norm(cross(ax, [0, 1, 0]));
        if (Math.hypot(...az) < 0.5) az = [0, 0, 1];
        const ay = cross(az, ax), k = 0.001;
        const o = [0, 1, 2].map(i => at[i] - (ax[i] * GB_PLUG_TAIL_MM[0] + ay[i] * GB_PLUG_TAIL_MM[1] + az[i] * GB_PLUG_TAIL_MM[2]) * k);
        return new Float32Array([ax[0] * k, ax[1] * k, ax[2] * k, 0, ay[0] * k, ay[1] * k, ay[2] * k, 0, az[0] * k, az[1] * k, az[2] * k, 0, o[0], o[1], o[2], 1]);
      };
      scene.afterCharacters = () => {
        const t0 = performance.now();
        const mine = link => link.a === net.myId() || link.b === net.myId();
        const feet = id => characterOf(id)?.y ?? 0;
        for (const link of links.all.values()) {
          const a = portOf(link.a), b = portOf(link.b);
          if (!a || !b) continue;
          const t = seconds - link.start;
          if (link.animated && t < POCKET) continue;
          let end = b, flying = null, length = mine(link) ? cableLen : LINK_LENGTH, floorB = feet(link.b);
          if (link.animated && t < POCKET + PLUG) { end = handOf(link.a) || a; length = STANCE_LENGTH; floorB = feet(link.a); }
          else if (link.animated && t < POCKET + PLUG + TOSS) {
            const u = (t - POCKET - PLUG) / TOSS;
            end = flying = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u + 1.2 * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * u];
            length = STANCE_LENGTH + (Math.hypot(end[0] - a[0], end[1] - a[1], end[2] - a[2]) + 0.5 - STANCE_LENGTH) * Math.min(1, u * 2);
            floorB = feet(link.a) + (feet(link.b) - feet(link.a)) * u;
          } else link.plugged = true;
          if (!link.rope) link.rope = { n: 0, caps: [false, false] };
          if (link.plugged) {
            const ca = characterOf(link.a), cb = characterOf(link.b);
            if (ca && cb) length = Math.hypot(end[0] - a[0], end[1] - a[1], end[2] - a[2]) + Math.max(0, length - Math.hypot(ca.x - cb.x, ca.y - cb.y, ca.z - cb.z));
          }
          cableShape(link.rope, a, end, length, feet(link.a), floorB, dt, !mine(link));
          link.rope.caps[1] = link.animated && t < POCKET + PLUG;
          scene.ropes.push(link.rope);
          if (flying) scene.plugs.push(plugModel(link.rope, flying));
        }
        const stance = (id, held) => {
          const port = portOf(id), hand = handOf(id);
          if (!port || !hand || seconds - held.start < POCKET) return;
          if (!held.rope) held.rope = { n: 0, caps: [false, true] };
          cableShape(held.rope, port, hand, STANCE_LENGTH, feet(id), feet(id), dt, true);
          scene.ropes.push(held.rope);
        };
        if (heldCable && !net.partnered()) stance(net.myId(), heldCable);
        for (const [id, held] of stanceRopes) if (!net.isPartnered(id)) stance(id, held);
        cost.rope = performance.now() - t0;
      };

      const linked = Boolean(localLink && localLink.plugged);
      if (linked && !worldTarget) {
        worldTarget = 1;
        const a = portOf(localLink.a) || eye, b = portOf(localLink.b) || eye;
        if (worldProgress === 0) { worldOrigin = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2]; worldTier = -1; bleedTo(holding?.tier || 0, worldOrigin); }
      }
      if (!linked && worldTarget) { worldTarget = 0; if (holding && !holding.practice) stepDown(0); partnerTier = 0; morph = null; }
      worldProgress = Math.min(1, Math.max(0, worldProgress + (worldTarget ? dt / WORLD_SECONDS : -dt / UNWORLD_SECONDS)));
      if (worldTarget) bleed.progress = Math.min(1, bleed.progress + dt * INFECT_SPEED / INFECT_FULL);
      else { bleed.progress = worldProgress; bleed.from = -1; bleed.to = worldTier < 0 ? 0 : worldTier; bleed.origin = worldOrigin; if (worldProgress === 0) worldTier = -1; }
      const sink = RACK_SINK * smooth(0.08, 0.45, worldProgress);
      const rise = [0, 1].map(w => smooth(0.4 + 0.16 * w, 0.72 + 0.16 * w, worldProgress));
      const bits = (sink < 0.9 ? 1 : 0) | (rise.every(r => r >= 1) ? 2 : 0);
      if (bits !== worldBits) {
        worldBits = bits;
        wasm.game_set_world(bits);
        refreshBoxes();
        if (!cellsLive) { wasm.cells_clear(); pushPracticeCells(); }
      }
      const mirrorBoxes = updateMirror(now, linked && (worldBits & 2) !== 0, px, py, pz);
      renderer.setWorld({ infect: [...bleed.origin, bleed.progress > 0 ? INFECT_FULL * bleed.progress : -1], sink, rise, progress: smooth(0.35, 0.8, bleed.progress), mirror: mirrorBoxes, tierFrom: bleed.from, tierTo: bleed.to });

      renderer.resize();
      const viewProjection = renderer.frame({ eye, target: [eye[0] + fx, eye[1] + fy, eye[2] + fz], time: seconds }, characters, scene);
      updatePrompt();
      heads.clear();
      for (const c of characters) if (c.id >= 0) heads.set(c.id, [...toWorld(c.x, c.y + 0.45, c.z, c.yaw, c.pose.head), Math.hypot(c.x - px, c.z - pz)]);
      placeBubbles(now, viewProjection, heads);
      {
        const model = playing ? renderer.selfGameBoy() : null;
        if (model && coarsePointer.matches) {
          const m = viewProjection, w = canvas.clientWidth, h = canvas.clientHeight;
          for (const [name, button] of Object.entries(padButtons)) {
            const b = DEVICES[holding?.tier || 0].buttons[name]; if (!b) continue;
            const [x, y, z] = apply(model, [b.at[0], b.at[1], b.at[2] + 2]);
            const [fx, fy] = project(m, x, y, z);
            button.style.transform = `translate(${(fx * w).toFixed(1)}px, ${(fy * h).toFixed(1)}px) translate(-50%, -50%)`;
          }
        }
        if (model && !coarsePointer.matches) {
          const m = viewProjection, w = canvas.clientWidth, h = canvas.clientHeight;
          for (const [name, cap] of Object.entries(keycaps)) {
            const b = DEVICES[holding?.tier || 0].buttons[name]; if (!b) continue;
            const [x, y, z] = apply(model, [b.at[0], b.at[1], b.at[2] + 6]);
            const [fx, fy, cw] = project(m, x, y, z);
            if (cw <= 0.01) { cap.hidden = true; continue; }
            cap.hidden = false;
            cap.style.transform = `translate(${(fx * w).toFixed(1)}px, ${(fy * h).toFixed(1)}px) translate(-50%, -50%)`;
            cap.classList.toggle("down", Boolean(dpad[name]));
          }
          if (keycapsBox.hidden) keycapsBox.hidden = false;
        } else if (!keycapsBox.hidden) keycapsBox.hidden = true;
      }
      {
        const k = nearKiosk >= 0 ? renderer.kiosk()[nearKiosk] : null;
        const label = holding && k ? `Take the ${DEVICES[k.tier].name}` : "Pick up";
        if (pickupBanner.lastElementChild.textContent !== label) pickupBanner.lastElementChild.textContent = label;
        if (k) {
          const m = viewProjection, [x, y, z] = [k.centre[0], k.centre[1] + 0.22, k.centre[2]];
          const [fx, fy, cw] = project(m, x, y, z);
          if (cw > 0.1) {
            const sx = fx * canvas.clientWidth, sy = fy * canvas.clientHeight;
            const scale = Math.max(0.7, Math.min(1, 1.6 / Math.max(Math.hypot(x - eye[0], z - eye[2]), 0.001)));
            pickupBanner.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
            pickupBanner.hidden = false;
          } else pickupBanner.hidden = true;
        } else if (!pickupBanner.hidden) pickupBanner.hidden = true;
      }
      voice.listener(eye, [fx, fy, fz]);
      voice.manage(performance.now());
      canvas.dataset.x = px.toFixed(3); canvas.dataset.y = py.toFixed(3); canvas.dataset.z = pz.toFixed(3);
      canvas.dataset.simTime = simTime.toFixed(3);
      canvas.dataset.grounded = state[6] & FLAG_GROUNDED ? "1" : "0";
      canvas.dataset.yaw = yaw.toFixed(3); canvas.dataset.pitch = pitch.toFixed(3);
      canvas.dataset.remotes = String(characters.length - 1);
      canvas.dataset.stance = String(wasm.game_stance()); canvas.dataset.eye = eye[1].toFixed(3);
      canvas.dataset.limbGap = renderer.limbGap().toFixed(3);
      canvas.dataset.gbGap = holding ? renderer.gbGap().toFixed(3) : "";
      canvas.dataset.gbDistance = renderer.faceDistance().toFixed(3); canvas.dataset.gbScreen = holding ? renderer.screenDistance().toFixed(3) : "";
      canvas.dataset.gbFit = holding && renderer.fit() ? renderer.fit().map(v => v.toFixed(3)).join(",") : "";
      canvas.dataset.eyeX = eye[0].toFixed(3); canvas.dataset.eyeZ = eye[2].toFixed(3);
      canvas.dataset.eyePulled = Math.hypot(rigEye[0] - fitted[0], rigEye[2] - fitted[2]).toFixed(3);
      canvas.dataset.voice = String(voice.connected());
      {
        const partnered = net.partnerId() >= 0;
        if (partnered && !runStart) runStart = now;
        if (!partnered && runStart) { runStart = 0; timerEl.hidden = true; clearFinish(); partnerMicro = { w: 0, l: 0 }; microSent = ""; }
        if (runStart && !finished) {
          const text = clock((now - runStart) / 1000);
          if (timerEl.textContent !== text) timerEl.textContent = text;
          if (timerEl.hidden) timerEl.hidden = false;
          const p = [0, 1, 2].map(k => wasm.net_latest(net.partnerId(), k));
          if ((state[6] & FLAG_GROUNDED) && MIRROR.onFinish(colliders.well, state[1], state[2], state[3]) && MIRROR.onFinish(colliders.well, p[0], p[1], p[2])) finishRun(now);
        }
        if (finished && !finished.answered && finished.tries < 30 && now - finished.sentAt > 1000) { finished.sentAt = now; finished.tries++; net.sendJson({ t: "finish" }); }
        canvas.dataset.finished = finished ? finished.t.toFixed(2) : "";
      }
      {
        const name = voice.nowPlaying();
        if (name !== credit.want) { credit.want = name; credit.since = now; }
        if (credit.want !== credit.shown && now - credit.since > 400) {
          credit.shown = credit.want;
          const c = SONG_CREDITS[credit.shown];
          creditEl.classList.remove("swap"); void creditEl.offsetWidth;
          if (c) { creditLink.href = c.url; creditLink.querySelector(".title").textContent = c.title; creditLink.querySelector(".by").textContent = c.by; creditEl.hidden = false; creditEl.classList.add("swap"); }
          else creditEl.hidden = true;
          canvas.dataset.credit = c ? `${c.title} by ${c.by}` : "";
        }
        const locked = document.pointerLockElement === canvas;
        if (escHint.hidden === locked) escHint.hidden = !locked;
      }
      canvas.dataset.practiceUp = practiceUp() ? "1" : "0"; canvas.dataset.holding = holding ? "1" : "0"; canvas.dataset.playing = playing ? "1" : "0";
      canvas.dataset.cable = localLink ? (localLink.plugged ? "plugged" : "connecting") : "none";
      if (localLink && localLink.animated && !localLink.plugged) canvas.dataset.cableAnimated = "1";
      canvas.dataset.slip = slip.toFixed(2); canvas.dataset.taut = String(taut); canvas.dataset.cableLength = cableLen.toFixed(2); canvas.dataset.reel = reel.held ? "1" : "0"; canvas.dataset.unlocked = [...unlocked].sort().join(",");
      cost.ropeMs += (cost.rope - cost.ropeMs) * 0.05; cost.frameMs += (dt * 1000 - cost.frameMs) * 0.05; cost.rope = 0;
      canvas.dataset.ropeMs = cost.ropeMs.toFixed(2); canvas.dataset.frameMs = cost.frameMs.toFixed(1);
      if (traceBuf) { if (traceBuf.length >= 3600) traceBuf.shift(); const pc = partner >= 0 ? characters.find(c => c.id === partner) : null, ps = partner >= 0 ? (partner + 1) * SLOT : -1; traceBuf.push([Date.now(), px, py, pz, pc ? pc.x : NaN, pc ? pc.y : NaN, pc ? pc.z : NaN, taut, dt, ps >= 0 ? state[ps + 1] : NaN, ps >= 0 ? state[ps + 2] : NaN, ps >= 0 ? state[ps + 3] : NaN]); }
      canvas.dataset.aim = aim ? String(aim.id) : "-1";
      canvas.dataset.ropes = String(scene.ropes.length);
      if (coarsePointer.matches) {
        const crouched = (state[6] & FLAG_CROUCH) !== 0 ? "true" : "false", prone = (state[6] & FLAG_PRONE) !== 0 ? "true" : "false";
        if (crouchButton.getAttribute("aria-pressed") !== crouched) crouchButton.setAttribute("aria-pressed", crouched);
        if (proneButton.getAttribute("aria-pressed") !== prone) proneButton.setAttribute("aria-pressed", prone);
      }
      canvas.dataset.fingers = pressOrder.join(","); canvas.dataset.cableOut = heldCable ? "1" : "0"; canvas.dataset.cablesOut = String(stanceRopes.size); canvas.dataset.rails = rails ? rails.role : "";
      canvas.dataset.world = `${worldProgress.toFixed(2)}:${worldBits}`; canvas.dataset.tier = String(holding ? holding.tier : -1); canvas.dataset.heldGame = holding ? (holding.game.kind === "pinball" ? `pinball:${holding.game.scene}${holding.game.paused ? ":paused" : ""}` : holding.game.kind === "micro" ? `micro:${holding.game.phase}${holding.game.paused ? ":paused" : ""}` : "bricks") : ""; canvas.dataset.ghosts = String(characters.filter(c => c.ghost).length); canvas.dataset.sounds = Object.entries(voice.played()).map(([k, v]) => `${k}:${v}`).join(","); canvas.dataset.zone = String(voice.zone()); canvas.dataset.song = voice.songLevel(); canvas.dataset.track = String(voice.track("menu")); canvas.dataset.worldTier = `${worldTier}:${bleed.progress.toFixed(2)}`;
      canvas.dataset.ko = koUntil ? "1" : "0"; canvas.dataset.koCount = String(koCount);
      canvas.dataset.mirrorSent = String(mirrorSent.sent);
      if (holding) {
        const g = holding.game;
        canvas.dataset.held = `${g.phase}:${g.piece ? `${g.piece.type}${g.piece.col},${g.piece.row},${g.piece.rot}` : "-"}:${g.score}:${g.lines}`;
        canvas.dataset.curtain = String(g.curtain || 0);
      }

      if (net.open() && now - lastCheck >= SEND_INTERVAL_MS) {
        lastCheck = now;
        const len = wasm.net_pack_pose();
        const packet = io.slice(0, len);
        const key = String.fromCharCode.apply(null, packet.subarray(4));
        if ((key !== lastPose || now - lastSend > 1000) && net.send(packet)) { lastPose = key; lastSend = now; }
      }
      requestAnimationFrame(frame);
    } catch (error) { say("The game stopped. Reload to try again."); console.error(error); }
  };
  canvas.dataset.ready = "true";
  requestAnimationFrame(frame);

  function createNetwork() {
    let socket = null, myId = -1, attempts = 0, closedByUs = false, displayName = "";
    let reconnectTimer = 0;
    const peers = new Map();
    let pairs = [], partnerId = -1, pendingTo = -1, pendingUntil = 0, requestFrom = -1;
    const nameOf = id => peers.get(id)?.name || `player ${id + 1}`;
    const refreshPrompt = () => {
      muteButton.hidden = false;
      const voip = globalThis.document?.querySelector("#voip"); if (voip) voip.hidden = false;
      canvas.dataset.partner = String(partnerId);
    };
    const endPartnership = () => {
      if (partnerId >= 0) { voice.close(partnerId); links.end(myId, partnerId); }
      ghost = null; reel.held = false; reel.length = LINK_LENGTH; reel.partner = null; reel.sentFull = true; mirrorSent = { checked: 0, key: "", full: 0, wellKey: "", sent: mirrorSent.sent };
      partnerTier = 0; partnerPin = null; partnerSim = null; pinSent = 0; pinLast = { bits: -1, state: "", table: "" }; glue = null; partnerShift.fill(0); reel.heldUntil = 0;
      lastBalls.fill(null); riding.fill(false); lastMoving.clear(); ridingPieces.clear();
      partnerId = -1; pendingTo = -1; refreshPrompt();
    };
    const url = () => {
      const params = new URLSearchParams(location.search);
      let base = params.get("server") || document.querySelector('meta[name="ld60-server"]')?.content || "";
      if (!base) base = `ws://${location.hostname || "127.0.0.1"}:8101/socket`;
      const target = new URL(base);
      target.searchParams.set("room", params.get("room") || "lobby");
      target.searchParams.set("name", displayName);
      return target;
    };
    const updateCount = () => { playersLabel.textContent = myId < 0 ? "" : `${peers.size + 1} in room`; };
    const connect = name => {
      if (socket) return;
      clearTimeout(reconnectTimer); reconnectTimer = 0;
      displayName = name;
      closedByUs = false;
      say("Connecting…");
      let target;
      try { target = url(); } catch (error) { say("No multiplayer server is configured; wandering alone."); return; }
      socket = new WebSocket(target);
      socket.binaryType = "arraybuffer";
      socket.addEventListener("open", () => say(""));
      socket.addEventListener("message", onMessage);
      socket.addEventListener("close", event => {
        const wasJoined = myId >= 0;
        endPartnership(); requestFrom = -1; pairs = []; refreshPrompt();
        for (const id of [...peers.keys()]) dropPeer(id);
        myId = -1; updateCount();
        socket = null;
        if (closedByUs) return;
        if (event.code === 4001) { say("That room is full right now. Reload to try again."); return; }
        if (event.code === 1008 || event.code === 1009 || event.code === 1007) { say(`Disconnected by the server (${event.reason || event.code}).`); return; }
        if (!wasJoined && event.code === 1006 && attempts === 0) say("The room server is not reachable; you are alone here. Retrying…");
        else say("Connection lost. Reconnecting…");
        if (attempts++ < 6) reconnectTimer = setTimeout(() => { reconnectTimer = 0; if (!closedByUs && !socket) connect(displayName); }, Math.min(15000, 1000 * 2 ** attempts));
        else say("Could not reach the room server. Reload to try again.");
      });
    };
    const dropPeer = id => {
      peers.delete(id); wasm.net_remove(id); voice.forget(id); dropBubble(id); stanceRopes.delete(id); remotePresses.delete(id);
      renderer.forgetPlayer(id); palettes.delete(id); stanceCache[id + 1] = undefined;
      for (const values of [phases, gaits, crouches, prones, airs, plays]) values[id + 1] = 0;
      if (requestFrom === id) requestFrom = -1;
      if (pendingTo === id) pendingTo = -1;
      if (rails?.id === id) endRails();
    };
    const onMessage = event => {
      if (event.data instanceof ArrayBuffer) {
        const bytes = new Uint8Array(event.data);
        if (bytes.length > io.length) return;
        io.set(bytes);
        wasm.net_apply_state(bytes.length, performance.now() / 1000);
        return;
      }
      let message;
      if (typeof event.data !== "string" || event.data.length > 16384) return;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!message || typeof message !== "object" || Array.isArray(message)) return;
      switch (message.t) {
        case "welcome":
          attempts = 0;
          myId = message.id;
          wasm.game_join(myId);
          wasm.game_set_holding(holding ? 1 : 0, playing ? 1 : 0);
          wasm.game_set_world(worldBits);
          for (const id of [...peers.keys()]) dropPeer(id);
          for (const p of message.players) peers.set(p.id, { name: p.name });
          stanceRopes.clear();
          for (const id of message.cables || []) if (id !== myId) stanceRopes.set(id, { start: -Infinity, rope: null });
          if (heldCable) sendJson({ t: "cable", out: true });
          pairs = message.pairs || [];
          links.sync(pairs);
          voice.configure(message.ice || []);
          updateCount(); refreshPrompt();
          say("");
          canvas.dataset.id = String(myId);
          break;
        case "join":
          peers.set(message.id, { name: message.name });
          updateCount();
          break;
        case "leave":
          dropPeer(message.id);
          updateCount(); refreshPrompt();
          break;
        case "signal":
          if (partnerId < 0 || message.from !== partnerId || !validSignal(message.data)) break;
          if (message.data.mirror) mirrorReceive(message.data.mirror);
          else if (message.data.pinHit === "x" || message.data.pinHit === "y") {
            const b = holding?.game?.kind === "pinball" ? holding.game.p?.ball : null;
            const at = Number.isFinite(message.data.at) ? Math.max(0, Math.min(400, message.data.at)) : null;
            if (b) { if (message.data.pinHit === "y") { if (at !== null) b.y = at; b.vy = Math.abs(b.vy) * 0.7; } else { if (at !== null) b.x = at; b.vx = -b.vx * 0.7; } pinLast.state = ""; }
          }
          else if ("pin" in message.data) {
            const d = message.data.pin, now = performance.now();
            const ok = d && typeof d === "object" && PINBALL.TABLES[d.t] && Array.isArray(d.b) && d.b.length === 4 && d.b.every(v => Number.isFinite(v) && Math.abs(v) < 5000) &&
              typeof d.s === "string" && d.s.length < 12 && Array.isArray(d.f) && d.f.length === 4 && d.f.every(Number.isFinite) && Number.isFinite(d.at) && Number.isInteger(d.c) && Number.isInteger(d.i);
            if (ok) { d.c = Math.max(0, Math.min(PIN_CUBE_MAX, d.c)); adoptPin(d, now); partnerPin = { at: now }; } else { partnerPin = null; partnerSim = null; }
          }
          else if (message.data.squish) { if (!koUntil) knockOut(true); }
          else if (Number.isInteger(message.data.teleport)) teleportTo(message.data.teleport, false);
          else if (message.data.cube === 1) addCube(false);
          else if (message.data.micro) partnerMicro = { w: message.data.micro.w, l: message.data.micro.l };
          else if (message.data.ride) partnerRideFrom(message.data.ride);
          else if (Number.isInteger(message.data.tier) && message.data.tier >= 0 && message.data.tier < DEVICES.length) {
            partnerTier = message.data.tier;
          }
          else if (Array.isArray(message.data.reel) && message.data.reel.length === 2 && message.data.reel.every(Number.isFinite)) {
            {
              const active = message.data.reel[1] === 1, t = performance.now();
              reel.partner = { length: Math.min(LINK_LENGTH, Math.max(REEL_MIN, message.data.reel[0])), active, at: t, until: t + 400, activeUntil: active ? t + REEL_MEMORY_MS : (reel.partner?.activeUntil ?? 0) };
            }
          }
          else if (message.data.over) { if (holding && BRICKS.topOut(holding.bricks)) { holding.dirty = true; showNotice(`${nameOf(message.from)} was squished! Game over for both.`); } }
          else voice.signal(message.from, message.data);
          break;
        case "voice":
          if (message.from === myId || message.from === partnerId || !validSignal(message.data) || !(message.data.description || message.data.candidate || message.data.candidates)) break;
          voice.signal(message.from, message.data);
          break;
        case "chat":
          showBubble(message.from, message.name, message.text);
          break;
        case "partner-request":
          requestFrom = message.from; refreshPrompt();
          rails = { id: message.from, role: "asked", until: performance.now() + REQUEST_TTL_MS };
          dialog.show("LINK CABLE", ["Cable detected!", `${nameOf(message.from)} is ready.`, holding ? "Connect?" : "Need a Game Boy!"],
            [["YES", linkAction, "F"], ["NO", cancelAction, "X"]], { state: "calling" });
          break;
        case "partner-withdrawn":
          if (requestFrom === message.from) { requestFrom = -1; refreshPrompt(); }
          if (rails?.id === message.from) { endRails(); dialog.show("LINK CANCELLED", ["The link was broken.", `${nameOf(message.from)} disconnected.`], [["OK", dialog.hide, "X"]], { ttl: 4000, state: "off" }); }
          break;
        case "partner-pending":
          pendingTo = message.to; pendingUntil = performance.now() + REQUEST_TTL_MS; refreshPrompt();
          break;
        case "partner-failed":
          pendingTo = -1; refreshPrompt();
          if (rails?.id === message.to) endRails();
          if (message.reason === "declined") dialog.show("LINK REFUSED", [`${nameOf(message.to)} declined.`, "Link closed."], [["OK", dialog.hide, "X"]], { ttl: 5000, state: "off" });
          else showNotice(`Could not link with ${nameOf(message.to)}: ${message.reason}.`);
          break;
        case "partnered":
          partnerId = message.id; pendingTo = -1; requestFrom = -1; refreshPrompt();
          endRails();
          {
            const initiator = message.offer ? message.id : myId, other = message.offer ? myId : message.id;
            const held = initiator === myId ? heldCable : stanceRopes.get(initiator);
            links.begin(initiator, other, held ? Math.min(nowSeconds() - held.start, POCKET + PLUG) : 0, held?.rope ?? null);
            stanceRopes.delete(initiator);
            if (heldCable) { heldCable = null; sendJson({ t: "cable", out: false }); }
          }
          showNotice(`Linked with ${message.name}. E to play, M to talk.`);
          voice.open(message.id, message.offer);
          sendJson({ t: "signal", to: partnerId, data: { tier: holding?.tier || 0 } });
          break;
        case "finish":
          showBoard(message);
          break;
        case "unpartnered":
          showNotice(`Link with ${nameOf(message.id)} ended (${message.reason}).`);
          endPartnership();
          break;
        case "partners":
          pairs = message.pairs || [];
          links.sync(pairs);
          break;
        case "cable":
          if (message.from === myId) break;
          if (message.out) { if (!stanceRopes.has(message.from)) stanceRopes.set(message.from, { start: nowSeconds(), rope: null }); }
          else stanceRopes.delete(message.from);
          break;
        case "ice":
          if (Array.isArray(message.ice)) voice.configure(message.ice);
          break;
      }
    };
    const sendJson = message => {
      if (socket?.readyState !== 1 || socket.bufferedAmount > SEND_BACKLOG_TEXT) return false;
      socket.send(JSON.stringify(message)); return true;
    };
    return {
      connect,
      send: packet => { if (socket?.readyState !== 1 || socket.bufferedAmount > SEND_BACKLOG) return false; socket.send(packet); return true; },
      sendJson,
      chat: text => sendJson({ t: "chat", text }),
      propose(id) { if (myId >= 0 && partnerId < 0 && pendingTo < 0) sendJson({ t: "partner", to: id }); },
      accept() { if (myId >= 0 && partnerId < 0 && requestFrom >= 0) sendJson({ t: "partner", to: requestFrom }); },
      decline() { if (myId >= 0 && partnerId < 0 && requestFrom >= 0) { sendJson({ t: "unpartner" }); requestFrom = -1; refreshPrompt(); } },
      cable: out => sendJson({ t: "cable", out: Boolean(out) }),
      partnerId: () => partnerId, requestFrom: () => requestFrom, nameOf,
      pendingTo: () => {
        if (pendingTo >= 0 && performance.now() > pendingUntil) { pendingTo = -1; refreshPrompt(); }
        return pendingTo;
      },
      unpartner: () => {
        if (partnerId >= 0 || pendingTo >= 0) sendJson({ t: "unpartner" });
        if (partnerId < 0 && pendingTo >= 0) { pendingTo = -1; refreshPrompt(); }
      },
      isPartnered: id => pairs.some(pair => pair.includes(id)),
      partnered: () => partnerId >= 0,
      myId: () => myId,
      open: () => socket?.readyState === 1 && myId >= 0,
      id: () => Math.max(0, myId),
      known: id => peers.has(id),
      close: () => { closedByUs = true; clearTimeout(reconnectTimer); reconnectTimer = 0; socket?.close(1000); },
    };
  }

  function createVoice() {
    let context = null, master = null, micStream = null, micAnalyser = null, muted = true, iceServers = [];
    let speakingUntil = 0;
    const peers = new Map();
    const samples = new Uint8Array(512);
    let music = null, duck = null;
    const ensureContext = () => {
      if (!context) {
        context = new (window.AudioContext || window.webkitAudioContext)();
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.15;
        limiter.connect(context.destination);
        master = context.createGain(); master.gain.value = 1; master.connect(limiter);
        duck = context.createGain(); duck.connect(master);
        music = context.createGain(); music.gain.value = MUSIC_GAIN; music.connect(duck);
      }
      if (context.state === "suspended") context.resume().catch(() => {});
      return context;
    };
    const SONGS = { menu: "LD60_MENU", summit: "LD60_TUNI", stage1: "LD60_STAGE1", stage2: "LD60_STAGE2", select: "LD60_STAGESELECT" };
    const songLevels = {}, songs = {};
    const song = (name, level) => {
      songLevels[name] = +level.toFixed(2);
      const data = self[SONGS[name]];
      if (!data || !context) return;
      const entry = songs[name] || (songs[name] = { gain: null, loading: false });
      if (!entry.gain) {
        if (entry.loading || level <= 0) return;
        entry.loading = true;
        context.decodeAudioData(Uint8Array.from(atob(data), ch => ch.charCodeAt(0)).buffer).then(buffer => {
          const source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
          entry.gain = context.createGain(); entry.gain.gain.value = 0;
          source.connect(entry.gain); entry.gain.connect(music); source.start();
        }).catch(() => {});
        return;
      }
      entry.gain.gain.setTargetAtTime(Math.min(1, Math.max(0, level)), context.currentTime, 0.3);
    };
    const setDuck = on => { if (duck) duck.gain.setTargetAtTime(on ? MUSIC_DUCK : 1, context.currentTime, on ? 0.08 : 0.6); };
    const ZONES = { [-1]: { levels: 0, low: 20000, high: 10, voice: 0 }, 0: { levels: 10, low: 2600, high: 320, voice: 0.7 },
      1: { levels: 24, low: 4800, high: 180, voice: 0.5 }, 2: { levels: 72, low: 9000, high: 80, voice: 0.35 } };
    const curves = {};
    const curve = levels => curves[levels] || (curves[levels] = Float32Array.from({ length: 2049 }, (_, i) => { const x = i / 1024 - 1; return Math.round(x * levels) / levels; }));
    const zoneChain = () => {
      const input = context.createGain(), shaper = context.createWaveShaper(), low = context.createBiquadFilter(), high = context.createBiquadFilter();
      low.type = "lowpass"; high.type = "highpass"; low.frequency.value = 20000; high.frequency.value = 10;
      input.connect(shaper); shaper.connect(high); high.connect(low);
      return { input, output: low, set(z) { shaper.curve = z.levels ? curve(z.levels) : null; low.frequency.setTargetAtTime(z.low, context.currentTime, 0.2); high.frequency.setTargetAtTime(z.high, context.currentTime, 0.2); } };
    };
    let buses = null, zone = -1;
    const bus = () => {
      if (buses || !ensureContext()) return buses;
      const sfx = zoneChain(); sfx.output.connect(master);
      const voiceIn = context.createGain(), dry = context.createGain(), wet = zoneChain(), wetGain = context.createGain();
      voiceIn.connect(dry); dry.connect(master); voiceIn.connect(wet.input); wet.output.connect(wetGain); wetGain.connect(master);
      dry.gain.value = 1; wetGain.gain.value = 0;
      const device = context.createGain(); device.gain.value = 1; device.connect(master);
      buses = { sfx: sfx.input, voice: voiceIn, device, trims: {}, set(z) { sfx.set(z); wet.set(z); wetGain.gain.setTargetAtTime(z.voice, context.currentTime, 0.2); dry.gain.setTargetAtTime(1 - z.voice, context.currentTime, 0.2); } };
      buses.set(ZONES[zone]);
      return buses;
    };
    const setZone = tier => { if (tier === zone) return; zone = tier; if (buses) buses.set(ZONES[tier] || ZONES[-1]); };
    let noiseBuffer = null;
    const noise = () => {
      if (noiseBuffer) return noiseBuffer;
      noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const d = noiseBuffer.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return noiseBuffer;
    };
    const tone = (out, { at = 0, freq = 440, to = 0, len = 0.08, vol = 0.2, type = "square" }) => {
      const t = context.currentTime + at, o = context.createOscillator(), g = context.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + len);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0005, t + len);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.02);
      o.onended = () => { o.disconnect(); g.disconnect(); };
    };
    const hiss = (out, { at = 0, len = 0.06, vol = 0.2, freq = 1200, to = 0, q = 0.8, type = "bandpass" }) => {
      const t = context.currentTime + at, src = context.createBufferSource(), f = context.createBiquadFilter(), g = context.createGain();
      src.buffer = noise(); src.playbackRate.value = 0.5 + Math.random();
      f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t); if (to) f.frequency.exponentialRampToValueAtTime(to, t + len);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0005, t + len);
      src.connect(f); f.connect(g); g.connect(out); src.start(t, Math.random() * 0.5); src.stop(t + len + 0.02);
      src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
    };
    const NOTE = n => 440 * 2 ** ((n - 69) / 12);
    const played = {};
    const trimmed = (b, name) => b.trims[name] || (b.trims[name] = [b.device, b.sfx].map(out => {
      const g = context.createGain(); g.gain.value = SFX_TRIM[name]; g.connect(out); return g;
    }));
    const microSound = name => {
      const b = bus(); if (!b) return;
      played["micro"] = (played["micro"] || 0) + 1;
      MICRO.sfx(context, name, trimmed(b, "micro")[0]);
    };
    const pinballSound = name => {
      const b = bus(); if (!b) return;
      played["pinball"] = (played["pinball"] || 0) + 1;
      PINBALL.sfx(context, name, trimmed(b, "pinball")[0]);
    };
    const play = (name, value = 0) => {
      if (!Object.hasOwn(SFX_TRIM, name)) return;
      const b = bus(); if (!b) return;
      played[name] = (played[name] || 0) + 1;
      const [d, s] = trimmed(b, name);
      if (name === "move") tone(d, { freq: 1046, len: 0.025, vol: 0.06 });
      else if (name === "rotate") { tone(d, { freq: 1568, to: 2093, len: 0.035, vol: 0.06 }); }
      else if (name === "lock") { hiss(d, { len: 0.09, vol: 0.5, freq: 900, to: 250, q: 1.2 }); tone(d, { freq: 140, to: 70, len: 0.08, vol: 0.18 }); tone(d, { freq: 330, len: 0.02, vol: 0.05 }); }
      else if (name === "clear") {
        const four = value >= 4;
        hiss(d, { len: four ? 0.7 : 0.45, vol: 0.35, freq: 400, to: 5000, q: 2 });
        const notes = four ? [72, 76, 79, 84, 79, 84, 88, 91] : [72, 76, 79, 84].slice(0, 2 + Math.min(value, 2));
        notes.forEach((n, i) => tone(d, { at: i * 0.055, freq: NOTE(n), len: 0.07, vol: 0.09 }));
      }
      else if (name === "over") {
        [76, 75, 74, 73, 72, 71, 70, 69].forEach((n, i) => { tone(d, { at: i * 0.13, freq: NOTE(n), len: 0.14, vol: 0.1 }); tone(d, { at: i * 0.13, freq: NOTE(n - 12), len: 0.14, vol: 0.06, type: "triangle" }); });
        tone(d, { at: 1.1, freq: NOTE(45), to: NOTE(33), len: 0.5, vol: 0.14, type: "triangle" }); hiss(d, { at: 1.1, len: 0.4, vol: 0.2, freq: 300, to: 80 });
      }
      else if (name === "pause") { tone(d, { freq: NOTE(84), len: 0.05, vol: 0.08 }); tone(d, { at: 0.07, freq: NOTE(91), len: 0.07, vol: 0.08 }); }
      else if (name === "click") { const k = 1 + value * 0.25; hiss(s, { len: 0.014, vol: 0.35, freq: 3200 * k, q: 3 }); tone(s, { freq: 2400 * k, len: 0.012, vol: 0.05, type: "triangle" }); }
      else if (name === "release") hiss(s, { len: 0.01, vol: 0.12, freq: 2600, q: 3 });
      else if (name === "step") { hiss(s, { len: 0.07, vol: 0.09 + Math.random() * 0.03, freq: 320 + Math.random() * 120, to: 160, q: 0.9, type: "lowpass" }); hiss(s, { at: 0.012, len: 0.03, vol: 0.02, freq: 2200, q: 1 }); }
      else if (name === "jump") { tone(s, { freq: 180, to: 420, len: 0.14, vol: 0.06, type: "triangle" }); hiss(s, { len: 0.08, vol: 0.06, freq: 500, to: 1500 }); }
      else if (name === "land") hiss(s, { len: 0.11, vol: 0.16, freq: 260, to: 110, q: 0.8, type: "lowpass" });
    };
    const measure = async (name, value = 0, untrimmed = false, inZone = -1) => {
      const saved = { context, master, buses, zone }, rate = 48000;
      const offline = new OfflineAudioContext(1, rate * 2.5, rate);
      try {
        context = offline; master = offline.createGain(); master.connect(offline.destination); buses = null; zone = inZone;
        const trims = untrimmed ? { ...SFX_TRIM } : null;
        if (untrimmed) for (const k of Object.keys(SFX_TRIM)) SFX_TRIM[k] = 1;
        if (name.startsWith("pinball:")) pinballSound(name.slice(8)); else if (name.startsWith("micro:")) microSound(name.slice(6)); else play(name, value);
        if (trims) Object.assign(SFX_TRIM, trims);
      } finally { ({ context, master, buses, zone } = saved); }
      const data = (await offline.startRendering()).getChannelData(0), win = rate / 10;
      let peak = 0, loud = 0, sum = 0;
      for (let i = 0; i < data.length; i++) {
        peak = Math.max(peak, Math.abs(data[i])); sum += data[i] * data[i];
        if (i >= win) sum -= data[i - win] * data[i - win];
        if (i >= win - 1) loud = Math.max(loud, sum / win);
      }
      const db = v => +(20 * Math.log10(Math.max(v, 1e-9))).toFixed(1);
      return { peak: db(peak), loud: db(Math.sqrt(loud)) };
    };
    let micRequest = null;
    const enableMicrophone = () => {
      if (micStream) return Promise.resolve();
      if (micRequest) return micRequest;
      ensureContext();
      micRequest = (async () => {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        micAnalyser = context.createAnalyser(); micAnalyser.fftSize = 512;
        context.createMediaStreamSource(micStream).connect(micAnalyser);
        setMuted(muted);
      })().finally(() => { micRequest = null; });
      return micRequest;
    };
    const speaking = () => {
      if (!micAnalyser || muted) return false;
      micAnalyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) { const v = (s - 128) / 128; sum += v * v; }
      const now = performance.now();
      if (Math.sqrt(sum / samples.length) > 0.03) speakingUntil = now + 250;
      return now < speakingUntil;
    };
    const setMuted = value => {
      muted = value;
      if (micStream) for (const track of micStream.getAudioTracks()) track.enabled = !muted;
      muteButton.setAttribute("aria-pressed", String(muted));
      muteButton.setAttribute("aria-label", `Voice: mic ${muted ? "muted" : "on"} (M)`);
    };
    let asking = false, muteChanges = 0;
    const toggleMute = async () => {
      if (micStream) { setMuted(!muted); return; }
      if (asking) return;
      const epoch = muteChanges;
      asking = true;
      try { await enableMicrophone(); }
      catch (error) { showNotice("No microphone: " + (error.message || "permission refused")); return; }
      finally { asking = false; }
      if (epoch !== muteChanges) return;
      const track = micStream.getAudioTracks()[0];
      for (const entry of peers.values()) {
        try {
          const transceiver = entry.pc.getTransceivers().find(t => t.receiver.track.kind === "audio");
          if (transceiver) {
            transceiver.direction = "sendrecv";
            await transceiver.sender.replaceTrack(track);
            if (epoch !== muteChanges) return;
            transceiver.sender.setStreams?.(micStream);
          } else entry.pc.addTrack(track, micStream);
        } catch (error) { if (epoch === muteChanges) console.warn("microphone track", error); }
      }
      if (epoch === muteChanges) setMuted(false);
    };
    const peer = (id, polite) => {
      let entry = peers.get(id);
      if (entry) return entry;
      const pc = new RTCPeerConnection({ iceServers });
      entry = { pc, polite, outbox: [], flushTimer: 0, attached: !polite, makingOffer: false, ignoreOffer: false, queue: Promise.resolve(), queued: 0, pending: [], panner: null, element: null, source: null, restarts: 0, lastRestart: -Infinity, state: "new", stateAt: performance.now() };
      peers.set(id, entry);
      if (!polite) {
        if (micStream) for (const track of micStream.getAudioTracks()) pc.addTrack(track, micStream);
        else pc.addTransceiver("audio", { direction: "recvonly" });
      }
      pc.onicecandidate = ({ candidate }) => {
        if (!candidate || peers.get(id) !== entry || entry.outbox.length >= MAX_PENDING_CANDIDATES) return;
        entry.outbox.push(candidate);
        if (!entry.flushTimer) entry.flushTimer = setTimeout(() => flush(id, entry), CANDIDATE_BATCH_MS);
      };
      pc.onnegotiationneeded = async () => {
        if (!entry.attached || peers.get(id) !== entry) return;
        try {
          entry.makingOffer = true;
          await pc.setLocalDescription();
          sendDescription(id, entry);
        } catch (error) { console.warn("offer failed", error); } finally { entry.makingOffer = false; }
      };
      pc.ontrack = ({ streams, track }) => {
        if (peers.get(id) !== entry || track.kind !== "audio") return;
        detachAudio(entry);
        const stream = streams[0] || new MediaStream([track]);
        const element = document.createElement("audio");
        element.autoplay = true; element.muted = true; element.srcObject = stream; voices.append(element);
        element.play().catch(() => {});
        ensureContext();
        const source = context.createMediaStreamSource(stream);
        const gain = context.createGain(), panner = context.createPanner();
        gain.gain.value = 0;
        panner.panningModel = "equalpower"; panner.distanceModel = "linear"; panner.rolloffFactor = 0;
        source.connect(gain); gain.connect(panner); panner.connect(bus()?.voice || master);
        entry.element = element; entry.source = source; entry.gain = gain; entry.panner = panner; entry.gainLevel = 0;
      };
      pc.onconnectionstatechange = () => {
        entry.state = pc.connectionState; entry.stateAt = performance.now();
        if (pc.connectionState !== "failed" || polite) return;
        const now = performance.now();
        if (entry.restarts >= 3 || now - entry.lastRestart < 10000) return;
        entry.restarts += 1; entry.lastRestart = now;
        pc.restartIce?.();
      };
      return entry;
    };
    const open = (id, offer) => { remove(id); peer(id, !offer); };
    const signal = (id, data) => {
      let entry = peers.get(id);
      if (!entry && id !== net.partnerId() && data?.description?.type === "offer" && id < net.myId() && peers.size < VOICE_PEERS_HARD && distanceTo(id) <= VOICE_CLOSE_DISTANCE) entry = peer(id, true);
      if (!entry || entry.queued >= 64) return Promise.resolve();
      entry.queued++;
      entry.queue = entry.queue.then(() => handleSignal(entry, id, data)).finally(() => { entry.queued--; });
      return entry.queue;
    };
    const handleSignal = async (entry, id, data) => {
      const { pc } = entry;
      if (peers.get(id) !== entry) return;
      try {
        if (data.description) {
          const collision = data.description.type === "offer" && (entry.makingOffer || pc.signalingState !== "stable");
          entry.ignoreOffer = collision && !entry.polite;
          if (entry.ignoreOffer) return;
          await pc.setRemoteDescription(data.description);
          if (peers.get(id) !== entry) return;
          if (!entry.attached) {
            entry.attached = true;
            const track = micStream?.getAudioTracks()[0];
            const transceiver = pc.getTransceivers().find(t => t.receiver.track.kind === "audio");
            if (track && transceiver) {
              transceiver.direction = "sendrecv";
              await transceiver.sender.replaceTrack(track);
              transceiver.sender.setStreams?.(micStream);
            }
          }
          for (const candidate of entry.pending.splice(0)) await pc.addIceCandidate(candidate).catch(error => console.warn("candidate", id, error));
          if (peers.get(id) !== entry) return;
          if (data.description.type === "offer") {
            await pc.setLocalDescription();
            sendDescription(id, entry);
          }
        } else if (data.candidate || Array.isArray(data.candidates)) {
          for (const candidate of data.candidates || [data.candidate]) {
            if (peers.get(id) !== entry) return;
            if (entry.ignoreOffer) continue;
            if (!pc.remoteDescription) { if (entry.pending.length < MAX_PENDING_CANDIDATES) entry.pending.push(candidate); continue; }
            await pc.addIceCandidate(candidate).catch(error => { if (!entry.ignoreOffer) console.warn("candidate", id, error); });
          }
        }
      } catch (error) { console.warn("signaling", id, error); }
    };
    const CANDIDATE_BATCH_MS = 50, CANDIDATES_PER_MESSAGE = 20, MAX_PENDING_CANDIDATES = 128;
    const send = (id, data) => net.sendJson({ t: id === net.partnerId() ? "signal" : "voice", to: id, data });
    const flush = (id, entry) => {
      clearTimeout(entry.flushTimer); entry.flushTimer = 0;
      if (peers.get(id) !== entry) { entry.outbox.length = 0; return; }
      while (entry.outbox.length) send(id, { candidates: entry.outbox.splice(0, CANDIDATES_PER_MESSAGE) });
    };
    const sendDescription = (id, entry) => {
      if (peers.get(id) !== entry) return;
      flush(id, entry);
      send(id, { description: entry.pc.localDescription });
    };
    const detachAudio = entry => {
      entry.source?.disconnect(); entry.gain?.disconnect(); entry.panner?.disconnect();
      if (entry.element) { entry.element.pause(); entry.element.srcObject = null; entry.element.remove(); }
      entry.source = entry.gain = entry.panner = entry.element = null;
    };
    const remove = id => {
      const entry = peers.get(id);
      if (!entry) return;
      clearTimeout(entry.flushTimer);
      peers.delete(id);
      entry.pending.length = entry.outbox.length = 0;
      entry.pc.onicecandidate = entry.pc.onnegotiationneeded = entry.pc.ontrack = entry.pc.onconnectionstatechange = null;
      entry.pc.close();
      detachAudio(entry);
    };
    const where = new Map(), retryAt = new Map(); let hearing = null, lastDial = -Infinity, mode = "none";
    const dead = (entry, now) => entry.state === "failed" || entry.state === "closed" || (entry.state !== "connected" && now - entry.stateAt > VOICE_CONNECT_MS);
    const distanceTo = id => { const p = where.get(id); return p && hearing ? Math.hypot(p[0] - hearing[0], p[1] - hearing[1], p[2] - hearing[2]) : Infinity; };
    const place = (id, x, y, z) => {
      where.set(id, [x, y, z]);
      const entry = peers.get(id), panner = entry?.panner;
      if (!panner) return;
      if (panner.positionX) { panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z; }
      else panner.setPosition(x, y, z);
      const partner = net.partnerId();
      const heard = mode === "lobby" || (mode === "partner" && id === partner);
      const level = heard ? voiceGain(distanceTo(id), id === partner, partner >= 0) : 0;
      if (Math.abs(level - entry.gainLevel) < 0.002) return;
      entry.gainLevel = level;
      entry.gain.gain.setTargetAtTime(level, context.currentTime, 0.05);
    };
    const manage = now => {
      const me = net.myId(), partner = net.partnerId();
      if (me < 0 || !hearing) return;
      const near = [...where.keys()].filter(id => id !== me && id !== partner).map(id => [id, distanceTo(id)]).sort((a, b) => a[1] - b[1]);
      const keep = new Set(near.filter(([, d]) => d <= VOICE_CLOSE_DISTANCE).slice(0, VOICE_PEERS_HARD).map(([id]) => id));
      for (const [id, entry] of [...peers]) {
        if (id === partner) continue;
        if (!keep.has(id)) remove(id);
        else if (dead(entry, now)) { remove(id); retryAt.set(id, now + VOICE_RETRY_MS); }
      }
      if (now - lastDial < VOICE_DIAL_MS) return;
      for (const [id, d] of near.slice(0, VOICE_PEERS)) {
        if (d > VOICE_OPEN_DISTANCE) break;
        if (!peers.has(id) && me < id && peers.size < VOICE_PEERS_HARD && (retryAt.get(id) ?? 0) <= now) { peer(id, false); lastDial = now; break; }
      }
    };
    const forget = id => { remove(id); where.delete(id); retryAt.delete(id); };
    const listener = (position, forward) => {
      hearing = position;
      if (!context) return;
      const l = context.listener;
      if (l.positionX) {
        l.positionX.value = position[0]; l.positionY.value = position[1]; l.positionZ.value = position[2];
        l.forwardX.value = forward[0]; l.forwardY.value = forward[1]; l.forwardZ.value = forward[2];
        l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
      } else { l.setPosition(...position); l.setOrientation(forward[0], forward[1], forward[2], 0, 1, 0); }
    };
    const nowPlaying = () => { let best = "", level = 0.04; for (const [name, l] of Object.entries(songLevels)) if (l > level) { best = name; level = l; } return best; };
    return { ensureContext, enableMicrophone, speaking, toggleMute, setMuted: value => { muteChanges++; setMuted(value); }, open, close: remove, forget, manage, signal, place, listener, nowPlaying, gainOf: id => peers.get(id)?.gain?.gain.value ?? null, calls: () => [...peers.keys()], mode: () => mode, setMode: value => { if (["none", "partner", "lobby"].includes(value)) mode = value; }, song, play, pinballSound, microSound, setZone, setDuck, measure, played: () => played, zone: () => zone, songLevel: () => Object.entries(songLevels).map(([k, v]) => `${k}:${v}`).join(","), track: name => (songs[name]?.gain ? 0 : -1),
      configure: servers => { iceServers = servers; }, hasMicrophone: () => Boolean(micStream),
      connected: () => [...peers.values()].filter(p => p.pc.connectionState === "connected").length,
      async received() {
        let packets = 0;
        for (const { pc } of peers.values()) {
          for (const report of (await pc.getStats()).values()) if (report.type === "inbound-rtp" && report.kind === "audio") packets += report.packetsReceived || 0;
        }
        return packets;
      } };
  }
}
