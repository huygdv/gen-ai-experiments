# CoupleGames · Săn Số — v0.3.0

Một mini game web thuần HTML/CSS/JS dành cho **hai người chơi trực tiếp**, tối ưu cho điện thoại, tablet và desktop.

## Chế độ chơi

### 1. Săn Số gốc
- Cùng tìm và khoanh từ 01 đến 100 theo thứ tự tăng dần trên trang vở.
- Ai bấm đúng số kế tiếp trước thì được 1 điểm.
- Khi khoanh đủ 100 số, người ghi nhiều điểm hơn thắng.

### 2. 🪳 Gián Bom Đại Chiến (MVP)
- Cùng luật khoanh 100 số, nhưng mỗi số đúng thả một gián mang bom thuộc phe người bấm.
- Gián di chuyển theo **ba đường tiến quân**, đối đầu gián phe kia sẽ va chạm/nổ và loại trừ nhau.
- Gián lọt đến căn cứ địch gây **5 sát thương**. Cả hai căn cứ bắt đầu với **100 HP**.
- Khoanh được **4 số liên tiếp** sẽ tạo gián cường hóa (2 HP, sát thương căn cứ 9).
- Khi một căn cứ về 0 HP thì ván kết thúc sớm; nếu đã khoanh đủ 100 số thì chờ các gián còn trên sân giao chiến xong rồi so HP, hòa HP thì so điểm khoanh số.
- Mọi đơn vị tự chiến đấu để người chơi không phải rời mắt khỏi bảng số.

## Thiết bị
- **2 máy online (ưu tiên):** Tạo phòng → chia sẻ mã/link → người thứ hai tham gia → chơi cùng bảng số. WebRTC PeerJS hoạt động qua internet; host chốt yêu cầu đầu tiên tới máy host.
- **1 tablet/desktop cảm ứng:** Chia đôi thành hai bảng số giống nhau với vùng thao tác riêng, nhận đa điểm đồng thời. Không có nút chọn lượt/chọn bút. Trên điện thoại nhỏ, dùng 2 máy.
- Có âm thanh tùy chọn, gợi ý và nút **Toàn màn hình** nếu trình duyệt hỗ trợ.
- **v0.3:** Khi chơi Gián Bom trên tablet nằm ngang, chiến trường trở thành **floating dock** ở đầu màn hình; có nút thu gọn/mở rộng, nút fullscreen ngay trên dock và ẩn phần giới thiệu để nhường không gian cho hai trang vở.
- Thiết bị có cạnh ngắn dưới 590 CSS px không cho chọn chế độ chia đôi để tránh hai bảng số bị nhỏ đến mức không chơi được.

## Website chính thức

- **Production:** <https://couplegames-vn.vercel.app> — Vercel Project ID `prj_QjMGeQkPKiPXDDI4uYqo3C3PQyZw`.
- **Tên miền cũ vẫn chạy:** <https://tui-minh-choi.vercel.app>.
- `couplegames.vercel.app` đã thuộc dự án Vercel khác (API báo 409 `owned-on-other-team`); vì thế dùng `couplegames-vn.vercel.app`.
- **GitHub source:** `huygdv/gen-ai-experiments`, nhánh `couple-games-sanso`, thư mục `couple-games/`.
- **Cách deploy đang dùng:** Vercel API tạo Production Deployment từ `couple-games/index.html` sau khi commit GitHub. Vercel sẽ gắn các production domain vào deployment mới; phải kiểm tra trạng thái READY và mapping domain sau khi deploy. **Git integration của Vercel chưa cấu hình** do tài khoản Vercel hiện không tìm thấy repo để liên kết (repo_not_found). Vì vậy push GitHub **không tự deploy**; mỗi phiên sửa cần explicit deploy + kiểm tra.

## Kiến trúc / lưu ý kỹ thuật
- Trang HTML tự chạy, không cần build, không database, không tài khoản.
- WebRTC PeerJS dùng signaling của bên thứ ba; cần internet và có thể lỗi với một số cấu hình NAT/firewall, chưa có TURN relay.
- Máy chủ phòng (host) là nơi quyết định số nào được chốt và mô phỏng trận chiến; client nhận snapshot giao tranh/HP.
- **Giới hạn công bằng online:** yêu cầu từ host có lợi thế độ trễ so với người tham gia. MVP chưa áp dụng timestamp arbitration bù ping hoặc server authority; không nên quảng cáo là đấu giải công bằng tuyệt đối.
- Không nhận định đã kiểm thử kết nối online trên hai thiết bị thực. Kiểm thử tự động hiện thực hiện trên Chromium desktop/tablet/mobile mô phỏng.
- Một người đóng tab chủ phòng khiến phòng ngừng hoạt động.

## Kiểm thử smoke đã chạy tại môi trường phát triển
- Bảng có đủ 100 số, trên desktop (1260px), tablet (820px) và mobile (390px).
- Chọn chế độ gốc vẫn giữ cơ chế điểm bình thường.
- Chế độ Gián Bom: 2 phe sinh quân, nổ khi gặp nhau, căn cứ giảm HP khi gián vượt qua, gián cường hóa sống qua một lần chạm, hạ 0 HP thì kết thúc sớm.
- Giảm redraw không cần thiết trên guest khi chỉ cập nhật vị trí đội quân.
- Kiểm tra không tràn ngang ở màn hình 390px.
- **v0.3:** layout landscape 1180×820, 1024×768 và portrait 820×1180, mobile 390×844: HUD nổi, bảng số, thao tác thu gọn, HP, số điểm và giới hạn không tràn ngang. Ở tablet ngang, các số vẫn ở dưới dock; ở điện thoại portrait battle dock dùng sticky.
- **Chưa kiểm chứng thực tế:** tính công bằng mạng/độ trễ, đồng bộ khi mất kết nối, tương thích fullscreen Safari iOS và cân bằng trò chơi sau nhiều ván.

## Hướng phát triển tiếp
- Tách engine combat và sync protocol, thêm unit tests chạy CI.
- Sửa công bằng online: server authoritativeness, đo latency/ping, xác nhận theo cùng một cửa sổ thời gian cho hai máy.
- Playtest để điều chỉnh tốc độ gián, sát thương, độ dài ván và comeback mechanic.
- Tùy chọn gián/nhân vật dễ thương khác hoặc thay skin khi ai đó không thích gián, đảm bảo không che số cần tìm.