/**
 * Điểm danh – 3 cách cùng ghi vào một sheet DiemDanh (mỗi người 1 dòng, không trùng):
 *  1) qr_staff : nhân viên quét QR cá nhân (checkin_token, cần mật khẩu)
 *  2) hall_qr  : người dự quét QR chung ở hội trường + nhập SĐT (checkin_phone, cần mã QR còn hạn)
 *  3) kiosk    : bàn hỗ trợ nhập SĐT (checkin_phone, cần mật khẩu)
 */

function recordCheckin_(reg, method) {
  return withLock_(function () {
    var sh = sheet_(SHEETS.CHK.name);
    if (findRow_(sh, 1, reg.token)) return { already: true };
    appendRowText_(sh, [reg.token, safeCell_(reg.name), reg.phone, safeCell_(reg.unit), nowStr_(), method], [3]);
    return { already: false };
  });
}

function hasCheckin_(token) {
  return findRow_(sheet_(SHEETS.CHK.name), 1, token) > 0;
}

function hasSurvey_(token) {
  return findRow_(sheet_(SHEETS.SUR.name), 1, token) > 0;
}

function checkinPhone_(req) {
  var phone = normalizePhone_(req.phone);
  if (!isValidPhone_(phone)) throw new ApiError('INVALID', 'Số điện thoại không hợp lệ.');

  var method, mask;
  if (req.pw) {
    requireAdmin_(req);
    method = 'kiosk'; mask = false;
  } else {
    if (!validHallCode_(String(req.code || '').trim().toUpperCase())) {
      throw new ApiError('BAD_CODE', 'Mã điểm danh đã hết hạn. Vui lòng quét lại mã QR tại hội trường.');
    }
    method = 'hall_qr'; mask = true;
  }

  var reg = regByPhone_(phone);
  if (!reg) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy số điện thoại này trong danh sách đăng ký. Vui lòng đến bàn hỗ trợ để đăng ký tại chỗ.');
  }
  var r = recordCheckin_(reg, method);
  return {
    token: reg.token,
    name: mask ? maskName_(reg.name) : reg.name,
    unit: mask ? '' : reg.unit,
    already: r.already,
    surveyDone: hasSurvey_(reg.token)
  };
}

function checkinToken_(req) {
  requireAdmin_(req);
  var reg = regByToken_(req.token);
  if (!reg) throw new ApiError('NOT_FOUND', 'Mã QR không hợp lệ hoặc chưa đăng ký.');
  var r = recordCheckin_(reg, 'qr_staff');
  return { name: reg.name, unit: reg.unit, phone: reg.phone, already: r.already };
}

/* ---------- Mã QR chung xoay vòng ---------- */

function hallCodeForSlot_(slot) {
  return hmacHex_('hall:' + slot).substring(0, 6).toUpperCase();
}

function currentHallSlot_() {
  return Math.floor(Date.now() / (LIMITS.hallSlotSec * 1000));
}

function currentHallCode_() {
  var slot = currentHallSlot_();
  var elapsed = (Date.now() / 1000) % LIMITS.hallSlotSec;
  return { code: hallCodeForSlot_(slot), expiresIn: Math.round(LIMITS.hallSlotSec - elapsed) };
}

function validHallCode_(code) {
  if (!code) return false;
  var fixed = prop_('STATIC_HALL_CODE'); // tuỳ chọn: mã tĩnh in giấy dán cửa
  if (fixed && safeEq_(code, String(fixed).toUpperCase())) return true;
  var slot = currentHallSlot_();
  for (var i = 0; i < LIMITS.hallSlotsAccepted; i++) {
    if (safeEq_(code, hallCodeForSlot_(slot - i))) return true;
  }
  return false;
}
