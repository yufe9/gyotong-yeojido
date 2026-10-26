// 유리 효과의 움직이는 부분. 모양(블러·반사층)은 style.css 의 .glass 가 맡는다.
// - 포인터 반사광: 포인터 아래 유리의 --mx --my 를 옮긴다
// - 굴절: data-refract 가 붙은 큰 유리(탭 바·검색창·상세 정보 시트)에만 SVG 변위 필터를 건다
// 둘 다 크롬 계열 + 마우스 + '동작 줄이기' 꺼짐일 때만. 휴대폰은 블러 유리만 보인다(Liquid Glass Lab 기법).

const fine = matchMedia('(hover: hover) and (pointer: fine)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const chromium = /Chrome\//.test(navigator.userAgent); // backdrop-filter 의 url() 을 그리는 엔진은 크롬 계열뿐
const rich = () => fine.matches && !reduce.matches;

const svgNS = 'http://www.w3.org/2000/svg';
let defs = null, seq = 0;

// 볼록한 테두리의 변위 지도: 가장자리에서 안쪽으로 미는 양(R·G)이 테두리 폭(b) 안에서 0 으로 줄어든다
function bezelMap(w, h, r, b) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  const hw = w / 2, hh = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + .5 - hw, py = y + .5 - hh;
    const qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
    const depth = -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r);
    let nx = 0, ny = 0, m = 0;
    if (depth > 0 && depth < b) {
      const t = 1 - depth / b;
      m = t * t;
      if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy); nx = qx / l; ny = qy / l; }
      else if (qx > qy) nx = 1; else ny = 1;
      nx *= Math.sign(px) || 1; ny *= Math.sign(py) || 1;
    }
    const i = (y * w + x) * 4;
    d[i] = 128 - nx * m * 127; d[i + 1] = 128 - ny * m * 127; d[i + 2] = 128; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function makeFilter(scale) {
  if (!defs) {
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', 0); svg.setAttribute('height', 0); svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    defs = document.createElementNS(svgNS, 'defs');
    svg.append(defs);
    document.body.append(svg);
  }
  const f = document.createElementNS(svgNS, 'filter');
  f.id = `lg-${++seq}`;
  f.setAttribute('filterUnits', 'userSpaceOnUse');
  f.setAttribute('color-interpolation-filters', 'sRGB');
  // 약한 물결(노이즈)을 테두리 지도에 얹고, k4 로 다시 중간 회색(변위 0)에 맞춘다
  f.innerHTML = `
    <feTurbulence type="fractalNoise" baseFrequency="0.008 0.011" numOctaves="2" seed="4" result="noise"/>
    <feGaussianBlur in="noise" stdDeviation="3" result="soft"/>
    <feImage x="0" y="0" preserveAspectRatio="none" result="bezel"/>
    <feComposite in="bezel" in2="soft" operator="arithmetic" k1="0" k2="1" k3="0.22" k4="-0.11" result="map"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>`;
  defs.append(f);
  return f;
}

function build(el) {
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (!w || !h) return;
  const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
  const f = el._lgFilter ||= makeFilter(el.dataset.scale || 60);
  for (const [k, v] of [['x', 0], ['y', 0], ['width', w], ['height', h]]) f.setAttribute(k, v);
  const img = f.querySelector('feImage');
  img.setAttribute('width', w); img.setAttribute('height', h);
  img.setAttribute('href', bezelMap(w, h, r, +(el.dataset.bezel || 22)));
  // 굴절은 테두리에서만 보이고, 안쪽은 16px 블러로 글자가 읽히게 한다
  el.style.backdropFilter = el.style.webkitBackdropFilter = `blur(16px) url(#${f.id}) saturate(1.3) brightness(1.04)`;
}

function unbuild(el) {
  el.style.backdropFilter = el.style.webkitBackdropFilter = '';
}

const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(es => es.forEach(e => build(e.target))) : null;
const watched = new Set();

// 화면을 새로 그린 뒤 부른다: 새로 생긴 data-refract 유리에 굴절을 걸고, 사라진 것은 놓는다
export function refresh(root = document) {
  for (const el of watched) if (!el.isConnected) { ro?.unobserve(el); watched.delete(el); }
  for (const el of root.querySelectorAll('[data-refract]')) {
    if (chromium && rich() && ro) { if (!watched.has(el)) { watched.add(el); ro.observe(el); } }
    else { if (watched.delete(el)) ro?.unobserve(el); unbuild(el); }
  }
}

// 포인터 반사광: 포인터 아래 유리 하나와 굴절 유리들만 따라간다(카드가 많아도 가볍게)
const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
let raf = 0, hovered = null, seen = false;
const clampPct = v => Math.min(Math.max(v, -25), 125).toFixed(1) + '%';
function tick() {
  cur.x += (target.x - cur.x) * .14; cur.y += (target.y - cur.y) * .14; // 바로 붙지 않고 미끄러지듯 따라온다
  for (const el of [hovered, ...watched]) {
    if (!el?.isConnected) continue;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', clampPct((cur.x - r.left) / r.width * 100));
    el.style.setProperty('--my', clampPct((cur.y - r.top) / r.height * 100));
  }
  raf = Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) > .5 ? requestAnimationFrame(tick) : 0;
}
addEventListener('pointermove', e => {
  if (!rich() || e.pointerType !== 'mouse') return;
  target.x = e.clientX; target.y = e.clientY;
  if (!seen) { seen = true; cur.x = target.x; cur.y = 0; }
  hovered = e.target.closest?.('.glass') ?? null;
  if (!raf) raf = requestAnimationFrame(tick);
}, { passive: true });

// 마우스를 꽂거나 '동작 줄이기'를 바꾸면 굴절을 다시 정한다
for (const mq of [fine, reduce]) mq.addEventListener?.('change', () => refresh());
