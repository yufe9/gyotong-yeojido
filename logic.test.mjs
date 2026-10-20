import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { visible, spots, limitBox, clamp, distanceText, SORTS } from './logic.js';

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

test('clamp 와 거리 표시', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(distanceText(0), '교내');
  assert.equal(distanceText(0.8), '0.8km');
});
