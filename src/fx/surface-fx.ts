// Home-page surface effects from the emdash-surface-fx skill (SaariusSkills
// 1411ac4, vendored unchanged in ./vendor). One dithered ultraviolet wash runs
// behind the intro, and the topic cards tilt a little with a glare drawn in the
// same dither, so the cards read as catching the wash. The wash pauses off
// screen through the viewport pool and holds a still frame when the visitor
// asks for less motion; the tilt only runs for a mouse and never then.
import './vendor/viewport-pool.js';
import './vendor/dither.js';
import './vendor/surface-micro.js';

type DitherHandle = { destroy(): void };
type SurfaceFxWindow = Window & {
  mountDitherShader(host: Element, options: Record<string, unknown>): DitherHandle | null;
  mountHoverTilt(target: Element[], options: { maxDeg: number }): Element[];
  ditherPatternSvg(options: Record<string, unknown>): string;
};
const fx = window as unknown as SurfaceFxWindow;

const wash = document.querySelector<HTMLElement>('[data-fx-wash]');
if (wash) {
  const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  let handle: DitherHandle | null = null;
  // Colors come from the page tokens, so light and dark each get their own wash.
  const mount = () => {
    handle?.destroy();
    wash.replaceChildren();
    handle = fx.mountDitherShader(wash, { bg: token('--paper'), ink: token('--mark'), accent: token('--focus'), pixelScale: 3, speed: 0.35 });
  };
  mount();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', mount);
}

const cards = [...document.querySelectorAll<HTMLElement>('.content-split .text-section')];
if (cards.length && matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  // One Bayer tile (4 cells of 3px) masks the glare into the wash's dither.
  const dots = fx.ditherPatternSvg({ density: 0.5, cellSize: 3, bayer: 4, fg: '#000' }).replace('width="100%" height="100%"', 'width="12" height="12"');
  document.documentElement.style.setProperty('--fx-dots', `url("data:image/svg+xml;utf8,${encodeURIComponent(dots)}")`);
  for (const card of cards) card.classList.add('fx-tilt');
  fx.mountHoverTilt(cards, { maxDeg: 3 });
}
