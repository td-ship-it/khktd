/**
 * Cloudflare Worker:
 *  - /api  → proxy POST tới Google Apps Script Web App (ẩn URL + khoá API, tránh CORS, thêm IP khách)
 *  - còn lại → file tĩnh trong /public (Workers Static Assets)
 *
 * Biến môi trường (Worker secrets): GAS_URL, API_KEY
 */

const MAX_BODY = 20 * 1024;           // 20 KB là đủ cho mọi form
const CONFIG_TTL = 300;               // cache action "config" 5 phút tại edge
const ACTIONS = new Set([
  'config', 'register', 'checkin_phone', 'checkin_token', 'survey_state', 'survey_submit',
  'certificate', 'certificate_pdf', 'verify',
  'admin_ping', 'admin_stats', 'admin_export', 'admin_hallcode'
]);

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

async function handleApi(request, env, ctx) {
  if (request.method !== 'POST') return json({ ok: false, code: 'METHOD', message: 'Method not allowed' }, 405);
  if (!env.GAS_URL || !env.API_KEY) return json({ ok: false, code: 'CONFIG', message: 'Worker chưa cấu hình GAS_URL/API_KEY.' }, 500);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ ok: false, code: 'TOO_LARGE', message: 'Dữ liệu quá lớn.' }, 413);

  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, code: 'BAD_JSON', message: 'Dữ liệu không hợp lệ.' }, 400); }
  if (!body || typeof body !== 'object' || !ACTIONS.has(body.action)) {
    return json({ ok: false, code: 'BAD_ACTION', message: 'Yêu cầu không hợp lệ.' }, 400);
  }

  // Cache cấu hình sự kiện/khảo sát ở edge để trang tải nhanh dù GAS chậm.
  const cacheKey = body.action === 'config' ? new Request('https://cache.internal/config') : null;
  if (cacheKey) {
    const hit = await caches.default.match(cacheKey);
    if (hit) return hit;
  }

  const payload = {
    ...body,
    key: env.API_KEY,
    ip: request.headers.get('CF-Connecting-IP') || 'unknown'
  };

  let upstream;
  try {
    // GAS trả 302 tới script.googleusercontent.com; fetch tự theo redirect (POST→GET là hành vi mong đợi).
    upstream = await fetch(env.GAS_URL, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
  } catch {
    return json({ ok: false, code: 'UPSTREAM', message: 'Không kết nối được máy chủ dữ liệu. Vui lòng thử lại.' }, 502);
  }

  const text = await upstream.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    return json({ ok: false, code: 'UPSTREAM', message: 'Máy chủ dữ liệu phản hồi không hợp lệ. Vui lòng thử lại.' }, 502);
  }

  const res = json(parsed, 200);
  if (cacheKey && parsed.ok) {
    const cached = new Response(text, {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${CONFIG_TTL}` }
    });
    ctx.waitUntil(caches.default.put(cacheKey, cached));
  }
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname === '/api/') return handleApi(request, env, ctx);
    return env.ASSETS.fetch(request);
  }
};
