/** Đăng ký tham dự. */

function register_(req) {
  // Honeypot: bot thường điền ô ẩn này. Trả về thành công giả để không bị dò.
  if (req.website) return { token: '', name: clean_(req.name, 100), duplicate: false };

  var name = clean_(req.name, 100);
  var phone = normalizePhone_(req.phone);
  var email = clean_(req.email, 120).toLowerCase();
  var unit = clean_(req.unit, 150);

  if (name.length < 2) throw new ApiError('INVALID', 'Vui lòng nhập họ tên.');
  if (!isValidPhone_(phone)) throw new ApiError('INVALID', 'Số điện thoại không hợp lệ (10–11 chữ số).');
  if (!isValidEmail_(email)) throw new ApiError('INVALID', 'Email không hợp lệ.');
  if (unit.length < 2) throw new ApiError('INVALID', 'Vui lòng nhập đơn vị công tác.');

  var result = withLock_(function () {
    var sh = sheet_(SHEETS.REG.name);
    var row = findRow_(sh, 3, phone);

    if (row) {
      var existing = regFromRow_(sh.getRange(row, 1, 1, 7).getValues()[0]);
      if (existing.email.toLowerCase() !== email) {
        throw new ApiError('PHONE_EXISTS', 'Số điện thoại này đã đăng ký với một email khác. Vui lòng liên hệ Ban tổ chức nếu cần hỗ trợ.');
      }
      if (existing.resend >= LIMITS.resendMax) {
        throw new ApiError('RESEND_LIMIT', 'Bạn đã đăng ký và đã yêu cầu gửi lại email nhiều lần. Vui lòng kiểm tra hộp thư (kể cả thư rác) hoặc liên hệ Ban tổ chức.');
      }
      sh.getRange(row, 7).setValue(existing.resend + 1);
      var mailRow = enqueueMail_('register', existing.token, existing.email);
      return { token: existing.token, name: existing.name, duplicate: true, mailRow: mailRow };
    }

    var token = newToken_();
    sh.appendRow([token, safeCell_(name), phone, safeCell_(email), safeCell_(unit), nowStr_(), 0]);
    var mr = enqueueMail_('register', token, email);
    return { token: token, name: name, duplicate: false, mailRow: mr };
  });

  // Gửi ngay mail xác nhận (ngoài lock). Nếu hết hạn mức/lỗi, trigger sẽ gửi sau.
  try { processMailQueue_({ rowNum: result.mailRow }); } catch (e) { console.warn('send-now failed: ' + e); }

  return { token: result.token, name: result.name, duplicate: result.duplicate };
}
