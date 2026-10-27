import { ZONES, CATEGORIES, FOOD_TYPES, visible, spots, limitBox, clamp, distanceText, foodType, foodPhoto, topPicks, countBy } from './logic.js';
import * as motion from './motion.js';
import * as glass from './glass.js';
import * as spotsUI from './spots.js';

// JavaScript 키는 브라우저에 공개된다. 카카오 콘솔의 JavaScript SDK 도메인 제한으로 보호한다.
const KAKAO_JS_KEY = 'fcc7025814ea14defac67db2babb5c5a';

const PIN = { 음식점: 'img/pin-food.svg', 카페: 'img/pin-cafe.svg', 주점: 'img/pin-bar.svg', group: 'img/pin-group.svg' };
const SHORT = { '충주 교외 맛집': '교외', '충주 시내': '시내' };
const CAT_IMG = { 음식점: 'cat-food', 카페: 'cat-cafe', 주점: 'pub' }; // 분류 타일 합성 이미지

const state = { zone: '전체', category: null, food: null, query: '', sort: 'rating', spot: null, layer: 'food' }; // layer: 지도에 맛집(food)·명소(spots)·함께(both)
const filters = () => ({
  zone: state.zone, sort: state.sort, food: state.food, query: state.query,
  categories: new Set(state.category ? [state.category] : CATEGORIES),
});

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = u => (/^https:\/\//.test(u ?? '') ? u : null);
const icon = name => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const href = p => `#/p/${encodeURIComponent(p.id)}`;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const pc = matchMedia('(min-width: 1024px)'); // PC: 왼쪽 사이드바 + 오른쪽 넓은 화면, 상세는 오른쪽 위 패널
// 음식 사진은 모두 AI 사진: 960px(<key>.webp)·480px(<key>-480.webp) 두 크기를 srcset 으로 고른다
const PHOTO_ALT = { // 변형 사진의 음식 이름(logic.js 의 PHOTO_VARIANTS)
  'gukbap-bone': '뼈해장국', 'gukbap-budae': '부대찌개', 'gukbap-kimchi': '김치찌개', 'bbq-makchang': '막창',
  'rice-ssam': '우렁쌈밥', 'burrito-bbq': '바비큐 플래터', 'sushi-nigiri': '초밥', 'sushi-udon': '우동',
};
const foodImg = (key, alt, { lazy = true, sizes = '50vw' } = {}) =>
  `<img src="img/food/${key}.webp" srcset="img/food/${key}-480.webp 480w, img/food/${key}.webp 960w" sizes="${sizes}" width="960" height="960" alt="${esc(alt)}" decoding="async"${lazy ? ' loading="lazy"' : ''}>`;
const placeImg = (p, opts) => {
  const key = foodPhoto(p);
  return foodImg(key, PHOTO_ALT[key] ?? FOOD_TYPES[foodType(p)].label, opts);
};
const metaLine = p =>
  `<span class="star">★ ${p.rating.toFixed(1)}</span><span class="sep"></span><span>${distanceText(p.distanceKm)}</span><span class="sep"></span><span>추천 ${p.recommendCount}명</span>`;

let places = [];
const byId = new Map();
let cardEls = new Map(); // id → 카드 <li>

// ── 홈 ──────────────────────────────────────────────────
function buildHome() {
  const counts = countBy(places, p => p.category);
  $('cats').innerHTML = CATEGORIES.map(c => `
    <button class="tile c-${c}" type="button" data-cat="${c}" aria-pressed="false">
      <span class="ph">${foodImg(CAT_IMG[c], `${c} 대표 메뉴`, { lazy: false, sizes: '33vw' })}</span>
      <span class="name">${c}</span><span class="num">${counts[c]}곳</span>
    </button>`).join('');

  $('foods').innerHTML = Object.entries(FOOD_TYPES).map(([key, f]) => `
    <button class="food-chip glass" type="button" data-food="${key}" aria-pressed="false">
      ${foodImg(key, f.label, { sizes: '40px' })}<span>${f.label}</span><span class="n"></span>
    </button>`).join('');

  $('zones').innerHTML = ZONES.map(z =>
    `<button type="button" role="radio" data-zone="${esc(z)}" aria-checked="false">${esc(SHORT[z] ?? z)}</button>`).join('');

  const picks = topPicks(places, 5);
  $('picks').innerHTML = picks.map(p => `
    <a class="pick glass c-${p.category}" href="${href(p)}">
      <span class="txt">
        <span class="eyebrow">★ ${p.rating.toFixed(1)} · 추천 ${p.recommendCount}명 · ${esc(SHORT[p.zone] ?? p.zone)}</span>
        <span class="title">${esc(p.name)}</span>
        <span class="line">${esc(p.summary)}</span>
      </span>
      ${placeImg(p, { lazy: false, sizes: '40vw' })}
    </a>`).join('');
  $('dots').innerHTML = picks.map((_, i) => `<span class="${i ? '' : 'on'}"></span>`).join('');

  // 카드는 한 번만 만들고, 필터는 보이기·순서만 바꾼다(FLIP 재배치를 위해 같은 요소를 유지).
  $('grid').innerHTML = places.map(p => {
    return `
    <li class="card c-${p.category}" data-id="${esc(p.id)}">
      <a href="${href(p)}">
        <div class="ph-wrap"><div class="ph">${placeImg(p)}</div><span class="badge">${p.category}</span></div>
        <div class="c-info glass">
          <h3 class="name">${esc(p.name)}</h3>
          <p class="meta">${metaLine(p)}</p>
          <p class="price">${esc(p.priceRange ?? '가격 정보 없음')}</p>
        </div>
      </a>
    </li>`;
  }).join('') + '<li class="empty is-hidden">조건에 맞는 곳이 없어요. 필터를 지워 보세요.</li>';
  cardEls = new Map([...$('grid').querySelectorAll('.card')].map(li => [li.dataset.id, li]));
  motion.hoverLift($('grid'), '.card > a');
}

function syncControls() {
  for (const b of $('cats').children) b.setAttribute('aria-pressed', b.dataset.cat === state.category);
  for (const b of $('zones').children) {
    b.setAttribute('aria-checked', b.dataset.zone === state.zone);
    b.tabIndex = b.dataset.zone === state.zone ? 0 : -1;
  }
  // 음식 칩: 지금 구역·분류·검색에서 1곳 이상인 것만, 개수와 함께
  const n = countBy(visible(places, { ...filters(), food: null }), foodType);
  for (const b of $('foods').children) {
    const k = b.dataset.food;
    b.hidden = !n[k] && state.food !== k;
    b.setAttribute('aria-pressed', state.food === k);
    b.querySelector('.n').textContent = n[k] ?? 0;
  }
  for (const input of [$('q'), $('mq')]) {
    if (input.value.trim() !== state.query) input.value = state.query;
    input.parentElement.querySelector('.clear').hidden = !state.query;
  }
  $('sort').value = state.sort;
}

function renderGrid(items, animate) {
  const show = new Set(items.map(p => p.id));
  const grid = $('grid'), empty = grid.querySelector('.empty');
  const mutate = () => {
    for (const [id, li] of cardEls) li.classList.toggle('is-hidden', !show.has(id));
    for (const p of items) grid.insertBefore(cardEls.get(p.id), empty);
    empty.classList.toggle('is-hidden', items.length > 0);
  };
  animate ? motion.relayout(grid, mutate) : mutate();
}

function renderFilters() {
  const parts = [];
  if (state.category) parts.push(state.category);
  if (state.food) parts.push(FOOD_TYPES[state.food].label);
  if (state.zone !== '전체') parts.push(SHORT[state.zone] ?? state.zone);
  if (state.query) parts.push(`‘${esc(state.query)}’ 검색`);
  $('filters').hidden = !parts.length;
  $('filters').innerHTML = parts.length ? `${parts.join(' · ')}<button type="button" id="reset">필터 지우기</button>` : '';
}

function update({ animate = true } = {}) {
  syncControls();
  const items = visible(places, filters());
  $('count').textContent = `${items.length}곳`;
  renderGrid(items, animate);
  renderFilters();
  state.spot = null;
  drawMarkers(state.layer === 'spots' ? [] : items);
  drawSpotPins();
  renderStrip(items);
}

$('cats').addEventListener('click', e => {
  const c = e.target.closest('[data-cat]')?.dataset.cat;
  if (!c) return;
  state.category = state.category === c ? null : c;
  if (state.food && state.category && FOOD_TYPES[state.food].group !== state.category) state.food = null;
  update();
  if (state.category) $('list-title').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
});
$('foods').addEventListener('click', e => {
  const k = e.target.closest('[data-food]')?.dataset.food;
  if (!k) return;
  state.food = state.food === k ? null : k;
  update();
});
$('zones').addEventListener('click', e => {
  const z = e.target.closest('[data-zone]')?.dataset.zone;
  if (!z || z === state.zone) return;
  state.zone = z;
  update();
});
$('zones').addEventListener('keydown', e => {
  // 라디오 그룹: 화살표로 이동
  const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!d) return;
  e.preventDefault();
  state.zone = ZONES[(ZONES.indexOf(state.zone) + d + ZONES.length) % ZONES.length];
  update();
  $('zones').querySelector(`[data-zone="${state.zone}"]`).focus();
});
$('sort').addEventListener('change', e => { state.sort = e.target.value; update(); });
$('filters').addEventListener('click', e => {
  if (e.target.id !== 'reset') return;
  Object.assign(state, { zone: '전체', category: null, food: null, query: '' });
  update();
});

let typing = null;
for (const input of [$('q'), $('mq')]) {
  input.addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(() => { state.query = input.value.trim(); update(); }, 150);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
  input.parentElement.querySelector('.clear').addEventListener('click', () => {
    state.query = '';
    update();
    input.focus();
  });
}

// 추천 캐러셀 점 표시
$('picks').addEventListener('scroll', () => {
  const el = $('picks'), first = el.firstElementChild;
  if (!first) return;
  const i = clamp(Math.round(el.scrollLeft / (first.offsetWidth + 12)), 0, el.children.length - 1);
  [...$('dots').children].forEach((d, j) => d.classList.toggle('on', j === i));
}, { passive: true });

// PC 에서는 검색·음식 칩·구역·정렬을 사이드바로 옮기고, 좁아지면 제자리로 돌려놓는다.
// 요소는 하나뿐이라 필터 상태가 두 곳으로 갈라지지 않는다.
const MOVABLE = [$('home').querySelector('.home-head'), $('foods').closest('.block'), $('zones').closest('.block'), $('sort').closest('.sort')];
const homeSpots = MOVABLE.map(el => { const mark = document.createComment('홈 자리'); el.before(mark); return mark; });
function placeControls() {
  MOVABLE.forEach((el, i) => (pc.matches ? $('side-top').append(el) : homeSpots[i].after(el)));
}

// ── 상세 ────────────────────────────────────────────────
const TABS = ['소개', '메뉴', '정보'];
const row = (label, v) => `<dt>${label}</dt><dd${v ? '' : ' class="unknown"'}>${v ? esc(v) : '확인 필요'}</dd>`;

function renderDetail(p) {
  const t = foodType(p), naver = safeUrl(p.naverUrl), photo = safeUrl(p.photoUrl);
  const menu = (p.menu ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const panels = [
    `<p class="quote">“${esc(p.summary)}”</p>${p.detail ? `<p class="detail-text">${esc(p.detail)}</p>` : ''}`,
    `<ul class="menu-list">${menu.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
     <p class="price-row">가격대 ${esc(p.priceRange ?? '확인 필요')}</p>`,
    `<dl class="info">
      ${row('영업시간', p.hours)}${row('휴무일', p.closedDays)}${row('혼밥', p.soloDining)}
      ${p.waitTip ? row('웨이팅', p.waitTip) : ''}${p.parking ? row('주차', p.parking) : ''}
      ${row('주소', p.address)}
      ${photo ? `<dt>사진</dt><dd><a href="${esc(photo)}" target="_blank" rel="noopener">네이버 사진 보기</a></dd>` : ''}
      ${row('확인한 날', p.checkedAt)}
    </dl>`,
  ];
  const el = $('detail');
  el.className = `view detail c-${p.category}`;
  el.innerHTML = `
    <button class="back glass glass-map" type="button" aria-label="뒤로">${icon('back')}</button>
    <div class="hero">${placeImg(p, { lazy: false, sizes: '(min-width: 760px) 760px, 100vw' })}</div>
    <div class="d-sheet glass" data-refract>
      <p class="ai-note">AI 생성 이미지 · 실제 메뉴와 다를 수 있음</p>
      <div class="d-title"><h1 tabindex="-1">${esc(p.name)}</h1><span class="badge">${p.category}</span></div>
      <p class="d-addr">${esc(SHORT[p.zone] ?? p.zone)} · ${esc(FOOD_TYPES[t].label)}</p>
      <div class="pills">
        <span class="pill star">${icon('star')}<span><span class="visually-hidden">별점 </span>${p.rating.toFixed(1)}</span></span>
        <span class="pill">${icon('walk')}<span><span class="visually-hidden">교통대에서 걷는 거리 </span>${distanceText(p.distanceKm)}</span></span>
        <span class="pill">${icon('people')}추천 ${p.recommendCount}명</span>
      </div>
      <div class="tabs">
        <div class="segmented" role="tablist" aria-label="가게 정보">
          ${TABS.map((name, i) => `<button type="button" role="tab" id="tab-${i}" aria-controls="panel-${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${name}</button>`).join('')}
        </div>
        ${panels.map((html, i) => `<div class="panel" role="tabpanel" id="panel-${i}" aria-labelledby="tab-${i}" tabindex="0"${i ? ' hidden' : ''}>${html}</div>`).join('')}
      </div>
    </div>
    <div class="actions glass glass-map">
      <a class="btn primary" href="#/map/${encodeURIComponent(p.id)}">${icon('pin')}지도에서 보기</a>
      ${naver ? `<a class="btn secondary" href="${esc(naver)}" target="_blank" rel="noopener">${icon('out')}네이버에서 보기</a>` : ''}
    </div>`;
  el.querySelector('.back').addEventListener('click', goBack);
  const tabs = [...el.querySelectorAll('[role="tab"]')];
  const pick = i => tabs.forEach((b, j) => {
    b.setAttribute('aria-selected', i === j);
    b.tabIndex = i === j ? 0 : -1;
    $(`panel-${j}`).hidden = i !== j;
  });
  const list = el.querySelector('[role="tablist"]');
  list.addEventListener('click', e => {
    const i = tabs.indexOf(e.target.closest('[role="tab"]'));
    if (i >= 0) pick(i);
  });
  list.addEventListener('keydown', e => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    const i = (tabs.findIndex(b => b.tabIndex === 0) + d + tabs.length) % tabs.length;
    pick(i);
    tabs[i].focus();
  });
}

// 상세가 열린 뒤(스크롤을 맨 위로 옮긴 뒤) 부른다: 카드 사진 자리에서 이어지는 진입 동작
function animateDetail() {
  const el = $('detail');
  motion.detailIn({
    hero: el.querySelector('.hero'), from: pendingFrom, sheet: el.querySelector('.d-sheet'), title: el.querySelector('h1'),
    parts: [...el.querySelectorAll('.d-title .badge, .d-addr, .pills, .tabs')], bar: el.querySelector('.actions'),
    panel: pc.matches ? el : null,
  });
  pendingFrom = null;
}

// 앱 안에서 넘어왔으면 뒤로, 주소로 바로 들어왔으면 홈으로
let inAppNav = 0;
function goBack() { inAppNav > 0 ? history.back() : (location.hash = '#/'); }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && current === 'detail') goBack();
  // '/' 로 검색창에 가기(글자를 입력하는 중이면 그대로 둔다)
  if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]')) {
    e.preventDefault();
    const q = current === 'map' && !pc.matches ? $('mq') : $('q');
    if (current === 'detail' && !pc.matches) location.hash = '#/';
    q.focus();
  }
});

// ── 지도 ────────────────────────────────────────────────
let map = null, clusterer = null, limit = null, kakaoOk = false, sheetCtl = null;
const markers = new Map(); // id → { marker, src }
let selectedId = null, stripItems = [];

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

function fit() {
  if (!map) return;
  if (pc.matches) return map.setBounds(limit, 24, 24, 24, 24);
  // setBounds(bounds, top, right, bottom, left): 위 검색 캡슐과 아래 시트에 가리지 않게 여백을 준다
  const top = $('mapview').querySelector('.map-top').getBoundingClientRect().bottom + 12;
  const bottom = innerHeight - $('sheet').getBoundingClientRect().top + 12;
  map.setBounds(limit, top, 16, Math.max(bottom, 16), 16);
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
  drawMarkers(state.layer === 'spots' ? [] : visible(places, filters()));
  drawSpotPins();
  // 명소 제보: 휴대폰은 지도를 길게 누르고, PC 는 오른쪽 클릭. [제보] 버튼을 누른 뒤 지도를 한 번 눌러도 된다
  kakao.maps.event.addListener(map, 'rightclick', e => startReport(e.latLng));
  kakao.maps.event.addListener(map, 'click', e => { if (picking) startReport(e.latLng); });
  longPress($('map'), (x, y) => startReport(map.getProjection().coordsFromContainerPoint(new kakao.maps.Point(x, y))));
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
      kakao.maps.event.addListener(marker, 'click', () => {
        if (pc.matches) location.hash = href(p);
        else { select(p.id); revealCard(p.id); }
      });
      markers.set(p.id, { marker, src });
      list.push(marker);
    } else {
      const marker = new kakao.maps.Marker({ position: pos, image: pinImage(PIN.group), title: `${group.length}곳` });
      const label = group[0].address.replace(/^충북 충주시 (\S+[읍면동] )?/, '');
      kakao.maps.event.addListener(marker, 'click', () => {
        state.spot = { ids: group.map(p => p.id), label };
        renderStrip(visible(places, filters()));
        sheetCtl?.set(true);
      });
      for (const p of group) markers.set(p.id, { marker, src: PIN.group });
      list.push(marker);
    }
  }
  clusterer.addMarkers(list);
  if (selectedId && markers.has(selectedId)) select(selectedId);
}

function select(id, move = false) {
  if (map) {
    const prev = markers.get(selectedId);
    if (prev) { prev.marker.setImage(pinImage(prev.src)); prev.marker.setZIndex(0); }
  }
  selectedId = id;
  for (const b of $('strip').querySelectorAll('button')) b.setAttribute('aria-current', b.dataset.id === id);
  const cur = map && markers.get(id);
  if (!cur) return;
  cur.marker.setImage(pinImage(cur.src, 1.3));
  cur.marker.setZIndex(10);
  if (move) panToPin(cur.marker.getPosition());
}

function panToPin(pos) {
  if (map.getLevel() > 4) map.setLevel(4);
  if (pc.matches && current === 'detail') {
    // 패널(폭 420 + 여백) 절반만큼 지도 중심을 오른쪽으로 옮겨, 핀이 패널에 가리지 않게 한다
    const proj = map.getProjection(), pt = proj.containerPointFromCoords(pos);
    map.panTo(proj.coordsFromContainerPoint(new kakao.maps.Point(pt.x + 218, pt.y)));
  } else map.panTo(pos);
}

// ── 명소 ────────────────────────────────────────────────
let picking = false, spotsLoaded = false, lastSpotId = null, draft = null;
const openSpot = s => { location.hash = spotsUI.href(s); };
function drawSpotPins() { spotsUI.drawPins(map, state.layer === 'food' ? [] : spotsUI.list, openSpot); }

function setLayer(layer) {
  if (state.layer === layer) return;
  state.layer = layer;
  document.body.dataset.layer = layer; // PC 명소 모드에서는 맛집용 칩·구역·정렬을 숨긴다(style.css)
  for (const b of $('layers').children) b.setAttribute('aria-checked', b.dataset.layer === layer);
  update({ animate: false });
  syncTabs();
}
$('layers').addEventListener('click', e => {
  const l = e.target.closest('[data-layer]')?.dataset.layer;
  if (!l) return;
  history.replaceState(null, '', l === 'spots' ? '#/spots' : '#/map');
  setLayer(l);
});

function startReport(latLng) {
  picking = false;
  $('pick-hint').hidden = true;
  spotsUI.open(latLng.getLat(), latLng.getLng());
}
$('report-btn').addEventListener('click', () => {
  if (!map) return;
  picking = true;
  $('pick-hint').hidden = false;
});
$('pick-cancel').addEventListener('click', () => { picking = false; $('pick-hint').hidden = true; });

// 터치로 길게 누르기(550ms, 10px 넘게 움직이면 취소). 카카오맵에는 길게 누르기 이벤트가 없다
function longPress(el, onPress) {
  let t = null, x0 = 0, y0 = 0;
  const stop = () => { clearTimeout(t); t = null; };
  el.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    const r = el.getBoundingClientRect();
    x0 = e.clientX; y0 = e.clientY;
    t = setTimeout(() => { t = null; navigator.vibrate?.(15); onPress(x0 - r.left, y0 - r.top); }, 550);
  });
  el.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) stop(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, stop);
}

// 제보 위치에 잠깐 꽂아 두는 핀
function draftPin(lat, lng) {
  draft?.setMap(null);
  draft = null;
  if (lat == null || !map) return;
  draft = new kakao.maps.Marker({
    map, position: new kakao.maps.LatLng(lat, lng), zIndex: 20,
    image: new kakao.maps.MarkerImage('img/pin-spot.svg', new kakao.maps.Size(34, 40), { offset: new kakao.maps.Point(17, 39) }),
  });
  draft.setOpacity(0.75);
}

function renderSpotDetail(sp) {
  const el = $('detail');
  el.className = 'view detail spot';
  el.innerHTML = spotsUI.detailHtml(sp, icon);
  el.querySelector('.back').addEventListener('click', goBack);
}

function renderStrip(items) {
  if (state.layer === 'spots') {
    stripItems = [];
    $('mcount').textContent = `명소 ${spotsUI.list.length}곳`;
    $('spot-clear').hidden = true;
    $('strip').innerHTML = spotsUI.stripHtml(spotsUI.list);
    return renderSide();
  }
  stripItems = state.spot ? items.filter(p => state.spot.ids.includes(p.id)) : items;
  $('mcount').textContent = state.spot ? `${state.spot.label} · ${stripItems.length}곳` : `${stripItems.length}곳`;
  $('spot-clear').hidden = !state.spot;
  $('strip').innerHTML = stripItems.length ? stripItems.map(p => {
    return `<li class="c-${p.category}"><button type="button" data-id="${esc(p.id)}" aria-current="${p.id === selectedId}">
      <div class="ph">${placeImg(p, { sizes: '160px' })}</div>
      <div class="name">${esc(p.name)}</div><div class="meta">${metaLine(p)}</div>
    </button></li>`;
  }).join('') : '<li class="empty">조건에 맞는 곳이 없어요.</li>';
  renderSide();
}

// PC 사이드바 가게 목록: 지도 아래 사진 띠와 같은 목록(같은 건물 묶음 포함). 사진 썸네일 + 이름 + 별점·거리
function renderSide() {
  if (!pc.matches) return;
  const open = current === 'detail' ? lastDetailId : null;
  $('side-count').textContent = $('mcount').textContent;
  if (state.layer === 'spots' && document.body.dataset.view === 'map') { // 명소 모드의 지도: 명소 목록
    $('side-list').innerHTML = spotsUI.sideHtml(spotsUI.list, current === 'detail' ? lastSpotId : null);
    return;
  }
  $('side-list').innerHTML = stripItems.length ? stripItems.map(p => `
    <li><a class="side-item c-${p.category}" href="${href(p)}"${p.id === open ? ' aria-current="true"' : ''}>
      ${placeImg(p, { sizes: '56px' })}
      <span class="t"><span class="name">${esc(p.name)}</span>
        <span class="meta"><span class="star">★ ${p.rating.toFixed(1)}</span><span class="sep"></span><span>${distanceText(p.distanceKm)}</span></span></span>
    </a></li>`).join('') : '<li class="empty">조건에 맞는 곳이 없어요.</li>';
}

function revealCard(id) {
  sheetCtl?.set(true);
  if (!stripItems.some(p => p.id === id)) { state.spot = null; renderStrip(visible(places, filters())); select(id); }
  $('strip').querySelector(`[data-id="${CSS.escape(id)}"]`)
    ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
}

$('strip').addEventListener('click', e => {
  const sid = e.target.closest('[data-spot]')?.dataset.spot;
  if (sid) return openSpot(spotsUI.byId(sid));
  const id = e.target.closest('[data-id]')?.dataset.id;
  if (!id) return;
  // 처음 누르면 지도에서 위치를 보여 주고, 한 번 더 누르면 상세로
  if (id === selectedId) location.hash = href(byId.get(id));
  else select(id, true);
});
$('spot-clear').addEventListener('click', () => { state.spot = null; renderStrip(visible(places, filters())); });
$('fit').addEventListener('click', fit);

function ensureMap(focusId) {
  if (!kakaoOk) return;
  if (!map) initMap();
  else map.relayout();
  if (focusId) { select(focusId, true); revealCard(focusId); }
}

// ── 화면 전환 ───────────────────────────────────────────
let current = null, homeScroll = 0, lastDetailId = null;
let base = 'home'; // PC: 상세 패널 뒤에 깔려 있는 화면(홈 또는 지도)
let pendingFrom = null; // 누른 카드 사진의 화면 위치(카드 → 상세 이어지는 동작용)
function show(view) {
  if (current === 'home') homeScroll = scrollY;
  const prev = current;
  current = view;
  if (view !== 'detail') base = view;
  const panel = pc.matches && view === 'detail';
  const under = panel ? base : view; // 화면에 깔리는 것
  document.body.dataset.view = under;
  document.body.classList.toggle('has-panel', panel);
  $('home').hidden = under !== 'home';
  $('detail').hidden = view !== 'detail';
  $('mapview').hidden = under !== 'map';
  $('tabbar').hidden = view === 'detail';
  syncTabs();
  return prev;
}

// 사이드바(홈·지도·명소)와 하단 탭 바(홈·지도)의 현재 칸 표시
function syncTabs() {
  const under = document.body.dataset.view;
  const tab = under === 'map' && state.layer === 'spots' ? 'spots' : under;
  for (const t of document.querySelectorAll('[data-tab]')) {
    const on = t.dataset.tab === tab || (tab === 'spots' && t.dataset.tab === 'map' && t.closest('#tabbar'));
    if (on) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  }
}

const mapFocus = () => {
  const m = location.hash.match(/^#\/map\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
};

function route() {
  const ms = location.hash.match(/^#\/s\/(.+)$/);
  if (ms) {
    if (!spotsLoaded) return; // 명소를 불러온 뒤 다시 부른다
    const sp = spotsUI.byId(decodeURIComponent(ms[1]));
    if (!sp) return location.replace('#/spots');
    show('detail');
    renderSpotDetail(sp);
    lastSpotId = sp.id; lastDetailId = null;
    document.title = `${sp.name} · 교통여지도`;
    if (pc.matches) $('detail').scrollTop = 0; else scrollTo(0, 0);
    $('detail').querySelector('h1').focus({ preventScroll: true });
    glass.refresh($('detail'));
    animateDetail();
    if (pc.matches) {
      renderSide();
      if (base === 'map' && map) panToPin(new kakao.maps.LatLng(sp.lat, sp.lng));
    }
    return;
  }
  const m = location.hash.match(/^#\/p\/(.+)$/);
  if (m) {
    const p = byId.get(decodeURIComponent(m[1]));
    if (!p) return location.replace('#/');
    show('detail');
    renderDetail(p);
    lastDetailId = p.id; lastSpotId = null;
    document.title = `${p.name} · 교통여지도`;
    if (pc.matches) $('detail').scrollTop = 0; else scrollTo(0, 0);
    $('detail').querySelector('h1').focus({ preventScroll: true });
    glass.refresh($('detail'));
    animateDetail();
    if (pc.matches) {
      renderSide();
      if (base === 'map' && kakaoOk) { ensureMap(); select(p.id, true); }
    }
    return;
  }
  const spotsRoute = /^#\/spots(\/|$)/.test(location.hash);
  if (spotsRoute || /^#\/map(\/|$)/.test(location.hash)) {
    // #/spots 는 명소 모드, #/map 은 맛집(또는 고른 '함께')
    const want = spotsRoute ? 'spots' : state.layer === 'spots' ? 'food' : state.layer;
    const prev = show('map');
    setLayer(want);
    document.title = '지도 · 교통여지도';
    ensureMap(mapFocus());
    const focusSpot = spotsRoute && spotsUI.byId(decodeURIComponent(location.hash.split('/')[2] ?? ''));
    if (focusSpot && map) panToPin(new kakao.maps.LatLng(focusSpot.lat, focusSpot.lng));
    renderSide();
    if (prev !== 'map' && !(pc.matches && prev === 'detail')) motion.mapIn($('mapview').querySelector('.map-top'), [...$('strip').children].slice(0, 4));
    return;
  }
  const prev = show('home');
  document.title = '교통여지도';
  if (pc.matches && prev === 'detail') return renderSide(); // 패널만 닫혔다: 홈은 그대로
  requestAnimationFrame(() => scrollTo(0, homeScroll));
  if (prev === 'detail') motion.homeBack($('home'), cardEls.get(lastDetailId));
  else if (prev === 'map') motion.viewIn($('home'));
}

// 가게로 가는 링크를 누르는 순간 그 사진 칸의 자리를 기억해 둔다(상세 사진이 그 자리에서 커진다)
document.addEventListener('click', e => {
  const box = e.target.closest('a[href^="#/p/"], a[href^="#/s/"]')?.querySelector('.ph, img');
  if (!box) return;
  const r = box.getBoundingClientRect();
  const img = box.tagName === 'IMG' ? box : box.querySelector('img');
  pendingFrom = { left: r.left, top: r.top, width: r.width, height: r.height, radius: 20, src: img?.currentSrc || img?.src };
}, true);
addEventListener('hashchange', () => { inAppNav++; route(); });

// 버튼·탭 누름 반응
document.addEventListener('click', e => motion.press(e.target.closest('.tile, .food-chip, .btn, .tab, .round-btn, .segmented button')));
$('help-btn').addEventListener('click', () => $('help').showModal());

// ── 시작 ────────────────────────────────────────────────
async function start() {
  const kakaoLoad = loadKakao();
  kakaoLoad.catch(() => {});
  try {
    const data = await (await fetch('data/places.json')).json();
    places = data.places;
    for (const p of places) byId.set(p.id, p);
    const dates = places.map(p => p.checkedAt).sort();
    $('help-date').innerHTML = `<b>확인한 날</b>: ${esc(dates[0])} ~ ${esc(dates.at(-1))} (데이터 ${esc(data.generatedAt)} 기준)`;
  } catch {
    $('grid').innerHTML = '<li class="empty">데이터를 불러오지 못했어요. 새로고침해 주세요.</li>';
    return;
  }
  buildHome();
  placeControls();
  update({ animate: false });
  route();
  glass.refresh();
  spotsUI.init({ box: limitBox(places), draftPin, onSaved: () => spotsUI.load().then(() => update({ animate: false })) });
  // 명소는 첫 화면을 늦추지 않게 따로 불러오고, 오면 지도·목록을 다시 그린다
  spotsUI.load().then(() => {
    spotsLoaded = true;
    update({ animate: false });
    if (/^#\/s\//.test(location.hash) || /^#\/spots\//.test(location.hash)) route();
  });
  pc.addEventListener('change', () => {
    placeControls();
    update({ animate: false });
    route();
    glass.refresh();
    if (map) { map.relayout(); fit(); }
  });

  // 첫 화면 등장: 애니메이션 라이브러리가 금방 오면 떠오르게, 늦으면 그냥 보여 준다
  const A = await Promise.race([motion.ready, new Promise(r => setTimeout(() => r(null), 600))]);
  if (A && current === 'home' && scrollY < 40) {
    const firstCards = [...cardEls.values()].filter(li => !li.classList.contains('is-hidden')).slice(0, 6);
    motion.enter([$('home').querySelector('.home-head'), ...$('cats').children, $('foods'), $('zones'), $('picks-block'), ...firstCards]);
  }
  await motion.ready;
  sheetCtl = motion.sheetDrag($('sheet'), $('grabber'), {
    collapsedY: () => $('sheet').offsetHeight - 24 - 40,
    onChange: open => $('grabber').setAttribute('aria-expanded', open),
  });

  try {
    await kakaoLoad;
    kakaoOk = true;
    if (current === 'map') ensureMap(mapFocus());
  } catch (err) {
    // 지도가 없어도 홈·상세·사진 목록은 쓸 수 있다
    $('map').innerHTML = `<p class="map-msg">지도를 불러오지 못했어요.<br>${esc(err.message)}<br>아래 사진 목록은 그대로 쓸 수 있어요.</p>`;
  }
}
start();
