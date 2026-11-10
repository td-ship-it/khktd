/**
 * CẤU HÌNH SỰ KIỆN
 * Chỉnh các giá trị trong ngoặc vuông […] trước khi triển khai (clasp push).
 * Các bí mật (API_KEY, ADMIN_PASSWORD, SITE_URL...) đặt trong Script Properties, KHÔNG ghi ở đây.
 */
var TZ = 'Asia/Ho_Chi_Minh';

var EVENT = {
  name: 'Hội nghị Khoa học kỹ thuật Dược lần thứ 43',
  shortName: 'Hội nghị Dược lần thứ 43',
  date: '[Ngày diễn ra, ví dụ: 20/11/2026]',
  time: '[Giờ bắt đầu, ví dụ: 07:30]',
  venue: '[Địa điểm tổ chức]',
  organizer: '[Tên đơn vị tổ chức]',
  signerTitle: '[Chức danh người ký]',
  signerName: '[Họ tên người ký]',
  contactEmail: '[email liên hệ BTC]',
  senderName: 'Ban tổ chức Hội nghị Dược 43',
  codePrefix: 'D43'
};

var LIMITS = {
  dailyMail: 1400,        // trần gửi mail/ngày (hạn mức thật 1500, chừa 100 dự phòng)
  maxAttempts: 3,         // số lần thử gửi tối đa cho 1 mail
  resendMax: 3,           // số lần người dùng được yêu cầu gửi lại mail đăng ký
  hallSlotSec: 90,        // mã QR chung đổi mỗi 90 giây
  hallSlotsAccepted: 3,   // chấp nhận mã hiện tại + 2 mã trước đó (~4,5 phút)
  mailBatch: 40,          // số mail xử lý mỗi lượt
  mailRunSec: 240         // thời gian tối đa mỗi lần chạy trigger
};

/**
 * Câu hỏi khảo sát. type: rating (1-5) | choice | multi | text
 * Đổi câu hỏi xong chạy lại setup() để cập nhật tiêu đề cột trong Sheet.
 */
var SURVEY = {
  questions: [
    { id: 'q_content', type: 'rating', label: 'Nội dung chuyên môn của hội nghị', required: true },
    { id: 'q_speakers', type: 'rating', label: 'Chất lượng báo cáo viên', required: true },
    { id: 'q_org', type: 'rating', label: 'Công tác tổ chức, hậu cần', required: true },
    { id: 'q_venue', type: 'rating', label: 'Địa điểm, âm thanh, hình ảnh', required: true },
    {
      id: 'q_topics', type: 'multi', label: 'Lĩnh vực bạn quan tâm nhất (chọn nhiều)', required: false,
      options: ['Dược lâm sàng', 'Quản lý & cung ứng thuốc', 'Công nghiệp dược', 'Dược cổ truyền', 'Kiểm nghiệm & chất lượng', 'Chuyển đổi số ngành dược']
    },
    {
      id: 'q_next', type: 'choice', label: 'Bạn có muốn tham dự hội nghị lần sau?', required: true,
      options: ['Chắc chắn có', 'Có thể', 'Chưa chắc']
    },
    { id: 'q_comment', type: 'text', label: 'Góp ý để hội nghị tốt hơn', required: false }
  ]
};

var SHEETS = {
  REG:  { name: 'DangKy',      headers: ['Token', 'Họ tên', 'Số điện thoại', 'Email', 'Đơn vị', 'Đăng ký lúc', 'Số lần gửi lại'] },
  CHK:  { name: 'DiemDanh',    headers: ['Token', 'Họ tên', 'Số điện thoại', 'Đơn vị', 'Điểm danh lúc', 'Hình thức'] },
  SUR:  { name: 'KhaoSat',     headers: null }, // dựng động từ SURVEY, xem surveyHeaders_()
  MAIL: { name: 'HangDoiMail', headers: ['ID', 'Tạo lúc', 'Loại', 'Token', 'Email', 'Trạng thái', 'Số lần thử', 'Gửi lúc', 'Lỗi'] }
};

function surveyHeaders_() {
  var base = ['Token', 'Họ tên', 'Số điện thoại', 'Email', 'Đơn vị', 'Gửi lúc', 'Mã chứng nhận'];
  return base.concat(SURVEY.questions.map(function (q) { return q.label; }));
}

function publicEvent_() {
  return {
    name: EVENT.name, shortName: EVENT.shortName, date: EVENT.date,
    time: EVENT.time, venue: EVENT.venue, organizer: EVENT.organizer
  };
}
