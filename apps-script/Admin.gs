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

function adminExport_(req) {
  var map = { reg: SHEETS.REG.name, chk: SHEETS.CHK.name, sur: SHEETS.SUR.name, mail: SHEETS.MAIL.name };
  var name = map[req.sheet];
  if (!name) throw new ApiError('INVALID', 'Sheet không hợp lệ.');
  var sh = sheet_(name);
  var last = sh.getLastRow(), cols = sh.getLastColumn();
  var values = last >= 1 ? sh.getRange(1, 1, last, cols).getDisplayValues() : [];
  return { headers: values[0] || [], rows: values.slice(1), filename: name };
}
