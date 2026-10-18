const PINBALL_ART = (() => {
  const W = 160, H = 144, VIEW = 136, TW = W / 8, TH = H / 8;
  const c = (r, g, b) => [r, g, b].map(v => Math.round(v * 255 / 31));
  const FIELD = 0, WALL = 1, GUIDE = 2, BUMPER = 3, FLASH = 4, HOLE = 5, MASCOT = 6, HUD = 7;
  const WHITE = c(31, 31, 31);
  const BG = [
    [WHITE, c(24, 27, 31), c(13, 17, 30), c(3, 5, 15)],
    [WHITE, c(19, 26, 31), c(7, 15, 30), c(2, 4, 14)],
    [WHITE, c(12, 26, 10), c(3, 15, 5), c(1, 5, 2)],
    [WHITE, c(31, 9, 11), c(20, 2, 6), c(7, 1, 3)],
    [WHITE, c(31, 26, 4), c(27, 14, 1), c(9, 4, 1)],
    [WHITE, c(20, 12, 29), c(10, 4, 19), c(3, 1, 8)],
    [WHITE, c(31, 19, 24), c(25, 8, 18), c(8, 2, 7)],
    [c(2, 2, 8), c(10, 13, 25), c(23, 25, 31), WHITE],
  ];
  const OBJ = [c(31, 31, 31), c(19, 22, 28), c(3, 3, 10)];
  const TABLE_MAX = 320, TTH = TABLE_MAX / 8;
  const shade = new Uint8Array(W * H), attr = new Uint8Array(TW * TH), obj = new Uint8Array(W * H);
  const shadeT = new Uint8Array(W * TABLE_MAX), attrT = new Uint8Array(TW * TTH);
  const statics = new Map();
  let cam = 0, viewH = VIEW, protect = null;

  const px = (x, y, s, pal) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= W || y < 0 || y >= viewH) return;
    const ty = y + cam, tile = (ty >> 3) * TW + (x >> 3);
    shadeT[ty * W + x] = s;
    if (pal !== undefined && pal !== null && !(protect && protect[tile])) attrT[tile] = pal;
  };
  const opx = (x, y, s) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y < VIEW) obj[y * W + x] = s + 1; };
  const area = (x0, y0, x1, y1, fn) => {
    for (let y = Math.max(0, Math.floor(y0 - cam)); y <= Math.min(viewH - 1, Math.ceil(y1 - cam)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) fn(x, y + cam, y);
  };
  const disc = (cx, cy, r, s, pal) => area(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, (x, y, sy) => { if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) px(x, sy, s, pal); });
  const segDist = (x, y, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l));
    return [Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t), t];
  };
  const stroke = (a, b, ra, rb, s, pal, sprite = false) => {
    const r = Math.max(ra, rb);
    area(Math.min(a[0], b[0]) - r - 1, Math.min(a[1], b[1]) - r - 1, Math.max(a[0], b[0]) + r + 1, Math.max(a[1], b[1]) + r + 1, (x, y, sy) => {
      const [d, t] = segDist(x + 0.5, y + 0.5, a, b);
      if (d <= ra + (rb - ra) * t) sprite ? opx(x, sy, s) : px(x, sy, s, pal);
    });
  };
  const bevel = (a, b, r, pal) => { stroke(a, b, r + 1, r + 1, 3, pal); stroke(a, b, r, r, 2, pal); stroke(a, b, r * 0.4, r * 0.4, 1, pal); };
  const tri = (p, q, r, s, pal) => {
    const sign = (a, b, c2) => (a[0] - c2[0]) * (b[1] - c2[1]) - (b[0] - c2[0]) * (a[1] - c2[1]);
    area(Math.min(p[0], q[0], r[0]), Math.min(p[1], q[1], r[1]), Math.max(p[0], q[0], r[0]), Math.max(p[1], q[1], r[1]), (x, y, sy) => {
      const pt = [x + 0.5, y + 0.5], d1 = sign(pt, p, q), d2 = sign(pt, q, r), d3 = sign(pt, r, p);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) px(x, sy, s, pal);
    });
  };
  const rect = (x0, y0, x1, y1, s, pal) => area(x0, y0, x1 - 1, y1 - 1, (x, y, sy) => px(x, sy, s, pal));
  const text = (str, x, y, s, pal, screen = false) => {
    for (const ch of String(str).toUpperCase()) {
      const g = PINBALL.GLYPHS[ch] || PINBALL.GLYPHS[" "];
      for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) if (+g[row] & (4 >> col)) {
        if (screen) { const X = x + col, Y = y + row; if (X >= 0 && X < W && Y >= 0 && Y < H) { shade[Y * W + X] = s; attr[(Y >> 3) * TW + (X >> 3)] = pal; } }
        else px(x + col, y + row - cam, s, pal);
      }
      x += 4;
    }
  };
  const chevron = (x, y, dx, dy, size, s, pal) => {
    const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
    const tip = [x + ux * size, y + uy * size], l1 = [x + nx * size * 0.8, y + ny * size * 0.8], l2 = [x - nx * size * 0.8, y - ny * size * 0.8];
    stroke(l1, tip, 1.2, 1.2, 3, pal); stroke(l2, tip, 1.2, 1.2, 3, pal);
    if (s !== 3) { stroke(l1, tip, 0.4, 0.4, s, pal); stroke(l2, tip, 0.4, 0.4, s, pal); }
  };

  const CUBBIT = [
    "....33333333....", "...3111111113...", "..311111111123..", ".31111111111223.", "3333333333332223", "3000000000003223",
    "3003300003300323", "3033330033330323", "3033330033330323", "3003300003300323", "3000000000000323", "3002000000200323",
    "3000222222000323", "3000000000000330", "3000000000000300", "3333333333333000",
  ];
  const mascot = (cx, cy, frame, happy) => {
    const bob = (frame >> 4) % 2, blink = (frame % 150) < 6;
    CUBBIT.forEach((row, r) => [...row].forEach((ch, col) => {
      if (ch === ".") return;
      let s = +ch;
      if (blink && r >= 6 && r <= 9 && s === 3 && col > 1 && col < 12) s = 0;
      if (happy && r === 11 && (col === 3 || col === 10)) s = 0;
      for (let k = 0; k < 4; k++) px(cx - 16 + col * 2 + (k & 1), cy - 16 + r * 2 + (k >> 1) + bob - cam, s, MASCOT);
    }));
  };
  const SPOTS = { ember: [74, 98], tide: [96, 132], mound: [74, 60], specter: [74, 60], vault: [74, 60] };

  const drawField = (T) => {
    attrT.fill(FIELD); shadeT.fill(0);
    for (let y = 0; y < viewH; y++) for (let x = 0; x < W; x++) {
      const ty = y + cam;
      let depth = -1;
      if (x < 6) depth = 6 - x;
      else if (x > (T.plunger ? 154 : 142)) depth = x - (T.plunger ? 154 : 142);
      else if (T.plunger && ty < 74) { const d = Math.hypot(x + 0.5 - 80, ty + 0.5 - 74) - 74; if (d > 0) depth = d; }
      if (depth >= 0) { shadeT[ty * W + x] = depth < 1.5 ? 3 : depth < 3 ? 2 : (((x + ty) >> 1) % 5 === 0) ? 0 : 1; attrT[(ty >> 3) * TW + (x >> 3)] = WALL; }
    }
  };
  const buildStatic = T => {
    const h = T.h;
    cam = 0; viewH = h; protect = null;
    drawField(T);
    const low = y => y > h - 92;
    for (const q of T.posts) { disc(q[0], q[1], q[2] + 1, 3, FLASH); disc(q[0], q[1], q[2], 1, FLASH); px(q[0] - 1, q[1] - 1, 0, FLASH); }
    const outer = w => (Math.abs(w[0] - w[2]) < 0.5 && [6, 142, 154].some(x => Math.abs(w[0] - x) < 0.5)) || (Math.abs(w[1] - w[3]) < 0.5 && w[1] >= h - 7);
    for (const w of T.walls) { const g2 = !outer(w) && low(Math.max(w[1], w[3])); bevel([w[0], w[1]], [w[2], w[3]], g2 ? 2.4 : 1.8, g2 ? GUIDE : WALL); }
    for (const w of T.gates) stroke([w[0], w[1]], [w[2], w[3]], 0.8, 0.8, 2, WALL);
    T.ramps.forEach(r => {
      const dx = r.exit[0] - r.enter[0], dy = r.exit[1] - r.enter[1], l = Math.hypot(dx, dy);
      for (let t = 6; t < l; t += 5) px(r.enter[0] + dx * t / l, r.enter[1] + dy * t / l, 2);
    });
    for (let y = 0; y < h; y++) for (let x = 3; x < W; x += 8) if ((y & 7) === 3 && attrT[(y >> 3) * TW + (x >> 3)] === FIELD && shadeT[y * W + x] === 0) shadeT[y * W + x] = 1;
    const rows = Math.ceil(h / 8), at = attrT.slice(0, rows * TW);
    const cached = { shade: shadeT.slice(0, h * W), attr: at, protect: at.map(a => (a === WALL || a === GUIDE ? 1 : 0)) };
    viewH = VIEW;
    return cached;
  };
  const drawTable = (g) => {
    const p = g.p, T = p.T, h = T.h, frame = p.frame || 0, blink = (frame >> 3) & 1;
    let cached = statics.get(T.id || p.tableId);
    if (!cached) { cached = buildStatic(T); statics.set(T.id || p.tableId, cached); }
    cam = Math.max(0, Math.min(h - VIEW, Math.round(p.cam))); viewH = VIEW;
    shadeT.set(cached.shade.subarray(cam * W, (cam + VIEW) * W), cam * W);
    const r0 = cam >> 3, r1 = Math.min(Math.ceil(h / 8), (cam + VIEW + 7) >> 3);
    attrT.set(cached.attr.subarray(r0 * TW, r1 * TW), r0 * TW);
    protect = cached.protect; obj.fill(0);
    T.targets.forEach((t, i) => stroke([t.seg[0], t.seg[1]], [t.seg[2], t.seg[3]], 2, 2, p.targetHit?.[i] ? 1 : 2, FLASH));
    T.kicks.forEach((k, i) => { if (p.kick?.[i]) chevron(k.x, k.y + 3, 0, -1, 3, blink ? 1 : 2, FLASH); });
    for (const [i, side] of [[0, x => x], [1, x => 148 - x]]) {
      const fy = T.flippers[i]?.py ?? h - 38;
      [[side(19), fy - 52, p.kick?.[i]], [side(31), fy - 74, p.saver > 0]].forEach(([x, y, on], k) => {
        disc(x, y, 3.4, 3, on ? FLASH : GUIDE); disc(x, y, 2.4, on ? (blink ? 1 : 2) : 0, on ? FLASH : GUIDE);
        rect(x - 1, y + 6, x + 1, y + 10, on ? 1 : 3, on ? FLASH : GUIDE);
        text(k ? "S" : "K", x - 1, y - 2, on ? 3 : 2, on ? FLASH : GUIDE);
      });
    }
    T.slings.forEach((w, i) => {
      const a = [w[0], w[1]], cc = [w[2], w[3]], top = a[1] < cc[1] ? a : cc, bottom = a[1] < cc[1] ? cc : a, b = [top[0], bottom[1]];
      const lit = p.slingFlash?.[i] > 0, pal = lit ? FLASH : GUIDE;
      tri(top, b, bottom, lit ? 0 : 1, pal); stroke(a, cc, 1.6, 1.6, 3, pal); stroke(top, b, 1.2, 1.2, 3, pal); stroke(b, bottom, 1.2, 1.2, 3, pal);
    });
    T.ramps.forEach(r => {
      const dx = r.exit[0] - r.enter[0], dy = r.exit[1] - r.enter[1], l = Math.hypot(dx, dy);
      for (let k = 0; k < 3; k++) {
        const on = k < (p.arrows || 0) * 1.5 || (blink && k === Math.min(2, Math.floor((p.arrows || 0) * 1.5)));
        chevron(r.enter[0] + dx / l * (k * 8 - 6), r.enter[1] + dy / l * (k * 8 - 6), dx, dy, 5, on ? 1 : 0, WALL);
      }
    });
    for (const name in T.holes) {
      const o = T.holes[name], lit = (name === "cave" && (p.arrows || 0) >= 2) && blink;
      disc(o.x, o.y, 7, 3, HOLE); disc(o.x, o.y, 6, lit ? 1 : 2, HOLE); disc(o.x, o.y, 3.5, 3, HOLE); px(o.x - 1, o.y - 2 - cam, 1, HOLE);
    }
    T.spinners.forEach((s, i) => {
      const ang = p.spinners?.[i]?.ang || 0, x0 = s[0] - s[2] / 2, y0 = s[1] - s[3] / 2;
      rect(x0 - 1, y0 - 1, x0 + s[2] + 1, y0 + s[3] + 1, 3, WALL); rect(x0, y0, x0 + s[2], y0 + s[3], 0, WALL);
      for (let k = 0; k < s[2]; k += 3) rect(x0 + k, y0 + ((Math.floor(ang * 4) + k) % 3), x0 + k + 1, y0 + s[3], 2, WALL);
    });
    T.lanes.forEach((ln, i) => {
      const lit = p.stage ? p.stage.lit && p.stage.lit[i] : p.lanes?.[i];
      disc(ln[0], ln[1], 5, 3, lit ? FLASH : GUIDE); disc(ln[0], ln[1], 4, lit ? 1 : 0, lit ? FLASH : GUIDE);
      text(String(i + 1), ln[0] - 1, ln[1] - 2, 3, lit ? FLASH : GUIDE);
    });
    T.bumpers.forEach((q, i) => {
      const hit = p.bumpFlash?.[i] > 0, r = q[2] + 1, pal = hit ? FLASH : BUMPER;
      disc(q[0], q[1], r + 1, 3, pal); disc(q[0], q[1], r, 1, pal); disc(q[0], q[1], r - 2, 2, pal); disc(q[0], q[1], r - 4, 0, pal);
      disc(q[0], q[1], 1.2, 3, pal);
    });
    for (let k = 0; k < 3; k++) chevron(74, h - 56 - k * 7, 0, -1, 3.5, (frame >> 3) % 3 === k ? 1 : 0, BUMPER);
    const spot = SPOTS[p.tableId] || [74, 64];
    mascot(spot[0], spot[1], frame, (p.msgTtl || 0) > 0 && String(p.msg).startsWith("CUBE"));
    const mx = spot[0] - 20, my = spot[1] + 19, fill = Math.min(1, (p.arrows || 0) / 2);
    rect(mx - 1, my - 1, mx + 41, my + 6, 3, HOLE); rect(mx, my, mx + 40, my + 5, 0, HOLE);
    for (let y = 0; y < 5; y++) for (let x = 0; x < Math.round(40 * fill); x++) px(mx + x, my + y - cam, (x + y) & 1 ? 1 : 2, HOLE);
    text("CUBE", mx + 13, my, 3, HOLE);
    if (T.plunger !== undefined || T.flippers.length) {
      const sy = h - 42, on = p.saver > 0;
      rect(58, sy - 1, 92, sy + 7, 3, WALL); rect(59, sy, 91, sy + 6, on ? 1 : 0, WALL);
      text("SAVER", 65, sy + 1, on ? (blink ? 0 : 3) : 2, WALL);
    }
    if (T.plunger) { const top = h - 8 + Math.round((p.charge || 0) * 6); for (let y = top; y < h - 5; y += 2) rect(145, y, 152, y + 1, 2, WALL); }
    T.flippers.forEach((spec, i) => {
      const a = [spec.px, spec.py], e = PINBALL.flipperEnd(p.fl[i], spec);
      stroke(a, e, 4.4, 2.4, 2, null, true); stroke(a, e, 3.4, 1.5, 0, null, true); stroke([a[0], a[1] + 1], [e[0], e[1] + 1], 1, 0.4, 1, null, true);
      opx(a[0], a[1] - cam, 2); opx(a[0] - 1, a[1] - cam, 2); opx(a[0] + 1, a[1] - cam, 2); opx(a[0], a[1] - 1 - cam, 2); opx(a[0], a[1] + 1 - cam, 2);
    });
    const b = p.ball;
    if (b && b.state !== "gone") area(b.x - 4, b.y - 4, b.x + 4, b.y + 4, (x, y, sy) => {
      const d = Math.hypot(x + 0.5 - b.x, y + 0.5 - b.y);
      if (d <= 3.4) opx(x, sy, d > 2.6 ? 2 : Math.hypot(x + 1.5 - b.x, y + 1.5 - b.y) < 1.2 ? 0 : 1);
    });
    for (let y = VIEW; y < H; y++) for (let x = 0; x < W; x++) { shade[y * W + x] = y === VIEW ? 2 : 0; attr[(y >> 3) * TW + (x >> 3)] = HUD; }
    const ballsLeft = Math.max(0, (p.balls || 0));
    for (let k = 0; k < 3; k++) { const x = 3 + k * 6; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5) { const X = x + dx, Y = 140 + dy; shade[Y * W + X] = k < ballsLeft ? 3 : 1; } }
    for (let y = 138; y < 143; y++) for (let x = 22; x < 27; x++) shade[y * W + x] = (y === 138 || x === 26) ? 2 : 3;
    text(String(p.cubes || 0), 29, 138, 3, HUD, true);
    if ((p.msgTtl || 0) > 0 && (p.msgTtl > 20 || (p.msgTtl >> 2) % 2)) text(String(p.msg).slice(0, 22), 40, 138, 2, HUD, true);
    else { const sc = String(p.score || 0); text(sc, W - 2 - sc.length * 4, 138, 3, HUD, true); }
  };
  const pack = col => (255 << 24 | col[2] << 16 | col[1] << 8 | col[0]) >>> 0;
  const BG32 = BG.map(pal => Uint32Array.from(pal, pack)), OBJ32 = Uint32Array.from(OBJ, pack);
  let view32 = null, viewOf = null;
  const render = (g, rgba) => {
    drawTable(g);
    if (viewOf !== rgba.buffer) { view32 = new Uint32Array(rgba.buffer, rgba.byteOffset, W * H); viewOf = rgba.buffer; }
    for (let y = 0; y < H; y++) {
      const table = y < VIEW, ty = y + cam, rowT = ty * W, tileT = (ty >> 3) * TW, row = y * W, tile = (y >> 3) * TW;
      for (let x = 0; x < W; x++) {
        const i = row + x, o = obj[i];
        view32[i] = o ? OBJ32[o - 1] : table ? BG32[attrT[tileT + (x >> 3)]][shadeT[rowT + x]] : BG32[attr[tile + (x >> 3)]][shade[i]];
      }
    }
  };


  return { render, BG, OBJ };
})();
