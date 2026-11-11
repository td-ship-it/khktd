/** Khảo sát: chỉ người đã điểm danh mới được gửi; mỗi người 1 lần → cấp 1 chứng nhận. */

function surveyState_(req) {
  var reg = regByToken_(req.t);
  if (!reg) throw new ApiError('NOT_FOUND', 'Liên kết không hợp lệ.');
  return {
    name: reg.name,
    unit: reg.unit,
    checkedIn: hasCheckin_(reg.token),
    submitted: hasSurvey_(reg.token)
  };
}

function validateAnswers_(raw) {
  var answers = raw && typeof raw === 'object' ? raw : {};
  var cells = [];
  SURVEY.questions.forEach(function (q) {
    var v = answers[q.id];
    var out = '';
    if (q.type === 'rating') {
      var n = parseInt(v, 10);
      if (v !== undefined && v !== '' && !(n >= 1 && n <= 5)) throw new ApiError('INVALID', 'Câu "' + q.label + '" không hợp lệ.');
      out = isNaN(n) ? '' : n;
    } else if (q.type === 'choice') {
      v = clean_(v, 200);
      if (v && q.options.indexOf(v) < 0) throw new ApiError('INVALID', 'Câu "' + q.label + '" không hợp lệ.');
      out = v;
    } else if (q.type === 'multi') {
      var arr = Array.isArray(v) ? v : [];
      arr = arr.map(function (x) { return clean_(x, 200); }).filter(function (x) { return x; });
      arr.forEach(function (x) {
        if (q.options.indexOf(x) < 0) throw new ApiError('INVALID', 'Câu "' + q.label + '" không hợp lệ.');
      });
      out = arr.join('; ');
    } else {
      out = safeCell_(clean_(v, 1000));
    }
    if (q.required && (out === '' || out === undefined)) {
      throw new ApiError('REQUIRED', 'Vui lòng trả lời: ' + q.label);
    }
    cells.push(out);
  });
  return cells;
}

function surveySubmit_(req) {
  var reg = regByToken_(req.t);
  if (!reg) throw new ApiError('NOT_FOUND', 'Liên kết không hợp lệ.');
  var cells = validateAnswers_(req.answers);

  var code = withLock_(function () {
    if (!hasCheckin_(reg.token)) {
      throw new ApiError('NOT_CHECKED_IN', 'Bạn chưa điểm danh tại hội nghị nên chưa thể làm khảo sát.');
    }
    var sh = sheet_(SHEETS.SUR.name);
    if (findRow_(sh, 1, reg.token)) {
      throw new ApiError('ALREADY', 'Bạn đã hoàn thành khảo sát trước đó.');
    }
    var certCode = newCertCode_();
    appendRowText_(sh, [reg.token, safeCell_(reg.name), reg.phone, safeCell_(reg.email), safeCell_(reg.unit), nowStr_(), certCode].concat(cells), [3]);
    enqueueMail_('certificate', reg.token, reg.email); // gửi sau theo hàng đợi/hạn mức
    return certCode;
  });

  return { certCode: code };
}
