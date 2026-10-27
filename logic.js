// 지도와 무관한 순수 계산. logic.test.mjs 에서 node 로 검사한다.

export const ZONES = ['전체', '교통대 앞', '충주 시내', '충주 교외 맛집'];
export const CATEGORIES = ['음식점', '카페', '주점'];

const byRating = (a, b) => b.rating - a.rating || b.recommendCount - a.recommendCount || a.distanceKm - b.distanceKm;
export const SORTS = {
  rating: byRating,
  recommend: (a, b) => b.recommendCount - a.recommendCount || b.rating - a.rating || a.distanceKm - b.distanceKm,
  distance: (a, b) => a.distanceKm - b.distanceKm || byRating(a, b),
};

export function visible(places, { zone, categories, sort, food = null, query = '' }) {
  return search(places, query)
    .filter(p => (zone === '전체' || p.zone === zone) && categories.has(p.category) && (!food || foodType(p) === food))
    .sort(SORTS[sort]);
}

// ── 음식 종류: 미리보기 이미지(img/food/<key>.webp)와 칩을 정한다 ──
// 순서가 곧 칩 순서. group 은 그 종류가 주로 속하는 분류.
export const FOOD_TYPES = {
  jjamppong: { label: '짬뽕·짜장', group: '음식점' },
  malatang: { label: '마라탕', group: '음식점' },
  gukbap: { label: '국밥·찌개', group: '음식점' },
  bbq: { label: '고기구이', group: '음식점' },
  dakgalbi: { label: '닭갈비·찜닭', group: '음식점' },
  chicken: { label: '치킨', group: '음식점' },
  burger: { label: '버거', group: '음식점' },
  bunsik: { label: '분식', group: '음식점' },
  rice: { label: '덮밥·도시락', group: '음식점' },
  noodle: { label: '국수', group: '음식점' },
  donkatsu: { label: '돈가스', group: '음식점' },
  sushi: { label: '초밥·우동', group: '음식점' },
  pasta: { label: '파스타', group: '음식점' },
  burrito: { label: '부리또·바비큐', group: '음식점' },
  salad: { label: '샐러드·샌드위치', group: '음식점' },
  cafeteria: { label: '학식', group: '음식점' },
  coffee: { label: '커피', group: '카페' },
  bread: { label: '빵', group: '카페' },
  dessert: { label: '디저트', group: '카페' },
  pub: { label: '주점', group: '주점' },
};

// 키워드로 가르기 어려운 가게만 이름으로 정한다(이름 앞부분 일치).
const FOOD_EXCEPT = {
  엄정분식: 'bbq', 이씨식당: 'bbq', 뚝딱김치찌개: 'gukbap',
  성대분식: 'rice', 만선식당: 'rice', 심향: 'sushi', 이정동묵밥: 'noodle', 꼬보: 'pasta',
  // 카페: 무엇으로 유명한지(리뷰·소개)로 정했다. 커피단월은 '대형 베이커리 카페', 밀크티인은 음료 전문
  커피단월: 'bread', 밀크티인: 'coffee',
};
// 위에서부터 처음 맞는 규칙. 순서가 중요하다(예: 메밀치킨은 막국수, 치킨마요는 도시락).
const FOOD_RULES = [
  [/학교식단/, 'cafeteria'],
  [/마라/, 'malatang'],
  [/국수|묵밥|옹심이|육면/, 'noodle'],
  [/짬뽕|짜장/, 'jjamppong'],
  [/부리또|바베큐/, 'burrito'],
  [/버거/, 'burger'],
  [/파스타/, 'pasta'],
  [/스시|초밥|우동/, 'sushi'],
  [/도시락|덮밥|쌈밥/, 'rice'],
  [/돈가스|돈까스|카츠/, 'donkatsu'],
  [/닭갈비|찜닭/, 'dakgalbi'],
  [/치킨|통닭/, 'chicken'],
  [/삼겹|갈비살|갈매기|막창|곱창|목살/, 'bbq'],
  [/국밥|순대국|해장국|감자탕|육개장|찌개/, 'gukbap'],
  [/떡볶이|김밥|분식|쫄면/, 'bunsik'],
  [/샐러드|샌드위치|포케|토스트/, 'salad'],
];

export function foodType(p) {
  const except = Object.keys(FOOD_EXCEPT).find(n => p.name.startsWith(n));
  if (except) return FOOD_EXCEPT[except];
  if (p.category === '주점') return 'pub';
  const text = `${p.name} ${p.menu ?? ''}`;
  if (p.category === '카페') {
    if (/커피|다방/.test(p.name)) return 'coffee';
    if (/빙수|와플|푸딩|밀크티|티라미수/.test(text)) return 'dessert';
    if (/빵|크로와상|바게트|베이커리/.test(text)) return 'bread';
    return 'coffee';
  }
  return FOOD_RULES.find(([re]) => re.test(text))?.[1] ?? null;
}

// 같은 종류 안에서 다른 사진을 쓰는 가게. 칩은 늘리지 않고 사진만 바꾼다.
// 이름과 첫 메뉴만 본다(뒤쪽 곁들이 메뉴로 대표 사진이 바뀌지 않게).
const PHOTO_VARIANTS = {
  gukbap: [[/뼈해장국|감자탕/, 'gukbap-bone'], [/부대/, 'gukbap-budae'], [/김치찌개/, 'gukbap-kimchi']],
  bbq: [[/막창|곱창/, 'bbq-makchang']],
  rice: [[/쌈밥/, 'rice-ssam']],
  burrito: [[/바베큐|바비큐|브리스킷/, 'burrito-bbq']],
  sushi: [[/우동/, 'sushi-udon'], [/스시|초밥|오마카세/, 'sushi-nigiri']], // 둘 다 아니면(심향) 초밥과 우동 사진
};

export function foodPhoto(p) {
  const t = foodType(p);
  const text = `${p.name} ${String(p.menu ?? '').split(',')[0]}`;
  return PHOTO_VARIANTS[t]?.find(([re]) => re.test(text))?.[1] ?? t;
}

// 띄어쓰기·대소문자를 무시하고 이름·메뉴·음식 종류에서 찾는다.
const norm = s => String(s ?? '').toLowerCase().replace(/\s+/g, '');
export function search(places, query) {
  const q = norm(query);
  if (!q) return [...places];
  return places.filter(p => norm(`${p.name}${p.menu}${FOOD_TYPES[foodType(p)]?.label ?? ''}`).includes(q));
}

export const topPicks = (places, n = 5) => [...places].sort(SORTS.rating).slice(0, n);

export function countBy(items, key) {
  const out = {};
  for (const it of items) {
    const k = key(it);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

// 좌표가 같은(소수 5자리 ≈ 1m) 가게끼리 한 자리로 묶는다. 같은 건물 가게는 주소 좌표가 완전히 같다.
export function spots(places) {
  const groups = new Map();
  for (const p of places) {
    if (p.lat == null) continue;
    const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return [...groups.values()];
}

// 동서남북 끝 가게로 만든 사각형 + 여백(범위의 10%, 최소 약 500m)
export function limitBox(places) {
  const lats = places.filter(p => p.lat != null).map(p => p.lat);
  const lngs = places.filter(p => p.lng != null).map(p => p.lng);
  const [s, n, w, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const padLat = Math.max((n - s) * 0.1, 0.005);
  const padLng = Math.max((e - w) * 0.1, 0.006);
  return { south: s - padLat, north: n + padLat, west: w - padLng, east: e + padLng };
}

export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export const distanceText = km => (km === 0 ? '교내' : `${km}km`);

// ── 교통대 명소 · 학생 제보 ──────────────────────────────
// 종류는 비슷한 것끼리 묶은 5가지. 키는 supabase/schema.sql 의 check 와 같아야 한다.
export const SPOT_KINDS = {
  photo: { label: '사진·야경', icon: '📷' },
  season: { label: '계절·산책', icon: '🌸' },
  study: { label: '공부·휴식', icon: '📚' },
  tip: { label: '생활 꿀팁', icon: '🖨️' },
  outing: { label: '충주 나들이', icon: '🗺️' },
};

// 글자 수는 앞뒤 공백을 뺀 글자 개수. schema.sql 의 check 와 같은 값.
export const REPORT_LIMITS = {
  name: [2, 40], summary: [5, 60], body: [20, 500], bestTime: [0, 40], nickname: [0, 20],
  photos: [1, 3], photoBytes: 2 * 1024 * 1024,
};

export const inBox = (box, lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= box.south && lat <= box.north && lng >= box.west && lng <= box.east;

const len = s => [...s].length;
// 이메일·전화번호는 받지 않는다: 글이나 닉네임에 적혀 있어도 막는다
const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/;

// 제보 입력 검사. 통과하면 value 에 DB 칸 이름(snake_case)으로 정리한 값을 담는다.
export function validateReport(input, box) {
  const errors = {};
  const text = k => String(input[k] ?? '').trim();
  const check = (key, field, label) => { // label 은 조사까지: '이름은'
    const v = text(key), [lo, hi] = REPORT_LIMITS[key];
    if (len(v) < lo || len(v) > hi) errors[field] = lo ? `${label} ${lo}~${hi}자로 적어 주세요.` : `${label} ${hi}자까지예요.`;
    else if (CONTACT.test(v)) errors[field] = '이메일·전화번호는 적지 말아 주세요.';
    return v;
  };
  const name = check('name', 'name', '이름은');
  const summary = check('summary', 'summary', '한 줄 소개는');
  const body = check('body', 'body', '좋은 이유는');
  const bestTime = check('bestTime', 'bestTime', '추천 시간대는');
  const nickname = check('nickname', 'nickname', '닉네임은');
  if (!SPOT_KINDS[input.kind]) errors.kind = '종류를 골라 주세요.';
  const photos = input.photos ?? [];
  const [pLo, pHi] = REPORT_LIMITS.photos;
  if (photos.length < pLo || photos.length > pHi) errors.photos = `사진은 ${pLo}~${pHi}장 올려 주세요.`;
  else if (photos.some(f => f.size > REPORT_LIMITS.photoBytes)) errors.photos = '사진 한 장은 2MB 이하여야 해요.';
  if (!inBox(box, input.lat, input.lng)) errors.place = '충주 지도 범위 안에 핀을 꽂아 주세요.';
  if (text('website')) errors.bot = '제출할 수 없어요.'; // 사람에게는 안 보이는 칸
  const ok = Object.keys(errors).length === 0;
  return {
    ok, errors,
    value: ok ? { name, kind: input.kind, summary, body, best_time: bestTime || null, nickname: nickname || null, lat: input.lat, lng: input.lng } : null,
  };
}

export const byStatus = (list, status) => list.filter(l => l.status === status);
