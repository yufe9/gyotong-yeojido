// 지도와 무관한 순수 계산. logic.test.mjs 에서 node 로 검사한다.

export const ZONES = ['전체', '교통대 앞', '충주 시내', '충주 교외 맛집'];
export const CATEGORIES = ['음식점', '카페', '주점'];

const byRating = (a, b) => b.rating - a.rating || b.recommendCount - a.recommendCount || a.distanceKm - b.distanceKm;
export const SORTS = {
  rating: byRating,
  recommend: (a, b) => b.recommendCount - a.recommendCount || b.rating - a.rating || a.distanceKm - b.distanceKm,
  distance: (a, b) => a.distanceKm - b.distanceKm || byRating(a, b),
};

export function visible(places, { zone, categories, sort }) {
  return places
    .filter(p => (zone === '전체' || p.zone === zone) && categories.has(p.category))
    .sort(SORTS[sort]);
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
