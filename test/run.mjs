// Kiểm thử logic backend Apps Script bằng bộ giả lập GAS trong bộ nhớ + kiểm thử Worker.
// Chạy: node test/run.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gasDir = path.join(root, 'apps-script');

/* ---------- giả lập Google Apps Script ---------- */
const props = {}, cache = {}, sentMails = []; let quota = 1500, uuidN = 0;
const books = {};
function mkSheet(name) {
  const sh = { name, rows: [] };
  const grid = (r, c, nr, nc) => { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((sh.rows[r - 1 + i] || [])[c - 1 + j] ?? ''); o.push(row); } return o; };
  const chain = new Proxy({}, { get: () => () => chain });
  sh.getLastRow = () => sh.rows.length;
  sh.getLastColumn = () => Math.max(0, ...sh.rows.map(r => r.length));
  sh.getMaxRows = () => 1000;
  sh.setFrozenRows = () => {};
  sh.setName = n => { sh.name = n; return sh; };
  sh.appendRow = arr => { sh.rows.push(arr.map(v => (typeof v === 'string' && v.startsWith("'")) ? v.slice(1) : v)); };
  sh.deleteRow = n => { sh.rows.splice(n - 1, 1); };
  sh.getRange = (r, c, nr = 1, nc = 1) => ({
    getValues: () => grid(r, c, nr, nc), getDisplayValues: () => grid(r, c, nr, nc).map(x => x.map(String)),
    setValues: vals => { vals.forEach((row, i) => row.forEach((v, j) => { (sh.rows[r - 1 + i] ||= [])[c - 1 + j] = v; })); return chain; },
    setValue: v => { (sh.rows[r - 1] ||= [])[c - 1] = v; return chain; },
    setNumberFormat: () => chain, setFontWeight: () => chain, setBackground: () => chain
  });
  return sh;
}
function mkBook() {
  const id = 'sheet' + Object.keys(books).length; const b = { id, sheets: [mkSheet('Sheet1')] };
  b.getId = () => id; b.getUrl = () => 'https://docs.google.com/' + id;
  b.getSheets = () => b.sheets; b.getSheetByName = n => b.sheets.find(s => s.name === n) || null;
  b.insertSheet = n => { const s = mkSheet(n); b.sheets.push(s); return s; };
  books[id] = b; return b;
}
const tz = d => new Date(d.getTime() + 7 * 3600e3).toISOString();
const blob = (bytes, name = 'b', type = 'application/octet-stream') => ({
  getBytes: () => bytes, getName: () => name, setName(n) { name = n; return this; },
  getAs(t) { return blob(Buffer.from('%PDF-1.4 fake ' + Buffer.from(bytes).length), name.replace('.html', '.pdf'), t); }
});
const gas = {
  console, JSON, Math, Date, Number, String, Array, Object, Error, RegExp, parseInt, isNaN,
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  SpreadsheetApp: { create: () => mkBook(), openById: id => books[id] },
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => {} }) }) }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
  Logger: { log: () => {} },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) },
  MailApp: { sendEmail: o => { sentMails.push(o); quota--; }, getRemainingDailyQuota: () => quota },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getBlob: () => blob(Buffer.from('PNG'), 'qr.png', 'image/png') }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    getUuid: () => crypto.randomUUID(),
    computeDigest: (_a, s) => [...crypto.createHash('sha256').update(String(s)).digest()].map(b => b > 127 ? b - 256 : b),
    computeHmacSha256Signature: (m, k) => [...crypto.createHmac('sha256', k).update(m).digest()].map(b => b > 127 ? b - 256 : b),
    formatDate: (d, _z, f) => { const s = tz(d); return f === 'yyyyMMdd' ? s.slice(0, 10).replace(/-/g, '') : s.slice(0, 19).replace('T', ' '); },
    base64Encode: b => Buffer.from(b).toString('base64'),
    newBlob: (data, type, name) => blob(Buffer.from(data), name, type)
  }
};
const ctx = vm.createContext(gas);
const files = ['Config', 'Utils', 'Code', 'Registration', 'Checkin', 'Survey', 'Certificate', 'Mail', 'Admin', 'Setup'];
const src = files.map(f => fs.readFileSync(path.join(gasDir, f + '.gs'), 'utf8')).join('\n;\n');
vm.runInContext(src + '\n;this.__x={doPost,setup,processMailQueue_,LIMITS,normalizePhone_,maskName_,validHallCode_,currentHallCode_,SURVEY,EVENT,sentToday_,safeCell_,hallCodeForSlot_,fixPhoneColumns};', ctx);
const G = ctx.__x;

props.SITE_URL = 'https://hoi-nghi.example.workers.dev';
props.STATIC_ADMIN = '';
G.setup();
const KEY = props.API_KEY, PW = props.ADMIN_PASSWORD;
assert.ok(KEY && PW && props.SPREADSHEET_ID, 'setup tạo khoá & sheet');

const api = (action, data = {}, extra = {}) => JSON.parse(G.doPost({ postData: { contents: JSON.stringify({ action, key: KEY, ip: '1.1.1.1', ...data, ...extra }) } }).getContent());
let n = 0; const ok = (name) => console.log('  ✓', name);

/* ---------- hàm thuần ---------- */
assert.equal(G.normalizePhone_('+84 912 345 678'), '0912345678');
assert.equal(G.normalizePhone_('0912.345.678'), '0912345678');
assert.equal(G.maskName_('Nguyễn Văn An'), 'Nguyễn V* An'); ok('chuẩn hoá SĐT, che tên');
assert.equal(api('config', {}, { key: 'sai' }).code, 'UNAUTHORIZED'); ok('từ chối sai API_KEY');
assert.equal(api('nope').code, 'BAD_ACTION');

/* ---------- đăng ký ---------- */
const reg = d => api('register', { name: 'Nguyễn Văn An', phone: '0912 345 678', email: 'An@Example.com', unit: 'Bệnh viện A', ...d });
assert.equal(reg({ phone: '123' }).code, 'INVALID');
assert.equal(reg({ email: 'x' }).code, 'INVALID');
const r1 = reg(); assert.ok(r1.ok && r1.data.token.startsWith('D43-') && !r1.data.duplicate);
assert.equal(sentMails.length, 1, 'mail đăng ký gửi ngay'); assert.equal(sentMails[0].to, 'an@example.com');
assert.ok(sentMails[0].htmlBody.includes(r1.data.token) && sentMails[0].inlineImages.qr);
const T = r1.data.token;
const r2 = reg(); assert.ok(r2.data.duplicate && r2.data.token === T); assert.equal(sentMails.length, 2, 'gửi lại mail');
assert.equal(reg({ email: 'khac@example.com' }).code, 'PHONE_EXISTS');
assert.equal(reg({ phone: '0944444444' }).code, 'EMAIL_EXISTS');
reg(); reg(); assert.equal(reg().code, 'RESEND_LIMIT');
assert.ok(api('register', { name: 'Bot', phone: '0900000001', email: 'b@b.vn', unit: 'x', website: 'spam' }).ok);
assert.equal(api('admin_stats', { pw: PW }).data.registered, 1, 'honeypot không tạo bản ghi'); ok('đăng ký, trùng SĐT, gửi lại, honeypot');
assert.equal(reg({ name: '=HYPERLINK("x")', phone: '0900000009', email: 'z@z.vn' }).ok, true);
ok('chống công thức trong Sheet');

/* ---------- khảo sát bị chặn khi chưa điểm danh ---------- */
const answers = { q_content: 5, q_speakers: 4, q_org: 5, q_venue: 3, q_topics: ['Dược lâm sàng'], q_next: 'Chắc chắn có', q_comment: 'Tốt' };
assert.equal(api('survey_submit', { t: T, answers }).code, 'NOT_CHECKED_IN');
assert.equal(api('survey_state', { t: T }).data.checkedIn, false); ok('chặn khảo sát khi chưa điểm danh');

/* ---------- 3 cách điểm danh ---------- */
assert.equal(api('checkin_phone', { phone: '0912345678', code: 'SAI123' }).code, 'BAD_CODE');
const hc = api('admin_hallcode', { pw: PW }).data; assert.equal(hc.code.length, 6);
const h = api('checkin_phone', { phone: '0912345678', code: hc.code });
assert.ok(h.ok && h.data.token === T && !h.data.already && h.data.name.includes('*')); ok('QR chung + SĐT (che tên)');
assert.ok(api('checkin_phone', { phone: '0912345678', code: hc.code }).data.already); ok('điểm danh lặp là idempotent');
assert.equal(api('checkin_phone', { phone: '0999999999', code: hc.code }).code, 'NOT_FOUND');
const slot = Math.floor(Date.now() / 90000);
assert.ok(G.validHallCode_(G.hallCodeForSlot_(slot - 2)) && !G.validHallCode_(G.hallCodeForSlot_(slot - 3))); ok('mã QR chung hết hạn sau ~4,5 phút');
assert.equal(api('checkin_phone', { phone: '0900000009', pw: 'sai' }).code, 'FORBIDDEN');
const k = api('checkin_phone', { phone: '0900000009', pw: PW }); assert.ok(k.ok && !k.data.name.includes('*')); ok('kiosk SĐT (có mật khẩu)');
const reg3 = reg({ phone: '0933333333', email: 'c@c.vn', name: 'Trần Thị C' }).data.token;
assert.equal(api('checkin_token', { token: reg3 }).code, 'FORBIDDEN');
const s = api('checkin_token', { token: reg3.toLowerCase(), pw: PW }); assert.ok(s.ok && s.data.name === 'Trần Thị C'); ok('quét QR cá nhân (nhân viên)');
for (let i = 0; i < 10; i++) api('admin_ping', { pw: 'sai' }, { ip: '9.9.9.9' });
assert.equal(api('admin_ping', { pw: PW }, { ip: '9.9.9.9' }).code, 'LOCKED'); ok('khoá IP sau 10 lần sai mật khẩu');

/* ---------- khảo sát + chứng nhận ---------- */
assert.equal(api('survey_submit', { t: T, answers: { ...answers, q_content: '' } }).code, 'REQUIRED');
assert.equal(api('survey_submit', { t: T, answers: { ...answers, q_next: 'xx' } }).code, 'INVALID');
const before = sentMails.length;
const sv = api('survey_submit', { t: T, answers }); assert.ok(sv.ok && sv.data.certCode.startsWith('CN43-'));
assert.equal(api('survey_submit', { t: T, answers }).code, 'ALREADY'); ok('khảo sát hợp lệ, chỉ 1 lần');
const cert = api('certificate', { t: T }).data;
assert.ok(cert.html.includes('Nguyễn Văn An') && cert.html.includes(sv.data.certCode) && cert.html.includes('api.qrserver.com'));
const pdf = api('certificate_pdf', { t: T }).data; assert.ok(Buffer.from(pdf.pdf, 'base64').toString().startsWith('%PDF') && pdf.filename.endsWith('.pdf'));
assert.equal(api('certificate', { t: reg3 }).code, 'NO_SURVEY');
assert.equal(api('verify', { code: sv.data.certCode }).data.valid, true); assert.equal(api('verify', { code: 'CN43-XXXX' }).data.valid, false);
assert.equal(sentMails.length, before, 'mail chứng nhận chưa gửi ngay (qua hàng đợi)'); ok('chứng nhận hiển thị ngay, PDF, xác thực mã');

/* ---------- hàng đợi + hạn mức ---------- */
G.processMailQueue_({});
assert.equal(sentMails.length, before + 1); const cm = sentMails.at(-1);
assert.ok(cm.subject.includes('Giấy chứng nhận') && cm.attachments.length === 1); ok('trigger gửi mail chứng nhận kèm PDF');

// mô phỏng 1.600 người làm khảo sát cùng ngày → chỉ gửi tối đa 1.400, phần dư để lại
const mail = books[props.SPREADSHEET_ID].getSheetByName('HangDoiMail');
const used = G.sentToday_();
for (let i = 0; i < 1600; i++) mail.rows.push(['id' + i, 'x', 'register', T, `u${i}@ex.com`, 'pending', 0, '', '']);
let guard = 0; while (guard++ < 200 && G.processMailQueue_({}) > 0);
const sentCnt = mail.rows.slice(1).filter(r => r[5] === 'sent').length, pend = mail.rows.slice(1).filter(r => r[5] === 'pending').length;
assert.equal(G.sentToday_(), 1400, 'đếm đúng trần/ngày'); assert.equal(pend, 1600 - (1400 - used)); ok(`hạn mức: hôm nay gửi 1.400, còn ${pend} chờ sang hôm sau`);
// sang ngày hôm sau → gửi tiếp
props['SENT_' + Object.keys(props).find(k => k.startsWith('SENT_')).slice(5)] = '0'; quota = 1500;
const more = G.processMailQueue_({}); assert.ok(more > 0); ok('ngày mới tiếp tục gửi phần còn lại');

// email sai → failed ngay (không thử lại), không chặn hàng đợi
props['SENT_' + Object.keys(props).find(k => k.startsWith('SENT_')).slice(5)] = '0'; quota = 1500;
while (G.processMailQueue_({}) > 0);
mail.rows.push(['bad', 'x', 'register', T, 'bad@ex.com', 'pending', 0, '', '']);
const realSend = gas.MailApp.sendEmail; gas.MailApp.sendEmail = () => { throw new Error('Invalid email: an@example.com'); };
G.processMailQueue_({});
gas.MailApp.sendEmail = realSend;
const bad = mail.rows.find(r => r[0] === 'bad'); assert.equal(bad[5], 'failed'); assert.equal(bad[6], 1); ok('địa chỉ email sai được đánh dấu failed');
// lỗi tạm thời → thử lại tối đa 3 lần
mail.rows.push(['tmp', 'x', 'register', T, 'x@ex.com', 'pending', 0, '', '']);
gas.MailApp.sendEmail = () => { throw new Error('Service unavailable'); };
for (let i = 0; i < 3; i++) G.processMailQueue_({});
gas.MailApp.sendEmail = realSend;
const tmp = mail.rows.find(r => r[0] === 'tmp'); assert.equal(tmp[5], 'failed'); assert.equal(tmp[6], 3); ok('lỗi tạm thời thử lại tối đa 3 lần');

/* ---------- thống kê & xuất ---------- */
const st = api('admin_stats', { pw: PW }).data; assert.equal(st.registered, 3); assert.equal(st.surveyed, 1); assert.equal(st.checkedIn, 3);
const ls = api('admin_list', { pw: PW }).data.rows; assert.equal(ls.length, 3); assert.equal(ls.find(r => r[0] === 'Nguyễn Văn An')[6], 1); assert.equal(api('admin_list').code, 'FORBIDDEN');
const ex = api('admin_export', { pw: PW, sheet: 'sur' }).data; assert.equal(ex.rows.length, 1); assert.equal(ex.rows[0][2], '0912345678'); ok('thống kê & xuất CSV');

/* ---------- SĐT có số 0 đầu ---------- */
const regSheet = books[props.SPREADSHEET_ID].getSheetByName('DangKy');
const idx = regSheet.rows.findIndex(r => r[2] === '0933333333'); regSheet.rows[idx][2] = 933333333; // giả lập Sheets đã biến thành số
assert.equal(api('checkin_phone', { phone: '0933333333', pw: PW }).data.name, 'Trần Thị C'); ok('đọc được SĐT dù ô đã bị đổi thành số');
assert.equal(reg({ phone: '0933333333', email: 'c@c.vn', name: 'Trần Thị C' }).data.duplicate, true);
assert.equal(api('admin_list', { pw: PW }).data.rows.find(r => r[0] === 'Trần Thị C')[1], '0933333333');
assert.equal(api('admin_export', { pw: PW, sheet: 'reg' }).data.rows.find(r => r[1] === 'Trần Thị C')[2], '0933333333'); ok('trùng SĐT, danh sách, xuất CSV đều giữ số 0');
G.fixPhoneColumns(); assert.equal(regSheet.rows[idx][2], '0933333333'); ok('fixPhoneColumns() sửa dữ liệu cũ');
for (const name of ['DangKy', 'DiemDanh', 'KhaoSat']) for (const r of books[props.SPREADSHEET_ID].getSheetByName(name).rows.slice(1)) assert.match(String(r[2]), /^0\d{9,10}$/);
ok('mọi dòng ở 3 sheet đều có SĐT bắt đầu bằng 0');

/* ---------- Worker ---------- */
const worker = (await import(pathToFileURL(path.join(root, 'src/worker.js')).href)).default;
const store = new Map(); globalThis.caches = { default: { match: async k => store.get(k.url)?.clone(), put: async (k, v) => { store.set(k.url, v); } } };
let upstreamBody = null, upstreamCalls = 0;
globalThis.fetch = async (url, init) => { upstreamCalls++; upstreamBody = JSON.parse(init.body); return new Response(JSON.stringify({ ok: true, data: { echo: upstreamBody.action } }), { headers: { 'content-type': 'application/json' } }); };
const env = { GAS_URL: 'https://script.google.com/macros/s/X/exec', API_KEY: 'k123', ASSETS: { fetch: async () => new Response('static') } };
const waits = []; const wctx = { waitUntil: p => waits.push(p) };
const call = (body, method = 'POST', ip = '5.6.7.8') => worker.fetch(new Request('https://x.dev/api', { method, body: method === 'POST' ? JSON.stringify(body) : undefined, headers: { 'CF-Connecting-IP': ip } }), env, wctx);
let res = await call({ action: 'register', name: 'a' }); assert.equal(res.status, 200);
assert.equal(upstreamBody.key, 'k123'); assert.equal(upstreamBody.ip, '5.6.7.8');
res = await call({ action: 'register', key: 'client-key' }); assert.equal(upstreamBody.key, 'k123', 'client không thể ghi đè key');
assert.equal((await call({ action: 'hack' })).status, 400); assert.equal((await call(null, 'GET')).status, 405);
assert.equal((await worker.fetch(new Request('https://x.dev/'), env, wctx)).status, 200);
await call({ action: 'config' }); await Promise.all(waits); const c0 = upstreamCalls; await call({ action: 'config' }); assert.equal(upstreamCalls, c0, 'config được cache ở edge');
globalThis.fetch = async () => { throw new Error('down'); }; assert.equal((await call({ action: 'verify' })).status, 502); ok('Worker: proxy, khoá API, lọc action, cache config, lỗi upstream');

console.log('\nTất cả kiểm thử đạt.');
