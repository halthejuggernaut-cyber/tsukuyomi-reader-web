const DEFAULTS = {
  wheelThreshold: 120,
  wheelLockMs: 320,
  touchThreshold: 60
};

export function setupHorizontalPaging(viewportEl, contentEl, options = {}) {
  const viewport = viewportEl;
  const content = contentEl || viewportEl;
  if (!viewport || !content) return () => {};

  const opts = { ...DEFAULTS, ...options };
  let wheelAccum = 0;
  let locked = false;
  let lockTimer = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchActive = false;

  const pageWidth = () => Math.max(1, viewport.clientWidth);

  const refresh = () => {
    const w = pageWidth();
    content.style.columnWidth = `${w}px`;
  };

  const pageBy = (deltaPages) => {
    const w = pageWidth();
    const next = Math.round(viewport.scrollLeft / w) + deltaPages;
    viewport.scrollTo({ left: next * w, behavior: "smooth" });
  };

  const snapToNearest = () => {
    const w = pageWidth();
    const next = Math.round(viewport.scrollLeft / w);
    viewport.scrollTo({ left: next * w, behavior: "smooth" });
  };

  const lock = () => {
    locked = true;
    if (lockTimer) clearTimeout(lockTimer);
    lockTimer = setTimeout(() => {
      locked = false;
    }, opts.wheelLockMs);
  };

  const onWheel = (e) => {
    if (locked) return;
    const delta = e.deltaY || e.deltaX || 0;
    if (delta === 0) return;
    e.preventDefault();
    wheelAccum += delta;
    if (Math.abs(wheelAccum) >= opts.wheelThreshold) {
      const dir = wheelAccum > 0 ? 1 : -1;
      wheelAccum = 0;
      pageBy(dir);
      lock();
    }
  };

  const onWheelEnd = () => {
    if (locked) return;
    if (Math.abs(wheelAccum) > 0) {
      wheelAccum = 0;
      snapToNearest();
    }
  };

  const onTouchStart = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    touchActive = true;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  };

  const onTouchMove = (e) => {
    if (!touchActive || !e.touches || e.touches.length === 0) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (Math.abs(dy) > Math.abs(dx)) {
      e.preventDefault();
    }
  };

  const onTouchEnd = (e) => {
    if (!touchActive) return;
    touchActive = false;
    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    if (Math.abs(dy) < Math.abs(dx)) return;
    if (Math.abs(dy) < opts.touchThreshold) return;
    const dir = dy > 0 ? -1 : 1;
    pageBy(dir);
  };

  viewport.addEventListener("wheel", onWheel, { passive: false });
  viewport.addEventListener("scroll", onWheelEnd);
  viewport.addEventListener("touchstart", onTouchStart, { passive: true });
  viewport.addEventListener("touchmove", onTouchMove, { passive: false });
  viewport.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("resize", refresh);
  window.addEventListener("orientationchange", refresh);

  refresh();

  return () => {
    viewport.removeEventListener("wheel", onWheel);
    viewport.removeEventListener("scroll", onWheelEnd);
    viewport.removeEventListener("touchstart", onTouchStart);
    viewport.removeEventListener("touchmove", onTouchMove);
    viewport.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("resize", refresh);
    window.removeEventListener("orientationchange", refresh);
  };
}
