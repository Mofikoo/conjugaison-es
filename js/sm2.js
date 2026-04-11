// ─── SM-2 SPACED REPETITION ──────────────────────────────────────────────────

const STORAGE_KEY   = 'conjugaison_sm2_v1';
const SETTINGS_KEY  = 'conjugaison_settings_v1';
const CARDSTATS_KEY = 'conjugaison_cardstats_v1';
const DAY_MS = 86400000;
const MIN_MS = 60000;

function now() { return Date.now(); }

// ─── SM-2 ALGORITHM ──────────────────────────────────────────────────────────
// SM-2 avec 3 améliorations tirées de morji (Tcl, inspiré de Mnemosyne/Anki) :
// 1. Formules correctes go-srs (EF Wozniak original)
// 2. Interval noise → évite les clusters de révisions
// 3. Late review penalty → révision tardive + difficile = même intervalle

const EF_DEFAULT   = 2.5;
const EF_MIN       = 1.3;
const EF_CONST     = -0.8;
const EF_LINEAR    = 0.28;
const EF_QUADRATIC = 0.02;
const DUE_START    = 6;

const Q_MAP = { 1: 0, 2: 2, 4: 4, 5: 5 };

function calcEasiness(oldEF, q) {
  const v = oldEF + EF_CONST + (EF_LINEAR * q) + (EF_QUADRATIC * q * q);
  return Math.max(EF_MIN, Math.round(v * 1000) / 1000);
}

// Bruit aléatoire (morji/mnemosyne) — évite que toutes les cartes
// apprises le même jour reviennent en pile le même jour
function intervalNoise(days) {
  if (days <= 10)  return Math.round(Math.random() * 2 - 1);
  if (days <= 20)  return Math.round(Math.random() * 5 - 2);
  if (days <= 60)  return Math.round(Math.random() * 7 - 3);
  return Math.round(days * (-0.05 + 0.1 * Math.random()));
}

function sm2Update(card, btnQ) {
  const q = Q_MAP[btnQ] ?? 0;
  const { easeFactor, repetitions, interval, lastReviewed } = card;
  const newEF = calcEasiness(easeFactor, q);

  if (btnQ === 1) {
    return {
      interval: 1, easeFactor: newEF, repetitions: 0,
      nextReview: now() + DAY_MS, lastReviewed: now(), failed: true,
    };
  }

  let newInterval;
  if (repetitions === 0)      newInterval = 1;
  else if (repetitions === 1) newInterval = DUE_START;
  else {
    // Late review penalty (morji) :
    // Si on révise en retard et qu'on trouve difficile,
    // on conserve l'intervalle réel plutôt que de le rallonger
    const actualDays = lastReviewed
      ? Math.round((now() - lastReviewed) / DAY_MS)
      : interval;
    const isLate = actualDays > interval * 1.1;

    if (btnQ === 2 && isLate) {
      newInterval = actualDays; // même intervalle, pas de régression
    } else {
      newInterval = Math.round(DUE_START * Math.pow(easeFactor, repetitions - 1));
      if (btnQ === 2) newInterval = Math.max(1, Math.round(newInterval * 0.8));
      if (btnQ === 5) newInterval = Math.round(newInterval * 1.2);
    }
  }

  // Noise final
  newInterval = Math.max(1, newInterval + intervalNoise(newInterval));

  return {
    interval: newInterval, easeFactor: newEF,
    repetitions: repetitions + 1,
    nextReview: now() + newInterval * DAY_MS,
    lastReviewed: now(), failed: false,
  };
}

// ─── CARD STATS ───────────────────────────────────────────────────────────────

function loadCardStats() {
  try { return JSON.parse(localStorage.getItem(CARDSTATS_KEY) || '{}'); } catch { return {}; }
}

function saveCardStats(cs) {
  try { localStorage.setItem(CARDSTATS_KEY, JSON.stringify(cs)); } catch {}
}

function recordCardResult(cardId, isCorrect, q, cardStats) {
  const s = cardStats[cardId] || { correct:0, wrong:0, btn_fail:0, btn_hard:0, btn_good:0, btn_easy:0, last_seen:null };
  if (isCorrect) s.correct++; else s.wrong++;
  if (q === 1) s.btn_fail++;
  else if (q === 2) s.btn_hard++;
  else if (q === 4) s.btn_good++;
  else if (q === 5) s.btn_easy++;
  s.last_seen = now();
  cardStats[cardId] = s;
  return cardStats;
}

// ─── STATE ───────────────────────────────────────────────────────────────────

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
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
      presente: true, indefinido: false, imperfecto: false,
      perfecto: false, pluscuamperfecto: false, futuro: false,
      condicional: false, subjuntivo_presente: false,
      subjuntivo_imperfecto: false, imperativo: false, imperativo_neg: false,
    },
    verbs: 'all',
    accentStrict: false,
    openrouterKey: '',
    supabaseUrl: '',
    supabaseKey: '',
    userId: '',
  };
}

function initCardState() {
  return { interval:1, easeFactor:2.5, repetitions:0, nextReview:now(), lastReviewed:null };
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
    const isNew      = s.repetitions === 0 && !s.failed && !s.lastReviewed;
    const isMastered = s.repetitions >= 4 && s.interval >= 21;
    if (isNew) newCount++;
    else if (isMastered) mastered++;
    else learning++;
    if (s.nextReview <= t) due++;
  });
  return { total: active.length, due, mastered, learning, newCount };
}

function formatNextReview(nextReview) {
  const diff = nextReview - now();
  if (diff <= 0) return 'maintenant';
  const mins = Math.round(diff / MIN_MS);
  if (mins < 2) return 'dans 1 min';
  if (mins < 60) return `dans ${mins} min`;
  const hours = Math.round(diff / 3600000);
  if (hours < 24) return `dans ${hours}h`;
  const days = Math.round(diff / DAY_MS);
  if (days === 1) return 'demain';
  return `dans ${days} jours`;
}

function normalizeAnswer(s, strict = false) {
  let out = s.trim().toLowerCase();
  if (!strict) out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return out;
}