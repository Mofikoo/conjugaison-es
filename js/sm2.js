// ─── SM-2 SPACED REPETITION ──────────────────────────────────────────────────

const STORAGE_KEY = 'conjugaison_sm2_v1';
const SETTINGS_KEY = 'conjugaison_settings_v1';
const DAY_MS = 86400000;
const MIN_MS = 60000;

function now() { return Date.now(); }

// SM-2 étendu — q : 1=échec, 2=difficile, 4=bon, 5=facile
// Échec → repasse dans 5 minutes (intra-session)
function sm2Update(card, q) {
  let { interval, easeFactor, repetitions } = card;

  if (q === 1) {
    // Échec : reset + repasse dans 5 min
    return {
      interval: 1,
      easeFactor: Math.max(1.3, easeFactor - 0.2),
      repetitions: 0,
      nextReview: now() + 5 * MIN_MS,
      lastReviewed: now(),
      failed: true,
    };
  }

  if (q === 2) {
    // Difficile : on ne progresse pas, repasse demain
    repetitions = Math.max(0, repetitions - 1);
    interval = 1;
    easeFactor = Math.max(1.3, easeFactor - 0.15);
  } else {
    // Bon (4) ou Facile (5)
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions++;
    if (q === 5) easeFactor = Math.min(3.0, easeFactor + 0.1);
    else easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  }

  return {
    interval,
    easeFactor: Math.round(easeFactor * 1000) / 1000,
    repetitions,
    nextReview: now() + interval * DAY_MS,
    lastReviewed: now(),
    failed: false,
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
    accentStrict:  false,
    openrouterKey: '',
    supabaseUrl:   '',
    supabaseKey:   '',
    userId:        '',
  };
}

function initCardState() {
  return { interval: 1, easeFactor: 2.5, repetitions: 0, nextReview: now(), lastReviewed: null, failed: false };
}

function getOrInitState(settings) {
  const saved = loadState() || {};
  getActiveCards(settings).forEach(c => {
    if (!saved[c.id]) saved[c.id] = initCardState();
  });
  return saved;
}

// ─── CARD SELECTION ──────────────────────────────────────────────────────────

function getActiveCards(settings) {
  return ALL_CARDS.filter(c => {
    const tenseOk = settings.tenses[c.tense];
    const verbOk  = settings.verbs === 'all' || settings.verbs.includes(c.verb);
    return tenseOk && verbOk;
  });
}

function getDueCards(state, settings) {
  const t = now();
  return getActiveCards(settings).filter(c => state[c.id] && state[c.id].nextReview <= t);
}

function getStats(state, settings) {
  const active = getActiveCards(settings);
  const t = now();
  let due = 0, mastered = 0, learning = 0, newCount = 0;
  active.forEach(c => {
    const s = state[c.id];
    if (!s) return;
    if (s.repetitions === 0 && !s.failed) newCount++;
    else if (s.repetitions >= 4 && s.interval >= 21) mastered++;
    else learning++;
    if (s.nextReview <= t) due++;
  });
  return { total: active.length, due, mastered, learning, newCount };
}

function formatNextReview(nextReview) {
  const diff = nextReview - now();
  if (diff <= 0) return 'maintenant';
  const mins = Math.round(diff / MIN_MS);
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
    out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return out;
}