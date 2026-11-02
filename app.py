import asyncio
import json
import random
import os
import time
from typing import Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI(title="Phòng Nhậu Ảo 3D - Quán Nhậu 1 2 3 DÔ")

# Mount static folder
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

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

class Pub3DRoom:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.clients: Dict[str, WebSocket] = {}
        self.members: Dict[str, dict] = {}
        self.snack_plates: Dict[int, int] = {0: 100, 1: 100} # 2 bàn nhậu, mỗi bàn 1 đĩa mồi
        self.total_cheers: int = 0

    def add_member(self, client_id: str, ws: WebSocket, nickname: str = None) -> dict:
        self.clients[client_id] = ws
        color_idx = len(self.members) % len(AVATAR_COLORS)
        
        # Spawn ngẫu nhiên quanh khu vực vỉa hè
        spawn_x = random.uniform(-4, 4)
        spawn_z = random.uniform(2, 6)

        member = {
            "id": client_id,
            "name": nickname or random.choice(FUNNY_NICKNAMES),
            "color": AVATAR_COLORS[color_idx],
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
        }
        self.members[client_id] = member
        return member

    def remove_member(self, client_id: str):
        if client_id in self.clients:
            del self.clients[client_id]
        if client_id in self.members:
            del self.members[client_id]

    async def broadcast(self, message: dict, exclude_client: str = None):
        text = json.dumps(message)
        dead_clients = []
        for cid, ws in self.clients.items():
            if cid == exclude_client:
                continue
            try:
                await ws.send_text(text)
            except Exception:
                dead_clients.append(cid)
        for cid in dead_clients:
            self.remove_member(cid)

    def get_state(self):
        return {
            "room_id": self.room_id,
            "members": list(self.members.values()),
            "snack_plates": self.snack_plates,
            "total_cheers": self.total_cheers,
        }

rooms: Dict[str, Pub3DRoom] = {}

def get_or_create_room(room_id: str) -> Pub3DRoom:
    if room_id not in rooms:
        rooms[room_id] = Pub3DRoom(room_id)
    return rooms[room_id]

@app.get("/")
async def get_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/style.css")
async def get_style():
    return FileResponse(os.path.join(STATIC_DIR, "style.css"))

@app.get("/app.js")
async def get_script():
    return FileResponse(os.path.join(STATIC_DIR, "app.js"))

@app.websocket("/ws/{room_id}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    await websocket.accept()
    room = get_or_create_room(room_id)
    member = room.add_member(client_id, websocket)

    # Gửi toàn bộ trạng thái thế giới 3D cho người mới vào
    await websocket.send_text(json.dumps({
        "type": "init",
        "self_id": client_id,
        "world_state": room.get_state()
    }))

    # Báo cho các người chơi khác trong thế giới 3D
    await room.broadcast({
        "type": "member_joined",
        "member": member,
        "message": f"🍻 {member['name']} vừa bước vào quán nhậu vỉa hè!"
    }, exclude_client=client_id)

    try:
        while True:
            raw_data = await websocket.receive_text()
            data = json.loads(raw_data)
            action = data.get("action")

            if action == "move":
                # Đồng bộ vị trí 3D di chuyển
                if client_id in room.members:
                    mem = room.members[client_id]
                    if not mem["is_sitting"] and mem["status"] != "guc_nga":
                        mem["x"] = float(data.get("x", mem["x"]))
                        mem["y"] = float(data.get("y", 0))
                        mem["z"] = float(data.get("z", mem["z"]))
                        mem["ry"] = float(data.get("ry", mem["ry"]))
                        mem["is_walking"] = bool(data.get("is_walking", False))

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
                table_id = int(data.get("table_id", 0))
                seat_id = int(data.get("seat_id", 0))
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
                    if mem["drunk_level"] >= 100:
                        mem["status"] = "guc_nga"
                    elif mem["drunk_level"] >= 65:
                        mem["status"] = "say_mem"
                    elif mem["drunk_level"] >= 30:
                        mem["status"] = "lang_lang"

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

            elif action == "refill_snack":
                tid = int(data.get("table_id", 0))
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

            elif action == "pee":
                # Tính năng xả lũ / đái bậy / đi WC
                spot_type = data.get("spot_type", "tree") # wc | tree | wall
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

            elif action == "quick_shout":
                shout = data.get("text", "Dô nào anh em!")
                if client_id in room.members:
                    mem = room.members[client_id]
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
                new_name = data.get("name", "").strip()
                if new_name and client_id in room.members:
                    old_name = room.members[client_id]["name"]
                    room.members[client_id]["name"] = new_name[:25]
                    await room.broadcast({
                        "type": "name_changed",
                        "member_id": client_id,
                        "new_name": room.members[client_id]["name"],
                        "message": f"📝 {old_name} đổi tên thành '{room.members[client_id]['name']}'"
                    })

    except WebSocketDisconnect:
        left_mem = room.members.get(client_id)
        room.remove_member(client_id)
        if left_mem:
            await room.broadcast({
                "type": "member_left",
                "member_id": client_id,
                "message": f"👋 {left_mem['name']} đã đứng dậy rời quán về ngủ!"
            })
    except Exception:
        room.remove_member(client_id)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=port)
