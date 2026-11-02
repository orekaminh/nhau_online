"""Sự kiện ngẫu nhiên trong quán và hàng chờ Karaoke (đồng bộ theo giờ server)."""
import asyncio
import math
import os
import random
import re
import time

SONG_ID_RE = re.compile(r"^[A-Za-z0-9:_./-]{1,80}$")


def now_ms() -> int:
    return int(time.time() * 1000)


def clean_text(value, limit):
    if not isinstance(value, str):
        return ""
    return " ".join("".join(c for c in value if c.isprintable()).split())[:limit]


# ---------------------------------------------------------------- sự kiện
LUCKY_SPOTS = [(-12, 5), (12, 5), (0, 7), (-8, 14), (9, 15), (0, 23), (-15, 23), (15, 24)]

EVENT_KINDS = {
    "happy_hour": {"duration": 45, "title": "🍻 Happy Hour!",
                   "text": "Chủ quán khui bia giá sốc: mọi XP nhân đôi trong 45 giây — cụng ly thả ga!"},
    "patrol": {"duration": 22, "title": "🚨 Dân phòng tuýt còi!",
               "text": "Ngồi xuống ghế hoặc trốn vào WC trước khi hết giờ — ai đứng ngoài đường sẽ bị phạt!"},
    "blackout": {"duration": 18, "title": "🔌 Mất điện cả phố!",
                 "text": "Cả khu phố tối om. Cứ ngồi yên cụng ly dưới ánh đèn pin điện thoại!"},
    "rain": {"duration": 50, "title": "🌧️ Mưa Sài Gòn!",
             "text": "Mưa như trút nước. Chạy vào quán ngồi nhậu cho khỏi ướt!"},
    "lucky_crate": {"duration": 35, "title": "🎁 Thùng bia may mắn!",
                    "text": "Một thùng bia vừa rơi trong phố. Ai chạm vào trước nhận ngay 25 XP!"},
}
EVENT_WEIGHTS = {"happy_hour": 3, "patrol": 3, "blackout": 2, "rain": 3, "lucky_crate": 3}


class EventDirector:
    MIN_GAP = float(os.environ.get("PUB_EVENT_MIN", "90"))
    MAX_GAP = float(os.environ.get("PUB_EVENT_MAX", "170"))
    MAX_CONCURRENT = 2

    def __init__(self, room):
        self.room = room
        self.current = {}      # id -> event dict
        self._loop_task = None
        self._end_tasks = {}
        self.happy_seen = set()
        self._seq = 0

    @property
    def happy(self):
        return any(e["kind"] == "happy_hour" for e in self.current.values())

    def start_loop(self):
        if self._loop_task is None or self._loop_task.done():
            self._loop_task = asyncio.ensure_future(self._loop())

    async def _loop(self):
        while True:
            await asyncio.sleep(random.uniform(self.MIN_GAP, self.MAX_GAP))
            if not self.room.members or len(self.current) >= self.MAX_CONCURRENT:
                continue
            active = {e["kind"] for e in self.current.values()}
            pool = [k for k in EVENT_KINDS if k not in active]
            if not pool:
                continue
            kind = random.choices(pool, weights=[EVENT_WEIGHTS[k] for k in pool])[0]
            await self.start(kind)

    def view_current(self):
        return list(self.current.values())

    async def start(self, kind, duration=None):
        spec = EVENT_KINDS[kind]
        self._seq += 1
        eid = f"e{self._seq}{random.randrange(16**4):04x}"
        seconds = duration if duration is not None else spec["duration"]
        event = {"type": "world_event", "id": eid, "kind": kind, "title": spec["title"], "text": spec["text"],
                 "started_ms": now_ms(), "ends_ms": now_ms() + int(seconds * 1000), "seconds": seconds}
        if kind == "lucky_crate":
            x, z = random.choice(LUCKY_SPOTS)
            event.update(x=x, z=z, claimed=False)
        if kind == "happy_hour":
            self.happy_seen = set()
        self.current[eid] = event
        self._end_tasks[eid] = asyncio.ensure_future(self._finish_later(eid, seconds))
        await self.room.broadcast(self.public(event))
        return event

    @staticmethod
    def public(event):
        return {k: v for k, v in event.items() if k not in ("claimed", "seconds")}

    async def _finish_later(self, eid, seconds):
        await asyncio.sleep(seconds)
        await self.finish(eid)

    async def finish(self, eid, **extra):
        event = self.current.pop(eid, None)
        task = self._end_tasks.pop(eid, None)
        if task and task is not asyncio.current_task():
            task.cancel()
        if not event:
            return
        end = {"type": "world_event_end", "id": eid, "kind": event["kind"]}
        end.update(extra)
        room = self.room
        if event["kind"] == "patrol":
            caught, safe = [], []
            for cid, mem in list(room.members.items()):
                (safe if mem["is_sitting"] or room.inside_wc(mem["x"], mem["z"]) else caught).append(cid)
            end["caught"] = [room.members[c]["name"] for c in caught]
            end["safe"] = [room.members[c]["name"] for c in safe]
            end["text"] = (f"🚨 Bị phạt 200.000đ: {', '.join(end['caught'])}." if caught
                           else "🎉 Cả quán né trót lọt, Dân phòng đi tay không!")
            await room.broadcast(end)
            for cid in safe:
                await room.award(cid, 12, "event", reason="Né Dân phòng trót lọt")
            return
        if event["kind"] in ("blackout", "rain"):
            end["text"] = "Có điện lại rồi!" if event["kind"] == "blackout" else "Tạnh mưa rồi, phố sáng bóng."
            await room.broadcast(end)
            for cid in list(room.members):
                await room.award(cid, 5, "event", reason="Vượt qua biến cố cùng quán")
            return
        if event["kind"] == "happy_hour":
            end["text"] = "Hết Happy Hour, giá bia về như cũ."
        elif event["kind"] == "lucky_crate" and "text" not in end:
            end["text"] = "Thùng bia bị hết hạn, chẳng ai nhặt kịp."
        await room.broadcast(end)

    async def claim(self, cid, eid):
        event = self.current.get(eid)
        mem = self.room.members.get(cid)
        if not event or event["kind"] != "lucky_crate" or event.get("claimed") or not mem:
            return
        if math.hypot(mem["x"] - event["x"], mem["z"] - event["z"]) > 2.6:
            return
        event["claimed"] = True
        await self.finish(eid, winner_id=cid, winner_name=mem["name"], text=f"🎁 {mem['name']} nhặt được thùng bia may mắn! +25 XP")
        await self.room.award(cid, 25, "event", reason="Nhặt thùng bia may mắn")

    def note_cheer(self, cid):
        """Gọi khi ai đó cụng ly lúc Happy Hour để tính là đã tham gia sự kiện."""
        if self.happy and cid not in self.happy_seen:
            self.happy_seen.add(cid)
            return True
        return False

    def shutdown(self):
        for task in [self._loop_task, *self._end_tasks.values()]:
            if task and task is not asyncio.current_task():
                task.cancel()
        self.current.clear()
        self._end_tasks.clear()


# ---------------------------------------------------------------- karaoke
class Karaoke:
    MAX_QUEUE = 8
    PER_USER = 2
    GAP_SECONDS = 2.0
    MIN_PLAY_RATIO = 0.4  # bỏ qua trước ngưỡng này thì không tính điểm

    def __init__(self, room):
        self.room = room
        self.current = None
        self.queue = []
        self._task = None
        self._seq = 0

    def view(self):
        def strip(item):
            return {k: item[k] for k in ("id", "song_id", "title", "singer_id", "singer_name", "duration", "started_ms") if k in item}
        return {"type": "karaoke_state", "current": strip(self.current) if self.current else None,
                "queue": [strip(q) for q in self.queue], "server_time": now_ms()}

    async def push(self):
        await self.room.broadcast(self.view())

    async def add(self, cid, data):
        room = self.room
        mem = room.members.get(cid)
        if not mem:
            return
        song_id = data.get("song_id")
        title = clean_text(data.get("title"), 60)
        try:
            duration = float(data.get("duration", 0))
        except (TypeError, ValueError):
            duration = 0
        if not isinstance(song_id, str) or not SONG_ID_RE.match(song_id) or not title or not math.isfinite(duration) or not 15 <= duration <= 900:
            await room.send(cid, {"type": "karaoke_notice", "message": "Bài hát không hợp lệ."})
            return
        mine = sum(1 for q in self.queue if q["singer_id"] == cid) + (1 if self.current and self.current["singer_id"] == cid else 0)
        if len(self.queue) >= self.MAX_QUEUE or mine >= self.PER_USER:
            await room.send(cid, {"type": "karaoke_notice", "message": "Hàng chờ đã đầy hoặc bạn đã đặt đủ 2 bài rồi."})
            return
        self._seq += 1
        self.queue.append({"id": f"k{self._seq}", "song_id": song_id, "title": title, "singer_id": cid,
                           "singer_name": mem["name"], "duration": round(duration, 1)})
        await room.broadcast({"type": "karaoke_notice", "message": f"🎤 {mem['name']} đặt bài “{title}”."})
        if not self.current:
            await self._next()
        else:
            await self.push()

    async def skip(self, cid):
        if self.current and self.current["singer_id"] == cid:
            await self._finish(score=True)

    async def _next(self):
        if self.current or not self.queue:
            await self.push()
            return
        self.current = self.queue.pop(0)
        self.current["started_ms"] = now_ms()
        self.current["present"] = self.current["singer_id"] in self.room.members
        self._task = asyncio.ensure_future(self._run(self.current["id"], self.current["duration"]))
        await self.push()

    async def _run(self, kid, duration):
        await asyncio.sleep(duration + 0.5)
        if self.current and self.current["id"] == kid:
            await self._finish(score=True)

    async def _finish(self, score):
        cur = self.current
        if not cur:
            return
        task, self._task = self._task, None
        if task and task is not asyncio.current_task():
            task.cancel()
        self.current = None
        elapsed = (now_ms() - cur["started_ms"]) / 1000
        singer = cur["singer_id"]
        if score and singer in self.room.members and elapsed >= cur["duration"] * self.MIN_PLAY_RATIO:
            points = random.randint(68, 99)
            await self.room.broadcast({"type": "karaoke_score", "singer_id": singer, "singer_name": cur["singer_name"],
                                       "title": cur["title"], "score": points})
            await self.room.award(singer, 25 + (points - 60) // 4, "sing", reason="Hát karaoke")
        await self.push()
        if self.queue:
            await asyncio.sleep(self.GAP_SECONDS)
            await self._next()

    async def on_member_left(self, cid):
        self.queue = [q for q in self.queue if q["singer_id"] != cid]
        if self.current and self.current["singer_id"] == cid:
            await self._finish(score=False)
        else:
            await self.push()

    def shutdown(self):
        if self._task and self._task is not asyncio.current_task():
            self._task.cancel()
        self.current = None
        self.queue.clear()
