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
    if (!j.ok) throw Object.assign(new Error(j.message || 'Có lỗi xảy ra.'), { code: j.code });
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
      document.querySelectorAll('[data-ev]').forEach(el => { el.textContent = cfg.event[el.dataset.ev] || ''; });
      document.title = (titleSuffix ? titleSuffix + ' · ' : '') + cfg.event.shortName;
      return cfg;
    } catch { return null; }
  }

  function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden', 'ok'); el.classList.add('err'); }
  function hide(el) { el.classList.add('hidden'); }

  /* Cổng đăng nhập nhân viên: mật khẩu giữ trong sessionStorage của tab. */
  function staffGate(onReady) {
    const gate = $('#gate'), app = $('#app');
    const start = pw => { App.pw = pw; gate.classList.add('hidden'); app.classList.remove('hidden'); onReady(pw); };
    const saved = sessionStorage.getItem('pw');
    gate.innerHTML = `
      <div class="card"><h2>Đăng nhập Ban tổ chức</h2>
        <form id="gf"><label for="gp">Mật khẩu</label>
          <input id="gp" type="password" autocomplete="current-password" required>
          <div id="ge" class="alert err hidden" role="alert"></div>
          <button class="btn">Đăng nhập</button></form></div>`;
    async function tryLogin(pw, silent) {
      try { await call('admin_ping', { pw }); sessionStorage.setItem('pw', pw); start(pw); }
      catch (e) { sessionStorage.removeItem('pw'); if (!silent) showError($('#ge'), e.message); }
    }
    $('#gf').addEventListener('submit', ev => { ev.preventDefault(); tryLogin($('#gp').value, false); });
    if (saved) tryLogin(saved, true);
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function beep(ok) {
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)();
      const o = a.createOscillator(), g = a.createGain();
      o.frequency.value = ok ? 880 : 220; g.gain.value = 0.08;
      o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + (ok ? 0.12 : 0.35));
    } catch {}
  }

  window.App = { $, qs, call, getConfig, fillEvent, showError, hide, staffGate, esc, beep, pw: null };
})();
