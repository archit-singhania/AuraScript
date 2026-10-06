/* Short compositor transitions; active buffers, focus and scroll remain in place. */
const running = new Set();
const active = new WeakMap();
const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
let userReduced = false;
export const reducedMotion = () => userReduced || systemMotion.matches;
function stop() {
  if (reducedMotion()) for (const animation of running) animation.cancel();
}
systemMotion.addEventListener('change', stop);
export function setMotionPreference(value) {
  userReduced = value === true;
  stop();
}
export function reveal(surface, kind = 'pane') {
  if (!surface || !surface.isConnected || !surface.animate || reducedMotion()) return;
  active.get(surface)?.cancel();
  const offset = kind === 'sheet' ? 12 : kind === 'file' ? 3 : 7;
  const animation = surface.animate(
    [{ opacity: 0.6, transform: `translateY(${offset}px)` }, { opacity: 1, transform: 'translateY(0)' }],
    { duration: kind === 'file' ? 160 : kind === 'sheet' ? 260 : 240, easing: 'cubic-bezier(.22,1,.36,1)' },
  );
  active.set(surface, animation);
  running.add(animation);
  const release = () => { running.delete(animation); if (active.get(surface) === animation) active.delete(surface); };
  animation.addEventListener('finish', release, { once: true });
  animation.addEventListener('cancel', release, { once: true });
}
