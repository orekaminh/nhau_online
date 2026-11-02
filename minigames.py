"""Mini-game bàn nhậu: Xúc xắc "thua thì uống" và Thi tửu lượng (gõ nhanh).

Mỗi phòng có tối đa một ván đang chạy. Server là bên duy nhất quyết định kết quả:
client chỉ gửi ý định (tham gia, lắc, gõ) và hiển thị `game_state` do server phát.
"""
import asyncio
import random
import time

DICE_MAX_PLAYERS = 8


def now_ms() -> int:
    return int(time.time() * 1000)


class GameManager:
    # Có thể chỉnh trong test cho chạy nhanh.
    JOIN_SECONDS = 25
    ROLL_SECONDS = 12
    INVITE_SECONDS = 15
    COUNTDOWN_SECONDS = 3
    FIGHT_SECONDS = 8
    RESULT_SECONDS = 8
    TAP_MIN_GAP = 0.06

    def __init__(self, room):
        self.room = room
        self.game = None
        self._tasks = set()
        self._tap_times = {}

    # ------------------------------------------------------------ tiện ích
    def view(self):
        g = self.game
        if not g:
            return None
        names = {cid: self.room.members[cid]["name"] for cid in g["names"] if cid in self.room.members}
        names.update({cid: n for cid, n in g["names"].items() if cid not in names})
        out = {"id": g["id"], "type": g["type"], "phase": g["phase"], "host": g["host"], "names": names,
               "deadline_ms": g.get("deadline_ms"), "result": g.get("result")}
        if g["type"] == "dice":
            out["players"] = [{"id": cid, "name": names.get(cid, "?"), "roll": p["roll"],
                               "total": sum(p["roll"]) if p["roll"] else None}
                              for cid, p in g["players"].items()]
        else:
            out.update(target=g["target"], taps=g["taps"], starts_ms=g.get("starts_ms"), ends_ms=g.get("ends_ms"))
        return out

    async def push(self):
        await self.room.broadcast({"type": "game_state", "game": self.view()})

    async def notice(self, cid, message):
        await self.room.send(cid, {"type": "game_notice", "message": message})

    def _spawn(self, coro):
        task = asyncio.ensure_future(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    def _cancel_timers(self):
        current = asyncio.current_task()
        for task in list(self._tasks):
            if task is not current:
                task.cancel()
        self._tasks.clear()

    async def _end(self, message=None):
        """Dọn ván hiện tại và báo cho mọi người."""
        self._cancel_timers()
        self.game = None
        self._tap_times.clear()
        await self.push()
        if message:
            await self.room.broadcast({"type": "game_notice", "message": message})

    def involves(self, cid):
        g = self.game
        if not g:
            return False
        return cid in g["players"] if g["type"] == "dice" else cid in (g["host"], g["target"])

    async def on_member_left(self, cid):
        g = self.game
        if not g or not self.involves(cid):
            return
        if g["type"] == "dice" and g["phase"] != "done":
            g["players"].pop(cid, None)
            if cid == g["host"] or len(g["players"]) < 2 and g["phase"] != "join":
                await self._end("🎲 Ván xúc xắc bị hủy vì có người rời bàn.")
            else:
                await self.push()
        elif g["type"] == "duel" and g["phase"] != "done":
            await self._end("🥊 Ván thi tửu lượng bị hủy vì đối thủ đã rời quán.")

    # ------------------------------------------------------------ điều phối
    async def handle(self, cid, action, data):
        room = self.room
        if cid not in room.members:
            return
        if action == "game_open":
            await self._open(cid, data)
        elif not self.game:
            if action in ("game_join", "game_start", "game_roll", "game_accept", "game_tap"):
                await self.notice(cid, "Hiện chưa có ván nào. Hãy mở ván mới nhé!")
        elif action == "game_cancel":
            if cid == self.game["host"] and self.game["phase"] != "done":
                await self._end("Chủ ván đã hủy ván chơi.")
        elif self.game["type"] == "dice":
            await self._dice(cid, action)
        else:
            await self._duel(cid, action)

    async def _open(self, cid, data):
        room = self.room
        if self.game:
            await self.notice(cid, "Quán đang có ván khác, đợi xong rồi mở ván mới nhé!")
            return
        kind = data.get("game")
        mem = room.members[cid]
        if mem["status"] == "guc_nga":
            await self.notice(cid, "Bạn đang gục rồi, tỉnh táo lại đã!")
            return
        gid = f"g{random.randrange(16**6):06x}"
        if kind == "dice":
            self.game = {"id": gid, "type": "dice", "phase": "join", "host": cid, "names": {cid: mem["name"]},
                         "players": {cid: {"roll": None}}, "deadline_ms": now_ms() + int(self.JOIN_SECONDS * 1000), "result": None}
            self._spawn(self._dice_join_timer(gid))
            await room.broadcast({"type": "game_notice", "message": f"🎲 {mem['name']} mở ván Xúc Xắc — thua thì uống! Vào chơi đi anh em!"})
        elif kind == "duel":
            target = data.get("target")
            tmem = room.members.get(target) if isinstance(target, str) else None
            if not tmem or target == cid:
                await self.notice(cid, "Chọn một người đang trong quán để thách đấu.")
                return
            if tmem["status"] == "guc_nga":
                await self.notice(cid, f"{tmem['name']} đang gục rồi, tha cho người ta!")
                return
            self.game = {"id": gid, "type": "duel", "phase": "invite", "host": cid, "target": target,
                         "names": {cid: mem["name"], target: tmem["name"]}, "players": {cid: {}, target: {}},
                         "taps": {cid: 0, target: 0}, "deadline_ms": now_ms() + int(self.INVITE_SECONDS * 1000), "result": None}
            self._spawn(self._invite_timer(gid))
            await room.broadcast({"type": "game_notice", "message": f"🥊 {mem['name']} thách {tmem['name']} thi tửu lượng!"})
        else:
            await self.notice(cid, "Trò chơi này chưa có.")
            return
        await self.push()

    # ------------------------------------------------------------ xúc xắc
    async def _dice(self, cid, action):
        g = self.game
        if action == "game_join":
            if g["phase"] != "join":
                await self.notice(cid, "Ván đã bắt đầu rồi, chờ ván sau nhé!")
            elif cid not in g["players"] and len(g["players"]) < DICE_MAX_PLAYERS:
                g["players"][cid] = {"roll": None}
                g["names"][cid] = self.room.members[cid]["name"]
                await self.push()
        elif action == "game_leave":
            if cid in g["players"] and g["phase"] == "join":
                if cid == g["host"]:
                    await self._end("Chủ ván đã rời bàn, ván xúc xắc bị hủy.")
                else:
                    g["players"].pop(cid)
                    await self.push()
        elif action == "game_start":
            if cid != g["host"] or g["phase"] != "join":
                return
            if len(g["players"]) < 2:
                await self.notice(cid, "Cần ít nhất 2 người để chơi xúc xắc.")
                return
            await self._dice_begin_roll()
        elif action == "game_roll":
            if g["phase"] != "roll" or cid not in g["players"] or g["players"][cid]["roll"]:
                return
            g["players"][cid]["roll"] = [random.randint(1, 6), random.randint(1, 6)]
            if all(p["roll"] for p in g["players"].values()):
                await self._dice_resolve()
            else:
                await self.push()

    async def _dice_join_timer(self, gid):
        await asyncio.sleep(self.JOIN_SECONDS)
        g = self.game
        if g and g["id"] == gid and g["phase"] == "join":
            if len(g["players"]) >= 2:
                await self._dice_begin_roll()
            else:
                await self._end("🎲 Không đủ người chơi xúc xắc, ván bị hủy.")

    async def _dice_begin_roll(self):
        g = self.game
        g["phase"] = "roll"
        g["deadline_ms"] = now_ms() + int(self.ROLL_SECONDS * 1000)
        self._cancel_timers()
        self._spawn(self._dice_roll_timer(g["id"]))
        await self.push()

    async def _dice_roll_timer(self, gid):
        await asyncio.sleep(self.ROLL_SECONDS)
        g = self.game
        if g and g["id"] == gid and g["phase"] == "roll":
            await self._dice_resolve()

    async def _dice_resolve(self):
        g = self.game
        self._cancel_timers()
        for p in g["players"].values():
            if not p["roll"]:
                p["roll"] = [random.randint(1, 6), random.randint(1, 6)]  # không lắc thì server lắc hộ
        totals = {cid: sum(p["roll"]) for cid, p in g["players"].items()}
        high, low = max(totals.values()), min(totals.values())
        draw = high == low
        winners = [] if draw else [c for c, t in totals.items() if t == high]
        losers = [] if draw else [c for c, t in totals.items() if t == low]
        drink = 3 if len(losers) == 1 else 2
        g["phase"] = "done"
        g["deadline_ms"] = now_ms() + int(self.RESULT_SECONDS * 1000)
        g["result"] = {"winners": winners, "losers": losers, "drink": drink if losers else 0, "draw": draw}
        await self.push()
        names = [self.room.members[c]["name"] for c in losers if c in self.room.members]
        if draw:
            msg = "🎲 Hòa nhau tất cả! Không ai phải uống, nhưng uống thêm một ly cho vui!"
        else:
            msg = f"🎲 {', '.join(names)} thua — uống {drink} ly! Người thắng: {', '.join(self.room.members[c]['name'] for c in winners if c in self.room.members)}."
        await self.room.broadcast({"type": "game_notice", "message": msg})
        for cid in g["players"]:
            if cid not in self.room.members:
                continue
            await self.room.award(cid, 8, "game_play", reason="Tham gia xúc xắc")
            if cid in winners:
                await self.room.award(cid, 30, "game_win", reason="Thắng xúc xắc")
            if cid in losers:
                await self.room.drink(cid, drink)
        self._spawn(self._clear_later(g["id"]))

    # ------------------------------------------------------------ thi tửu lượng
    async def _duel(self, cid, action):
        g = self.game
        if action == "game_decline":
            if cid == g["target"] and g["phase"] == "invite":
                await self._end(f"🥊 {self.room.members[cid]['name']} từ chối, chê đối thủ yếu!")
        elif action == "game_accept":
            if cid != g["target"] or g["phase"] != "invite":
                return
            self._cancel_timers()
            g["phase"] = "count"
            g["starts_ms"] = now_ms() + int(self.COUNTDOWN_SECONDS * 1000)
            g["ends_ms"] = g["starts_ms"] + int(self.FIGHT_SECONDS * 1000)
            g["deadline_ms"] = g["ends_ms"]
            self._spawn(self._fight_timer(g["id"]))
            await self.push()
        elif action == "game_tap":
            if g["phase"] != "fight" or cid not in g["taps"]:
                return
            t = time.monotonic()
            if t - self._tap_times.get(cid, 0) < self.TAP_MIN_GAP:
                return
            self._tap_times[cid] = t
            g["taps"][cid] += 1

    async def _invite_timer(self, gid):
        await asyncio.sleep(self.INVITE_SECONDS)
        g = self.game
        if g and g["id"] == gid and g["phase"] == "invite":
            await self._end("🥊 Hết giờ, đối thủ không nhận lời thách đấu.")

    async def _fight_timer(self, gid):
        await asyncio.sleep(self.COUNTDOWN_SECONDS)
        g = self.game
        if not g or g["id"] != gid:
            return
        g["phase"] = "fight"
        await self.push()
        end = time.monotonic() + self.FIGHT_SECONDS
        while time.monotonic() < end:
            await asyncio.sleep(0.5)
            if not self.game or self.game["id"] != gid:
                return
            await self.room.broadcast({"type": "game_progress", "id": gid, "taps": dict(g["taps"])})
        await self._duel_resolve()

    async def _duel_resolve(self):
        g = self.game
        a, b = g["host"], g["target"]
        ta, tb = g["taps"][a], g["taps"][b]
        draw = ta == tb
        winner = None if draw else (a if ta > tb else b)
        loser = None if draw else (b if winner == a else a)
        g["phase"] = "done"
        g["deadline_ms"] = now_ms() + int(self.RESULT_SECONDS * 1000)
        g["result"] = {"winners": [winner] if winner else [], "losers": [loser] if loser else [], "draw": draw,
                       "drink": 0 if draw else 2}
        await self.push()
        names = g["names"]
        msg = (f"🥊 Hòa nhau {ta}-{tb}! Hai bên cùng uống mừng." if draw
               else f"🥊 {names[winner]} thắng {max(ta, tb)}-{min(ta, tb)}! {names[loser]} uống phạt 2 ly!")
        await self.room.broadcast({"type": "game_notice", "message": msg})
        for cid in (a, b):
            if cid not in self.room.members:
                continue
            await self.room.award(cid, 10, "game_play", reason="Thi tửu lượng")
        if winner and winner in self.room.members:
            await self.room.award(winner, 35, "game_win", reason="Thắng thi tửu lượng")
        if draw:
            for cid in (a, b):
                await self.room.drink(cid, 1)
        elif loser in self.room.members:
            await self.room.drink(loser, 2)
        self._spawn(self._clear_later(g["id"]))

    async def _clear_later(self, gid):
        await asyncio.sleep(self.RESULT_SECONDS)
        if self.game and self.game["id"] == gid:
            self.game = None
            self._tap_times.clear()
            await self.push()

    def shutdown(self):
        self._cancel_timers()
        self.game = None
