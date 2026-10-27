import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { visible, spots, limitBox, clamp, distanceText, SORTS, FOOD_TYPES, foodType, foodPhoto, search, topPicks, countBy,
  SPOT_KINDS, REPORT_LIMITS, inBox, validateReport, byStatus } from './logic.js';

const { places } = JSON.parse(readFileSync(new URL('./data/places.json', import.meta.url), 'utf8'));
const all = new Set(['음식점', '카페', '주점']);
const count = (zone, cats = all) => visible(places, { zone, categories: cats, sort: 'rating' }).length;

test('필터 개수가 원본 분포와 같다', () => {
  assert.equal(count('전체'), 94); // 사천마라탕(폐업) 삭제
  assert.equal(count('교통대 앞'), 43);
  assert.equal(count('충주 시내'), 40);
  assert.equal(count('충주 교외 맛집'), 11);
  assert.equal(count('전체', new Set(['음식점'])), 72);
  assert.equal(count('전체', new Set(['카페'])), 18);
  assert.equal(count('전체', new Set(['주점'])), 4);
  assert.equal(count('전체', new Set()), 0);
});

test('별점순은 별점 → 추천 수 → 거리 순으로 동점을 가른다', () => {
  const a = { rating: 3, recommendCount: 5, distanceKm: 1 };
  const b = { rating: 3, recommendCount: 5, distanceKm: 0.5 };
  const c = { rating: 3, recommendCount: 9, distanceKm: 2 };
  const d = { rating: 4, recommendCount: 1, distanceKm: 9 };
  assert.deepEqual([a, b, c, d].sort(SORTS.rating), [d, c, b, a]);
  assert.deepEqual([a, b, c, d].sort(SORTS.distance), [b, a, c, d]);
  const top = visible(places, { zone: '전체', categories: all, sort: 'rating' })[0];
  assert.equal(top.rating, Math.max(...places.map(p => p.rating)));
});

test('같은 좌표 가게는 한 자리로 묶인다', () => {
  const groups = spots(places);
  assert.equal(groups.reduce((n, g) => n + g.length, 0), 94);
  assert.ok(groups.some(g => g.length === 4), '대학로 12 의 4곳');
  assert.deepEqual(spots([{ lat: null, lng: null }]), []);
});

test('경계는 모든 가게를 담고 최소 여백을 둔다', () => {
  const box = limitBox(places);
  for (const p of places) assert.ok(p.lat > box.south && p.lat < box.north && p.lng > box.west && p.lng < box.east, p.name);
  const one = limitBox([{ lat: 37, lng: 127.9 }]);
  assert.ok(Math.abs(one.north - 37.005) < 1e-9 && Math.abs(one.west - 127.894) < 1e-9);
});

test('94곳 모두 음식 종류가 하나씩 붙는다', () => {
  for (const p of places) assert.ok(FOOD_TYPES[foodType(p)], `${p.name} → ${foodType(p)}`);
  const kind = name => foodType(places.find(p => p.name.startsWith(name)));
  const expect = {
    jjamppong: ['리밍', '권짬뽕', '관현각', '짬뽕생각', '차이나김쉐프', '탄금반점'],
    malatang: ['마라야', '신신마라탕'],
    gukbap: ['생각나는감자탕', '일번지순대국', '24시전주명가', '큰집아저씨', '국대부대찌개', '뚝딱김치찌개'],
    bbq: ['윤박사', '새마을 삼겹살', '큰집막창', '화곡구이', '엄정분식', '이씨식당'],
    dakgalbi: ['일미닭갈비', '보스찜닭'],
    chicken: ['가마치통닭', '태권치킨'],
    burger: ['뉴욕버거', '스매쉬크루', '봉구스밥버거'],
    bunsik: ['대학로 친구분식', '오뚜기분식', '미미분식', '신전떡볶이'],
    rice: ['핵밥', '한솥도시락', '도란도락', '제갈덮밥', '오복쌈밥', '성마루 국밥', '성대분식', '만선식당'],
    noodle: ['쌍둥이칼국수', '메밀마당', '이정동묵밥', '옹심촌', '중원육면', '배가네국수'],
    donkatsu: ['돈까스카페', '타베', '예반72', '카츠집', '후라토식당'],
    sushi: ['쇼쿠스시', '막부', '우동키노야', '심향'],
    pasta: ['투파인드피터', '꼬보'],
    burrito: ['부리또인', '수리또', '밍거스 바베큐'],
    salad: ['샌치', '이삭토스트'],
    cafeteria: ['학생식당 THE HUE', '대학본부 교직원식당'],
    coffee: ['메가MGC커피', '빽다방', '컴포즈커피', '커피상점 교동', '굿나잇커피앤북', '아흐레커피', '째즈와산조', '카페 슬로우 모닝즈', '밀크티인'],
    bread: ['듀레베이커리', '베이커리 이와정', '파리바게뜨', '카페샵오팔', '커피단월'],
    dessert: ['DROP BY', '서리꽃', '소소, 단월', '평정'],
    pub: ['슬기로운대학생활', '낮과밤', '달주', '속초실비집'],
  };
  for (const [type, names] of Object.entries(expect)) for (const n of names) assert.equal(kind(n), type, n);
  assert.equal(Object.keys(countBy(places, foodType)).length, Object.keys(FOOD_TYPES).length, '안 쓰는 종류가 없다');
});

test('사진은 같은 종류 안에서 이름과 첫 메뉴로 변형을 고른다', () => {
  const photo = name => foodPhoto(places.find(p => p.name.startsWith(name)));
  assert.equal(photo('생각나는감자탕'), 'gukbap-bone');
  assert.equal(photo('두꺼비네'), 'gukbap', '첫 메뉴가 순대국이면 뒤에 뼈해장국이 있어도 기본 사진');
  assert.equal(photo('일번지순대국'), 'gukbap');
  assert.equal(photo('큰집막창'), 'bbq-makchang');
  assert.equal(photo('엄정분식'), 'bbq-makchang', '첫 메뉴가 막창구이');
  assert.equal(photo('이씨식당'), 'bbq-jjukkumi', '직화쭈꾸미');
  assert.equal(photo('제주돼지촌'), 'bbq', '첫 메뉴가 삼겹살이면 뒤에 막창이 있어도 기본 사진');
  assert.equal(photo('제갈덮밥'), 'rice', '덮밥 가게의 곱창은 변형 대상이 아니다');
  assert.equal(photo('리밍'), 'jjamppong');
  assert.equal(photo('국대부대찌개'), 'gukbap-budae');
  assert.equal(photo('부대담'), 'gukbap-budae');
  assert.equal(photo('뚝딱김치찌개'), 'gukbap-kimchi');
  assert.equal(photo('오복쌈밥'), 'rice-ssam');
  assert.equal(photo('성마루 국밥'), 'rice-ssam', '첫 메뉴가 우렁쌈밥');
  assert.equal(photo('밍거스 바베큐'), 'burrito-bbq');
  assert.equal(photo('부리또인'), 'burrito', '부리또집은 기본 사진');
  assert.equal(photo('쇼쿠스시'), 'sushi-nigiri');
  assert.equal(photo('막부'), 'sushi-nigiri', '첫 메뉴가 스시 오마카세');
  assert.equal(photo('우동키노야'), 'sushi-udon');
  assert.equal(photo('심향'), 'sushi', '야끼소바·오무라이스는 기본(초밥과 우동) 사진');
  assert.equal(photo('만선식당'), 'bbq-jjukkumi', '오징어볶음은 쭈꾸미 사진으로 대신한다');
  assert.equal(photo('성대분식'), 'rice', '첫 메뉴가 아닌 오징어덮밥은 기본 사진');
  for (const p of places) assert.ok(existsSync(new URL(`./img/food/${foodPhoto(p)}.webp`, import.meta.url)), p.name);
});

test('검색은 이름·메뉴를 띄어쓰기·대소문자 없이 찾는다', () => {
  assert.deepEqual(search(places, '').length, 94);
  assert.ok(search(places, '마라탕').every(p => /마라/.test(p.name + p.menu)));
  assert.ok(search(places, '마라탕').length >= 2); // 마라야·신신마라탕(사천마라탕 폐업)
  assert.ok(search(places, 'drop by').some(p => p.name === 'DROP BY'));
  assert.ok(search(places, '소금 빵').length >= 3, '띄어쓰기 무시');
  assert.ok(search(places, '파스타').some(p => p.name.startsWith('투파인드피터')));
  assert.equal(search(places, '없는메뉴xyz').length, 0);
  assert.equal(visible(places, { zone: '전체', categories: all, sort: 'rating', query: '짬뽕' }).length, search(places, '짬뽕').length);
  assert.equal(visible(places, { zone: '전체', categories: all, sort: 'rating', food: 'pub' }).length, 4);
});

test('오늘의 추천은 별점 → 추천 수 상위', () => {
  const top = topPicks(places, 5);
  assert.equal(top.length, 5);
  assert.equal(top[0].rating, 4.5);
  for (let i = 1; i < top.length; i++) assert.ok(SORTS.rating(top[i - 1], top[i]) <= 0);
  assert.deepEqual(countBy(places, p => p.category), { 음식점: 72, 카페: 18, 주점: 4 });
});

test('clamp 와 거리 표시', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(distanceText(0), '교내');
  assert.equal(distanceText(0.8), '0.8km');
});

// ── 4단계: 교통대 명소 · 학생 제보 ──
const box = limitBox(places);
const good = {
  name: '탄금대 노을 언덕', kind: 'photo', summary: '해 질 녘 남한강이 붉게 물드는 곳',
  body: '수업 끝나고 자전거로 15분이면 도착해요. 6시쯤 가면 강 위로 노을이 길게 깔려서 사진이 정말 잘 나와요.',
  bestTime: '가을 저녁', nickname: '', lat: 36.985, lng: 127.905, photos: [{ size: 300_000 }], website: '',
};

test('명소 종류는 5가지로 묶는다', () => {
  assert.deepEqual(Object.keys(SPOT_KINDS), ['photo', 'season', 'study', 'tip', 'outing']);
  for (const k of Object.values(SPOT_KINDS)) assert.ok(k.label && k.icon);
});

test('좌표는 limitBox 안일 때만 받는다', () => {
  assert.ok(inBox(box, 36.985, 127.905), '탄금대');
  assert.ok(inBox(box, box.south, box.west), '경계선 위는 안');
  assert.ok(!inBox(box, 37.5665, 126.978), '서울');
  assert.ok(!inBox(box, NaN, 127.9));
  assert.ok(!inBox(box, null, null));
});

test('올바른 제보는 통과하고 DB 칸 이름으로 정리된다', () => {
  const r = validateReport({ ...good, name: '  탄금대 노을 언덕  ', nickname: '  철새 ' }, box);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.value, {
    name: '탄금대 노을 언덕', kind: 'photo', summary: good.summary, body: good.body,
    best_time: '가을 저녁', nickname: '철새', lat: 36.985, lng: 127.905,
  });
  assert.equal(validateReport({ ...good, bestTime: ' ', nickname: '' }, box).value.best_time, null, '빈 선택 칸은 null');
});

test('글은 20~500자, 이름·소개 길이를 지킨다', () => {
  const err = input => validateReport({ ...good, ...input }, box).errors;
  assert.ok(err({ body: '좋아요' }).body, '20자 미만');
  assert.ok(!err({ body: '가'.repeat(20) }).body, '20자는 통과');
  assert.ok(!err({ body: '가'.repeat(500) }).body, '500자는 통과');
  assert.ok(err({ body: '가'.repeat(501) }).body, '500자 초과');
  assert.ok(err({ body: '     공백만 많은 글     '.padEnd(30, ' ') }).body, '앞뒤 공백은 세지 않는다');
  assert.ok(err({ name: '탄' }).name);
  assert.ok(err({ summary: '좋음' }).summary);
  assert.ok(err({ nickname: '가'.repeat(21) }).nickname);
  assert.ok(err({ kind: 'cafe' }).kind, '없는 종류');
});

test('사진은 1~3장, 한 장 2MB 이하', () => {
  const err = photos => validateReport({ ...good, photos }, box).errors.photos;
  assert.ok(err([]), '0장');
  assert.ok(!err([{ size: 1 }, { size: 1 }, { size: 1 }]), '3장');
  assert.ok(err([{ size: 1 }, { size: 1 }, { size: 1 }, { size: 1 }]), '4장');
  assert.ok(err([{ size: REPORT_LIMITS.photoBytes + 1 }]), '2MB 초과');
});

test('범위 밖 좌표, 숨김 칸(봇), 연락처는 막는다', () => {
  const err = input => validateReport({ ...good, ...input }, box).errors;
  assert.ok(err({ lat: 37.5665, lng: 126.978 }).place);
  assert.ok(err({ website: 'http://spam' }).bot, '사람에게 안 보이는 칸이 채워지면 봇');
  assert.ok(err({ body: good.body + ' 연락은 010-1234-5678' }).body, '전화번호');
  assert.ok(err({ body: good.body + ' me@example.com' }).body, '이메일');
  assert.ok(err({ nickname: 'me@example.com' }).nickname);
});

test('상태별로 거른다', () => {
  const list = [{ id: 1, status: 'pending' }, { id: 2, status: 'approved' }, { id: 3, status: 'rejected' }, { id: 4, status: 'approved' }];
  assert.deepEqual(byStatus(list, 'approved').map(l => l.id), [2, 4]);
  assert.deepEqual(byStatus(list, 'pending').map(l => l.id), [1]);
  assert.deepEqual(byStatus(list, 'nope'), []);
});
