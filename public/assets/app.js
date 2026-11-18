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

  window.App = { $, qs, call, getConfig, fillEvent, showError, hide, staffGate, logout, esc, beep, token: null, user: null };

  // Chân trang chung cho mọi trang (trừ trang đặt data-nofoot trên <body>).
  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.hasAttribute('data-nofoot')) return;
    document.body.insertAdjacentHTML('beforeend',
      '<footer class="foot">Phát triển bởi Bộ môn Công nghệ thông tin dược phối hợp cùng Ban tổ chức Hội nghị</footer>');
  });
})();
