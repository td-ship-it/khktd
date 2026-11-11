/**
 * CHẠY MỘT LẦN từ trình soạn thảo Apps Script: chọn hàm setup() → Run.
 * Tạo Google Sheet dữ liệu, các sheet con, khoá bí mật, và trigger gửi mail mỗi 5 phút.
 * An toàn khi chạy lại (không xoá dữ liệu); chạy lại sau khi đổi câu hỏi khảo sát để cập nhật tiêu đề cột.
 */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss;
  var id = props.getProperty('SPREADSHEET_ID');
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('Hội nghị Dược 43 – Dữ liệu');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }

  var defs = [
    { def: SHEETS.REG,  headers: SHEETS.REG.headers,  textCols: [3] },
    { def: SHEETS.CHK,  headers: SHEETS.CHK.headers,  textCols: [3] },
    { def: SHEETS.SUR,  headers: surveyHeaders_(),    textCols: [3] },
    { def: SHEETS.MAIL, headers: SHEETS.MAIL.headers, textCols: [] }
  ];
  defs.forEach(function (d, i) {
    var sh = ss.getSheetByName(d.def.name);
    if (!sh) {
      sh = (i === 0 && ss.getSheets().length === 1 && ss.getSheets()[0].getLastRow() === 0)
        ? ss.getSheets()[0].setName(d.def.name)
        : ss.insertSheet(d.def.name);
    }
    sh.getRange(1, 1, 1, d.headers.length).setValues([d.headers]).setFontWeight('bold').setBackground('#e6f2f0');
    sh.setFrozenRows(1);
    // Cột số điện thoại phải là văn bản để giữ số 0 đầu.
    d.textCols.forEach(function (c) { sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'); });
  });

  var created = {};
  if (!props.getProperty('API_KEY')) { created.API_KEY = Utilities.getUuid().replace(/-/g, '') + randomString_(8); props.setProperty('API_KEY', created.API_KEY); }
  if (!props.getProperty('ADMIN_PASSWORD')) { created.ADMIN_PASSWORD = randomString_(10); props.setProperty('ADMIN_PASSWORD', created.ADMIN_PASSWORD); }
  if (!props.getProperty('HMAC_SECRET')) props.setProperty('HMAC_SECRET', Utilities.getUuid() + Utilities.getUuid());

  installTrigger();

  Logger.log('Google Sheet dữ liệu: ' + ss.getUrl());
  if (created.API_KEY) Logger.log('API_KEY (nhập vào Cloudflare secret API_KEY): ' + created.API_KEY);
  if (created.ADMIN_PASSWORD) Logger.log('ADMIN_PASSWORD (mật khẩu trang quản trị, nên đổi trong Script Properties): ' + created.ADMIN_PASSWORD);
  if (!props.getProperty('SITE_URL')) Logger.log('⚠ Còn thiếu Script Property SITE_URL = https://<tên-miền-worker> (dùng cho link trong email).');
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processMailQueue') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processMailQueue').timeBased().everyMinutes(5).create();
}

/** Tiện ích: gửi thử mail đăng ký tới chính chủ script để kiểm tra giao diện email. */
function sendTestMail() {
  var me = Session.getEffectiveUser().getEmail();
  var token = 'TEST-' + randomString_(6);
  var sh = sheet_(SHEETS.REG.name);
  appendRowText_(sh, [token, 'Nguyễn Văn Thử', '0900000000', me, 'Đơn vị thử nghiệm', nowStr_(), 0], [3]);
  sendRegisterMail_({ token: token });
  sh.deleteRow(sh.getLastRow());
  Logger.log('Đã gửi mail thử tới ' + me);
}

/**
 * Sửa dữ liệu cũ: nếu cột "Số điện thoại" từng bị Sheets đổi thành số (mất số 0 đầu),
 * chạy hàm này một lần để thêm lại số 0 và ép cột thành văn bản. An toàn khi chạy nhiều lần.
 */
function fixPhoneColumns() {
  var fixed = 0;
  [SHEETS.REG.name, SHEETS.CHK.name, SHEETS.SUR.name].forEach(function (name) {
    var sh = sheet_(name), last = sh.getLastRow();
    if (last < 2) return;
    var rng = sh.getRange(2, 3, last - 1, 1);
    var vals = rng.getValues();
    var out = vals.map(function (r) {
      var f = phoneFromCell_(r[0]);
      if (f !== String(r[0])) fixed++;
      return [f];
    });
    sh.getRange(1, 3, sh.getMaxRows(), 1).setNumberFormat('@');
    rng.setValues(out);
  });
  Logger.log('Đã sửa ' + fixed + ' ô số điện thoại.');
}
