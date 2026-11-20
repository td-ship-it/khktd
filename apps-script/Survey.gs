/**
 * Khảo sát: câu hỏi do Ban tổ chức quản lý trong trang /survey-admin (lưu ở sheet "CauHoi").
 * Người dự chỉ làm khảo sát sau khi điểm danh; mỗi người 1 lần → cấp 1 chứng nhận.
 *
 * Kết quả lưu ở sheet "KhaoSat": 7 cột đầu cố định, từ cột 8 trở đi mỗi câu hỏi một cột.
 * Cột của một câu hỏi không bao giờ đổi/xóa → sửa, ẩn, xóa câu hỏi không làm mất hay lệch dữ liệu cũ.
 */

var QS = {
  name: 'CauHoi',
  headers: ['ID', 'Thứ tự', 'Loại', 'Nội dung câu hỏi', 'Mô tả (tuỳ chọn)', 'Các lựa chọn (mỗi dòng một lựa chọn)',
            'Bắt buộc', 'Hiển thị', 'Cho phép "Khác"', 'Nhãn thấp', 'Nhãn cao', 'Cột trong KhaoSat']
};
var QTYPES = ['rating', 'nps', 'choice', 'dropdown', 'multi', 'yesno', 'short', 'text', 'section'];
var QS_MAX = 60;
var QS_CACHE = 'surveyq';

function surveyBaseHeaders_() {
  return ['Token', 'Họ tên', 'Số điện thoại', 'Email', 'Đơn vị', 'Gửi lúc', 'Mã chứng nhận'];
}

/* ---------- Lưu trữ câu hỏi ---------- */

function questionSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName(QS.name);
  if (sh) return sh;
  try { sh = ss.insertSheet(QS.name); } catch (e) { sh = ss.getSheetByName(QS.name); if (!sh) throw e; }
  sh.getRange(1, 1, 1, QS.headers.length).setValues([QS.headers]).setFontWeight('bold').setBackground('#e6f2f0');
  sh.setFrozenRows(1);
  seedQuestions_(sh, true);
  return sh;
}

function qToRow_(q) {
  return [q.id, q.order, q.type, safeCell_(q.label), safeCell_(q.desc || ''), safeCell_((q.options || []).join('\n')),
          q.required ? 'Có' : 'Không', q.show ? 'Có' : 'Không', q.other ? 'Có' : 'Không',
          safeCell_(q.low || ''), safeCell_(q.high || ''), q.col || 0];
}

function unq_(s) { return String(s == null ? '' : s).replace(/^'(?=[=+\-@])/, ''); }

function rowToQ_(r) {
  var type = String(r[2]);
  return {
    id: String(r[0]), order: Number(r[1]) || 0, type: type,
    label: unq_(r[3]), desc: unq_(r[4]),
    options: unq_(r[5]).split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return x; }),
    required: String(r[6]) === 'Có', show: String(r[7]) === 'Có', other: String(r[8]) === 'Có',
    low: unq_(r[9]), high: unq_(r[10]), col: Number(r[11]) || 0
  };
}

/** Tất cả câu hỏi (kể cả đang ẩn), đã sắp theo thứ tự. */
function loadQuestions_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(QS_CACHE);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var sh = questionSheet_();
  var last = sh.getLastRow();
  var list = [];
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, QS.headers.length).getValues().forEach(function (r, i) {
      if (!r[0] || QTYPES.indexOf(String(r[2])) < 0) return;
      var q = rowToQ_(r); q.row = i + 2; list.push(q);
    });
  }
  list.sort(function (a, b) { return a.order - b.order || a.row - b.row; });
  try { cache.put(QS_CACHE, JSON.stringify(list), 21600); } catch (e) {}
  return list;
}

function invalidateQuestions_() { CacheService.getScriptCache().remove(QS_CACHE); }

function visibleQuestions_() {
  return loadQuestions_().filter(function (q) { return q.show; }).map(function (q) {
    return { id: q.id, type: q.type, label: q.label, desc: q.desc, options: q.options, required: q.required, other: q.other, low: q.low, high: q.high };
  });
}

/** Cột trống kế tiếp trong KhaoSat (không bao giờ dùng lại cột cũ). */
function nextSurveyCol_(list) {
  var m = Math.max(sheet_(SHEETS.SUR.name).getLastColumn(), 7);
  list.forEach(function (q) { if (q.col > m) m = q.col; });
  return m + 1;
}

function setSurveyHeader_(col, label) {
  sheet_(SHEETS.SUR.name).getRange(1, col).setValue(safeCell_(label)).setFontWeight('bold').setBackground('#e6f2f0');
}

/** Nạp bộ câu hỏi mẫu (SURVEY trong Config.gs). legacy=true: lần đầu, giữ đúng vị trí cột của bản cũ. */
function seedQuestions_(sh, legacy) {
  var list = legacy ? [] : loadQuestions_();
  var have = {}; list.forEach(function (q) { have[q.id] = 1; });
  var order = list.reduce(function (m, q) { return Math.max(m, q.order); }, 0);
  var col = legacy ? 8 : nextSurveyCol_(list);
  var rows = [], added = 0;
  SURVEY.questions.forEach(function (d) {
    if (have[d.id]) return;
    var q = {
      id: d.id, order: ++order, type: d.type,
      label: d.label, desc: '', options: d.options || [], required: !!d.required, show: true, other: false,
      low: d.type === 'rating' ? 'Rất kém' : '', high: d.type === 'rating' ? 'Rất tốt' : '', col: col++
    };
    rows.push(qToRow_(q)); added++;
    setSurveyHeader_(q.col, q.label);
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, QS.headers.length).setValues(rows);
  invalidateQuestions_();
  return added;
}

/* ---------- Người dự: làm khảo sát ---------- */

function surveyState_(req) {
  var reg = regByToken_(req.t);
  if (!reg) throw new ApiError('NOT_FOUND', 'Liên kết không hợp lệ.');
  return {
    name: reg.name,
    unit: reg.unit,
    checkedIn: hasCheckin_(reg.token),
    submitted: hasSurvey_(reg.token),
    questions: visibleQuestions_()
  };
}

var OTHER_PREFIX = 'Khác: ';

function pickOne_(q, v, max) {
  v = clean_(v, max || 200);
  if (!v) return '';
  if (q.options.indexOf(v) >= 0) return v;
  if (q.other && v.indexOf(OTHER_PREFIX) === 0 && clean_(v.substring(OTHER_PREFIX.length), 200)) {
    return OTHER_PREFIX + clean_(v.substring(OTHER_PREFIX.length), 200).replace(/;/g, ',');
  }
  throw new ApiError('INVALID', 'Câu "' + q.label + '" không hợp lệ.');
}

/** Trả về giá trị đã kiểm tra của từng câu hỏi đang hiển thị, theo thứ tự câu hỏi. */
function validateAnswers_(raw, questions) {
  var answers = raw && typeof raw === 'object' ? raw : {};
  var out = [];
  questions.forEach(function (q) {
    if (q.type === 'section') return;
    var v = answers[q.id], val = '';
    var bad = function () { return new ApiError('INVALID', 'Câu "' + q.label + '" không hợp lệ.'); };
    if (q.type === 'rating' || q.type === 'nps') {
      var lo = q.type === 'rating' ? 1 : 0, hi = q.type === 'rating' ? 5 : 10;
      if (v !== undefined && v !== null && v !== '') {
        var n = Number(v);
        if (!(n % 1 === 0 && n >= lo && n <= hi)) throw bad();
        val = n;
      }
    } else if (q.type === 'yesno') {
      v = clean_(v, 10);
      if (v && v !== 'Có' && v !== 'Không') throw bad();
      val = v;
    } else if (q.type === 'choice' || q.type === 'dropdown') {
      val = pickOne_(q, v);
    } else if (q.type === 'multi') {
      var arr = Array.isArray(v) ? v.slice(0, 30) : [];
      var seen = {}, res = [];
      arr.forEach(function (x) {
        var p = pickOne_(q, x);
        if (p && !seen[p]) { seen[p] = 1; res.push(p); }
      });
      val = res.join('; ');
    } else if (q.type === 'short') {
      val = safeCell_(clean_(v, 200));
    } else {
      val = safeCell_(clean_(v, 1000));
    }
    if (q.required && (val === '' || val === undefined)) throw new ApiError('REQUIRED', 'Vui lòng trả lời: ' + q.label);
    out.push({ id: q.id, value: val });
  });
  return out;
}

function surveySubmit_(req) {
  var reg = regByToken_(req.t);
  if (!reg) throw new ApiError('NOT_FOUND', 'Liên kết không hợp lệ.');
  var all = loadQuestions_();
  var visible = all.filter(function (q) { return q.show; });
  var vals = validateAnswers_(req.answers, visible);

  var code = withLock_(function () {
    if (!hasCheckin_(reg.token)) {
      throw new ApiError('NOT_CHECKED_IN', 'Bạn chưa điểm danh tại hội nghị nên chưa thể làm khảo sát.');
    }
    var sh = sheet_(SHEETS.SUR.name);
    if (findRow_(sh, 1, reg.token)) {
      throw new ApiError('ALREADY', 'Bạn đã hoàn thành khảo sát trước đó.');
    }
    var colOf = {}, width = Math.max(sh.getLastColumn(), 7);
    all.forEach(function (q) { colOf[q.id] = q.col; if (q.col > width) width = q.col; });
    var certCode = newCertCode_();
    var row = [reg.token, safeCell_(reg.name), reg.phone, safeCell_(reg.email), safeCell_(reg.unit), nowStr_(), certCode];
    for (var i = 7; i < width; i++) row.push('');
    vals.forEach(function (a) { if (colOf[a.id] > 7) row[colOf[a.id] - 1] = a.value; });
    appendRowText_(sh, row, [3]);
    enqueueMail_('certificate', reg.token, reg.email); // gửi sau theo hàng đợi/hạn mức
    return certCode;
  });

  return { certCode: code };
}

/* ---------- Quản trị câu hỏi (chỉ admin) ---------- */

function adminQuestion_(q) {
  return { id: q.id, order: q.order, type: q.type, label: q.label, desc: q.desc, options: q.options,
           required: q.required, show: q.show, other: q.other, low: q.low, high: q.high };
}

function surveyQList_(req) {
  authUser_(req, ['admin']);
  return { questions: loadQuestions_().map(adminQuestion_) };
}

function normQuestion_(r) {
  var type = String(r.type || '');
  if (QTYPES.indexOf(type) < 0) throw new ApiError('INVALID', 'Loại câu hỏi không hợp lệ.');
  var label = clean_(r.label, 300);
  if (!label) throw new ApiError('INVALID', type === 'section' ? 'Vui lòng nhập nội dung tiêu đề.' : 'Vui lòng nhập nội dung câu hỏi.');
  var withOpts = type === 'choice' || type === 'dropdown' || type === 'multi';
  var opts = [];
  if (withOpts) {
    var src = Array.isArray(r.options) ? r.options : String(r.options || '').split(/\r?\n/);
    var seen = {};
    src.forEach(function (o) {
      o = clean_(o, 100).replace(/;/g, ',');
      if (o && !seen[o]) { seen[o] = 1; opts.push(o); }
    });
    if (opts.length < 2) throw new ApiError('INVALID', 'Cần ít nhất 2 lựa chọn (mỗi lựa chọn một dòng).');
    if (opts.length > 20) throw new ApiError('INVALID', 'Tối đa 20 lựa chọn.');
  }
  var scaled = type === 'rating' || type === 'nps';
  return {
    type: type, label: label, desc: clean_(r.desc, 500), options: opts,
    required: type === 'section' ? false : !!r.required,
    show: r.show !== false && r.show !== 'false',
    other: (type === 'choice' || type === 'multi') && !!r.other,
    low: scaled ? clean_(r.low, 40) : '', high: scaled ? clean_(r.high, 40) : ''
  };
}

function surveyQSave_(req) {
  authUser_(req, ['admin']);
  var n = normQuestion_(req);
  return withLock_(function () {
    var sh = questionSheet_();
    invalidateQuestions_();
    var list = loadQuestions_();
    var cur = null;
    if (req.id) {
      list.forEach(function (q) { if (q.id === String(req.id)) cur = q; });
      if (!cur) throw new ApiError('NOT_FOUND', 'Không tìm thấy câu hỏi.');
    } else if (list.length >= QS_MAX) {
      throw new ApiError('LIMIT', 'Tối đa ' + QS_MAX + ' câu hỏi. Hãy xóa bớt câu không dùng.');
    }
    var q = {
      id: cur ? cur.id : 'q_' + randomString_(6).toLowerCase(),
      order: cur ? cur.order : list.reduce(function (m, x) { return Math.max(m, x.order); }, 0) + 1,
      col: cur ? cur.col : 0
    };
    Object.keys(n).forEach(function (k) { q[k] = n[k]; });
    if (q.type !== 'section' && !q.col) q.col = nextSurveyCol_(list);
    if (q.col && (!cur || cur.label !== q.label || !cur.col)) setSurveyHeader_(q.col, q.label);
    var row = qToRow_(q);
    if (cur) sh.getRange(cur.row, 1, 1, row.length).setValues([row]);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    invalidateQuestions_();
    return { question: adminQuestion_(q) };
  });
}

function surveyQDelete_(req) {
  authUser_(req, ['admin']);
  return withLock_(function () {
    var sh = questionSheet_();
    invalidateQuestions_();
    var cur = null;
    loadQuestions_().forEach(function (q) { if (q.id === String(req.id)) cur = q; });
    if (!cur) throw new ApiError('NOT_FOUND', 'Không tìm thấy câu hỏi.');
    sh.deleteRow(cur.row);
    invalidateQuestions_();
    return { deleted: true };
  });
}

function surveyQMove_(req) {
  authUser_(req, ['admin']);
  return withLock_(function () {
    var sh = questionSheet_();
    invalidateQuestions_();
    var list = loadQuestions_();
    var i = -1;
    list.forEach(function (q, k) { if (q.id === String(req.id)) i = k; });
    if (i < 0) throw new ApiError('NOT_FOUND', 'Không tìm thấy câu hỏi.');
    var j = req.dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return { moved: false };
    // đánh lại số thứ tự 1..n để luôn liền mạch, rồi đổi chỗ hai câu
    var t = list[i]; list[i] = list[j]; list[j] = t;
    list.forEach(function (q, k) { sh.getRange(q.row, 2).setValue(k + 1); });
    invalidateQuestions_();
    return { moved: true };
  });
}

/** Hiện / ẩn hàng loạt: req.show = true|false. */
function surveyQBulk_(req) {
  authUser_(req, ['admin']);
  var show = req.show === true || req.show === 'true';
  return withLock_(function () {
    var sh = questionSheet_();
    invalidateQuestions_();
    var list = loadQuestions_();
    list.forEach(function (q) { sh.getRange(q.row, 8).setValue(show ? 'Có' : 'Không'); });
    invalidateQuestions_();
    return { count: list.length };
  });
}

function surveyQSeed_(req) {
  authUser_(req, ['admin']);
  return withLock_(function () {
    var sh = questionSheet_();
    invalidateQuestions_();
    return { added: seedQuestions_(sh, false) };
  });
}

/** Tổng hợp kết quả từng câu hỏi để xem nhanh trong trang quản trị. */
function surveyResults_(req) {
  authUser_(req, ['admin']);
  var qs = loadQuestions_();
  var sh = sheet_(SHEETS.SUR.name);
  var last = sh.getLastRow(), cols = sh.getLastColumn();
  var data = last >= 2 ? sh.getRange(2, 1, last - 1, cols).getValues() : [];
  var items = qs.filter(function (q) { return q.type !== 'section'; }).map(function (q) {
    var vals = [];
    if (q.col > 0 && q.col <= cols) {
      data.forEach(function (r) { var v = r[q.col - 1]; if (v !== '' && v != null) vals.push(v); });
    }
    var it = { id: q.id, label: q.label, type: q.type, show: q.show, answered: vals.length };
    var count = {}, order = [];
    var add = function (k) { k = String(k); if (!(k in count)) { count[k] = 0; order.push(k); } count[k]++; };
    if (q.type === 'rating' || q.type === 'nps') {
      var lo = q.type === 'rating' ? 1 : 0, hi = q.type === 'rating' ? 5 : 10, sum = 0;
      for (var k = lo; k <= hi; k++) { count[String(k)] = 0; order.push(String(k)); }
      vals.forEach(function (v) { v = Number(v); if (v >= lo && v <= hi) { count[String(v)]++; sum += v; } });
      it.avg = vals.length ? Math.round(100 * sum / vals.length) / 100 : null;
    } else if (q.type === 'multi') {
      q.options.forEach(function (o) { count[o] = 0; order.push(o); });
      if (q.other) { count['Khác'] = 0; order.push('Khác'); }
      vals.forEach(function (v) { String(v).split('; ').forEach(function (x) { if (x) add(x.indexOf(OTHER_PREFIX) === 0 ? 'Khác' : x); }); });
    } else if (q.type === 'choice' || q.type === 'dropdown' || q.type === 'yesno') {
      if (q.type === 'yesno') { count['Có'] = 0; count['Không'] = 0; order.push('Có', 'Không'); }
      else { q.options.forEach(function (o) { count[o] = 0; order.push(o); }); if (q.other) { count['Khác'] = 0; order.push('Khác'); } }
      vals.forEach(function (v) { add(String(v).indexOf(OTHER_PREFIX) === 0 ? 'Khác' : v); });
    } else {
      it.texts = vals.slice(-30).reverse().map(String);
    }
    if (q.type !== 'short' && q.type !== 'text') it.dist = order.map(function (k) { return { k: k, n: count[k] }; });
    return it;
  });
  return { total: data.length, items: items };
}
