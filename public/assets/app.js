/* Tiện ích dùng chung cho mọi trang. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const qs = new URLSearchParams(location.search);

  async function call(action, data = {}) {
    let res;
    try {
      res = await fetch('/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...data })
      });
    } catch {
      throw Object.assign(new Error('Mất kết nối mạng. Vui lòng thử lại.'), { code: 'NETWORK' });
    }
    let j;
    try { j = await res.json(); } catch { throw Object.assign(new Error('Máy chủ phản hồi không hợp lệ.'), { code: 'BAD' }); }
    if (!j.ok) {
      if (j.code === 'AUTH' && sessionStorage.getItem('tok') && action !== 'whoami') { sessionStorage.removeItem('tok'); location.reload(); }
      throw Object.assign(new Error(j.message || 'Có lỗi xảy ra.'), { code: j.code });
    }
    return j.data;
  }

  async function getConfig() {
    try {
      const c = JSON.parse(sessionStorage.getItem('cfg') || 'null');
      if (c && Date.now() - c.at < 300000) return c.v;
    } catch {}
    const v = await call('config');
    try { sessionStorage.setItem('cfg', JSON.stringify({ at: Date.now(), v })); } catch {}
    return v;
  }

  async function fillEvent(titleSuffix) {
    try {
      const cfg = await getConfig();
      const tidy = v => String(v || '').trim().replace(/^\[(.*)\]$/s, '$1').replace(/^(giờ bắt đầu|thời gian|địa điểm|địa chỉ|ngày diễn ra|ngày)\s*:\s*/i, '').trim();
      document.querySelectorAll('[data-ev]').forEach(el => { el.textContent = tidy(cfg.event[el.dataset.ev]); });
      document.querySelectorAll('[data-item]').forEach(it => { if (!tidy(cfg.event[it.dataset.item])) it.classList.add('hidden'); });
      document.title = (titleSuffix ? titleSuffix + ' · ' : '') + cfg.event.shortName;
      return cfg;
    } catch { return null; }
  }

  function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden', 'ok'); el.classList.add('err'); }
  function hide(el) { el.classList.add('hidden'); }

  /* Cổng đăng nhập (Ban tổ chức / người hỗ trợ). Token phiên giữ trong sessionStorage của tab. */
  function staffGate(onReady) {
    const gate = $('#gate'), app = $('#app');
    const start = u => {
      App.user = u; App.token = sessionStorage.getItem('tok');
      gate.classList.add('hidden'); app.classList.remove('hidden'); onReady(u);
    };
    gate.innerHTML = `
      <div class="card"><h2>Đăng nhập</h2>
        <form id="gf">
          <label for="gu">Tên đăng nhập</label>
          <input id="gu" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required>
          <label for="gp">Mật khẩu</label>
          <input id="gp" type="password" autocomplete="current-password" required>
          <div id="ge" class="alert err hidden" role="alert"></div>
          <button class="btn">Đăng nhập</button></form></div>`;
    $('#gf').addEventListener('submit', async ev => {
      ev.preventDefault(); hide($('#ge'));
      const btn = $('#gf button'); btn.disabled = true;
      try {
        const u = await call('login', { username: $('#gu').value, password: $('#gp').value });
        sessionStorage.setItem('tok', u.token); start(u);
      } catch (e) { showError($('#ge'), e.message); }
      finally { btn.disabled = false; }
    });
    const saved = sessionStorage.getItem('tok');
    if (saved) call('whoami', { token: saved }).then(start).catch(() => sessionStorage.removeItem('tok'));
  }

  function logout() { sessionStorage.removeItem('tok'); location.reload(); }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function beep(ok) {
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)();
      const o = a.createOscillator(), g = a.createGain();
      o.frequency.value = ok ? 880 : 220; g.gain.value = 0.08;
      o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + (ok ? 0.12 : 0.35));
    } catch {}
  }

  /* Hiển thị / thu thập câu hỏi khảo sát (dùng chung cho trang khảo sát và bản xem trước trong quản trị). */
  const TYPE_NAMES = {
    rating: 'Chấm điểm 1–5', nps: 'Thang điểm 0–10', choice: 'Chọn một đáp án', dropdown: 'Danh sách thả xuống',
    multi: 'Chọn nhiều đáp án', yesno: 'Có / Không', short: 'Trả lời ngắn', text: 'Trả lời dài', section: 'Tiêu đề / ghi chú'
  };
  function renderQuestion(q) {
    const id = esc(q.id), opts = q.options || [];
    if (q.type === 'section') {
      return `<div class="q sec"><h3>${esc(q.label)}</h3>${q.desc ? `<div class="qd">${esc(q.desc)}</div>` : ''}</div>`;
    }
    const other = (kind) => q.other
      ? `<label class="oth"><input type="${kind}" name="${id}" value="__other"><span>Khác:</span><input type="text" class="othtxt" maxlength="200" placeholder="Nhập nội dung…" aria-label="Nội dung khác"></label>` : '';
    let body = '';
    if (q.type === 'rating' || q.type === 'nps') {
      const from = q.type === 'rating' ? 1 : 0, to = q.type === 'rating' ? 5 : 10;
      const nums = []; for (let n = from; n <= to; n++) nums.push(n);
      body = '<div class="pills">' + nums.map(n => `<label class="pill"><input type="radio" name="${id}" value="${n}"><span>${n}</span></label>`).join('') + '</div>' +
        `<div class="scale"><span>${from} = ${esc(q.low || (q.type === 'rating' ? 'Rất kém' : 'Hoàn toàn không'))}</span><span>${to} = ${esc(q.high || (q.type === 'rating' ? 'Rất tốt' : 'Chắc chắn có'))}</span></div>`;
    } else if (q.type === 'yesno') {
      body = '<div class="pills">' + ['Có', 'Không'].map(v => `<label class="pill"><input type="radio" name="${id}" value="${v}"><span>${v}</span></label>`).join('') + '</div>';
    } else if (q.type === 'choice') {
      body = '<div class="opts">' + opts.map(o => `<label><input type="radio" name="${id}" value="${esc(o)}">${esc(o)}</label>`).join('') + other('radio') + '</div>';
    } else if (q.type === 'multi') {
      body = '<div class="opts">' + opts.map(o => `<label><input type="checkbox" name="${id}" value="${esc(o)}">${esc(o)}</label>`).join('') + other('checkbox') + '</div>';
    } else if (q.type === 'dropdown') {
      body = `<select name="${id}"><option value="">— Chọn —</option>` + opts.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('') + '</select>';
    } else if (q.type === 'short') {
      body = `<input type="text" name="${id}" maxlength="200">`;
    } else {
      body = `<textarea name="${id}" maxlength="1000"></textarea>`;
    }
    return `<div class="q"><div class="t">${esc(q.label)}${q.required ? ' <span class="req">*</span>' : ''}</div>${q.desc ? `<div class="qd">${esc(q.desc)}</div>` : ''}${body}</div>`;
  }
  function collectAnswers(questions, root) {
    root = root || document;
    const a = {}, all = id => [...root.querySelectorAll(`[name="${id}"]`)];
    const otherTxt = el => { const t = el.closest('label').querySelector('.othtxt'); return t && t.value.trim() ? 'Khác: ' + t.value.trim() : ''; };
    questions.forEach(q => {
      if (q.type === 'section') return;
      const els = all(q.id);
      if (q.type === 'multi') {
        a[q.id] = els.filter(e => e.checked).map(e => e.value === '__other' ? otherTxt(e) : e.value).filter(Boolean);
      } else if (q.type === 'choice' || q.type === 'rating' || q.type === 'nps' || q.type === 'yesno') {
        const c = els.find(e => e.checked);
        a[q.id] = c ? (c.value === '__other' ? otherTxt(c) : c.value) : '';
      } else a[q.id] = els[0] ? els[0].value : '';
    });
    return a;
  }
  // Gõ vào ô "Khác" thì tự chọn đáp án "Khác".
  document.addEventListener('input', e => {
    if (e.target.classList && e.target.classList.contains('othtxt')) {
      const r = e.target.closest('label').querySelector('input:not(.othtxt)'); if (r) r.checked = true;
    }
  });

  window.App = { $, qs, call, getConfig, fillEvent, showError, hide, staffGate, logout, esc, beep, renderQuestion, collectAnswers, TYPE_NAMES, token: null, user: null };

  // Chân trang chung cho mọi trang (trừ trang đặt data-nofoot trên <body>).
  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.hasAttribute('data-nofoot')) return;
    document.body.insertAdjacentHTML('beforeend',
      '<footer class="foot">Phát triển bởi Bộ môn Công nghệ thông tin dược phối hợp cùng Ban tổ chức Hội nghị</footer>');
  });
})();
