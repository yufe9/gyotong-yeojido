// 회원(학번 + 이름)과 별점·댓글. 쓰기는 모두 schema.sql 의 함수로 가고, 욕설 검사와 권한 확인도 서버가 한다.
import * as supa from './supa.js';
import { blendRating, MIN_RATERS } from './logic.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dateText = iso => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
const STORE_KEY = 'gy.member.v1';
const STATUS_TEXT = { pending: '확인 중', approved: '지도에 올라감', rejected: '거절됨' };

const read = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return null; } };
const write = m => { try { m ? localStorage.setItem(STORE_KEY, JSON.stringify(m)) : localStorage.removeItem(STORE_KEY); } catch { /* 저장 못 해도 이번 화면에서는 쓴다 */ } };

let me = read(); // { token, nickname }
let mounted = null; // 지금 상세 화면의 별점·댓글 칸 { root, target }
let resolveAsk = null;

export const current = () => me;

function setMe(m) {
  me = m;
  write(m);
  $('account-btn').textContent = m ? m.nickname : '로그인';
  if (mounted?.root.isConnected) mountReviews(mounted.root, mounted.target);
}

// 회원 토큰을 넣어 함수를 부른다. 탈퇴 등으로 토큰이 무효면 로그아웃 상태로 돌린다
export async function call(fn, args = {}) {
  try {
    return await supa.rpc(fn, { p_token: me?.token, ...args });
  } catch (e) {
    if (/다시 로그인/.test(e.message)) setMe(null);
    throw e;
  }
}

// 로그인 창을 띄우고, 닫힐 때 로그인했는지 알려 준다
export function ask() {
  $('member-error').textContent = '';
  $('member-form').reset();
  $('member').showModal();
  return new Promise(resolve => { resolveAsk = resolve; });
}

async function openAccount() {
  $('account-title').textContent = me.nickname;
  $('account-error').textContent = '';
  $('account-spots').innerHTML = '<li>불러오는 중…</li>';
  $('account').showModal();
  try {
    const spots = await call('my_spots');
    $('account-spots').innerHTML = spots.length
      ? spots.map(s => `<li><span>${esc(s.name)}</span><small>${STATUS_TEXT[s.status]}</small></li>`).join('')
      : '<li>아직 제보한 명소가 없어요.</li>';
  } catch (e) {
    $('account-spots').innerHTML = `<li>불러오지 못했어요: ${esc(e.message)}</li>`;
  }
}

export function init() {
  setMe(me);
  $('account-btn').addEventListener('click', () => (me ? openAccount() : ask()));
  $('member-cancel').addEventListener('click', () => $('member').close());
  $('member').addEventListener('close', () => { resolveAsk?.(!!me); resolveAsk = null; });
  $('member-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, btn = $('member-submit');
    btn.disabled = true;
    try {
      const m = await supa.rpc('member_enter', { p_student_no: f.studentNo.value, p_name: f.studentName.value, p_nickname: f.nickname.value });
      setMe(m);
      $('member').close();
    } catch (err) {
      $('member-error').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
  $('account-close').addEventListener('click', () => $('account').close());
  $('account-logout').addEventListener('click', () => { setMe(null); $('account').close(); });
  $('account-delete').addEventListener('click', async () => {
    if (!confirm('탈퇴할까요? 학번·이름과 내 별점·댓글이 모두 지워지고 되돌릴 수 없어요.')) return;
    try {
      await call('member_delete');
      setMe(null);
      $('account').close();
      changed();
    } catch (e) {
      $('account-error').textContent = `탈퇴하지 못했어요: ${e.message}`;
    }
  });
}

// ── 집계 ────────────────────────────────────────────────
// 서버 설정 전이거나 실패하면 빈 값: 원래 별점과 지도는 그대로 쓴다
export async function loadStats() {
  try {
    const rows = await supa.rest('/review_stats?select=kind,target_id,n,total');
    return new Map(rows.map(r => [`${r.kind}:${r.target_id}`, r]));
  } catch {
    return new Map();
  }
}

const changed = () => mounted?.target.onChanged?.();

// ── 상세 화면의 별점·댓글 칸 ─────────────────────────────
const starsHtml = rating => [5, 4, 3, 2, 1].map(n => `
  <input class="visually-hidden" type="radio" name="rating" id="star-${n}" value="${n}"${n === rating ? ' checked' : ''}>
  <label for="star-${n}" aria-label="${n}점">★</label>`).join('');

function formHtml(mine) {
  if (!me) return '<button type="button" class="btn secondary review-login">로그인하고 별점 남기기</button>';
  return `
    <form class="review-form" novalidate>
      <fieldset class="stars"><legend class="visually-hidden">별점</legend>${starsHtml(mine?.rating)}</fieldset>
      <textarea name="body" rows="2" maxlength="200" placeholder="댓글(선택, 200자까지)" aria-label="댓글">${esc(mine?.body ?? '')}</textarea>
      <p class="report-error" role="alert"></p>
      <div class="report-actions">
        ${mine ? '<button type="button" class="btn secondary review-del">지우기</button>' : ''}
        <button type="submit" class="btn primary">${mine ? '고치기' : '남기기'}</button>
      </div>
    </form>`;
}

function commentHtml(r) {
  return `
    <li>
      <p class="review-meta"><span class="star">★ ${r.rating}</span> ${esc(r.nickname)} · ${esc(dateText(r.created_at))}
        ${r.nickname === me?.nickname ? '' : `<button type="button" class="review-report" data-report="${esc(r.id)}">신고</button>`}</p>
      <p>${esc(r.body)}</p>
    </li>`;
}

// target: { kind: 'place'|'spot', id, base: 원유철 별점(명소는 null), onChanged() }
export async function mountReviews(root, target) {
  mounted = { root, target };
  let list;
  try {
    list = await supa.rest(`/reviews?select=id,nickname,rating,body,created_at&kind=eq.${target.kind}&target_id=eq.${encodeURIComponent(target.id)}&order=created_at.desc&limit=200`);
  } catch {
    root.hidden = true; // 서버 설정 전: 이 칸만 숨기고 나머지 상세는 그대로
    return;
  }
  const total = list.reduce((sum, r) => sum + r.rating, 0);
  const raters = list.length + (target.base == null ? 0 : 1);
  const score = raters >= MIN_RATERS ? blendRating(target.base, list.length, total) : null;
  const mine = me && list.find(r => r.nickname === me.nickname);
  const comments = list.filter(r => r.body);
  root.innerHTML = `
    <h2>별점과 댓글 <small>${score == null ? `평가 모으는 중 · ${raters}명` : `★ ${score.toFixed(1)} · ${raters}명 평가`}</small></h2>
    ${formHtml(mine)}
    <p class="review-msg" role="status"></p>
    ${comments.length ? `<ul class="review-list">${comments.map(commentHtml).join('')}</ul>` : ''}`;

  root.querySelector('.review-login')?.addEventListener('click', ask);
  root.querySelector('.review-del')?.addEventListener('click', async () => {
    try {
      await call('review_delete', { p_kind: target.kind, p_target: target.id });
      await mountReviews(root, target);
      changed();
    } catch (e) {
      root.querySelector('.report-error').textContent = e.message;
    }
  });
  root.querySelector('.review-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, error = f.querySelector('.report-error'), btn = f.querySelector('[type=submit]');
    if (!f.rating.value) { error.textContent = '별점을 골라 주세요.'; return; }
    btn.disabled = true;
    try {
      await call('review_save', { p_kind: target.kind, p_target: target.id, p_rating: +f.rating.value, p_body: f.body.value });
      await mountReviews(root, target);
      changed();
    } catch (err) {
      error.textContent = err.message;
      btn.disabled = false;
    }
  });
  root.querySelector('.review-list')?.addEventListener('click', async e => {
    const id = e.target.closest('[data-report]')?.dataset.report;
    if (!id || (!me && !(await ask())) || !confirm('이 댓글을 신고할까요?')) return;
    const msg = root.querySelector('.review-msg');
    try {
      await call('review_report', { p_review: id });
      msg.textContent = '신고했어요. 서로 다른 3명이 신고하면 자동으로 숨겨집니다.';
    } catch (err) {
      msg.textContent = err.message;
    }
  });
}
