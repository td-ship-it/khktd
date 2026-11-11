/** Tiện ích dùng chung. */

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function nowStr_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

function todayKey_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyyMMdd');
}

function siteUrl_() {
  return String(prop_('SITE_URL') || '').replace(/\/+$/, '');
}

function clean_(v, max) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, max);
}

/** Chống công thức độc hại (CSV/formula injection) khi ghi vào Sheet. */
function safeCell_(v) {
  var s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function normalizePhone_(raw) {
  var d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.indexOf('+84') === 0) d = '0' + d.slice(3);
  else if (d.indexOf('84') === 0 && d.length >= 11) d = '0' + d.slice(2);
  return d.replace(/\D/g, '');
}

/**
 * Đọc SĐT từ ô Sheet an toàn: nếu ô từng bị Sheets đổi thành số (mất số 0 đầu) thì tự thêm lại.
 * SĐT Việt Nam luôn bắt đầu bằng 0 sau khi chuẩn hoá nên 9–10 chữ số không có 0 đầu là bị mất.
 */
function phoneFromCell_(v) {
  var s = String(v == null ? '' : v).replace(/\D/g, '');
  if (s && s.charAt(0) !== '0' && (s.length === 9 || s.length === 10)) s = '0' + s;
  return s;
}

/** Ghi 1 dòng mới, ép các cột `textCols` (ví dụ SĐT) thành văn bản TRƯỚC khi ghi để giữ số 0 đầu. */
function appendRowText_(sh, values, textCols) {
  var row = sh.getLastRow() + 1; // luôn gọi trong withLock_
  (textCols || []).forEach(function (c) { sh.getRange(row, c).setNumberFormat('@'); });
  sh.getRange(row, 1, 1, values.length).setValues([values]);
  return row;
}

function isValidPhone_(p) { return /^0\d{9,10}$/.test(p); }
function isValidEmail_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }

function maskName_(name) {
  var parts = String(name).split(' ');
  if (parts.length <= 2) return parts[0] + ' ' + (parts[1] ? parts[1].charAt(0) + '***' : '');
  return parts[0] + ' ' + parts.slice(1, -1).map(function (p) { return p.charAt(0) + '*'; }).join(' ') + ' ' + parts[parts.length - 1];
}

function safeEq_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function hmacHex_(msg) {
  var sig = Utilities.computeHmacSha256Signature(msg, prop_('HMAC_SECRET') || 'dev');
  return sig.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

var TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomString_(n) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + ':' + Date.now() + ':' + Math.random());
  var out = '';
  for (var i = 0; i < n; i++) out += TOKEN_ALPHABET.charAt((bytes[i] & 0xff) % TOKEN_ALPHABET.length);
  return out;
}

function newToken_() { return EVENT.codePrefix + '-' + randomString_(10); }
function newCertCode_() { return 'CN' + EVENT.codePrefix.replace(/\D/g, '') + '-' + randomString_(8); }

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new ApiError('BUSY', 'Hệ thống đang quá tải, vui lòng thử lại sau ít giây.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- Sheet helpers ---------- */

var _ss = null;
function ss_() {
  if (_ss) return _ss;
  var id = prop_('SPREADSHEET_ID');
  if (!id) throw new ApiError('NOT_SETUP', 'Chưa chạy setup().');
  _ss = SpreadsheetApp.openById(id);
  return _ss;
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new ApiError('NOT_SETUP', 'Thiếu sheet ' + name + '. Hãy chạy lại setup().');
  return sh;
}

/** Tìm hàng (1-based) có cột `col` bằng `value`; 0 nếu không có. */
function findRow_(sh, col, value, norm) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, col, last - 1, 1).getValues();
  var v = String(value);
  for (var i = 0; i < vals.length; i++) if ((norm ? norm(vals[i][0]) : String(vals[i][0])) === v) return i + 2;
  return 0;
}

function regFromRow_(r) {
  return { token: String(r[0]), name: String(r[1]), phone: phoneFromCell_(r[2]), email: String(r[3]), unit: String(r[4]), createdAt: String(r[5]), resend: Number(r[6]) || 0 };
}

function regByToken_(token) {
  token = String(token || '').trim().toUpperCase();
  if (!token) return null;
  var sh = sheet_(SHEETS.REG.name);
  var row = findRow_(sh, 1, token);
  if (!row) return null;
  var reg = regFromRow_(sh.getRange(row, 1, 1, 7).getValues()[0]);
  reg.row = row;
  return reg;
}

function regByPhone_(phone) {
  var sh = sheet_(SHEETS.REG.name);
  var row = findRow_(sh, 3, phone, phoneFromCell_);
  if (!row) return null;
  var reg = regFromRow_(sh.getRange(row, 1, 1, 7).getValues()[0]);
  reg.row = row;
  return reg;
}

function surveyRowByToken_(token) {
  var sh = sheet_(SHEETS.SUR.name);
  var row = findRow_(sh, 1, token);
  return row ? { row: row, values: sh.getRange(row, 1, 1, 7).getValues()[0] } : null;
}
