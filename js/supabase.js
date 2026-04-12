// ─── SUPABASE SYNC ───────────────────────────────────────────────────────────
// Tables SQL requises (voir README) :
//   - progress  (SM-2 state)
//   - stats     (statistiques par carte)

// ─── PROGRESS ────────────────────────────────────────────────────────────────

async function supabasePush(state, settings) {
  const { supabaseUrl, supabaseKey, userId } = settings;
  if (!supabaseUrl || !supabaseKey || !userId) return;
  const rows = Object.entries(state).map(([cardId, s]) => ({
    user_id: userId, card_id: parseInt(cardId),
    interval: s.interval, ease_factor: s.easeFactor,
    repetitions: s.repetitions, next_review: s.nextReview,
    last_reviewed: s.lastReviewed || null,
  }));
  try {
    await fetch(`${supabaseUrl}/rest/v1/progress`, {
      method: 'POST',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    });
  } catch (e) { console.warn('Supabase push failed', e); }
}

async function supabasePull(settings) {
  const { supabaseUrl, supabaseKey, userId } = settings;
  if (!supabaseUrl || !supabaseKey || !userId) return null;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/progress?user_id=eq.${encodeURIComponent(userId)}&select=*`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const state = {};
    rows.forEach(r => {
      state[r.card_id] = {
        interval: r.interval, easeFactor: r.ease_factor,
        repetitions: r.repetitions, nextReview: r.next_review,
        lastReviewed: r.last_reviewed,
      };
    });
    return state;
  } catch (e) { console.warn('Supabase pull failed', e); return null; }
}

// ─── STATS PAR CARTE ─────────────────────────────────────────────────────────

async function supabaseStatsPush(cardStats, settings) {
  const { supabaseUrl, supabaseKey, userId } = settings;
  if (!supabaseUrl || !supabaseKey || !userId) return;
  const rows = Object.entries(cardStats).map(([cardId, s]) => ({
    user_id: userId, card_id: parseInt(cardId),
    correct: s.correct || 0, wrong: s.wrong || 0,
    btn_fail: s.btn_fail || 0, btn_hard: s.btn_hard || 0,
    btn_good: s.btn_good || 0, btn_easy: s.btn_easy || 0,
    last_seen: s.last_seen || null,
  }));
  if (rows.length === 0) return;
  try {
    await fetch(`${supabaseUrl}/rest/v1/stats`, {
      method: 'POST',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    });
  } catch (e) { console.warn('Supabase stats push failed', e); }
}

async function supabaseStatsPull(settings) {
  const { supabaseUrl, supabaseKey, userId } = settings;
  if (!supabaseUrl || !supabaseKey || !userId) return null;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/stats?user_id=eq.${encodeURIComponent(userId)}&select=*`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const cs = {};
    rows.forEach(r => {
      cs[r.card_id] = {
        correct: r.correct, wrong: r.wrong,
        btn_fail: r.btn_fail, btn_hard: r.btn_hard,
        btn_good: r.btn_good, btn_easy: r.btn_easy,
        last_seen: r.last_seen,
      };
    });
    return cs;
  } catch (e) { console.warn('Supabase stats pull failed', e); return null; }
}

// ─── PROFILES ────────────────────────────────────────────────────────────────

const PROFILES_KEY = 'conjugaison_profiles_v1';
const ACTIVE_PROFILE_KEY = 'conjugaison_active_profile_v1';

const AVATARS = ['🧑','👩','👨','🧒','👧','👦','🧑‍🎓','👩‍🎓','🦊','🐻','🐼','🦁'];

function loadProfiles() {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]'); } catch { return []; }
}

function saveProfiles(profiles) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); } catch {}
}

function loadActiveProfileId() {
  return localStorage.getItem(ACTIVE_PROFILE_KEY) || null;
}

function saveActiveProfileId(id) {
  localStorage.setItem(ACTIVE_PROFILE_KEY, id);
}

function generateProfileId() {
  return 'p_' + Math.random().toString(36).slice(2, 10);
}

async function syncProfilesWithSupabase(settings) {
  const { supabaseUrl, supabaseKey } = settings;
  if (!supabaseUrl || !supabaseKey) return null;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles?select=*`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function saveProfileToSupabase(profile, settings) {
  const { supabaseUrl, supabaseKey } = settings;
  if (!supabaseUrl || !supabaseKey) return;
  try {
    await fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ id: profile.id, name: profile.name, avatar: profile.avatar, created_at: profile.createdAt }),
    });
  } catch {}
}

async function deleteProfileFromSupabase(profileId, settings) {
  const { supabaseUrl, supabaseKey } = settings;
  if (!supabaseUrl || !supabaseKey) return;
  try {
    await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${profileId}`, {
      method: 'DELETE',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
  } catch {}
}