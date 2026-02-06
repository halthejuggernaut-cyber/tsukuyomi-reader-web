import { qs, escapeHtml } from "./utils.js";
import { APP_VERSION } from "./version.js";

const TAP_LEFT_RATIO = 0.33;
const TAP_RIGHT_RATIO = 0.66;
const TAP_MOVE_THRESHOLD_PX = 12;
const TAP_DEDUP_MS = 450;
const WHEEL_DIRECTION = 1;
const EFFECT_DURATION = {
  dim: 110,
  fade: 140
};

export function initReader({ book, settings, progress, onBack, onExport, onUpdateSettings, onUpdateProgress }) {
  const backBtn = qs("#backBtn");
  const printBtn = qs("#printBtn");
  const exportBtn = qs("#exportBtn");
  const settingsBtn = qs("#settingsBtn");
  const closeSettingsBtn = qs("#closeSettingsBtn");
  const settingsPanel = qs("#settingsPanel");
  const tocList = qs("#tocList");
  const readerViewport = qs("#readerViewport") || qs("#bookContent");
  const bookContent = qs("#bookContent");
  const bookTitle = qs("#bookTitle");
  const versionBadge = qs("#versionBadge");
  const topbar = qs("#readerTopbar");
  const tapZone = qs("#tapZone");
  const hScroll = qs("#hScroll");
  const fontSizeRange = qs("#fontSizeRange");
  const lineHeightRange = qs("#lineHeightRange");
  const letterSpacingRange = qs("#letterSpacingRange");
  const themeSelect = qs("#themeSelect");
  const displayModeRadios = Array.from(document.querySelectorAll("input[name=\"displayMode\"]"));
  const pageEffectSelect = qs("#pageEffectSelect");
  const tapInScroll = qs("#tapInScroll");
  const pageEffect = qs("#pageEffect");
  const refreshHScroll = setupHScroll(readerViewport);
  let modeController = null;
  let currentMode = "paged";
  let currentEffect = "none";

  backBtn.addEventListener("click", onBack);
  printBtn.addEventListener("click", () => window.print());
  exportBtn.addEventListener("click", onExport);
  if (versionBadge) {
    versionBadge.textContent = `v${APP_VERSION}`;
  }

  settingsBtn.addEventListener("click", () => toggleSettings(true));
  closeSettingsBtn.addEventListener("click", () => toggleSettings(false));

  renderBook(book);
  applySettings(settings);
  bindSettingsEvents();
  applyProgress(progress, refreshHScroll);
  bindProgressTracking();
  scheduleRefreshHScroll();

  function toggleSettings(open) {
    if (open) {
      settingsPanel.classList.add("open");
      settingsPanel.setAttribute("aria-hidden", "false");
    } else {
      settingsPanel.classList.remove("open");
      settingsPanel.setAttribute("aria-hidden", "true");
    }
  }

  function renderBook(currentBook) {
    if (!currentBook) return;

    bookTitle.innerHTML = escapeHtml(currentBook.title || "Untitled");
    bookContent.innerHTML = currentBook.html || "";

    tocList.innerHTML = "";
    (currentBook.toc || []).forEach((item) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = escapeHtml(item.title || "");
      btn.addEventListener("click", () => {
        const target = document.getElementById(item.chapterId);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      li.appendChild(btn);
      tocList.appendChild(li);
    });

    // Phase 1は全文一括DOM生成。大容量対応はPhase 2で検討。
    scheduleRefreshHScroll();
  }

  function applySettings(nextSettings) {
    if (!nextSettings) return;

    document.documentElement.style.setProperty("--font-size", Number(nextSettings.fontSize) || 100);
    document.documentElement.style.setProperty("--line-height", Number(nextSettings.lineHeight) || 1.8);
    document.documentElement.style.setProperty("--letter-spacing", `${Number(nextSettings.letterSpacing) || 0}px`);
    applyTheme(nextSettings.theme || "light");

    fontSizeRange.value = String(nextSettings.fontSize ?? 100);
    lineHeightRange.value = String(nextSettings.lineHeight ?? 1.8);
    letterSpacingRange.value = String(nextSettings.letterSpacing ?? 0);
    themeSelect.value = nextSettings.theme || "light";

    const displayMode = nextSettings.displayMode || "paged";
    const effect = nextSettings.pageEffect || "none";
    const tapEnabled = Boolean(nextSettings.tapInScroll);
    displayModeRadios.forEach((radio) => {
      radio.checked = radio.value === displayMode;
    });
    pageEffectSelect.value = effect;
    tapInScroll.checked = tapEnabled;
    currentMode = displayMode;
    currentEffect = effect;
    applyDisplayMode(displayMode, { tapInScroll: tapEnabled });
  }

  function applyTheme(theme) {
    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(theme === "dark" ? "theme-dark" : "theme-light");
  }

  function bindSettingsEvents() {
    fontSizeRange.addEventListener("input", () => updateSettings({ fontSize: Number(fontSizeRange.value) }));
    lineHeightRange.addEventListener("input", () => updateSettings({ lineHeight: Number(lineHeightRange.value) }));
    letterSpacingRange.addEventListener("input", () => updateSettings({ letterSpacing: Number(letterSpacingRange.value) }));
    themeSelect.addEventListener("change", () => updateSettings({ theme: themeSelect.value }));
    displayModeRadios.forEach((radio) => {
      radio.addEventListener("change", () => updateSettings({ displayMode: radio.value }));
    });
    pageEffectSelect.addEventListener("change", () => updateSettings({ pageEffect: pageEffectSelect.value }));
    tapInScroll.addEventListener("change", () => updateSettings({ tapInScroll: tapInScroll.checked }));
  }

  function updateSettings(patch) {
    const next = {
      fontSize: Number(fontSizeRange.value) || 100,
      lineHeight: Number(lineHeightRange.value) || 1.8,
      letterSpacing: Number(letterSpacingRange.value) || 0,
      theme: themeSelect.value || "light",
      displayMode: getCheckedDisplayMode(),
      pageEffect: pageEffectSelect.value || "none",
      tapInScroll: tapInScroll.checked,
      ...patch
    };
    applySettings(next);
    onUpdateSettings(next);
  }

  function getCheckedDisplayMode() {
    const checked = displayModeRadios.find((radio) => radio.checked);
    return checked ? checked.value : "paged";
  }

  function applyDisplayMode(mode, options = {}) {
    bookContent.classList.remove("mode-paged", "mode-scrollx", "mode-scrolly");
    if (mode === "scrollX") {
      bookContent.classList.add("mode-scrollx");
    } else if (mode === "scrollY") {
      bookContent.classList.add("mode-scrolly");
    } else {
      bookContent.classList.add("mode-paged");
    }

    if (modeController) modeController.abort();
    modeController = new AbortController();
    const signal = modeController.signal;

    const tapEnabled = mode === "paged" || options.tapInScroll;
    if (tapEnabled) {
      bindPageTap(readerViewport, mode, signal);
    } else {
      bindCenterTapOnly(readerViewport, signal);
    }

    if (mode === "scrollX") {
      bindWheelToHorizontalScroll(readerViewport, signal);
    }

    if (hScroll) {
      const enable = mode !== "scrollY";
      hScroll.disabled = !enable;
    }

    scheduleRefreshHScroll();
  }

  function bindProgressTracking() {
    const handler = throttle(() => {
      const chapterId = getCurrentChapterId();
      const mode = getCheckedDisplayMode();
      const scrollLeft = readerViewport.scrollLeft;
      const scrollTop = readerViewport.scrollTop;
      const w = readerViewport.clientWidth || 1;
      const pageIndex = Math.round(scrollLeft / w);
      const payload = { chapterId, scrollLeft, pageIndex };
      if (mode === "scrollY") {
        payload.scrollTop = scrollTop;
      }
      onUpdateProgress(payload);
    }, 250);

    readerViewport.addEventListener("scroll", handler);
  }

  function getCurrentChapterId() {
    const chapters = Array.from(bookContent.querySelectorAll("section.chapter"));
    if (chapters.length === 0) return "chapter-001";

    const containerRect = bookContent.getBoundingClientRect();
    let candidate = chapters[0];

    for (const chapter of chapters) {
      const rect = chapter.getBoundingClientRect();
      const offset = rect.top - containerRect.top;
      if (offset <= 24) {
        candidate = chapter;
      } else {
        break;
      }
    }

    return candidate.getAttribute("id") || "chapter-001";
  }

  function applyProgress(nextProgress, refresh) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (nextProgress) {
          const mode = getCheckedDisplayMode();
          if (mode === "scrollY" && nextProgress.scrollTop != null) {
            readerViewport.scrollTop = Number(nextProgress.scrollTop) || 0;
          } else {
            const w = readerViewport.clientWidth || 1;
            if (nextProgress.pageIndex != null) {
              readerViewport.scrollLeft = Number(nextProgress.pageIndex) * w;
            } else if (nextProgress.scrollLeft != null) {
              readerViewport.scrollLeft = Number(nextProgress.scrollLeft) || 0;
            }
          }
        }
        if (typeof refresh === "function") refresh();
      });
    });
  }

  function setupHScroll(content) {
    const slider = hScroll;
    if (!slider || !content) return () => {};

    const refresh = () => {
      content.style.setProperty("--page-width", `${content.clientWidth}px`);
      const max = Math.max(0, content.scrollWidth - content.clientWidth);
      slider.max = String(max);
      slider.value = String(Math.min(max, content.scrollLeft));
      slider.disabled = max === 0;
    };

    slider.addEventListener("input", () => {
      content.scrollLeft = Number(slider.value);
    });

    content.addEventListener("scroll", () => {
      slider.value = String(content.scrollLeft);
    });

    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);

    requestAnimationFrame(() => {
      refresh();
      requestAnimationFrame(refresh);
    });

    return refresh;
  }

  function bindPageTap(content, mode, signal) {
    if (!content) return;

    let startX = 0;
    let startY = 0;
    let moved = false;
    let lastTouchTs = 0;

    const handleTapAtClientX = (clientX) => {
      const rect = content.getBoundingClientRect();
      const x = clientX - rect.left;
      const w = rect.width || 1;

      if (x < w * TAP_LEFT_RATIO) {
        pageBy(content, mode, -1);
        if (mode === "paged") triggerPageEffect(currentEffect);
      } else if (x > w * TAP_RIGHT_RATIO) {
        pageBy(content, mode, 1);
        if (mode === "paged") triggerPageEffect(currentEffect);
      } else {
        topbar.classList.toggle("hidden");
      }
    };

    content.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      moved = false;
    }, { passive: true, signal });

    content.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      if (!t) return;
      const dx = Math.abs(t.clientX - startX);
      const dy = Math.abs(t.clientY - startY);
      if (dx > TAP_MOVE_THRESHOLD_PX || dy > TAP_MOVE_THRESHOLD_PX) {
        moved = true;
      }
    }, { passive: true, signal });

    content.addEventListener("touchend", (e) => {
      lastTouchTs = Date.now();
      if (moved) return;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      handleTapAtClientX(t.clientX);
    }, { passive: true, signal });

    content.addEventListener("click", (e) => {
      if (Date.now() - lastTouchTs < TAP_DEDUP_MS) return;
      handleTapAtClientX(e.clientX);
    }, { signal });
  }

  function bindCenterTapOnly(content, signal) {
    if (!content) return;
    let startX = 0;
    let startY = 0;
    let moved = false;
    let lastTouchTs = 0;

    const handleTapAtClientX = (clientX) => {
      const rect = content.getBoundingClientRect();
      const x = clientX - rect.left;
      const w = rect.width || 1;
      if (x >= w * TAP_LEFT_RATIO && x <= w * TAP_RIGHT_RATIO) {
        topbar.classList.toggle("hidden");
      }
    };

    content.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      moved = false;
    }, { passive: true, signal });

    content.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      if (!t) return;
      const dx = Math.abs(t.clientX - startX);
      const dy = Math.abs(t.clientY - startY);
      if (dx > TAP_MOVE_THRESHOLD_PX || dy > TAP_MOVE_THRESHOLD_PX) {
        moved = true;
      }
    }, { passive: true, signal });

    content.addEventListener("touchend", (e) => {
      lastTouchTs = Date.now();
      if (moved) return;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      handleTapAtClientX(t.clientX);
    }, { passive: true, signal });

    content.addEventListener("click", (e) => {
      if (Date.now() - lastTouchTs < TAP_DEDUP_MS) return;
      handleTapAtClientX(e.clientX);
    }, { signal });
  }

  function bindWheelToHorizontalScroll(content, signal) {
    if (!content) return;
    const direction = WHEEL_DIRECTION;
    content.addEventListener("wheel", (e) => {
      e.preventDefault();
      const useY = Math.abs(e.deltaY) >= Math.abs(e.deltaX);
      const delta = (useY ? e.deltaY : e.deltaX) * direction;
      content.scrollLeft += delta;
    }, { passive: false, signal });
  }

  function scheduleRefreshHScroll() {
    requestAnimationFrame(() => {
      refreshHScroll();
      requestAnimationFrame(() => {
        refreshHScroll();
      });
    });
  }

  function triggerPageEffect(effect) {
    if (!pageEffect || effect === "none") return;
    pageEffect.classList.remove("dim", "fade");
    pageEffect.classList.add(effect, "active");
    const duration = effect === "fade" ? EFFECT_DURATION.fade : EFFECT_DURATION.dim;
    setTimeout(() => {
      pageEffect.classList.remove("active");
      pageEffect.classList.remove(effect);
    }, duration);
  }
}

function throttle(fn, wait) {
  let timer = null;
  let lastArgs = null;

  return function throttled(...args) {
    lastArgs = args;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      fn(...lastArgs);
    }, wait);
  };
}

function pageBy(content, mode, deltaPages) {
  if (!content) return;
  if (mode === "scrollY") {
    const delta = deltaPages * content.clientHeight;
    content.scrollTo({ top: content.scrollTop + delta, behavior: "smooth" });
    return;
  }

  const delta = deltaPages * content.clientWidth;
  content.scrollTo({ left: content.scrollLeft + delta, behavior: "smooth" });
}
