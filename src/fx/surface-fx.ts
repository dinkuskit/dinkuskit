// Surface effects from the emdash-surface-fx skill (SaariusSkills 1411ac4,
// vendored unchanged in ./vendor). One dithered wash sits behind the whole page
// and runs from emerald to ultraviolet; the topic cards carry an emerald dither
// and lean toward the mouse as it comes near. The wash pauses off screen
// through the viewport pool and holds a still frame when the visitor asks for
// less motion; the cards only move for a mouse and never then.
import './vendor/viewport-pool.js';
import './vendor/dither.js';
import './vendor/surface-micro.js';

type DitherHandle = { destroy(): void };
type SurfaceFxWindow = Window & {
  mountDitherShader(host: Element, options: Record<string, unknown>): DitherHandle | null;
  ditherPatternSvg(options: Record<string, unknown>): string;
};
const fx = window as unknown as SurfaceFxWindow;

const wash = document.querySelector<HTMLElement>('[data-fx-wash]');
if (wash) {
  const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  let handle: DitherHandle | null = null;
  // The shader draws in one color; the wash's gradient layer recolors it.
  const mount = () => {
    handle?.destroy();
    wash.replaceChildren();
    handle = fx.mountDitherShader(wash, { bg: token('--paper'), ink: token('--mark'), accent: token('--mark'), pixelScale: 3, speed: 0.35 });
  };
  mount();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', mount);
}

// Every graphite card carries the dither; only the split pages' topic cards
// lean, since a card as wide as the page would swing too far.
const dithered = [...document.querySelectorAll<HTMLElement>('.content-page .text-section')];
const cards = [...document.querySelectorAll<HTMLElement>('.content-split .text-section')];
if (dithered.length) {
  // One Bayer tile (4 cells of 3px) masks the card glow into the wash's dither.
  const dots = fx.ditherPatternSvg({ density: 0.5, cellSize: 3, bayer: 4, fg: '#000' }).replace('width="100%" height="100%"', 'width="12" height="12"');
  document.documentElement.style.setProperty('--fx-dots', `url("data:image/svg+xml;utf8,${encodeURIComponent(dots)}")`);
  for (const card of dithered) card.classList.add('fx-card');
}
if (cards.length && matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  // Like the skill's mountHoverTilt, but a card starts to respond within NEAR
  // pixels of the mouse instead of only under it.
  const NEAR = 160;
  const MAX_DEG = 4;
  let x = -1e4;
  let y = -1e4;
  let frame = 0;
  const update = () => {
    frame = 0;
    for (const card of cards) {
      const r = card.getBoundingClientRect();
      const gap = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      const near = Math.max(0, 1 - gap / NEAR);
      const px = (x - r.left) / r.width;
      const py = (y - r.top) / r.height;
      const cx = Math.min(1, Math.max(0, px));
      const cy = Math.min(1, Math.max(0, py));
      card.style.setProperty('--near', near.toFixed(3));
      card.style.setProperty('--rx', `${((0.5 - cy) * MAX_DEG * 2 * near).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${((cx - 0.5) * MAX_DEG * 2 * near).toFixed(2)}deg`);
      card.style.setProperty('--glare-x', near > 0 ? `${(px * 100).toFixed(1)}%` : '50%');
      card.style.setProperty('--glare-y', near > 0 ? `${(py * 100).toFixed(1)}%` : '140%');
    }
  };
  const queue = () => { frame ||= requestAnimationFrame(update); };
  for (const card of cards) card.classList.add('fx-tilt');
  addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    x = event.clientX;
    y = event.clientY;
    queue();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { x = -1e4; y = -1e4; queue(); });
  addEventListener('scroll', queue, { passive: true });
}
