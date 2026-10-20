import { ZONES, CATEGORIES, visible, spots, limitBox, clamp, distanceText } from './logic.js';

// JavaScript 키는 브라우저에 공개된다. 카카오 콘솔의 JavaScript SDK 도메인 제한으로 보호한다.
const KAKAO_JS_KEY = 'fcc7025814ea14defac67db2babb5c5a';

const COLOR = { 음식점: '#E8590C', 카페: '#8B5E34', 주점: '#7048E8' };
const PIN = { 음식점: 'img/pin-food.svg', 카페: 'img/pin-cafe.svg', 주점: 'img/pin-bar.svg', group: 'img/pin-group.svg' };
const SHORT = { '충주 교외 맛집': '교외', '충주 시내': '시내' };

const state = { zone: '전체', categories: new Set(CATEGORIES), sort: 'rating', spot: null };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = u => (/^https:\/\//.test(u ?? '') ? u : null);

let places = [];
let map = null, clusterer = null, limit = null;
const markers = new Map(); // id → { marker, src }
let selectedId = null;

// ── 필터 UI ─────────────────────────────────────────────
function renderChips() {
  $('zones').innerHTML = ZONES.map(z =>
    `<button class="chip" role="radio" aria-checked="${z === state.zone}" data-zone="${esc(z)}">${esc(SHORT[z] ?? z)}</button>`).join('');
  $('cats').innerHTML = CATEGORIES.map(c =>
    `<button class="chip" aria-pressed="${state.categories.has(c)}" data-cat="${esc(c)}"><span class="dot" style="background:${COLOR[c]}"></span>${esc(c)}</button>`).join('');
}

$('zones').addEventListener('click', e => {
  const z = e.target.closest('[data-zone]')?.dataset.zone;
  if (!z) return;
  state.zone = z;
  state.spot = null;
  update({ refit: true });
});
$('cats').addEventListener('click', e => {
  const c = e.target.closest('[data-cat]')?.dataset.cat;
  if (!c) return;
  state.categories.has(c) ? state.categories.delete(c) : state.categories.add(c);
  state.spot = null;
  update();
});
$('sort').addEventListener('change', e => { state.sort = e.target.value; update(); });
$('spot-clear').addEventListener('click', () => { state.spot = null; update(); });

// ── 목록 ────────────────────────────────────────────────
function renderList(items) {
  const shown = state.spot ? items.filter(p => state.spot.ids.includes(p.id)) : items;
  $('count').textContent = state.spot ? `${state.spot.label} · ${shown.length}곳` : `${shown.length}곳`;
  $('spot-clear').hidden = !state.spot;
  $('list').innerHTML = shown.length ? shown.map(p => `
    <li><button data-id="${esc(p.id)}">
      <div class="row1">
        <span class="star">★ ${p.rating.toFixed(1)}</span>
        <span class="name">${esc(p.name)}</span>
        <span class="meta"><span class="dot" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${COLOR[p.category]}"></span> ${esc(SHORT[p.zone] ?? p.zone)} · ${distanceText(p.distanceKm)}</span>
      </div>
      <div class="row2">${esc(p.summary ?? '')}</div>
      <div class="meta">추천 ${p.recommendCount}명${p.soloDining === '좋음' ? '<span class="badge">혼밥 좋음</span>' : ''}</div>
    </button></li>`).join('')
    : `<li class="empty">${state.categories.size ? '조건에 맞는 곳이 없어요.' : '분류를 하나 이상 골라 주세요.'}</li>`;
}

$('list').addEventListener('click', e => {
  const id = e.target.closest('[data-id]')?.dataset.id;
  if (id) openCard(id, { move: true });
});

// ── 하단 시트: 손잡이를 누르면 다음 단, 끌면 위·아래 단 ──
const SHEET = ['peek', 'half', 'full'];
const sheet = $('sheet');
const sheetState = () => SHEET.find(s => sheet.classList.contains(s));
const setSheet = s => { sheet.classList.remove(...SHEET); sheet.classList.add(s); };
let dragY = null;
$('handle').addEventListener('pointerdown', e => { dragY = e.clientY; e.target.setPointerCapture?.(e.pointerId); });
$('handle').addEventListener('pointerup', e => {
  if (dragY == null) return;
  const dy = e.clientY - dragY, i = SHEET.indexOf(sheetState());
  dragY = null;
  if (Math.abs(dy) < 10) setSheet(SHEET[(i + 1) % SHEET.length]);
  else setSheet(SHEET[clamp(i + (dy < 0 ? 1 : -1), 0, SHEET.length - 1)]);
});
$('handle').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheet(SHEET[(SHEET.indexOf(sheetState()) + 1) % SHEET.length]); }
});

// ── 상세 카드 ───────────────────────────────────────────
const field = (label, v) => `<dt>${label}</dt><dd${v ? '' : ' class="unknown"'}>${esc(v ?? '확인 필요')}</dd>`;

function openCard(id, { move = false, push = true } = {}) {
  const p = places.find(x => x.id === id);
  if (!p) return;
  const naver = safeUrl(p.naverUrl), photo = safeUrl(p.photoUrl);
  $('card').innerHTML = `
    <div class="card-top">
      <h2>${esc(p.name)}</h2>
      <span class="cat" style="background:${COLOR[p.category]}">${esc(p.category)}</span>
      <button class="close" id="card-close" aria-label="닫기">✕</button>
    </div>
    <div class="stats"><span class="star">★ ${p.rating.toFixed(1)}</span> · 추천 ${p.recommendCount}명 · 교통대에서 걷는 길 ${distanceText(p.distanceKm)}</div>
    ${p.summary ? `<p class="summary">“${esc(p.summary)}”</p>` : ''}
    <dl>
      ${field('대표 메뉴', p.menu)}
      ${field('가격대', p.priceRange)}
      ${field('영업시간', p.hours)}
      ${field('휴무일', p.closedDays)}
      ${field('혼밥', p.soloDining)}
      ${p.waitTip ? field('웨이팅 팁', p.waitTip) : ''}
      ${p.parking ? field('주차', p.parking) : ''}
    </dl>
    ${p.detail ? `<details><summary>자세히</summary><p>${esc(p.detail)}</p></details>` : ''}
    <div class="actions">
      ${naver ? `<a class="naver" href="${esc(naver)}" target="_blank" rel="noopener">네이버에서 보기</a>` : ''}
      ${photo ? `<a href="${esc(photo)}" target="_blank" rel="noopener">사진 보기</a>` : ''}
    </div>
    <div class="checked">${esc(p.address)} · 확인한 날 ${esc(p.checkedAt)}</div>`;
  $('card').hidden = false;
  $('card').scrollTop = 0;
  $('card-close').addEventListener('click', closeCard);
  if (push) history.pushState({ card: id }, '');
  select(id, move);
}

function closeCard() {
  if (history.state?.card) history.back(); // popstate 에서 실제로 닫는다
  else hideCard();
}
function hideCard() { $('card').hidden = true; select(null); }
window.addEventListener('popstate', e => (e.state?.card ? openCard(e.state.card, { push: false }) : hideCard()));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('card').hidden) closeCard(); });

// ── 지도 ────────────────────────────────────────────────
function loadKakao() {
  if (!KAKAO_JS_KEY) return Promise.reject(new Error('app.js 의 KAKAO_JS_KEY 가 비어 있어요'));
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_JS_KEY)}&libraries=clusterer&autoload=false`;
    s.onload = () => window.kakao?.maps ? kakao.maps.load(resolve) : reject(new Error('SDK 응답이 이상해요'));
    s.onerror = () => reject(new Error('SDK를 불러오지 못했어요 (키 또는 허용 도메인 확인)'));
    setTimeout(() => reject(new Error('SDK 응답이 없어요 (허용 도메인 확인)')), 10000);
    document.head.appendChild(s);
  });
}

const wide = matchMedia('(min-width: 768px)');
function fit() {
  // setBounds(bounds, top, right, bottom, left): 목록 시트(또는 왼쪽 패널)에 가리지 않게 여백을 준다
  if (wide.matches) map.setBounds(limit, 16, 16, 16, 380 + 16);
  else map.setBounds(limit, 16, 16, sheet.offsetHeight + 16, 16);
}

function keepInside() {
  const c = map.getCenter(), sw = limit.getSouthWest(), ne = limit.getNorthEast();
  const lat = clamp(c.getLat(), sw.getLat(), ne.getLat());
  const lng = clamp(c.getLng(), sw.getLng(), ne.getLng());
  if (lat !== c.getLat() || lng !== c.getLng()) map.panTo(new kakao.maps.LatLng(lat, lng));
}

function pinImage(src, scale = 1) {
  const w = 30 * scale, h = 40 * scale;
  return new kakao.maps.MarkerImage(src, new kakao.maps.Size(w, h), { offset: new kakao.maps.Point(w / 2, h - 1) });
}

function initMap() {
  const box = limitBox(places);
  limit = new kakao.maps.LatLngBounds(
    new kakao.maps.LatLng(box.south, box.west), new kakao.maps.LatLng(box.north, box.east));
  $('map').innerHTML = '';
  map = new kakao.maps.Map($('map'), { center: limit.getSouthWest(), level: 8 });
  fit();
  map.setMaxLevel(map.getLevel() + 1);
  kakao.maps.event.addListener(map, 'dragend', keepInside);
  kakao.maps.event.addListener(map, 'zoom_changed', keepInside);
  clusterer = new kakao.maps.MarkerClusterer({ map, averageCenter: true, minLevel: 5, disableClickZoom: true });
  kakao.maps.event.addListener(clusterer, 'clusterclick', cluster =>
    map.setLevel(map.getLevel() - 1, { anchor: cluster.getCenter() }));
  $('fit-btn').hidden = false;
  $('fit-btn').addEventListener('click', fit);
}

function drawMarkers(items) {
  if (!map) return;
  clusterer.clear();
  markers.clear();
  const list = [];
  for (const group of spots(items)) {
    const pos = new kakao.maps.LatLng(group[0].lat, group[0].lng);
    if (group.length === 1) {
      const p = group[0], src = PIN[p.category];
      const marker = new kakao.maps.Marker({ position: pos, image: pinImage(src), title: p.name });
      kakao.maps.event.addListener(marker, 'click', () => openCard(p.id));
      markers.set(p.id, { marker, src });
      list.push(marker);
    } else {
      const marker = new kakao.maps.Marker({ position: pos, image: pinImage(PIN.group), title: `${group.length}곳` });
      const label = group[0].address.replace(/^충북 충주시 (\S+[읍면동] )?/, '');
      kakao.maps.event.addListener(marker, 'click', () => {
        state.spot = { ids: group.map(p => p.id), label };
        renderList(visible(places, state));
        if (sheetState() === 'peek') setSheet('half');
      });
      for (const p of group) markers.set(p.id, { marker, src: PIN.group });
      list.push(marker);
    }
  }
  clusterer.addMarkers(list);
}

function select(id, move = false) {
  if (!map) return;
  const prev = markers.get(selectedId);
  if (prev) { prev.marker.setImage(pinImage(prev.src)); prev.marker.setZIndex(0); }
  selectedId = id;
  const cur = markers.get(id);
  if (!cur) return;
  cur.marker.setImage(pinImage(cur.src, 1.3));
  cur.marker.setZIndex(10);
  if (move) {
    if (map.getLevel() > 4) map.setLevel(4);
    map.panTo(cur.marker.getPosition());
  }
}

// ── 시작 ────────────────────────────────────────────────
function update({ refit = false } = {}) {
  renderChips();
  const items = visible(places, state);
  renderList(items);
  drawMarkers(items);
  if (refit && map) fit();
}

async function start() {
  try {
    const data = await (await fetch('data/places.json')).json();
    places = data.places;
    const dates = places.map(p => p.checkedAt).sort();
    $('help-date').innerHTML = `<b>확인한 날</b>: ${esc(dates[0])} ~ ${esc(dates.at(-1))} (데이터 ${esc(data.generatedAt)} 기준)`;
  } catch {
    $('list').innerHTML = '<li class="empty">데이터를 불러오지 못했어요. 새로고침해 주세요.</li>';
    return;
  }
  update();
  $('help-btn').addEventListener('click', () => $('help').showModal());
  try {
    await loadKakao();
    initMap();
    update();
  } catch (err) {
    // 지도가 없어도 목록과 카드는 쓸 수 있다
    $('map').innerHTML = `<p class="map-msg">지도를 불러오지 못했어요.<br>${esc(err.message)}<br>아래 목록은 그대로 쓸 수 있어요.</p>`;
  }
}
start();
