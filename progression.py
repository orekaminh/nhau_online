"""Hồ sơ người chơi: lưu tên, XP, cấp bậc, nhiệm vụ ngày, tủ đồ và bảng xếp hạng.

Dữ liệu nằm trong một file JSON (mặc định ./data/profiles.json, đổi bằng PUB_DATA_DIR).
Khóa của hồ sơ là `pid` — chuỗi ngẫu nhiên do trình duyệt tự sinh và giữ trong localStorage.
"""
import asyncio
import datetime
import json
import os
import random
import re
import tempfile
import time

DATA_DIR = os.environ.get("PUB_DATA_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"))
PID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
MAX_PROFILES = 20000
VN_TZ = datetime.timezone(datetime.timedelta(hours=7))
BASIC_XP_DAILY_CAP = 400  # XP từ các hành động lặp (cụng ly, gắp mồi, chat...) mỗi ngày

# ---------------------------------------------------------------- cấp bậc
TITLES = [
    (1, "Tập Sự Cầm Ly"),
    (3, "Bợm Nhậu Vỉa Hè"),
    (5, "Cao Thủ Rót Tràn"),
    (8, "Thánh Nhậu Quận 1"),
    (12, "Chiến Thần Nghìn Ly"),
    (18, "Tửu Thánh Sài Gòn"),
    (25, "Huyền Thoại Quán Nhậu"),
]


def xp_needed(level: int) -> int:
    """XP cần để đi từ `level` lên `level + 1`."""
    return 80 + 45 * (level - 1)


def level_progress(xp: int):
    level, left = 1, max(0, int(xp))
    while left >= xp_needed(level):
        left -= xp_needed(level)
        level += 1
    return level, left, xp_needed(level)


def title_for(level: int) -> str:
    name = TITLES[0][1]
    for lv, label in TITLES:
        if level >= lv:
            name = label
    return name


# ---------------------------------------------------------------- tủ đồ
# id -> (cấp mở khóa, tên hiển thị)
OUTFIT_CATALOG = {
    "hat": {
        "cap": (1, "Mũ lưỡi trai"), "none": (1, "Đầu trần"), "beanie": (2, "Mũ len"),
        "nonla": (3, "Nón lá"), "nonco": (5, "Nón cối"), "tophat": (8, "Mũ phớt"),
        "crown": (15, "Vương miện"),
    },
    "glasses": {
        "none": (1, "Không kính"), "sun": (2, "Kính râm"), "round": (4, "Kính tròn"),
        "star": (7, "Kính ngôi sao"),
    },
    "neck": {
        "none": (1, "Không đeo"), "scarf": (3, "Khăn rằn"), "lei": (9, "Vòng hoa"),
        "gold": (12, "Dây chuyền vàng"),
    },
    "shoes": {
        "sneaker": (1, "Giày thể thao"), "flip": (3, "Dép tổ ong"), "boots": (6, "Bốt da"),
    },
    "shirt": {
        "#FF5722": (1, "Cam cháy"), "#E91E63": (1, "Hồng đào"), "#3F51B5": (1, "Xanh chàm"),
        "#009688": (1, "Xanh ngọc"), "#4CAF50": (1, "Xanh lá"), "#795548": (1, "Nâu cà phê"),
        "#F5F5F5": (2, "Trắng tinh"), "#212121": (2, "Đen tuyền"), "#9C27B0": (4, "Tím mộng mơ"),
        "#2E7D32": (6, "Rằn ri"), "#00E5FF": (8, "Xanh neon"), "#FFC400": (10, "Vàng đại gia"),
    },
}
DEFAULT_OUTFIT = {"hat": "cap", "glasses": "none", "neck": "none", "shoes": "sneaker", "shirt": None}


def sanitize_outfit(outfit, level: int) -> dict:
    result = dict(DEFAULT_OUTFIT)
    if not isinstance(outfit, dict):
        return result
    for slot, options in OUTFIT_CATALOG.items():
        value = outfit.get(slot)
        if slot == "shirt" and isinstance(value, str):
            value = value.upper()
        if isinstance(value, str) and value in options and options[value][0] <= level:
            result[slot] = value
    return result


def catalog_payload():
    return {slot: [{"id": key, "level": lv, "name": name} for key, (lv, name) in options.items()]
            for slot, options in OUTFIT_CATALOG.items()}


# ---------------------------------------------------------------- nhiệm vụ ngày
QUEST_POOL = [
    {"id": "cheer", "text": "Cụng ly {n} lần", "stat": "cheer", "goals": (6, 10, 15), "xp": 30},
    {"id": "snack", "text": "Gắp mồi {n} lần", "stat": "snack", "goals": (3, 5, 8), "xp": 25},
    {"id": "sober", "text": "Uống {n} ly trà đá chanh", "stat": "sober", "goals": (1, 2), "xp": 20},
    {"id": "chat", "text": "Trò chuyện {n} câu với anh em", "stat": "chat", "goals": (3, 5, 8), "xp": 20},
    {"id": "game", "text": "Chơi {n} ván mini-game", "stat": "game_play", "goals": (1, 2, 3), "xp": 35},
    {"id": "win", "text": "Thắng {n} ván mini-game", "stat": "game_win", "goals": (1, 2), "xp": 50},
    {"id": "wc", "text": "Ghé WC xả lũ {n} lần", "stat": "pee_wc", "goals": (1, 2), "xp": 20},
    {"id": "pg", "text": "Tâm sự với em PG {n} lần", "stat": "pg", "goals": (2, 3), "xp": 20},
    {"id": "sing", "text": "Hát {n} bài karaoke", "stat": "sing", "goals": (1,), "xp": 45},
    {"id": "photo", "text": "Chụp {n} tấm ảnh kỷ niệm", "stat": "photo", "goals": (1,), "xp": 20},
    {"id": "scenic", "text": "Ngắm Landmark 81 về đêm", "stat": "scenic", "goals": (1,), "xp": 15},
    {"id": "event", "text": "Tham gia sự kiện bất ngờ của quán", "stat": "event", "goals": (1,), "xp": 35},
]
ALL_QUESTS_BONUS = 40
# Chỉ những sự kiện này mới được client báo lên (để chống gian lận vặt).
CLIENT_QUEST_EVENTS = {"photo": 3, "scenic": 1}


def today_key() -> str:
    return datetime.datetime.now(VN_TZ).date().isoformat()


def week_key() -> str:
    year, week, _ = datetime.datetime.now(VN_TZ).date().isocalendar()
    return f"{year}-W{week:02d}"


def _new_profile(name=None):
    return {
        "name": name, "named": False, "xp": 0, "outfit": dict(DEFAULT_OUTFIT),
        "stats": {}, "weekly": {"key": week_key()}, "quests": {"date": None, "items": [], "bonus": False},
        "streak": {"last": None, "count": 0}, "day": {"date": None, "basic_xp": 0},
        "created": int(time.time()), "last_seen": int(time.time()),
    }


def ensure_quests(profile):
    today = today_key()
    if profile["quests"].get("date") == today:
        return
    pid_seed = f"{today}:{profile.get('created', 0)}:{profile.get('name')}"
    rng = random.Random(pid_seed)
    chosen = rng.sample(QUEST_POOL, 3)
    profile["quests"] = {
        "date": today, "bonus": False,
        "items": [{"id": q["id"], "goal": rng.choice(q["goals"]), "progress": 0, "done": False} for q in chosen],
    }


def quest_view(profile):
    ensure_quests(profile)
    by_id = {q["id"]: q for q in QUEST_POOL}
    items = []
    for it in profile["quests"]["items"]:
        spec = by_id[it["id"]]
        items.append({"id": it["id"], "text": spec["text"].format(n=it["goal"]), "progress": min(it["progress"], it["goal"]),
                      "goal": it["goal"], "done": it["done"], "xp": spec["xp"]})
    return {"items": items, "bonus": ALL_QUESTS_BONUS, "bonus_done": profile["quests"].get("bonus", False)}


def touch_login(profile):
    """Gọi khi vào quán. Trả về XP chuyên cần (0 nếu hôm nay đã nhận rồi)."""
    today = today_key()
    last = profile["streak"].get("last")
    profile["last_seen"] = int(time.time())
    ensure_quests(profile)
    if last == today:
        return 0
    yesterday = (datetime.datetime.now(VN_TZ).date() - datetime.timedelta(days=1)).isoformat()
    profile["streak"]["count"] = profile["streak"].get("count", 0) + 1 if last == yesterday else 1
    profile["streak"]["last"] = today
    return min(profile["streak"]["count"], 7) * 10


def add_stat(profile, stat, n=1):
    """Tăng thống kê + tiến độ nhiệm vụ. Trả về danh sách nhiệm vụ vừa hoàn thành."""
    profile["stats"][stat] = profile["stats"].get(stat, 0) + n
    week = profile["weekly"]
    if week.get("key") != week_key():
        profile["weekly"] = week = {"key": week_key()}
    weekly_name = {"cheer": "cheers", "game_win": "wins", "sing": "songs"}.get(stat)
    if weekly_name:
        week[weekly_name] = week.get(weekly_name, 0) + n
    ensure_quests(profile)
    by_id = {q["id"]: q for q in QUEST_POOL}
    done_now = []
    for it in profile["quests"]["items"]:
        spec = by_id[it["id"]]
        if it["done"] or spec["stat"] != stat:
            continue
        it["progress"] += n
        if it["progress"] >= it["goal"]:
            it["done"] = True
            done_now.append({"id": it["id"], "text": spec["text"].format(n=it["goal"]), "xp": spec["xp"]})
    return done_now


def all_quests_bonus_due(profile):
    q = profile["quests"]
    if not q.get("bonus") and q["items"] and all(i["done"] for i in q["items"]):
        q["bonus"] = True
        return ALL_QUESTS_BONUS
    return 0


def cap_basic_xp(profile, amount):
    """Giới hạn XP từ hành động lặp lại mỗi ngày để không thể cày vô tận."""
    today = today_key()
    if profile["day"].get("date") != today:
        profile["day"] = {"date": today, "basic_xp": 0}
    room_left = max(0, BASIC_XP_DAILY_CAP - profile["day"]["basic_xp"])
    granted = min(amount, room_left)
    profile["day"]["basic_xp"] += granted
    return granted


def grant_xp(profile, amount):
    """Cộng XP. Trả về (cấp cũ, cấp mới)."""
    before = level_progress(profile["xp"])[0]
    profile["xp"] = max(0, profile["xp"] + int(amount))
    if profile["weekly"].get("key") != week_key():
        profile["weekly"] = {"key": week_key()}
    if amount > 0:
        profile["weekly"]["xp"] = profile["weekly"].get("xp", 0) + int(amount)
    return before, level_progress(profile["xp"])[0]


def profile_view(profile):
    level, into, need = level_progress(profile["xp"])
    return {
        "name": profile.get("name"), "xp": profile["xp"], "level": level, "title": title_for(level),
        "xp_in_level": into, "xp_for_next": need, "outfit": sanitize_outfit(profile.get("outfit"), level),
        "quests": quest_view(profile), "stats": profile["stats"], "streak": profile["streak"].get("count", 0),
    }


# ---------------------------------------------------------------- lưu trữ
class ProfileStore:
    def __init__(self, path=None):
        self.path = path or os.path.join(DATA_DIR, "profiles.json")
        self.profiles = {}
        self.dirty = False
        self._load()

    def _load(self):
        try:
            with open(self.path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, dict):
                self.profiles = data
        except (OSError, ValueError):
            self.profiles = {}

    def get(self, pid):
        """Hồ sơ theo pid. pid không hợp lệ => hồ sơ khách, không lưu."""
        if not isinstance(pid, str) or not PID_RE.match(pid):
            return _new_profile()
        if pid not in self.profiles:
            if len(self.profiles) >= MAX_PROFILES:
                oldest = min(self.profiles, key=lambda k: self.profiles[k].get("last_seen", 0))
                del self.profiles[oldest]
            self.profiles[pid] = _new_profile()
        profile = self.profiles[pid]
        for key, default in _new_profile().items():  # tương thích ngược khi thêm trường mới
            profile.setdefault(key, default)
        return profile

    def mark_dirty(self):
        self.dirty = True

    def save(self):
        if not self.dirty:
            return
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(self.path), suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(self.profiles, fh, ensure_ascii=False)
            os.replace(tmp, self.path)
            self.dirty = False
        except OSError:
            try:
                os.unlink(tmp)
            except OSError:
                pass

    async def autosave(self, interval=8):
        while True:
            await asyncio.sleep(interval)
            self.save()

    def leaderboard(self, kind="xp", limit=10, pid=None):
        week = week_key()

        def score(p):
            if kind == "xp":
                return p.get("xp", 0)
            wk = p.get("weekly", {})
            if wk.get("key") != week:
                return 0
            return wk.get({"week_cheers": "cheers", "week_wins": "wins", "week_songs": "songs", "week_xp": "xp"}.get(kind, "xp"), 0)

        rows = [(score(p), key, p) for key, p in self.profiles.items() if p.get("named") or p.get("xp", 0) > 0]
        rows = [r for r in rows if r[0] > 0]
        rows.sort(key=lambda r: (-r[0], r[1]))
        top = [{"rank": i + 1, "name": (p.get("name") or "Ẩn danh")[:25], "level": level_progress(p.get("xp", 0))[0],
                "title": title_for(level_progress(p.get("xp", 0))[0]), "score": s, "me": key == pid}
               for i, (s, key, p) in enumerate(rows[:limit])]
        mine = next(({"rank": i + 1, "score": s} for i, (s, key, _) in enumerate(rows) if key == pid), None) if pid else None
        return {"kind": kind, "week": week, "rows": top, "mine": mine}
