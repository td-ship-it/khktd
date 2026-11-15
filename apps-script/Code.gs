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
  // công khai
  config:          function () { return { event: publicEvent_(), survey: SURVEY.questions }; },
  register:        function (r) { return register_(r); },
  checkin_status:  function () { return { open: checkinState_().open }; },
  checkin_phone:   function (r) { return checkinPhone_(r); },
  survey_state:    function (r) { return surveyState_(r); },
  survey_submit:   function (r) { return surveySubmit_(r); },
  certificate:     function (r) { return certificate_(r); },
  certificate_pdf: function (r) { return certificatePdf_(r); },
  verify:          function (r) { return verify_(r); },
  login:           function (r) { return login_(r); },
  // cần đăng nhập (admin hoặc staff)
  whoami:          function (r) { var u = authUser_(r); return { username: u.username, name: u.name, role: u.role }; },
  checkin_token:   function (r) { return checkinToken_(r); },
  admin_hallcode:  function (r) {
    authUser_(r, ['admin', 'staff']);
    var h = currentHallCode_();
    h.open = checkinState_().open;
    return h;
  },
  // chỉ admin
  admin_stats:       function (r) { authUser_(r, ['admin']); return adminStats_(); },
  admin_list:        function (r) { authUser_(r, ['admin']); return adminList_(); },
  admin_export:      function (r) { authUser_(r, ['admin']); return adminExport_(r); },
  admin_set_checkin: function (r) { return setCheckin_(r); },
  user_list:         function (r) { return userList_(r); },
  user_save:         function (r) { return userSave_(r); },
  user_delete:       function (r) { return userDelete_(r); }
};
