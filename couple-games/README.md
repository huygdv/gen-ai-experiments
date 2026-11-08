# Tụi Mình Chơi — Săn Số (MVP)

Tranh tìm và khoanh các số từ 01 đến 100. Ai chạm đúng số tiếp theo đầu tiên được 1 điểm; khi hết 100 số, ai được nhiều điểm hơn sẽ thắng.

## Cách chơi

- **Hai điện thoại (khuyến nghị):** Máy A tạo phòng, máy B mở link mời hoặc nhập mã 6 ký tự. Hai bên xem cùng một bộ 100 số. Chủ phòng chốt kết quả qua WebRTC.
- **Chung một tablet / màn hình rộng:** Hai trang vở **giống hệt nhau** chia đôi màn hình, phía hồng là người 1, phía xanh là người 2. Mỗi vùng cảm ứng nhận điểm tự động, không chọn bút và không đổi lượt. Các sự kiện pointerdown hỗ trợ hai ngón tay đồng thời. Đã kiểm thử chức năng tại độ rộng 820px. Trên điện thoại nhỏ, chế độ này được chặn và gợi ý chơi hai máy.

Mã nguồn là một file HTML tĩnh, không cần npm, database hoặc tài khoản. Có âm thanh, đồng hồ, gợi ý, hiệu ứng và chơi lại.

## Giới hạn MVP

- Online sử dụng PeerJS Cloud làm signaling và WebRTC. Hai máy cần internet, TURN relay chưa có nên một số mạng sẽ không kết nối thành công.
- Chủ phòng chốt điểm theo thời điểm nhận tín hiệu, vì vậy online chưa bù trễ mạng và chưa đạt công bằng tuyệt đối.
- Phòng sẽ ngắt khi chủ phòng đóng tab. Chưa kiểm thử online end-to-end trên hai thiết bị thật.
- Tablet split-screen đã kiểm thử input từng vùng, đồng bộ điểm và từ chối số đã giành. Không yêu cầu chọn bút trước khi thao tác.
