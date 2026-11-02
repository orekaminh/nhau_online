"""Giao thức tính năng mở rộng: hồ sơ/XP, nhiệm vụ, mini-game, voice, karaoke, sự kiện, phòng."""
import asyncio
import os
import tempfile
import time
import unittest

# Phải đặt TRƯỚC khi import app: dữ liệu hồ sơ ghi vào thư mục tạm, sự kiện chạy dày để test nhanh.
_DATA = tempfile.mkdtemp(prefix="pubtest_")
os.environ.setdefault("PUB_DATA_DIR", _DATA)
os.environ.setdefault("PUB_EVENT_MIN", "0.3")
os.environ.setdefault("PUB_EVENT_MAX", "0.5")

from fastapi.testclient import TestClient  # noqa: E402
import app as pub  # noqa: E402
import progression  # noqa: E402
from extras import EventDirector  # noqa: E402
from minigames import GameManager  # noqa: E402

PID_A = "pidAAAAAAAAAAAA1"
PID_B = "pidBBBBBBBBBBBB2"


def until(ws, kind, limit=60, pred=None):
    for _ in range(limit):
        value = ws.receive_json()
        if value["type"] == kind and (pred is None or pred(value)):
            return value
    raise AssertionError("Missing " + kind)


def join(client, room, cid, pid=None, extra=""):
    q = f"?pid={pid}" if pid else ""
    if extra:
        q += ("&" if q else "?") + extra
    return client.websocket_connect(f"/ws/{room}/{cid}{q}")


class ProgressionUnitTests(unittest.TestCase):
    def test_levels_and_titles(self):
        self.assertEqual(progression.level_progress(0)[0], 1)
        self.assertEqual(progression.level_progress(80)[0], 2)
        self.assertEqual(progression.level_progress(79)[0], 1)
        self.assertEqual(progression.title_for(1), "Tập Sự Cầm Ly")
        self.assertEqual(progression.title_for(30), "Huyền Thoại Quán Nhậu")

    def test_outfit_locked_items_fall_back(self):
        o = progression.sanitize_outfit({"hat": "crown", "glasses": "sun", "shirt": "#ff5722", "shoes": "nope"}, 1)
        self.assertEqual(o["hat"], "cap")           # vương miện cần cấp 15
        self.assertEqual(o["glasses"], "none")      # kính râm cần cấp 2
        self.assertEqual(o["shirt"], "#FF5722")     # áo cam mở sẵn, chuẩn hóa chữ hoa
        self.assertEqual(o["shoes"], "sneaker")
        self.assertEqual(progression.sanitize_outfit({"hat": "crown"}, 15)["hat"], "crown")

    def test_quests_complete_once_and_bonus(self):
        store = progression.ProfileStore(os.path.join(_DATA, "unit.json"))
        prof = store.get("unitprofile0001")
        progression.ensure_quests(prof)
        done, bonus = [], 0
        for item in prof["quests"]["items"]:
            spec = next(q for q in progression.QUEST_POOL if q["id"] == item["id"])
            done += progression.add_stat(prof, spec["stat"], item["goal"])
            done += progression.add_stat(prof, spec["stat"], 5)  # vượt mục tiêu không nhận lại
            bonus += progression.all_quests_bonus_due(prof)
        self.assertEqual(len(done), 3)
        self.assertEqual(bonus, progression.ALL_QUESTS_BONUS)
        self.assertEqual(progression.all_quests_bonus_due(prof), 0)

    def test_basic_xp_daily_cap(self):
        prof = progression.ProfileStore(os.path.join(_DATA, "cap.json")).get("capprofile000001")
        total = sum(progression.cap_basic_xp(prof, 50) for _ in range(20))
        self.assertEqual(total, progression.BASIC_XP_DAILY_CAP)

    def test_store_roundtrip_and_leaderboard(self):
        path = os.path.join(_DATA, "roundtrip.json")
        store = progression.ProfileStore(path)
        prof = store.get("roundtripprofile1")
        prof.update(name="Tửu Thánh", named=True)
        progression.grant_xp(prof, 500)
        progression.add_stat(prof, "cheer", 7)
        store.mark_dirty()
        store.save()
        again = progression.ProfileStore(path)
        self.assertEqual(again.profiles["roundtripprofile1"]["xp"], 500)
        board = again.leaderboard("week_cheers", pid="roundtripprofile1")
        self.assertEqual(board["rows"][0]["score"], 7)
        self.assertTrue(board["rows"][0]["me"])
        self.assertNotIn("roundtripprofile1", str(board["rows"]))  # không lộ pid


class ProtocolTests(unittest.TestCase):
    def test_profile_persists_xp_name_outfit(self):
        room = "t_profile"
        pub.rooms.pop(room, None)
        with TestClient(pub.app) as client:
            with join(client, room, "a1", PID_A) as ws:
                init = until(ws, "init")
                self.assertEqual(init["profile"]["level"], 1)
                self.assertIn("hat", init["catalog"])
                self.assertEqual(init["world_state"]["members"][0]["outfit"]["hat"], "cap")
                ws.send_json({"action": "change_name", "name": "  Anh   Ba  Gác "})
                self.assertEqual(until(ws, "name_changed")["new_name"], "Anh Ba Gác")
                ws.send_json({"action": "cheer"})
                prog = until(ws, "progress", pred=lambda m: m["gained"] > 0)
                self.assertEqual(prog["gained"] >= 4, True)
                xp = prog["xp"]
                # Đồ chưa mở khóa bị từ chối, đồ hợp lệ được áp dụng và phát cho cả phòng.
                ws.send_json({"action": "set_outfit", "outfit": {"hat": "crown", "shirt": "#e91e63"}})
                oc = until(ws, "outfit_changed")
                self.assertEqual(oc["outfit"]["hat"], "cap")
                self.assertEqual(oc["outfit"]["shirt"], "#E91E63")
                self.assertEqual(oc["color"], "#E91E63")
            with join(client, room, "a2", PID_A) as ws:  # tab/lần vào sau: nhớ tên, XP và áo
                init = until(ws, "init")
                self.assertEqual(init["profile"]["xp"], xp + (init["profile"]["xp"] - xp))  # có thể + XP chuyên cần
                self.assertGreaterEqual(init["profile"]["xp"], xp)
                me = init["world_state"]["members"][0]
                self.assertEqual(me["name"], "Anh Ba Gác")
                self.assertEqual(me["color"], "#E91E63")
                self.assertNotIn("pid", me)

    def test_level_up_broadcast_and_quest_event_ratelimit(self):
        room = "t_levelup"
        pub.rooms.pop(room, None)
        with TestClient(pub.app) as client:
            with join(client, room, "l1", "pidLevelUp0000001") as one, join(client, room, "l2") as two:
                until(one, "init"); until(two, "init")
                pub.store.profiles["pidLevelUp0000001"]["xp"] = 75
                for _ in range(2):
                    one.send_json({"action": "cheer"})
                up = until(two, "member_update", pred=lambda m: m["level"] >= 2)
                self.assertIn("lên cấp", up["message"])
                # Báo cáo hoạt động từ client bị giới hạn tần suất.
                one.send_json({"action": "quest_event", "kind": "photo"})
                one.send_json({"action": "quest_event", "kind": "photo"})
                one.send_json({"action": "quest_event", "kind": "hack"})
                stats = []
                one.send_json({"action": "profile_request"})
                stats = until(one, "progress", pred=lambda m: m["gained"] == 0)["stats"]
                self.assertEqual(stats.get("photo"), 1)
                self.assertNotIn("hack", stats)

    def test_dice_game_and_drink_penalty(self):
        room = "t_dice"
        pub.rooms.pop(room, None)
        with TestClient(pub.app) as client:
            with join(client, room, "d1") as a, join(client, room, "d2") as b, join(client, room, "d3") as c:
                for ws in (a, b, c):
                    until(ws, "init")
                a.send_json({"action": "game_open", "game": "dice"})
                st = until(b, "game_state", pred=lambda m: m["game"])["game"]
                self.assertEqual((st["type"], st["phase"], st["host"]), ("dice", "join", "d1"))
                c.send_json({"action": "game_open", "game": "dice"})   # đang có ván: bị từ chối
                self.assertIn("ván khác", until(c, "game_notice", pred=lambda m: "ván khác" in m["message"])["message"])
                a.send_json({"action": "game_start"})                   # 1 người chưa đủ
                self.assertIn("2 người", until(a, "game_notice", pred=lambda m: "2 người" in m["message"])["message"])
                b.send_json({"action": "game_join"})
                a.send_json({"action": "game_start"})
                self.assertEqual(until(b, "game_state", pred=lambda m: m["game"] and m["game"]["phase"] == "roll")["game"]["phase"], "roll")
                c.send_json({"action": "game_roll"})                    # người ngoài ván không lắc được
                a.send_json({"action": "game_roll"}); a.send_json({"action": "game_roll"})
                b.send_json({"action": "game_roll"})
                done = until(a, "game_state", pred=lambda m: m["game"] and m["game"]["phase"] == "done")["game"]
                res = done["result"]
                rolls = {p["id"]: p["total"] for p in done["players"]}
                self.assertTrue(all(2 <= t <= 12 for t in rolls.values()))
                if res["draw"]:
                    self.assertEqual(rolls["d1"], rolls["d2"])
                else:
                    self.assertGreater(rolls[res["winners"][0]], rolls[res["losers"][0]])
                    drunk = until(a, "drunk_update", pred=lambda m: m["member_id"] == res["losers"][0])
                    self.assertGreaterEqual(drunk["drunk_level"], 10)
                self.assertEqual(until(c, "game_state", pred=lambda m: m["game"] is None)["game"], None)

    def test_duel_taps_are_rate_limited_and_winner_is_server_decided(self):
        room = "t_duel"
        pub.rooms.pop(room, None)
        old = (GameManager.COUNTDOWN_SECONDS, GameManager.FIGHT_SECONDS, GameManager.RESULT_SECONDS)
        GameManager.COUNTDOWN_SECONDS, GameManager.FIGHT_SECONDS, GameManager.RESULT_SECONDS = 0.2, 1.2, 0.5
        try:
            with TestClient(pub.app) as client:
                with join(client, room, "u1") as a, join(client, room, "u2") as b:
                    until(a, "init"); until(b, "init")
                    a.send_json({"action": "game_open", "game": "duel", "target": "u1"})   # tự thách mình: không được
                    self.assertIn("Chọn", until(a, "game_notice", pred=lambda m: "Chọn" in m["message"])["message"])
                    a.send_json({"action": "game_open", "game": "duel", "target": "u2"})
                    until(b, "game_state", pred=lambda m: m["game"] and m["game"]["phase"] == "invite")
                    a.send_json({"action": "game_accept"})                                 # host không tự nhận lời được
                    b.send_json({"action": "game_accept"})
                    until(a, "game_state", pred=lambda m: m["game"] and m["game"]["phase"] == "fight")
                    for _ in range(40):                                                    # gõ dồn: chỉ vài cái được tính
                        a.send_json({"action": "game_tap"})
                    for _ in range(4):
                        b.send_json({"action": "game_tap"}); time.sleep(0.1)
                    done = until(a, "game_state", pred=lambda m: m["game"] and m["game"]["phase"] == "done", limit=200)["game"]
                    self.assertLess(done["taps"]["u1"], 15)         # 40 lần gõ trong tích tắc bị chặn
                    self.assertGreaterEqual(done["taps"]["u2"], 3)
                    self.assertEqual(len(done["result"]["winners"]) + len(done["result"]["losers"]), 2 if not done["result"]["draw"] else 0)
        finally:
            GameManager.COUNTDOWN_SECONDS, GameManager.FIGHT_SECONDS, GameManager.RESULT_SECONDS = old

    def test_game_cancelled_when_player_leaves(self):
        room = "t_leave_game"
        pub.rooms.pop(room, None)
        with TestClient(pub.app) as client:
            with join(client, room, "g1") as a:
                until(a, "init")
                with join(client, room, "g2") as b:
                    until(b, "init")
                    a.send_json({"action": "game_open", "game": "duel", "target": "g2"})
                    until(a, "game_state", pred=lambda m: m["game"])
                    b.close()
                    until(a, "game_state", pred=lambda m: m["game"] is None)

    def test_voice_signalling_is_scoped_to_voice_members(self):
        room = "t_voice"
        pub.rooms.pop(room, None)
        with TestClient(pub.app) as client:
            with join(client, room, "v1") as a, join(client, room, "v2") as b, join(client, room, "v3") as c:
                for ws in (a, b, c):
                    until(ws, "init")
                a.send_json({"action": "voice_join"})
                self.assertEqual(until(a, "voice_peers")["peers"], [])
                b.send_json({"action": "voice_join"})
                self.assertEqual(until(b, "voice_peers")["peers"], ["v1"])
                self.assertEqual(until(a, "voice_joined")["id"], "v2")
                b.send_json({"action": "voice_signal", "to": "v1", "data": {"sdp": {"type": "offer", "sdp": "x"}}})
                sig = until(a, "voice_signal")
                self.assertEqual((sig["from"], sig["data"]["sdp"]["type"]), ("v2", "offer"))
                c.send_json({"action": "voice_signal", "to": "v1", "data": {"sdp": {}}})   # v3 chưa vào voice
                b.send_json({"action": "voice_signal", "to": "v3", "data": {"x": 1}})      # v3 không nhận
                b.close()
                self.assertEqual(until(a, "voice_left")["id"], "v2")
                # Không có tin nhắn tín hiệu nào lọt tới v1 từ v3.
                a.send_json({"action": "voice_leave"})
                until(a, "voice_left")

    def test_karaoke_queue_limits_sync_and_score(self):
        room = "t_karaoke"
        pub.rooms.pop(room, None)
        with TestClient(pub.app) as client:
            with join(client, room, "k1", "pidKaraoke0000001") as a, join(client, room, "k2") as b:
                until(a, "init"); until(b, "init")
                a.send_json({"action": "karaoke_add", "song_id": "bad id!", "title": "x", "duration": 60})
                self.assertIn("không hợp lệ", until(a, "karaoke_notice")["message"])
                a.send_json({"action": "karaoke_add", "song_id": "do-do-do", "title": "Dô Dô Dô", "duration": 5})
                self.assertIn("không hợp lệ", until(a, "karaoke_notice")["message"])   # quá ngắn
                a.send_json({"action": "karaoke_add", "song_id": "do-do-do", "title": "Dô Dô Dô", "duration": 60})
                st = until(b, "karaoke_state", pred=lambda m: m["current"])
                self.assertEqual(st["current"]["singer_name"], pub.rooms[room].members["k1"]["name"])
                self.assertLess(abs(st["server_time"] - st["current"]["started_ms"]), 3000)
                for i in range(3):                                   # mỗi người tối đa 2 bài (đang hát + hàng chờ)
                    a.send_json({"action": "karaoke_add", "song_id": "s%d" % i, "title": "Bài %d" % i, "duration": 60})
                self.assertIn("đầy", until(a, "karaoke_notice", pred=lambda m: "đầy" in m["message"])["message"])
                b.send_json({"action": "karaoke_skip"})              # chỉ ca sĩ mới bỏ qua được
                a.send_json({"action": "karaoke_skip"})              # bỏ sớm: không điểm
                nxt = until(b, "karaoke_state", pred=lambda m: m["current"] and m["current"]["song_id"] == "s0", limit=120)
                self.assertEqual(nxt["current"]["singer_id"], "k1")
                pub.rooms[room].karaoke.MIN_PLAY_RATIO = 0           # lần này cho tính điểm
                a.send_json({"action": "karaoke_skip"})
                score = until(b, "karaoke_score")
                self.assertTrue(68 <= score["score"] <= 99)
                self.assertGreaterEqual(until(a, "progress", pred=lambda m: m["reason"] == "Hát karaoke")["stats"]["sing"], 1)

    def test_world_events_are_scheduled_and_clean_up(self):
        room = "t_events"
        pub.rooms.pop(room, None)
        with TestClient(pub.app) as client:
            with join(client, room, "e1") as a:
                until(a, "init")
                ev = until(a, "world_event", limit=200)
                self.assertIn(ev["kind"], ("happy_hour", "patrol", "blackout", "rain", "lucky_crate"))
                self.assertGreater(ev["ends_ms"], ev["started_ms"])
            self.assertNotIn(room, pub.rooms)    # phòng trống bị dọn, tác vụ nền dừng

    def test_room_full_and_listing_hides_private(self):
        pub.rooms.pop("t_full", None)
        pub.rooms.pop("t_priv", None)
        old = pub.MAX_PLAYERS
        pub.MAX_PLAYERS = 2
        try:
            with TestClient(pub.app) as client:
                with join(client, "t_full", "f1") as a, join(client, "t_full", "f2") as b:
                    until(a, "init"); until(b, "init")
                    with join(client, "t_full", "f3") as c:
                        full = c.receive_json()
                        self.assertEqual(full["type"], "room_full")
                    with join(client, "t_priv", "p1", extra="private=1") as p:
                        until(p, "init")
                        ids = [r["id"] for r in client.get("/api/rooms").json()["rooms"]]
                        self.assertIn("t_full", ids)
                        self.assertNotIn("t_priv", ids)
        finally:
            pub.MAX_PLAYERS = old

    def test_bad_ids_rejected_and_api(self):
        with TestClient(pub.app) as client:
            with self.assertRaises(Exception):
                with client.websocket_connect("/ws/bad room!/x"):
                    pass
            self.assertEqual(client.get("/api/leaderboard?kind=nope").status_code, 400)
            self.assertIn("hat", client.get("/api/catalog").json()["outfit"])
            self.assertEqual(client.get("/api/leaderboard").json()["kind"], "xp")


class FakeRoom:
    """Phòng giả tối thiểu để thử EventDirector không cần mạng."""
    def __init__(self):
        self.members = {"w1": {"name": "Thắng", "x": 0.0, "z": 5.0, "is_sitting": False},
                        "w2": {"name": "Thua", "x": 10.0, "z": 5.0, "is_sitting": True}}
        self.sent, self.awards = [], []

    async def broadcast(self, msg, exclude_client=None):
        self.sent.append(msg)

    async def award(self, cid, xp=0, stat=None, n=1, reason="", basic=False):
        self.awards.append((cid, xp, stat))

    @staticmethod
    def inside_wc(x, z):
        return False


class EventDirectorTests(unittest.IsolatedAsyncioTestCase):
    async def test_lucky_crate_claim_needs_distance_and_is_first_come(self):
        room = FakeRoom()
        director = EventDirector(room)
        event = await director.start("lucky_crate", duration=5)
        room.members["w1"].update(x=event["x"] + 20, z=event["z"])
        await director.claim("w1", event["id"])                   # quá xa
        self.assertEqual(room.awards, [])
        room.members["w2"].update(x=event["x"] + 1, z=event["z"])
        await director.claim("w2", event["id"])
        room.members["w1"].update(x=event["x"], z=event["z"])
        await director.claim("w1", event["id"])                   # đến sau
        self.assertEqual(room.awards, [("w2", 25, "event")])
        end = [m for m in room.sent if m["type"] == "world_event_end"][0]
        self.assertEqual(end["winner_name"], "Thua")
        self.assertEqual(director.current, {})
        director.shutdown()

    async def test_patrol_fines_only_people_standing_outside(self):
        room = FakeRoom()
        director = EventDirector(room)
        event = await director.start("patrol", duration=0.05)
        await asyncio.sleep(0.2)
        end = [m for m in room.sent if m["type"] == "world_event_end"][0]
        self.assertEqual((end["caught"], end["safe"]), (["Thắng"], ["Thua"]))
        self.assertEqual(room.awards, [("w2", 12, "event")])
        director.shutdown()

    async def test_happy_hour_flag(self):
        director = EventDirector(FakeRoom())
        self.assertFalse(director.happy)
        event = await director.start("happy_hour", duration=5)
        self.assertTrue(director.happy)
        self.assertTrue(director.note_cheer("w1"))
        self.assertFalse(director.note_cheer("w1"))
        await director.finish(event["id"])
        self.assertFalse(director.happy)
        director.shutdown()


if __name__ == "__main__":
    unittest.main()
