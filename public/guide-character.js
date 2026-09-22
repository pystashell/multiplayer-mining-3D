export const GUIDE_CHARACTER = Object.freeze({
  id: 'parallax',
  name: Object.freeze({
    zh: '陆霁',
    en: 'Lu Ji',
  }),
  codename: Object.freeze({
    zh: '视差',
    en: 'PARALLAX',
  }),
  role: Object.freeze({
    zh: '零域测绘师 · 战术导航员',
    en: 'Zero-Domain Cartographer · Tactical Navigator',
  }),
});

export const GUIDE_ART = Object.freeze({
  story: Object.freeze({
    easy: 'assets/guide-zero-domain-cartographer.png',
    medium: 'assets/parallax-neighbor-perspective.png',
    hard: 'assets/parallax-final-protocol.png',
    ultimate: 'assets/parallax-final-protocol.png',
    squad: 'assets/parallax-squad-command.png',
  }),
  dialogue: Object.freeze({
    easy: Object.freeze({
      main: 'assets/guide-zero-domain-cartographer.png',
      neighbors: 'assets/parallax-easy-neighbors.webp',
      scan: 'assets/parallax-easy-scan.webp',
      finish: 'assets/parallax-easy-finish.webp',
    }),
    medium: Object.freeze({
      main: 'assets/parallax-neighbor-perspective.png',
      tip: 'assets/parallax-medium-tip.webp',
      scan: 'assets/parallax-medium-scan.webp',
      inspect: 'assets/parallax-medium-inspect.webp',
      ready: 'assets/parallax-medium-ready.webp',
    }),
    hard: Object.freeze({
      main: 'assets/parallax-final-protocol.png',
    }),
    ultimate: Object.freeze({
      main: 'assets/parallax-final-protocol.png',
    }),
  }),
});

function languageFor(value) {
  return String(value || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function titleCaseCodename(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : '';
}

export function guideCharacterText(language, character = GUIDE_CHARACTER) {
  const normalized = languageFor(language);
  const name = character.name[normalized];
  const codename = character.codename.en;
  const codenameLocal = character.codename[normalized];
  const codenameTitle = titleCaseCodename(codename);
  return Object.freeze({
    name,
    nameUpper: normalized === 'en' ? name.toUpperCase() : name,
    codename,
    codenameLocal,
    codenameTitle,
    display: normalized === 'zh'
      ? `${name}｜${codename}`
      : `${name.toUpperCase()} | ${codename}`,
    role: character.role[normalized],
    squad: normalized === 'zh'
      ? `${codenameLocal}测绘小队`
      : `${codenameTitle} Survey Squad`,
    computation: normalized === 'zh'
      ? `${codenameLocal}演算`
      : `${codenameTitle} Computation`,
  });
}

export function renderGuideTemplate(language, value, character = GUIDE_CHARACTER) {
  const text = guideCharacterText(language, character);
  return Object.entries(text).reduce(
    (result, [key, replacement]) => result.replaceAll(`{{guide.${key}}}`, replacement),
    String(value),
  );
}
