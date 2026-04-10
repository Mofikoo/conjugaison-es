// ─── SM-2 SPACED REPETITION ──────────────────────────────────────────────────

const STORAGE_KEY = 'conjugaison_sm2_v1';
const SETTINGS_KEY = 'conjugaison_settings_v1';
const DAY_MS = 86400000;

function now() { return Date.now(); }

// SM-2 algorithm: q = quality of response (1=fail, 3=hard, 4=ok, 5=easy)
function sm2Update(card, q) {
  let { interval, easeFactor, repetitions } = card;

  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions++;
    easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  }

  return {
    interval,
    easeFactor: Math.round(easeFactor * 1000) / 1000,
    repetitions,
    nextReview: now() + interval * DAY_MS,
    lastReviewed: now(),
  };
}

// ─── STATE ───────────────────────────────────────────────────────────────────

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : getDefaultSettings();
  } catch { return getDefaultSettings(); }
}

function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

function getDefaultSettings() {
  return {
    tenses: {
      presente:              true,
      indefinido:            false,
      imperfecto:            false,
      perfecto:              false,
      pluscuamperfecto:      false,
      futuro:                false,
      condicional:           false,
      subjuntivo_presente:   false,
      subjuntivo_imperfecto: false,
      imperativo:            false,
      imperativo_neg:        false,
    },
    verbs: 'all',
    accentStrict: false,
    openrouterKey: '',
  };
}

function initCardState(cardId) {
  return { interval: 1, easeFactor: 2.5, repetitions: 0, nextReview: now(), lastReviewed: null };
}

function getOrInitState(settings) {
  const saved = loadState() || {};
  // Make sure all active cards have a state entry
  getActiveCards(settings).forEach(c => {
    if (!saved[c.id]) saved[c.id] = initCardState(c.id);
  });
  return saved;
}

// ─── CARD SELECTION ──────────────────────────────────────────────────────────

function getActiveCards(settings) {
  return ALL_CARDS.filter(c => {
    const tenseOk = settings.tenses[c.tense];
    const verbOk = settings.verbs === 'all' || settings.verbs.includes(c.verb);
    return tenseOk && verbOk;
  });
}

function getDueCards(state, settings) {
  const t = now();
  return getActiveCards(settings).filter(c => state[c.id] && state[c.id].nextReview <= t);
}

function getNewCards(state, settings) {
  return getActiveCards(settings).filter(c => state[c.id] && state[c.id].repetitions === 0 && state[c.id].nextReview <= t);
}

function getStats(state, settings) {
  const active = getActiveCards(settings);
  const t = now();
  let due = 0, mastered = 0, learning = 0, newCount = 0;
  active.forEach(c => {
    const s = state[c.id];
    if (!s) return;
    if (s.repetitions === 0) newCount++;
    else if (s.repetitions >= 4 && s.interval >= 21) mastered++;
    else learning++;
    if (s.nextReview <= t) due++;
  });
  return { total: active.length, due, mastered, learning, newCount };
}

function formatNextReview(nextReview) {
  const diff = nextReview - now();
  if (diff <= 0) return 'maintenant';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `dans ${mins} min`;
  const hours = Math.round(diff / 3600000);
  if (hours < 24) return `dans ${hours}h`;
  const days = Math.round(diff / DAY_MS);
  if (days === 1) return 'demain';
  return `dans ${days} jours`;
}

function normalizeAnswer(s, strict = false) {
  let out = s.trim().toLowerCase();
  if (!strict) {
    // Replace accented chars with unaccented equivalents
    out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return out;
}