import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { visible, spots, limitBox, clamp, distanceText, SORTS, FOOD_TYPES, foodType, search, topPicks, countBy } from './logic.js';

const { places } = JSON.parse(readFileSync(new URL('./data/places.json', import.meta.url), 'utf8'));
const all = new Set(['음식점', '카페', '주점']);
const count = (zone, cats = all) => visible(places, { zone, categories: cats, sort: 'rating' }).length;

test('필터 개수가 원본 분포와 같다', () => {
  assert.equal(count('전체'), 95);
  assert.equal(count('교통대 앞'), 44);
  assert.equal(count('충주 시내'), 40);
  assert.equal(count('충주 교외 맛집'), 11);
  assert.equal(count('전체', new Set(['음식점'])), 73);
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
  assert.equal(groups.reduce((n, g) => n + g.length, 0), 95);
  assert.ok(groups.some(g => g.length === 4), '대학로 12 의 4곳');
  assert.deepEqual(spots([{ lat: null, lng: null }]), []);
});

test('경계는 모든 가게를 담고 최소 여백을 둔다', () => {
  const box = limitBox(places);
  for (const p of places) assert.ok(p.lat > box.south && p.lat < box.north && p.lng > box.west && p.lng < box.east, p.name);
  const one = limitBox([{ lat: 37, lng: 127.9 }]);
  assert.ok(Math.abs(one.north - 37.005) < 1e-9 && Math.abs(one.west - 127.894) < 1e-9);
});

test('95곳 모두 음식 종류가 하나씩 붙는다', () => {
  for (const p of places) assert.ok(FOOD_TYPES[foodType(p)], `${p.name} → ${foodType(p)}`);
  const kind = name => foodType(places.find(p => p.name.startsWith(name)));
  const expect = {
    jjamppong: ['리밍', '권짬뽕', '관현각', '짬뽕생각', '차이나김쉐프', '탄금반점'],
    malatang: ['마라야', '사천마라탕', '신신마라탕'],
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
    coffee: ['메가MGC커피', '빽다방', '커피단월', '커피상점 교동', '굿나잇커피앤북'],
    bread: ['듀레베이커리', '베이커리 이와정', '파리바게뜨'],
    dessert: ['DROP BY', '밀크티인', '서리꽃', '소소, 단월', '평정'],
    pub: ['슬기로운대학생활', '낮과밤', '달주', '속초실비집'],
  };
  for (const [type, names] of Object.entries(expect)) for (const n of names) assert.equal(kind(n), type, n);
  assert.equal(Object.keys(countBy(places, foodType)).length, Object.keys(FOOD_TYPES).length, '안 쓰는 종류가 없다');
});

test('검색은 이름·메뉴를 띄어쓰기·대소문자 없이 찾는다', () => {
  assert.deepEqual(search(places, '').length, 95);
  assert.ok(search(places, '마라탕').every(p => /마라/.test(p.name + p.menu)));
  assert.ok(search(places, '마라탕').length >= 3);
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
  assert.deepEqual(countBy(places, p => p.category), { 음식점: 73, 카페: 18, 주점: 4 });
});

test('clamp 와 거리 표시', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(distanceText(0), '교내');
  assert.equal(distanceText(0.8), '0.8km');
});
