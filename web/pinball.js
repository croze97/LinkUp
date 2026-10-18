const PINBALL = (() => {
  const W = 160, H = 144, VIEW = 136, FRAME = 1 / 60, SUBSTEPS = 4, DT = FRAME / SUBSTEPS;
  const BALL_R = 3, GRAVITY = 480, VMAX = 500;
  const TITLE = "BUMPER BEASTS";
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const random = seed => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const GLYPHS = {
    A: "25755", B: "65656", C: "34443", D: "65556", E: "74647", F: "74644", G: "34553", H: "55755", I: "72227", J: "11152",
    K: "55655", L: "44447", M: "57755", N: "65555", O: "25552", P: "65644", Q: "25531", R: "65655", S: "34216", T: "72222",
    U: "55557", V: "55552", W: "55775", X: "55255", Y: "55222", Z: "71247", 0: "75557", 1: "26227", 2: "61247", 3: "61216",
    4: "55711", 5: "74616", 6: "34757", 7: "71222", 8: "75757", 9: "75716", ".": "00002", ",": "00024", "!": "22202",
    ":": "02020", "-": "00700", "'": "22000", "/": "11244", "+": "02720", "%": "51245", "?": "61202", x: "05250",
    "♥": "57772", ">": "42124", "<": "12421", "*": "52725", "=": "07070", " ": "00000",
  };

  const HEADS = [
    { y: 0, rows: ["....oooo", "..oobbbb", ".obbbbbb", "obbhebbb", "obbbbbbb", "obbbbooo", ".obbbbbb", "..ooobbb"] },
    { y: 0, rows: ["....oooo", "..oobbbb", ".obbbbbb", "obbhebbb", "obbbbooo", "obbbhhhh", ".obbbhhh", "..ooobbb"] },
    { y: 0, rows: [".....ooo", "...oobbb", "..obbbbb", "..obhebb", "..obbaaa", "...oaaaa", "....oaaa", "....ooob"] },
    { y: 0, rows: [".o......", "..o..ooo", "...oobbb", "..obhheb", ".obhheeb", ".obhhebb", "..obbbbb", "...oobbb"] },
    { y: 0, rows: [".....ooo", "..oooobb", ".obhhebb", "obheebbb", "obbbbbbb", "obbooooo", ".obbbbbb", "..ooobbb"] },
    { y: 1, rows: ["..o.....", ".obo.ooo", ".obboobb", ".obbbbbb", "obbhebbb", "obbbbaaa", ".obbbooo", "..ooobbb"] },
    { y: 0, rows: ["....oooo", "...obbbb", "..obbmmm", ".obhemmm", ".obbbbmm", ".obbooob", "..obbbbb", "...ooobb"] },
    { y: 0, rows: ["...ooooo", "..obbbbb", ".obbbbbb", ".obhebbb", "obbbbbbb", "obboooaa", "obbbaaaa", ".ooooooo"] },
  ];
  const BODIES = [
    { y: 6, rows: ["....oooo", "..oobbbb", ".obbbbbb", "obbbbbbb", "obbbmmmm", "obbmmmmm", ".obbmmmm", ".obbbbbb", "..ooobbo", "....oooo"] },
    { y: 6, rows: [".....ooo", "....obbb", "....obbb", "...obbbb", "...obbmm", "...obbmm", "...obbmm", "...obbbb", "..obbobb", "..ooo.oo"] },
    { y: 7, rows: ["..oooooo", ".obbbbbb", "obbbbbbb", "obbmmmmm", "obbmmmmm", "obbbbbbb", "obobbbbb", "ooobbobb", "..oo.ooo"] },
    { y: 6, rows: ["......oo", ".....obb", "....obbb", "...obbbb", "..obbbmm", ".obbbmmm", "obbbbmmm", "obbbbbbb", "obbobbbb", ".ooo.ooo"] },
    { y: 6, rows: ["...ooooo", "..obbbbb", ".obbmbbm", "obbbmbbm", "obmmbmmb", "obbbmbbm", "obbmbbmb", ".obbbbbb", "..ooobbb", "....oooo"] },
    { y: 7, rows: ["....oooo", "..oobbbb", ".obbbmmm", ".oobbbbb", "..obbmmm", ".obbbbbb", "obbmmmmm", "obbbbbbb", ".oooobbb"] },
    { y: 6, rows: ["....ooo.", "...obbboo", "..obbbbbb", ".obmbbbmb", "obbbbmbbb", "obmbbbbbm", "obbbbmbbb", "obbmbbbbb", ".ooobbooo", "....oo..."].map(r => r.slice(0, 8)) },
    { y: 6, rows: ["......oo", "....oobb", "...obbbb", "..obbmmm", "..obbmmm", "...obbbb", "...obbbb", "..oabbbb", ".oaabbbb", "ooaaoooo"] },
  ];
  const EXTRAS = {
    none: { y: 0, rows: [] },
    ears: { y: 0, rows: ["..o.....", ".obo....", ".obbo..."] },
    horns: { y: 0, rows: [".o......", ".oo.....", "..oo...."] },
    crest: { y: 0, rows: [".......o", "......oa", ".....oaa"] },
    wings: { y: 7, rows: ["o.......", "oao.....", "oaao....", "oaaao...", ".oaao...", "..oo...."] },
    spikes: { y: 8, rows: ["oa......", "oao.....", ".oa....."] },
    belly: { y: 9, rows: ["....hhhh", "...hhhhh", "...hhhhh"] },
    cheeks: { y: 4, rows: ["...aa...", "...aa..."] },
    halo: { y: 0, rows: ["..aaaaaa", ".a......"] },
    tail: { y: 12, rows: ["aa......", ".aa.....", "..aa...."] },
  };
  const shadeOf = (ch, spec) => ch === "o" || ch === "e" ? 3 : ch === "h" ? 0 : ch === "b" ? spec.b : ch === "m" ? spec.m : spec.a;
  const compose = ([head, body, extras, b, m, a]) => {
    const spec = { b, m, a }, half = Array.from({ length: 16 }, () => new Array(8).fill("."));
    const overlay = part => part.rows.forEach((row, r) => { for (let c = 0; c < 8; c++) if (row[c] !== "." && half[part.y + r]) half[part.y + r][c] = row[c]; });
    overlay(BODIES[body]); overlay(HEADS[head]);
    for (const e of extras) overlay(EXTRAS[e]);
    const art = new Int8Array(256);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
      const v = half[y][x] === "." ? -1 : shadeOf(half[y][x], spec);
      art[y * 16 + x] = v; art[y * 16 + 15 - x] = v;
    }
    return art;
  };
  const SIZES = [12, 14, 16];
  const resize = (art, n) => {
    const out = new Int8Array(256).fill(-1), x0 = (16 - n) >> 1, y0 = 16 - n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[(y0 + y) * 16 + x0 + x] = art[Math.floor(y * 16 / n) * 16 + Math.floor(x * 16 / n)];
    return out;
  };

  const LINES = [
    { n: ["Nubbin", "Nubleaf", "Nubloom"], h: 0, b: 0, x: ["ears", "crest"], c: [1, 2, 3], t: "b" },
    { n: ["Pipwing", "Pipflit", "Pipraptor"], h: 2, b: 3, x: ["wings", "crest"], c: [1, 3, 2], t: "b" },
    { n: ["Scuttle", "Scuttler", "Scuttlord"], h: 4, b: 2, x: ["horns", "spikes"], c: [2, 1, 3], t: "b" },
    { n: ["Mudge", "Mudgle", "Mudgolem"], h: 7, b: 6, x: ["cheeks", "horns"], c: [2, 1, 3], t: "b" },
    { n: ["Fizzle", "Fizzard", "Fizzdragon"], h: 7, b: 7, x: ["spikes", "wings"], c: [1, 2, 3], t: "b" },
    { n: ["Dabbit", "Dabbler", "Dabbolt"], h: 5, b: 1, x: ["ears", "tail"], c: [1, 2, 3], t: "b" },
    { n: ["Wispy", "Wisplume", "Wispyre"], h: 6, b: 5, x: ["crest", "halo"], c: [0, 1, 3], t: "b" },
    { n: ["Snoot", "Snooter", "Snootusk"], h: 1, b: 3, x: ["horns", "belly"], c: [2, 1, 3], t: "b" },
    { n: ["Glimmer", "Glimmoth", "Glimmajesty"], h: 3, b: 4, x: ["wings", "crest"], c: [1, 0, 3], t: "b" },
    { n: ["Bubbo", "Bubbloon", "Bubbleviathan"], h: 4, b: 0, x: ["cheeks", "belly"], c: [1, 2, 3], t: "b" },
    { n: ["Clacker", "Clackbeak", "Clackasaur"], h: 2, b: 4, x: ["spikes", "horns"], c: [2, 1, 3], t: "b" },
    { n: ["Zipkin", "Zapkin", "Zorchkin"], h: 5, b: 2, x: ["tail", "crest"], c: [0, 1, 3], t: "b" },
    { n: ["Cindle", "Cinderpup", "Cinderwolf"], h: 1, b: 2, x: ["ears", "tail"], c: [2, 1, 3], t: "e" },
    { n: ["Magmite", "Magmaw", "Magmantle"], h: 7, b: 6, x: ["spikes", "belly"], c: [2, 3, 1], t: "e" },
    { n: ["Dustle", "Dustwyrm", "Dustleviathan"], h: 0, b: 5, x: ["horns", "crest"], c: [1, 2, 3], t: "e" },
    { n: ["Finlet", "Finwave", "Finstorm"], h: 4, b: 7, x: ["cheeks", "spikes"], c: [1, 2, 3], t: "t" },
    { n: ["Frostick", "Frostag", "Frostorix"], h: 5, b: 3, x: ["horns", "belly"], c: [0, 1, 3], t: "t" },
    { n: ["Kelpling", "Kelpony", "Kelpstallion"], h: 1, b: 5, x: ["crest", "tail"], c: [1, 2, 3], t: "t" },
  ];
  const LEGENDS = [
    { name: "Solarion", spec: [6, 3, ["halo", "wings", "crest"], 0, 2, 3], t: "e", area: 2 },
    { name: "Lunareth", spec: [3, 7, ["halo", "wings", "tail"], 1, 3, 2], t: "t", area: 2 },
  ];
  const AREAS = { e: ["MEADOW", "GROVE", "SUMMIT"], t: ["SHORE", "REEF", "ABYSS"] };
  const CREATURES = [];
  LINES.forEach((line, li) => line.n.forEach((name, s) => {
    const extras = line.x.slice(0, s).map(x => x), id = CREATURES.length;
    CREATURES.push({ id, name: name.toUpperCase(), line: li, stage: s + 1, next: s < 2 ? id + 1 : -1, rarity: s + 1 + (line.t === "b" ? 0 : 1), table: line.t,
      areas: [li % 3, (li + 1) % 3], spec: [line.h, line.b, extras, ...line.c] });
  }));
  LEGENDS.forEach(l => CREATURES.push({ id: CREATURES.length, name: l.name.toUpperCase(), line: -1, stage: 3, next: -1, rarity: 5, table: l.t, areas: [l.area], spec: l.spec }));
  const SPRITES = CREATURES.map(c => resize(compose(c.spec), SIZES[c.stage - 1]));
  const LEGEND_IDS = [CREATURES.length - 2, CREATURES.length - 1];

  const mirror = x => 148 - x;
  const arcPts = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  const chain = pts => pts.slice(1).map((p, i) => [pts[i][0], pts[i][1], p[0], p[1]]);
  const FLIPPER_LEN = 26, FLIPPER_REST = 32 * Math.PI / 180, FLIPPER_UP = -28 * Math.PI / 180, FLIP_UP_SPEED = 22, FLIP_DOWN_SPEED = 14, FLIPPER_R = 2.8;
  const buildTable = cfg => {
    const h = cfg.h, T = { ...cfg, walls: [], gates: [], slings: [], targets: [], flippers: [], kicks: [], posts: cfg.posts || [], bumpers: cfg.bumpers || [],
      lanes: cfg.lanes || [], spinners: cfg.spinners || [], ramps: cfg.ramps || [], holes: {}, bonusKind: cfg.bonus || null };
    if (cfg.plunger) {
      T.walls.push(...chain(arcPts(80, 74, 74, Math.PI, Math.PI * 2, 40)));
      T.walls.push([6, 74, 6, h], [154, 74, 154, h - 6], [142, 100, 142, h - 6], [142, h - 6, 154, h - 6]);
      T.gates.push([142, 94, 154, 86]);
      T.plunger = [148, h - 12];
    } else T.walls.push([6, 0, 142, 0], [6, 0, 6, h], [142, 0, 142, h]);
    const py = h - 38;
    for (const m of [x => x, mirror]) {
      T.walls.push(...chain([[m(14), py - 42], [m(14), py - 14], [m(44), py - 2.4]]));
      T.posts.push([m(14), py - 44, 1.6]);
      const a = [m(24), py - 62], b = [m(24), py - 30], c = [m(40), py - 30];
      T.walls.push([a[0], a[1], b[0], b[1]], [b[0], b[1], c[0], c[1]]);
      T.slings.push(m(0) === 0 ? [a[0], a[1], c[0], c[1]] : [c[0], c[1], a[0], a[1]]);
    }
    T.flippers.push({ px: 44, py, side: 1, len: cfg.flipLen || FLIPPER_LEN }, { px: mirror(44), py, side: -1, len: cfg.flipLen || FLIPPER_LEN });
    T.kicks.push({ x: 10, y: py - 20, r: 5, side: 0, armed: cfg.kickL !== false }, { x: 138, y: py - 20, r: 5, side: 1, armed: !!cfg.kickR });
    for (const name of ["cave", "slotA", "slotB"]) if (cfg[name]) T.holes[name] = { x: cfg[name][0], y: cfg[name][1], r: 5 };
    for (const t of cfg.targets || []) T.targets.push({ seg: t.seg, group: t.group || 0 });
    for (const w of cfg.walls || []) T.walls.push(w);
    return T;
  };
  const bank = (x, y0, n, facing) => Array.from({ length: n }, (_, i) => ({ seg: facing > 0 ? [x, y0 + i * 12, x, y0 + i * 12 + 8] : [x, y0 + i * 12 + 8, x, y0 + i * 12], group: 0 }));
  const TABLES = {
    ember: buildTable({ id: "ember", name: "EMBER FIELD", h: 300, music: "ember", plunger: true, saver: 25 * 60, kickL: true, kickR: false,
      lanes: [[56, 26], [74, 22], [92, 26]], posts: [[65, 30, 2.5], [83, 30, 2.5], [63, 120, 2.5], [85, 120, 2.5]],
      bumpers: [[74, 50, 7], [52, 72, 7], [96, 72, 7]], cave: [74, 128], slotA: [20, 108], slotB: [128, 108],
      spinners: [[18, 146, 12, 14], [130, 146, 12, 14]],
      ramps: [{ enter: [36, 170], exit: [64, 46], r: 7, vx: 40 }, { enter: [112, 170], exit: [84, 46], r: 7, vx: -40 }],
      targets: bank(9, 164, 3, 1) }),
    tide: buildTable({ id: "tide", name: "TIDE POOL", h: 320, music: "tide", plunger: true, launch: 1.12, saver: 18 * 60, kickL: true, kickR: true, flipLen: 27,
      lanes: [[50, 28], [74, 22], [98, 28]], posts: [[62, 28, 2.5], [86, 28, 2.5], [40, 150, 2.5], [60, 150, 2.5]],
      bumpers: [[74, 44, 7], [56, 66, 7], [92, 66, 7], [74, 88, 7]], cave: [50, 160], slotA: [126, 124], slotB: [22, 124],
      spinners: [[74, 108, 16, 8], [130, 190, 12, 14]],
      ramps: [{ enter: [26, 196], exit: [98, 40], r: 7, vx: -30 }, { enter: [120, 176], exit: [52, 40], r: 7, vx: 30 }],
      targets: bank(139, 180, 3, -1) }),
    mound: buildTable({ id: "mound", name: "MOLE MOUND", h: 190, music: "bonus-mound", saver: 30 * 60, bonus: "mound", kickL: false,
      bumpers: [[40, 100, 6], [108, 100, 6]] }),
    specter: buildTable({ id: "specter", name: "SPECTER HALL", h: 190, music: "bonus-specter", saver: 30 * 60, bonus: "specter", kickL: false,
      bumpers: [[74, 96, 6]], posts: [[30, 60, 3], [118, 60, 3]] }),
    vault: buildTable({ id: "vault", name: "STAR VAULT", h: 190, music: "bonus-vault", saver: 30 * 60, bonus: "vault", kickL: false,
      lanes: [[54, 110], [74, 104], [94, 110]], bumpers: [[34, 90, 6], [114, 90, 6]] }),
  };
  const TABLE_IDS = ["ember", "tide"], BONUS_ORDER = { ember: ["mound", "vault", "specter"], tide: ["specter", "mound", "vault"] };

  const DEX_UNSEEN = 0, DEX_SEEN = 1, DEX_CAUGHT = 2;
  const TIERS = ["ORB", "GREAT ORB", "ULTRA ORB", "MASTER ORB"], TIER_MULT = [1, 1.5, 2, 3];
  const START_BALLS = 3, CATCH_FRAMES = 120 * 60, EVO_FRAMES = 90 * 60, TRAVEL_FRAMES = 10 * 60, BONUS_FRAMES = 90 * 60;
  const defaultScores = () => Object.fromEntries(TABLE_IDS.map(id => [id, ["ACE", "BEA", "COY", "DEX", "EVE"].map((name, i) => ({ name, score: (5 - i) * 400000 }))]));
  const create = (seed, opts = {}) => ({
    kind: "pinball", seed, rng: random(seed >>> 0), scene: "title", cursor: 0, tableCursor: 0, dexCursor: 0, t: 0, acc: 0, version: 0, held: {}, events: [], music: "title",
    dex: opts.dex || new Uint8Array(CREATURES.length), scores: opts.scores || defaultScores(), p: null, entry: null, lastTable: "ember",
  });
  const emit = (g, name) => { if (g.events.length < 64) g.events.push(name); };
  const say = (p, text, frames = 100) => { p.msg = text; p.msgTtl = frames; };
  const newBall = p => {
    const T = p.main;
    Object.assign(p, { T, phase: "launch", charge: 0, lanes: [0, 0, 0], tier: 0, bonusMult: 1, saver: 0, saverLit: false, arrows: 0, evoItems: 0, spins: 0, spinAng: [], mode: null,
      saverNext: T.saver, tilt: 0, tilted: false, nudgeCool: 0, ballCatches: 0, ballEvos: 0, bumperHits: 0, mult2: 0, bumpFlash: [], slingFlash: [], targetHit: T.targets.map(() => 0), laneFlash: 0, bonusLog: [], stage: null });
    p.kick = T.kicks.map(k => k.armed);
    p.ball = { x: T.plunger[0], y: T.plunger[1], vx: 0, vy: 0, state: "lane", hole: null, lock: 0, noHole: 0, noRamp: 0, ramp: null };
    p.fl = [{ a: FLIPPER_REST, w: 0 }, { a: FLIPPER_REST, w: 0 }];
    p.spinners = T.spinners.map(() => ({ v: 0, ang: 0, inside: false }));
    p.laneIn = T.lanes.map(() => false);
    p.cam = T.h - VIEW;
  };
  const startGame = (g, tableId) => {
    const main = TABLES[tableId];
    g.lastTable = tableId;
    g.p = { tableId, main, T: main, score: 0, ballNo: 1, balls: START_BALLS, frame: 0, msg: "", msgTtl: 0, catches: 0, evolutions: 0, catchesSinceBonus: 0, bonusStages: 0, stagesCleared: 0,
      extraBalls: 0, ebUsed: false, extraBallLit: false, area: 0, party: [], prev: {}, tally: null, over: 0, newCatch: 0, cubes: (g.kept && g.kept[tableId]) || 0 };
    newBall(g.p);
    g.scene = "play"; g.music = main.music; g.paused = false; g.resumable = false;
    say(g.p, TABLES[tableId].name, 120);
    emit(g, "start");
    return g.p;
  };
  const award = (g, n) => { const p = g.p, v = Math.round(n * (p.mult2 > 0 ? 2 : 1)); p.score = Math.min(999999999, p.score + v); return v; };

  const poolOf = (g, p) => {
    const tab = p.tableId === "tide" ? "t" : "e", legendArea = 2;
    const wild = CREATURES.filter(c => (c.table === "b" || c.table === tab) && c.line >= 0 && c.stage < 3 && c.areas.includes(p.area));
    const legend = CREATURES.filter(c => c.line < 0 && c.table === tab && p.area === legendArea);
    return { wild, legend };
  };
  const pickCreature = (g, p) => {
    const { wild, legend } = poolOf(g, p);
    if (legend.length && g.rng() < 0.12) return legend[0];
    const weights = wild.map(c => [10, 5, 2, 1, 1][c.rarity - 1]);
    let r = g.rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < wild.length; i++) { r -= weights[i]; if (r <= 0) return wild[i]; }
    return wild[wild.length - 1];
  };
  const evoCandidate = (g, p) => {
    const ok = id => { const c = CREATURES[id]; return c.next >= 0 && g.dex[c.next] !== DEX_CAUGHT; };
    for (const id of p.party) if (ok(id)) return CREATURES[id];
    for (const c of CREATURES) if (g.dex[c.id] === DEX_CAUGHT && ok(c.id)) return c;
    return null;
  };
  const shuffled = (g, n) => { const a = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(g.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const startCatch = g => {
    const p = g.p;
    p.arrows = 0; p.cubes = (p.cubes || 0) + 1;
    award(g, 25000);
    say(p, "CUBE " + p.cubes + "!", 120); emit(g, "caught");
  };
  const touch = (g, k = 1) => {
    const m = g.p.mode;
    if (m && m.kind === "catch" && m.phase === "reveal") {
      m.hits += k;
      if (m.hits >= m.need) { m.phase = "ready"; say(g.p, "NOW HIT THE CAVE!", 120); emit(g, "ready"); }
      else emit(g, "reveal");
    }
  };
  const finishCatch = g => {
    const p = g.p, m = p.mode, c = CREATURES[m.id];
    const isNew = g.dex[c.id] !== DEX_CAUGHT;
    g.dex[c.id] = DEX_CAUGHT; p.party = p.party.filter(id => id !== c.id); p.party.unshift(c.id); p.catches++; p.catchesSinceBonus++; p.ballCatches++;
    const pts = award(g, Math.round((20000 + c.rarity * 10000 + (isNew ? 15000 : 0)) * TIER_MULT[p.tier]));
    p.newCatch = isNew ? 1 : 0;
    p.kick[0] = p.main.kicks[0].armed;
    say(p, (isNew ? "NEW! " : "") + "GOTCHA! " + c.name + " " + pts, 180); emit(g, "caught");
    if (p.ballCatches >= 2 && !p.ebUsed) { p.extraBallLit = true; }
    p.mode = null;
  };
  const startEvo = (g, cand) => {
    const p = g.p;
    p.mode = { kind: "evo", from: cand.id, to: cand.next, got: 0, need: 3, phase: "items", timer: EVO_FRAMES, t: 0 };
    p.evoItems = 0; p.targetHit = p.targetHit.map(() => 0);
    say(p, CREATURES[cand.id].name + " IS READY TO EVOLVE!", 150); emit(g, "evomode");
  };
  const finishEvo = g => {
    const p = g.p, m = p.mode, to = CREATURES[m.to];
    g.dex[to.id] = DEX_CAUGHT; p.party = p.party.filter(id => id !== m.from && id !== to.id); p.party.unshift(to.id);
    p.evolutions++; p.ballEvos++;
    award(g, Math.round(40000 * TIER_MULT[p.tier]));
    say(p, CREATURES[m.from].name + " EVOLVED INTO " + to.name + "!", 180); emit(g, "evolved");
    p.mode = null;
  };

  const startBonus = g => {
    const p = g.p, kind = BONUS_ORDER[p.tableId][p.bonusStages % 3], T = TABLES[kind];
    p.T = T; p.mode = null; p.arrows = 0;
    const s = p.stage = { kind, T, time: BONUS_FRAMES, hits: 0, boss: null, ents: [], t: 0, done: 0, result: "" };
    if (kind === "mound") for (let i = 0; i < 9; i++) s.ents.push({ x: 34 + (i % 3) * 40, y: 36 + Math.floor(i / 3) * 24, r: 5, up: 0, cool: 0 });
    if (kind === "specter") for (let i = 0; i < 3; i++) s.ents.push({ x: 74, y: 50, r: 6, up: 1, cool: 0 });
    if (kind === "vault") { s.lit = [0, 0, 0]; s.open = 0; }
    p.ball = { x: 74, y: 44, vx: 20, vy: 40, state: "play", hole: null, lock: 0, noHole: 0, noRamp: 0, ramp: null };
    p.lanes = [0, 0, 0]; p.laneIn = T.lanes.map(() => false); p.spinners = []; p.targetHit = []; p.bumpFlash = []; p.slingFlash = [];
    p.kick = T.kicks.map(k => k.armed); p.saver = T.saver; p.fl = [{ a: FLIPPER_REST, w: 0 }, { a: FLIPPER_REST, w: 0 }];
    p.cam = 0; g.music = T.music;
    say(p, T.name + "!", 120); emit(g, "stagein");
  };
  const endBonus = (g, reason) => {
    const p = g.p, s = p.stage;
    if (s.done) return;
    s.done = 1; s.result = reason;
    if (reason === "clear") { award(g, 150000 + Math.floor(s.time / 60) * 500); p.stagesCleared++; say(p, "STAGE CLEAR!", 150); emit(g, "clear"); }
    else say(p, reason === "time" ? "TIME UP!" : "STAGE OVER", 120);
    p.bonusStages++; p.catchesSinceBonus = 0; p.phase = "stageEnd"; p.over = 0; p.ball.state = "gone";
  };
  const spawnBoss = (s, p) => {
    const r = { mound: 12, specter: 11, vault: 12 }[s.kind], hp = { mound: 3, specter: 4, vault: 5 }[s.kind];
    s.boss = { x: 74, y: 40, r, hp, max: hp, inv: 0 };
    say(p, { mound: "GRANDMOUND RISES!", specter: "PHANTASMO AWAKENS!", vault: "COSMOWL DESCENDS!" }[s.kind], 150);
  };
  const stageTick = g => {
    const p = g.p, s = p.stage, T = s.T;
    s.t++; s.time--;
    if (s.time <= 0) { endBonus(g, "time"); return; }
    if (s.kind === "mound") {
      if (!s.boss && s.t % 36 === 0) { const up = s.ents.filter(e => e.up <= 0 && e.cool <= 0); if (up.length) up[Math.floor(g.rng() * up.length)].up = 100; }
      for (const e of s.ents) { if (e.up > 0) e.up--; if (e.cool > 0) e.cool--; }
      if (s.boss) { s.boss.x = 74 + Math.sin(s.t / 40) * 44; s.boss.y = 40; }
    } else if (s.kind === "specter") {
      s.ents.forEach((e, i) => { e.x = 74 + Math.sin(s.t * 0.02 + i * 2.1) * 48; e.y = 52 + Math.sin(s.t * 0.031 + i) * 26; if (e.cool > 0) e.cool--; e.up = e.cool > 0 ? 0 : 1; });
      if (s.boss) { s.boss.x = 74 + Math.sin(s.t * 0.025) * 44; s.boss.y = 46 + Math.sin(s.t * 0.05) * 20; s.boss.open = (s.t % 240) < 130; }
    } else if (s.kind === "vault") {
      if (s.open > 0) s.open--;
      if (s.boss) { s.boss.x = 74 + Math.sin(s.t / 45) * 48; s.boss.y = 30; }
    }
    if (s.boss && s.boss.inv > 0) s.boss.inv--;
    if (!s.boss && s.hits >= { mound: 8, specter: 6, vault: 1 }[s.kind]) spawnBoss(s, p);
  };
  const hitCircle = (b, e, push) => {
    const dx = b.x - e.x, dy = b.y - e.y, d = Math.hypot(dx, dy), R = e.r + BALL_R;
    if (d >= R || d < 1e-6) return false;
    const nx = dx / d, ny = dy / d;
    b.x = e.x + nx * R; b.y = e.y + ny * R;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < push) { b.vx = nx * push; b.vy = ny * push; }
    return true;
  };
  const stageHits = g => {
    const p = g.p, s = p.stage, b = p.ball;
    if (s.done) return;
    for (const e of s.ents) {
      if (s.kind === "mound" ? e.up > 0 : s.kind === "specter" ? e.up > 0 : false) {
        if (hitCircle(b, e, 160)) {
          s.hits++; award(g, s.kind === "mound" ? 2000 : 3000); emit(g, "whack");
          if (s.kind === "mound") { e.up = 0; e.cool = 40; } else e.cool = 140;
          say(p, s.kind === "mound" ? "WHACK! " + s.hits : "BOO! " + s.hits, 40);
        }
      } else if (s.kind === "mound" && e.up <= 0) {  }
    }
    if (s.boss) {
      const bo = s.boss;
      if (hitCircle(b, bo, 180)) {
        const vulnerable = s.kind === "mound" ? true : s.kind === "specter" ? bo.open : s.open > 0;
        if (vulnerable && bo.inv <= 0) {
          bo.hp--; bo.inv = 50; award(g, 10000); emit(g, "bosshit"); say(p, "HIT! " + bo.hp + " LEFT", 60);
          if (s.kind === "vault") s.open = 0;
          if (bo.hp <= 0) endBonus(g, "clear");
        } else emit(g, "bossblock");
      }
    }
    if (s.kind === "vault") {
      for (let i = 0; i < s.T.lanes.length; i++) {
        const l = s.T.lanes[i], inside = Math.hypot(b.x - l[0], b.y - l[1]) < 7;
        if (inside && !p.laneIn[i] && !s.lit[i]) {
          s.lit[i] = 1; award(g, 1000); emit(g, "lane");
          if (s.lit.every(Boolean)) { s.lit = [0, 0, 0]; s.hits++; s.open = 360; award(g, 5000); say(p, "SHIELD DOWN!", 80); }
        }
        p.laneIn[i] = inside;
      }
    }
  };

  const segContact = (b, x1, y1, x2, y2, rad) => {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy, t = l2 ? clamp(((b.x - x1) * dx + (b.y - y1) * dy) / l2, 0, 1) : 0;
    const ex = b.x - (x1 + dx * t), ey = b.y - (y1 + dy * t), d = Math.hypot(ex, ey), R = BALL_R + rad;
    if (d >= R) return null;
    if (d > 1e-6) return { nx: ex / d, ny: ey / d, pen: R - d, t };
    const l = Math.sqrt(l2) || 1;
    return { nx: dy / l, ny: -dx / l, pen: R, t };
  };
  const bounce = (b, c, e, svx = 0, svy = 0) => {
    b.x += c.nx * c.pen; b.y += c.ny * c.pen;
    const vn = (b.vx - svx) * c.nx + (b.vy - svy) * c.ny;
    if (vn >= 0) return 0;
    const k = -vn < 14 ? 1 : 1 + e;
    b.vx -= k * vn * c.nx; b.vy -= k * vn * c.ny;
    return -vn;
  };
  const flipperEnd = (f, spec) => [spec.px + spec.side * spec.len * Math.cos(f.a), spec.py + spec.len * Math.sin(f.a)];
  const onTarget = (g, i) => {
    const p = g.p;
    if (p.targetHit[i]) return;
    p.targetHit[i] = 1; award(g, 1000); emit(g, "target"); touch(g);
    if (p.targetHit.every(Boolean)) {
      p.bankReset = 40;
      if (p.mode && p.mode.kind === "evo" && p.mode.phase === "items") { p.mode.phase = "ready"; say(p, "NOW HIT THE CAVE!", 120); emit(g, "ready"); }
      else if (!p.mode) { p.evoItems = 1; award(g, 5000); say(p, "EVOLUTION LIT AT THE HOLE!", 120); emit(g, "lit"); }
    }
  };
  const capture = (g, p, name) => {
    const b = p.ball, h = p.T.holes[name];
    b.state = "hole"; b.hole = name; b.x = h.x; b.y = h.y; b.vx = b.vy = 0; b.lock = 0;
    emit(g, "hole");
    const m = p.mode;
    b.hold = 50;
    if (name === "cave") {
      if (m && m.kind === "catch" && m.phase === "ready") {
        const c = CREATURES[m.id];
        m.phase = "capture"; m.t = 0; b.hold = 190;
        m.breaks = g.rng() < 0.08 * c.rarity * (1 - 0.18 * p.tier);
        emit(g, "orb");
      } else if (m && m.kind === "evo" && m.phase === "ready") { m.phase = "evolve"; m.t = 0; b.hold = 170; emit(g, "evolving"); }
      else if (!m && p.arrows >= 2) { startCatch(g); b.hold = 100; }
      else { award(g, 1000); touch(g); }
    } else if (name === "slotA") {
      if (p.extraBallLit && !p.ebUsed) { p.extraBalls++; p.ebUsed = true; p.extraBallLit = false; award(g, 25000); say(p, "EXTRA BALL!", 150); emit(g, "extra"); b.hold = 90; }
      else if (!m && p.evoItems) {
        const cand = evoCandidate(g, p);
        if (cand) { startEvo(g, cand); b.hold = 90; } else { award(g, 5000); say(p, "NOTHING TO EVOLVE YET", 90); }
      } else { award(g, 2000); touch(g); }
    } else if (name === "slotB") {
      if (p.catchesSinceBonus >= 3 && !m) { startBonus(g); return; }
      if (!m && p.spins >= 25) { p.mode = { kind: "travel", cursor: p.area, timer: TRAVEL_FRAMES, phase: "select", t: 0 }; b.hold = TRAVEL_FRAMES; say(p, "CHOOSE AN AREA", 120); emit(g, "travel"); }
      else { award(g, 2000); touch(g); }
    }
  };
  const release = (g, p) => {
    const b = p.ball, h = p.T.holes[b.hole], dir = h.x < 74 ? 1 : -1;
    b.state = "play"; b.noHole = 40;
    if (b.hole === "cave") { b.vx = (g.rng() - 0.5) * 100; b.vy = 140; b.y += 6; }
    else { b.vx = dir * 120; b.vy = 60; }
    b.hole = null; emit(g, "release");
  };
  const substep = (g, p, input) => {
    const T = p.T, b = p.ball;
    for (let i = 0; i < 2; i++) {
      const f = p.fl[i], held = i === 0 ? p.lf : p.rf, target = held ? FLIPPER_UP : FLIPPER_REST, speed = held ? FLIP_UP_SPEED : FLIP_DOWN_SPEED;
      const na = f.a + clamp(target - f.a, -speed * DT, speed * DT);
      f.w = (na - f.a) / DT; f.a = na;
    }
    if (b.state !== "play" && b.state !== "lane") return;
    b.vy += GRAVITY * DT; b.vx *= 0.99992; b.vy *= 0.99992;
    b.x += b.vx * DT; b.y += b.vy * DT;
    for (const w of T.walls) { const c = segContact(b, w[0], w[1], w[2], w[3], 0.8); if (c) bounce(b, c, 0.42); }
    for (const w of T.gates) {
      const l = Math.hypot(w[2] - w[0], w[3] - w[1]), nx = (w[3] - w[1]) / l, ny = -(w[2] - w[0]) / l;
      if ((b.x - w[0]) * nx + (b.y - w[1]) * ny < 0) continue;
      const c = segContact(b, w[0], w[1], w[2], w[3], 0.8);
      if (c && b.vx * c.nx + b.vy * c.ny < 0) bounce(b, c, 0.3);
    }
    for (const q of T.posts) { const c = segContact(b, q[0], q[1], q[0], q[1], q[2]); if (c) bounce(b, c, 0.55); }
    T.bumpers.forEach((q, i) => {
      const c = segContact(b, q[0], q[1], q[0], q[1], q[2]);
      if (!c) return;
      b.x += c.nx * c.pen; b.y += c.ny * c.pen;
      const sp = Math.max(250, Math.hypot(b.vx, b.vy) * 0.75);
      b.vx = c.nx * sp; b.vy = c.ny * sp;
      p.bumpFlash[i] = 8; p.bumperHits++; award(g, 100); emit(g, "bumper"); touch(g);
      if (!p.stage && p.bumperHits % 30 === 0 && p.arrows < 2) { p.arrows++; say(p, p.arrows >= 2 ? "CATCH MODE READY!" : "CATCH ARROW LIT", 90); }
    });
    T.slings.forEach((w, i) => {
      const c = segContact(b, w[0], w[1], w[2], w[3], 0.8);
      if (!c) return;
      const impact = bounce(b, c, 0.3);
      if (impact > 30) {
        const vn = b.vx * c.nx + b.vy * c.ny;
        if (vn < 270) { b.vx += c.nx * (270 - vn); b.vy += c.ny * (270 - vn); }
        p.slingFlash[i] = 6; award(g, 10); emit(g, "sling"); touch(g);
      }
    });
    T.targets.forEach((t, i) => {
      const c = segContact(b, t.seg[0], t.seg[1], t.seg[2], t.seg[3], 1.4);
      if (c && bounce(b, c, 0.3) > 20) onTarget(g, i);
    });
    T.flippers.forEach((spec, i) => {
      const f = p.fl[i], [ex, ey] = flipperEnd(f, spec), c = segContact(b, spec.px, spec.py, ex, ey, FLIPPER_R);
      if (!c) return;
      const s = c.t * spec.len, svx = s * f.w * -spec.side * Math.sin(f.a), svy = s * f.w * Math.cos(f.a);
      bounce(b, c, 0.35, svx, svy);
    });
    const sp = Math.hypot(b.vx, b.vy), vmax = VMAX * (T.launch || 1);
    if (sp > vmax) { b.vx *= vmax / sp; b.vy *= vmax / sp; }
    if (b.noHole > 0) b.noHole--;
    else if (!p.stage) for (const name in T.holes) { const h = T.holes[name]; if (Math.hypot(b.x - h.x, b.y - h.y) < 4.5) { capture(g, p, name); return; } }
    if (!p.stage && b.noRamp > 0) b.noRamp--;
    else if (!p.stage) T.ramps.forEach((r, i) => {
      if (b.state === "play" && b.vy < -60 && Math.hypot(b.x - r.enter[0], b.y - r.enter[1]) < r.r) {
        b.state = "ramp"; b.ramp = { i, t: 0 }; emit(g, "ramp");
      }
    });
    if (b.state === "play" || b.state === "lane") {
      T.kicks.forEach((k, i) => {
        if (p.kick[i] && b.vy > 0 && Math.hypot(b.x - k.x, b.y - k.y) < k.r) {
          p.kick[i] = false; b.vy = -430; b.vx = k.x < 74 ? 40 : -40; award(g, 1000); say(p, "KICKBACK!", 60); emit(g, "kickback");
        }
      });
      if (p.stage) stageHits(g);
    }
  };
  const frameTriggers = (g, p) => {
    const T = p.T, b = p.ball;
    if (b.state !== "play" && b.state !== "lane") return;
    T.lanes.forEach((l, i) => {
      if (p.stage) return;
      const inside = Math.hypot(b.x - l[0], b.y - l[1]) < 7;
      if (inside && !p.laneIn[i]) {
        if (!p.lanes[i]) { p.lanes[i] = 1; award(g, 500); emit(g, "lane"); touch(g); }
        if (p.lanes.every(Boolean)) {
          p.lanes = [0, 0, 0]; p.laneFlash = 40;
          if (p.tier < 3) { p.tier++; say(p, TIERS[p.tier] + " UPGRADE!", 110); } else { p.mult2 = 20 * 60; say(p, "2X SCORE!", 110); }
          if (p.bonusMult < 10) p.bonusMult++;
          if (!p.saverLit) p.saverLit = true;
          award(g, 3000); emit(g, "upgrade");
        }
      }
      p.laneIn[i] = inside;
    });
    T.spinners.forEach((s, i) => {
      const sp = p.spinners[i], inside = Math.abs(b.x - s[0]) < s[2] / 2 + 2 && Math.abs(b.y - s[1]) < s[3] / 2 + 2;
      if (inside) sp.v = Math.max(sp.v, Math.hypot(b.vx, b.vy) / 25);
      const was = Math.floor(sp.ang);
      sp.ang += sp.v / 60; sp.v *= 0.985;
      if (Math.floor(sp.ang) > was) {
        award(g, 100); p.spins++; emit(g, "spin"); if (p.spins % 4 === 0) touch(g);
        if (p.spins === 25 && !p.mode) say(p, "TRAVEL LIT AT THE HOLE!", 100);
      }
    });
  };
  const rampFrame = (g, p) => {
    const b = p.ball;
    if (b.state !== "ramp") return;
    const r = p.T.ramps[b.ramp.i], f = b.ramp.t / 45;
    b.ramp.t++;
    b.x = r.enter[0] + (r.exit[0] - r.enter[0]) * f; b.y = r.enter[1] + (r.exit[1] - r.enter[1]) * f;
    if (b.ramp.t >= 45) {
      b.state = "play"; b.x = r.exit[0]; b.y = r.exit[1]; b.vx = r.vx; b.vy = 40; b.noRamp = 30; b.ramp = null;
      p.arrows = Math.min(2, p.arrows + 1); award(g, 2500); touch(g, 3); emit(g, "rampdone");
      if (p.arrows >= 2 && !p.mode) say(p, "CATCH MODE READY!", 100);
    }
  };
  const nudge = (g, p, input) => {
    const b = p.ball;
    if (b.state !== "play" || p.tilted) return;
    const dir = input.left && !input.right ? -1 : input.right && !input.left ? 1 : 0;
    b.vx += dir * 55; b.vy -= dir ? 18 : 45;
    p.tilt += 40; p.nudgeCool = 14; emit(g, "nudge");
    if (p.tilt >= 100) { p.tilted = true; say(p, "TILT!", 200); emit(g, "tilt"); }
    else if (p.tilt >= 70) say(p, "DANGER!", 50);
  };

  const relaunch = (g, p) => {
    const T = p.T, b = p.ball;
    if (p.stage) { p.ball = { x: 74, y: 44, vx: 10, vy: 40, state: "play", hole: null, lock: 0, noHole: 0, noRamp: 0, ramp: null }; return; }
    Object.assign(b, { x: T.plunger[0], y: T.plunger[1], vx: 0, vy: 0, state: "lane", hole: null, noHole: 0, noRamp: 0, ramp: null });
    p.phase = "launch"; p.charge = 0;
  };
  const endMode = (g, p, why) => { if (p.mode && p.mode.kind === "catch") say(p, CREATURES[p.mode.id].name + " " + why, 100); p.mode = null; };
  const drained = (g, p) => {
    emit(g, "drain");
    if (p.stage) {
      if (p.saver > 0 && !p.tilted) { p.saver = 0; p.saverNext = 0; say(p, "BALL SAVED!", 80); emit(g, "saved"); relaunch(g, p); return; }
      endBonus(g, "drain"); return;
    }
    if (!p.tilted && (p.saver > 0 || p.saverLit)) {
      if (p.saver <= 0) p.saverLit = false;
      p.saver = 0; p.saverNext = 300;
      say(p, "BALL SAVED!", 100); emit(g, "saved"); relaunch(g, p); return;
    }
    endMode(g, p, "GOT AWAY");
    p.phase = "drain"; p.over = 0;
  };
  const buildTally = p => {
    const lines = p.tilted ? [["TILT", "NO BONUS"]] : [["CATCHES", p.ballCatches * 10000], ["EVOLUTIONS", p.ballEvos * 15000], ["BUMPERS", p.bumperHits * 10], ["SPINS", p.spins * 50]];
    const sub = p.tilted ? 0 : lines.reduce((a, l) => a + l[1], 0), total = sub * p.bonusMult;
    if (!p.tilted) lines.push(["MULTIPLIER", "X" + p.bonusMult]);
    lines.push(["TOTAL", total]);
    return { lines, shown: 0, t: 0, total };
  };
  const endGame = g => {
    const p = g.p, list = g.scores[p.tableId];
    p.phase = "over"; p.tally = null;
    if (g.kept) delete g.kept[p.tableId];
    g.scene = "over"; g.t = 0; g.music = "title"; emit(g, "over");
    const rank = list.findIndex(e => p.score > e.score);
    g.entry = rank >= 0 && p.score > 0 ? { table: p.tableId, rank, letters: [0, 0, 0], pos: 0, score: p.score } : null;
  };
  const nextBall = g => {
    const p = g.p;
    if (p.extraBalls > 0) { p.extraBalls--; newBall(p); say(p, "SHOOT AGAIN!", 100); return; }
    if (p.ballNo < p.balls) { p.ballNo++; newBall(p); say(p, "BALL " + p.ballNo, 80); return; }
    endGame(g);
  };

  const modeFrame = (g, p, input, edges) => {
    const m = p.mode, b = p.ball;
    if (p.mult2 > 0) p.mult2--;
    if (!m) return;
    m.t++;
    if (m.kind === "catch") {
      if (m.phase === "capture") {
        if (m.t === 60 || m.t === 100 || m.t === 140) emit(g, "shake");
        if (m.t >= 170) {
          if (m.breaks) { m.phase = "reveal"; m.hits = m.need - 3; m.t = 0; say(p, "IT BROKE FREE!", 100); emit(g, "broke"); }
          else finishCatch(g);
        }
      } else if (--m.timer <= 0) { endMode(g, p, "FLED!"); if (b.state === "hole") b.hold = 0; emit(g, "flee"); }
    } else if (m.kind === "evo") {
      if (m.phase === "evolve" && m.t >= 150) finishEvo(g);
      else if (m.phase !== "evolve" && --m.timer <= 0) { p.mode = null; say(p, "EVOLUTION FAILED", 90); }
    } else if (m.kind === "travel") {
      if (edges.l) { m.cursor = (m.cursor + 2) % 3; emit(g, "menu"); }
      if (edges.r) { m.cursor = (m.cursor + 1) % 3; emit(g, "menu"); }
      m.timer--;
      if ((input.down && !p.prev.down) || m.timer <= 0) {
        p.area = m.cursor; p.spins = 0; award(g, 10000);
        say(p, "TRAVELLED TO " + AREAS[p.tableId === "tide" ? "t" : "e"][p.area], 140); emit(g, "travelled");
        p.mode = null; b.hold = 30;
      }
    }
  };

  const playFrame = (g, input) => {
    const p = g.p, pv = p.prev, b = p.ball;
    p.frame++;
    if (p.msgTtl > 0) p.msgTtl--;
    const lf = !!(input.left || input.b) && !p.tilted && p.phase !== "tally", rf = !!(input.right || input.a) && !p.tilted && p.phase !== "tally";
    const edges = { l: lf && !pv.lf, r: rf && !pv.rf };
    p.lf = lf; p.rf = rf;
    if ((edges.l || edges.r) && p.phase === "play" && b.state !== "hole") emit(g, "flip");
    if (edges.l && p.lanes) p.lanes.push(p.lanes.shift());
    if (edges.r && p.lanes) p.lanes.unshift(p.lanes.pop());
    if (p.bankReset > 0 && --p.bankReset === 0) p.targetHit = p.targetHit.map(() => 0);
    for (let i = 0; i < p.bumpFlash.length; i++) if (p.bumpFlash[i] > 0) p.bumpFlash[i]--;
    for (let i = 0; i < p.slingFlash.length; i++) if (p.slingFlash[i] > 0) p.slingFlash[i]--;
    if (p.laneFlash > 0) p.laneFlash--;
    if (p.tilt > 0) p.tilt = Math.max(0, p.tilt - 0.3);
    if (p.nudgeCool > 0) p.nudgeCool--;
    if (p.phase === "launch") {
      const pressed = input.down || input.a || input.b;
      if (!pressed) p.plungerReady = true;
      const held = pressed && p.plungerReady !== false;
      if (held) p.charge = Math.min(1, p.charge + 1 / 40);
      else if (pv.launchHeld && p.charge > 0.05) {
        b.vy = -(240 + 260 * p.charge) * (TABLES[p.tableId]?.launch || 1); b.vx = 0; b.state = "play"; p.phase = "play"; p.saver = Math.max(p.saver, p.saverNext); p.saverNext = 0; emit(g, "launch");
      }
      pv.launchHeld = held;
      if (!held && p.charge <= 0.05) p.charge = 0;
    }
    if (p.phase === "launch" || p.phase === "play") {
      if (input.up && !pv.up && p.nudgeCool === 0 && p.phase === "play") nudge(g, p, input);
      for (let n = 0; n < SUBSTEPS; n++) substep(g, p, input);
      if (b.state === "ramp") rampFrame(g, p);
      frameTriggers(g, p);
      if (b.state === "hole") {
        if (b.hold > 0) b.hold--;
        if (b.hold <= 0 && !(p.mode && ["capture", "evolve", "travel"].includes(p.mode.phase))) release(g, p);
      }
      if (p.stage) stageTick(g);
      modeFrame(g, p, input, edges);
      if (p.phase === "play") {
        if (p.saver > 0) p.saver--;
        if (b.state === "play" && b.x > 142 && b.y > p.T.h - 24 && Math.abs(b.vy) < 25 && !p.stage) relaunch(g, p);
        if (b.state === "play" && b.y > p.T.h + 8) drained(g, p);
        if (b.state === "play" || b.state === "lane") {
          if (b.x < 2 || b.x > 158 || b.y < 2) { b.x = clamp(b.x, 4, 156); b.y = Math.max(b.y, 4); b.vx = b.vy = 0; }
        }
      }
    } else if (p.phase === "drain") {
      if (++p.over >= 70) { p.phase = "tally"; p.tally = buildTally(p); emit(g, "tally"); }
    } else if (p.phase === "tally") {
      const t = p.tally;
      if (++t.t % 40 === 0) { if (t.shown < t.lines.length) { t.shown++; emit(g, "tallyline"); } }
      if (t.shown >= t.lines.length && t.t % 40 === 20 && !t.paid) { t.paid = 1; award(g, t.total); }
      if (t.shown >= t.lines.length && t.t > (t.lines.length + 1) * 40 + 40) { p.tally = null; nextBall(g); }
    } else if (p.phase === "stageEnd") {
      if (++p.over >= 150) {
        const s = p.stage;
        p.stage = null; p.T = p.main; p.mode = null; g.music = p.main.music;
        p.ball = { x: 0, y: 0, vx: 0, vy: 0, state: "lane", hole: null, lock: 0, noHole: 0, noRamp: 0, ramp: null };
        relaunch(g, p); p.charge = 0; p.saver = 0; p.saverNext = 600;
        p.spinners = p.main.spinners.map(() => ({ v: 0, ang: 0, inside: false })); p.laneIn = p.main.lanes.map(() => false);
        p.targetHit = p.main.targets.map(() => 0); p.cam = p.T.h - VIEW;
        say(p, s.result === "clear" ? "BONUS CLEARED!" : "BACK TO THE TABLE", 90);
      }
    }
    const target = clamp(b.y + b.vy * 0.1 - VIEW * 0.6, 0, Math.max(0, p.T.h - VIEW));
    p.cam += clamp((target - p.cam) * 0.2, -9, 9);
    pv.lf = lf; pv.rf = rf; pv.up = !!input.up; pv.down = !!input.down;
  };

  const NAME_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ";
  const countDex = (g, level) => g.dex.reduce((n, v) => n + (v >= level ? 1 : 0), 0);
  const menuTick = (g, input) => {
    const h = g.held, e = k => input[k] && !h[k];
    const go = scene => { g.scene = scene; g.t = 0; emit(g, "ok"); };
    if (g.scene === "title") {
      if (e("up")) { g.cursor = (g.cursor + 2) % 3; emit(g, "menu"); }
      if (e("down")) { g.cursor = (g.cursor + 1) % 3; emit(g, "menu"); }
      if (e("a")) go(["select", "dex", "scores"][g.cursor]);
    } else if (g.scene === "select") {
      if (e("left") || e("right")) { g.tableCursor = 1 - g.tableCursor; emit(g, "menu"); }
      if (e("a") || e("b")) {
        if (g.resumable && g.p && g.p.tableId === TABLE_IDS[g.tableCursor]) { g.scene = "play"; g.resumable = false; g.music = g.p.main.music; emit(g, "ok"); }
        else { startGame(g, TABLE_IDS[g.tableCursor]); g.p.plungerReady = false; }
      }
    } else if (g.scene === "dex") {
      if (e("up")) { g.dexCursor = Math.max(0, g.dexCursor - 1); emit(g, "menu"); }
      if (e("down")) { g.dexCursor = Math.min(CREATURES.length - 1, g.dexCursor + 1); emit(g, "menu"); }
      if (e("left")) g.dexCursor = Math.max(0, g.dexCursor - 7);
      if (e("right")) g.dexCursor = Math.min(CREATURES.length - 1, g.dexCursor + 7);
      if (e("b") || e("a")) go("title");
    } else if (g.scene === "scores") {
      if (e("b") || e("a")) go("title");
    } else if (g.scene === "over") {
      g.t++;
      if (g.t >= 360 || (g.t > 60 && (e("a") || e("b")))) { g.scene = g.entry ? "name" : "title"; g.t = 0; g.music = "title"; }
    } else if (g.scene === "name") {
      const en = g.entry;
      if (e("up")) en.letters[en.pos] = (en.letters[en.pos] + 1) % NAME_LETTERS.length;
      if (e("down")) en.letters[en.pos] = (en.letters[en.pos] + NAME_LETTERS.length - 1) % NAME_LETTERS.length;
      if (e("left") || e("b")) en.pos = Math.max(0, en.pos - 1);
      if (e("right") || e("a")) {
        en.pos++;
        if (en.pos >= 3) {
          const list = g.scores[en.table], name = en.letters.map(i => NAME_LETTERS[i]).join("").trim() || "???";
          list.splice(en.rank, 0, { name, score: en.score }); list.length = 5;
          g.entry = null; g.scene = "scores"; g.t = 0; emit(g, "newhi");
        } else emit(g, "menu");
      }
    }
  };
  const PAUSE_ITEMS = ["CONTINUE", "BOARD SELECT"];
  const openSelect = (g, fresh = false) => {
    const p = g.p;
    if (fresh) { g.p = null; g.kept = {}; g.resumable = false; }
    else if (p && g.scene === "play") {
      g.kept = { ...(g.kept || {}), [p.tableId]: p.cubes || 0 };
      g.resumable = p.phase !== "over";
      g.tableCursor = Math.max(0, TABLE_IDS.indexOf(p.tableId));
    }
    g.paused = false; g.pauseCursor = 0; g.scene = "select"; g.t = 0; g.music = "title";
    return g;
  };
  const pauseTick = (g, input) => {
    const e = k => input[k] && !g.held[k];
    if (e("up") || e("down")) { g.pauseCursor = 1 - (g.pauseCursor || 0); emit(g, "menu"); }
    if (e("a") || e("b")) { emit(g, "ok"); if (g.pauseCursor) openSelect(g); else { g.paused = false; g.pauseCursor = 0; } }
  };
  const musicFor = g => {
    if (g.scene !== "play") return "title";
    const p = g.p;
    if (!p) return "title";
    if (p.stage) return p.stage.T.music;
    if (p.mode && p.mode.kind === "catch" && p.mode.phase !== "capture") return "catch";
    if (p.mode && p.mode.kind === "travel") return "travel";
    return p.main.music;
  };
  const tick = (g, input) => {
    g.t++;
    if (g.scene === "play" && g.paused) pauseTick(g, input);
    else if (g.scene === "play") playFrame(g, input); else menuTick(g, input);
    g.held = { ...input };
    g.music = musicFor(g);
  };
  const step = (g, dt, input = {}) => {
    g.acc += dt;
    let n = 0;
    while (g.acc >= FRAME && n < 20) { g.acc -= FRAME; tick(g, input); n++; }
    if (n) g.version++;
    return n > 0;
  };
  const drainEvents = g => g.events.splice(0, g.events.length);

  const put = (px, x, y, s) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = s; };
  const rect = (px, x0, y0, x1, y1, s) => { for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) px[y * W + x] = s; };
  const line = (px, x0, y0, x1, y1, s, thick = 1) => {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 2000; guard++) {
      put(px, x0, y0, s); if (thick > 1) { put(px, x0 + 1, y0, s); put(px, x0, y0 + 1, s); }
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  const disc = (px, cx, cy, r, s, ring) => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = x * x + y * y;
      if (d <= r * r + r * 0.6 && (ring === undefined || d > (r - 1.2) * (r - 1.2))) put(px, cx + x, cy + y, s);
    }
  };
  const text = (px, str, x, y, shade = 3, k = 1) => {
    [...String(str)].forEach((ch, n) => {
      const g = GLYPHS[ch] || GLYPHS[ch.toUpperCase()] || GLYPHS["?"];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if ((+g[r] >> (2 - c)) & 1) rect(px, x + n * 4 * k + c * k, y + r * k, x + n * 4 * k + c * k + k, y + r * k + k, shade);
    });
  };
  const textWidth = (str, k = 1) => String(str).length * 4 * k - k;
  const centred = (px, str, y, shade = 3, k = 1) => text(px, str, Math.round((W - textWidth(str, k)) / 2), y, shade, k);
  const box = (px, x0, y0, x1, y1) => { rect(px, x0, y0, x1, y1, 3); rect(px, x0 + 1, y0 + 1, x1 - 1, y1 - 1, 0); };
  const sprite = (px, art, x, y, k = 1, cellMask) => {
    for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
      let v = art[r * 16 + c];
      if (v < 0) continue;
      if (cellMask && !cellMask[(r >> 2) * 4 + (c >> 2)]) v = 3;
      rect(px, x + c * k, y + r * k, x + c * k + k, y + r * k + k, v);
    }
  };
  const silhouette = (px, art, x, y, k = 1) => { for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) if (art[r * 16 + c] >= 0) rect(px, x + c * k, y + r * k, x + c * k + k, y + r * k + k, 2); };
  const revealMask = m => { const mask = new Array(16).fill(false), shown = Math.floor(16 * Math.min(1, m.hits / m.need)); for (let i = 0; i < shown; i++) mask[m.cells[i]] = true; return mask; };
  const pad = (n, len) => String(n).padStart(len, " ");

  const drawTable = (px, g) => {
    const p = g.p, T = p.T, cam = Math.round(p.cam), sy = y => y - cam;
    rect(px, 0, 0, W, VIEW, 0);
    for (let y = -((cam % 8) + 8) % 8; y < VIEW; y += 8) for (let x = 3; x < W; x += 8) put(px, x, y + 3, 1);
    rect(px, 0, 0, 5, VIEW, 3); rect(px, T.plunger ? 155 : 143, 0, W, VIEW, 3);
    const L = (a, b, c, d, s, t) => line(px, a, sy(b), c, sy(d), s, t);
    for (const w of T.walls) L(w[0], w[1], w[2], w[3], 3, 2);
    for (const w of T.gates) L(w[0], w[1], w[2], w[3], 2, 1);
    if (T.plunger) {
      const top = T.h - 8 + Math.round(p.charge * 6);
      rect(px, 145, sy(top), 152, sy(T.h - 6), 2); rect(px, 144, sy(top - 1), 153, sy(top), 3);
    }
    for (const q of T.posts) disc(px, q[0], sy(q[1]), Math.round(q[2]), 3);
    T.lanes.forEach((l, i) => {
      const lit = p.stage ? p.stage.lit && p.stage.lit[i] : p.lanes[i];
      disc(px, l[0], sy(l[1]), 4, lit ? 3 : 1, lit ? undefined : 1); if (lit) put(px, l[0], sy(l[1]) - 1, 0);
    });
    T.bumpers.forEach((q, i) => {
      const hit = p.bumpFlash[i] > 0, r = Math.round(q[2]);
      disc(px, q[0], sy(q[1]), r, hit ? 3 : 1); disc(px, q[0], sy(q[1]), r, 3, 1); disc(px, q[0], sy(q[1]), hit ? 5 : 3, hit ? 0 : 2);
    });
    T.slings.forEach((w, i) => {
      L(w[0], w[1], w[2], w[3], p.slingFlash[i] > 0 ? 0 : 3, 2);
    });
    T.targets.forEach((t, i) => L(t.seg[0], t.seg[1], t.seg[2], t.seg[3], p.targetHit[i] ? 1 : 3, 2));
    T.spinners.forEach((s, i) => {
      const sp = p.spinners[i], phase = Math.floor(sp.ang * 4) % 4, x = s[0], y = sy(s[1]);
      rect(px, x - s[2] / 2, y - s[3] / 2, x + s[2] / 2, y + s[3] / 2, 0);
      for (let k = -s[2] / 2; k < s[2] / 2; k += 3) L(x + k, s[1] - s[3] / 2 + (phase + k) % 3, x + k, s[1] + s[3] / 2, 2, 1);
      rect(px, x - s[2] / 2, y - s[3] / 2, x + s[2] / 2, y - s[3] / 2 + 1, 3);
    });
    T.ramps.forEach(r => {
      const dx = r.exit[0] - r.enter[0], dy = r.exit[1] - r.enter[1], l = Math.hypot(dx, dy), nx = -dy / l * 3, ny = dx / l * 3;
      for (let t = 0; t < l; t += 4) { put(px, r.enter[0] + dx * t / l + nx, sy(r.enter[1] + dy * t / l + ny), 2); put(px, r.enter[0] + dx * t / l - nx, sy(r.enter[1] + dy * t / l - ny), 2); }
      const lit = p.arrows < 2 || (p.frame >> 3) % 2; disc(px, r.enter[0], sy(r.enter[1]), 3, lit ? 3 : 1, 1);
      L(r.enter[0] - 2, r.enter[1] + 1, r.enter[0], r.enter[1] - 2, 3, 1); L(r.enter[0] + 2, r.enter[1] + 1, r.enter[0], r.enter[1] - 2, 3, 1);
    });
    for (const name in T.holes) {
      const h = T.holes[name], lit = (name === "cave" && ((p.mode && p.mode.phase === "ready") || p.arrows >= 2 && !p.mode)) ||
        (name === "slotA" && ((p.evoItems && !p.mode) || (p.mode && p.mode.kind === "evo" && p.mode.phase === "ready") || p.extraBallLit)) ||
        (name === "slotB" && !p.mode && (p.spins >= 25 || p.catchesSinceBonus >= 3));
      disc(px, h.x, sy(h.y), 6, lit && (p.frame >> 3) % 2 ? 1 : 0); disc(px, h.x, sy(h.y), 6, 3, 1); disc(px, h.x, sy(h.y), 3, 3);
      if (p.ball.state === "hole" && p.ball.hole === name) disc(px, h.x, sy(h.y), 2, 1);
    }
    if (p.mode && p.mode.kind === "catch" && T.holes.cave) {
      const h = T.holes.cave, art = SPRITES[p.mode.id];
      if (p.mode.phase === "reveal") { box(px, h.x - 11, sy(h.y) - 31, h.x + 11, sy(h.y) - 7); silhouette(px, art, h.x - 8, sy(h.y) - 29); sprite(px, art, h.x - 8, sy(h.y) - 29, 1, revealMask(p.mode)); }
      else if (p.mode.phase === "ready") { box(px, h.x - 11, sy(h.y) - 31, h.x + 11, sy(h.y) - 7); sprite(px, art, h.x - 8, sy(h.y) - 29, 1); }
    }
    T.kicks.forEach((k, i) => { if (p.kick[i]) { const x = k.x, y = sy(k.y); L(x - 2, k.y + 2, x, k.y - 2, 3, 1); L(x + 2, k.y + 2, x, k.y - 2, 3, 1); put(px, x, y + 4, 3); } });
    if (p.stage) drawStage(px, p, sy);
    T.flippers.forEach((spec, i) => {
      const [ex, ey] = flipperEnd(p.fl[i], spec);
      line(px, spec.px, sy(spec.py), ex, sy(ey), 3, 2); line(px, spec.px, sy(spec.py) + 1, ex, sy(ey) + 1, 3, 2); put(px, spec.px, sy(spec.py), 0);
    });
    const b = p.ball;
    if (b.state !== "hole" && b.state !== "gone") drawBall(px, b.x, sy(b.y), p.tier);
    const m = p.mode;
    if (m && (m.kind === "catch" || m.kind === "evo")) {
      const id = m.kind === "catch" ? m.id : (m.phase === "evolve" && m.t > 90 ? m.to : m.from);
      box(px, 1, 1, 23, 25); sprite(px, SPRITES[id], 4, 4, 1, m.kind === "catch" && m.phase === "reveal" ? revealMask(m) : undefined);
      const frac = m.kind === "catch" ? Math.min(1, m.hits / m.need) : m.kind === "evo" ? (m.phase === "items" ? 0 : 1) : 0;
      rect(px, 2, 26, 2 + Math.round(20 * frac), 28, 3); rect(px, 2, 26, 22, 27, 3);
      rect(px, 3, 27, 3 + Math.round(18 * frac), 27, 0);
    }
    if (m && m.kind === "travel") {
      box(px, 20, 34, 140, 96); centred(px, "CHOOSE AREA", 40);
      const areas = AREAS[p.tableId === "tide" ? "t" : "e"];
      areas.forEach((a, i) => { text(px, (i === m.cursor ? ">" : " ") + a, 40, 54 + i * 10); });
      centred(px, "LEFT RIGHT PICK  DOWN GO", 86, 2);
    }
    if (m && (m.phase === "capture" || m.phase === "evolve")) drawCinematic(px, m);
    if (p.tilted) centred(px, "TILT", 60, 3, 3);
    if (p.phase === "drain" || p.phase === "tally") drawTally(px, p);
    if (p.phase === "stageEnd") { box(px, 24, 44, 136, 88); centred(px, p.stage.result === "clear" ? "STAGE CLEAR!" : p.stage.result === "time" ? "TIME UP" : "STAGE OVER", 52, 3, 2); centred(px, "SCORE " + p.score, 74); }
    drawBar(px, g);
  };
  const drawBall = (px, x, y, tier) => {
    disc(px, x, y, 3, 3); put(px, x - 1, y - 1, 0); put(px, x, y - 1, 0);
    if (tier >= 1) { put(px, x + 1, y + 1, 1); }
    if (tier >= 2) { put(px, x - 1, y + 1, 1); }
    if (tier >= 3) { put(px, x + 1, y - 1, 1); put(px, x, y, 1); }
  };
  const drawStage = (px, p, sy) => {
    const s = p.stage;
    if (s.kind === "mound") for (const e of s.ents) {
      disc(px, e.x, sy(e.y) + 3, 7, 3, 1); disc(px, e.x, sy(e.y) + 3, 4, 3);
      if (e.up > 0) { disc(px, e.x, sy(e.y) + (e.up > 85 ? 1 : 0), 5, 2); disc(px, e.x, sy(e.y), 5, 3, 1); put(px, e.x - 2, sy(e.y) - 1, 3); put(px, e.x + 2, sy(e.y) - 1, 3); }
    }
    if (s.kind === "specter") for (const e of s.ents) if (e.up > 0) { disc(px, e.x, sy(e.y), 6, 1); disc(px, e.x, sy(e.y), 6, 3, 1); put(px, e.x - 2, sy(e.y) - 1, 3); put(px, e.x + 2, sy(e.y) - 1, 3); rect(px, e.x - 1, sy(e.y) + 2, e.x + 2, sy(e.y) + 3, 3); }
    if (s.boss) {
      const b = s.boss, flash = b.inv > 0 && (p.frame >> 1) % 2;
      const body = flash ? 0 : s.kind === "vault" && s.open <= 0 ? 2 : s.kind === "specter" && !b.open ? 2 : 1;
      disc(px, b.x, sy(b.y), b.r, body); disc(px, b.x, sy(b.y), b.r, 3, 1);
      put(px, b.x - 4, sy(b.y) - 3, 3); put(px, b.x + 4, sy(b.y) - 3, 3); put(px, b.x - 5, sy(b.y) - 4, 3); put(px, b.x + 5, sy(b.y) - 4, 3);
      if (s.kind === "specter" && b.open) rect(px, b.x - 4, sy(b.y) + 2, b.x + 5, sy(b.y) + 6, 3);
      if (s.kind === "vault" && s.open <= 0) { disc(px, b.x, sy(b.y), b.r + 2, 3, 1); }
      for (let i = 0; i < b.max; i++) rect(px, 50 + i * 12, sy(4), 59 + i * 12, sy(7), i < b.hp ? 3 : 1);
    }
    text(px, String(Math.ceil(s.time / 60)), 130, 4, 2);
  };
  const drawCinematic = (px, m) => {
    box(px, 30, 30, 130, 100);
    const id = m.kind === "catch" ? m.id : m.phase === "evolve" && m.t > 90 ? m.to : m.from;
    if (m.kind === "catch") {
      const shake = m.t < 60 ? 0 : Math.round(Math.sin(m.t * 0.5) * 3);
      if (m.t < 60) sprite(px, SPRITES[id], 64, 40, 2); else drawBall(px, 80 + shake, 66, 0);
      centred(px, m.t < 60 ? "THROWN!" : m.t < 150 ? "SHAKE... ".slice(0, 3 + Math.floor((m.t - 60) / 30) * 2) : m.breaks ? "BROKE FREE" : "GOTCHA!", 86);
    } else {
      sprite(px, SPRITES[id], 64, 40, 2);
      if (m.t < 90 ? (m.t >> 2) % 2 : false) rect(px, 62, 38, 98, 74, 0);
      if (m.t >= 80 && m.t < 100) for (let i = 0; i < 8; i++) line(px, 80, 56, 80 + Math.cos(i) * 24, 56 + Math.sin(i) * 20, 3, 1);
      centred(px, m.t < 90 ? "WHAT?" : CREATURES[m.from].name + "!", 86);
    }
  };
  const drawTally = (px, p) => {
    if (p.phase === "drain") { centred(px, "BALL LOST", 64, 3, 2); return; }
    const t = p.tally;
    if (!t) return;
    box(px, 14, 20, 146, 112); centred(px, "END OF BALL", 26, 3, 1);
    t.lines.slice(0, t.shown).forEach((l, i) => { text(px, l[0], 20, 38 + i * 10); const v = String(l[1]); text(px, v, 140 - textWidth(v), 38 + i * 10); });
  };
  const drawBar = (px, g) => {
    const p = g.p;
    rect(px, 0, VIEW, W, H, 0); rect(px, 0, VIEW, W, VIEW + 1, 3);
    if (p.msgTtl > 0 && (p.msgTtl > 20 || (p.msgTtl >> 2) % 2)) text(px, p.msg.slice(0, 39), 2, VIEW + 2);
    else if (p.phase === "launch" && p.ballNo > 0) text(px, "HOLD DOWN OR A, THEN LET GO", 2, VIEW + 2);
    else {
      text(px, pad(p.score, 9).trim(), 2, VIEW + 2);
      text(px, TIERS[p.tier].slice(0, p.tier ? 5 : 3) + " X" + p.bonusMult + (p.mult2 > 0 ? " 2X" : ""), 56, VIEW + 2, 2);
      const label = "B" + p.ballNo + (p.extraBalls ? "+" + p.extraBalls : "");
      text(px, label, W - 2 - textWidth(label), VIEW + 2);
      if (p.saver > 0 || p.saverLit) text(px, "S", W - 20, VIEW + 2, 2);
    }
  };
  const drawTitle = (px, g) => {
    px.fill(0);
    for (let y = 0; y < H; y += 8) for (let x = (y >> 3) % 2 * 4; x < W; x += 8) put(px, x, y, 1);
    box(px, 12, 6, 148, 58);
    centred(px, "BUMPER", 12, 3, 3); centred(px, "BEASTS", 30, 3, 3);
    line(px, 14, 49, 146, 49, 2);
    const bob = Math.round(Math.sin(g.t / 12) * 2);
    [0, 1, 2].forEach(i => sprite(px, SPRITES[[2, 5, 8][i] + 3 * ((g.t / 120 | 0) % 6)], 22 + i * 44, 62 + ((i + (g.t >> 3)) % 2 ? bob : -bob), 2));
    ["START", "DEX", "HI SCORES"].forEach((n, i) => text(px, (g.cursor === i ? ">" : " ") + n, 52, 100 + i * 9));
    centred(px, "D PAD + A", 138, 2);
  };
  const MINI_K = 0.34, MINI_Y = 13, MINI_X = [12, 92];
  const drawMini = (px, T, ox, oy, k) => {
    const X = x => ox + x * k, Y = y => oy + y * k, L = (a, b, c, d, s) => line(px, X(a), Y(b), X(c), Y(d), s);
    rect(px, Math.round(X(0)), Math.round(Y(0)), Math.round(X(160)), Math.round(Y(T.h)), 0);
    rect(px, Math.round(X(0)), Math.round(Y(0)), Math.round(X(6)), Math.round(Y(T.h)), 3);
    rect(px, Math.round(X(T.plunger ? 155 : 143)), Math.round(Y(0)), Math.round(X(160)), Math.round(Y(T.h)), 3);
    for (const w of T.walls) L(w[0], w[1], w[2], w[3], 3);
    for (const w of T.slings) L(w[0], w[1], w[2], w[3], 2);
    for (const t of T.targets) L(t.seg[0], t.seg[1], t.seg[2], t.seg[3], 2);
    for (const r of T.ramps) {
      const dx = r.exit[0] - r.enter[0], dy = r.exit[1] - r.enter[1], l = Math.hypot(dx, dy);
      for (let t = 0; t < l; t += 7) put(px, X(r.enter[0] + dx * t / l), Y(r.enter[1] + dy * t / l), 2);
    }
    for (const sp of T.spinners) rect(px, Math.round(X(sp[0] - sp[2] / 2)), Math.round(Y(sp[1])), Math.round(X(sp[0] + sp[2] / 2)) + 1, Math.round(Y(sp[1])) + 1, 2);
    for (const q of T.bumpers) { disc(px, Math.round(X(q[0])), Math.round(Y(q[1])), 2, 1); disc(px, Math.round(X(q[0])), Math.round(Y(q[1])), 2, 3, 1); }
    for (const q of T.posts) put(px, X(q[0]), Y(q[1]), 3);
    for (const l of T.lanes) put(px, X(l[0]), Y(l[1]), 2);
    for (const name in T.holes) disc(px, Math.round(X(T.holes[name].x)), Math.round(Y(T.holes[name].y)), 1, 3);
    for (const spec of T.flippers) { const e = flipperEnd({ a: FLIPPER_REST }, spec); L(spec.px, spec.py, e[0], e[1], 3); }
    if (T.plunger) disc(px, Math.round(X(T.plunger[0])), Math.round(Y(T.plunger[1])), 1, 3);
  };
  const drawSelect = (px, g) => {
    px.fill(0); centred(px, "SELECT A BOARD", 3);
    TABLE_IDS.forEach((id, i) => {
      const T = TABLES[id], x = MINI_X[i], on = g.tableCursor === i, w = Math.round(160 * MINI_K), h = Math.round(T.h * MINI_K);
      if (on && (g.t >> 4) % 4 !== 3) { rect(px, x - 3, MINI_Y - 3, x + w + 3, MINI_Y + h + 3, 3); rect(px, x - 2, MINI_Y - 2, x + w + 2, MINI_Y + h + 2, 0); }
      drawMini(px, T, x, MINI_Y, MINI_K);
      const label = "ABCDEFGH"[i] + " " + T.name;
      text(px, label, x + Math.round((w - textWidth(label)) / 2), 126, on ? 3 : 2);
      const floor = "FLOOR " + (3 + i);
      text(px, floor, x + Math.round((w - textWidth(floor)) / 2), 138, on ? 3 : 2);
    });
  };
  const drawPause = (px, g) => {
    box(px, 34, 46, 126, 90); centred(px, "PAUSED", 52, 3, 1);
    PAUSE_ITEMS.forEach((label, i) => text(px, (g.pauseCursor === i ? ">" : " ") + label, 46, 66 + i * 10));
  };
  const drawDex = (px, g) => {
    px.fill(0); rect(px, 0, 0, W, 10, 3); text(px, "BEAST DEX", 4, 3, 0); const s = "SEEN " + countDex(g, 1) + " CAUGHT " + countDex(g, 2); text(px, s, W - 4 - textWidth(s), 3, 0);
    const rows = 7, first = clamp(g.dexCursor - 3, 0, CREATURES.length - rows);
    for (let r = 0; r < rows; r++) {
      const id = first + r, c = CREATURES[id], y = 13 + r * 18, st = g.dex[id], on = id === g.dexCursor;
      if (on) rect(px, 0, y - 1, W, y + 17, 1);
      box(px, 2, y, 20, y + 17);
      if (st === DEX_CAUGHT) sprite(px, SPRITES[id], 3, y + 1); else if (st === DEX_SEEN) silhouette(px, SPRITES[id], 3, y + 1);
      text(px, "#" + String(id + 1).padStart(2, "0"), 24, y + 2, 2);
      text(px, st ? c.name : "-----", 24, y + 9);
      if (st) { text(px, "ST" + c.stage, 100, y + 2, 2); text(px, c.table === "b" ? "ALL" : c.table === "e" ? "EMBER" : "TIDE", 100, y + 9, 2); }
      text(px, st === DEX_CAUGHT ? "CAUGHT" : st === DEX_SEEN ? "SEEN" : "", 124, y + 2);
      if (st === DEX_CAUGHT) disc(px, 150, y + 11, 3, 3);
    }
  };
  const drawScores = (px, g) => {
    px.fill(0); rect(px, 0, 0, W, 10, 3); text(px, "HIGH SCORES", 4, 3, 0);
    TABLE_IDS.forEach((id, k) => {
      text(px, TABLES[id].name, 8, 16 + k * 62, 3);
      g.scores[id].forEach((e, i) => { text(px, (i + 1) + " " + e.name, 14, 28 + k * 62 + i * 9); const v = String(e.score); text(px, v, 148 - textWidth(v), 28 + k * 62 + i * 9, 2); });
    });
  };
  const drawName = (px, g) => {
    px.fill(0); box(px, 10, 20, 150, 120); centred(px, "NEW HIGH SCORE!", 28); centred(px, String(g.entry.score), 40, 2);
    g.entry.letters.forEach((l, i) => { text(px, NAME_LETTERS[l], 60 + i * 14, 66, 3, 2); if (i === g.entry.pos && (g.t >> 3) % 2) rect(px, 60 + i * 14, 80, 68 + i * 14, 82, 3); });
    centred(px, "UP DOWN LETTER  A NEXT", 100, 2);
  };
  const drawOver = (px, g) => {
    drawTable(px, g); box(px, 20, 36, 140, 108);
    centred(px, "GAME OVER", 44, 3, 2); centred(px, "SCORE " + g.p.score, 66);
    centred(px, "SEEN " + countDex(g, 1) + " CAUGHT " + countDex(g, 2), 78, 2);
    centred(px, g.p.catches + " CAUGHT THIS GAME", 90, 2);
  };
  const render = (g, px = new Uint8Array(W * H)) => {
    px.fill(0);
    ({ title: drawTitle, select: drawSelect, dex: drawDex, scores: drawScores, name: drawName, over: drawOver, play: drawTable })[g.scene](px, g);
    if (g.scene === "play" && g.paused) drawPause(px, g);
    return px;
  };

  const run = (freqs, step, wave, vol, dur = step * 1.2) => freqs.map((f, i) => [f, f, dur, wave, vol, i * step]);
  const SFX = {
    flip: [[170, 110, 0.05, "square", 0.16, 0]], bumper: [[620, 260, 0.09, "square", 0.2, 0]], sling: [[320, 700, 0.06, "square", 0.18, 0]],
    spin: [[1100, 1100, 0.015, "square", 0.05, 0]], lane: [[740, 990, 0.07, "triangle", 0.2, 0]], target: [[420, 560, 0.07, "square", 0.18, 0]],
    ramp: [[260, 900, 0.35, "sawtooth", 0.12, 0]], rampdone: run([660, 880], 0.07, "square", 0.14), hole: [[240, 90, 0.25, "triangle", 0.3, 0]],
    release: [[140, 420, 0.12, "square", 0.16, 0]], launch: [[90, 520, 0.4, "sawtooth", 0.16, 0]], drain: [[420, 55, 0.8, "sawtooth", 0.2, 0]],
    saved: run([523, 659, 784, 1047], 0.07, "square", 0.16), kickback: [[200, 800, 0.15, "sawtooth", 0.2, 0]], nudge: [[80, 60, 0.12, "square", 0.2, 0]],
    tilt: run([220, 165, 110, 82], 0.12, "sawtooth", 0.25, 0.2), wild: run([392, 392, 523, 659, 784], 0.09, "square", 0.18), reveal: [[880, 1040, 0.04, "square", 0.12, 0]],
    ready: run([784, 988, 1175], 0.08, "square", 0.18), shake: [[200, 150, 0.12, "triangle", 0.3, 0]], orb: [[500, 700, 0.1, "triangle", 0.25, 0]],
    caught: run([523, 659, 784, 1047, 784, 1047, 1319], 0.1, "square", 0.2), broke: run([400, 300, 200], 0.1, "sawtooth", 0.2), flee: run([500, 400, 300, 200], 0.08, "triangle", 0.2),
    evomode: run([330, 392, 494], 0.1, "square", 0.16), evolving: run([262, 330, 392, 523, 659, 784], 0.14, "triangle", 0.2), evolved: run([523, 659, 784, 1047, 1319, 1568], 0.09, "square", 0.2),
    travel: run([440, 554, 659], 0.09, "triangle", 0.2), travelled: run([659, 784, 988, 1319], 0.08, "square", 0.18), whack: [[300, 120, 0.1, "square", 0.25, 0]],
    bosshit: [[180, 40, 0.3, "sawtooth", 0.3, 0]], bossblock: [[900, 900, 0.05, "square", 0.1, 0]], stagein: run([262, 330, 392, 523], 0.09, "square", 0.2),
    clear: run([523, 659, 784, 1047, 1319, 1047, 1319, 1568], 0.1, "square", 0.22), extra: run([784, 988, 1175, 1568], 0.09, "square", 0.22),
    upgrade: run([587, 740, 880, 1175], 0.07, "square", 0.18), lit: run([880, 1175], 0.08, "triangle", 0.18), tallyline: [[900, 1200, 0.06, "square", 0.14, 0]],
    tally: [[300, 300, 0.05, "square", 0.1, 0]], menu: [[700, 700, 0.03, "square", 0.1, 0]], ok: run([600, 900], 0.05, "square", 0.14),
    start: run([392, 523, 659, 784], 0.08, "square", 0.18), over: run([392, 330, 262, 196], 0.18, "triangle", 0.25), newhi: run([523, 659, 784, 1047, 1319], 0.09, "square", 0.2),
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
  const TRACKS = ["title", "ember", "tide", "catch", "travel", "bonus-mound", "bonus-specter", "bonus-vault"];
  const handheld = {
    id: "pinball", name: TITLE, create: seed => create(seed), step, draw: render,
    audio: { events: drainEvents, music: g => g.music, tracks: TRACKS, sfx },
  };
  return { W, H, VIEW, FRAME, TITLE, CREATURES, SPRITES, LINES, AREAS, TABLES, TABLE_IDS, TIERS, DEX_UNSEEN, DEX_SEEN, DEX_CAUGHT, SFX, TRACKS, GLYPHS,
    create, step, render, startGame, openSelect, drawPause, drainEvents, sfx, handheld, countDex, evoCandidate, startCatch, startBonus, award, buildTally, flipperEnd };
})();
