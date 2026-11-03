// RLS 가 의도대로 막는지 익명(publishable 키만)으로 실제 요청을 보내 확인한다.
//   node scripts/check_rls.mjs
// supabase/schema.sql 을 적용한 뒤 실행한다. 확인용 제보 1건(대기)과 사진 1장이 남으니,
// admin.html 의 '대기' 탭에서 "RLS 확인용" 항목을 거절하면 사진까지 지워진다.
import { SUPA_URL, KEY, BUCKET } from '../supa.js';

const H = { apikey: KEY };
const results = [];
const check = (name, ok, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? '통과' : '실패'}  ${name}  (${detail})`); };
const req = (path, opts = {}) => fetch(`${SUPA_URL}${path}`, { ...opts, headers: { ...H, ...opts.headers } });
const json = { 'Content-Type': 'application/json' };
const TEST_NAME = 'RLS 확인용(거절해 주세요)';
const row = extra => ({
  name: TEST_NAME, kind: 'tip', lat: 36.98, lng: 127.9,
  summary: '자동 확인용 제보입니다', body: '이 항목은 scripts/check_rls.mjs 가 만든 확인용 제보입니다. 거절해 주세요.', ...extra,
});
const insert = (body, prefer = 'return=minimal') => req('/rest/v1/landmarks', { method: 'POST', headers: { ...json, Prefer: prefer }, body: JSON.stringify(body) });
// 1×1 webp
const webp = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=', 'base64');

// ── 사진 보관함 ──
const path = `u/${crypto.randomUUID()}.webp`;
let r = await req(`/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: webp });
check('익명이 u/<uuid>.webp 로 사진을 올릴 수 있다', r.ok, r.status);

r = await req(`/storage/v1/object/${BUCKET}/evil/${crypto.randomUUID()}.webp`, { method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: webp });
check('익명은 u/ 밖에는 올리지 못한다', !r.ok, r.status);

r = await req(`/storage/v1/object/list/${BUCKET}`, { method: 'POST', headers: json, body: JSON.stringify({ prefix: 'u', limit: 10 }) });
const listed = r.ok ? await r.json() : [];
check('익명은 사진 목록을 볼 수 없다', !r.ok || listed.length === 0, `${r.status}, ${listed.length}개`);

r = await req(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: json, body: JSON.stringify({ prefixes: [path] }) });
const deleted = r.ok ? await r.json() : [];
check('익명은 사진을 지울 수 없다', !r.ok || deleted.length === 0, `${r.status}, 지워진 ${deleted.length}개`);

r = await req(`/storage/v1/object/public/${BUCKET}/${path}`);
check('올린 사진은 공개 주소로 보인다(지워지지 않았다)', r.ok, r.status);

// ── 명소 표 ──
r = await insert(row({ status: 'approved', photos: [path] }));
check('익명은 처음부터 "승인" 상태로 쓸 수 없다', !r.ok, `${r.status} ${r.ok ? '' : (await r.json()).code}`);

r = await insert(row({ photos: [path] }));
check('익명은 표에 바로 제보할 수 없다(회원 함수로만)', !r.ok, r.status);

// ── 회원·별점 ──
const rpc = (fn, body) => req(`/rest/v1/rpc/${fn}`, { method: 'POST', headers: json, body: JSON.stringify(body) });
const testNo = String(9000000 + Math.floor(Math.random() * 999999));
r = await rpc('member_enter', { p_student_no: testNo, p_name: '확인용', p_nickname: `확인${testNo.slice(-6)}` });
const m = r.ok ? await r.json() : {};
check('학번과 이름으로 가입할 수 있다', r.ok && !!m.token, r.status);

r = await rpc('member_enter', { p_student_no: testNo, p_name: '다른이름' });
check('이름이 다르면 들어올 수 없다', !r.ok, r.status);

r = await rpc('spot_submit', { p_token: crypto.randomUUID(), p: row({ photos: [path] }) });
check('토큰이 틀리면 제보할 수 없다', !r.ok, r.status);

r = await rpc('spot_submit', { p_token: m.token, p: row({ photos: ['https://example.com/x.jpg'] }) });
check('보관함 밖 사진 주소는 받지 않는다', !r.ok, r.status);

r = await rpc('spot_submit', { p_token: m.token, p: row({ photos: [] }) });
check('사진 0장 제보는 받지 않는다', !r.ok, r.status);

r = await rpc('spot_submit', { p_token: m.token, p: row({ lat: 37.5665, lng: 126.978, photos: [path] }) });
check('지도 범위 밖 좌표는 받지 않는다', !r.ok, r.status);

r = await rpc('spot_submit', { p_token: m.token, p: row({ photos: [path] }) });
check('회원은 "대기" 상태로 제보할 수 있다', r.ok, r.status);

const review = (rating, body) => rpc('review_save', { p_token: m.token, p_kind: 'place', p_target: 'RLS 확인용', p_rating: rating, p_body: body });
r = await review(4, '확인용 댓글입니다');
check('회원은 별점과 댓글을 남길 수 있다', r.ok, r.status);

r = await review(4, '씨 1 발');
check('비속어는 저장되지 않는다', !r.ok, r.status);

r = await review(9, null);
check('별점 범위 밖은 저장되지 않는다', !r.ok, r.status);

r = await req('/rest/v1/review_stats?select=n,total&target_id=eq.RLS%20%ED%99%95%EC%9D%B8%EC%9A%A9');
const stat = r.ok ? await r.json() : [];
check('누구나 별점 집계를 볼 수 있다', stat[0]?.n === 1 && stat[0]?.total === 4, r.status);

r = await req('/rest/v1/reviews?select=member_id');
check('익명은 글쓴이 id 를 볼 수 없다', !r.ok, r.status);

r = await req('/rest/v1/reviews', { method: 'POST', headers: json, body: JSON.stringify({ member_id: crypto.randomUUID(), nickname: 'x', kind: 'place', target_id: 'y', rating: 5 }) });
check('익명은 별점 표에 바로 쓸 수 없다', !r.ok, r.status);

r = await req('/rest/v1/members?select=student_no,name,token');
check('익명은 회원 학번·이름을 볼 수 없다', !r.ok, r.status);

r = await rpc('member_delete', { p_token: m.token });
r = await req('/rest/v1/review_stats?select=n&target_id=eq.RLS%20%ED%99%95%EC%9D%B8%EC%9A%A9');
check('탈퇴하면 별점도 지워진다', r.ok && (await r.json()).length === 0, r.status);

r = await req('/rest/v1/landmarks?select=id,status&status=neq.approved');
const hidden = r.ok ? await r.json() : null;
check('익명은 대기·거절 목록을 읽을 수 없다', Array.isArray(hidden) && hidden.length === 0, `${r.status}, ${hidden?.length ?? '-'}건`);

r = await req(`/rest/v1/landmarks?name=eq.${encodeURIComponent(TEST_NAME)}`, { method: 'PATCH', headers: { ...json, Prefer: 'return=representation' }, body: JSON.stringify({ status: 'approved' }) });
const patched = r.ok ? await r.json() : [];
check('익명은 제보를 승인으로 바꿀 수 없다', patched.length === 0, `${r.status}, 바뀐 ${patched.length}건`);

r = await req('/rest/v1/landmarks?status=eq.pending', { method: 'DELETE', headers: { Prefer: 'return=representation' } });
const removed = r.ok ? await r.json() : [];
check('익명은 제보를 지울 수 없다', removed.length === 0, `${r.status}, 지운 ${removed.length}건`);

r = await req('/rest/v1/admins?select=email');
check('익명은 운영자 명단을 볼 수 없다', !r.ok, r.status);

r = await req('/rest/v1/rpc/is_admin', { method: 'POST', headers: json, body: '{}' });
check('익명은 운영자가 아니다', r.ok && (await r.json()) === false, r.status);

r = await req('/rest/v1/landmarks?select=id&status=eq.approved');
check('누구나 승인된 명소는 읽을 수 있다', r.ok, r.status);

const failed = results.filter(x => !x.ok).length;
console.log(`\n${results.length}개 중 ${results.length - failed}개 통과${failed ? `, ${failed}개 실패` : ''}`);
process.exit(failed ? 1 : 0);
