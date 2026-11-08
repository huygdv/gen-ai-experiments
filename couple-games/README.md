# Tụi Mình Chơi — Săn Số (MVP)

Mini game cho hai người: tìm và khoanh các số 1 → 100 trên một trang giấy vở học sinh. Mỗi số được khoanh thuộc về người bấm đúng trước; cuối ván, ai được nhiều điểm hơn sẽ thắng.

## Chơi ngay

- Mở `index.html` trên trình duyệt để chơi chung một màn hình (chọn màu bút trước khi bấm).
- Để **chơi trên hai thiết bị**: đưa `index.html` lên một địa chỉ HTTPS (ví dụ Netlify Drop), máy A chọn **Tạo phòng**, máy B mở link mời hoặc nhập mã 6 ký tự, máy A bấm **Bắt đầu**.
- Chơi chung máy có thể chọn bút hồng/xanh bằng các nút trên màn hình, hoặc phím `A`/`L` trên máy tính.
- Hai người cùng thi trên một trang số ngẫu nhiên mới mỗi ván, có điểm, đồng hồ, gợi ý, âm thanh, hiệu ứng kết thúc.

## Deploy trong 1 phút

1. Mở https://app.netlify.com/drop
2. Kéo thư mục `couple-games` hoặc tệp ZIP `couple-games.zip` lên trang.
3. Nhận URL HTTPS `*.netlify.app` và gửi cho người thương.

Trang web này là site tĩnh (HTML/CSS/JS), không cần npm, build, database hay tài khoản để chơi.

## Kiến trúc / giới hạn MVP

- Online P2P/WebRTC qua [PeerJS](https://peerjs.com/) (dùng PeerJS Cloud miễn phí làm signaling); sau khi kết nối, dữ liệu game gửi trực tiếp giữa hai trình duyệt, chủ phòng là nơi chốt điểm.
- Internet cần thiết cho ghép đôi, PeerJS Cloud và Google Fonts. Chế độ chơi chung máy có thể chạy mà không cần dịch vụ signaling.
- Chỉ tối đa 2 người / phòng, phòng tồn tại khi chủ phòng giữ tab mở. Phòng không được lưu lại; rời tab sẽ ngắt kết nối.
- Chơi online thực tế có thể gặp vấn đề trên các mạng NAT nghiêm ngặt do chưa có TURN relay dự phòng. Nếu triển khai quy mô lớn cần signaling riêng/TURN và server-authoritative.
- Không có account/chat/storage. Link mời nên được chia sẻ riêng tư.

## Điểm cần lưu ý

Nếu một số trình duyệt chặn WebRTC hoặc PeerJS Cloud gặp sự cố, chức năng online có thể không kết nối được. Để dùng lâu dài và ổn định, nên chuyển sang realtime backend (Supabase/Firebase/WebSocket server).

## Mobile/tablet

- Có breakpoint riêng cho màn hình nhỏ và tablet; trên mobile thanh “ĐANG SĂN SỐ” nằm ngay phía trên giấy và bám khi cuộn qua giấy để luôn nhìn thấy số cần tìm.
- Không có yêu cầu cài app; mở bằng Chrome hoặc Safari trên điện thoại/tablet.
- Trải nghiệm hai thiết bị thực tế phụ thuộc PeerJS Cloud và mạng của cả hai bên.