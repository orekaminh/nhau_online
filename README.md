# 🍻 QUÁN NHẬU ẢO 3D - BỐI CẢNH PHỐ ĐÊM SÀI GÒN & BỜ SÔNG LANDMARK 81 🌆
*(Phiên bản Phố Nhậu Sài Gòn Đích Thực: WC, Karaoke VIP, Massage, Cột Điện Búi Dây & Đái Bậy Gốc Cây!)*

---

## 🚀 Bản nâng cấp "Giữ chân người chơi"

Bấm nút **☰ Menu** (góc phải trên) để mở mọi tính năng bên dưới.

### 1. 🪪 Hồ sơ, cấp bậc, nhiệm vụ ngày, tủ đồ (phím `I`)
- Tên, XP, cấp bậc, tủ đồ được **lưu lại** theo trình duyệt (mã hồ sơ ẩn danh trong `localStorage`) tại `data/profiles.json` trên server. Đổi tên một lần là nhớ mãi.
- **Cấp bậc & danh hiệu:** Tập Sự Cầm Ly → Bợm Nhậu Vỉa Hè → Cao Thủ Rót Tràn → Thánh Nhậu Quận 1 → Chiến Thần Nghìn Ly → Tửu Thánh Sài Gòn → Huyền Thoại Quán Nhậu. Danh hiệu hiện dưới tên trên đầu mỗi người.
- **3 nhiệm vụ mỗi ngày** (cụng ly, thắng mini-game, hát karaoke, chụp ảnh...) + thưởng thêm nếu làm đủ cả 3 + thưởng chuyên cần khi vào quán nhiều ngày liên tiếp. XP từ hành động lặp lại bị giới hạn mỗi ngày để không thể cày vô tận.
- **Tủ đồ:** đổi mũ (nón lá, nón cối, mũ len, mũ phớt, vương miện), kính, khăn rằn/vòng hoa/dây chuyền, dép tổ ong/bốt, màu áo. Lên cấp để mở khóa; mọi người trong phòng đều thấy.
- **Bảng xếp hạng** (phím `L`): tổng XP, cụng ly tuần, thắng mini-game tuần, ca sĩ tuần.

### 2. 🎲 Mini-game bàn nhậu (phím `G`) & phòng có mã
- **Xúc xắc "thua thì uống":** 2–8 người, tổng thấp nhất uống phạt (độ say tăng thật).
- **Thi tửu lượng 1-1:** thách một người, 8 giây gõ nút "Dô" (hoặc `Space`), người thua uống phạt. Server tự quyết kết quả và giới hạn tốc độ gõ nên không thể gian lận bằng macro.
- **Phòng có mã 4 ký tự**, phòng riêng tư (không hiện trong danh sách), danh sách phòng đang mở, tối đa 12 người/phòng (`PUB_MAX_PLAYERS`). Menu → *Phòng chơi*.

### 3. 🎙️ Voice chat, ⚡ sự kiện ngẫu nhiên, 📸 chụp ảnh chia sẻ
- **Voice chat** (phím `M`): WebRTC trực tiếp giữa người chơi (tối đa 6 người nói cùng lúc), có chế độ chỉ nghe, tắt tiếng, nhấn giữ `T` để nói. Cần HTTPS (link Cloudflare đã có) hoặc `localhost`, và quyền micro. Mạng công ty/NAT chặt có thể không thông (chưa dùng máy chủ TURN).
- **Sự kiện ngẫu nhiên** mỗi 1,5–3 phút: 🍻 Happy Hour (XP x2), 🚨 Dân phòng tuýt còi (ngồi ghế/trốn WC để né phạt), 🔌 mất điện, 🌧️ mưa Sài Gòn, 🎁 thùng bia may mắn (ai chạm trước nhận XP).
- **Chụp ảnh** (phím `C`): ẩn giao diện, selfie, giơ ly, khung có tên + cấp bậc mọi người trong ảnh; tải về hoặc chia sẻ thẳng lên Zalo/Facebook (điện thoại).

### 4. 🎤 Karaoke thật (phím `K`)
- Quán **Karaoke 69** có màn hình LED lời bài hát ngay trên mặt tiền, nhạc phát ra từ tòa nhà (đứng càng gần càng to), **đồng bộ cho cả phòng** theo giờ server, có hàng chờ đặt bài.
- 4 bài có sẵn với lời tự sáng tác và nhạc nền tạo bằng Web Audio (pop-ska, ballad, bolero, vinahey) cùng "nhạc nền quán". Bật mic để cả quán nghe bạn hát.
- **Thêm nhạc thật:** bỏ file `.mp3` (+ `.lrc` lời chạy) vào `static/music/` rồi khai báo trong `static/music/playlist.json` (xem `static/music/README.txt`). Chỉ dùng nhạc bạn có quyền sử dụng.

### 5. ⚡ Vào nhanh & chế độ nhẹ
- **Màn hình chờ** hiện ngay lập tức, các cảnh nặng (sông, Landmark 81, công viên) được dựng **sau** khung hình đầu tiên; HDRI và bản đồ chi tiết mặt đường (~5MB) tải nền; bỏ các script hậu kỳ không dùng. Server nén gzip và cache lâu cho ảnh/thư viện.
- **Chế độ nhẹ** tự bật trên máy yếu (ít RAM/CPU, tiết kiệm dữ liệu) hoặc tự gợi ý khi FPS thấp; bật/tắt tay trong Menu. Giảm độ phân giải, tắt bóng đổ, HDRI và bản đồ chi tiết.

### Chạy thử & kiểm thử
```
python app.py                                   # http://localhost:8000
python -m unittest tests.test_features_protocol tests.test_social_protocol
```
Biến môi trường: `PORT`, `PUB_DATA_DIR` (nơi lưu hồ sơ), `PUB_MAX_PLAYERS`, `PUB_EVENT_MIN` / `PUB_EVENT_MAX` (giây giữa các sự kiện, mặc định 90/170).

---

## 🌟 Những Tính Năng Mới "Đậm Chất Sài Gòn":

### 1. 🚽 WC Quán Nhậu & Tính Năng "Đái Bậy Gốc Cây / Bờ Tường" ([P]):
- **Thanh Bọng Đái (Bladder Meter):** Mỗi khi cụng ly nốc bia, bọng đái căng dần (+15-25%). Khi đạt 100% bọng đái căng tức, nhân vật rất cần xả lũ!
- **WC Nhà Vệ Sinh Chính Thống:** Góc hông quán có cửa sáng đèn biển hiệu `[WC 🚹🚺]`. Đi lại gần bấm **`[P]`** để vào xả sạch êm ái, an toàn.
- **Tính năng "Đái Bậy Gốc Cây Công Viên" & "Bờ Tường Hẻm":**
  - Đi ra các **gốc cây trong công viên bờ sông** (có bồn xi măng vỉa hè) hoặc bờ tường có biển *"🚫 CẤM ĐÁI BẬY - CAMERA PHẠT 500K"* -> Màn hình hiện prompt bấm **`[P]`** để xả lũ!
  - Hiệu ứng âm thanh nước chảy `róc rách` chân thực và tia nước hạt vàng bắn tung tóe.
  - Xả bọng đái về 0% và hạ bớt độ say!
  - 🚨 **Cơ chế rủi ro:** 28% tỷ lệ bị *Dân phòng / Tổ dân phố tuýt còi phạt 300.000đ* bêu tên lên màn hình!

### 2. 🎤 Quán Karaoke 69 VIP & 💆 Tiệm Massage Ánh Sao:
- **KARAOKE 69 VIP (Bên phải quán):** Tòa nhà phố đêm rực rỡ với bảng hiệu LED neon tím hồng nhấp nháy, đèn rọi xoay đổi màu, thảm đỏ đón khách.
- **MASSAGE THƯ GIÃN ÁNH SAO (Bên trái quán):** Bảng hiệu neon hoa sen màu xanh ngọc & vàng ấm áp, đèn lồng thư giãn.

### 3. 🛵 Cảnh Quan Đường Phố Sài Gòn Tự Nhiên & Chân Thực:
- **Cột điện bê tông búi dây chằng chịt:** Cột điện bê tông với bình biến áp, chùm dây điện đan chéo qua các mái nhà (đặc sản Sài Gòn), kèm miếng dán *"KHOAN CẮT BÊ TÔNG 0903..."*.
- **Xe máy dựng vỉa hè:** 2 chiếc xe máy Honda Dream mận chín và Honda Wave xanh dương dựng chân chống nghiêng trên lề đường.
- **Xe Nước Mía Siêu Sạch 10K:** Xe đẩy inox có máy ép mía quay tay, bó mía xanh dựng cạnh tủ kính.
- **Bờ tường Graffiti:** Dòng chữ sơn xịt đỏ *"🚫 CẤM ĐÁI BẬY - CAMERA PHẠT 500.000đ"*.

---

## 🕹️ Bảng Phím Tắt Điều Khiển:
| Phím | Hành Động |
| :--- | :--- |
| **Click chuột trái lên mặt đất** | Nhân vật tự đi tới điểm đó (kéo chuột để xoay camera thì không tính) |
| **`W` `A` `S` `D` / Mũi tên** | Đi lại tự do (quán nhậu, hẻm, băng qua đường ra bờ sông) |
| **Giữ chuột & Kéo** | Xoay góc nhìn 360° quanh nhân vật |
| **Cuộn chuột (Scroll)** | Zoom gần / xa |
| **`E`** | Ngồi ghế nhậu / Ngồi ghế đá công viên ven sông |
| **`P`** | 🚽 **Xả Lũ: Vào WC / Đái bậy gốc cây công viên / Tè bờ tường** |
| **`V`** | 🌆 **Bật/Tắt chế độ Cinematic Ngắm Landmark 81 & Sông Sài Gòn** |
| **`Space`** | 🍻 1, 2, 3 DÔÔÔ! (Cụng ly) |

---

## 🌐 Cách Chia Sẻ Cho Bạn Bè Chơi Chung (Qua Cloudflare Tunnel):
Bạn có thể mở quán nhậu cho bạn bè ở bất kỳ đâu (kể cả dùng điện thoại 4G hay máy tính) vào cùng 1 phòng chơi chung:

1. **Nhấp đúp chuột vào file `share_cloudflare.bat`**
2. Cửa sổ dòng lệnh sẽ chạy và tạo 1 đường link public miễn phí có định dạng:
   👉 **`https://xxxx-xxxx-xxxx.trycloudflare.com`**
3. **Copy link đó gửi qua Zalo / Facebook / Telegram** cho anh em bạn bè.
4. Mọi người chỉ cần bấm vào link là xuất hiện cùng nhau trong Quán Nhậu Ảo 3D ngay lập tức!

---

## 🚀 Trải Nghiệm Local:
Bật server bằng `start.bat` (hoặc `python app.py`) rồi vào:
👉 **`http://localhost:8000`** (bấm `Ctrl + F5` trên trình duyệt để thưởng thức phố đêm Sài Gòn nhé!)

## Mobile, WC và trò chuyện

- **Thêm:** hành động phụ nằm trên hàng cuộn ngang, tự đóng sau khi chọn.
- **WC:** đến cửa hông trái quán → Vào WC → Dùng WC → Rửa tay → Ra quán. Có thể đi bộ qua cửa. WC có chốt cho một người; ra ngoài hoặc mất kết nối sẽ tự mở. Nhân vật trong WC được ẩn với người đứng ngoài.
- **Chat:** bấm **Trò chuyện** trên mobile hoặc **Enter** trên máy tính, nhập tối đa 160 ký tự rồi gửi. Tin hiện trên đầu nhân vật trong cùng phòng; **Esc** đóng ô chat. Chat nhiều người cần kết nối server WebSocket.
- **Chó mèo:** đi dạo ở mép khu bàn nhậu, có bát nước và phản ứng vui khi cụng ly/gắp mồi.
