const OVERLAY_IDS = [
  'control-settings-overlay',
  'tutorial-overlay',
  'ad-modal-overlay',
  'modal-overlay',
  'lobby-overlay',
];

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

function canFocus(element) {
  return element?.isConnected
    && !element.disabled
    && element.tabIndex >= 0
    && !element.closest('[inert], [hidden], .hidden')
    && element.getClientRects().length > 0
    && getComputedStyle(element).visibility !== 'hidden';
}

function focusableWithin(overlay) {
  return [...overlay.querySelectorAll(FOCUSABLE)].filter(canFocus);
}

export function nextModalTabStop(stops, current, backwards = false) {
  if (!stops.length) return null;
  const index = stops.indexOf(current);
  if (index < 0) return backwards ? stops.at(-1) : stops[0];
  return stops[(index + (backwards ? -1 : 1) + stops.length) % stops.length];
}

export function installModalFocusManager(doc = document) {
  const overlays = OVERLAY_IDS.map((id) => doc.getElementById(id));
  const returnTargets = new WeakMap();
  let active = null;
  let redirecting = false;

  const topOverlay = () => overlays.find((overlay) => overlay
    && !overlay.classList.contains('hidden')
    && getComputedStyle(overlay).display !== 'none') ?? null;

  const focusInside = (overlay) => {
    const target = focusableWithin(overlay)[0] ?? overlay;
    target.focus({ preventScroll: true });
  };

  const pageFallback = () => {
    const guidedPointer = doc.getElementById('guided-cell-pointer');
    if (canFocus(guidedPointer)) return guidedPointer;
    return [...doc.querySelectorAll(FOCUSABLE)].find(canFocus) ?? null;
  };

  const sync = () => {
    const next = topOverlay();
    const previous = active;
    if (next !== previous && next && canFocus(doc.activeElement)) {
      returnTargets.set(next, doc.activeElement);
    }
    active = next;

    for (const child of doc.body.children) {
      child.inert = next ? child !== next : overlays.includes(child);
    }

    if (next !== previous) {
      const returnTarget = previous && returnTargets.get(previous);
      if (returnTarget && canFocus(returnTarget) && (!next || next.contains(returnTarget))) {
        returnTarget.focus({ preventScroll: true });
      } else if (next) {
        if (!next.contains(doc.activeElement) || !canFocus(doc.activeElement)) focusInside(next);
      } else if (previous) {
        pageFallback()?.focus({ preventScroll: true });
      }
    } else if (next && (!next.contains(doc.activeElement) || !canFocus(doc.activeElement))) {
      focusInside(next);
    }
  };

  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || !active) return;
    const target = nextModalTabStop(focusableWithin(active), doc.activeElement, event.shiftKey);
    event.preventDefault();
    (target ?? active).focus({ preventScroll: true });
  }, true);

  doc.addEventListener('focusin', (event) => {
    if (redirecting || topOverlay() !== active || !active || active.contains(event.target)) return;
    redirecting = true;
    focusInside(active);
    redirecting = false;
  }, true);

  const observer = new MutationObserver(sync);
  for (const overlay of overlays) {
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  }
  observer.observe(doc.body, { childList: true });
  sync();
  return sync;
}
