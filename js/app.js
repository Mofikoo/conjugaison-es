// ─── APP STATE ───────────────────────────────────────────────────────────────
let settings = loadSettings();
let state    = getOrInitState(settings);
let queue    = [];        // cartes à faire cette session
let failQueue = [];       // cartes en échec à repasser dans 5 min
let current  = null;
let sessionCorrect = 0;
let sessionTotal   = 0;

// ─── SCREEN ROUTING ──────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
  if (el) el.classList.add('active');
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function renderHome() {
  state = getOrInitState(settings);
  const stats = getStats(state, settings);
  setText('stat-due',      stats.due);
  setText('stat-learning', stats.learning);
  setText('stat-mastered', stats.mastered);
  setText('stat-total',    stats.total);
  const btn = document.getElementById('btn-study');
  btn.disabled = stats.due === 0;
  btn.textContent = stats.due > 0
    ? `Réviser (${stats.due} carte${stats.due > 1 ? 's' : ''})`
    : 'Aucune carte à réviser';
  showScreen('home');
}

// ─── STUDY SESSION ────────────────────────────────────────────────────────────
function startSession() {
  state = getOrInitState(settings);
  queue = getDueCards(state, settings).sort(() => Math.random() - 0.5);
  failQueue = [];
  if (queue.length === 0) { renderHome(); return; }
  sessionCorrect = 0;
  sessionTotal   = queue.length;
  showScreen('study');
  renderNextCard();
}

function renderNextCard() {
  // Réinjecter les cartes échec dont les 5 min sont écoulées
  const t = now();
  const ready = failQueue.filter(c => state[c.id].nextReview <= t);
  if (ready.length > 0) {
    failQueue = failQueue.filter(c => state[c.id].nextReview > t);
    queue.push(...ready.sort(() => Math.random() - 0.5));
  }

  if (queue.length === 0) {
    if (failQueue.length > 0) {
      // Cartes échouées pas encore prêtes → attendre
      const nextMs = Math.min(...failQueue.map(c => state[c.id].nextReview)) - now();
      const mins   = Math.ceil(nextMs / 60000);
      setText('done-score', failQueue.length + '');
      setText('done-correct', `carte${failQueue.length > 1 ? 's' : ''} en attente — repassent dans ~${mins} min`);
      document.getElementById('btn-done-home').textContent = 'Retour à l\'accueil';
      showScreen('done');
    } else {
      renderDone();
    }
    return;
  }

  current = queue[0];
  const done = sessionTotal - queue.length - failQueue.length;

  const pct = Math.round((Math.max(0, done) / sessionTotal) * 100);
  document.getElementById('progress-fill').style.width = pct + '%';
  setText('study-counter', `${queue.length + failQueue.length} restante${queue.length + failQueue.length > 1 ? 's' : ''}`);

  setText('card-tense',   current.tenseLabel.toUpperCase());
  setText('card-main',    current.verb);
  setText('card-pronoun', current.pronoun);
  setText('card-meaning', current.verbLabel);

  const inp = document.getElementById('answer-input');
  inp.value = '';
  inp.className = 'answer-input';
  inp.disabled = false;
  inp.focus();

  hide('feedback');
  show('btn-check');
  setText('next-review-hint', '');
}

function checkAnswer() {
  if (!current) return;
  const inp   = document.getElementById('answer-input');
  const typed = inp.value;
  if (!typed.trim()) return;

  const strict  = settings.accentStrict;
  const correct = normalizeAnswer(current.answer, strict);
  const given   = normalizeAnswer(typed, strict);
  const isOk    = given === correct;

  inp.disabled = true;
  inp.className = 'answer-input ' + (isOk ? 'correct' : 'wrong');

  if (isOk) sessionCorrect++;

  const fb = document.getElementById('feedback');
  fb.innerHTML = '';

  if (isOk) {
    fb.innerHTML = `
      <div class="feedback-correct">
        <div class="fb-label ok">Correct</div>
        <div class="fb-answer ok">${current.answer}</div>
      </div>`;
  } else {
    fb.innerHTML = `
      <div class="feedback-wrong-panel">
        <div class="fb-label bad">Bonne réponse</div>
        <div class="fb-answer ok" style="color:var(--correct)">${current.answer}</div>
        <div style="margin-top:0.4rem;font-size:0.8rem;color:var(--text3)">Ta réponse : <span style="color:var(--wrong)">${typed || '—'}</span></div>
      </div>`;

    if (settings.openrouterKey) {
      const aiBox = document.createElement('div');
      aiBox.className = 'ai-box';
      aiBox.innerHTML = `<div class="ai-box-header"><div class="ai-dot"></div>Explication IA</div><div class="ai-loading">Chargement…</div>`;
      fb.appendChild(aiBox);
      fetchAI(aiBox, typed);
    }
  }

  // 4 boutons de notation
  const ratingDiv = document.createElement('div');
  ratingDiv.id = 'rating-zone';
  ratingDiv.innerHTML = `
    <div class="rating-label">Comment c'était ?</div>
    <div class="rating-grid-4">
      <button class="rating-btn r-fail"  onclick="rate(1)">Échec<span class="rating-sub">→ 5 min</span></button>
      <button class="rating-btn r-hard"  onclick="rate(2)">Difficile<span class="rating-sub">→ demain</span></button>
      <button class="rating-btn r-good"  onclick="rate(4)">Bon<span class="rating-sub">→ intervalle ×</span></button>
      <button class="rating-btn r-easy"  onclick="rate(5)">Facile<span class="rating-sub">→ intervalle ++</span></button>
    </div>
    <div class="next-review-hint" id="next-review-hint"></div>`;
  fb.appendChild(ratingDiv);

  show('feedback');
  hide('btn-check');
}

async function fetchAI(container, userAnswer) {
  const explanation = await getAIExplanation(current, userAnswer, settings);
  const loadingEl = container.querySelector('.ai-loading');
  if (loadingEl) {
    if (explanation) {
      loadingEl.className = '';
      loadingEl.style.color = 'var(--text2)';
      loadingEl.style.lineHeight = '1.65';
      loadingEl.textContent = explanation;
    } else {
      loadingEl.textContent = 'Explication indisponible.';
    }
  }
}

function rate(q) {
  if (!current) return;
  const updated = sm2Update(state[current.id], q);
  state[current.id] = { ...state[current.id], ...updated };
  saveState(state);

  setText('next-review-hint', 'Prochaine révision : ' + formatNextReview(updated.nextReview));
  document.querySelectorAll('.rating-btn').forEach(b => b.disabled = true);

  const card = queue.shift();

  if (q === 1) {
    // Échec → file d'attente 5 min
    failQueue.push(card);
  }

  setTimeout(() => renderNextCard(), 800);
}

// ─── DONE ─────────────────────────────────────────────────────────────────────
function renderDone() {
  const pct = sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : 0;
  setText('done-score', pct + '%');
  setText('done-correct', `${sessionCorrect} / ${sessionTotal} correctes`);
  document.getElementById('btn-done-home').textContent = 'Retour à l\'accueil';
  showScreen('done');
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
function renderSettings() {
  Object.keys(TENSE_LABELS).forEach(t => {
    const cb = document.getElementById('tense-' + t);
    if (cb) { cb.checked = !!settings.tenses[t]; syncCheckbox(cb); }
  });
  const acc = document.getElementById('toggle-accent');
  if (acc) acc.checked = !!settings.accentStrict;
  const key = document.getElementById('openrouter-key');
  if (key) key.value = settings.openrouterKey || '';
  showScreen('settings');
}

function saveSettingsFromUI() {
  Object.keys(TENSE_LABELS).forEach(t => {
    const cb = document.getElementById('tense-' + t);
    if (cb) settings.tenses[t] = cb.checked;
  });
  const anyTense = Object.values(settings.tenses).some(Boolean);
  if (!anyTense) settings.tenses.presente = true;
  settings.accentStrict = document.getElementById('toggle-accent')?.checked ?? false;
  settings.openrouterKey = (document.getElementById('openrouter-key')?.value || '').trim();
  saveSettings(settings);
  state = getOrInitState(settings);
}

function syncCheckbox(cb) {
  const item = cb.closest('.checkbox-item');
  if (item) item.classList.toggle('checked', cb.checked);
}

// ─── MANAGE (CARD LIST) ───────────────────────────────────────────────────────
let manageFilter = 'all';

function renderManage() {
  renderCardList();
  showScreen('manage');
}

function renderCardList() {
  const container = document.getElementById('card-list');
  const t = now();
  const cards = getActiveCards(settings);

  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === manageFilter);
  });

  let list = cards;
  if (manageFilter !== 'all') {
    list = cards.filter(c => {
      const s = state[c.id];
      if (!s) return false;
      if (manageFilter === 'due')      return s.nextReview <= t;
      if (manageFilter === 'mastered') return s.repetitions >= 4 && s.interval >= 21;
      if (manageFilter === 'learning') return s.repetitions > 0 && !(s.repetitions >= 4 && s.interval >= 21);
      if (manageFilter === 'new')      return s.repetitions === 0 && !s.failed;
      return true;
    });
  }

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state"><span style="font-size:1.5rem">🔍</span><p>Aucune carte dans ce filtre.</p></div>';
    return;
  }

  container.innerHTML = list.slice(0, 200).map(c => {
    const s = state[c.id];
    const isDue     = s.nextReview <= t;
    const isNew     = s.repetitions === 0 && !s.failed;
    const isMastered= s.repetitions >= 4 && s.interval >= 21;
    const pill = isDue && !isNew
      ? '<span class="pill pill-due">À réviser</span>'
      : isNew
      ? '<span class="pill pill-new">Nouveau</span>'
      : isMastered
      ? '<span class="pill pill-ok">Maîtrisé</span>'
      : `<span class="pill pill-sched">${formatNextReview(s.nextReview)}</span>`;
    return `
      <div class="card-list-item">
        <div class="cli-left">
          <span class="cli-pronoun">${c.pronoun}</span>
          <span class="cli-verb">${c.verb}</span>
          <span class="cli-tense">(${c.tenseLabel})</span>
        </div>
        ${pill}
      </div>`;
  }).join('');
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-study').addEventListener('click', startSession);
  document.getElementById('btn-settings').addEventListener('click', renderSettings);
  document.getElementById('btn-manage').addEventListener('click', renderManage);
  document.getElementById('btn-guide').addEventListener('click', renderGuide);
  document.getElementById('btn-done-home').addEventListener('click', () => renderHome());

  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.back === 'settings') saveSettingsFromUI();
      renderHome();
    });
  });

  document.getElementById('btn-check').addEventListener('click', checkAnswer);
  document.getElementById('answer-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const fb = document.getElementById('feedback');
      if (fb.style.display === 'none' || !fb.style.display) checkAnswer();
    }
  });

  document.querySelectorAll('.checkbox-item input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => syncCheckbox(cb));
  });

  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      manageFilter = chip.dataset.filter;
      renderCardList();
    });
  });

  renderHome();
});

// ─── GUIDE ────────────────────────────────────────────────────────────────────
const GUIDE_DATA = [
  {
    es: 'Presente',
    fr: 'Présent de l\'indicatif',
    triggers: ['ahora', 'siempre', 'todos los días', 'generalmente'],
    usage: 'Actions habituelles, vérités générales, et ce qui se passe en ce moment. Aussi utilisé pour le futur proche et les récits au présent historique.',
    examples: [
      { es: 'Trabajo en Madrid.', fr: 'Je travaille à Madrid.' },
      { es: 'El sol sale por el este.', fr: 'Le soleil se lève à l\'est.' },
      { es: 'Mañana voy al médico.', fr: 'Demain je vais chez le médecin. (futur proche)' },
    ],
  },
  {
    es: 'Pretérito indefinido',
    fr: 'Prétérit indéfini — passé simple',
    triggers: ['ayer', 'el año pasado', 'en 2010', 'hace tres días'],
    usage: 'Actions passées complètes et délimitées dans le temps. Rupture avec le présent. Idéal pour raconter une histoire ou une séquence d\'événements.',
    examples: [
      { es: 'Ayer comí paella.', fr: 'Hier j\'ai mangé de la paëlla.' },
      { es: 'Vivió en París durante dos años.', fr: 'Il a vécu à Paris pendant deux ans.' },
      { es: 'Llegué, vi, vencí.', fr: 'Je suis arrivé, j\'ai vu, j\'ai vaincu.' },
    ],
  },
  {
    es: 'Pretérito imperfecto',
    fr: 'Imparfait de l\'indicatif',
    triggers: ['antes', 'cuando era niño', 'siempre (passé)', 'de niño'],
    usage: 'Actions habituelles dans le passé, descriptions, contexte narratif, et actions en cours interrompues. Contraste avec l\'indéfini pour les récits.',
    examples: [
      { es: 'Cuando era niño, jugaba al fútbol.', fr: 'Quand j\'étais enfant, je jouais au foot.' },
      { es: 'El cielo estaba nublado.', fr: 'Le ciel était nuageux. (description)' },
      { es: 'Dormía cuando sonó el teléfono.', fr: 'Je dormais quand le téléphone a sonné.' },
    ],
  },
  {
    es: 'Pretérito perfecto compuesto',
    fr: 'Passé composé (avec haber)',
    triggers: ['hoy', 'esta semana', 'alguna vez', 'ya', 'todavía no'],
    usage: 'Actions passées liées au présent (aujourd\'hui, cette semaine) ou expériences de vie. Dominant en Espagne, moins utilisé en Amérique latine.',
    examples: [
      { es: 'Hoy he comido tarde.', fr: 'Aujourd\'hui j\'ai mangé tard.' },
      { es: '¿Has estado alguna vez en Japón?', fr: 'Tu es déjà allé au Japon ?' },
      { es: 'Todavía no he terminado.', fr: 'Je n\'ai pas encore terminé.' },
    ],
  },
  {
    es: 'Pretérito pluscuamperfecto',
    fr: 'Plus-que-parfait',
    triggers: ['ya', 'cuando llegué...', 'antes de que', 'nunca antes'],
    usage: 'Action passée antérieure à une autre action passée. Toujours en relation avec un autre moment du passé.',
    examples: [
      { es: 'Cuando llegué, ya había salido.', fr: 'Quand je suis arrivé, il était déjà parti.' },
      { es: 'Nunca había visto tanta nieve.', fr: 'Je n\'avais jamais vu autant de neige.' },
      { es: 'Le dije que había estudiado.', fr: 'Je lui ai dit que j\'avais étudié.' },
    ],
  },
  {
    es: 'Futuro simple',
    fr: 'Futur simple',
    triggers: ['mañana', 'el próximo año', 'dentro de poco', 'seguramente'],
    usage: 'Actions futures, prédictions, suppositions sur le présent. Aussi utilisé pour exprimer une probabilité ("doit être").',
    examples: [
      { es: 'Mañana lloverá en Madrid.', fr: 'Demain il pleuvra à Madrid.' },
      { es: '¿Cuántos años tendrá?', fr: 'Quel âge peut-il bien avoir ? (supposition)' },
      { es: 'Será las tres.', fr: 'Il doit être trois heures.' },
    ],
  },
  {
    es: 'Condicional simple',
    fr: 'Conditionnel présent',
    triggers: ['si pudiera...', 'me gustaría', 'debería', 'en tu lugar'],
    usage: 'Hypothèses, désirs polis, suggestions, conséquence d\'une condition irréelle, ou futur dans le passé (discours indirect).',
    examples: [
      { es: 'Me gustaría vivir en Barcelona.', fr: 'J\'aimerais vivre à Barcelone.' },
      { es: 'Si tuviera dinero, viajaría.', fr: 'Si j\'avais de l\'argent, je voyagerais.' },
      { es: 'Dijo que vendría.', fr: 'Il a dit qu\'il viendrait. (futur dans le passé)' },
    ],
  },
  {
    es: 'Subjuntivo presente',
    fr: 'Subjonctif présent',
    triggers: ['quiero que', 'es importante que', 'ojalá', 'cuando (futur)', 'aunque'],
    usage: 'Subordonnées exprimant un souhait, une émotion, un doute, une hypothèse ou une condition future. Se déclenche après certaines conjonctions et verbes de volonté/sentiment.',
    examples: [
      { es: 'Quiero que vengas.', fr: 'Je veux que tu viennes.' },
      { es: 'Ojalá haga buen tiempo.', fr: 'Pourvu qu\'il fasse beau.' },
      { es: 'Cuando llegues, llámame.', fr: 'Quand tu arriveras, appelle-moi.' },
    ],
  },
  {
    es: 'Subjuntivo imperfecto',
    fr: 'Subjonctif imparfait',
    triggers: ['si... (irréel)', 'quería que', 'como si', 'ojalá (passé)'],
    usage: 'Subjonctif dans un contexte passé, hypothèses irréelles au présent (si + imparfait subj. + conditionnel), discours indirect passé.',
    examples: [
      { es: 'Si tuviera tiempo, estudiaría más.', fr: 'Si j\'avais le temps, j\'étudierais plus.' },
      { es: 'Quería que vinieras.', fr: 'Je voulais que tu viennes.' },
      { es: 'Habla como si supiera todo.', fr: 'Il parle comme s\'il savait tout.' },
    ],
  },
  {
    es: 'Imperativo',
    fr: 'Impératif affirmatif',
    triggers: ['¡ven!', '¡habla!', 'ordre direct', 'instruction'],
    usage: 'Ordres et instructions directes. Pas de forme pour yo. Attention aux irréguliers : tú → haz, di, pon, sal, ten, ven, ve, sé.',
    examples: [
      { es: '¡Habla más despacio!', fr: 'Parle plus lentement !' },
      { es: 'Ven aquí.', fr: 'Viens ici.' },
      { es: 'Comed despacio.', fr: 'Mangez lentement. (vosotros)' },
    ],
  },
  {
    es: 'Imperativo negativo',
    fr: 'Impératif négatif',
    triggers: ['¡no hagas!', 'interdiction', 'no + subjonctif'],
    usage: 'Interdictions directes. Se forme avec "no" + subjonctif présent. Différent de l\'impératif affirmatif : tú → habla (aff.) mais no hables (nég.).',
    examples: [
      { es: '¡No hables tan rápido!', fr: 'Ne parle pas si vite !' },
      { es: 'No lo hagas.', fr: 'Ne fais pas ça.' },
      { es: 'No comáis antes de las 8.', fr: 'Ne mangez pas avant 8h. (vosotros)' },
    ],
  },
];

function renderGuide() {
  const container = document.getElementById('guide-content');
  container.innerHTML = GUIDE_DATA.map((t, i) => `
    <div class="guide-tense" id="guide-${i}">
      <div class="guide-tense-header" onclick="toggleGuide(${i})">
        <div>
          <div class="guide-tense-name">${t.es}</div>
          <div class="guide-tense-fr">${t.fr}</div>
        </div>
        <span class="guide-chevron">▼</span>
      </div>
      <div class="guide-tense-body">
        <div class="guide-trigger">${t.triggers.join(' · ')}</div>
        <div class="guide-usage">${t.usage}</div>
        <div class="guide-examples">
          ${t.examples.map(ex => `
            <div class="guide-example">
              <div class="guide-es">${ex.es}</div>
              <div class="guide-fr">${ex.fr}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>`).join('');
  showScreen('guide');
}

function toggleGuide(i) {
  document.getElementById('guide-' + i).classList.toggle('open');
}