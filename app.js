import { ZONES, CATEGORIES, FOOD_TYPES, visible, spots, limitBox, clamp, distanceText, foodType, foodPhoto, topPicks, countBy } from './logic.js';
import * as motion from './motion.js';

// JavaScript 키는 브라우저에 공개된다. 카카오 콘솔의 JavaScript SDK 도메인 제한으로 보호한다.
const KAKAO_JS_KEY = 'fcc7025814ea14defac67db2babb5c5a';

const PIN = { 음식점: 'img/pin-food.svg', 카페: 'img/pin-cafe.svg', 주점: 'img/pin-bar.svg', group: 'img/pin-group.svg' };
const SHORT = { '충주 교외 맛집': '교외', '충주 시내': '시내' };
const CAT_IMG = { 음식점: 'cat-food', 카페: 'cat-cafe', 주점: 'pub' }; // 분류 타일 합성 이미지

const state = { zone: '전체', category: null, food: null, query: '', sort: 'rating', spot: null };
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
// AI 사진은 960px(<key>.webp)·480px(<key>-480.webp) 두 크기. 아직 AI 사진이 없는 그림은 예전 800px 누끼 한 장이라 회색 원에 넣는다.
const OLD_IMG = new Set(['cafeteria', 'coffee', 'bread', 'dessert', 'pub', 'cat-cafe']);
const PHOTO_ALT = { 'gukbap-bone': '뼈해장국', 'bbq-makchang': '막창' }; // 변형 사진의 음식 이름
const foodImg = (key, alt, { lazy = true, sizes = '50vw' } = {}) => {
  const attrs = `alt="${esc(alt)}" decoding="async"${lazy ? ' loading="lazy"' : ''}`;
  return OLD_IMG.has(key)
    ? `<img class="old" src="img/food/${key}.webp" width="800" height="800" ${attrs}>`
    : `<img src="img/food/${key}.webp" srcset="img/food/${key}-480.webp 480w, img/food/${key}.webp 960w" sizes="${sizes}" width="960" height="960" ${attrs}>`;
};
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
    <button class="food-chip" type="button" data-food="${key}" aria-pressed="false">
      ${foodImg(key, f.label, { sizes: '40px' })}<span>${f.label}</span><span class="n"></span>
    </button>`).join('');

  $('zones').innerHTML = ZONES.map(z =>
    `<button type="button" role="radio" data-zone="${esc(z)}" aria-checked="false">${esc(SHORT[z] ?? z)}</button>`).join('');

  const picks = topPicks(places, 5);
  $('picks').innerHTML = picks.map(p => `
    <a class="pick c-${p.category}" href="${href(p)}">
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
        <h3 class="name">${esc(p.name)}</h3>
        <p class="meta">${metaLine(p)}</p>
        <p class="price">${esc(p.priceRange ?? '가격 정보 없음')}</p>
      </a>
    </li>`;
  }).join('') + '<li class="empty is-hidden">조건에 맞는 곳이 없어요. 필터를 지워 보세요.</li>';
  cardEls = new Map([...$('grid').querySelectorAll('.card')].map(li => [li.dataset.id, li]));
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
  drawMarkers(items);
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
    <button class="back" type="button" aria-label="뒤로">${icon('back')}</button>
    <div class="hero">${placeImg(p, { lazy: false, sizes: '(min-width: 760px) 760px, 100vw' })}</div>
    ${OLD_IMG.has(foodPhoto(p)) ? '' : '<p class="ai-note">AI 생성 이미지 · 실제 메뉴와 다를 수 있음</p>'}
    <div class="d-body">
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
    <div class="actions">
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
  motion.detailIn(el.querySelector('.hero img'), [...el.querySelectorAll('.d-title, .d-addr, .pills, .tabs')]);
}

// 앱 안에서 넘어왔으면 뒤로, 주소로 바로 들어왔으면 홈으로
let inAppNav = 0;
function goBack() { inAppNav > 0 ? history.back() : (location.hash = '#/'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && current === 'detail') goBack(); });

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
  drawMarkers(visible(places, filters()));
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
      kakao.maps.event.addListener(marker, 'click', () => { select(p.id); revealCard(p.id); });
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
  if (move) {
    if (map.getLevel() > 4) map.setLevel(4);
    map.panTo(cur.marker.getPosition());
  }
}

function renderStrip(items) {
  stripItems = state.spot ? items.filter(p => state.spot.ids.includes(p.id)) : items;
  $('mcount').textContent = state.spot ? `${state.spot.label} · ${stripItems.length}곳` : `${stripItems.length}곳`;
  $('spot-clear').hidden = !state.spot;
  $('strip').innerHTML = stripItems.length ? stripItems.map(p => {
    return `<li class="c-${p.category}"><button type="button" data-id="${esc(p.id)}" aria-current="${p.id === selectedId}">
      <div class="ph">${placeImg(p, { sizes: '160px' })}</div>
      <div class="name">${esc(p.name)}</div><div class="meta">${metaLine(p)}</div>
    </button></li>`;
  }).join('') : '<li class="empty">조건에 맞는 곳이 없어요.</li>';
}

function revealCard(id) {
  sheetCtl?.set(true);
  if (!stripItems.some(p => p.id === id)) { state.spot = null; renderStrip(visible(places, filters())); select(id); }
  $('strip').querySelector(`[data-id="${CSS.escape(id)}"]`)
    ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
}

$('strip').addEventListener('click', e => {
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
let current = null, homeScroll = 0;
function show(view) {
  if (current === 'home') homeScroll = scrollY;
  current = view;
  $('home').hidden = view !== 'home';
  $('detail').hidden = view !== 'detail';
  $('mapview').hidden = view !== 'map';
  $('tabbar').hidden = view === 'detail';
  for (const t of $('tabbar').querySelectorAll('[data-tab]')) {
    if (t.dataset.tab === view) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  }
}

const mapFocus = () => {
  const m = location.hash.match(/^#\/map\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
};

function route() {
  const m = location.hash.match(/^#\/p\/(.+)$/);
  if (m) {
    const p = byId.get(decodeURIComponent(m[1]));
    if (!p) return location.replace('#/');
    show('detail');
    renderDetail(p);
    document.title = `${p.name} · 교통여지도`;
    scrollTo(0, 0);
    $('detail').querySelector('h1').focus({ preventScroll: true });
    return;
  }
  if (/^#\/map(\/|$)/.test(location.hash)) {
    show('map');
    document.title = '지도 · 교통여지도';
    ensureMap(mapFocus());
    return;
  }
  show('home');
  document.title = '교통여지도';
  requestAnimationFrame(() => scrollTo(0, homeScroll));
}
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
  update({ animate: false });
  route();

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
