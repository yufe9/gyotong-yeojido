// 운영자 화면: 대기 중인 명소 제보를 보고 승인 / 수정 후 승인 / 거절한다.
// 권한은 화면이 아니라 서버(RLS 의 is_admin)가 지킨다. 여기서 막아도, 서버가 허락하지 않으면 아무것도 바뀌지 않는다.
import * as supa from './supa.js';
import { SPOT_KINDS, byStatus } from './logic.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const when = iso => new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
const STATUS_TEXT = { pending: '대기', approved: '승인됨', rejected: '거절됨' };

let all = [];
let tab = 'pending';

function screen(name) {
  for (const id of ['login', 'denied', 'board']) $(id).hidden = id !== name;
  $('logout').hidden = name === 'login';
}

const msg = text => { $('board-msg').textContent = text; };

async function load() {
  msg('불러오는 중…');
  try {
    all = await supa.rest('/landmarks?select=*&order=created_at.desc');
    msg('');
  } catch (e) {
    all = [];
    msg(`불러오지 못했어요: ${e.message}`);
  }
  render();
}

function render() {
  for (const b of $('status-tabs').children) {
    b.setAttribute('aria-selected', b.dataset.status === tab);
    b.querySelector('.n').textContent = byStatus(all, b.dataset.status).length;
  }
  const items = byStatus(all, tab);
  $('items').innerHTML = items.length ? items.map(card).join('') : `<li class="empty">${STATUS_TEXT[tab]} 상태인 제보가 없어요.</li>`;
}

function card(l) {
  const kinds = Object.entries(SPOT_KINDS).map(([k, v]) => `<option value="${k}"${k === l.kind ? ' selected' : ''}>${v.icon} ${esc(v.label)}</option>`).join('');
  const map = `https://map.kakao.com/link/map/${encodeURIComponent(l.name)},${l.lat},${l.lng}`;
  const buttons = {
    pending: `<button type="button" class="btn primary" data-act="approve">승인</button>
              <button type="button" class="btn secondary" data-act="edit-approve">수정 후 승인</button>
              <button type="button" class="btn secondary" data-act="reject">거절</button>`,
    approved: `<button type="button" class="btn primary" data-act="save">수정 저장</button>
               <button type="button" class="btn secondary" data-act="reject">내리기(거절)</button>`,
    rejected: `<button type="button" class="btn secondary" data-act="delete">기록 지우기</button>`,
  }[l.status];
  return `
  <li class="glass admin-item" data-id="${esc(l.id)}">
    <div class="admin-photos">${l.photos.length
      ? l.photos.map((p, i) => `<a href="${esc(supa.photoUrl(p))}" target="_blank" rel="noopener"><img src="${esc(supa.photoUrl(p))}" alt="${esc(l.name)} 사진 ${i + 1}" loading="lazy"></a>`).join('')
      : '<span class="admin-nophoto">사진 없음(지워짐)</span>'}</div>
    <div class="admin-fields">
      <p class="admin-meta">${esc(when(l.created_at))} · ${esc(l.nickname || '익명')} · <a href="${esc(map)}" target="_blank" rel="noopener">위치 보기 (${l.lat.toFixed(5)}, ${l.lng.toFixed(5)})</a></p>
      <label class="field"><span>이름</span><input name="name" value="${esc(l.name)}" maxlength="40"></label>
      <label class="field"><span>종류</span><select name="kind">${kinds}</select></label>
      <label class="field"><span>한 줄 소개</span><input name="summary" value="${esc(l.summary)}" maxlength="60"></label>
      <label class="field"><span>좋은 이유</span><textarea name="body" rows="4" maxlength="500">${esc(l.body)}</textarea></label>
      <label class="field"><span>추천 시간대·계절</span><input name="best_time" value="${esc(l.best_time ?? '')}" maxlength="40"></label>
      <label class="field"><span>닉네임</span><input name="nickname" value="${esc(l.nickname ?? '')}" maxlength="20"></label>
      <div class="admin-actions">${buttons}</div>
    </div>
  </li>`;
}

// 칸의 값을 모은다(빈 선택 칸은 null)
function edits(li) {
  const v = n => li.querySelector(`[name="${n}"]`).value.trim();
  return { name: v('name'), kind: v('kind'), summary: v('summary'), body: v('body'), best_time: v('best_time') || null, nickname: v('nickname') || null };
}

const patch = (id, body) => supa.rest(`/landmarks?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body, prefer: 'return=minimal' });

$('items').addEventListener('click', async e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const li = btn.closest('[data-id]'), l = all.find(x => x.id === li.dataset.id);
  const act = btn.dataset.act;
  if (act === 'reject' && !confirm(`'${l.name}' 을(를) 거절할까요? 올린 사진 파일도 함께 지웁니다.`)) return;
  if (act === 'delete' && !confirm(`'${l.name}' 기록을 완전히 지울까요?`)) return;
  for (const b of li.querySelectorAll('button')) b.disabled = true;
  try {
    if (act === 'approve') await patch(l.id, { status: 'approved' });
    if (act === 'edit-approve') await patch(l.id, { ...edits(li), status: 'approved' });
    if (act === 'save') await patch(l.id, edits(li));
    if (act === 'reject') {
      // 승인하면 사진은 올린 경로 그대로 쓰고, 거절하면 파일까지 지운다
      await supa.deletePhotos(l.photos);
      await patch(l.id, { status: 'rejected', photos: [] });
    }
    if (act === 'delete') await supa.rest(`/landmarks?id=eq.${encodeURIComponent(l.id)}`, { method: 'DELETE', prefer: 'return=minimal' });
    await load();
    msg({ approve: '승인했어요. 지도에 바로 보입니다.', 'edit-approve': '고쳐서 승인했어요.', save: '저장했어요.', reject: '거절하고 사진을 지웠어요.', delete: '지웠어요.' }[act]);
  } catch (err) {
    msg(`처리하지 못했어요: ${err.message}`);
    for (const b of li.querySelectorAll('button')) b.disabled = false;
  }
});

$('status-tabs').addEventListener('click', e => {
  const s = e.target.closest('[data-status]')?.dataset.status;
  if (s) { tab = s; render(); }
});

$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('email').value.trim();
  $('login-msg').textContent = '보내는 중…';
  try {
    await supa.sendMagicLink(email, location.origin + location.pathname);
    $('login-msg').textContent = `${email} 로 로그인 링크를 보냈어요. 메일의 링크를 이 기기에서 열어 주세요.`;
  } catch (err) {
    // Supabase 기본 메일은 프로젝트 전체에서 1시간에 2통까지만 보낸다
    $('login-msg').textContent = /rate limit/i.test(err.message)
      ? '로그인 메일을 너무 자주 요청했어요. Supabase 기본 메일은 1시간에 2통까지만 보낼 수 있어요. 받은 메일함에 아직 쓰지 않은 링크가 있으면 그걸 누르고, 없으면 1시간 뒤에 다시 받아 주세요.'
      : `보내지 못했어요: ${err.message}`;
  }
});

$('logout').addEventListener('click', async () => {
  await supa.signOut();
  $('who').textContent = '교통여지도 운영자 화면';
  screen('login');
});

async function start() {
  await supa.takeSessionFromUrl();
  const s = supa.session();
  if (!s) return screen('login');
  $('who').textContent = `${s.email ?? ''} 로 로그인`;
  // 서버에 묻는다. 함수가 없으면(404) schema.sql 을 아직 실행하지 않은 것이라 안내를 달리한다
  let admin = false;
  try {
    admin = (await supa.rest('/rpc/is_admin', { method: 'POST', body: {} })) === true;
  } catch (e) {
    $('denied').querySelector('p').textContent = e.status === 404
      ? '서버 설정이 아직 안 됐어요. Supabase SQL Editor 에서 supabase/schema.sql 전체를 먼저 실행해 주세요(README 1번). 로그인은 그대로 유지되니, 실행한 뒤 이 화면을 새로고침하면 됩니다.'
      : `운영자인지 확인하지 못했어요: ${e.message}`;
    return screen('denied');
  }
  if (!admin) {
    $('denied').querySelector('p').textContent = `${s.email} 은(는) 운영자 명단에 없어요. SQL Editor 에서 이 이메일을 admins 표에 넣은 뒤(README 2번) 새로고침해 주세요.`;
    return screen('denied');
  }
  screen('board');
  await load();
}
start();
