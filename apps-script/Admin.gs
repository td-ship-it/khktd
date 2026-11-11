/** Thống kê & xuất dữ liệu cho trang quản trị. */

function adminStats_() {
  var count = function (name) { return Math.max(0, sheet_(name).getLastRow() - 1); };
  var mail = { pending: 0, sending: 0, sent: 0, failed: 0 };
  var msh = sheet_(SHEETS.MAIL.name);
  if (msh.getLastRow() > 1) {
    msh.getRange(2, 6, msh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      if (mail[r[0]] !== undefined) mail[r[0]]++;
    });
  }
  return {
    registered: count(SHEETS.REG.name),
    checkedIn: count(SHEETS.CHK.name),
    surveyed: count(SHEETS.SUR.name),
    mail: mail,
    mailSentToday: sentToday_(),
    mailDailyLimit: LIMITS.dailyMail,
    serverTime: nowStr_()
  };
}

function adminList_() {
  var reg = sheet_(SHEETS.REG.name);
  if (reg.getLastRow() < 2) return { rows: [] };
  var set = function (name) {
    var sh = sheet_(name), o = {};
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { o[r[0]] = 1; });
    return o;
  };
  var chk = set(SHEETS.CHK.name), sur = set(SHEETS.SUR.name);
  var rows = reg.getRange(2, 1, reg.getLastRow() - 1, 6).getDisplayValues().map(function (r) {
    return [r[1], phoneFromCell_(r[2]), r[3], r[4], r[5], chk[r[0]] ? 1 : 0, sur[r[0]] ? 1 : 0];
  });
  return { rows: rows.reverse() }; // mới nhất lên đầu
}

function adminExport_(req) {
  var map = { reg: SHEETS.REG.name, chk: SHEETS.CHK.name, sur: SHEETS.SUR.name, mail: SHEETS.MAIL.name };
  var name = map[req.sheet];
  if (!name) throw new ApiError('INVALID', 'Sheet không hợp lệ.');
  var sh = sheet_(name);
  var last = sh.getLastRow(), cols = sh.getLastColumn();
  var values = last >= 1 ? sh.getRange(1, 1, last, cols).getDisplayValues() : [];
  var rows = values.slice(1);
  var pc = (values[0] || []).indexOf('Số điện thoại');
  if (pc >= 0) rows.forEach(function (r) { r[pc] = phoneFromCell_(r[pc]); });
  return { headers: values[0] || [], rows: rows, filename: name };
}
