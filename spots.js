// 교통대 명소: 지도 핀·목록·상세, 그리고 학생 제보 창. 저장은 supa.js(Supabase)가 맡는다.
// 승인된 명소만 보이고, 제보는 "대기"로 들어가 운영자가 admin.html 에서 승인해야 지도에 뜬다.
import { SPOT_KINDS, REPORT_LIMITS, validateReport } from './logic.js';
import * as supa from './supa.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const COOLDOWN_KEY = 'gy.report.last';
const COOLDOWN_MS = 60_000; // 같은 기기에서 1분에 1건

export let list = []; // 승인된 명소
export const byId = id => list.find(s => s.id === id);
export const href = s => `#/s/${encodeURIComponent(s.id)}`;
export const kindLabel = k => `${SPOT_KINDS[k]?.icon ?? ''} ${SPOT_KINDS[k]?.label ?? ''}`.trim();
const dateText = iso => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
const cover = s => (s.photos?.[0] ? supa.photoUrl(s.photos[0]) : 'img/pin-spot.svg');
const EMPTY = '<li class="empty">아직 승인된 명소가 없어요. 지도를 길게 눌러(PC는 오른쪽 클릭) 첫 명소를 제보해 주세요.</li>';

export async function load() {
  try { list = (await supa.approvedSpots()) ?? []; } catch { list = []; } // 서버가 없거나 막혀도 맛집 지도는 그대로
  return list;
}

// ── 지도 핀(별 모양) ────────────────────────────────────
let pins = [];
export function drawPins(map, items, onPick) {
  for (const m of pins) m.setMap(null);
  pins = [];
  if (!map) return;
  const img = new kakao.maps.MarkerImage('img/pin-spot.svg', new kakao.maps.Size(34, 40), { offset: new kakao.maps.Point(17, 39) });
  for (const s of items) {
    const marker = new kakao.maps.Marker({ map, position: new kakao.maps.LatLng(s.lat, s.lng), image: img, title: s.name, zIndex: 5 });
    kakao.maps.event.addListener(marker, 'click', () => onPick(s));
    pins.push(marker);
  }
}

// ── 목록(지도 아래 사진 띠 · PC 사이드바) ───────────────
export function stripHtml(items) {
  return items.length ? items.map(s => `
    <li><button type="button" data-spot="${esc(s.id)}">
      <div class="ph"><img src="${esc(cover(s))}" alt="${esc(s.name)}" loading="lazy" decoding="async"></div>
      <div class="name">${esc(s.name)}</div><div class="meta"><span>${esc(kindLabel(s.kind))}</span></div>
    </button></li>`).join('') : EMPTY;
}

export function sideHtml(items, openId) {
  return items.length ? items.map(s => `
    <li><a class="side-item" href="${href(s)}"${s.id === openId ? ' aria-current="true"' : ''}>
      <img src="${esc(cover(s))}" alt="${esc(s.name)}" loading="lazy" decoding="async">
      <span class="t"><span class="name">${esc(s.name)}</span><span class="meta"><span>${esc(kindLabel(s.kind))}</span></span></span>
    </a></li>`).join('') : EMPTY;
}

// ── 상세: 맛집 상세와 같은 틀(큰 사진 + 유리 정보 시트) ─
export function detailHtml(s, icon) {
  const photos = s.photos?.length ? s.photos : [];
  const kakaoLink = `https://map.kakao.com/link/map/${encodeURIComponent(s.name)},${s.lat},${s.lng}`;
  return `
    <button class="back glass glass-map" type="button" aria-label="뒤로">${icon('back')}</button>
    <div class="hero${photos.length > 1 ? ' gallery' : ''}">${photos.length
      ? photos.map((p, i) => `<img src="${esc(supa.photoUrl(p))}" alt="${esc(s.name)}${photos.length > 1 ? ` 사진 ${i + 1}` : ''}" decoding="async">`).join('')
      : '<img src="img/pin-spot.svg" alt="">'}</div>
    <div class="d-sheet glass" data-refract>
      ${photos.length > 1 ? `<p class="ai-note">옆으로 넘기면 사진 ${photos.length}장</p>` : ''}
      <div class="d-title"><h1 tabindex="-1">${esc(s.name)}</h1><span class="badge spot-badge">명소</span></div>
      <p class="d-addr">${esc(kindLabel(s.kind))}</p>
      <div class="pills">
        ${s.best_time ? `<span class="pill">${esc(s.best_time)}</span>` : ''}
        <span class="pill">${esc(s.nickname ? `${s.nickname} 제보` : '익명 제보')}</span>
        <span class="pill">${esc(dateText(s.created_at))}</span>
      </div>
      <div class="tabs">
        <p class="quote">“${esc(s.summary)}”</p>
        <p class="detail-text spot-body">${esc(s.body)}</p>
      </div>
    </div>
    <div class="actions glass glass-map">
      <a class="btn primary" href="#/spots/${encodeURIComponent(s.id)}">${icon('pin')}지도에서 보기</a>
      <a class="btn secondary" href="${esc(kakaoLink)}" target="_blank" rel="noopener">${icon('out')}카카오맵에서 보기</a>
    </div>`;
}

// ── 제보 창 ─────────────────────────────────────────────
// 사진은 브라우저에서 긴 변 1600px 로 다시 그려 올린다. 캔버스로 다시 그리면 EXIF(촬영 위치 등)가 남지 않는다.
async function shrink(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const encode = (type, q) => new Promise(r => c.toBlob(r, type, q));
  for (const q of [0.82, 0.72, 0.62, 0.5]) {
    let b = await encode('image/webp', q);
    if (!b || b.type !== 'image/webp') b = await encode('image/jpeg', q); // webp 로 못 그리는 옛 사파리
    if (b && b.size <= REPORT_LIMITS.photoBytes) return b;
  }
  throw new Error('사진이 너무 커요. 다른 사진을 골라 주세요.');
}

let draft = null; // { lat, lng, blobs: [], admin }
let ctx = null;   // init 에서 받는 것: { box, onSaved(), draftPin(lat|null, lng) }

export function init(c) {
  ctx = c;
  const form = $('report-form');
  $('report-kinds').insertAdjacentHTML('beforeend', Object.entries(SPOT_KINDS).map(([k, v]) => `
    <label class="kind-opt"><input type="radio" name="kind" value="${k}"><span>${v.icon} ${esc(v.label)}</span></label>`).join(''));
  form.body.addEventListener('input', () => { $('body-count').textContent = `${[...form.body.value.trim()].length}/${REPORT_LIMITS.body[1]}`; });
  $('report-file').addEventListener('change', async e => {
    const files = [...e.target.files].slice(0, REPORT_LIMITS.photos[1] - draft.blobs.length);
    e.target.value = '';
    showError('');
    for (const f of files) {
      try { draft.blobs.push(await shrink(f)); } catch (err) { showError(err.message); }
    }
    drawPhotos();
  });
  $('report-photos').addEventListener('click', e => {
    const i = e.target.closest('[data-rm]')?.dataset.rm;
    if (i == null) return;
    draft.blobs.splice(+i, 1);
    drawPhotos();
  });
  $('report-cancel').addEventListener('click', () => $('report').close());
  $('report-close').addEventListener('click', () => $('report').close());
  $('report').addEventListener('close', () => { ctx.draftPin(null); draft = null; });
  form.addEventListener('submit', submit);
}

function drawPhotos() {
  for (const img of $('report-photos').querySelectorAll('img')) URL.revokeObjectURL(img.src);
  $('report-photos').innerHTML = draft.blobs.map((b, i) => `
    <span class="thumb"><img src="${URL.createObjectURL(b)}" alt="고른 사진 ${i + 1}"><button type="button" data-rm="${i}" aria-label="사진 ${i + 1} 빼기">×</button></span>`).join('');
  $('report-add').hidden = draft.blobs.length >= REPORT_LIMITS.photos[1];
}

function showError(msg) { $('report-error').textContent = msg; }

export async function open(lat, lng) {
  const form = $('report-form');
  form.reset();
  draft = { lat, lng, blobs: [], admin: false };
  drawPhotos();
  $('body-count').textContent = `0/${REPORT_LIMITS.body[1]}`;
  $('report-where').textContent = `고른 위치: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  $('report-done').hidden = true; form.hidden = false;
  showError('');
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  ctx.draftPin(lat, lng);
  $('report').showModal();
  // 운영자로 로그인돼 있으면 저장하자마자 공개(서버의 is_admin 이 다시 확인한다)
  const admin = await supa.isAdmin();
  if (!draft) return; // 그사이 창을 닫았다
  draft.admin = admin;
  $('report-admin').hidden = !admin;
  $('report-submit').textContent = admin ? '바로 공개하기' : '제보 보내기';
}

async function submit(e) {
  e.preventDefault();
  const form = $('report-form');
  // form.name 은 폼 자체의 이름이라 이름 칸은 namedItem 으로 읽는다
  const input = {
    name: form.elements.namedItem('name').value, kind: form.kind.value, summary: form.summary.value, body: form.body.value,
    bestTime: form.bestTime.value, nickname: form.nickname.value, website: form.website.value,
    lat: draft.lat, lng: draft.lng, photos: draft.blobs,
  };
  const v = validateReport(input, ctx.box);
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  if (!v.ok) {
    for (const k of Object.keys(v.errors)) form.elements[k]?.setAttribute?.('aria-invalid', 'true');
    showError(Object.values(v.errors)[0]);
    return;
  }
  let last = 0;
  try { last = +localStorage.getItem(COOLDOWN_KEY) || 0; } catch { /* 저장소를 못 쓰면 서버 제한만 */ }
  if (!draft.admin && Date.now() - last < COOLDOWN_MS) {
    showError(`조금 전에 보냈어요. ${Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000)}초 뒤에 다시 보내 주세요.`);
    return;
  }
  const btn = $('report-submit'), admin = draft.admin;
  btn.disabled = true; btn.textContent = '올리는 중…';
  try {
    const photos = [];
    for (const b of draft.blobs) photos.push(await supa.uploadPhoto(b));
    // 익명은 대기 행을 다시 읽을 수 없으므로(RLS) 결과를 돌려받지 않는다
    await supa.rest('/landmarks', { method: 'POST', body: { ...v.value, photos, status: admin ? 'approved' : 'pending' }, prefer: 'return=minimal' });
    try { localStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch { /* 무시 */ }
    form.hidden = true;
    $('report-done').hidden = false;
    $('report-done-text').textContent = admin ? '지도에 바로 올렸어요.' : '고마워요! 운영자가 확인한 뒤 지도에 올라가요.';
    if (admin) ctx.onSaved();
  } catch (err) {
    showError(`보내지 못했어요: ${err.message}`);
  } finally {
    btn.disabled = false; btn.textContent = admin ? '바로 공개하기' : '제보 보내기';
  }
}
