/**
 * Hàng đợi gửi mail có hạn mức.
 *  - Mỗi mail là 1 dòng trong sheet HangDoiMail (pending → sending → sent | failed).
 *  - Mỗi ngày gửi tối đa LIMITS.dailyMail; phần dư tự chuyển sang ngày hôm sau.
 *  - Trigger processMailQueue chạy mỗi 5 phút; mail đăng ký còn được gửi ngay khi đăng ký.
 *  - Khóa chỉ giữ lúc "nhận việc" và "ghi kết quả", KHÔNG giữ khi đang gửi (để không chặn đăng ký/điểm danh).
 */

function enqueueMail_(type, token, to) {
  var sh = sheet_(SHEETS.MAIL.name);
  sh.appendRow([Utilities.getUuid().substring(0, 8), nowStr_(), type, token, safeCell_(to), 'pending', 0, '', '']);
  return sh.getLastRow();
}

/* ---------- Bộ đếm hạn mức theo ngày ---------- */

function sentToday_() { return Number(prop_('SENT_' + todayKey_())) || 0; }

function addSent_(delta) {
  var props = PropertiesService.getScriptProperties();
  var key = 'SENT_' + todayKey_();
  var v = Math.max(0, (Number(props.getProperty(key)) || 0) + delta);
  props.setProperty(key, String(v));
}

function remainingToday_() {
  var byCounter = LIMITS.dailyMail - sentToday_();
  var byQuota = MailApp.getRemainingDailyQuota() - 10;
  return Math.max(0, Math.min(byCounter, byQuota));
}

/* ---------- Xử lý hàng đợi ---------- */

function processMailQueue() { processMailQueue_({}); }

function processMailQueue_(opts) {
  opts = opts || {};
  var started = Date.now();
  var timeUp = function () { return Date.now() - started > LIMITS.mailRunSec * 1000; };
  var sh = sheet_(SHEETS.MAIL.name);
  var sentCount = 0;

  while (!timeUp()) {
    var batch = claimMail_(sh, opts.rowNum);
    if (!batch.length) break;

    var results = [], stop = false;
    for (var i = 0; i < batch.length; i++) {
      var it = batch[i];
      if (stop || timeUp()) {
        results.push({ row: it.row, status: 'pending', attempts: it.attempts, sentAt: '', err: '', refund: true });
        continue;
      }
      try {
        sendMail_(it);
        results.push({ row: it.row, status: 'sent', attempts: it.attempts + 1, sentAt: nowStr_(), err: '', refund: false });
        sentCount++;
      } catch (e) {
        var msg = String(e && e.message ? e.message : e);
        if (/too many times|quota|limit exceeded/i.test(msg)) {
          stop = true; // hết hạn mức thật → dừng, giữ nguyên hàng đợi
          addSent_(LIMITS.dailyMail); // khoá phần còn lại của ngày
          results.push({ row: it.row, status: 'pending', attempts: it.attempts, sentAt: '', err: 'Hết hạn mức: ' + msg, refund: false });
        } else {
          var permanent = /invalid (email|argument)|address/i.test(msg);
          var attempts = it.attempts + 1;
          results.push({
            row: it.row, status: (permanent || attempts >= LIMITS.maxAttempts) ? 'failed' : 'pending',
            attempts: attempts, sentAt: '', err: msg.substring(0, 200), refund: true
          });
        }
      }
    }
    saveMailResults_(sh, results);
    if (opts.rowNum || stop) break;
  }
  return sentCount;
}

/** Nhận tối đa LIMITS.mailBatch mail pending, đánh dấu 'sending' và trừ hạn mức. */
function claimMail_(sh, rowNum) {
  return withLock_(function () {
    var last = sh.getLastRow();
    if (last < 2) return [];
    var allowed = Math.min(remainingToday_(), rowNum ? 1 : LIMITS.mailBatch);
    if (allowed <= 0) return [];

    var now = Date.now(), claimed = [];
    var isClaimable = function (r) {
      if (r[5] === 'pending') return true;
      return r[5] === 'sending' && now - Number(r[7]) > 10 * 60 * 1000; // 'sending' bị treo > 10 phút
    };
    var toItem = function (rowIdx, r) {
      return { row: rowIdx, type: String(r[2]), token: String(r[3]), to: String(r[4]), attempts: Number(r[6]) || 0 };
    };

    if (rowNum) {
      var r = sh.getRange(rowNum, 1, 1, 9).getValues()[0];
      if (isClaimable(r)) {
        sh.getRange(rowNum, 6, 1, 3).setValues([['sending', r[6], String(now)]]);
        claimed.push(toItem(rowNum, r));
      }
    } else {
      var vals = sh.getRange(2, 1, last - 1, 9).getValues();
      for (var i = 0; i < vals.length && claimed.length < allowed; i++) {
        if (isClaimable(vals[i])) {
          vals[i][5] = 'sending'; vals[i][7] = String(now);
          claimed.push(toItem(i + 2, vals[i]));
        }
      }
      if (claimed.length) {
        sh.getRange(2, 6, vals.length, 3).setValues(vals.map(function (r) { return [r[5], r[6], r[7]]; }));
      }
    }
    if (claimed.length) addSent_(claimed.length);
    return claimed;
  });
}

function saveMailResults_(sh, results) {
  withLock_(function () {
    var refunds = 0;
    results.forEach(function (r) {
      sh.getRange(r.row, 6, 1, 4).setValues([[r.status, r.attempts, r.sentAt, r.err]]);
      if (r.refund) refunds++;
    });
    if (refunds) addSent_(-refunds);
  });
}

/* ---------- Soạn & gửi từng loại mail ---------- */

function sendMail_(item) {
  if (item.type === 'register') return sendRegisterMail_(item);
  if (item.type === 'certificate') return sendCertificateMail_(item);
  throw new Error('Loại mail không hỗ trợ: ' + item.type);
}

function validContact_() {
  return isValidEmail_(EVENT.contactEmail) ? EVENT.contactEmail : undefined;
}

function sendRegisterMail_(item) {
  var reg = regByToken_(item.token);
  if (!reg) throw new Error('Không tìm thấy người đăng ký');
  var qr = qrBlob_(reg.token, 'qr.png', 300);
  var surveyUrl = siteUrl_() + '/survey?t=' + encodeURIComponent(reg.token);

  var html =
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222;line-height:1.55">' +
    '<h2 style="color:#0f5e57;margin:0 0 4px">Đăng ký thành công</h2>' +
    '<p style="margin:0 0 16px;color:#555">' + esc_(EVENT.name) + '</p>' +
    '<p>Xin chào <b>' + esc_(reg.name) + '</b>,<br>Ban tổ chức đã ghi nhận đăng ký của bạn:</p>' +
    '<table style="border-collapse:collapse;font-size:14px">' +
    row_('Họ tên', reg.name) + row_('Điện thoại', reg.phone) + row_('Email', reg.email) + row_('Đơn vị', reg.unit) +
    row_('Thời gian', EVENT.date + ' · ' + EVENT.time) + row_('Địa điểm', EVENT.venue) +
    '</table>' +
    '<h3 style="margin:22px 0 6px">Điểm danh ngày hội nghị</h3>' +
    '<p style="margin:0 0 8px">Đưa mã QR cá nhân này cho nhân viên tại bàn đón tiếp quét (1 giây). ' +
    'Nếu không có mã, bạn có thể quét QR chung tại hội trường rồi nhập số điện thoại <b>' + esc_(reg.phone) + '</b>.</p>' +
    (qr ? '<div style="text-align:center;margin:12px 0"><img src="cid:qr" width="200" height="200" alt="QR điểm danh"></div>' : '') +
    '<p style="text-align:center;font-size:18px;letter-spacing:2px;margin:0 0 18px"><b>' + esc_(reg.token) + '</b></p>' +
    '<p>Sau khi điểm danh, mở liên kết dưới đây để làm khảo sát và nhận giấy chứng nhận tham dự ngay:<br>' +
    '<a href="' + esc_(surveyUrl) + '">' + esc_(surveyUrl) + '</a></p>' +
    '<p style="color:#777;font-size:12px;margin-top:22px">Email tự động, vui lòng giữ lại để điểm danh.' +
    (validContact_() ? ' Liên hệ: ' + esc_(EVENT.contactEmail) : '') + '</p></div>';

  var opts = { to: reg.email, subject: '[Xác nhận đăng ký] ' + EVENT.name, htmlBody: html, name: EVENT.senderName };
  if (validContact_()) opts.replyTo = EVENT.contactEmail;
  if (qr) opts.inlineImages = { qr: qr };
  MailApp.sendEmail(opts);
}

function sendCertificateMail_(item) {
  var c = certData_(item.token);
  var pdf = certificatePdfBlob_(c);
  var html =
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222;line-height:1.55">' +
    '<h2 style="color:#0f5e57">Giấy chứng nhận tham dự</h2>' +
    '<p>Xin chào <b>' + esc_(c.name) + '</b>,</p>' +
    '<p>Cảm ơn bạn đã tham dự <b>' + esc_(EVENT.name) + '</b> và hoàn thành khảo sát. ' +
    'Giấy chứng nhận tham dự được đính kèm trong email này (PDF).</p>' +
    '<p>Mã chứng nhận: <b>' + esc_(c.code) + '</b><br>Xác thực tại: <a href="' + esc_(verifyUrl_(c.code)) + '">' + esc_(verifyUrl_(c.code)) + '</a></p>' +
    '<p style="color:#777;font-size:12px">Trân trọng,<br>' + esc_(EVENT.senderName) + '</p></div>';
  var opts = { to: c.email, subject: '[Giấy chứng nhận] ' + EVENT.name, htmlBody: html, name: EVENT.senderName, attachments: [pdf] };
  if (validContact_()) opts.replyTo = EVENT.contactEmail;
  MailApp.sendEmail(opts);
}

function row_(k, v) {
  return '<tr><td style="padding:3px 14px 3px 0;color:#777">' + esc_(k) + '</td><td style="padding:3px 0"><b>' + esc_(v) + '</b></td></tr>';
}
