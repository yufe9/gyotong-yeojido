// Anime.js v4 를 얹는 얇은 층. CDN 을 못 불러오거나 '동작 줄이기'면 모든 함수가 최종 상태만 만든다.
// 원칙: 한 번에 하나의 움직임, 300~450ms, 튀는 바운스·회전 없음.

const SRC = 'https://cdn.jsdelivr.net/npm/animejs@4.5.0/dist/bundles/anime.umd.min.js';
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

let A = null; // 불러온 anime 전역
export const ready = new Promise(resolve => {
  if (reduce.matches) return resolve(null);
  const s = document.createElement('script');
  s.src = SRC;
  s.async = true;
  s.onload = () => { A = window.anime?.animate ? window.anime : null; resolve(A); };
  s.onerror = () => resolve(null);
  setTimeout(() => resolve(A), 4000);
  document.head.appendChild(s);
});

const on = () => A && !reduce.matches;

// 첫 화면: 아래에서 12px 떠오르며 나타난다
export function enter(targets) {
  if (!on() || !targets.length) return;
  A.animate(targets, { opacity: [0, 1], y: [12, 0], duration: 420, delay: A.stagger(40), ease: 'out(3)' });
}

// 목록 재배치(FLIP): mutate 가 DOM 을 바꾸면 카드가 새 자리로 미끄러진다
const layouts = new WeakMap();
export function relayout(root, mutate) {
  if (!on()) return mutate();
  let layout = layouts.get(root);
  if (!layout) {
    layout = A.createLayout(root, {
      duration: 380, ease: 'out(3)',
      enterFrom: { opacity: 0, duration: 300 },
      leaveTo: { opacity: 0, duration: 200 },
    });
    layouts.set(root, layout);
  }
  layout.update(mutate);
}

// 카드 → 상세: 사진이 커지며 이어지고, 정보가 차례로 들어온다
export function detailIn(hero, parts) {
  if (!on()) return;
  A.createTimeline({ defaults: { ease: 'out(3)' } })
    .add(hero, { scale: [0.86, 1], opacity: [0, 1], duration: 420 })
    .add(parts, { opacity: [0, 1], y: [12, 0], duration: 320, delay: A.stagger(40) }, '-=260');
}

// 버튼·탭 누름: 1 → 0.96 → 1
export function press(el) {
  if (!on() || !el) return;
  A.animate(el, { scale: [1, 0.96, 1], duration: 150, ease: 'out(2)' });
}

// 지도 하단 시트: 끌어올리고 놓으면 가까운 높이(펼침/접힘)에 달라붙는다
export function sheetDrag(sheet, handle, { collapsedY, onChange }) {
  let open = true;
  let drag = null;
  const set = (isOpen, animated = true) => {
    open = isOpen;
    const y = isOpen ? 0 : collapsedY();
    if (drag) {
      if (animated && on()) A.animate(sheet, { y, ease: A.spring({ bounce: 0.2, duration: 400 }), onComplete: () => drag.setY(y) });
      else drag.setY(y);
    } else {
      sheet.classList.toggle('css-snap', animated && !reduce.matches);
      sheet.style.transform = `translateY(${y}px)`;
    }
    onChange?.(open);
  };
  if (on()) {
    drag = A.createDraggable(sheet, {
      trigger: handle,
      x: false,
      y: { snap: () => [0, collapsedY()] },
      container: () => [0, 0, collapsedY(), 0],
      releaseEase: A.spring({ bounce: 0.2 }),
      onSettle: d => {
        const isOpen = d.y < collapsedY() / 2;
        if (isOpen !== open) { open = isOpen; onChange?.(open); }
      },
    });
  }
  // 누르거나 Enter/Space: 펼침 ↔ 접힘. 끌기 없이도 쓸 수 있게.
  let downY = null;
  handle.addEventListener('pointerdown', e => { downY = e.clientY; });
  handle.addEventListener('click', e => {
    if (downY != null && Math.abs(e.clientY - downY) > 6) return; // 끌었던 것
    set(!open);
  });
  handle.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(!open); }
  });
  return { set, isOpen: () => open, refresh: () => drag?.refresh() };
}
