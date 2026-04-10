// ─── APP STATE ───────────────────────────────────────────────────────────────
let settings = loadSettings();
let state    = getOrInitState(settings);
let queue    = [];
let current  = null;
let sessionCorrect = 0;
let sessionTotal   = 0;
let aiPending      = false;

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
  if (queue.length === 0) { renderHome(); return; }
  sessionCorrect = 0;
  sessionTotal   = queue.length;
  showScreen('study');
  renderNextCard();
}

function renderNextCard() {
  if (queue.length === 0) {
    renderDone();
    return;
  }
  current = queue[0];
  const done = sessionTotal - queue.length;

  // Progress
  const pct = Math.round((done / sessionTotal) * 100);
  document.getElementById('progress-fill').style.width = pct + '%';
  setText('study-counter', `${done + 1} / ${sessionTotal}`);

  // Card front
  setText('card-tense', current.tenseLabel.toUpperCase());
  setText('card-main',  current.verb);
  setText('card-pronoun', current.pronoun);
  setText('card-meaning', current.verbLabel);

  // Reset input
  const inp = document.getElementById('answer-input');
  inp.value = '';
  inp.className = 'answer-input';
  inp.disabled = false;
  inp.focus();

  // Hide feedback, show check btn
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

  // Render feedback
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

    // AI explanation if key set
    if (settings.openrouterKey && !isOk) {
      const aiBox = document.createElement('div');
      aiBox.className = 'ai-box';
      aiBox.innerHTML = `<div class="ai-box-header"><div class="ai-dot"></div>Explication IA</div><div class="ai-loading">Chargement…</div>`;
      fb.appendChild(aiBox);
      fetchAI(aiBox, typed);
    }
  }

  // Rating row
  const ratingDiv = document.createElement('div');
  ratingDiv.id = 'rating-zone';
  ratingDiv.innerHTML = `
    <div class="rating-label">Comment c'était ?</div>
    <div class="rating-grid">
      <button class="rating-btn r-fail" onclick="rate(1)">À revoir</button>
      <button class="rating-btn r-hard" onclick="rate(3)">Difficile</button>
      <button class="rating-btn r-easy" onclick="rate(5)">Facile</button>
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

  queue.shift();
  setTimeout(() => renderNextCard(), 900);
}

// ─── DONE ─────────────────────────────────────────────────────────────────────
function renderDone() {
  const pct = sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : 0;
  setText('done-score', pct + '%');
  setText('done-correct', `${sessionCorrect} / ${sessionTotal} correctes`);
  showScreen('done');
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
function renderSettings() {
  // Tenses — driven by TENSE_LABELS keys
  Object.keys(TENSE_LABELS).forEach(t => {
    const cb = document.getElementById('tense-' + t);
    if (cb) {
      cb.checked = !!settings.tenses[t];
      syncCheckbox(cb);
    }
  });

  // Strict accents toggle
  const acc = document.getElementById('toggle-accent');
  if (acc) acc.checked = !!settings.accentStrict;

  // OpenRouter key
  const key = document.getElementById('openrouter-key');
  if (key) key.value = settings.openrouterKey || '';

  showScreen('settings');
}

function saveSettingsFromUI() {
  // Tenses — driven by TENSE_LABELS keys
  Object.keys(TENSE_LABELS).forEach(t => {
    const cb = document.getElementById('tense-' + t);
    if (cb) settings.tenses[t] = cb.checked;
  });
  // At least one tense must be on
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

  // Chips
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
      if (manageFilter === 'new')      return s.repetitions === 0;
      return true;
    });
  }

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state"><span style="font-size:1.5rem">🔍</span><p>Aucune carte dans ce filtre.</p></div>';
    return;
  }

  container.innerHTML = list.slice(0, 200).map(c => {
    const s = state[c.id];
    const isDue = s.nextReview <= t;
    const isNew = s.repetitions === 0;
    const isMastered = s.repetitions >= 4 && s.interval >= 21;
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

  // Navigation
  document.getElementById('btn-study').addEventListener('click', startSession);
  document.getElementById('btn-settings').addEventListener('click', renderSettings);
  document.getElementById('btn-manage').addEventListener('click', renderManage);
  document.getElementById('btn-done-home').addEventListener('click', () => renderHome());

  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.back === 'settings') saveSettingsFromUI();
      renderHome();
    });
  });

  // Study
  document.getElementById('btn-check').addEventListener('click', checkAnswer);
  document.getElementById('answer-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const fb = document.getElementById('feedback');
      if (fb.style.display === 'none' || !fb.style.display) {
        checkAnswer();
      }
    }
  });

  // Settings live sync for checkboxes
  document.querySelectorAll('.checkbox-item input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => syncCheckbox(cb));
  });

  // Manage filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      manageFilter = chip.dataset.filter;
      renderCardList();
    });
  });

  // Initial render
  renderHome();
});