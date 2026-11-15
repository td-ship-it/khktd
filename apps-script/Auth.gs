/**
 * Tài khoản & phân quyền.
 *  - Tài khoản "admin" (mật khẩu = Script Property ADMIN_PASSWORD): toàn quyền.
 *  - Tài khoản tạo trong trang quản trị, 2 vai trò:
 *      admin : toàn quyền (thống kê, danh sách, xuất dữ liệu, người dùng, khóa/mở điểm danh)
 *      staff : chỉ dùng công cụ ngày hội nghị (màn hình QR điểm danh, quét QR, kiosk)
 *  - Đăng nhập trả về token ký HMAC (hết hạn sau LIMITS.tokenHours giờ). Đổi mật khẩu hoặc khóa tài khoản
 *    làm token cũ mất hiệu lực ngay.
 */

var ROLES = { admin: 'Quản trị', staff: 'Hỗ trợ điểm danh' };

function usersSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEETS.USER.name);
  if (!sh) {
    sh = ss.insertSheet(SHEETS.USER.name);
    sh.getRange(1, 1, 1, SHEETS.USER.headers.length).setValues([SHEETS.USER.headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function passHash_(username, password) { return 'h1:' + hmacHex_('u:' + username + ':' + password); }

function masterUser_() {
  var pw = prop_('ADMIN_PASSWORD');
  if (!pw) return null;
  return { username: 'admin', name: 'Quản trị viên', role: 'admin', active: true, hash: passHash_('admin', pw), builtin: true, createdAt: '', lastLogin: '' };
}

function loadUsers_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('users');
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* đọc lại từ sheet */ } }
  var sh = usersSheet_(), map = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().forEach(function (r) {
      var u = String(r[0]).toLowerCase();
      if (!u) return;
      map[u] = { username: u, name: String(r[1]), role: String(r[2]), active: String(r[3]) === 'active', hash: String(r[4]), createdAt: String(r[5]), lastLogin: String(r[6]) };
    });
  }
  cache.put('users', JSON.stringify(map), 300);
  return map;
}

function invalidateUsers_() { CacheService.getScriptCache().remove('users'); }

function findUser_(username) {
  username = String(username || '').toLowerCase();
  if (username === 'admin') return masterUser_();
  return loadUsers_()[username] || null;
}

/* ---------- Đăng nhập & token ---------- */

function makeToken_(u) {
  var exp = Date.now() + LIMITS.tokenHours * 3600 * 1000;
  var payload = u.username + '|' + exp + '|' + u.hash.substring(3, 11);
  return Utilities.base64EncodeWebSafe(payload) + '.' + hmacHex_('tok:' + payload).substring(0, 40);
}

function authUser_(req, roles) {
  var fail = function (m) { return new ApiError('AUTH', m || 'Vui lòng đăng nhập.'); };
  var t = String(req.token || ''), i = t.lastIndexOf('.');
  if (i < 1) throw fail();
  var payload;
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(t.substring(0, i))).getDataAsString(); } catch (e) { throw fail(); }
  if (!safeEq_(t.substring(i + 1), hmacHex_('tok:' + payload).substring(0, 40))) throw fail();
  var p = payload.split('|');
  if (p.length !== 3 || Number(p[1]) < Date.now()) throw fail('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  var u = findUser_(p[0]);
  if (!u || !u.active || u.hash.substring(3, 11) !== p[2]) throw fail('Tài khoản đã bị khóa hoặc đổi mật khẩu. Vui lòng đăng nhập lại.');
  if (roles && roles.indexOf(u.role) < 0) throw new ApiError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
  return u;
}

function login_(req) {
  var username = clean_(req.username, 40).toLowerCase();
  var password = String(req.password || '');
  var cache = CacheService.getScriptCache();
  var ipKey = 'fail_ip_' + clean_(req.ip || 'unknown', 45).replace(/[^\w.:]/g, '_');
  var userKey = 'fail_u_' + username.replace(/[^\w.\-]/g, '_');
  var ipFails = Number(cache.get(ipKey)) || 0, userFails = Number(cache.get(userKey)) || 0;
  if (ipFails >= 10 || userFails >= 15) throw new ApiError('LOCKED', 'Nhập sai quá nhiều lần. Vui lòng thử lại sau 10 phút.');

  var u = username ? findUser_(username) : null;
  if (!u || !u.active || !safeEq_(u.hash, passHash_(u.username, password))) {
    cache.put(ipKey, String(ipFails + 1), 600);
    cache.put(userKey, String(userFails + 1), 600);
    throw new ApiError('FORBIDDEN', 'Tên đăng nhập hoặc mật khẩu không đúng.');
  }
  if (!u.builtin) {
    try {
      withLock_(function () {
        var sh = usersSheet_(), row = findRow_(sh, 1, u.username);
        if (row) sh.getRange(row, 7).setValue(nowStr_());
        invalidateUsers_();
      });
    } catch (e) { /* không chặn đăng nhập nếu chỉ lỗi ghi giờ đăng nhập */ }
  }
  return { token: makeToken_(u), username: u.username, name: u.name, role: u.role };
}

/* ---------- Quản lý người dùng (chỉ vai trò admin) ---------- */

function userList_(req) {
  authUser_(req, ['admin']);
  var map = loadUsers_();
  var rows = Object.keys(map).sort().map(function (k) {
    var u = map[k];
    return { username: u.username, name: u.name, role: u.role, active: u.active, createdAt: u.createdAt, lastLogin: u.lastLogin, builtin: false };
  });
  var m = masterUser_();
  if (m) rows.unshift({ username: m.username, name: m.name, role: m.role, active: true, createdAt: '', lastLogin: '', builtin: true });
  return { users: rows };
}

function userSave_(req) {
  var me = authUser_(req, ['admin']);
  var username = clean_(req.username, 30).toLowerCase();
  var name = clean_(req.name, 80);
  var role = String(req.role || '');
  var password = String(req.password || '');
  var active = req.active !== false;

  if (!/^[a-z][a-z0-9._-]{2,29}$/.test(username)) throw new ApiError('INVALID', 'Tên đăng nhập gồm 3–30 ký tự thường (a–z, 0–9, . _ -) và bắt đầu bằng chữ cái.');
  if (username === 'admin') throw new ApiError('INVALID', 'Tài khoản "admin" được quản lý bằng Script Property ADMIN_PASSWORD, không sửa tại đây.');
  if (name.length < 2) throw new ApiError('INVALID', 'Vui lòng nhập họ tên.');
  if (!ROLES[role]) throw new ApiError('INVALID', 'Vai trò không hợp lệ.');
  if (password && password.length < 6) throw new ApiError('INVALID', 'Mật khẩu tối thiểu 6 ký tự.');

  withLock_(function () {
    var sh = usersSheet_(), row = findRow_(sh, 1, username);
    if (!row) {
      if (!password) throw new ApiError('INVALID', 'Vui lòng đặt mật khẩu cho tài khoản mới.');
      sh.appendRow([username, safeCell_(name), role, active ? 'active' : 'disabled', passHash_(username, password), nowStr_(), '']);
    } else {
      if (username === me.username && (role !== 'admin' || !active)) {
        throw new ApiError('INVALID', 'Không thể tự hạ quyền hoặc tự khóa tài khoản của chính bạn.');
      }
      sh.getRange(row, 2, 1, 3).setValues([[safeCell_(name), role, active ? 'active' : 'disabled']]);
      if (password) sh.getRange(row, 5).setValue(passHash_(username, password));
    }
    invalidateUsers_();
  });
  return { ok: true };
}

function userDelete_(req) {
  var me = authUser_(req, ['admin']);
  var username = clean_(req.username, 30).toLowerCase();
  if (username === 'admin') throw new ApiError('INVALID', 'Không thể xóa tài khoản admin.');
  if (username === me.username) throw new ApiError('INVALID', 'Không thể tự xóa tài khoản của chính bạn.');
  withLock_(function () {
    var sh = usersSheet_(), row = findRow_(sh, 1, username);
    if (!row) throw new ApiError('NOT_FOUND', 'Không tìm thấy người dùng.');
    sh.deleteRow(row);
    invalidateUsers_();
  });
  return { ok: true };
}

/* ---------- Khóa / mở điểm danh ---------- */

function checkinState_() {
  return { open: prop_('CHECKIN_OPEN') === '1', by: prop_('CHECKIN_BY') || '', at: prop_('CHECKIN_AT') || '' };
}

function ensureCheckinOpen_() {
  if (prop_('CHECKIN_OPEN') !== '1') {
    throw new ApiError('CHECKIN_CLOSED', 'Điểm danh hiện đang khóa. Vui lòng liên hệ Ban tổ chức.');
  }
}

function setCheckin_(req) {
  var me = authUser_(req, ['admin']);
  PropertiesService.getScriptProperties().setProperties({
    CHECKIN_OPEN: req.open === true ? '1' : '0',
    CHECKIN_BY: me.username,
    CHECKIN_AT: nowStr_()
  });
  return checkinState_();
}
