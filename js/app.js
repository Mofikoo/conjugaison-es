// ─── APP STATE ───────────────────────────────────────────────────────────────
let settings   = loadSettings();
let state      = getOrInitState(settings);
let cardStats  = loadCardStats();
let queue      = [];
let failQueue  = [];
let current    = null;
let sessionCorrect = 0;
let sessionTotal   = 0;

// ─── SCREEN ROUTING ──────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
  if (el) el.classList.add('active');
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
async function renderHome() {
  const remote = await supabasePull(settings);
  if (remote) {
    Object.entries(remote).forEach(([id, s]) => { state[id] = s; });
    saveState(state);
  }
  const remoteStats = await supabaseStatsPull(settings);
  if (remoteStats) {
    // Merge : additionner les compteurs (max entre local et remote)
    Object.entries(remoteStats).forEach(([id, s]) => {
      const local = cardStats[id];
      if (!local) { cardStats[id] = s; return; }
      cardStats[id] = {
        correct:  Math.max(local.correct  || 0, s.correct  || 0),
        wrong:    Math.max(local.wrong    || 0, s.wrong    || 0),
        btn_fail: Math.max(local.btn_fail || 0, s.btn_fail || 0),
        btn_hard: Math.max(local.btn_hard || 0, s.btn_hard || 0),
        btn_good: Math.max(local.btn_good || 0, s.btn_good || 0),
        btn_easy: Math.max(local.btn_easy || 0, s.btn_easy || 0),
        last_seen: Math.max(local.last_seen || 0, s.last_seen || 0),
      };
    });
    saveCardStats(cardStats);
  }
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
  queue     = getDueCards(state, settings).sort(() => Math.random() - 0.5);
  failQueue = [];
  if (queue.length === 0) { renderHome(); return; }
  sessionCorrect = 0;
  sessionTotal   = queue.length;
  showScreen('study');
  renderNextCard();
}

function renderNextCard() {
  if (queue.length === 0) {
    if (failQueue.length > 0) {
      // Cartes en attente — afficher un message d'attente
      setText('card-tense', 'EN ATTENTE');
      setText('card-main', '⏱');
      setText('card-pronoun', `${failQueue.length} carte${failQueue.length > 1 ? 's' : ''} reviennent dans ~5 min`);
      setText('card-meaning', '');
      hide('btn-check');
      hide('feedback');
      document.getElementById('special-keys-study').innerHTML = '';
    } else {
      renderDone();
    }
    return;
  }

  current = queue[0];
  const remaining = queue.length + failQueue.length;
  const done = sessionTotal - remaining;
  document.getElementById('progress-fill').style.width = Math.round((done / sessionTotal) * 100) + '%';
  setText('study-counter', `${remaining} restante${remaining > 1 ? 's' : ''}`);

  setText('card-tense',   current.tenseLabel.toUpperCase());
  setText('card-main',    current.verb);
  setText('card-pronoun', current.pronoun);
  setText('card-meaning', current.verbLabel);

  const inp = document.getElementById('answer-input');
  inp.value = '';
  inp.className = 'answer-input';
  inp.disabled = false;
  inp.focus();

  // Clavier caractères spéciaux
  document.getElementById('special-keys-study').innerHTML = buildSpecialKeyboard('answer-input');

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
        <div class="fb-label ok">Correct ✓</div>
        <div class="fb-answer ok">${current.answer}</div>
      </div>`;
  } else {
    fb.innerHTML = `
      <div class="feedback-wrong-panel">
        <div class="fb-label bad">Bonne réponse</div>
        <div class="fb-answer" style="color:var(--correct)">${current.answer}</div>
        <div style="margin-top:0.3rem;font-size:0.82rem;color:var(--text3)">Ta réponse : <span style="color:var(--wrong)">${typed || '—'}</span></div>
      </div>`;
  }

  // Conjugaison complète — toujours affichée
  const conjugaison = getFullConjugation(current);
  if (conjugaison) {
    const rows = conjugaison.map(({pronoun, form}) =>
      `<tr><td style="color:var(--text3);padding:3px 12px 3px 0;font-size:0.82rem">${pronoun}</td><td style="font-family:var(--font-display);font-style:italic;font-size:0.9rem;color:${form === current.answer ? 'var(--accent)' : 'var(--text)'}">${form}</td></tr>`
    ).join('');
    const box = document.createElement('div');
    box.className = 'ai-box';
    box.innerHTML = `
      <div class="ai-box-header"><div class="ai-dot"></div>${current.verb} — ${current.tenseLabel}</div>
      <table style="border-collapse:collapse;width:100%">${rows}</table>`;
    fb.appendChild(box);
  }

  // 4 boutons de notation
  const ratingDiv = document.createElement('div');
  ratingDiv.innerHTML = `
    <div class="rating-label">Comment c'était ?</div>
    <div class="rating-grid-4">
      <button class="rating-btn r-fail" onclick="rate(1)">Échec<span class="rating-sub">→ 5 min</span></button>
      <button class="rating-btn r-hard" onclick="rate(2)">Difficile<span class="rating-sub">→ demain</span></button>
      <button class="rating-btn r-ok"   onclick="rate(4)">Bon<span class="rating-sub">→ normal</span></button>
      <button class="rating-btn r-easy" onclick="rate(5)">Facile<span class="rating-sub">→ allongé</span></button>
    </div>
    <div class="next-review-hint" id="next-review-hint"></div>`;
  fb.appendChild(ratingDiv);

  show('feedback');
  hide('btn-check');
}

function rate(q) {
  if (!current) return;
  const inp = document.getElementById('answer-input');
  const isCorrect = inp.className.includes('correct');

  const updated = sm2Update(state[current.id], q);
  state[current.id] = { ...state[current.id], ...updated };
  saveState(state);

  // Stats par carte
  cardStats = recordCardResult(current.id, isCorrect, q, cardStats);
  saveCardStats(cardStats);

  // Sync Supabase
  supabasePush(state, settings);
  supabaseStatsPush(cardStats, settings);

  setText('next-review-hint', 'Prochaine révision : ' + formatNextReview(updated.nextReview));
  document.querySelectorAll('.rating-btn').forEach(b => b.disabled = true);

  const card = queue.shift();
  if (q === 1) {
    failQueue.push(card);
    // Réinjecter après 5 min réelles (en mémoire, indépendant de nextReview)
    setTimeout(() => {
      const idx = failQueue.indexOf(card);
      if (idx !== -1) {
        failQueue.splice(idx, 1);
        queue.push(card);
        // Si la queue était vide, relancer l'affichage
        if (queue.length === 1) renderNextCard();
      }
    }, 5 * 60 * 1000);
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
  const el = (id) => document.getElementById(id);
  if (el('toggle-accent'))    el('toggle-accent').checked    = !!settings.accentStrict;
  if (el('openrouter-key'))   el('openrouter-key').value     = settings.openrouterKey || '';
  if (el('supabase-url'))     el('supabase-url').value       = settings.supabaseUrl   || '';
  if (el('supabase-key'))     el('supabase-key').value       = settings.supabaseKey   || '';
  if (el('supabase-user'))    el('supabase-user').value      = settings.userId        || '';
  showScreen('settings');
}

function saveSettingsFromUI() {
  Object.keys(TENSE_LABELS).forEach(t => {
    const cb = document.getElementById('tense-' + t);
    if (cb) settings.tenses[t] = cb.checked;
  });
  const anyTense = Object.values(settings.tenses).some(Boolean);
  if (!anyTense) settings.tenses.presente = true;
  const val = (id) => (document.getElementById(id)?.value || '').trim();
  settings.accentStrict  = document.getElementById('toggle-accent')?.checked ?? false;
  settings.openrouterKey = val('openrouter-key');
  settings.supabaseUrl   = val('supabase-url');
  settings.supabaseKey   = val('supabase-key');
  settings.userId        = val('supabase-user');
  saveSettings(settings);
  state = getOrInitState(settings);
}

function syncCheckbox(cb) {
  const item = cb.closest('.checkbox-item');
  if (item) item.classList.toggle('checked', cb.checked);
}

// ─── MANAGE (CARD LIST) ───────────────────────────────────────────────────────
let manageFilter = 'all';

function renderManage() { renderCardList(); showScreen('manage'); }

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
      if (manageFilter === 'learning') return (s.repetitions > 0 || s.failed) && !(s.repetitions >= 4 && s.interval >= 21);
      if (manageFilter === 'new')      return s.repetitions === 0 && !s.failed;
      return true;
    });
  }

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Aucune carte dans ce filtre.</p></div>';
    return;
  }

  container.innerHTML = list.slice(0, 200).map(c => {
    const s = state[c.id];
    const isDue      = s.nextReview <= t;
    const isNew      = s.repetitions === 0;
    const isMastered = s.repetitions >= 4 && s.interval >= 21;
    const pill = isNew
      ? '<span class="pill pill-new">Nouveau</span>'
      : isDue
      ? '<span class="pill pill-due">À réviser</span>'
      : isMastered
      ? '<span class="pill pill-ok">Maîtrisé</span>'
      : `<span class="pill pill-sched">${formatNextReview(s.nextReview)}</span>`;
    return `<div class="card-list-item">
      <div class="cli-left">
        <span class="cli-pronoun">${c.pronoun}</span>
        <span class="cli-verb">${c.verb}</span>
        <span class="cli-tense">(${c.tenseLabel})</span>
      </div>${pill}</div>`;
  }).join('');
}

// ─── TRADUCTION ───────────────────────────────────────────────────────────────
let transData      = null;
let transDirection = 'es-fr';
let transLevel     = 'B1-B2';
let transRevealed  = false;

function renderTranslation() {
  transRevealed = false;
  showScreen('translation');
  resetTranslationUI();
}

function resetTranslationUI() {
  setText('trans-source-label', transDirection === 'es-fr' ? 'Espagnol → Français' : 'Français → Espagnol');
  setText('trans-level-label', transLevel);
  document.getElementById('trans-source-text').textContent = '';
  document.getElementById('trans-user-input').value = '';
  document.getElementById('trans-correction').style.display = 'none';
  document.getElementById('trans-correction').innerHTML = '';
  document.getElementById('trans-loading').style.display = 'none';
  document.getElementById('special-keys-trans').innerHTML = buildSpecialKeyboard('trans-user-input');
  show('btn-trans-generate');
  hide('btn-trans-check');
}

async function generateTranslation() {
  if (!settings.openrouterKey) {
    document.getElementById('trans-source-text').textContent = 'Configure ta clé OpenRouter dans Réglages pour utiliser cet exercice.';
    return;
  }
  hide('btn-trans-generate');
  document.getElementById('trans-loading').style.display = 'block';
  document.getElementById('trans-source-text').textContent = 'Génération en cours…';
  document.getElementById('trans-correction').style.display = 'none';
  document.getElementById('trans-user-input').value = '';
  transRevealed = false;

  transData = await generateTranslationText(settings, transDirection, transLevel);
  document.getElementById('trans-loading').style.display = 'none';

  if (!transData) {
    document.getElementById('trans-source-text').textContent = 'Erreur lors de la génération. Vérifie ta clé OpenRouter.';
    show('btn-trans-generate');
    return;
  }

  const sourceText = transDirection === 'es-fr' ? transData.text_es : transData.text_fr;
  document.getElementById('trans-source-text').textContent = sourceText;
  setText('trans-sujet', transData.sujet || '');
  show('btn-trans-check');
}

function revealTranslation() {
  if (!transData) return;
  const correction = transDirection === 'es-fr' ? transData.text_fr : transData.text_es;
  const correctionEl = document.getElementById('trans-correction');
  correctionEl.innerHTML = `
    <div class="trans-correction-label">Traduction</div>
    <div class="trans-correction-text">${correction}</div>
    <button class="btn btn-full" style="margin-top:1rem" onclick="generateTranslation()">Nouveau texte</button>`;
  correctionEl.style.display = 'block';
  hide('btn-trans-check');
}

function toggleTransDirection() {
  transDirection = transDirection === 'es-fr' ? 'fr-es' : 'es-fr';
  setText('trans-source-label', transDirection === 'es-fr' ? 'Espagnol → Français' : 'Français → Espagnol');
  setText('btn-trans-dir', transDirection === 'es-fr' ? 'ES → FR' : 'FR → ES');
}

function toggleTransLevel() {
  transLevel = transLevel === 'B1-B2' ? 'A1-A2' : 'B1-B2';
  setText('trans-level-label', transLevel);
  setText('btn-trans-level', transLevel);
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  function on(id, fn) {
    const el = document.getElementById(id);
    if (!el) { console.warn('Missing element:', id); return; }
    el.addEventListener('click', fn);
  }

  on('btn-study',           startSession);
  on('btn-settings',        renderSettings);
  on('btn-manage',          renderManage);
  on('btn-guide',           renderGuide);
  on('btn-translation',     renderTranslation);
  on('btn-stats',           renderStats);
  on('btn-done-home',       renderHome);
  on('btn-check',           checkAnswer);
  on('btn-trans-generate',  generateTranslation);
  on('btn-trans-check',     revealTranslation);
  on('btn-trans-dir',       toggleTransDirection);
  on('btn-trans-level',     toggleTransLevel);

  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.back === 'settings') saveSettingsFromUI();
      renderHome();
    });
  });

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

// ─── CLAVIER CARACTÈRES SPÉCIAUX ─────────────────────────────────────────────
const SPECIAL_CHARS = ['á','é','í','ó','ú','ü','ñ','¿','¡','Á','É','Í','Ó','Ú','Ñ'];

function buildSpecialKeyboard(targetId) {
  return `<div class="special-keys">${
    SPECIAL_CHARS.map(c =>
      `<button class="special-key" onclick="insertChar('${c}','${targetId}')" type="button">${c}</button>`
    ).join('')
  }</div>`;
}

function insertChar(char, targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end   = el.selectionEnd   ?? el.value.length;
  el.value = el.value.slice(0, start) + char + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + char.length;
  el.focus();
}

// ─── STATS SCREEN ────────────────────────────────────────────────────────────
let statsFilter = 'all';

function renderStats() {
  // Totaux globaux
  let totalCorrect = 0, totalWrong = 0;
  let totalFail = 0, totalHard = 0, totalGood = 0, totalEasy = 0;
  let reviewed = 0;

  Object.values(cardStats).forEach(s => {
    totalCorrect += s.correct || 0;
    totalWrong   += s.wrong   || 0;
    totalFail    += s.btn_fail || 0;
    totalHard    += s.btn_hard || 0;
    totalGood    += s.btn_good || 0;
    totalEasy    += s.btn_easy || 0;
    if ((s.correct || 0) + (s.wrong || 0) > 0) reviewed++;
  });

  const totalAnswers = totalCorrect + totalWrong;
  const pct = totalAnswers > 0 ? Math.round(totalCorrect / totalAnswers * 100) : 0;

  // Top 10 cartes les plus ratées
  const activeCards = getActiveCards(settings);
  const hardest = activeCards
    .filter(c => cardStats[c.id]?.wrong > 0)
    .map(c => ({ card: c, s: cardStats[c.id] }))
    .sort((a, b) => (b.s.wrong || 0) - (a.s.wrong || 0))
    .slice(0, 10);

  // Top 10 cartes les mieux maîtrisées
  const easiest = activeCards
    .filter(c => cardStats[c.id]?.correct > 0)
    .map(c => ({ card: c, s: cardStats[c.id] }))
    .sort((a, b) => {
      const ra = (a.s.correct || 0) / Math.max(1, (a.s.correct || 0) + (a.s.wrong || 0));
      const rb = (b.s.correct || 0) / Math.max(1, (b.s.correct || 0) + (b.s.wrong || 0));
      return rb - ra;
    })
    .slice(0, 10);

  const container = document.getElementById('stats-content');
  container.innerHTML = `
    <div class="stats-section-title">Vue globale</div>
    <div class="stats-kpi-grid">
      <div class="stats-kpi"><div class="stats-kpi-val accent">${pct}%</div><div class="stats-kpi-lbl">taux de réussite</div></div>
      <div class="stats-kpi"><div class="stats-kpi-val">${totalAnswers.toLocaleString()}</div><div class="stats-kpi-lbl">réponses totales</div></div>
      <div class="stats-kpi"><div class="stats-kpi-val" style="color:var(--correct)">${totalCorrect.toLocaleString()}</div><div class="stats-kpi-lbl">correctes</div></div>
      <div class="stats-kpi"><div class="stats-kpi-val" style="color:var(--wrong)">${totalWrong.toLocaleString()}</div><div class="stats-kpi-lbl">incorrectes</div></div>
    </div>

    <div class="stats-section-title" style="margin-top:1.5rem">Boutons utilisés</div>
    <div class="stats-btn-grid">
      <div class="stats-btn-item r-fail"><div class="stats-btn-count">${totalFail}</div><div class="stats-btn-lbl">Échec</div></div>
      <div class="stats-btn-item r-hard"><div class="stats-btn-count">${totalHard}</div><div class="stats-btn-lbl">Difficile</div></div>
      <div class="stats-btn-item r-ok">  <div class="stats-btn-count">${totalGood}</div><div class="stats-btn-lbl">Bon</div></div>
      <div class="stats-btn-item r-easy"><div class="stats-btn-count">${totalEasy}</div><div class="stats-btn-lbl">Facile</div></div>
    </div>

    <div class="stats-section-title" style="margin-top:1.5rem">Cartes les plus difficiles</div>
    ${hardest.length === 0
      ? '<div style="font-size:0.88rem;color:var(--text3);padding:0.5rem 0">Pas encore de données</div>'
      : hardest.map(({card, s}) => {
          const total = (s.correct || 0) + (s.wrong || 0);
          const pctCard = Math.round((s.correct || 0) / total * 100);
          return `<div class="stats-card-row">
            <div class="stats-card-info">
              <span class="cli-pronoun">${card.pronoun}</span>
              <span class="cli-verb">${card.verb}</span>
              <span class="cli-tense">(${card.tenseLabel})</span>
            </div>
            <div class="stats-card-right">
              <span style="color:var(--wrong);font-size:0.85rem">${s.wrong} ✗</span>
              <span style="color:var(--text3);font-size:0.78rem">${pctCard}% ok</span>
            </div>
          </div>`;
        }).join('')
    }

    <div class="stats-section-title" style="margin-top:1.5rem">Cartes les mieux maîtrisées</div>
    ${easiest.length === 0
      ? '<div style="font-size:0.88rem;color:var(--text3);padding:0.5rem 0">Pas encore de données</div>'
      : easiest.map(({card, s}) => {
          const total = (s.correct || 0) + (s.wrong || 0);
          const pctCard = Math.round((s.correct || 0) / total * 100);
          return `<div class="stats-card-row">
            <div class="stats-card-info">
              <span class="cli-pronoun">${card.pronoun}</span>
              <span class="cli-verb">${card.verb}</span>
              <span class="cli-tense">(${card.tenseLabel})</span>
            </div>
            <div class="stats-card-right">
              <span style="color:var(--correct);font-size:0.85rem">${s.correct} ✓</span>
              <span style="color:var(--text3);font-size:0.78rem">${pctCard}% ok</span>
            </div>
          </div>`;
        }).join('')
    }
  `;
  showScreen('stats');
}

// ─── GUIDE ────────────────────────────────────────────────────────────────────
const TERMINAISONS = {
  presente: {
    ar: ['o','as','a','amos','áis','an'],
    er: ['o','es','e','emos','éis','en'],
    ir: ['o','es','e','imos','ís','en'],
  },
  indefinido: {
    ar: ['é','aste','ó','amos','asteis','aron'],
    er: ['í','iste','ió','imos','isteis','ieron'],
    ir: ['í','iste','ió','imos','isteis','ieron'],
  },
  imperfecto: {
    ar: ['aba','abas','aba','ábamos','abais','aban'],
    er: ['ía','ías','ía','íamos','íais','ían'],
    ir: ['ía','ías','ía','íamos','íais','ían'],
  },
  // Temps composés : auxiliaire haber + participe passé
  perfecto: {
    label: 'haber (présent) + participio',
    aux: ['he','has','ha','hemos','habéis','han'],
    note: 'Participe : -AR → -ado  ·  -ER/-IR → -ido  ·  Irréguliers : hecho, dicho, puesto, vuelto, visto…',
  },
  pluscuamperfecto: {
    label: 'haber (imparfait) + participio',
    aux: ['había','habías','había','habíamos','habíais','habían'],
    note: 'Participe : -AR → -ado  ·  -ER/-IR → -ido  ·  Irréguliers : hecho, dicho, puesto, vuelto, visto…',
  },
  futuro: {
    ar: ['aré','arás','ará','aremos','aréis','arán'],
    er: ['eré','erás','erá','eremos','eréis','erán'],
    ir: ['iré','irás','irá','iremos','iréis','irán'],
  },
  condicional: {
    ar: ['aría','arías','aría','aríamos','aríais','arían'],
    er: ['ería','erías','ería','eríamos','eríais','erían'],
    ir: ['iría','irías','iría','iríamos','iríais','irían'],
  },
  subjuntivo_presente: {
    ar: ['e','es','e','emos','éis','en'],
    er: ['a','as','a','amos','áis','an'],
    ir: ['a','as','a','amos','áis','an'],
  },
  subjuntivo_imperfecto: {
    ar: ['ara','aras','ara','áramos','arais','aran'],
    er: ['iera','ieras','iera','iéramos','ierais','ieran'],
    ir: ['iera','ieras','iera','iéramos','ierais','ieran'],
  },
  // Impératif : formes par personne (pas de yo)
  imperativo: {
    label: 'Impératif affirmatif',
    rows: [
      {p:'tú',     ar:'habla',    er:'come',    ir:'vive'},
      {p:'él/ella',ar:'hable',    er:'coma',    ir:'viva'},
      {p:'nosotros',ar:'hablemos',er:'comamos', ir:'vivamos'},
      {p:'vosotros',ar:'hablad',  er:'comed',   ir:'vivid'},
      {p:'ellos',  ar:'hablen',   er:'coman',   ir:'vivan'},
    ],
    note: 'Irréguliers tú : haz, di, pon, sal, ten, ven, ve, sé',
  },
  imperativo_neg: {
    label: 'Impératif négatif = no + subjonctif présent',
    rows: [
      {p:'tú',     ar:'no hables',   er:'no comas',   ir:'no vivas'},
      {p:'él/ella',ar:'no hable',    er:'no coma',    ir:'no viva'},
      {p:'nosotros',ar:'no hablemos',er:'no comamos', ir:'no vivamos'},
      {p:'vosotros',ar:'no habléis', er:'no comáis',  ir:'no viváis'},
      {p:'ellos',  ar:'no hablen',   er:'no coman',   ir:'no vivan'},
    ],
    note: 'Identique au subjonctif présent précédé de no',
  },
};

function buildTerminaisonsTable(tenseKey) {
  const data = TERMINAISONS[tenseKey];
  if (!data) return '';
  const pronouns = ['yo','tú','él/ella','nosotros','vosotros','ellos'];

  // Temps composés (haber + participe)
  if (data.aux) {
    const rows = pronouns.map((p, i) => `
      <tr>
        <td style="color:var(--text3);font-size:0.8rem;padding:3px 10px 3px 0">${p}</td>
        <td style="font-family:var(--font-display);font-style:italic;font-size:0.88rem;color:var(--accent)">${data.aux[i]}</td>
        <td style="font-size:0.8rem;color:var(--text2);padding-left:6px">+ participio</td>
      </tr>`).join('');
    return `
      <div style="margin-bottom:0.85rem">
        <div style="font-size:0.72rem;color:var(--text3);margin-bottom:0.4rem;text-transform:uppercase;letter-spacing:.07em">${data.label}</div>
        <table style="border-collapse:collapse;width:100%"><tbody>${rows}</tbody></table>
        <div style="font-size:0.78rem;color:var(--text3);margin-top:0.5rem;font-style:italic">${data.note}</div>
      </div>`;
  }

  // Impératif (rows spécifiques, pas de yo)
  if (data.rows) {
    const rows = data.rows.map(r => `
      <tr>
        <td style="color:var(--text3);font-size:0.8rem;padding:3px 10px 3px 0">${r.p}</td>
        <td style="font-family:var(--font-display);font-style:italic;font-size:0.85rem;color:var(--accent);padding-right:8px">${r.ar}</td>
        <td style="font-family:var(--font-display);font-style:italic;font-size:0.85rem;color:var(--text2);padding-right:8px">${r.er}</td>
        <td style="font-family:var(--font-display);font-style:italic;font-size:0.85rem;color:var(--text2)">${r.ir}</td>
      </tr>`).join('');
    return `
      <div style="margin-bottom:0.85rem">
        <div style="font-size:0.72rem;color:var(--text3);margin-bottom:0.4rem;text-transform:uppercase;letter-spacing:.07em">${data.label}</div>
        <table style="border-collapse:collapse;width:100%">
          <thead><tr>
            <th style="font-size:0.72rem;color:var(--text3);font-weight:400;text-align:left;padding-bottom:4px"></th>
            <th style="font-size:0.72rem;color:var(--accent);font-weight:500;text-align:left;padding-bottom:4px;padding-right:8px">-AR</th>
            <th style="font-size:0.72rem;color:var(--text2);font-weight:400;text-align:left;padding-bottom:4px;padding-right:8px">-ER</th>
            <th style="font-size:0.72rem;color:var(--text2);font-weight:400;text-align:left;padding-bottom:4px">-IR</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="font-size:0.78rem;color:var(--text3);margin-top:0.5rem;font-style:italic">${data.note}</div>
      </div>`;
  }

  // Terminaisons régulières classiques
  const rows = pronouns.map((p, i) => `
    <tr>
      <td style="color:var(--text3);font-size:0.8rem;padding:4px 10px 4px 0">${p}</td>
      <td style="font-family:var(--font-display);font-style:italic;font-size:0.85rem;color:var(--accent);padding-right:8px">-${data.ar[i]}</td>
      <td style="font-family:var(--font-display);font-style:italic;font-size:0.85rem;color:var(--text2);padding-right:8px">-${data.er[i]}</td>
      <td style="font-family:var(--font-display);font-style:italic;font-size:0.85rem;color:var(--text2)">-${data.ir[i]}</td>
    </tr>`).join('');
  return `
    <div style="margin-bottom:0.85rem">
      <div style="font-size:0.72rem;color:var(--text3);margin-bottom:0.4rem;text-transform:uppercase;letter-spacing:.07em">Terminaisons régulières</div>
      <table style="border-collapse:collapse;width:100%">
        <thead><tr>
          <th style="font-size:0.72rem;color:var(--text3);font-weight:400;text-align:left;padding-bottom:4px"></th>
          <th style="font-size:0.72rem;color:var(--accent);font-weight:500;text-align:left;padding-bottom:4px;padding-right:8px">-AR</th>
          <th style="font-size:0.72rem;color:var(--text2);font-weight:400;text-align:left;padding-bottom:4px;padding-right:8px">-ER</th>
          <th style="font-size:0.72rem;color:var(--text2);font-weight:400;text-align:left;padding-bottom:4px">-IR</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

const GUIDE_DATA = [
  {
    tenseKey: 'presente',
    es: 'Presente', fr: 'Présent de l\'indicatif',
    triggers: ['ahora','siempre','todos los días','generalmente'],
    usage: 'Actions habituelles, vérités générales, ce qui se passe en ce moment. Aussi pour le futur proche.',
    examples: [
      {es:'Trabajo en Madrid.',fr:'Je travaille à Madrid.'},
      {es:'El sol sale por el este.',fr:'Le soleil se lève à l\'est.'},
      {es:'Mañana voy al médico.',fr:'Demain je vais chez le médecin.'},
    ],
  },
  {
    tenseKey: 'indefinido',
    es: 'Pretérito indefinido', fr: 'Prétérit indéfini',
    triggers: ['ayer','el año pasado','en 2010','hace tres días'],
    usage: 'Actions passées complètes et délimitées. Rupture avec le présent. Pour raconter une séquence d\'événements.',
    examples: [
      {es:'Ayer comí paella.',fr:'Hier j\'ai mangé de la paëlla.'},
      {es:'Vivió en París dos años.',fr:'Il a vécu à Paris deux ans.'},
      {es:'Llegué, vi, vencí.',fr:'Je suis arrivé, j\'ai vu, j\'ai vaincu.'},
    ],
  },
  {
    tenseKey: 'imperfecto',
    es: 'Pretérito imperfecto', fr: 'Imparfait',
    triggers: ['antes','cuando era niño','siempre (passé)','de niño'],
    usage: 'Actions habituelles dans le passé, descriptions, contexte narratif. Contraste avec l\'indéfini pour les récits.',
    examples: [
      {es:'Cuando era niño, jugaba al fútbol.',fr:'Quand j\'étais enfant, je jouais au foot.'},
      {es:'El cielo estaba nublado.',fr:'Le ciel était nuageux.'},
      {es:'Dormía cuando sonó el teléfono.',fr:'Je dormais quand le téléphone a sonné.'},
    ],
  },
  {
    tenseKey: 'perfecto',
    es: 'Pretérito perfecto compuesto', fr: 'Passé composé',
    triggers: ['hoy','esta semana','alguna vez','ya','todavía no'],
    usage: 'Actions passées liées au présent. Dominant en Espagne, moins utilisé en Amérique latine.',
    examples: [
      {es:'Hoy he comido tarde.',fr:'Aujourd\'hui j\'ai mangé tard.'},
      {es:'¿Has estado en Japón?',fr:'Tu es déjà allé au Japon ?'},
      {es:'Todavía no he terminado.',fr:'Je n\'ai pas encore terminé.'},
    ],
  },
  {
    tenseKey: 'pluscuamperfecto',
    es: 'Pretérito pluscuamperfecto', fr: 'Plus-que-parfait',
    triggers: ['ya','cuando llegué…','antes de que','nunca antes'],
    usage: 'Action passée antérieure à une autre action passée. Formé avec había/habías… + participe.',
    examples: [
      {es:'Cuando llegué, ya había salido.',fr:'Quand je suis arrivé, il était déjà parti.'},
      {es:'Nunca había visto tanta nieve.',fr:'Je n\'avais jamais vu autant de neige.'},
    ],
  },
  {
    tenseKey: 'futuro',
    es: 'Futuro simple', fr: 'Futur simple',
    triggers: ['mañana','el próximo año','seguramente','dentro de poco'],
    usage: 'Actions futures, prédictions, suppositions. Aussi pour exprimer une probabilité présente.',
    examples: [
      {es:'Mañana lloverá.',fr:'Demain il pleuvra.'},
      {es:'¿Cuántos años tendrá?',fr:'Quel âge peut-il avoir ? (supposition)'},
      {es:'Será las tres.',fr:'Il doit être trois heures.'},
    ],
  },
  {
    tenseKey: 'condicional',
    es: 'Condicional simple', fr: 'Conditionnel',
    triggers: ['si pudiera…','me gustaría','debería','en tu lugar'],
    usage: 'Hypothèses, désirs polis, futur dans le passé (discours indirect).',
    examples: [
      {es:'Me gustaría vivir en Barcelona.',fr:'J\'aimerais vivre à Barcelone.'},
      {es:'Si tuviera dinero, viajaría.',fr:'Si j\'avais de l\'argent, je voyagerais.'},
      {es:'Dijo que vendría.',fr:'Il a dit qu\'il viendrait.'},
    ],
  },
  {
    tenseKey: 'subjuntivo_presente',
    es: 'Subjuntivo presente', fr: 'Subjonctif présent',
    triggers: ['quiero que','es importante que','ojalá','cuando (futur)'],
    usage: 'Souhait, émotion, doute, condition future. Se déclenche après certains verbes et conjonctions.',
    examples: [
      {es:'Quiero que vengas.',fr:'Je veux que tu viennes.'},
      {es:'Ojalá haga buen tiempo.',fr:'Pourvu qu\'il fasse beau.'},
      {es:'Cuando llegues, llámame.',fr:'Quand tu arriveras, appelle-moi.'},
    ],
  },
  {
    tenseKey: 'subjuntivo_imperfecto',
    es: 'Subjuntivo imperfecto', fr: 'Subjonctif imparfait',
    triggers: ['si… (irréel)','quería que','como si','ojalá (passé)'],
    usage: 'Hypothèses irréelles au présent (si + subj. imparfait + conditionnel), discours indirect passé.',
    examples: [
      {es:'Si tuviera tiempo, estudiaría más.',fr:'Si j\'avais le temps, j\'étudierais plus.'},
      {es:'Quería que vinieras.',fr:'Je voulais que tu viennes.'},
      {es:'Habla como si supiera todo.',fr:'Il parle comme s\'il savait tout.'},
    ],
  },
  {
    tenseKey: 'imperativo',
    es: 'Imperativo', fr: 'Impératif affirmatif',
    triggers: ['¡ven!','¡habla!','ordre direct','instruction'],
    usage: 'Ordres et instructions. Pas de forme yo. Irréguliers tú : haz, di, pon, sal, ten, ven, ve, sé.',
    examples: [
      {es:'¡Habla más despacio!',fr:'Parle plus lentement !'},
      {es:'Ven aquí.',fr:'Viens ici.'},
      {es:'Comed despacio.',fr:'Mangez lentement. (vosotros)'},
    ],
  },
  {
    tenseKey: 'imperativo_neg',
    es: 'Imperativo negativo', fr: 'Impératif négatif',
    triggers: ['¡no hagas!','interdiction','no + subjonctif'],
    usage: 'Interdictions. Se forme avec "no" + subjonctif présent. Ex : habla (aff.) → no hables (nég.).',
    examples: [
      {es:'¡No hables tan rápido!',fr:'Ne parle pas si vite !'},
      {es:'No lo hagas.',fr:'Ne fais pas ça.'},
      {es:'No comáis antes de las 8.',fr:'Ne mangez pas avant 8h.'},
    ],
  },
];

function renderGuide() {
  const container = document.getElementById('guide-content');
  container.innerHTML = GUIDE_DATA.map((t, i) => {
    const tableHTML = t.tenseKey ? buildTerminaisonsTable(t.tenseKey) : '';
    return `
    <div class="guide-item" id="guide-${i}">
      <div class="guide-header" onclick="toggleGuide(${i})">
        <span class="guide-tense-name">${t.es} <em>${t.fr}</em></span>
        <span class="guide-chevron">▾</span>
      </div>
      <div class="guide-body">
        <div class="guide-use-row">${t.triggers.map(tag => `<span class="guide-tag">${tag}</span>`).join('')}</div>
        <div style="font-size:0.88rem;color:var(--text2);line-height:1.65;margin-bottom:0.85rem">${t.usage}</div>
        ${tableHTML}
        <div class="guide-examples">
          ${t.examples.map(ex=>`
            <div class="guide-ex">
              <div class="guide-es">${ex.es}</div>
              <div class="guide-fr">${ex.fr}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
  }).join('');
  showScreen('guide');
}

function toggleGuide(i) {
  document.getElementById('guide-' + i).classList.toggle('open');
}