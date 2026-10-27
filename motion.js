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

// 화면 바꾸기: 새 화면이 살짝 떠오르며 겹쳐 나타난다
export function viewIn(view) {
  if (!on() || !view) return;
  A.animate(view, { opacity: [0, 1], y: [10, 0], duration: 320, ease: 'out(3)' });
}

// 카드 → 상세. from 은 누른 카드 사진의 화면 위치(없으면 주소로 바로 들어온 것).
// 사진: 카드 자리에서 상세 사진 자리로 커진다. 비율이 다르므로 균일하게 키우고 위아래는 clip-path 로 잘라
//       사진이 일그러지지 않게 한다(FLIP). 이어서 유리 시트가 스프링으로 올라오고, 제목은 단어마다 솟아오른다.
export function detailIn({ hero, from, sheet, title, parts, bar, panel }) {
  if (!on()) return;
  const to = hero.getBoundingClientRect(); // 패널을 움직이기 전에 사진의 도착 자리를 잰다
  // 타임라인의 각 동작은 시작 시각 전까지 출발 값을 적용하지 않는다. 그래서 글자가 먼저 보였다가 다시 올라오는
  // 일이 없도록, 화면을 그리기 전에 모두 출발 상태(숨김)로 놓는다.
  const split = title && (A.splitText ?? A.text?.split)?.(title, { words: { wrap: 'clip' } });
  if (split) A.utils.set(split.words, { y: '100%' });
  A.utils.set(sheet, { y: 80, opacity: 0 });
  A.utils.set(parts, { y: 12, opacity: 0 });
  if (bar) A.utils.set(bar, { y: '100%' });
  if (!from) A.utils.set(hero, { opacity: 0 });
  if (panel) A.utils.set(panel, { x: 40, opacity: 0 });
  const tl = A.createTimeline({ defaults: { ease: 'out(4)' } });
  if (panel) tl.add(panel, { x: 0, opacity: 1, duration: 320, ease: 'out(3)' }, 0); // PC: 오른쪽에서 패널이 들어온다
  if (from && to.width && panel && from.src) {
    // PC 패널은 스크롤 상자라 밖으로 나간 사진이 잘려 보이지 않는다. 그래서 진짜 사진은 숨기고,
    // 맨 위층에 띄운 복사본이 클릭한 자리에서 패널 사진 자리까지 날아간 뒤 진짜와 바뀐다.
    const ghost = document.createElement('div');
    ghost.className = 'fly-ghost';
    Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: `${from.radius}px` });
    const img = new Image();
    img.src = from.src; img.alt = '';
    ghost.append(img);
    document.body.append(ghost);
    A.utils.set(hero, { opacity: 0 });
    const r = parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0;
    tl.add(ghost, {
      left: to.left, top: to.top, width: to.width, height: to.height,
      borderTopLeftRadius: r, borderTopRightRadius: r, borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
      duration: 520,
      onComplete: () => { A.utils.set(hero, { opacity: 1 }); ghost.remove(); },
    }, 0);
  } else if (from && to.width) {
    const s = from.width / to.width;
    const cut = Math.max(0, (to.height - from.height / s) / 2); // 확대 전 좌표에서 위아래로 잘라 낼 양
    const tx = from.left + from.width / 2 - (to.left + to.width / 2);
    const ty = from.top + from.height / 2 - (to.top + to.height / 2);
    tl.add(hero, {
      x: [tx, 0], y: [ty, 0], scale: [s, 1],
      clipPath: [`inset(${cut}px 0px ${cut}px 0px round ${from.radius / s}px)`, 'inset(0px 0px 0px 0px round 0px)'],
      duration: 520,
    });
  } else {
    tl.add(hero, { opacity: [0, 1], scale: [1.06, 1], duration: 520 });
  }
  tl.add(sheet, { y: [80, 0], opacity: [0, 1], ease: A.spring({ bounce: 0.18, duration: 520 }) }, '-=380');
  if (split) {
    tl.add(split.words, { y: ['100%', '0%'], duration: 520, delay: A.stagger(45), ease: 'outExpo', onComplete: () => split.revert() }, '-=420');
  }
  tl.add(parts, { opacity: [0, 1], y: [12, 0], duration: 360, delay: A.stagger(50) }, '-=420');
  if (bar) tl.add(bar, { y: ['100%', '0%'], duration: 420, ease: 'out(3)' }, '<<');
}

// 상세 → 홈: 홈이 돌아오고, 방금 본 카드가 제자리에 살짝 내려앉는다
export function homeBack(view, card) {
  if (!on()) return;
  A.animate(view, { opacity: [0, 1], duration: 260, ease: 'out(2)' });
  if (card) A.animate(card, { scale: [0.94, 1], ease: A.spring({ bounce: 0.35, duration: 520 }) });
}

// 지도로: 검색 캡슐은 위에서 내려오고, 사진 띠는 옆에서 차례로 들어온다
export function mapIn(top, items) {
  if (!on()) return;
  A.createTimeline({ defaults: { ease: 'out(3)' } })
    .add(top, { y: [-20, 0], opacity: [0, 1], duration: 380 })
    .add(items, { x: [28, 0], opacity: [0, 1], duration: 360, delay: A.stagger(40) }, '-=260');
}

// 사진 크게 보기: 검은 창이 번지고, 사진은 누른 자리에서 화면 가득 커진다
export function zoomIn(slide, from) {
  if (!on() || !slide) return;
  A.animate(slide.closest('dialog'), { opacity: [0, 1], duration: 220, ease: 'out(2)' });
  const r = from?.getBoundingClientRect(), v = slide.getBoundingClientRect();
  if (!r?.width) return A.animate(slide, { scale: [0.92, 1], duration: 380, ease: 'out(4)' });
  const s = Math.min(r.width / v.width, r.height / v.height);
  A.animate(slide, {
    x: [r.left + r.width / 2 - (v.left + v.width / 2), 0],
    y: [r.top + r.height / 2 - (v.top + v.height / 2), 0],
    scale: [s, 1], duration: 420, ease: 'out(4)',
  });
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

// 마우스를 올리면 카드가 살짝 떠오른다(150ms). 목록 재배치(FLIP)는 카드 <li> 를 움직이므로 안쪽 링크를 움직인다
export function hoverLift(root, selector) {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const lift = (e, y) => {
    const el = e.target.closest(selector);
    if (!el || el.contains(e.relatedTarget) || !on() || !fine.matches) return;
    A.animate(el, { y, duration: 150, ease: 'out(2)' });
  };
  root.addEventListener('pointerover', e => lift(e, -4));
  root.addEventListener('pointerout', e => lift(e, 0));
}
