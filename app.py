import asyncio
import json
import logging
import random
import os
import re
import time
import math
from contextlib import asynccontextmanager
from typing import Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.middleware.gzip import GZipMiddleware

import progression
from extras import EventDirector, Karaoke
from minigames import GameManager

store = progression.ProfileStore()


@asynccontextmanager
async def lifespan(_app):
    saver = asyncio.ensure_future(store.autosave())
    yield
    saver.cancel()
    store.save()


app = FastAPI(title="Phòng Nhậu Ảo 3D - Quán Nhậu 1 2 3 DÔ", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1024)

# Mount static folder
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "vendor"), exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/vendor", StaticFiles(directory=os.path.join(STATIC_DIR, "vendor")), name="vendor")

LONG_CACHE_PREFIXES = ("/vendor/", "/environment/", "/textures/", "/sounds/", "/static/vendor/", "/static/textures/",
                       "/static/environment/")


@app.middleware("http")
async def cache_headers(request: Request, call_next):
    response = await call_next(request)
    if response.status_code == 200 and "cache-control" not in response.headers:
        if request.url.path.startswith(LONG_CACHE_PREFIXES):
            response.headers["Cache-Control"] = "public, max-age=604800"
        elif request.url.path.endswith((".js", ".css", ".html")) or request.url.path == "/":
            response.headers["Cache-Control"] = "no-cache"  # luôn hỏi lại bằng ETag, 304 rất nhẹ
    return response

FUNNY_NICKNAMES = [
    "Thần Cồn Quận 1",
    "Mồi Tặc Xuyên Lục Địa",
    "Chiến Thần Nghìn Ly",
    "Về Vợ Đập",
    "Nửa Lon Đỏ Mặt",
    "Chuyên Gia Đi Vệ Sinh",
    "Thánh Nhấp Môi",
    "Trùm Bao Trọn Gói",
    "Bợm Nhậu Thủ Đô",
    "Đại Ca Xóm Chùa",
    "Chiến Thần Đếm Nắp",
    "Bợm Nhậu Lướt Ván",
    "Cao Thủ Rót Tràn",
    "Chuyên Gia Rủ Rê",
    "Tửu Lượng Vô Cực",
    "Húp Trọn Nước Lẩu",
    "Anh Ba Gác Đêm",
    "Thánh Chém Gió Vỉa Hè"
]

AVATAR_COLORS = [
    "#FF5722", "#E91E63", "#9C27B0", "#3F51B5",
    "#009688", "#4CAF50", "#FF9800", "#795548"
]

ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
MAX_PLAYERS = int(os.environ.get("PUB_MAX_PLAYERS", "12"))
MAX_MESSAGE = 24000


def status_for(drunk: int) -> str:
    if drunk >= 100:
        return "guc_nga"
    if drunk >= 65:
        return "say_mem"
    if drunk >= 30:
        return "lang_lang"
    return "tinh_tao"


class Pub3DRoom:
    def __init__(self, room_id: str, public: bool = True):
        self.room_id = room_id
        self.public = public
        self.clients: Dict[str, WebSocket] = {}
        self.members: Dict[str, dict] = {}
        self.profiles: Dict[str, dict] = {}
        self.snack_plates: Dict[int, int] = {0: 100, 1: 100} # 2 bàn nhậu, mỗi bàn 1 đĩa mồi
        self.total_cheers: int = 0
        self.wc_occupant = None
        self.chat_times = {}
        self.quest_event_times = {}
        self.voice = set()
        self.games = GameManager(self)
        self.events = EventDirector(self)
        self.karaoke = Karaoke(self)

    def add_member(self, client_id: str, ws: WebSocket, profile: dict) -> dict:
        self.clients[client_id] = ws
        self.profiles[client_id] = profile
        color_idx = len(self.members) % len(AVATAR_COLORS)
        level = progression.level_progress(profile["xp"])[0]
        outfit = progression.sanitize_outfit(profile.get("outfit"), level)
        nickname = profile["name"] if profile.get("named") and profile.get("name") else random.choice(FUNNY_NICKNAMES)
        profile["name"] = nickname

        # Spawn ngẫu nhiên quanh khu vực vỉa hè
        spawn_x = random.uniform(-4, 4)
        spawn_z = random.uniform(2, 6)

        member = {
            "id": client_id,
            "name": nickname,
            "color": outfit["shirt"] or AVATAR_COLORS[color_idx],
            "x": spawn_x,
            "y": 0,
            "z": spawn_z,
            "ry": 0,
            "is_walking": False,
            "is_sitting": False,
            "table_id": -1,
            "seat_id": -1,
            "beers": 0,
            "snacks_eaten": 0,
            "drunk_level": 0,
            "bladder_level": 0, # Mức căng bọng đái 0 -> 100%
            "status": "tinh_tao", # tinh_tao | lang_lang | say_mem | guc_nga
            "outfit": outfit,
            "level": level,
            "title": progression.title_for(level),
        }
        self.members[client_id] = member
        return member

    @staticmethod
    def inside_wc(x, z):
        return -22.65 < x < -18.05 and -4.55 < z < -0.05

    def wc_state(self):
        return {"type": "wc_state", "occupant_id": self.wc_occupant}

    def remove_member(self, client_id: str):
        released = self.wc_occupant == client_id
        if released:
            self.wc_occupant = None
        self.chat_times.pop(client_id, None)
        self.quest_event_times.pop(client_id, None)
        self.voice.discard(client_id)
        self.profiles.pop(client_id, None)
        if client_id in self.clients:
            del self.clients[client_id]
        if client_id in self.members:
            del self.members[client_id]
        return released

    async def broadcast(self, message: dict, exclude_client: str = None):
        text = json.dumps(message)
        dead_clients = []
        for cid, ws in list(self.clients.items()):
            if cid == exclude_client:
                continue
            try:
                await ws.send_text(text)
            except Exception:
                dead_clients.append(cid)
        released = False
        for cid in dead_clients:
            released = self.remove_member(cid) or released
        if released:
            await self.broadcast(self.wc_state())

    async def send(self, client_id: str, message: dict):
        ws = self.clients.get(client_id)
        if ws is None:
            return
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            pass

    # ------------------------------------------------------------ XP / cấp bậc
    async def award(self, cid: str, xp: int = 0, stat: str = None, n: int = 1, reason: str = "", basic: bool = False):
        prof, mem = self.profiles.get(cid), self.members.get(cid)
        if prof is None or mem is None:
            return
        gained = 0
        completed = progression.add_stat(prof, stat, n) if stat else []
        if xp > 0:
            if basic:
                xp = progression.cap_basic_xp(prof, xp)
            if self.events.happy:
                xp *= 2
            gained += xp
        for quest in completed:
            gained += quest["xp"]
        bonus = progression.all_quests_bonus_due(prof) if completed else 0
        gained += bonus
        if not (gained or completed or stat):
            return
        old_level, new_level = progression.grant_xp(prof, gained)
        store.mark_dirty()
        level_up = new_level > old_level
        if level_up:
            mem["level"] = new_level
            mem["title"] = progression.title_for(new_level)
            # Cấp mới có thể mở khóa đồ mới; đồ đã chọn vẫn hợp lệ nên không phải đổi.
            await self.broadcast({"type": "member_update", "id": cid, "level": new_level, "title": mem["title"],
                                  "message": f"🎉 {mem['name']} lên cấp {new_level}: {mem['title']}!"})
        view = progression.profile_view(prof)
        view.update(type="progress", gained=gained, reason=reason, level_up=level_up)
        await self.send(cid, view)
        for quest in completed:
            await self.send(cid, {"type": "quest_done", "id": quest["id"], "text": quest["text"], "xp": quest["xp"]})
        if bonus:
            await self.send(cid, {"type": "quest_done", "id": "all", "text": "Hoàn thành mọi nhiệm vụ hôm nay!", "xp": bonus})

    async def drink(self, cid: str, count: int = 1):
        """Uống `count` ly: tăng độ say/bọng đái như cụng ly, rồi báo cho cả phòng."""
        mem = self.members.get(cid)
        if not mem:
            return
        for _ in range(count):
            mem["beers"] += 1
            mem["drunk_level"] = min(100, mem["drunk_level"] + random.randint(10, 18))
            mem["bladder_level"] = min(100, mem.get("bladder_level", 0) + random.randint(15, 25))
        mem["status"] = status_for(mem["drunk_level"])
        await self.broadcast({"type": "drunk_update", "member_id": cid, "drunk_level": mem["drunk_level"],
                              "bladder_level": mem["bladder_level"], "status": mem["status"], "beers": mem["beers"]})

    def get_state(self):
        return {
            "room_id": self.room_id,
            "members": list(self.members.values()),
            "snack_plates": self.snack_plates,
            "total_cheers": self.total_cheers,
            "wc_occupant": self.wc_occupant,
        }

    def shutdown(self):
        self.games.shutdown()
        self.events.shutdown()
        self.karaoke.shutdown()

rooms: Dict[str, Pub3DRoom] = {}

def get_or_create_room(room_id: str, public: bool = True) -> Pub3DRoom:
    if room_id not in rooms:
        rooms[room_id] = Pub3DRoom(room_id, public)
    return rooms[room_id]

@app.get("/")
async def get_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/style.css")
async def get_style():
    return FileResponse(os.path.join(STATIC_DIR, "style.css"))

@app.get("/world-details.js")
async def world_details_js():
    return FileResponse(os.path.join(STATIC_DIR, "world-details.js"))

@app.get("/app.js")
async def get_script():
    return FileResponse(os.path.join(STATIC_DIR, "app.js"))

@app.get("/vendor/{path:path}")
async def get_vendor_file(path: str):
    file_path = os.path.join(STATIC_DIR, "vendor", path)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return Response(status_code=404)

@app.get("/environment/{path:path}")
async def get_environment_file(path: str):
    file_path = os.path.join(STATIC_DIR, "environment", path)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return Response(status_code=404)

@app.get("/textures/{path:path}")
async def get_textures_file(path: str):
    file_path = os.path.join(STATIC_DIR, "textures", path)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return Response(status_code=404)


@app.get("/features.css")
async def get_features_css():
    return FileResponse(os.path.join(STATIC_DIR, "features.css"))


def _safe_static(folder: str, path: str):
    """File nằm trong static/<folder>, chặn ../ để không đọc ra ngoài thư mục."""
    base = os.path.realpath(os.path.join(STATIC_DIR, folder))
    target = os.path.realpath(os.path.join(base, path))
    if target.startswith(base + os.sep) and os.path.isfile(target):
        return FileResponse(target)
    return Response(status_code=404)


@app.get("/features/{path:path}")
async def get_features_file(path: str):
    return _safe_static("features", path)


@app.get("/sounds/{path:path}")
async def get_sound_file(path: str):
    return _safe_static("sounds", path)


@app.get("/music/{path:path}")
async def get_music_file(path: str):
    return _safe_static("music", path)


@app.get("/api/rooms")
async def api_rooms():
    """Danh sách phòng công khai đang có người (phòng riêng không hiện)."""
    listing = [{"id": r.room_id, "players": len(r.members), "max": MAX_PLAYERS}
               for r in rooms.values() if r.public and r.members]
    listing.sort(key=lambda r: -r["players"])
    return {"rooms": listing[:30], "max": MAX_PLAYERS}


@app.get("/api/leaderboard")
async def api_leaderboard(kind: str = "xp", pid: str = None):
    if kind not in ("xp", "week_cheers", "week_wins", "week_songs"):
        return JSONResponse({"error": "kind không hợp lệ"}, status_code=400)
    return store.leaderboard(kind, 10, pid if pid in store.profiles else None)


@app.get("/api/catalog")
async def api_catalog():
    return {"outfit": progression.catalog_payload(), "titles": progression.TITLES}


async def leave_room(room: Pub3DRoom, client_id: str, websocket: WebSocket):
    """Dọn một kết nối. Bỏ qua nếu client đã kết nối lại bằng socket mới."""
    if room.clients.get(client_id) not in (websocket, None):
        return
    left_mem = room.members.get(client_id)
    was_voice = client_id in room.voice
    released = room.remove_member(client_id)
    if released:
        await room.broadcast(room.wc_state())
    if was_voice:
        await room.broadcast({"type": "voice_left", "id": client_id})
    await room.games.on_member_left(client_id)
    await room.karaoke.on_member_left(client_id)
    if left_mem:
        await room.broadcast({
            "type": "member_left",
            "member_id": client_id,
            "message": f"👋 {left_mem['name']} đã đứng dậy rời quán về ngủ!"
        })
    if not room.members:
        room.shutdown()
        if rooms.get(room.room_id) is room:
            del rooms[room.room_id]


@app.websocket("/ws/{room_id}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    if not ID_RE.match(room_id) or not ID_RE.match(client_id):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    query = websocket.query_params
    existing = rooms.get(room_id)
    if existing and len(existing.members) >= MAX_PLAYERS and client_id not in existing.members:
        await websocket.send_json({"type": "room_full", "max": MAX_PLAYERS,
                                   "message": f"Phòng {room_id} đã đủ {MAX_PLAYERS} người. Hãy tạo phòng mới nhé!"})
        await websocket.close(code=4001)
        return
    room = existing or get_or_create_room(room_id, public=query.get("private") != "1")
    profile = store.get(query.get("pid"))
    login_bonus = progression.touch_login(profile)
    member = room.add_member(client_id, websocket, profile)
    store.mark_dirty()
    room.events.start_loop()

    # Gửi toàn bộ trạng thái thế giới 3D cho người mới vào
    await websocket.send_text(json.dumps({
        "type": "init",
        "self_id": client_id,
        "server_time": int(time.time() * 1000),
        "world_state": room.get_state(),
        "profile": progression.profile_view(profile),
        "catalog": progression.catalog_payload(),
        "limits": {"max_players": MAX_PLAYERS, "public": room.public},
        "game": room.games.view(),
        "events": [room.events.public(e) for e in room.events.view_current()],
        "karaoke": room.karaoke.view(),
        "voice_peers": sorted(room.voice),
    }))
    for event in room.events.view_current():
        await websocket.send_text(json.dumps(room.events.public(event)))
    await websocket.send_text(json.dumps(room.karaoke.view()))
    if login_bonus:
        await room.award(client_id, login_bonus, reason=f"Chuyên cần {profile['streak']['count']} ngày liên tiếp")

    # Báo cho các người chơi khác trong thế giới 3D
    await room.broadcast({
        "type": "member_joined",
        "member": member,
        "message": f"🍻 {member['name']} vừa bước vào quán nhậu vỉa hè!"
    }, exclude_client=client_id)

    try:
        while True:
            raw_data = await websocket.receive_text()
            if len(raw_data) > MAX_MESSAGE:
                continue
            try:
                data = json.loads(raw_data)
            except ValueError:
                continue
            if not isinstance(data, dict) or client_id not in room.members:
                continue
            try:
                action = data.get("action")

                if action == "chat":
                    raw = data.get("text", "")
                    if not isinstance(raw, str):
                        continue
                    text = " ".join("".join(c for c in raw if c.isprintable()).split())[:160]
                    now = time.monotonic()
                    if not text:
                        await websocket.send_json({"type": "chat_error", "message": "Nhập lời muốn nói trước nhé."})
                    elif now - room.chat_times.get(client_id, 0) < 1.0:
                        await websocket.send_json({"type": "chat_error", "message": "Chờ một chút rồi gửi tin tiếp nhé."})
                    else:
                        room.chat_times[client_id] = now
                        await room.broadcast({"type": "chat_event", "member_id": client_id,
                            "member_name": room.members[client_id]["name"], "text": text})
                        await room.award(client_id, 1, "chat", basic=True)
                    continue

                if action in ("wc_enter", "wc_exit"):
                    mem = room.members[client_id]
                    entering = action == "wc_enter"
                    if entering:
                        if room.wc_occupant not in (None, client_id):
                            await websocket.send_json({"type": "wc_notice", "message": "🚪 WC đang có người. Đợi ở ngoài một chút nhé!"})
                            continue
                        if mem["is_sitting"] or mem["status"] == "guc_nga" or math.hypot(mem["x"] + 17, mem["z"] + 2.7) > 3.0:
                            await websocket.send_json({"type": "wc_notice", "message": "Đến gần cửa WC rồi bấm Vào WC nhé."})
                            continue
                        room.wc_occupant = client_id
                    elif room.wc_occupant != client_id:
                        continue
                    else:
                        room.wc_occupant = None
                    mem.update(x=-19.2 if entering else -16.4, z=-2.7, ry=-math.pi/2 if entering else math.pi/2, is_walking=False)
                    await websocket.send_json({"type": "wc_result", "entered": entering, "x": mem["x"], "z": mem["z"], "ry": mem["ry"]})
                    await room.broadcast(room.wc_state())
                    await room.broadcast({"type": "player_moved", "id": client_id, "x": mem["x"], "y": 0,
                        "z": mem["z"], "ry": mem["ry"], "is_walking": False}, exclude_client=client_id)
                    continue

                if action == "move":
                    # Đồng bộ vị trí 3D di chuyển
                    if client_id in room.members:
                        mem = room.members[client_id]
                        if not mem["is_sitting"] and mem["status"] != "guc_nga":
                            try:
                                nx, nz = float(data.get("x", mem["x"])), float(data.get("z", mem["z"]))
                                ny = float(data.get("y", 0))
                                nry = float(data.get("ry", mem["ry"]))
                            except (TypeError, ValueError):
                                continue
                            if not all(math.isfinite(v) for v in (nx, nz, ny, nry)):
                                continue
                            inside = room.inside_wc(nx, nz)
                            if inside and (room.wc_occupant not in (None, client_id) or
                                (room.wc_occupant is None and math.hypot(mem["x"] + 17, mem["z"] + 2.7) > 3.0)):
                                await websocket.send_json({"type": "position_correction", "x": mem["x"], "z": mem["z"],
                                    "message": "🚪 WC đang có người hoặc bạn chưa đến cửa. Đợi bên ngoài nhé."})
                                continue
                            changed_wc = False
                            if inside and room.wc_occupant is None:
                                room.wc_occupant = client_id
                                changed_wc = True
                            elif not inside and room.wc_occupant == client_id:
                                room.wc_occupant = None
                                changed_wc = True
                            mem["x"] = nx
                            mem["y"] = ny
                            mem["z"] = nz
                            mem["ry"] = nry
                            mem["is_walking"] = bool(data.get("is_walking", False))

                            if changed_wc:
                                await room.broadcast(room.wc_state())
                            # Broadcast vị trí cho những người chơi khác
                            await room.broadcast({
                                "type": "player_moved",
                                "id": client_id,
                                "x": mem["x"],
                                "y": mem["y"],
                                "z": mem["z"],
                                "ry": mem["ry"],
                                "is_walking": mem["is_walking"]
                            }, exclude_client=client_id)

                elif action == "sit":
                    # Ngồi vào ghế 3D
                    try:
                        table_id = int(data.get("table_id", 0))
                        seat_id = int(data.get("seat_id", 0))
                    except (TypeError, ValueError):
                        continue
                    if client_id in room.members:
                        mem = room.members[client_id]
                        mem["is_sitting"] = True
                        mem["table_id"] = table_id
                        mem["seat_id"] = seat_id
                        mem["is_walking"] = False

                        await room.broadcast({
                            "type": "player_sat",
                            "id": client_id,
                            "table_id": table_id,
                            "seat_id": seat_id,
                            "message": f"🪑 {mem['name']} đã kéo ghế ngồi vào bàn {table_id + 1}!"
                        })

                elif action == "stand":
                    # Đứng dậy khỏi ghế
                    if client_id in room.members:
                        mem = room.members[client_id]
                        mem["is_sitting"] = False
                        mem["table_id"] = -1
                        mem["seat_id"] = -1

                        await room.broadcast({
                            "type": "player_stood",
                            "id": client_id,
                            "message": f"🚶‍♂️ {mem['name']} đứng dậy đi dạo quanh quán!"
                        })

                elif action == "cheer":
                    # Cụng ly DÔÔÔ!
                    if client_id in room.members:
                        mem = room.members[client_id]
                        if mem["status"] == "guc_nga":
                            continue

                        mem["beers"] += 1
                        # Say xỉn và độ căng bọng đái tăng theo lượng bia nốc
                        mem["drunk_level"] = min(100, mem["drunk_level"] + random.randint(10, 18))
                        mem["bladder_level"] = min(100, mem.get("bladder_level", 0) + random.randint(15, 25))
                        mem["status"] = status_for(mem["drunk_level"]) if mem["drunk_level"] >= 30 else mem["status"]

                        room.total_cheers += 1

                        await room.broadcast({
                            "type": "cheer_event",
                            "member_id": client_id,
                            "member_name": mem["name"],
                            "drunk_level": mem["drunk_level"],
                            "bladder_level": mem["bladder_level"],
                            "status": mem["status"],
                            "beers": mem["beers"],
                            "total_cheers": room.total_cheers,
                            "table_id": mem.get("table_id", 0),
                            "message": f"🍻 {mem['name']}: 1, 2, 3 DÔÔÔ!"
                        })
                        await room.award(client_id, 4, "cheer", reason="Cụng ly", basic=True)
                        if room.events.note_cheer(client_id):
                            await room.award(client_id, 0, "event")

                elif action == "eat_snack":
                    # Gắp mồi trên bàn
                    if client_id in room.members:
                        mem = room.members[client_id]
                        tid = mem.get("table_id", 0)
                        if tid < 0:
                            tid = 0

                        plate = room.snack_plates.get(tid, 100)
                        if plate <= 0:
                            await websocket.send_text(json.dumps({
                                "type": "snack_empty",
                                "message": "Dĩa mồi trên bàn đã hết sạch! Hãy bấm gọi thêm dĩa mới."
                            }))
                            continue

                        eaten = min(plate, random.randint(6, 12))
                        room.snack_plates[tid] = plate - eaten
                        mem["snacks_eaten"] += 1

                        top_moitac = max(room.members.values(), key=lambda m: m["snacks_eaten"])

                        await room.broadcast({
                            "type": "snack_event",
                            "member_id": client_id,
                            "member_name": mem["name"],
                            "table_id": tid,
                            "snack_plate": room.snack_plates[tid],
                            "snacks_eaten": mem["snacks_eaten"],
                            "top_moitac_name": top_moitac["name"],
                            "message": f"🥢 {mem['name']} vừa thò đũa gắp một miếng mồi thơm phức!"
                        })
                        await room.award(client_id, 2, "snack", reason="Gắp mồi", basic=True)

                elif action == "refill_snack":
                    try:
                        tid = int(data.get("table_id", 0))
                    except (TypeError, ValueError):
                        continue
                    if tid not in room.snack_plates:
                        continue
                    room.snack_plates[tid] = 100
                    await room.broadcast({
                        "type": "snack_refilled",
                        "table_id": tid,
                        "snack_plate": 100,
                        "message": f"🔔 Chủ quán: Đã lên đĩa mồi mới thơm lừng cho bàn {tid + 1}!"
                    })

                elif action == "sober_up":
                    # Uống trà đá chanh giải rượu
                    if client_id in room.members:
                        mem = room.members[client_id]
                        mem["drunk_level"] = max(0, mem["drunk_level"] - 35)
                        if mem["drunk_level"] < 100:
                            mem["status"] = "tinh_tao" if mem["drunk_level"] < 30 else ("lang_lang" if mem["drunk_level"] < 65 else "say_mem")

                        await room.broadcast({
                            "type": "sober_event",
                            "member_id": client_id,
                            "member_name": mem["name"],
                            "drunk_level": mem["drunk_level"],
                            "status": mem["status"],
                            "message": f"🍋 {mem['name']} uống một hơi cốc trà đá chanh, đã tỉnh táo lại!"
                        })
                        await room.award(client_id, 1, "sober", reason="Trà đá chanh", basic=True)

                elif action == "pee":
                    # Tính năng xả lũ / đái bậy / đi WC
                    spot_type = data.get("spot_type", "tree") # wc | tree | wall
                    if spot_type not in ("wc", "tree", "wall"):
                        continue
                    if spot_type == "wc" and (room.wc_occupant != client_id or not room.inside_wc(room.members[client_id]["x"], room.members[client_id]["z"])):
                        await websocket.send_json({"type": "wc_notice", "message": "Vào WC và chốt cửa trước khi sử dụng nhé."})
                        continue
                    if client_id in room.members:
                        mem = room.members[client_id]
                        mem["bladder_level"] = 0
                        # Xả bớt nước cũng giúp hạ độ say một chút
                        mem["drunk_level"] = max(0, mem["drunk_level"] - 12)
                        if mem["drunk_level"] < 100:
                            mem["status"] = "tinh_tao" if mem["drunk_level"] < 30 else ("lang_lang" if mem["drunk_level"] < 65 else "say_mem")

                        is_fined = (spot_type in ["tree", "wall"]) and (random.random() < 0.28)
                        fine_text = " 🚨 BỊ BÁC TỔ DÂN PHỐ BẮT QUẢ TANG PHẠT 300.000đ!" if is_fined else ""

                        if spot_type == "wc":
                            msg = f"🚽 {mem['name']} đã vào WC quán nhậu xả nhẹ nhõm, bụng nhẹ tênh!"
                        elif spot_type == "tree":
                            msg = f"🌳 {mem['name']} vừa vạch quần đái bậy vào gốc cây công viên! Róc rách róc rách...{fine_text}"
                        else: # wall
                            msg = f"🧱 {mem['name']} vừa tè bậy lên bờ tường dù có biển CẤM ĐÁI BẬY!{fine_text}"

                        await room.broadcast({
                            "type": "pee_event",
                            "member_id": client_id,
                            "member_name": mem["name"],
                            "spot_type": spot_type,
                            "bladder_level": 0,
                            "drunk_level": mem["drunk_level"],
                            "is_fined": is_fined,
                            "message": msg
                        })
                        if spot_type == "wc":
                            await room.award(client_id, 3, "pee_wc", reason="Đi WC đàng hoàng", basic=True)
                        elif not is_fined:
                            await room.award(client_id, 1, reason="Xả lũ", basic=True)

                elif action == "vomit":
                    # Tính năng Ói mửa / Cho chó ăn chè / Móc họng gọi Huệ ơi
                    if client_id in room.members:
                        mem = room.members[client_id]
                        # Nôn ra giúp giảm 40% nồng độ cồn và 40% bọng đái
                        mem["drunk_level"] = max(0, mem["drunk_level"] - 40)
                        mem["bladder_level"] = max(0, mem.get("bladder_level", 0) - 40)
                        if mem["drunk_level"] < 100:
                            mem["status"] = "tinh_tao" if mem["drunk_level"] < 30 else ("lang_lang" if mem["drunk_level"] < 65 else "say_mem")

                        vomit_lines = [
                            f"🤮 {mem['name']} không chịu nổi nhiệt đã nôn thốc nôn tháo cho chó ăn chè giữa quán!",
                            f"🤮 {mem['name']} móc họng ôm cột điện gọi tên 'Huệ ơi là Huệ...', giảm 40% độ say!",
                            f"🤮 {mem['name']} ói một bãi to tướng ra quán! Trả lại hết dĩa bò né mực chiên!",
                            f"🤮 {mem['name']} lảo đảo ói xối xả xuống bồn cầu, thở phào nhẹ nhõm!"
                        ]

                        await room.broadcast({
                            "type": "vomit_event",
                            "member_id": client_id,
                            "member_name": mem["name"],
                            "drunk_level": mem["drunk_level"],
                            "bladder_level": mem["bladder_level"],
                            "status": mem["status"],
                            "message": random.choice(vomit_lines)
                        })
                        await room.award(client_id, 1, "vomit", reason="Ói", basic=True)

                elif action == "talk_pg":
                    # Tương tác với Em Gái Tiếp Thị Bia (PG Bia)
                    pg_id = data.get("pg_id", "tiger")
                    if client_id in room.members:
                        mem = room.members[client_id]
                        # Ngắm và nói chuyện với em PG giúp tỉnh bớt 15% cồn
                        mem["drunk_level"] = max(0, mem["drunk_level"] - 15)
                        if mem["drunk_level"] < 100:
                            mem["status"] = "tinh_tao" if mem["drunk_level"] < 30 else ("lang_lang" if mem["drunk_level"] < 65 else "say_mem")

                        if pg_id == "tiger":
                            pg_name = "Em Thảo My (PG Tiger)"
                            lines = [
                                f"💃 {pg_name} diện váy xanh body cười duyên: 'Anh {mem['name']} uống Tiger Bạc mát lạnh nha, em rót đầy ly nè!'",
                                f"💃 {pg_name} nháy mắt châm đá: 'Bàn mình uống khỏe quá, anh {mem['name']} cạn 100% với em ly này nhé~'",
                                f"💃 {pg_name} cổ vũ: 'Một hai ba dô! Anh {mem['name']} uống hết em tặng quà móc khóa Tiger xịn sò nha!'"
                            ]
                        else:
                            pg_name = "Em Ngọc Trinh (PG Heineken)"
                            lines = [
                                f"💃 {pg_name} chân dài kiêu sa: 'Ken bạc ướp lạnh tuyệt hảo cho anh {mem['name']} đây ạ, tỉnh cả người!'",
                                f"💃 {pg_name} rót tràn ly bia Ken sủi bọt: 'Anh {mem['name']} đẹp trai phong độ quá, uống không say không về nha anh!'",
                                f"💃 {pg_name} duyên dáng: 'Dô nhiệt tình lên các anh ơi, hôm nay em đồng hành tiếp bia cùng bàn mình tới sáng!'"
                            ]

                        await room.broadcast({
                            "type": "pg_event",
                            "pg_id": pg_id,
                            "pg_name": pg_name,
                            "member_id": client_id,
                            "drunk_level": mem["drunk_level"],
                            "status": mem["status"],
                            "message": random.choice(lines)
                        })
                        await room.award(client_id, 2, "pg", reason="Tâm sự với PG", basic=True)

                elif action == "quick_shout":
                    shout = data.get("text", "Dô nào anh em!")
                    if client_id in room.members:
                        mem = room.members[client_id]
                        if not isinstance(shout, str):
                            continue
                        shout = " ".join("".join(c for c in shout if c.isprintable()).split())[:160] or "Dô nào anh em!"
                        await room.broadcast({
                            "type": "shout_event",
                            "member_id": client_id,
                            "member_name": mem["name"],
                            "text": shout
                        })

                elif action == "bill_roulette":
                    if client_id in room.members and len(room.members) > 0:
                        payer = random.choice(list(room.members.values()))
                        dodger = random.choice(list(room.members.values()))
                        while len(room.members) > 1 and dodger["id"] == payer["id"]:
                            dodger = random.choice(list(room.members.values()))

                        bill_amount = random.randint(450, 2500) * 1000

                        await room.broadcast({
                            "type": "bill_event",
                            "caller_name": room.members[client_id]["name"],
                            "bill_amount": f"{bill_amount:,} VNĐ",
                            "payer_name": payer["name"],
                            "dodger_name": dodger["name"] if len(room.members) > 1 else None,
                            "message": f"🧾 Tính tiền: {payer['name']} hào phóng bao trọn gói {bill_amount:,} VNĐ! " + (f"Còn {dodger['name']} thì đang lẻn đi vệ sinh trốn trả tiền!" if len(room.members) > 1 else "")
                        })

                elif action == "change_name":
                    raw_name = data.get("name", "")
                    new_name = " ".join("".join(c for c in raw_name if c.isprintable()).split()) if isinstance(raw_name, str) else ""
                    if new_name and client_id in room.members:
                        old_name = room.members[client_id]["name"]
                        room.members[client_id]["name"] = new_name[:25]
                        profile.update(name=new_name[:25], named=True)
                        store.mark_dirty()
                        await room.broadcast({
                            "type": "name_changed",
                            "member_id": client_id,
                            "new_name": room.members[client_id]["name"],
                            "message": f"📝 {old_name} đổi tên thành '{room.members[client_id]['name']}'"
                        })

                elif action == "set_outfit":
                    mem = room.members[client_id]
                    outfit = progression.sanitize_outfit(data.get("outfit"), mem["level"])
                    profile["outfit"] = outfit
                    mem["outfit"] = outfit
                    if outfit["shirt"]:
                        mem["color"] = outfit["shirt"]
                    store.mark_dirty()
                    await room.broadcast({"type": "outfit_changed", "member_id": client_id, "outfit": outfit,
                                          "color": mem["color"]})

                elif action == "quest_event":
                    kind = data.get("kind")
                    now = time.monotonic()
                    if kind in progression.CLIENT_QUEST_EVENTS and now - room.quest_event_times.get((client_id, kind), 0) > 4:
                        room.quest_event_times[(client_id, kind)] = now
                        await room.award(client_id, 3, kind, reason="Hoạt động mới", basic=True)

                elif action == "profile_request":
                    await websocket.send_json(dict(progression.profile_view(profile), type="progress", gained=0, reason="", level_up=False))

                elif isinstance(action, str) and action.startswith("game_"):
                    await room.games.handle(client_id, action, data)

                elif action == "karaoke_add":
                    await room.karaoke.add(client_id, data)

                elif action == "karaoke_skip":
                    await room.karaoke.skip(client_id)

                elif action == "event_claim":
                    eid = data.get("id")
                    if isinstance(eid, str):
                        await room.events.claim(client_id, eid)

                elif action == "voice_join":
                    if client_id not in room.voice:
                        peers = sorted(room.voice)
                        room.voice.add(client_id)
                        await websocket.send_json({"type": "voice_peers", "peers": peers})
                        await room.broadcast({"type": "voice_joined", "id": client_id}, exclude_client=client_id)

                elif action == "voice_leave":
                    if client_id in room.voice:
                        room.voice.discard(client_id)
                        await room.broadcast({"type": "voice_left", "id": client_id})

                elif action == "voice_signal":
                    target = data.get("to")
                    signal = data.get("data")
                    if (client_id in room.voice and isinstance(target, str) and target in room.voice
                            and target != client_id and isinstance(signal, dict)):
                        await room.send(target, {"type": "voice_signal", "from": client_id, "data": signal})

            except WebSocketDisconnect:
                raise
            except Exception:
                logging.exception("Lỗi khi xử lý action %r từ %s", data.get("action"), client_id)
    except WebSocketDisconnect:
        pass
    except Exception:
        logging.exception("Kết nối %s bị lỗi", client_id)
    finally:
        await leave_room(room, client_id, websocket)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=port)
