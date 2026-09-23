export const DESKTOP_APP_URL = 'holo://game/index.html';

const SOLO_SAVE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeSoloSaveId(value) {
  const candidate = String(value ?? '').trim();
  return SOLO_SAVE_ID.test(candidate) ? candidate.toLowerCase() : '';
}

export function desktopUrlForSoloSave(value) {
  const url = new URL(DESKTOP_APP_URL);
  const saveId = normalizeSoloSaveId(value);
  if (saveId) url.searchParams.set('solo', saveId);
  return url.toString();
}

export function soloSaveIdFromDesktopUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'holo:' || url.hostname !== 'game') return '';
    return normalizeSoloSaveId(url.searchParams.get('solo'));
  } catch {
    return '';
  }
}

export function isTrustedDesktopUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'holo:' && url.hostname === 'game';
  } catch {
    return false;
  }
}
