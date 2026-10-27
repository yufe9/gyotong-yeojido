// Supabase 를 SDK 없이 fetch 로 부른다(todo-sync 와 같은 방식). 앱(index.html)과 운영자 화면(admin.html)이 함께 쓴다.
// publishable 키는 공개돼도 되는 값이고, 실제 방어는 supabase/schema.sql 의 RLS 가 한다.
// sb_secret_ · service_role 키는 어떤 파일에도 넣지 않는다.

export const SUPA_URL = 'https://fwidqtzhleowbfbdmkhd.supabase.co';
export const KEY = 'sb_publishable_0mR29svz0wCUAb6o3_B0Kg_C-V1s_q9';
export const BUCKET = 'landmark-photos';
const SESS_KEY = 'gy.admin.sess.v1'; // 운영자 로그인(같은 사이트의 앱·admin.html 이 함께 본다)

// ── 운영자 세션 ─────────────────────────────────────────
const readSess = () => { try { return JSON.parse(localStorage.getItem(SESS_KEY)); } catch { return null; } };
const writeSess = s => { try { s ? localStorage.setItem(SESS_KEY, JSON.stringify(s)) : localStorage.removeItem(SESS_KEY); } catch { /* 저장 못 해도 이번 화면에서는 쓴다 */ } };
let sess = readSess();
export const session = () => sess;

const fromTokens = d => ({
  access_token: d.access_token, refresh_token: d.refresh_token,
  expires_at: Math.floor(Date.now() / 1000) + Number(d.expires_in || 3600), email: d.user?.email ?? sess?.email ?? null,
});

// 만료 60초 전에 새 토큰을 받는다. 실패하면 로그아웃 상태로 돌린다.
async function ensureToken() {
  if (!sess || sess.expires_at - 60 > Date.now() / 1000) return;
  const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: sess.refresh_token }),
  });
  if (!r.ok) { sess = null; writeSess(null); return; }
  sess = fromTokens(await r.json());
  writeSess(sess);
}

// 새 API 키는 JWT 가 아니라 apikey 헤더에만 넣는다. 운영자로 로그인했으면 그 토큰을 Authorization 에 넣는다.
async function headers(extra = {}) {
  await ensureToken();
  return { apikey: KEY, ...(sess ? { Authorization: `Bearer ${sess.access_token}` } : {}), ...extra };
}

async function fail(r) {
  let msg = `${r.status}`;
  try { const j = await r.json(); msg = j.message || j.msg || j.error_description || j.error || msg; } catch { /* 본문 없음 */ }
  const e = new Error(msg); e.status = r.status; throw e;
}

// ── 표(REST) ────────────────────────────────────────────
export async function rest(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    method,
    headers: await headers({ 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) await fail(r);
  return r.status === 204 || !(r.headers.get('content-type') || '').includes('json') ? null : r.json();
}

// 승인된 명소(누구나). 실패하면 부르는 쪽에서 빈 목록으로 — 맛집 지도는 그대로 쓴다.
export const approvedSpots = () => rest('/landmarks?select=*&status=eq.approved&order=created_at.desc');

// ── 사진 보관함 ─────────────────────────────────────────
export const photoUrl = path => `${SUPA_URL}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

export async function uploadPhoto(blob) {
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `u/${crypto.randomUUID()}.${ext}`;
  const r = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST', headers: await headers({ 'Content-Type': blob.type, 'x-upsert': 'false' }), body: blob,
  });
  if (!r.ok) await fail(r);
  return path;
}

export async function deletePhotos(paths) {
  if (!paths?.length) return;
  const r = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE', headers: await headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: paths }),
  });
  if (!r.ok) await fail(r);
}

// ── 운영자 로그인(매직링크) ─────────────────────────────
export async function sendMagicLink(email, redirectTo) {
  const r = await fetch(`${SUPA_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, create_user: true }),
  });
  if (!r.ok) await fail(r);
}

// 메일의 링크로 돌아오면 주소 # 뒤에 토큰이 붙어 온다. 받아서 저장하고 주소에서 지운다.
export async function takeSessionFromUrl() {
  if (!location.hash.includes('access_token')) return false;
  const p = new URLSearchParams(location.hash.slice(1));
  sess = fromTokens({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: p.get('expires_in') });
  history.replaceState(null, '', location.pathname + location.search);
  const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${sess.access_token}` } });
  if (!r.ok) { sess = null; writeSess(null); return false; }
  sess.email = (await r.json()).email;
  writeSess(sess);
  return true;
}

export async function signOut() {
  if (sess) { try { await fetch(`${SUPA_URL}/auth/v1/logout`, { method: 'POST', headers: await headers() }); } catch { /* 이미 끊김 */ } }
  sess = null; writeSess(null);
}

// 운영자인지는 서버(is_admin)에게 묻는다. 로그인 안 했으면 false.
export async function isAdmin() {
  if (!sess) return false;
  try { return (await rest('/rpc/is_admin', { method: 'POST', body: {} })) === true; } catch { return false; }
}
