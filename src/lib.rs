use std::cell::RefCell;

pub const MAX_PLAYERS: usize = 64;
pub const ROOM_HALF: f32 = 14.0;
pub const PLAYER_RADIUS: f32 = 0.35;
pub const EYE_HEIGHT: f32 = 1.5;
pub const RACK_HALF_X: f32 = 0.38;
pub const RACK_HALF_Z: f32 = 0.55;
pub const WALK_SPEED: f32 = 4.2;
pub const CROUCH_SPEED: f32 = 2.0;
pub const PRONE_SPEED: f32 = 0.9;
pub const CROUCH_EYE_HEIGHT: f32 = 0.6;
pub const PRONE_EYE_HEIGHT: f32 = 0.2;
pub const CROUCH_REACH: f32 = 0.77;
pub const PRONE_REACH: f32 = 1.03;
pub const HEAD_RADIUS: f32 = 0.24;
pub const STANCE_EASE: f32 = 7.0;
pub const GRAVITY: f32 = 20.0;
pub const JUMP_SPEED: f32 = 7.75;
pub const INTERP_DELAY_MIN: f32 = 0.09;
pub const INTERP_DELAY_MAX: f32 = 0.30;
const MAX_EXTRAPOLATION: f32 = 0.10;
pub const PREDICT_MAX: f32 = 0.3;
pub const PREDICT_MAX_SPEED: f32 = 8.0;
pub const SNAPSHOTS: usize = 8;
const OFFSET_CREEP: f32 = 0.002;
const JITTER_DECAY: f32 = 0.02;
const GAP: f32 = 0.5;
const MAX_DT: f32 = 0.05;
const PITCH_LIMIT: f32 = std::f32::consts::FRAC_PI_2 - 0.05;
const TAU: f32 = std::f32::consts::PI * 2.0;

pub const POSE_BYTES: usize = 15;
pub const POSES_PER_PLAYER: usize = 3;
pub const POSITION_UNIT: f32 = 0.001;
pub const HEIGHT_UNIT: f32 = 0.005;
pub const ANGLE_UNIT: f32 = std::f32::consts::PI / 32768.0;
pub const MSG_POSE: u8 = 1;
pub const MSG_STATE: u8 = 2;
pub const FLAG_GROUNDED: u8 = 1;
pub const FLAG_SPEAKING: u8 = 2;
pub const FLAG_MOVING: u8 = 4;
pub const FLAG_CROUCH: u8 = 8;
pub const FLAG_PRONE: u8 = 16;
pub const FLAG_HOLDING: u8 = 32;
pub const FLAG_PLAYING: u8 = 64;
pub const WORLD_RACK: u32 = 1;
pub const WORLD_PILLARS: u32 = 2;
pub const MIRROR_CELL: f32 = 1.4;
pub const PILLAR_HALF: f32 = MIRROR_CELL / 2.0;
pub const PILLAR_OFFSETS: [f32; 2] = [-5.0 * MIRROR_CELL - PILLAR_HALF, 5.0 * MIRROR_CELL + PILLAR_HALF];
pub const WELL_Z: f32 = 8.0;
pub const STEP_UP: f32 = 0.3;
pub const GB_HOLD_AHEAD: f32 = 0.45;
pub const GB_HOLD_RADIUS: f32 = 0.12;
pub const SEPARATE_HEIGHT: f32 = 1.5;
pub const FLAG_KO: u8 = 128;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Cell {
    pub x0: f32,
    pub y0: f32,
    pub z0: f32,
    pub x1: f32,
    pub y1: f32,
    pub z1: f32,
}

impl Cell {
    pub const EMPTY: Cell = Cell { x0: 0.0, y0: 0.0, z0: 0.0, x1: 0.0, y1: 0.0, z1: 0.0 };
}

pub const MAX_CELLS: usize = 2 * 10 * 18 + 5 + 24 + 2 + 4 + 2;
pub const TETHER_MAX_STRETCH: f32 = 3.0;
pub const TETHER_PULL_SPEED: f32 = 5.5;
pub const TETHER_HOLD_SPEED: f32 = 0.6;
pub const TETHER_REEL_HOLD_SPEED: f32 = 0.15;
pub const TETHER_CATCH_SPEED: f32 = 30.0;
pub const TETHER_SHARE_WALKING: f32 = 0.1;
pub const TETHER_SHARE_IDLE: f32 = 0.9;
pub const TETHER_SHARE_EVEN: f32 = 0.05;
pub const TETHER_WALK_MEMORY: f32 = 0.5;
pub const ANCHOR_TAU: f32 = 0.08;
pub const ANCHOR_SNAP: f32 = 2.0;

pub fn tether_share(self_moving: bool, partner_moving: bool) -> f32 {
    match (self_moving, partner_moving) {
        (true, false) => TETHER_SHARE_WALKING,
        (false, true) => TETHER_SHARE_IDLE,
        _ => TETHER_SHARE_EVEN,
    }
}

pub fn share_now(share: f32, dt: f32) -> f32 {
    1.0 - (1.0 - share.clamp(0.0, 1.0)).powf((dt * 60.0).clamp(0.0, 30.0))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Stance {
    Stand,
    Crouch,
    Prone,
}

impl Stance {
    pub fn from_u32(v: u32) -> Self {
        match v {
            1 => Stance::Crouch,
            2 => Stance::Prone,
            _ => Stance::Stand,
        }
    }

    pub fn reach(self) -> f32 {
        match self {
            Stance::Stand => 0.0,
            Stance::Crouch => CROUCH_REACH,
            Stance::Prone => PRONE_REACH,
        }
    }

    pub fn height(self) -> f32 {
        match self {
            Stance::Stand => 1.8,
            Stance::Crouch => 1.0,
            Stance::Prone => 0.45,
        }
    }

    pub fn speed(self) -> f32 {
        match self {
            Stance::Stand => WALK_SPEED,
            Stance::Crouch => CROUCH_SPEED,
            Stance::Prone => PRONE_SPEED,
        }
    }
}

pub const SLOT_FLOATS: usize = 9;
const LOCAL_SLOT: usize = 0;
const FIRST_REMOTE_SLOT: usize = 1;
const STATE_FLOATS: usize = SLOT_FLOATS * (MAX_PLAYERS + FIRST_REMOTE_SLOT);
const IO_BYTES: usize = 2 + MAX_PLAYERS * POSES_PER_PLAYER * POSE_BYTES;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Player {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub vx: f32,
    pub vy: f32,
    pub vz: f32,
    pub yaw: f32,
    pub pitch: f32,
    pub grounded: bool,
    pub speaking: bool,
    pub stance: Stance,
    pub reach: f32,
    pub holding: bool,
    pub playing: bool,
    pub ko: bool,
    pub world: u32,
    pub buttons: u8,
    pub walk_hold: f32,
    pub fling: (f32, f32),
}

pub const RACK_TOP: f32 = 2.05;
pub const PILLAR_TOP: f32 = 18.0 * MIRROR_CELL;
pub fn obstacles(world: u32) -> impl Iterator<Item = (f32, f32, f32, f32, f32)> {
    let rack = (world & WORLD_RACK != 0).then_some((0.0, 0.0, RACK_HALF_X, RACK_HALF_Z, RACK_TOP));
    let pillars = (world & WORLD_PILLARS != 0).then(|| {
        PILLAR_OFFSETS.into_iter().flat_map(|u| [(u, -WELL_Z + PILLAR_HALF, PILLAR_HALF, PILLAR_HALF, PILLAR_TOP), (u, WELL_Z - PILLAR_HALF, PILLAR_HALF, PILLAR_HALF, PILLAR_TOP)])
    });
    rack.into_iter().chain(pillars.into_iter().flatten())
}

impl Player {
    pub const fn new() -> Self {
        Self { x: 0.0, y: 0.0, z: 0.0, vx: 0.0, vy: 0.0, vz: 0.0, yaw: 0.0, pitch: 0.0, grounded: true, speaking: false, stance: Stance::Stand, reach: 0.0, holding: false, playing: false, ko: false, world: WORLD_RACK, buttons: 0, walk_hold: 0.0, fling: (0.0, 0.0) }
    }

    pub fn spawn(id: u8) -> Self {
        let ring = (id / 12) as f32;
        let angle = (id % 12) as f32 * TAU / 12.0 + ring * 0.26;
        let radius = 3.0 + ring * 2.0;
        let mut player = Self::new();
        player.x = angle.cos() * radius;
        player.z = angle.sin() * radius;
        player.yaw = wrap_angle(std::f32::consts::FRAC_PI_2 - angle);
        player
    }

    pub fn look(&mut self, dyaw: f32, dpitch: f32) {
        if !dyaw.is_finite() || !dpitch.is_finite() {
            return;
        }
        self.yaw = wrap_angle(self.yaw + dyaw.clamp(-TAU, TAU));
        self.pitch = (self.pitch + dpitch.clamp(-TAU, TAU)).clamp(-PITCH_LIMIT, PITCH_LIMIT);
    }

    pub fn step(&mut self, forward: f32, strafe: f32, jump: bool, dt: f32) {
        self.step_in(forward, strafe, jump, dt, &[]);
    }

    pub fn step_in(&mut self, forward: f32, strafe: f32, jump: bool, dt: f32, cells: &[Cell]) {
        if !forward.is_finite() || !strafe.is_finite() || !dt.is_finite() {
            return;
        }
        let (forward, strafe, jump) = if self.ko { (0.0, 0.0, false) } else { (forward, strafe, jump) };
        let dt = dt.clamp(0.0, MAX_DT);
        let forward = forward.clamp(-1.0, 1.0);
        let strafe = strafe.clamp(-1.0, 1.0);
        let length = (forward * forward + strafe * strafe).sqrt().max(1.0);
        let (sin, cos) = self.yaw.sin_cos();
        let dir_x = (-sin * forward + cos * strafe) / length;
        let dir_z = (-cos * forward - sin * strafe) / length;
        let speed = self.stance.speed();
        if self.grounded && self.vy <= 0.0 {
            self.fling = (0.0, 0.0);
        }
        self.vx = dir_x * speed + self.fling.0;
        self.vz = dir_z * speed + self.fling.1;
        self.walk_hold = if self.walking() { TETHER_WALK_MEMORY } else { (self.walk_hold - dt).max(0.0) };
        if jump && self.grounded && self.stance != Stance::Stand {
            self.stance = Stance::Stand;
        } else if jump && self.grounded {
            self.vy = JUMP_SPEED;
            self.grounded = false;
        }
        self.vy -= GRAVITY * dt;
        self.x = (self.x + self.vx * dt).clamp(-ROOM_HALF + PLAYER_RADIUS, ROOM_HALF - PLAYER_RADIUS);
        self.z = (self.z + self.vz * dt).clamp(-ROOM_HALF + PLAYER_RADIUS, ROOM_HALF - PLAYER_RADIUS);
        self.push_out_of_rack();
        self.reach += (self.stance.reach() - self.reach) * (dt * STANCE_EASE).min(1.0);
        self.keep_head_clear();
        let height = self.stance.height();
        let r = PLAYER_RADIUS;
        let over = |c: &Cell, x: f32, z: f32| x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r;
        for c in cells {
            if !over(c, self.x, self.z) || self.y >= c.y1 - 1e-4 || self.y + height <= c.y0 {
                continue;
            }
            if c.y1 - self.y <= STEP_UP && self.vy <= 0.0 {
                self.y = c.y1;
                self.vy = 0.0;
                continue;
            }
            let pushes = [(self.x - (c.x0 - r), 0), ((c.x1 + r) - self.x, 1), (self.z - (c.z0 - r), 2), ((c.z1 + r) - self.z, 3)];
            let (_, side) = pushes.into_iter().fold((f32::INFINITY, 0), |best, p| if p.0 < best.0 { p } else { best });
            match side {
                0 => self.x = c.x0 - r,
                1 => self.x = c.x1 + r,
                2 => self.z = c.z0 - r,
                _ => self.z = c.z1 + r,
            }
        }
        let body = ROOM_HALF - PLAYER_RADIUS;
        self.x = self.x.clamp(-body, body);
        self.z = self.z.clamp(-body, body);
        let before = self.y;
        self.y += self.vy * dt;
        let mut floor: f32 = 0.0;
        for c in cells {
            if !over(c, self.x, self.z) {
                continue;
            }
            if c.y1 <= before + 1e-3 {
                floor = floor.max(c.y1);
            } else if self.vy > 0.0 && before + height <= c.y0 + 1e-3 && self.y + height > c.y0 {
                self.y = c.y0 - height;
                self.vy = 0.0;
            }
        }
        if self.y <= floor {
            self.y = floor;
            self.vy = 0.0;
            self.grounded = true;
        } else {
            self.grounded = false;
        }
    }

    fn push_out_of_rack(&mut self) {
        for (cx, cz, half_x, half_z, top) in obstacles(self.world) {
            if self.y >= top - 1e-3 {
                continue;
            }
            let (hx, hz) = (half_x + PLAYER_RADIUS, half_z + PLAYER_RADIUS);
            let (lx, lz) = (self.x - cx, self.z - cz);
            let (dx, dz) = (hx - lx.abs(), hz - lz.abs());
            if dx > 0.0 && dz > 0.0 {
                if dx < dz {
                    self.x = cx + hx.copysign(lx);
                } else {
                    self.z = cz + hz.copysign(lz);
                }
            }
        }
    }

    fn keep_head_clear(&mut self) {
        if self.reach <= 0.0 {
            return;
        }
        let (sin, cos) = self.yaw.sin_cos();
        let (hx, hz) = (self.x - sin * self.reach, self.z - cos * self.reach);
        let limit = ROOM_HALF - HEAD_RADIUS;
        self.x += hx.clamp(-limit, limit) - hx;
        self.z += hz.clamp(-limit, limit) - hz;
        for (cx, cz, half_x, half_z, top) in obstacles(self.world) {
            if self.y >= top - 1e-3 {
                continue;
            }
            let (hx, hz) = (self.x - sin * self.reach - cx, self.z - cos * self.reach - cz);
            let (rx, rz) = (half_x + HEAD_RADIUS, half_z + HEAD_RADIUS);
            let (dx, dz) = (rx - hx.abs(), rz - hz.abs());
            if dx > 0.0 && dz > 0.0 {
                if dx < dz {
                    self.x += rx.copysign(hx) - hx;
                } else {
                    self.z += rz.copysign(hz) - hz;
                }
            }
        }
        let body = ROOM_HALF - PLAYER_RADIUS;
        self.x = self.x.clamp(-body, body);
        self.z = self.z.clamp(-body, body);
        self.push_out_of_rack();
    }

    pub fn planted(&self) -> bool {
        self.holding && self.playing
    }

    pub fn moving(&self) -> bool {
        self.vx * self.vx + self.vz * self.vz > 0.01
    }

    pub fn walking(&self) -> bool {
        let (wx, wz) = (self.vx - self.fling.0, self.vz - self.fling.1);
        wx * wx + wz * wz > 0.01
    }

    pub fn flags(&self) -> u8 {
        (if self.grounded { FLAG_GROUNDED } else { 0 })
            | (if self.speaking { FLAG_SPEAKING } else { 0 })
            | (if self.moving() { FLAG_MOVING } else { 0 })
            | match self.stance {
                Stance::Stand => 0,
                Stance::Crouch => FLAG_CROUCH,
                Stance::Prone => FLAG_PRONE,
            }
            | (if self.holding { FLAG_HOLDING } else { 0 })
            | (if self.holding && self.playing { FLAG_PLAYING } else { 0 })
            | (if self.ko { FLAG_KO } else { 0 })
    }

    pub fn tether(&mut self, ax: f32, ay: f32, az: f32, length: f32, dt: f32, partner_moving: bool, hauling: bool, partner_hauling: bool) -> [f32; 3] {
        if ![ax, ay, az, length, dt].iter().all(|v| v.is_finite()) || length <= 0.0 {
            return [0.0; 3];
        }
        let (dx, dy, dz) = (self.x - ax, self.y - ay, self.z - az);
        let distance = (dx * dx + dy * dy + dz * dz).sqrt();
        if distance <= length {
            return [0.0; 3];
        }
        let over = distance - length;
        let dt = dt.clamp(0.0, 0.5);
        let walking = self.walking() || self.walk_hold > 0.0;
        let (mine, theirs) = if hauling != partner_hauling { (hauling, partner_hauling) } else { (walking, partner_moving) };
        let caught = !self.grounded && !mine;
        let share = if caught { 1.0 } else { share_now(tether_share(mine, theirs), dt) };
        let speed = if caught { TETHER_CATCH_SPEED } else if mine && !theirs { if hauling { TETHER_REEL_HOLD_SPEED } else { TETHER_HOLD_SPEED } } else { TETHER_PULL_SPEED };
        let pull = (over * share).min(speed * dt).max(over - TETHER_MAX_STRETCH).min(over);
        let k = pull / distance;
        let before = (self.x, self.y, self.z);
        self.x -= dx * k;
        self.z -= dz * k;
        if !self.grounded || dy < 0.0 {
            self.y = (self.y - dy * k).max(0.0);
            if caught {
                let (ux, uy, uz) = (dx / distance, dy / distance, dz / distance);
                let away = self.fling.0 * ux + self.vy * uy + self.fling.1 * uz;
                if away > 0.0 {
                    self.fling = (self.fling.0 - away * ux, self.fling.1 - away * uz);
                    self.vy -= away * uy;
                }
            } else if self.vy * dy > 0.0 {
                self.vy = 0.0;
            }
        }
        let body = ROOM_HALF - PLAYER_RADIUS;
        self.x = self.x.clamp(-body, body);
        self.z = self.z.clamp(-body, body);
        self.push_out_of_rack();
        [self.x - before.0, self.y - before.1, self.z - before.2]
    }

    fn circles(x: f32, z: f32, yaw: f32, holding_low: bool) -> ([(f32, f32, f32); 2], usize) {
        let mut out = [(x, z, PLAYER_RADIUS), (0.0, 0.0, 0.0)];
        if !holding_low {
            return (out, 1);
        }
        let (sin, cos) = yaw.sin_cos();
        out[1] = (x - sin * GB_HOLD_AHEAD, z - cos * GB_HOLD_AHEAD, GB_HOLD_RADIUS);
        (out, 2)
    }

    pub fn separate<'a>(&mut self, others: impl Iterator<Item = &'a Snapshot>) {
        let mine_low = self.holding && !self.playing;
        for o in others {
            if o.flags & FLAG_KO != 0 || (o.y - self.y).abs() > SEPARATE_HEIGHT {
                continue;
            }
            let (theirs, m) = Self::circles(o.x, o.z, o.yaw, o.flags & FLAG_HOLDING != 0 && o.flags & FLAG_PLAYING == 0);
            let (mine, n) = Self::circles(self.x, self.z, self.yaw, mine_low);
            for (tx, tz, tr) in &theirs[..m] {
                for (mx, mz, mr) in &mine[..n] {
                    let (dx, dz) = (mx - tx, mz - tz);
                    let d = (dx * dx + dz * dz).sqrt();
                    let want = tr + mr;
                    if d >= want {
                        continue;
                    }
                    let (ux, uz) = if d > 1e-4 { (dx / d, dz / d) } else { (1.0, 0.0) };
                    self.x += ux * (want - d);
                    self.z += uz * (want - d);
                }
            }
        }
        let body = ROOM_HALF - PLAYER_RADIUS;
        self.x = self.x.clamp(-body, body);
        self.z = self.z.clamp(-body, body);
        self.push_out_of_rack();
    }

    pub fn toggle(&mut self, wanted: Stance) {
        if !self.grounded {
            return;
        }
        self.stance = if self.stance == wanted { Stance::Stand } else { wanted };
    }
}

fn wrap_angle(a: f32) -> f32 {
    let mut a = a % TAU;
    if a >= std::f32::consts::PI {
        a -= TAU;
    } else if a < -std::f32::consts::PI {
        a += TAU;
    }
    a
}

fn lerp_angle(a: f32, b: f32, t: f32) -> f32 {
    wrap_angle(a + wrap_angle(b - a) * t)
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Snapshot {
    pub t: f32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub yaw: f32,
    pub pitch: f32,
    pub flags: u8,
    pub buttons: u8,
}

impl Snapshot {
    pub const ZERO: Snapshot = Snapshot { t: 0.0, x: 0.0, y: 0.0, z: 0.0, yaw: 0.0, pitch: 0.0, flags: 0, buttons: 0 };
}

#[derive(Clone, Copy, Debug)]
pub struct Remote {
    pub active: bool,
    pub older: Snapshot,
    pub newer: Snapshot,
    pub shown: Snapshot,
    buf: [Snapshot; SNAPSHOTS],
    len: usize,
    stamp: u32,
    offset: f32,
    pub jitter: f32,
    pub interval: f32,
    pub delay: f32,
    last_arrival: f32,
    last_now: f32,
    est: [f32; 3],
    est_v: [f32; 3],
    est_t: f32,
    est_ok: bool,
    walked_t: f32,
}

impl Default for Remote {
    fn default() -> Self {
        Self::EMPTY
    }
}

impl Remote {
    pub const EMPTY: Remote = Remote {
        active: false,
        older: Snapshot::ZERO,
        newer: Snapshot::ZERO,
        shown: Snapshot::ZERO,
        buf: [Snapshot::ZERO; SNAPSHOTS],
        len: 0,
        stamp: 0,
        offset: 0.0,
        jitter: 0.0,
        interval: 0.05,
        delay: INTERP_DELAY_MIN,
        last_arrival: 0.0,
        last_now: 0.0,
        est: [0.0; 3],
        est_v: [0.0; 3],
        est_t: 0.0,
        est_ok: false,
        walked_t: f32::NEG_INFINITY,
    };

    fn unwrap(&self, sent: u16) -> i32 {
        (((sent as i32 - (self.stamp & 0xffff) as i32) + 32768) & 0xffff) - 32768
    }

    pub fn push(&mut self, mut snap: Snapshot, sent: u16, arrival: f32) {
        if !self.active {
            *self = Self::EMPTY;
            self.active = true;
            self.stamp = sent as u32;
            self.offset = arrival - self.stamp as f32 / 1000.0;
            self.last_arrival = arrival;
            snap.t = arrival;
            if snap.flags & FLAG_MOVING != 0 {
                self.walked_t = arrival;
            }
            self.buf[0] = snap;
            self.len = 1;
            self.older = snap;
            self.newer = snap;
            return;
        }
        let step = self.unwrap(sent);
        if step <= 0 {
            return;
        }
        let previous = self.stamp as f32 / 1000.0;
        self.stamp = self.stamp.wrapping_add(step as u32);
        let sender = self.stamp as f32 / 1000.0;
        let elapsed = (arrival - self.last_arrival).max(0.0);
        self.last_arrival = arrival;
        let seen = arrival - sender;
        self.offset = (self.offset + OFFSET_CREEP * elapsed).min(seen);
        let late = (seen - self.offset).max(0.0);
        self.jitter = (self.jitter - JITTER_DECAY * elapsed).max(late).max(0.0);
        let gap = sender - previous;
        if gap < GAP {
            self.interval = (self.interval * 0.8 + gap * 0.2).clamp(0.03, 0.2);
        }
        snap.t = sender + self.offset;
        if snap.flags & FLAG_MOVING != 0 {
            self.walked_t = snap.t;
        }
        if self.len == SNAPSHOTS {
            self.buf.copy_within(1.., 0);
            self.len -= 1;
        }
        self.buf[self.len] = snap;
        self.len += 1;
        self.older = if self.len >= 2 { self.buf[self.len - 2] } else { snap };
        self.newer = snap;
    }

    pub fn target_delay(&self) -> f32 {
        (2.0 * self.interval + self.jitter + 0.016).clamp(INTERP_DELAY_MIN, INTERP_DELAY_MAX)
    }

    pub fn walking(&self, now: f32) -> bool {
        self.newer.flags & FLAG_MOVING != 0 || now - self.walked_t < TETHER_WALK_MEMORY
    }

    pub fn predicted(&self, now: f32) -> ([f32; 3], [f32; 3]) {
        let (last, prev) = (self.newer, self.older);
        let span = last.t - prev.t;
        let mut v = [0.0; 3];
        if span > 0.0 && span < GAP && last.flags & FLAG_MOVING != 0 {
            v = [(last.x - prev.x) / span, (last.y - prev.y) / span, (last.z - prev.z) / span];
            if (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt() > PREDICT_MAX_SPEED {
                v = [0.0; 3];
            }
        }
        let ahead = if now.is_finite() { (now - last.t).clamp(0.0, PREDICT_MAX) } else { 0.0 };
        let at = [(last.x + v[0] * ahead).clamp(-ROOM_HALF, ROOM_HALF), (last.y + v[1] * ahead).max(0.0), (last.z + v[2] * ahead).clamp(-ROOM_HALF, ROOM_HALF)];
        (at, v)
    }

    pub fn anchor(&mut self, now: f32) -> [f32; 3] {
        let (target, v) = self.predicted(now);
        let dt = if self.est_ok && now.is_finite() { (now - self.est_t).clamp(0.0, 0.25) } else { 0.0 };
        let off = (0..3).map(|k| (self.est[k] - target[k]).powi(2)).sum::<f32>().sqrt();
        if !self.est_ok || off > ANCHOR_SNAP || !now.is_finite() {
            self.est = target;
            self.est_v = v;
        } else {
            let blend = 1.0 - (-dt / ANCHOR_TAU).exp();
            for k in 0..3 {
                self.est[k] += self.est_v[k] * dt;
                self.est[k] += (target[k] - self.est[k]) * blend;
                self.est_v[k] += (v[k] - self.est_v[k]) * blend;
            }
            self.est[0] = self.est[0].clamp(-ROOM_HALF, ROOM_HALF);
            self.est[1] = self.est[1].max(0.0);
            self.est[2] = self.est[2].clamp(-ROOM_HALF, ROOM_HALF);
        }
        self.est_t = if now.is_finite() { now } else { self.est_t };
        self.est_ok = true;
        self.est
    }

    pub fn sample(&mut self, now: f32) -> Snapshot {
        let dt = if self.last_now > 0.0 { (now - self.last_now).clamp(0.0, 0.25) } else { 0.0 };
        self.last_now = now;
        let want = self.target_delay();
        self.delay += (want - self.delay).clamp(-0.1 * dt, 0.1 * dt);
        let render = now - self.delay;
        let buf = &self.buf[..self.len];
        let last = buf[self.len - 1];
        let mut out = last;
        if render >= last.t {
            if self.len >= 2 {
                let prev = buf[self.len - 2];
                let span = last.t - prev.t;
                if span > 0.0 && span < GAP {
                    let ahead = (render - last.t).min(MAX_EXTRAPOLATION) / span;
                    out.x = (last.x + (last.x - prev.x) * ahead).clamp(-ROOM_HALF, ROOM_HALF);
                    out.z = (last.z + (last.z - prev.z) * ahead).clamp(-ROOM_HALF, ROOM_HALF);
                    out.y = (last.y + (last.y - prev.y) * ahead).max(0.0);
                }
            }
        } else if render <= buf[0].t {
            out = buf[0];
        } else {
            let i = (1..self.len).find(|&i| render < buf[i].t).unwrap_or(self.len - 1);
            let (a, b) = (buf[i - 1], buf[i]);
            let mut from_t = a.t;
            if b.t - a.t > GAP {
                from_t = b.t - self.interval;
                if render <= from_t {
                    out = a;
                    out.t = render;
                    return out;
                }
            }
            let t = ((render - from_t) / (b.t - from_t)).clamp(0.0, 1.0);
            out = b;
            out.x = a.x + (b.x - a.x) * t;
            out.y = a.y + (b.y - a.y) * t;
            out.z = a.z + (b.z - a.z) * t;
            out.yaw = lerp_angle(a.yaw, b.yaw, t);
            out.pitch = a.pitch + (b.pitch - a.pitch) * t;
            if t < 0.5 {
                out.flags = a.flags;
                out.buttons = a.buttons;
            }
        }
        out.t = render;
        out
    }
}

pub struct Game {
    pub id: u8,
    pub solid: [bool; MAX_PLAYERS],
    pub local: Player,
    pub cells: [Cell; MAX_CELLS + MAX_RIDERS],
    pub riders: [Cell; MAX_RIDERS],
    pub rider_count: usize,
    pub cell_count: usize,
    pub remotes: [Remote; MAX_PLAYERS],
    pub state: [f32; STATE_FLOATS],
    pub io: [u8; IO_BYTES],
    pub clock: f32,
}

impl Game {
    pub const fn new() -> Self {
        Self { id: 0, solid: [true; MAX_PLAYERS], local: Player::new(), cells: [Cell::EMPTY; MAX_CELLS + MAX_RIDERS], riders: [Cell::EMPTY; MAX_RIDERS], rider_count: 0, cell_count: 0, remotes: [Remote::EMPTY; MAX_PLAYERS], state: [0.0; STATE_FLOATS], io: [0; IO_BYTES], clock: 0.0 }
    }

    pub fn join(&mut self, id: u8) {
        self.id = id;
        self.local = Player::spawn(id);
        self.remotes = [Remote::default(); MAX_PLAYERS];
    }

    pub fn pack_pose(&mut self) -> usize {
        let p = &self.local;
        let snap = Snapshot { t: 0.0, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, flags: p.flags(), buttons: p.buttons };
        self.io[0] = MSG_POSE;
        write_pose(&mut self.io[1..1 + POSE_BYTES], self.id, (self.clock * 1000.0) as u32 as u16, &snap);
        1 + POSE_BYTES
    }

    pub fn apply_state(&mut self, len: usize, now: f32) -> i32 {
        if len < 2 || len > IO_BYTES || self.io[0] != MSG_STATE || !now.is_finite() {
            return -1;
        }
        let count = self.io[1] as usize;
        if len != 2 + count * POSE_BYTES || count > MAX_PLAYERS * POSES_PER_PLAYER {
            return -1;
        }
        let mut accepted = 0;
        for n in 0..count {
            let start = 2 + n * POSE_BYTES;
            let (id, sent, mut snap) = read_pose(&self.io[start..start + POSE_BYTES]);
            if id as usize >= MAX_PLAYERS || id == self.id {
                continue;
            }
            snap.x = snap.x.clamp(-ROOM_HALF, ROOM_HALF);
            snap.z = snap.z.clamp(-ROOM_HALF, ROOM_HALF);
            snap.y = snap.y.clamp(0.0, 160.0);
            self.remotes[id as usize].push(snap, sent, now);
            accepted += 1;
        }
        accepted
    }

    pub fn remove(&mut self, id: u8) {
        if (id as usize) < MAX_PLAYERS {
            self.remotes[id as usize] = Remote::default();
        }
    }

    pub fn publish(&mut self, now: f32) -> u32 {
        self.clock = now;
        let p = self.local;
        let base = LOCAL_SLOT * SLOT_FLOATS;
        self.state[base..base + SLOT_FLOATS].copy_from_slice(&[1.0, p.x, p.y, p.z, p.yaw, p.pitch, p.flags() as f32, (p.vx * p.vx + p.vz * p.vz).sqrt(), p.buttons as f32]);
        let mut active = 0;
        for (id, remote) in self.remotes.iter_mut().enumerate() {
            let base = (FIRST_REMOTE_SLOT + id) * SLOT_FLOATS;
            if !remote.active {
                self.state[base] = 0.0;
                continue;
            }
            active += 1;
            let s = remote.sample(now);
            remote.shown = s;
            let span = (remote.newer.t - remote.older.t).max(0.001);
            let speed = if remote.newer.flags & FLAG_MOVING != 0 {
                let dx = remote.newer.x - remote.older.x;
                let dz = remote.newer.z - remote.older.z;
                ((dx * dx + dz * dz).sqrt() / span).min(WALK_SPEED)
            } else {
                0.0
            };
            self.state[base..base + SLOT_FLOATS].copy_from_slice(&[1.0, s.x, s.y, s.z, s.yaw, s.pitch, s.flags as f32, speed, s.buttons as f32]);
        }
        active
    }
}

fn quantise(v: f32, unit: f32) -> i16 {
    (v / unit).round() as i16
}

fn write_pose(out: &mut [u8], id: u8, sent: u16, s: &Snapshot) {
    out[0] = id;
    out[1..3].copy_from_slice(&sent.to_le_bytes());
    let yaw = (wrap_angle(s.yaw) / ANGLE_UNIT).round() as i32 as i16;
    let values = [quantise(s.x, POSITION_UNIT), quantise(s.y, HEIGHT_UNIT), quantise(s.z, POSITION_UNIT), yaw, quantise(s.pitch, ANGLE_UNIT)];
    for (n, v) in values.iter().enumerate() {
        out[3 + n * 2..5 + n * 2].copy_from_slice(&v.to_le_bytes());
    }
    out[13] = s.flags;
    out[14] = s.buttons;
}

fn read_pose(bytes: &[u8]) -> (u8, u16, Snapshot) {
    let f = |n: usize| i16::from_le_bytes([bytes[3 + n * 2], bytes[4 + n * 2]]) as f32;
    let (x, y, z) = (f(0) * POSITION_UNIT, f(1) * HEIGHT_UNIT, f(2) * POSITION_UNIT);
    (bytes[0], u16::from_le_bytes([bytes[1], bytes[2]]), Snapshot { t: 0.0, x, y, z, yaw: f(3) * ANGLE_UNIT, pitch: f(4) * ANGLE_UNIT, flags: bytes[13], buttons: bytes[14] })
}

thread_local! { static GAME: RefCell<Game> = const { RefCell::new(Game::new()) }; }

#[no_mangle]
pub extern "C" fn game_join(id: u32) {
    GAME.with(|g| g.borrow_mut().join((id as usize).min(MAX_PLAYERS - 1) as u8));
}
#[no_mangle]
pub extern "C" fn game_look(dyaw: f32, dpitch: f32) {
    GAME.with(|g| g.borrow_mut().local.look(dyaw, dpitch));
}
#[no_mangle]
pub extern "C" fn game_step(forward: f32, strafe: f32, jump: u32, dt: f32) {
    GAME.with(|g| {
        let mut g = g.borrow_mut();
        let Game { local, cells, cell_count, remotes, solid, riders, rider_count, .. } = &mut *g;
        let n = (*cell_count).min(MAX_CELLS);
        for (i, rider) in riders[..*rider_count].iter().enumerate() {
            cells[n + i] = *rider;
        }
        local.step_in(forward, strafe, jump != 0, dt, &cells[..n + *rider_count]);
        local.separate(remotes.iter().zip(solid.iter()).filter(|(r, s)| r.active && r.shown.t > 0.0 && **s).map(|(r, _)| &r.shown));
    });
}
pub const MAX_RIDERS: usize = 2 + 2 + 2 * 12 + 4 * 4;
#[no_mangle]
pub extern "C" fn game_riders_clear() {
    GAME.with(|g| g.borrow_mut().rider_count = 0);
}
#[no_mangle]
pub extern "C" fn game_rider(x0: f32, y0: f32, z0: f32, x1: f32, y1: f32, z1: f32) {
    if [x0, y0, z0, x1, y1, z1].iter().all(|v| v.is_finite()) {
        GAME.with(|g| {
            let mut g = g.borrow_mut();
            let n = g.rider_count;
            if n < MAX_RIDERS {
                g.riders[n] = Cell { x0, y0, z0, x1, y1, z1 };
                g.rider_count = n + 1;
            }
        });
    }
}
#[no_mangle]
pub extern "C" fn game_carry(dx: f32, dy: f32, dz: f32) {
    if [dx, dy, dz].iter().all(|v| v.is_finite() && v.abs() < 60.0) {
        GAME.with(|g| {
            let mut g = g.borrow_mut();
            let body = ROOM_HALF - PLAYER_RADIUS;
            let p = &mut g.local;
            p.x = (p.x + dx).clamp(-body, body);
            p.y = (p.y + dy).max(0.0);
            p.z = (p.z + dz).clamp(-body, body);
        });
    }
}
#[no_mangle]
pub extern "C" fn game_launch(vx: f32, vy: f32, vz: f32) {
    if [vx, vy, vz].iter().all(|v| v.is_finite() && v.abs() <= 40.0) {
        GAME.with(|g| {
            let mut g = g.borrow_mut();
            let p = &mut g.local;
            p.vy = vy;
            p.fling = (vx, vz);
            p.grounded = false;
        });
    }
}
#[no_mangle]
pub extern "C" fn game_glue(x: f32, y: f32, z: f32) {
    if [x, y, z].iter().all(|v| v.is_finite()) {
        GAME.with(|g| {
            let mut g = g.borrow_mut();
            let body = ROOM_HALF - PLAYER_RADIUS;
            let p = &mut g.local;
            (p.x, p.y, p.z) = (x.clamp(-body, body), y.max(0.0), z.clamp(-body, body));
            p.vy = 0.0;
            p.grounded = true;
            p.fling = (0.0, 0.0);
        });
    }
}
#[no_mangle]
pub extern "C" fn game_solid_at(x: f32, y: f32, z: f32, skip: u32) -> u32 {
    GAME.with(|g| {
        let g = g.borrow();
        let inside = |c: &Cell| x > c.x0 && x < c.x1 && y > c.y0 && y < c.y1 && z > c.z0 && z < c.z1;
        let skip = (skip as usize).min(g.rider_count);
        (g.cells[..g.cell_count.min(MAX_CELLS)].iter().chain(g.riders[skip..g.rider_count].iter()).any(inside)) as u32
    })
}
#[no_mangle]
pub extern "C" fn cells_clear() {
    GAME.with(|g| g.borrow_mut().cell_count = 0);
}
#[no_mangle]
pub extern "C" fn cells_push(x0: f32, y0: f32, z0: f32, x1: f32, y1: f32, z1: f32) {
    if [x0, y0, z0, x1, y1, z1].iter().all(|v| v.is_finite()) {
        GAME.with(|g| {
            let mut g = g.borrow_mut();
            let n = g.cell_count;
            if n < MAX_CELLS {
                g.cells[n] = Cell { x0, y0, z0, x1, y1, z1 };
                g.cell_count = n + 1;
            }
        });
    }
}
#[no_mangle]
pub extern "C" fn game_set_ko(ko: u32) {
    GAME.with(|g| g.borrow_mut().local.ko = ko != 0);
}
#[no_mangle]
pub extern "C" fn game_place(x: f32, y: f32, z: f32) {
    if [x, y, z].iter().all(|v| v.is_finite()) {
        GAME.with(|g| {
            let mut g = g.borrow_mut();
            let p = &mut g.local;
            let body = ROOM_HALF - PLAYER_RADIUS;
            (p.x, p.y, p.z) = (x.clamp(-body, body), y.max(0.0), z.clamp(-body, body));
            (p.vx, p.vy, p.vz) = (0.0, 0.0, 0.0);
            p.fling = (0.0, 0.0);
            p.grounded = p.y == 0.0;
        });
    }
}
#[no_mangle]
pub extern "C" fn game_set_speaking(speaking: u32) {
    GAME.with(|g| g.borrow_mut().local.speaking = speaking != 0);
}
#[no_mangle]
pub extern "C" fn game_toggle_stance(wanted: u32) -> u32 {
    GAME.with(|g| {
        let mut g = g.borrow_mut();
        g.local.toggle(Stance::from_u32(wanted));
        g.local.stance as u32
    })
}
#[no_mangle]
pub extern "C" fn game_set_buttons(buttons: u32) {
    GAME.with(|g| g.borrow_mut().local.buttons = (buttons & 0xff) as u8);
}
#[no_mangle]
pub extern "C" fn game_set_solid(id: u32, solid: u32) {
    if (id as usize) < MAX_PLAYERS {
        GAME.with(|g| g.borrow_mut().solid[id as usize] = solid != 0);
    }
}
#[no_mangle]
pub extern "C" fn game_set_holding(holding: u32, playing: u32) {
    GAME.with(|g| {
        let mut g = g.borrow_mut();
        g.local.holding = holding != 0;
        g.local.playing = playing != 0;
    });
}
#[no_mangle]
pub extern "C" fn game_tether(x: f32, y: f32, z: f32, length: f32, dt: f32, partner_moving: u32, hauling: u32, partner_hauling: u32) -> u32 {
    GAME.with(|g| {
        let pull = g.borrow_mut().local.tether(x, y, z, length, dt, partner_moving != 0, hauling != 0, partner_hauling != 0);
        (pull.iter().any(|v| *v != 0.0)) as u32
    })
}
#[no_mangle]
pub extern "C" fn net_anchor(id: u32, axis: u32, now: f32) -> f32 {
    GAME.with(|g| {
        let mut g = g.borrow_mut();
        let Some(r) = g.remotes.get_mut(id as usize).filter(|r| r.active) else { return f32::NAN };
        let at = if (now - r.est_t).abs() < 1e-6 && r.est_ok { r.est } else { r.anchor(now) };
        at[(axis as usize).min(2)]
    })
}
#[no_mangle]
pub extern "C" fn net_walking(id: u32, now: f32) -> u32 {
    GAME.with(|g| g.borrow().remotes.get(id as usize).filter(|r| r.active).map_or(false, |r| r.walking(now)) as u32)
}
#[no_mangle]
pub extern "C" fn net_flags(id: u32) -> u32 {
    GAME.with(|g| g.borrow().remotes.get(id as usize).filter(|r| r.active).map_or(0, |r| r.newer.flags as u32))
}
#[no_mangle]
pub extern "C" fn game_set_world(world: u32) {
    GAME.with(|g| g.borrow_mut().local.world = world & (WORLD_RACK | WORLD_PILLARS));
}
#[no_mangle]
pub extern "C" fn net_predicted(id: u32, axis: u32, now: f32) -> f32 {
    GAME.with(|g| {
        let g = g.borrow();
        let Some(r) = g.remotes.get(id as usize).filter(|r| r.active) else { return f32::NAN };
        r.predicted(now).0[(axis as usize).min(2)]
    })
}
#[no_mangle]
pub extern "C" fn net_latest(id: u32, axis: u32) -> f32 {
    GAME.with(|g| {
        let g = g.borrow();
        let r = g.remotes.get(id as usize).filter(|r| r.active);
        r.map_or(f32::NAN, |r| match axis {
            0 => r.newer.x,
            1 => r.newer.y,
            _ => r.newer.z,
        })
    })
}
#[no_mangle]
pub extern "C" fn game_stance() -> u32 {
    GAME.with(|g| g.borrow().local.stance as u32)
}
#[no_mangle]
pub extern "C" fn game_publish(now: f32) -> u32 {
    GAME.with(|g| g.borrow_mut().publish(now))
}
#[no_mangle]
pub extern "C" fn net_pack_pose() -> u32 {
    GAME.with(|g| g.borrow_mut().pack_pose() as u32)
}
#[no_mangle]
pub extern "C" fn net_apply_state(len: u32, now: f32) -> i32 {
    GAME.with(|g| g.borrow_mut().apply_state(len as usize, now))
}
#[no_mangle]
pub extern "C" fn net_remove(id: u32) {
    GAME.with(|g| g.borrow_mut().remove(id.min(255) as u8));
}
#[no_mangle]
pub extern "C" fn state_ptr() -> *const f32 {
    GAME.with(|g| g.borrow().state.as_ptr())
}
#[no_mangle]
pub extern "C" fn state_len() -> u32 {
    STATE_FLOATS as u32
}
#[no_mangle]
pub extern "C" fn io_ptr() -> *mut u8 {
    GAME.with(|g| g.borrow_mut().io.as_mut_ptr())
}
#[no_mangle]
pub extern "C" fn io_len() -> u32 {
    IO_BYTES as u32
}
#[no_mangle]
pub extern "C" fn room_half() -> f32 {
    ROOM_HALF
}
#[no_mangle]
pub extern "C" fn well_z() -> f32 {
    WELL_Z
}
#[no_mangle]
pub extern "C" fn eye_height() -> f32 {
    EYE_HEIGHT
}
#[no_mangle]
pub extern "C" fn rack_half_x() -> f32 {
    RACK_HALF_X
}
#[no_mangle]
pub extern "C" fn rack_half_z() -> f32 {
    RACK_HALF_Z
}
#[no_mangle]
pub extern "C" fn max_players() -> u32 {
    MAX_PLAYERS as u32
}
