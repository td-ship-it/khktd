/**
 * Giấy chứng nhận: hiển thị ngay trên web sau khi gửi khảo sát (không phụ thuộc hạn mức mail),
 * tải PDF tại chỗ; email chỉ là bản sao gửi sau theo hàng đợi.
 */

function certData_(token) {
  var reg = regByToken_(token);
  if (!reg) throw new ApiError('NOT_FOUND', 'Liên kết không hợp lệ.');
  var sur = surveyRowByToken_(reg.token);
  if (!sur) throw new ApiError('NO_SURVEY', 'Bạn cần hoàn thành khảo sát để nhận giấy chứng nhận.');
  return { token: reg.token, name: reg.name, unit: reg.unit, email: reg.email, code: String(sur.values[6]), issuedAt: String(sur.values[5]) };
}

function verifyUrl_(code) { return siteUrl_() + '/verify?code=' + encodeURIComponent(code); }

function qrUrl_(text, size) {
  return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&margin=4&data=' + encodeURIComponent(text);
}

function qrBlob_(text, name, size) {
  try {
    var res = UrlFetchApp.fetch(qrUrl_(text, size || 300), { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) return res.getBlob().setName(name || 'qr.png');
  } catch (e) { console.warn('QR fetch failed: ' + e); }
  return null;
}

function certificate_(req) {
  var c = certData_(req.t);
  return { name: c.name, code: c.code, html: certificateHtml_(c, false) };
}

function certificatePdfBlob_(c) {
  var html = certificateHtml_(c, true);
  var fname = 'Giay-chung-nhan-' + c.code + '.pdf';
  return Utilities.newBlob(html, 'text/html', 'cert.html').getAs('application/pdf').setName(fname);
}

function certificatePdf_(req) {
  var c = certData_(req.t);
  var blob = certificatePdfBlob_(c);
  return { filename: blob.getName(), pdf: Utilities.base64Encode(blob.getBytes()) };
}

/**
 * HTML chứng nhận. Dùng bảng + CSS inline để bộ chuyển PDF của Apps Script hiển thị ổn định.
 * forPdf = true: nhúng QR dạng data URI (không phụ thuộc tải ảnh ngoài khi render).
 */
function certificateHtml_(c, forPdf) {
  var link = verifyUrl_(c.code);
  var qrSrc = qrUrl_(link, 160);
  if (forPdf) {
    var b = qrBlob_(link, 'v.png', 160);
    if (b) qrSrc = 'data:image/png;base64,' + Utilities.base64Encode(b.getBytes());
  }
  var gold = '#9a7b2f', teal = '#0f5e57';
  return '<!doctype html><html><head><meta charset="utf-8"></head>' +
    '<body style="margin:0;padding:0;background:#fff;font-family:Georgia,\'Times New Roman\',serif;color:#222;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="border:6px double ' + gold + ';"><tr><td style="padding:34px 40px;text-align:center;">' +
    '<div style="font-size:14px;letter-spacing:2px;color:' + teal + ';font-weight:bold;">' + esc_(EVENT.organizer).toUpperCase() + '</div>' +
    '<div style="height:10px"></div>' +
    '<div style="font-size:15px;color:#555;">' + esc_(EVENT.name) + '</div>' +
    '<div style="height:36px"></div>' +
    '<div style="font-size:38px;font-weight:bold;color:' + teal + ';letter-spacing:3px;">GIẤY CHỨNG NHẬN</div>' +
    '<div style="width:120px;height:3px;background:' + gold + ';margin:14px auto 0;"></div>' +
    '<div style="height:34px"></div>' +
    '<div style="font-size:16px;font-style:italic;color:#555;">Ban tổ chức chứng nhận</div>' +
    '<div style="height:14px"></div>' +
    '<div style="font-size:32px;font-weight:bold;color:#111;">' + esc_(c.name) + '</div>' +
    '<div style="height:10px"></div>' +
    '<div style="font-size:16px;color:#333;">Đơn vị: ' + esc_(c.unit) + '</div>' +
    '<div style="height:26px"></div>' +
    '<div style="font-size:17px;line-height:1.7;">đã tham dự<br><b>' + esc_(EVENT.name) + '</b><br>' +
    'Thời gian: ' + esc_(EVENT.date) + ' &nbsp;·&nbsp; Địa điểm: ' + esc_(EVENT.venue) + '</div>' +
    '<div style="height:44px"></div>' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td width="50%" style="text-align:left;vertical-align:bottom;font-size:12px;color:#555;line-height:1.6;">' +
    '<img src="' + qrSrc + '" width="96" height="96" alt="QR xác thực"><br>' +
    'Mã chứng nhận: <b>' + esc_(c.code) + '</b><br>Cấp ngày: ' + esc_(c.issuedAt.substring(0, 10)) + '<br>Xác thực: ' + esc_(link) + '</td>' +
    '<td width="50%" style="text-align:center;vertical-align:top;font-size:15px;">' +
    '<b>' + esc_(EVENT.signerTitle) + '</b><br><br><br><br><br><b>' + esc_(EVENT.signerName) + '</b></td>' +
    '</tr></table>' +
    '</td></tr></table></body></html>';
}

function verify_(req) {
  var code = clean_(req.code, 40).toUpperCase();
  if (!code) throw new ApiError('INVALID', 'Vui lòng nhập mã chứng nhận.');
  var sh = sheet_(SHEETS.SUR.name);
  var row = findRow_(sh, 7, code);
  if (!row) return { valid: false };
  var v = sh.getRange(row, 1, 1, 7).getValues()[0];
  return { valid: true, name: String(v[1]), unit: String(v[4]), issuedAt: String(v[5]), code: code, event: EVENT.name };
}
