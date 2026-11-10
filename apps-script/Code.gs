/**
 * Điểm vào của Web App. Chỉ Cloudflare Worker gọi vào đây (POST JSON kèm API_KEY).
 * Phản hồi luôn có dạng { ok:true, data } hoặc { ok:false, code, message }.
 */

function doGet() {
  return json_({ ok: true, data: { service: 'hoi-nghi-duoc-43', status: 'up' } });
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!safeEq_(req.key, prop_('API_KEY'))) throw new ApiError('UNAUTHORIZED', 'Không có quyền truy cập.');
    var handler = ROUTES[req.action];
    if (!handler) throw new ApiError('BAD_ACTION', 'Yêu cầu không hợp lệ.');
    out = { ok: true, data: handler(req) };
  } catch (err) {
    if (err instanceof ApiError) {
      out = { ok: false, code: err.code, message: err.message };
    } else {
      console.error(err && err.stack ? err.stack : err);
      out = { ok: false, code: 'SERVER', message: 'Có lỗi hệ thống, vui lòng thử lại.' };
    }
  }
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

var ROUTES = {
  config:          function () { return { event: publicEvent_(), survey: SURVEY.questions }; },
  register:        function (r) { return register_(r); },
  checkin_phone:   function (r) { return checkinPhone_(r); },
  checkin_token:   function (r) { return checkinToken_(r); },
  survey_state:    function (r) { return surveyState_(r); },
  survey_submit:   function (r) { return surveySubmit_(r); },
  certificate:     function (r) { return certificate_(r); },
  certificate_pdf: function (r) { return certificatePdf_(r); },
  verify:          function (r) { return verify_(r); },
  admin_ping:      function (r) { requireAdmin_(r); return { ok: true }; },
  admin_stats:     function (r) { requireAdmin_(r); return adminStats_(); },
  admin_export:    function (r) { requireAdmin_(r); return adminExport_(r); },
  admin_hallcode:  function (r) { requireAdmin_(r); return currentHallCode_(); }
};

/* ---------- Xác thực quản trị (chống dò mật khẩu theo IP) ---------- */

function requireAdmin_(req) {
  var cache = CacheService.getScriptCache();
  var ipKey = 'fail_' + clean_(req.ip || 'unknown', 45).replace(/[^\w.:]/g, '_');
  var fails = Number(cache.get(ipKey)) || 0;
  if (fails >= 10) throw new ApiError('LOCKED', 'Nhập sai quá nhiều lần. Vui lòng thử lại sau 10 phút.');
  var pw = prop_('ADMIN_PASSWORD');
  if (!pw || !safeEq_(req.pw, pw)) {
    cache.put(ipKey, String(fails + 1), 600);
    throw new ApiError('FORBIDDEN', 'Mật khẩu không đúng.');
  }
}
