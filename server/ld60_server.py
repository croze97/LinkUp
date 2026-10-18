#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import hmac
import json
import logging
import math
import os
import re
import struct
import sys
import time
import urllib.parse

LOG = logging.getLogger("ld60")
WS_GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
SOCKET_PATH = "/socket"
MSG_POSE = 1
MSG_STATE = 2
POSE_BYTES = 15
POSE_STRUCT = struct.Struct("<BH5hBB")
POSES_PER_PLAYER = 3
PREVIOUS_POSE_BYTES = 14
UNSTAMPED_POSE_BYTES = 12
UNSTAMPED_STRUCT = struct.Struct("<B5hB")
MM = 0.001
Y_UNIT = 0.005
POSE_LIMIT_XZ = 15000
POSE_FLOOR_Y = -200
POSE_LIMIT_PITCH = 16384

def server_stamp() -> int:
    return int(time.monotonic() * 1000) & 0xFFFF

def to_unstamped(pose: bytes) -> bytes:
    i, _, x, y, z, yaw, pitch, flags, _ = POSE_STRUCT.unpack(pose)
    return UNSTAMPED_STRUCT.pack(i, x, y, z, yaw, pitch, flags)

def from_unstamped(pose: bytes) -> bytes:
    i, x, y, z, yaw, pitch, flags = UNSTAMPED_STRUCT.unpack(pose)
    return POSE_STRUCT.pack(i, server_stamp(), x, y, z, yaw, pitch, flags, 0)

def to_previous(pose: bytes) -> bytes:
    return pose[:PREVIOUS_POSE_BYTES]

def from_previous(pose: bytes) -> bytes:
    return pose + b"\x00"

def convert(pose: bytes, fmt: int, speaking: bool = True) -> bytes:
    if not speaking:
        pose = pose[:13] + bytes([pose[13] & ~2]) + pose[14:]
    if fmt == UNSTAMPED_POSE_BYTES:
        return to_unstamped(pose)
    if fmt == PREVIOUS_POSE_BYTES:
        return to_previous(pose)
    return pose

MAX_PLAYERS_HARD = 64
MAX_FRAME = 64 * 1024
MAX_FRAGMENTS = 1024
MAX_SIGNAL = 16 * 1024
MAX_HEADER = 8 * 1024
MAX_ROOMS = 32
ROOM_RE = re.compile(r"[a-z0-9][a-z0-9-]{0,31}\Z")
NAME_MAX = 16
IDLE_TIMEOUT = 60.0
PING_INTERVAL = 20.0
POSE_RATE_LIMIT = 90
SIGNAL_RATE_LIMIT = 80
CHAT_RATE_LIMIT = 4
CHAT_MAX = 200
PARTNER_RANGE = 14.0
VOICE_RANGE = 40.0
POSE_BACKLOG = 64 * 1024
MAX_BACKLOG = 512 * 1024
REQUEST_TTL = 30.0
FINISH_TOP = 5 * (18 * 1.4 + 0.7)
FINISH_SLACK_Y, FINISH_HALF_X, FINISH_HALF_Z = 0.3, 1.65, 8.0
FINISH_MIN_SECONDS = 60.0
BOARD_TIMEOUT = 6.0
BOARD_AGENT = "ld60-realtime/1 (+https://qroze.com/ld60)"

OP_CONT, OP_TEXT, OP_BINARY, OP_CLOSE, OP_PING, OP_PONG = 0, 1, 2, 8, 9, 10
CLOSE_ROOM_FULL = 4001

class ProtocolError(Exception):
    def __init__(self, code: int, reason: str):
        super().__init__(reason)
        self.code = code
        self.reason = reason

def accept_key(client_key: str) -> str:
    return base64.b64encode(hashlib.sha1(client_key.encode() + WS_GUID).digest()).decode()

def unmask(payload: bytes, mask: bytes) -> bytes:
    n = len(payload)
    if n == 0:
        return payload
    key = int.from_bytes((mask * (n // 4 + 1))[:n], "little")
    return (int.from_bytes(payload, "little") ^ key).to_bytes(n, "little")

def encode_frame(opcode: int, payload: bytes, mask: bytes | None = None) -> bytes:
    head = bytearray([0x80 | opcode])
    length = len(payload)
    flag = 0x80 if mask else 0
    if length < 126:
        head.append(flag | length)
    elif length < 65536:
        head.append(flag | 126)
        head += struct.pack(">H", length)
    else:
        head.append(flag | 127)
        head += struct.pack(">Q", length)
    if mask:
        head += mask
        payload = unmask(payload, mask)
    return bytes(head) + payload

async def read_frame(reader: asyncio.StreamReader, require_mask: bool):
    first, second = await reader.readexactly(2)
    fin = bool(first & 0x80)
    if first & 0x70:
        raise ProtocolError(1002, "reserved bits set")
    opcode = first & 0x0F
    if opcode not in (OP_CONT, OP_TEXT, OP_BINARY, OP_CLOSE, OP_PING, OP_PONG):
        raise ProtocolError(1002, "unknown opcode")
    masked = bool(second & 0x80)
    length = second & 0x7F
    if length == 126:
        (length,) = struct.unpack(">H", await reader.readexactly(2))
    elif length == 127:
        (length,) = struct.unpack(">Q", await reader.readexactly(8))
    if opcode >= 8 and (length > 125 or not fin):
        raise ProtocolError(1002, "bad control frame")
    if length > MAX_FRAME:
        raise ProtocolError(1009, "frame too large")
    if masked != require_mask:
        raise ProtocolError(1002, "masking rule violated")
    mask = await reader.readexactly(4) if masked else None
    payload = await reader.readexactly(length)
    if mask:
        payload = unmask(payload, mask)
    return fin, opcode, payload

async def read_message(reader: asyncio.StreamReader, require_mask: bool, on_control):
    opcode = None
    parts: list[bytes] = []
    total = 0
    fragments = 0
    while True:
        fin, op, payload = await read_frame(reader, require_mask)
        if op >= 8:
            await on_control(op, payload)
            if op == OP_CLOSE:
                return OP_CLOSE, payload
            continue
        if op == OP_CONT:
            if opcode is None:
                raise ProtocolError(1002, "continuation without start")
        elif opcode is not None:
            raise ProtocolError(1002, "interleaved message")
        else:
            opcode = op
        fragments += 1
        if fragments > MAX_FRAGMENTS:
            raise ProtocolError(1009, "too many fragments")
        total += len(payload)
        if total > MAX_FRAME:
            raise ProtocolError(1009, "message too large")
        if payload:
            parts.append(payload)
        if fin:
            return opcode, b"".join(parts)

def clean_name(raw: str, player_id: int) -> str:
    name = "".join(ch for ch in raw if ch.isprintable() and ch not in "<>&\"'").strip()[:NAME_MAX]
    return name or f"player-{player_id}"

def clean_chat(raw) -> str | None:
    if not isinstance(raw, str):
        return None
    text = "".join(ch if ch.isprintable() else " " for ch in raw).strip()[:CHAT_MAX]
    return text or None

def on_finish_line(position) -> bool:
    if position is None:
        return False
    x, y, z = position
    return abs(y - FINISH_TOP) <= FINISH_SLACK_Y and abs(x) <= FINISH_HALF_X and abs(z) <= FINISH_HALF_Z

def board_entry(e) -> dict | None:
    if not (isinstance(e, dict) and isinstance(e.get("rank"), int) and not isinstance(e.get("rank"), bool) and 1 <= e["rank"] <= 10 ** 9
            and isinstance(e.get("names"), str) and 1 <= len(e["names"]) <= 80
            and isinstance(e.get("seconds"), (int, float)) and not isinstance(e.get("seconds"), bool) and 0 < e["seconds"] < 10 ** 7):
        return None
    return {"rank": e["rank"], "names": e["names"], "seconds": round(float(e["seconds"]), 2)}

def post_board(url: str, secret: str, names: str, seconds: float) -> dict | None:
    import urllib.request
    body = json.dumps({"names": names, "seconds": seconds}).encode()
    request = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json", "Authorization": "Bearer " + secret,
                                                                            "User-Agent": BOARD_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=BOARD_TIMEOUT) as response:
            reply = json.loads(response.read(65536))
    except Exception as error:
        LOG.warning("leaderboard: %s", type(error).__name__)
        return None
    entry = board_entry(reply.get("entry")) if isinstance(reply, dict) else None
    top = reply.get("top") if isinstance(reply, dict) else None
    if entry is None or not isinstance(top, list) or len(top) > 10:
        return None
    rows = [board_entry(e) for e in top]
    return None if any(r is None for r in rows) else {"entry": entry, "top": rows}

def within_range(a: Client, b: Client, metres: float = PARTNER_RANGE) -> bool:
    pa, pb = a.position(), b.position()
    if pa is None or pb is None:
        return False
    return sum((x - y) ** 2 for x, y in zip(pa, pb)) <= metres ** 2


def valid_voice(data) -> bool:
    return isinstance(data, dict) and len(data) == 1 and next(iter(data)) in ('description', 'candidate', 'candidates') and valid_signal(data)

def turn_credentials(secret: str, urls: list[str], ttl: int, now: float | None = None) -> dict:
    expiry = int((now if now is not None else time.time()) + ttl)
    username = f"{expiry}:ld60"
    password = base64.b64encode(hmac.new(secret.encode(), username.encode(), hashlib.sha1).digest()).decode()
    return {"urls": urls, "username": username, "credential": password}

TYPES = set('IOTJLSZ')
TABLES = {'ember': (300, 3), 'tide': (320, 4), 'mound': (190, 2), 'specter': (190, 1), 'vault': (190, 2)}


def number(v, lo, hi):
    return type(v) in (int, float) and lo <= v <= hi and math.isfinite(v)


def integer(v, lo, hi):
    return number(v, lo, hi) and int(v) == v


def keys(v, required, optional=()):
    return isinstance(v, dict) and set(required) <= v.keys() <= set(required) | set(optional)


def array(v, n, check):
    return isinstance(v, list) and len(v) == n and all(check(x) for x in v)


def piece_type(v):
    return isinstance(v, str) and v in TYPES


def cells(v, fade=False):
    start = 2 if fade else 1
    return (isinstance(v, list) and start <= len(v) <= start + 8 and (len(v) - start) % 2 == 0
            and piece_type(v[0]) and (not fade or integer(v[1], 0, 36))
            and all(integer(x, 0, 9 if i % 2 == 0 else 17) for i, x in enumerate(v[start:])))


def mirror(v):
    if not keys(v, ('ph', 'p', 'g', 'r', 's', 'cu', 'rc', 'rf'), ('w',)):
        return False
    p = v['p']
    return (isinstance(v['ph'], str) and v['ph'] in ('play', 'pause', 'clear', 'curtain', 'over')
            and (p is None or isinstance(p, list) and len(p) == 4 and piece_type(p[0])
                 and integer(p[1], 0, 9) and integer(p[2], -4, 17) and integer(p[3], -2147483648, 2147483647))
            and number(v['g'], 0, 1) and number(v['r'], 1, 53) and integer(v['s'], 0, 9007199254740991)
            and integer(v['cu'], 0, 18)
            and (v['rc'] is None or isinstance(v['rc'], list) and len(v['rc']) <= 2 and all(cells(c) for c in v['rc']))
            and (v['rf'] is None or cells(v['rf'], True))
            and ('w' not in v or isinstance(v['w'], str) and re.fullmatch(r'[.IOTJLSZ]{180}', v['w']) is not None))


def candidate(v):
    return (keys(v, ('candidate',), ('sdpMid', 'sdpMLineIndex', 'usernameFragment'))
            and isinstance(v['candidate'], str) and len(v['candidate']) <= 2048
            and all(v.get(k) is None or isinstance(v[k], str) and len(v[k]) <= 256 for k in ('sdpMid', 'usernameFragment'))
            and (v.get('sdpMLineIndex') is None or integer(v['sdpMLineIndex'], 0, 63)))


def valid_signal(data):
    if not isinstance(data, dict) or not data:
        return False
    if keys(data, ('tier',), ('at',)):
        return integer(data['tier'], 0, 2) and ('at' not in data or array(data['at'], 3, lambda x: number(x, -200, 200)))
    if keys(data, ('pinHit',), ('at',)):
        return data['pinHit'] in ('x', 'y') and (data.get('at') is None or number(data['at'], -50, 400))
    if len(data) != 1:
        return False
    kind, v = next(iter(data.items()))
    if kind == 'mirror':
        return mirror(v)
    if kind == 'pin':
        if v is None:
            return True
        if not keys(v, ('t', 'b', 's', 'f', 'i', 'c', 'at'), ('h', 'r')) or not isinstance(v['t'], str) or v['t'] not in TABLES:
            return False
        if v.get('h') is not None and v['h'] not in ('cave', 'slotA', 'slotB'):
            return False
        if v.get('r') is not None and not (isinstance(v['r'], list) and len(v['r']) == 2 and integer(v['r'][0], 0, 3) and integer(v['r'][1], 0, 60)):
            return False
        height, _ = TABLES[v['t']]
        b = v['b']
        return (isinstance(b, list) and len(b) == 4 and number(b[0], -40, 200) and number(b[1], -40, height + 40)
                and number(b[2], -5000, 5000) and number(b[3], -5000, 5000)
                and isinstance(v['s'], str) and re.fullmatch(r'[a-z]{1,12}', v['s']) is not None
                and array(v['f'], 4, lambda x: number(x, -1000, 1000)) and integer(v['i'], 0, 3) and integer(v['c'], 0, 3)
                and number(v['at'], 0, 1e13))
    if kind == 'ride':
        return isinstance(v, list) and len(v) == 3 and integer(v[0], -1, 1) and number(v[1], -3, 3) and number(v[2], -3, 3)
    if kind == 'micro':
        return keys(v, ('w', 'l')) and integer(v['w'], 0, 1000) and integer(v['l'], 0, 3)
    if kind in ('squish', 'over', 'cube'):
        return integer(v, 1, 1)
    if kind == 'teleport':
        return integer(v, 0, 5)
    if kind == 'reel':
        return isinstance(v, list) and len(v) == 2 and number(v[0], 1, 21) and integer(v[1], 0, 1)
    if kind == 'description':
        return (keys(v, ('type', 'sdp')) and isinstance(v['type'], str) and v['type'] in ('offer', 'answer')
                and isinstance(v['sdp'], str) and len(v['sdp']) <= 14000)
    if kind == 'candidate':
        return candidate(v)
    if kind == 'candidates':
        return isinstance(v, list) and len(v) <= 20 and all(candidate(c) for c in v)
    return False

class Client:
    def __init__(self, room: "Room", player_id: int, name: str, writer: asyncio.StreamWriter, peer: str):
        self.room = room
        self.id = player_id
        self.name = name
        self.writer = writer
        self.peer = peer
        self.pose: bytes | None = None
        self.pending: list[bytes] = []
        self.fmt = POSE_BYTES
        self.partner: "Client | None" = None
        self.proposal: tuple[int, float] | None = None
        self.cable = False
        self.partnered_at: float | None = None
        self.finished = False
        self.last_seen = time.monotonic()
        self.pose_budget = POSE_RATE_LIMIT
        self.signal_budget = SIGNAL_RATE_LIMIT
        self.chat_budget = CHAT_RATE_LIMIT
        self.budget_reset = time.monotonic()
        self.closed = False

    def send(self, opcode: int, payload: bytes):
        self.send_frame(opcode, encode_frame(opcode, payload))

    def send_frame(self, opcode: int, frame: bytes):
        if self.closed or self.writer.is_closing():
            return
        backlog = self.writer.transport.get_write_buffer_size()
        if backlog > MAX_BACKLOG:
            LOG.info("drop room=%s id=%d: %d bytes unsent", self.room.name, self.id, backlog)
            self.closed = True
            self.writer.transport.abort()
            self.writer.close()
            return
        if opcode == OP_BINARY and backlog > POSE_BACKLOG:
            return
        try:
            self.writer.write(frame)
        except (ConnectionError, RuntimeError):
            self.closed = True

    def send_json(self, message: dict):
        self.send(OP_TEXT, json.dumps(message, separators=(",", ":")).encode())

    def within_budget(self, kind: str) -> bool:
        now = time.monotonic()
        if now - self.budget_reset >= 1.0:
            self.pose_budget, self.signal_budget, self.chat_budget, self.budget_reset = POSE_RATE_LIMIT, SIGNAL_RATE_LIMIT, CHAT_RATE_LIMIT, now
        if kind == "pose":
            self.pose_budget -= 1
            return self.pose_budget >= 0
        if kind == "chat":
            self.chat_budget -= 1
            return self.chat_budget >= 0
        self.signal_budget -= 1
        return self.signal_budget >= 0

    def position(self):
        if self.pose is None:
            return None
        _, _, x, y, z, _, _, _, _ = POSE_STRUCT.unpack(self.pose)
        return x * MM, y * Y_UNIT, z * MM

class Room:
    def __init__(self, name: str, max_players: int):
        self.name = name
        self.max_players = max_players
        self.clients: dict[int, Client] = {}
        self.dirty = False

    def free_id(self) -> int | None:
        for candidate in range(self.max_players):
            if candidate not in self.clients:
                return candidate
        return None

    def state_packet(self, exclude: int, fmt: int = POSE_BYTES) -> bytes:
        poses = [convert(c.pose, fmt, c.partner is not None and c.partner.id == exclude)
                 for c in self.clients.values() if c.pose is not None and c.id != exclude]
        return bytes([MSG_STATE, len(poses)]) + b"".join(poses)

    def tick_packet(self, exclude: int, fmt: int, converted: dict | None = None) -> bytes | None:
        poses = []
        for c in self.clients.values():
            if c.id == exclude or not c.pending:
                continue
            speaking = c.partner is not None and c.partner.id == exclude
            key = (c.id, fmt, speaking)
            if converted is None:
                poses.extend(convert(p, fmt, speaking) for p in c.pending)
            elif key in converted:
                poses.extend(converted[key])
            else:
                poses.extend(converted.setdefault(key, [convert(p, fmt, speaking) for p in c.pending]))
        if not poses:
            return None
        return bytes([MSG_STATE, len(poses)]) + b"".join(poses)

    def pairs(self) -> list[list[int]]:
        return sorted([c.id, c.partner.id] for c in self.clients.values() if c.partner is not None and c.id < c.partner.id)

    def cables(self) -> list[int]:
        return sorted(c.id for c in self.clients.values() if c.cable and c.partner is None)

    def announce_pairs(self):
        self.broadcast_json({"t": "partners", "pairs": self.pairs()})

    def unpair(self, client: "Client", reason: str):
        other = client.partner
        if other is None:
            return
        client.partner = other.partner = None
        client.partnered_at = other.partnered_at = None
        client.finished = other.finished = False
        other.send_json({"t": "unpartnered", "id": client.id, "reason": reason})
        client.send_json({"t": "unpartnered", "id": other.id, "reason": reason})
        self.announce_pairs()

    def broadcast_json(self, message: dict, exclude: int | None = None):
        frame = encode_frame(OP_TEXT, json.dumps(message, separators=(",", ":")).encode())
        for client in list(self.clients.values()):
            if client.id != exclude:
                client.send_frame(OP_TEXT, frame)

    def tick(self):
        if not self.dirty:
            return
        self.dirty = False
        clients = list(self.clients.values())
        converted: dict = {}
        for client in clients:
            packet = self.tick_packet(client.id, client.fmt, converted)
            if packet is not None:
                client.send(OP_BINARY, packet)
        for client in clients:
            client.pending.clear()

class Server:
    def __init__(self, config: argparse.Namespace):
        self.config = config
        self.rooms: dict[str, Room] = {}
        self.per_ip: dict[str, int] = {}
        self.allowed_origins = [o.strip().lower() for o in config.allowed_origins.split(",") if o.strip()]
        self.ice_servers = json.loads(config.ice_servers) if config.ice_servers else []
        if not isinstance(self.ice_servers, list):
            raise SystemExit("LD60_ICE_SERVERS must be a JSON list")
        self.turn_urls = [u.strip() for u in config.turn_urls.split(",") if u.strip()]
        if bool(config.turn_secret) != bool(self.turn_urls):
            raise SystemExit("LD60_TURN_SECRET and LD60_TURN_URLS go together")
        self.started = time.time()
        self.finishing: set[asyncio.Task] = set()
        self.board_url = config.board_url
        self.board_secret = config.board_secret
        if bool(self.board_url) != bool(self.board_secret):
            raise SystemExit("LD60_BOARD_URL and LD60_BOARD_SECRET go together")
        if self.board_url and not self.board_url.startswith("https://") and not self.board_url.startswith("http://127.0.0.1"):
            raise SystemExit("LD60_BOARD_URL must be https")

    def ice_list(self) -> list:
        ice = list(self.ice_servers)
        if self.config.turn_secret:
            ice.append(turn_credentials(self.config.turn_secret, self.turn_urls, self.config.turn_ttl))
        return ice

    async def handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        peer = writer.get_extra_info("peername")
        ip = peer[0] if peer else "?"
        try:
            request = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=10)
        except (asyncio.IncompleteReadError, asyncio.LimitOverrunError, asyncio.TimeoutError, ConnectionError):
            writer.close()
            return
        if len(request) > MAX_HEADER:
            await self.http_reply(writer, 431, "header too large")
            return
        try:
            lines = request.decode("latin-1").split("\r\n")
            method, target, _version = lines[0].split(" ", 2)
        except ValueError:
            await self.http_reply(writer, 400, "bad request")
            return
        headers = {}
        for line in lines[1:]:
            if ":" in line:
                key, value = line.split(":", 1)
                headers[key.strip().lower()] = value.strip()
        try:
            url = urllib.parse.urlsplit(target)
            query = urllib.parse.parse_qs(url.query, max_num_fields=8)
        except ValueError:
            await self.http_reply(writer, 400, "bad target")
            return
        if self.config.trust_proxy and headers.get("x-forwarded-for"):
            ip = headers["x-forwarded-for"].split(",")[0].strip() or ip
        if method == "GET" and url.path == "/healthz":
            body = b'{"ok":true}'
            await self.http_reply(writer, 200, body, "application/json")
            return
        if method != "GET" or url.path != SOCKET_PATH:
            await self.http_reply(writer, 404, "not found")
            return
        if headers.get("upgrade", "").lower() != "websocket" or "upgrade" not in headers.get("connection", "").lower() \
                or headers.get("sec-websocket-version") != "13" or not headers.get("sec-websocket-key"):
            await self.http_reply(writer, 426, "websocket required")
            return
        origin = headers.get("origin", "").lower()
        if self.allowed_origins and origin not in self.allowed_origins:
            LOG.info("refused origin %r from %s", origin, ip)
            await self.http_reply(writer, 403, "origin not allowed")
            return
        if self.per_ip.get(ip, 0) >= self.config.max_per_ip:
            await self.http_reply(writer, 429, "too many connections")
            return
        room_name = query.get("room", ["lobby"])[0]
        if not ROOM_RE.fullmatch(room_name):
            await self.http_reply(writer, 400, "bad room name")
            return
        room = self.rooms.get(room_name)
        if room is None:
            if len(self.rooms) >= MAX_ROOMS:
                await self.http_reply(writer, 503, "no free rooms")
                return
            room = self.rooms[room_name] = Room(room_name, self.config.max_players)
        player_id = room.free_id()
        upgrade = (b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                   b"Sec-WebSocket-Accept: " + accept_key(headers["sec-websocket-key"]).encode() + b"\r\n\r\n")
        if player_id is None:
            writer.write(upgrade)
            raise ProtocolError(CLOSE_ROOM_FULL, "room full")
        client = Client(room, player_id, clean_name(query.get("name", [""])[0], player_id), writer, ip)
        self.per_ip[ip] = self.per_ip.get(ip, 0) + 1
        room.clients[player_id] = client
        LOG.info("join room=%s id=%d name=%r ip=%s (%d/%d)", room.name, player_id, client.name, ip, len(room.clients), room.max_players)
        try:
            writer.write(upgrade)
            await writer.drain()
            await self.session(reader, client)
        except ProtocolError as error:
            LOG.info("close room=%s id=%d: %d %s", room.name, client.id, error.code, error.reason)
            client.send(OP_CLOSE, struct.pack(">H", error.code) + error.reason.encode()[:100])
            try:
                await asyncio.wait_for(writer.drain(), timeout=2)
            except Exception:
                pass
        finally:
            self.leave(client)

    async def http_reply(self, writer: asyncio.StreamWriter, status: int, body, content_type: str = "text/plain"):
        if isinstance(body, str):
            body = body.encode()
        reason = {200: "OK", 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 426: "Upgrade Required",
                  429: "Too Many Requests", 431: "Request Header Fields Too Large", 503: "Service Unavailable"}.get(status, "Error")
        writer.write(f"HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {len(body)}\r\n"
                     f"Cache-Control: no-store\r\nConnection: close\r\n\r\n".encode() + body)
        try:
            await writer.drain()
        except ConnectionError:
            pass
        writer.close()

    async def session(self, reader: asyncio.StreamReader, client: Client):
        room = client.room
        welcome = {"t": "welcome", "id": client.id, "room": room.name, "max": room.max_players, "tick": self.config.tick_hz,
                   "players": [{"id": c.id, "name": c.name} for c in room.clients.values() if c.id != client.id],
                   "pairs": room.pairs(), "cables": room.cables(), "ice": self.ice_list()}
        client.send_json(welcome)
        room.broadcast_json({"t": "join", "id": client.id, "name": client.name}, exclude=client.id)
        if any(c.pose is not None for c in room.clients.values() if c.id != client.id):
            client.send(OP_BINARY, room.state_packet(client.id, client.fmt))

        async def on_control(op: int, payload: bytes):
            if op == OP_PING:
                client.send(OP_PONG, payload)
            client.last_seen = time.monotonic()

        async def keepalive():
            ice_at = time.monotonic()
            while not client.closed:
                await asyncio.sleep(PING_INTERVAL)
                now = time.monotonic()
                if now - client.last_seen > IDLE_TIMEOUT:
                    LOG.info("close room=%s id=%d: 1001 idle", room.name, client.id)
                    client.send(OP_CLOSE, struct.pack(">H", 1001) + b"idle")
                    client.closed = True
                    try:
                        await asyncio.wait_for(client.writer.drain(), timeout=2)
                    except Exception:
                        pass
                    client.writer.transport.abort()
                    return
                if self.config.turn_secret and now - ice_at >= self.config.turn_ttl / 2:
                    ice_at = now
                    client.send_json({"t": "ice", "ice": self.ice_list()})
                client.send(OP_PING, b"")

        pinger = asyncio.get_running_loop().create_task(keepalive())
        try:
            while True:
                opcode, payload = await read_message(reader, True, on_control)
                client.last_seen = time.monotonic()
                if opcode == OP_CLOSE:
                    client.send(OP_CLOSE, payload[:2])
                    return
                if opcode == OP_BINARY:
                    self.on_binary(client, payload)
                elif opcode == OP_TEXT:
                    self.on_text(client, payload)
        finally:
            pinger.cancel()

    def on_binary(self, client: Client, payload: bytes):
        if len(payload) not in (1 + POSE_BYTES, 1 + PREVIOUS_POSE_BYTES, 1 + UNSTAMPED_POSE_BYTES) or payload[0] != MSG_POSE or not client.within_budget("pose"):
            return
        client.fmt = len(payload) - 1
        if client.fmt == UNSTAMPED_POSE_BYTES:
            payload = bytes([MSG_POSE]) + from_unstamped(payload[1:])
        elif client.fmt == PREVIOUS_POSE_BYTES:
            payload = bytes([MSG_POSE]) + from_previous(payload[1:])
        pose = bytearray(payload[1:])
        pose[0] = client.id
        _, _, x, y, z, _, pitch, _, _ = POSE_STRUCT.unpack(bytes(pose))
        if abs(x) > POSE_LIMIT_XZ or abs(z) > POSE_LIMIT_XZ or y < POSE_FLOOR_Y or abs(pitch) > POSE_LIMIT_PITCH:
            return
        pose = bytes(pose)
        if pose != client.pose:
            client.pose = pose
            if len(client.pending) >= POSES_PER_PLAYER:
                del client.pending[0]
            client.pending.append(pose)
            client.room.dirty = True

    def on_text(self, client: Client, payload: bytes):
        if len(payload) > MAX_SIGNAL or not client.within_budget("signal"):
            raise ProtocolError(1008, "signaling abuse")
        try:
            def reject_constant(value):
                raise ValueError(value)
            message = json.loads(payload, parse_constant=reject_constant)
        except (ValueError, RecursionError):
            raise ProtocolError(1007, "bad json")
        if not isinstance(message, dict):
            raise ProtocolError(1007, "bad message")
        kind = message.get("t")
        room = client.room
        if kind == "signal":
            target = client.partner
            data = message.get("data")
            if target is None or type(message.get("to")) is not int or message['to'] != target.id or not valid_signal(data):
                return
            target.send_json({"t": "signal", "from": client.id, "data": data})
        elif kind == "voice":
            to, data = message.get("to"), message.get("data")
            target = room.clients.get(to) if type(to) is int else None
            if target is None or target is client or not valid_voice(data) or not within_range(client, target, VOICE_RANGE):
                return
            target.send_json({"t": "voice", "from": client.id, "data": data})
        elif kind == "chat":
            text = clean_chat(message.get("text"))
            if text is None:
                return
            if not client.within_budget("chat"):
                raise ProtocolError(1008, "chat flood")
            room.broadcast_json({"t": "chat", "from": client.id, "name": client.name, "text": text})
        elif kind == "partner":
            self.on_partner(client, message.get("to"))
        elif kind == "unpartner":
            if client.partner is not None:
                room.unpair(client, "left")
            elif client.proposal is not None:
                target = room.clients.get(client.proposal[0])
                client.proposal = None
                if target is not None:
                    target.send_json({"t": "partner-withdrawn", "from": client.id})
            else:
                now = time.monotonic()
                for other in room.clients.values():
                    if other.proposal is not None and other.proposal[0] == client.id and other.proposal[1] > now:
                        other.proposal = None
                        other.send_json({"t": "partner-failed", "to": client.id, "reason": "declined"})
        elif kind == "cable":
            if not client.within_budget("signal"):
                raise ProtocolError(1008, "cable flood")
            out = bool(message.get("out")) and client.partner is None
            if out != client.cable:
                client.cable = out
                room.broadcast_json({"t": "cable", "from": client.id, "out": out})
        elif kind == "ping":
            client.send_json({"t": "pong", "now": time.time()})
        elif kind == "finish":
            self.on_finish(client)

    def on_finish(self, client: Client):
        other = client.partner
        if other is None or client.finished or client.partnered_at is None:
            LOG.info("finish ignored room=%s %d: %s", client.room.name, client.id, "no partner" if other is None else "already in" if client.finished else "no start")
            return
        if not (on_finish_line(client.position()) and on_finish_line(other.position())):
            fmt = lambda p: "none" if p is None else ",".join(f"{v:.2f}" for v in p)
            LOG.info("finish refused room=%s %d at %s, %d at %s", client.room.name, client.id, fmt(client.position()), other.id, fmt(other.position()))
            return
        seconds = round(time.monotonic() - client.partnered_at, 2)
        if seconds < FINISH_MIN_SECONDS:
            LOG.info("finish refused room=%s %d: %.2fs is under the minimum", client.room.name, client.id, seconds)
            return
        client.finished = other.finished = True
        first, second = sorted((client, other), key=lambda c: c.id)
        names = f"{first.name} & {second.name}"
        LOG.info("finish room=%s %d<->%d %.2fs", client.room.name, first.id, second.id, seconds)
        task = asyncio.get_running_loop().create_task(self.record_finish(first, second, names, seconds))
        self.finishing.add(task); task.add_done_callback(self.finishing.discard)

    async def record_finish(self, a: Client, b: Client, names: str, seconds: float):
        board = None
        if self.board_url and self.board_secret:
            board = await asyncio.to_thread(post_board, self.board_url, self.board_secret, names, seconds)
        message = {"t": "finish", "seconds": seconds, "entry": board["entry"] if board else None, "top": board["top"] if board else None}
        for c in (a, b):
            c.send_json(message)

    def on_partner(self, client: Client, to):
        room = client.room
        target = room.clients.get(to) if type(to) is int else None
        if target is None or target is client or client.partner is not None:
            client.send_json({"t": "partner-failed", "to": to, "reason": "unavailable"})
            return
        if target.partner is not None:
            client.send_json({"t": "partner-failed", "to": to, "reason": "taken"})
            return
        if not within_range(client, target):
            client.send_json({"t": "partner-failed", "to": to, "reason": "too far"})
            return
        now = time.monotonic()
        if target.proposal is not None and target.proposal[0] == client.id and target.proposal[1] > now:
            client.proposal = target.proposal = None
            client.cable = target.cable = False
            client.partner, target.partner = target, client
            client.partnered_at = target.partnered_at = now
            client.finished = target.finished = False
            client.send_json({"t": "partnered", "id": target.id, "name": target.name, "offer": True})
            target.send_json({"t": "partnered", "id": client.id, "name": client.name, "offer": False})
            room.announce_pairs()
            LOG.info("partners room=%s %d<->%d", room.name, client.id, target.id)
            return
        client.proposal = (target.id, now + REQUEST_TTL)
        target.send_json({"t": "partner-request", "from": client.id, "name": client.name})
        client.send_json({"t": "partner-pending", "to": target.id})

    def leave(self, client: Client):
        client.closed = True
        room = client.room
        if client.partner is not None:
            room.unpair(client, "disconnected")
        if client.proposal is not None:
            target = room.clients.get(client.proposal[0])
            if target is not None:
                target.send_json({"t": "partner-withdrawn", "from": client.id})
            client.proposal = None
        for other in room.clients.values():
            if other.proposal is not None and other.proposal[0] == client.id:
                other.proposal = None
                other.send_json({"t": "partner-failed", "to": client.id, "reason": "unavailable"})
        if room.clients.get(client.id) is client:
            del room.clients[client.id]
            room.broadcast_json({"t": "leave", "id": client.id})
            LOG.info("leave room=%s id=%d (%d left)", room.name, client.id, len(room.clients))
        if not room.clients and self.rooms.get(room.name) is room:
            del self.rooms[room.name]
        self.per_ip[client.peer] = self.per_ip.get(client.peer, 1) - 1
        if self.per_ip[client.peer] <= 0:
            self.per_ip.pop(client.peer, None)
        try:
            client.writer.close()
        except Exception:
            pass

    async def ticker(self):
        interval = 1.0 / self.config.tick_hz
        while True:
            await asyncio.sleep(interval)
            for room in list(self.rooms.values()):
                room.tick()

    async def serve(self):
        server = await asyncio.start_server(self.guarded_handle, self.config.host, self.config.port, limit=MAX_HEADER)
        LOG.info("LD60 realtime server on ws://%s:%d%s max_players=%d tick=%dHz", self.config.host, self.config.port,
                 SOCKET_PATH, self.config.max_players, self.config.tick_hz)
        self.ticker_task = asyncio.get_running_loop().create_task(self.ticker())
        async with server:
            await server.serve_forever()

    async def guarded_handle(self, reader, writer):
        try:
            await self.handle(reader, writer)
        except ProtocolError as error:
            try:
                writer.write(encode_frame(OP_CLOSE, struct.pack(">H", error.code) + error.reason.encode()[:100]))
                await asyncio.wait_for(writer.drain(), timeout=2)
            except Exception:
                pass
        except (asyncio.IncompleteReadError, ConnectionError, asyncio.TimeoutError):
            pass
        finally:
            writer.close()

def parse_args(argv=None) -> argparse.Namespace:
    env = os.environ.get
    parser = argparse.ArgumentParser(description="Link Up realtime server")
    parser.add_argument("--host", default=env("LD60_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(env("LD60_PORT", "8101")))
    parser.add_argument("--max-players", type=int, default=int(env("LD60_MAX_PLAYERS", "64")),
                        help="players per room, 1-%d (default 64)" % MAX_PLAYERS_HARD)
    parser.add_argument("--tick-hz", type=int, default=int(env("LD60_TICK_HZ", "20")))
    parser.add_argument("--max-per-ip", type=int, default=int(env("LD60_MAX_PER_IP", "64")))
    parser.add_argument("--allowed-origins", default=env("LD60_ALLOWED_ORIGINS", ""),
                        help="comma-separated page origins; empty accepts any (development only)")
    parser.add_argument("--ice-servers", default=env("LD60_ICE_SERVERS", ""),
                        help='JSON list of RTCIceServer objects, e.g. [{"urls":"stun:turn.example:3478"}]')
    parser.add_argument("--turn-secret", default=env("LD60_TURN_SECRET", ""), help="coturn static-auth-secret")
    parser.add_argument("--turn-urls", default=env("LD60_TURN_URLS", ""), help="comma-separated turn: URLs")
    parser.add_argument("--turn-ttl", type=int, default=int(env("LD60_TURN_TTL", "7200")))
    parser.add_argument("--board-url", default=env("LD60_BOARD_URL", ""), help="the leaderboard's run endpoint (https)")
    parser.add_argument("--board-secret", default=env("LD60_BOARD_SECRET", ""), help="bearer secret for the leaderboard")
    parser.add_argument("--trust-proxy", action="store_true", default=env("LD60_TRUST_PROXY", "") == "1",
                        help="take the client IP from X-Forwarded-For (only behind your own nginx)")
    args = parser.parse_args(argv)
    if not 1 <= args.max_players <= MAX_PLAYERS_HARD:
        parser.error(f"--max-players must be 1-{MAX_PLAYERS_HARD}")
    if not 1 <= args.tick_hz <= 60:
        parser.error("--tick-hz must be 1-60")
    return args

def main(argv=None):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stdout)
    try:
        asyncio.run(Server(parse_args(argv)).serve())
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
