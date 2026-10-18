const MICRO = (() => {
  const W = 240, H = 160, FRAME = 1 / 60, TITLE = "BLINK BLITZ";
  const DUR = 240, READY = 72, READY_EXTRA = 30, RESULT = 45, ORDER = 50, LIVES = 3, LEVELS = 10, SPEEDUP = 1.15;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const random = seed => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const q = v => Math.round(clamp(v, 0, 31) * 255 / 31);
  const C = (r, g, b) => ((255 << 24) | (q(b) << 16) | (q(g) << 8) | q(r)) >>> 0;
  const K = {
    ink: C(3, 2, 6), white: C(31, 31, 31), cream: C(31, 29, 24), red: C(29, 5, 5), dred: C(18, 2, 3), orange: C(31, 17, 3),
    yellow: C(31, 28, 4), gold: C(28, 21, 2), green: C(6, 24, 8), dgreen: C(2, 14, 4), lime: C(18, 29, 6), teal: C(3, 22, 22),
    sky: C(14, 24, 31), blue: C(5, 11, 28), navy: C(3, 4, 14), purple: C(17, 7, 26), pink: C(31, 17, 23), rose: C(31, 24, 26),
    brown: C(17, 9, 3), tan: C(26, 19, 11), skin: C(31, 23, 17), grey: C(18, 19, 21), silver: C(25, 26, 28), dgrey: C(9, 10, 12),
    snow: C(29, 30, 31), ice: C(22, 27, 31), road: C(8, 8, 10), line: C(30, 30, 24), black: C(0, 0, 0),
  };

  const FONT = {
    A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"], B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."], D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"], F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."], H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"], J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"], L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"], N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
    O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."], P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"], R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."], T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."], V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."], X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."], Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    0: [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."], 1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    2: [".###.", "#...#", "....#", "..##.", ".#...", "#....", "#####"], 3: ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
    4: ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."], 5: ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    6: [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."], 7: ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    8: [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."], 9: [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
    "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."], "?": [".###.", "#...#", "....#", "..##.", "..#..", ".....", "..#.."],
    ".": [".....", ".....", ".....", ".....", ".....", ".....", "..#.."], ":": [".....", "..#..", ".....", ".....", ".....", "..#..", "....."],
    "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."], "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
    "'": ["..#..", "..#..", ".....", ".....", ".....", ".....", "....."], " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  };

  let fb = null;
  const put = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) fb[(y | 0) * W + (x | 0)] = c; };
  const rect = (x, y, w, h, c) => {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y)), x1 = Math.min(W, Math.round(x + w)), y1 = Math.min(H, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) fb.fill(c, yy * W + x0, yy * W + Math.max(x0, x1));
  };
  const box = (x, y, w, h, c, o = K.ink) => { rect(x - 1, y - 1, w + 2, h + 2, o); rect(x, y, w, h, c); };
  const disc = (cx, cy, r, c) => {
    for (let y = Math.ceil(-r); y <= r; y++) { const s = Math.sqrt(Math.max(0, r * r - y * y)); rect(cx - s, cy + y, 2 * s + 1, 1, c); }
  };
  const ball = (cx, cy, r, c, o = K.ink) => { disc(cx, cy, r + 1, o); disc(cx, cy, r, c); };
  const oval = (cx, cy, rx, ry, c) => {
    for (let y = Math.ceil(-ry); y <= ry; y++) { const s = rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))); rect(cx - s, cy + y, 2 * s + 1, 1, c); }
  };
  const line = (x0, y0, x1, y1, c, t = 1) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) rect(x0 + (x1 - x0) * i / n - t / 2, y0 + (y1 - y0) * i / n - t / 2, t, t, c);
  };
  const textW = (s, k) => s.length * 6 * k - k;
  const text = (s, x, y, k, c) => [...String(s).toUpperCase()].forEach((ch, n) => (FONT[ch] || FONT[" "]).forEach((row, r) => {
    for (let col = 0; col < 5; col++) if (row[col] === "#") rect(x + (n * 6 + col) * k, y + r * k, k, k, c);
  }));
  const bold = (s, x, y, k, c, o = K.ink) => {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) text(s, x + dx * Math.max(1, k >> 1), y + dy * Math.max(1, k >> 1), k, o);
    text(s, x, y, k, c);
  };
  const centred = (s, y, k, c, o) => bold(s, Math.round((W - textW(s, k)) / 2), y, k, c, o);
  const sprite = (rows, x, y, k, map, flip = false) => rows.forEach((row, r) => [...row].forEach((ch, col) => {
    if (ch !== "." && map[ch] !== undefined) rect(x + (flip ? row.length - 1 - col : col) * k, y + r * k, k, k, map[ch]);
  }));
  const stripes = (a, b, w, shift = 0) => { for (let x = -H; x < W + H; x += w * 2) for (let y = 0; y < H; y++) rect(x + y + shift % (w * 2), y, w, 1, b); };

  const GAMES = ["needle", "skip", "egg", "sticks", "saw", "toast", "cars", "drops", "ramp", "catnap"];
  const DEFS = {
    needle: {
      order: "THREAD!", bg: K.rose,
      init: (rng, hard) => ({ cy: 74, amp: hard ? 34 : 26, w: TAU / (hard ? 64 : 84), ph: rng() * TAU, tipX: 34, fired: false, tol: hard ? 4 : 7, bent: false }),
      eye: (st, gt) => st.cy + st.amp * Math.sin(gt * st.w + st.ph),
      tick(st, ed, held, gt, k) {
        if (!st.fired && ed.a) st.fired = true;
        if (!st.fired) return null;
        st.tipX = Math.min(170, st.tipX + 6 * k);
        if (st.tipX < 170) return null;
        st.frozen = DEFS.needle.eye(st, gt);
        const hit = Math.abs(st.frozen - 74) <= st.tol;
        st.bent = !hit; st.through = hit;
        return hit ? "win" : "lose";
      },
      end: () => "lose",
      draw(st, gt, done) {
        const ey = st.frozen ?? DEFS.needle.eye(st, gt);
        rect(0, 120, W, 30, K.pink);
        box(166, ey - 52, 8, 104, K.silver);
        rect(168, ey - 52, 2, 104, K.white);
        oval(170, ey, 2, st.tol + 1, K.ink); oval(170, ey, 1, st.tol, K.rose);
        line(170, ey + 52, 170, ey + 60, K.grey, 2);
        box(6, 60, 18, 28, K.red); rect(4, 58, 22, 4, K.tan); rect(4, 86, 22, 4, K.tan);
        const tip = st.through ? 196 : st.tipX;
        line(24, 74, tip, st.bent ? 80 : 74, K.dred, 3);
        if (st.bent) line(tip, 80, tip - 8, 92, K.dred, 3);
        rect(tip - 2, (st.bent ? 80 : 74) - 2, 4, 4, K.red);
      },
    },
    skip: {
      order: "JUMP!", bg: K.sky,
      init: (rng, hard) => ({ period: hard ? 50 : 62, ph: 0, jumpAt: -99, cleared: 0, caught: false, last: 0 }),
      height: (st, gt) => { const s = (gt - st.jumpAt) / 30; return s > 0 && s < 1 ? 4 * 22 * s * (1 - s) : 0; },
      tick(st, ed, held, gt, k) {
        if (ed.a && DEFS.skip.height(st, gt) === 0) st.jumpAt = gt;
        const passes = Math.floor((gt + st.period / 2) / st.period);
        if (passes > st.last) {
          st.last = passes;
          if (DEFS.skip.height(st, gt) > 3) { st.cleared++; if (st.cleared >= 3) return "win"; }
          else { st.caught = true; return "lose"; }
        }
        return null;
      },
      end: st => (st.cleared >= 3 ? "win" : "lose"),
      draw(st, gt) {
        rect(0, 118, W, 32, K.green); rect(0, 118, W, 3, K.lime);
        const a = (gt / st.period) * TAU, h = DEFS.skip.height(st, gt), fy = 116 - h;
        const ropeY = 78 - Math.cos(a) * 40, behind = Math.sin(a) > 0;
        const rope = () => { line(60, 70, 120, ropeY, K.red, 3); line(120, ropeY, 180, 70, K.red, 3); };
        if (behind) rope();
        for (const x of [52, 188]) { box(x - 6, 74, 12, 42, K.purple); ball(x, 64, 9, K.skin); }
        box(112, fy - 34, 16, 24, st.caught ? K.dgrey : K.orange);
        ball(120, fy - 44, 10, K.skin); rect(115, fy - 47, 3, 3, K.ink); rect(122, fy - 47, 3, 3, K.ink);
        rect(113, fy - 10, 5, 10, K.navy); rect(122, fy - 10, 5, 10, K.navy);
        if (!behind) rope();
        for (let n = 0; n < 3; n++) ball(196 + n * 13, 20, 4, n < st.cleared ? K.yellow : K.cream);
      },
    },
    egg: {
      order: "DROP!", bg: K.cream,
      init: (rng, hard) => ({ w: TAU / (hard ? 70 : 96), ph: rng() * TAU, pan: 64 + rng() * 112, half: hard ? 13 : 18, dropX: null, y: 34, vy: 0, landed: null }),
      x: (st, gt) => 120 + 84 * Math.sin(gt * st.w + st.ph),
      tick(st, ed, held, gt, k) {
        if (st.dropX === null && ed.a) st.dropX = DEFS.egg.x(st, gt);
        if (st.dropX === null) return null;
        st.vy += 0.35 * k; st.y += st.vy * k;
        if (st.y < 112) return null;
        st.y = 112; st.landed = Math.abs(st.dropX - st.pan) <= st.half - 4;
        return st.landed ? "win" : "lose";
      },
      end: () => "lose",
      draw(st, gt) {
        rect(0, 0, W, 14, K.tan); for (let x = 0; x < W; x += 20) rect(x, 4, 10, 6, K.brown);
        rect(0, 124, W, 26, K.grey); rect(0, 124, W, 3, K.silver);
        for (const x of [st.pan]) { ball(x, 130, 7, K.red); }
        box(st.pan - st.half, 112, st.half * 2, 8, K.dgrey); rect(st.pan + st.half, 114, 26, 4, K.brown);
        const x = st.dropX ?? DEFS.egg.x(st, gt);
        if (st.dropX === null) { line(120, 14, x, 30, K.grey, 1); }
        if (st.landed === true) { oval(st.pan, 110, 12, 4, K.white); ball(st.pan, 109, 4, K.yellow, K.orange); }
        else if (st.landed === false) { oval(x, 121, 14, 3, K.white); disc(x, 120, 4, K.yellow); }
        else { oval(x, st.y, 7, 9, K.ink); oval(x, st.y, 6, 8, K.cream); rect(x - 3, st.y - 5, 2, 3, K.white); }
      },
    },
    sticks: {
      order: "PINCH!", bg: K.ice,
      init: (rng, hard) => ({ v: hard ? 2.4 : 1.7, y: 60 + rng() * 30, bob: rng() * TAU, snapAt: null, got: null, tol: hard ? 5 : 8 }),
      bx: (st, gt) => -14 + st.v * gt,
      tick(st, ed, held, gt, k) {
        if (st.snapAt === null && ed.a) { st.snapAt = gt; st.got = Math.abs(DEFS.sticks.bx(st, gt) - 120) <= st.tol; return st.got ? "win" : "lose"; }
        return DEFS.sticks.bx(st, gt) > W + 20 ? "lose" : null;
      },
      end: () => "lose",
      draw(st, gt) {
        for (let n = 0; n < 4; n++) oval(30 + n * 60, 30 + (n % 2) * 14, 18, 7, K.white);
        rect(0, 130, W, 20, K.teal);
        const bx = st.got ? 120 : DEFS.sticks.bx(st, st.snapAt ?? gt), by = st.y + Math.sin(gt * 0.3 + st.bob) * (st.got ? 0 : 4);
        ball(bx, by, 7, K.yellow); rect(bx + 6, by - 1, 5, 3, K.orange); rect(bx + 2, by - 3, 2, 2, K.ink);
        const flap = Math.floor(gt / 6) % 2 && !st.got;
        rect(bx - 6, by + (flap ? -8 : 1), 8, 4, K.gold);
        const shut = st.snapAt !== null, gap = shut ? (st.got ? 7 : 1) : 22, ty = st.y;
        for (const s of [-1, 1]) { line(236, ty + s * 30, 112, ty + s * gap, K.ink, 6); line(236, ty + s * 30, 112, ty + s * gap, K.tan, 4); }
        box(214, ty - 16, 22, 32, K.skin);
      },
    },
    saw: {
      order: "SAW!", bg: K.lime,
      init: (rng, hard) => ({ need: hard ? 18 : 14, done: 0, side: 0 }),
      tick(st, ed) {
        const dir = ed.left ? -1 : ed.right ? 1 : 0;
        if (dir && dir !== st.side) { st.side = dir; st.done++; if (st.done >= st.need) return "win"; }
        return null;
      },
      end: st => (st.done >= st.need ? "win" : "lose"),
      draw(st, gt) {
        rect(0, 110, W, 40, K.dgreen); rect(30, 104, 180, 10, K.brown);
        const cut = st.done / st.need, split = cut >= 1;
        const sx = split ? 10 : 0;
        box(40 - sx, 66, 78, 38, K.tan); box(122 + sx, 66, 78, 38, K.tan);
        for (const x of [40 - sx, 194 + sx]) { oval(x + 3, 85, 6, 18, K.brown); oval(x + 3, 85, 3, 11, K.tan); }
        rect(118, 66, 4, 38 * cut, K.ink);
        const sw = st.side * 16, top = 66 + 38 * Math.min(1, cut) - 12;
        box(96 + sw, top - 4, 48, 8, K.silver);
        for (let x = 96 + sw; x < 144 + sw; x += 4) rect(x, top + 4, 2, 3, K.grey);
        box(140 + sw, top - 10, 18, 18, K.red);
        const count = `${Math.min(st.done, st.need)}/${st.need}`;
        text(count, W - 8 - textW(count, 2), 12, 2, K.ink);
      },
    },
    toast: {
      order: "CATCH!", bg: K.yellow,
      init: (rng, hard) => ({ tx: 34 + rng() * 172, drift: (rng() - 0.5) * (hard ? 1.4 : 0.8), ty: 6, vy: 0, px: 120, half: hard ? 15 : 20, caught: null, spin: 0 }),
      tick(st, ed, held, gt, k) {
        if (held.left) st.px = clamp(st.px - 3.2 * k, st.half, W - st.half);
        if (held.right) st.px = clamp(st.px + 3.2 * k, st.half, W - st.half);
        if (st.caught !== null || gt < 24) return null;
        st.vy = Math.min(4.2, st.vy + 0.08 * k); st.ty += st.vy * k; st.tx = clamp(st.tx + st.drift * k, 12, W - 12); st.spin += k;
        if (st.ty < 118) return null;
        st.caught = Math.abs(st.tx - st.px) <= st.half; st.ty = st.caught ? 114 : 130;
        return st.caught ? "win" : "lose";
      },
      end: () => "lose",
      draw(st, gt) {
        rect(0, 132, W, 18, K.brown); rect(0, 132, W, 2, K.tan);
        box(st.px - st.half - 4, 124, (st.half + 4) * 2, 4, K.white); oval(st.px, 129, st.half, 2, K.silver);
        const tilt = st.caught ? 0 : Math.floor(st.spin / 8) % 2;
        box(st.tx - 9, st.ty - (tilt ? 4 : 7), 18, tilt ? 8 : 14, K.tan);
        rect(st.tx - 6, st.ty - (tilt ? 2 : 5), 12, tilt ? 4 : 10, K.cream);
        if (gt < 24) { box(st.tx - 14, 0, 28, 6, K.skin); }
      },
    },
    cars: {
      order: "DODGE!", bg: K.road,
      init(rng, hard) {
        const cars = [], speed = hard ? 4.0 : 3.2;
        let lane = 1;
        for (let n = 0; n < 7; n++) { lane = (lane + 1 + Math.floor(rng() * 2)) % 3; cars.push({ lane, x: 260 + n * (hard ? 88 : 74), col: [K.red, K.blue, K.yellow, K.purple][n % 4] }); }
        return { lane: 1, cars, speed, crashed: false };
      },
      tick(st, ed, held, gt, k) {
        if (ed.up) st.lane = Math.max(0, st.lane - 1);
        if (ed.down) st.lane = Math.min(2, st.lane + 1);
        for (const c of st.cars) {
          c.x -= st.speed * k;
          if (c.lane === st.lane && c.x < 62 && c.x + 34 > 26) { st.crashed = true; return "lose"; }
        }
        return null;
      },
      end: st => (st.crashed ? "lose" : "win"),
      laneY: lane => 40 + lane * 36,
      draw(st, gt) {
        rect(0, 18, W, 6, K.grey); rect(0, 128, W, 6, K.grey);
        for (const y of [58, 94]) for (let x = -((gt * st.speed) % 30); x < W; x += 30) rect(x, y, 16, 2, K.line);
        const car = (x, y, col, me) => {
          box(x, y - 10, 34, 20, col); rect(x + (me ? 20 : 4), y - 7, 9, 14, K.ice);
          for (const dx of [5, 25]) { rect(x + dx, y - 12, 6, 3, K.ink); rect(x + dx, y + 10, 6, 3, K.ink); }
        };
        for (const c of st.cars) car(c.x, DEFS.cars.laneY(c.lane), c.col);
        car(26, DEFS.cars.laneY(st.lane), st.crashed ? K.dgrey : K.green, true);
        if (st.crashed) for (let n = 0; n < 6; n++) disc(60 + Math.cos(n) * 8, DEFS.cars.laneY(st.lane) + Math.sin(n * 2) * 8, 4, n % 2 ? K.orange : K.yellow);
      },
    },
    drops: {
      order: "AIM!", bg: K.teal,
      init: (rng, hard) => ({ w: TAU / (hard ? 96 : 110), ph: rng() * TAU, amp: hard ? 70 : 60, dx: 120, drop: null, tol: hard ? 5 : 8, hit: false, splash: null }),
      eye: (st, gt) => 120 + st.amp * Math.sin(gt * st.w + st.ph),
      tick(st, ed, held, gt, k) {
        if (held.left) st.dx = clamp(st.dx - 3 * k, 16, W - 16);
        if (held.right) st.dx = clamp(st.dx + 3 * k, 16, W - 16);
        if (!st.drop && ed.a) st.drop = { x: st.dx, y: 44 };
        if (!st.drop) return null;
        st.drop.y += 4 * k;
        if (st.drop.y < 112) return null;
        const hit = Math.abs(st.drop.x - DEFS.drops.eye(st, gt)) <= st.tol;
        st.splash = { x: st.drop.x, at: gt }; st.drop = null;
        if (hit) { st.hit = true; st.frozen = DEFS.drops.eye(st, gt); return "win"; }
        return null;
      },
      end: st => (st.hit ? "win" : "lose"),
      draw(st, gt) {
        rect(0, 100, W, 50, K.skin);
        const ex = st.frozen ?? DEFS.drops.eye(st, gt);
        oval(ex, 116, 22, 12, K.ink); oval(ex, 116, 20, 10, K.white); ball(ex, 116, 7, st.hit ? K.sky : K.blue); disc(ex, 116, 3, K.ink); rect(ex + 2, 112, 2, 2, K.white);
        if (st.hit) { rect(ex - 22, 104, 44, 3, K.skin); }
        box(st.dx - 5, 10, 10, 24, K.ice); box(st.dx - 7, 2, 14, 10, K.red); rect(st.dx - 1, 34, 2, 6, K.ice);
        if (st.drop) { oval(st.drop.x, st.drop.y, 3, 5, K.sky); }
        if (st.splash && gt - st.splash.at < 12) for (const s of [-1, 1]) rect(st.splash.x + s * (4 + gt - st.splash.at), 110, 3, 2, K.sky);
      },
    },
    ramp: {
      order: "LEAP!", bg: K.sky,
      init: (rng, hard) => ({ lip: 160, win: hard ? 9 : 15, a: 2 * 136 / (150 * 150), pressAt: null, good: null, fly: 0 }),
      x: (st, gt) => 24 + 0.5 * st.a * gt * gt,
      tick(st, ed, held, gt, k) {
        const x = DEFS.ramp.x(st, gt);
        if (st.pressAt === null && ed.a) { st.pressAt = gt; st.good = x <= st.lip && st.lip - x <= st.win; return st.good ? "win" : "lose"; }
        if (st.pressAt === null && x > st.lip) { st.pressAt = gt; st.good = false; return "lose"; }
        return null;
      },
      end: () => "lose",
      draw(st, gt) {
        rect(0, 128, W, 22, K.snow);
        for (let n = 0; n < 5; n++) { const x = 176 + n * 14; rect(x, 112 - n * 3, 3, 16 + n * 3, K.brown); disc(x + 1, 106 - n * 3, 6, K.dgreen); }
        for (let x = 0; x <= st.lip; x++) { const y = 40 + (x / st.lip) * 64 - (x > st.lip - 20 ? (x - st.lip + 20) * 0.9 : 0); rect(x, y, 1, 150 - y, K.ice); put(x, y, K.white); }
        let x = DEFS.ramp.x(st, gt), y;
        const rampY = xx => 40 + (xx / st.lip) * 64 - (xx > st.lip - 20 ? (xx - st.lip + 20) * 0.9 : 0);
        if (st.pressAt !== null) {
          const s = gt - st.pressAt, x0 = DEFS.ramp.x(st, st.pressAt), v = st.a * st.pressAt;
          x = x0 + v * s; y = rampY(Math.min(x0, st.lip)) - (st.good ? 3.2 * s - 0.06 * s * s : -0.2 * s * s);
          y = Math.min(y, st.good ? 124 : 140);
        } else y = rampY(x);
        box(x - 4, y - 18, 8, 12, K.red); ball(x, y - 22, 4, K.skin); rect(x - 10, y - 4, 20, 2, K.ink);
        if (st.good === false && st.pressAt !== null) text("OOPS", 180, 20, 2, K.navy);
      },
    },
    catnap: {
      order: "WAIT!", bg: K.purple,
      init: (rng, hard) => ({ closeAt: 70 + rng() * 80, window: hard ? 34 : 50, fake: hard ? 40 + rng() * 20 : -1, pressed: null }),
      shut: (st, gt) => gt >= st.closeAt || (st.fake > 0 && gt >= st.fake && gt < st.fake + 6),
      tick(st, ed, held, gt) {
        const shut = gt >= st.closeAt;
        if (st.pressed === null && ed.a) { st.pressed = gt; return shut && gt <= st.closeAt + st.window ? "win" : "lose"; }
        if (st.pressed === null && gt > st.closeAt + st.window) { st.pressed = -1; return "lose"; }
        return null;
      },
      end: () => "lose",
      draw(st, gt) {
        rect(0, 120, W, 30, K.navy);
        disc(196, 30, 14, K.cream); disc(202, 26, 12, K.purple);
        oval(120, 118, 54, 12, K.red);
        oval(120, 98, 40, 22, K.orange);
        ball(120, 74, 22, K.orange);
        for (const s of [-1, 1]) { line(120 + s * 10, 58, 120 + s * 20, 44, K.ink, 3); line(120 + s * 12, 58, 120 + s * 19, 48, K.orange, 2); }
        const shut = DEFS.catnap.shut(st, gt) && st.pressed !== -1 || (st.pressed !== null && st.pressed >= st.closeAt);
        for (const s of [-1, 1]) {
          if (shut) rect(120 + s * 9 - 4, 72, 8, 2, K.ink);
          else { oval(120 + s * 9, 72, 4, 5, K.ink); oval(120 + s * 9, 72, 3, 4, K.lime); rect(120 + s * 9, 70, 1, 4, K.ink); }
        }
        rect(117, 80, 6, 3, K.pink);
        if (shut && st.pressed === null) for (let n = 0; n < 3; n++) text("Z", 150 + n * 10, 52 - n * 10 - (gt % 20) / 4, 2 + (n > 1 ? 1 : 0), K.white);
      },
    },
  };

  const HOST = [
    "....oooooo....", "..oohhhhhhoo..", ".ohhhhhhhhhho.", "ohhhwwhhwwhhho", "ohhhwkhhwkhhho", "ohhhhhhhhhhhho",
    "ohhhhhhhhhhhho", "ohhmhhhhhhmhho", ".ohhmmmmmmhho.", "..oohhhhhhoo..", "....oooooo....",
  ];

  const level = g => Math.min(LEVELS, 1 + Math.floor(g.total / 3));
  const speedOf = g => Math.pow(SPEEDUP, level(g) - 1);
  const emit = (g, name) => { if (g.events.length < 64) g.events.push(name); };
  const nextId = g => {
    if (g.forced) { const id = g.forced; g.forced = null; return id; }
    if (!g.deck.length) {
      const deck = GAMES.map((_, i) => i);
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(g.rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      if (deck[deck.length - 1] === g.index && deck.length > 1) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
      g.deck = deck;
    }
    return GAMES[g.deck.pop()];
  };
  const fresh = (g, seed) => Object.assign(g, {
    seed, rng: random(seed >>> 0), phase: "menu", t: 0, losses: 0, speed: 1, index: -1, deck: [], game: null, result: null,
    paused: false, launched: false, forced: null, acc: 0, prev: {}, sped: false,
  });
  const create = seed => fresh({ kind: "micro", wins: 0, total: 0, events: [], version: 0 }, seed);
  const reset = (g, seed = (g.seed + 0x9E3779B9) >>> 0, keepWins = true) => {
    const wins = keepWins ? g.wins : 0, total = keepWins ? g.total : 0, index = g.index;
    fresh(g, seed); g.wins = wins; g.total = total; g.speed = level(g); g.index = index; g.version++;
    return g;
  };
  const start = (g, id) => { if (!DEFS[id]) throw new Error("no microgame " + id); g.forced = id; if (g.phase === "menu") { g.phase = "ready"; g.t = 0; } if (g.phase === "ready") g.t = Math.max(g.t, READY + READY_EXTRA); return g; };

  const begin = g => {
    const id = nextId(g), def = DEFS[id];
    g.index = GAMES.indexOf(id);
    g.game = { id, gt: 0, dur: DUR, state: def.init(g.rng, level(g) >= 3), result: null, at: null, beat: 0 };
    g.phase = "play"; g.t = 0;
    emit(g, "order");
  };
  const decide = (g, result) => {
    const game = g.game;
    if (game.result) return;
    game.result = result; game.at = game.gt; g.total++;
    if (level(g) > Math.min(LEVELS, 1 + Math.floor((g.total - 1) / 3))) g.sped = true;
    if (result === "win") {
      g.wins++; g.losses = 0;
      emit(g, "win");
    } else {
      g.wins = 0;
      g.losses++;
      emit(g, "lose");
      if (g.losses >= LIVES) { g.launched = true; emit(g, "launch"); }
    }
  };
  const tick = (g, input) => {
    const pv = g.prev, ed = {};
    for (const key of ["up", "down", "left", "right", "a", "b", "start", "select"]) ed[key] = !!input[key] && !pv[key];
    g.prev = { ...input };
    if (g.phase === "menu") { g.t++; if (ed.a || ed.start) { g.phase = "ready"; g.t = 0; emit(g, "order"); } return true; }
    if (ed.start && g.phase !== "over") { g.paused = !g.paused; return true; }
    if (g.paused) return false;
    const k = speedOf(g);
    g.t++;
    if (g.phase === "ready") {
      if (g.t >= (READY + READY_EXTRA) / k) begin(g);
    } else if (g.phase === "play") {
      const game = g.game, def = DEFS[game.id];
      game.gt += k;
      if (!game.result) {
        const beat = Math.floor(game.gt / 30);
        if (beat > game.beat) { game.beat = beat; emit(g, "tick"); }
        const r = def.tick(game.state, ed, input, game.gt, k);
        if (r) decide(g, r);
        else if (game.gt >= game.dur) decide(g, def.end(game.state));
      }
      if (game.result && (game.gt >= game.at + 40 || game.gt >= game.dur)) { g.phase = "result"; g.t = 0; g.result = game.result; }
    } else if (g.phase === "result") {
      if (g.t >= RESULT / k) {
        if (g.launched) { g.phase = "over"; g.t = 0; }
        else { g.phase = "ready"; g.t = 0; g.speed = level(g); if (g.sped) { g.sped = false; emit(g, "speedup"); } }
      }
    }
    return true;
  };
  const step = (g, dt, input = {}) => {
    g.acc = Math.min(g.acc + dt, FRAME * 20);
    let n = 0, changed = false;
    while (g.acc >= FRAME - 1e-9 && n < 20) { g.acc -= FRAME; if (tick(g, input)) changed = true; n++; }
    if (changed) g.version++;
    return changed;
  };
  const drainEvents = g => g.events.splice(0, g.events.length);

  const fuse = (g, frac) => {
    rect(0, 148, W, 12, K.navy);
    ball(10, 153, 6, K.ink, K.white); rect(12, 145, 3, 3, K.grey);
    const end = 22 + Math.max(0, frac) * 210;
    rect(18, 152, end - 18, 3, K.tan);
    if (frac > 0) { const f = Math.floor(g.t / 3) % 2; disc(end, 153, 3 + f, f ? K.yellow : K.orange); put(end, 153, K.white); }
  };
  const lives = (g, x, y) => {
    for (let n = 0; n < LIVES; n++) {
      const alive = n < LIVES - g.losses;
      ball(x + n * 22, y, 8, alive ? K.red : K.dgrey); rect(x + n * 22 - 3, y - 4, 3, 3, alive ? K.rose : K.grey);
    }
  };
  const drawReady = g => {
    rect(0, 0, W, H, K.blue); stripes(K.blue, K.navy, 12, g.t);
    sprite(HOST, 22, 34, 6, { o: K.ink, h: K.yellow, w: K.white, k: K.ink, m: K.red });
    rect(64, 120, 30, 6, K.ink); rect(66, 121, 26, 4, K.silver);
    centred(TITLE, 9, 2, K.yellow);
    const n = String(g.wins);
    bold(n, 170 - textW(n, 7) / 2, 34, 7, K.white);
    bold("WINS", 170 - textW("WINS", 2) / 2, 90, 2, K.cream);
    lives(g, 140, 116);
    if (g.speed > 1) text(`SPEED ${g.speed}`, 160, 134, 1, K.yellow);
  };
  const drawPlay = g => {
    const game = g.game, def = DEFS[game.id];
    rect(0, 0, W, H, def.bg);
    def.draw(game.state, game.gt);
    fuse(g, game.result ? 1 - game.at / game.dur : 1 - game.gt / game.dur);
    if (game.gt < ORDER && !game.result) {
      const s = 1 - game.gt / ORDER, kk = 4 + (s > 0.8 ? 2 : s > 0.6 ? 1 : 0);
      centred(def.order, 56 - kk * 3, kk, K.white);
    }
  };
  const drawResult = g => {
    drawPlay(g);
    const win = g.result === "win";
    rect(0, 50, W, 44, win ? K.green : K.red);
    rect(0, 50, W, 2, K.white); rect(0, 92, W, 2, K.white);
    centred(win ? "NICE!" : "MISS!", 58, 4, K.white);
  };
  const lookC = (v, fallback) => (Array.isArray(v) ? C(Math.round(v[0] * 31), Math.round(v[1] * 31), Math.round(v[2] * 31)) : fallback);
  const drawMenu = g => {
    for (let y = 0; y < H; y++) { const f = y / H; rect(0, y, W, 1, C(Math.round(4 + f * 10), Math.round(6 + f * 14), Math.round(16 + f * 13))); }
    disc(196, 34, 13, K.yellow); disc(196, 34, 10, K.cream);
    for (let n = 0; n < 14; n++) { const x = (n * 53 + 17) % W, y = (n * 29 + 7) % 80, on = ((g.t >> 3) + n) % 4 === 0; if (on) { put(x, y, K.white); put(x - 1, y, K.ice); put(x + 1, y, K.ice); put(x, y - 1, K.ice); put(x, y + 1, K.ice); } else put(x, y, K.ice); }
    const look = g.look || {}, body = lookC(look.body, K.red), dark = lookC(look.dark, K.dred), skin = lookC(look.skin, K.skin);
    const bob = Math.floor(g.t / 20) % 2, cx = 70, base = 128;
    rect(cx - 34, base, 68, 4, K.yellow); rect(cx - 34, base + 4, 68, 10, K.gold); rect(cx - 34, base + 14, 68, 2, K.brown);
    rect(cx - 30, base + 1, 10, 1, K.cream); rect(cx + 8, base + 1, 6, 1, K.cream);
    if (((g.t >> 4) & 3) === 1) { put(cx + 26, base - 2, K.white); put(cx + 25, base - 1, K.white); put(cx + 27, base - 1, K.white); put(cx + 26, base, K.white); }
    rect(cx - 9, base - 22, 7, 22, dark); rect(cx + 2, base - 22, 7, 22, dark);
    rect(cx - 12, base - 50 - bob, 24, 30, body); rect(cx - 12, base - 50 - bob, 24, 3, dark);
    rect(cx - 18, base - 48 - bob, 6, 22, body); rect(cx + 12, base - 48 - bob, 6, 22, body);
    rect(cx - 18, base - 27 - bob, 6, 5, skin); rect(cx + 12, base - 27 - bob, 6, 5, skin);
    rect(cx - 9, base - 68 - bob, 18, 18, skin); rect(cx - 9, base - 68 - bob, 18, 3, dark);
    rect(cx - 5, base - 61 - bob, 3, 4, K.ink); rect(cx + 3, base - 61 - bob, 3, 4, K.ink);
    bold(TITLE, 118, 44, 2, K.yellow);
    bold("10 GAMES OF", 124, 70, 1, K.white); bold("4 SECONDS", 130, 80, 1, K.white);
    if (Math.floor(g.t / 30) % 2 === 0) bold("PRESS START", 126, 112, 1, K.cream);
  };
  const drawOver = g => {
    rect(0, 0, W, H, K.dred); stripes(K.dred, K.red, 10, g.t);
    centred("LAUNCHED!", 36, 4, K.yellow);
    centred("THREE MISSES IN A ROW", 84, 1, K.white);
    centred(`${g.wins} WINS`, 106, 3, K.cream);
  };
  const render = (g, rgba = new Uint8Array(W * H * 4)) => {
    fb = new Uint32Array(rgba.buffer, rgba.byteOffset, W * H);
    if (g.phase === "menu") drawMenu(g);
    else if (g.phase === "ready") drawReady(g);
    else if (g.phase === "play") drawPlay(g);
    else if (g.phase === "result") drawResult(g);
    else drawOver(g);
    if (g.paused) {
      for (let i = 0; i < W * H; i++) {
        const v = fb[i], r = v & 255, gg = (v >> 8) & 255, b = (v >> 16) & 255;
        fb[i] = C(Math.round(r / 255 * 31 * 0.5), Math.round(gg / 255 * 31 * 0.5), Math.round(b / 255 * 31 * 0.5));
      }
      rect(50, 60, 140, 40, K.navy); rect(50, 60, 140, 2, K.white); rect(50, 98, 140, 2, K.white);
      centred("PAUSED", 70, 3, K.white);
    }
    fb = null;
    return rgba;
  };

  const run = (freqs, stepS, wave, vol, dur = stepS * 1.2) => freqs.map((f, i) => [f, f, dur, wave, vol, i * stepS]);
  const SFX = {
    order: run([784, 1047], 0.06, "square", 0.16), tick: [[1200, 1150, 0.02, "square", 0.06, 0]],
    win: run([659, 784, 1047, 1319], 0.06, "square", 0.18), lose: run([392, 262, 196], 0.1, "sawtooth", 0.2),
    speedup: run([523, 659, 784, 988, 1175, 1568], 0.05, "square", 0.18), launch: [[110, 1400, 0.7, "sawtooth", 0.22, 0], [220, 1800, 0.5, "square", 0.1, 0.1]],
  };
  const sfx = (ctx, name, dest = ctx.destination, when = ctx.currentTime) => {
    for (const [f0, f1, dur, wave, vol, delay] of SFX[name] || []) {
      const osc = ctx.createOscillator(), gain = ctx.createGain(), t = when + delay;
      osc.type = wave; osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      gain.gain.setValueAtTime(vol * 0.5, t); gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      osc.connect(gain); gain.connect(dest); osc.start(t); osc.stop(t + dur + 0.02);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
  };

  return { W, H, FRAME, TITLE, GAMES, DEFS, LIVES, LEVELS, DUR, SFX, create, reset, start, step, render, drainEvents, sfx, level, speedOf };
})();
