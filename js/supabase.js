// ─── SUPABASE SYNC ───────────────────────────────────────────────────────────
// Configure ces deux valeurs dans Réglages → Supabase
// Table SQL à créer dans Supabase :
//
// create table progress (
//   user_id text not null,
//   card_id integer not null,
//   interval integer default 1,
//   ease_factor numeric default 2.5,
//   repetitions integer default 0,
//   next_review bigint,
//   last_reviewed bigint,
//   primary key (user_id, card_id)
// );
// alter table progress enable row level security;
// create policy "user own" on progress using (true) with check (true);

async function supabasePush(state, settings) {
  const { supabaseUrl, supabaseKey, userId } = settings;
  if (!supabaseUrl || !supabaseKey || !userId) return;

  const rows = Object.entries(state).map(([cardId, s]) => ({
    user_id:       userId,
    card_id:       parseInt(cardId),
    interval:      s.interval,
    ease_factor:   s.easeFactor,
    repetitions:   s.repetitions,
    next_review:   s.nextReview,
    last_reviewed: s.lastReviewed || null,
  }));

  try {
    await fetch(`${supabaseUrl}/rest/v1/progress`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    });
  } catch (e) { console.warn('Supabase push failed', e); }
}

async function supabasePush(state, settings) {
  const { supabaseUrl, supabaseKey, userId } = settings;
  console.log('push →', { supabaseUrl, supabaseKey: supabaseKey?.slice(0,10), userId });
  if (!supabaseUrl || !supabaseKey || !userId) {
    console.warn('Supabase non configuré — push ignoré');
    return;
  }

async function supabasePull(settings) {
  const { supabaseUrl, supabaseKey, userId } = settings;
  if (!supabaseUrl || !supabaseKey || !userId) return null;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/progress?user_id=eq.${encodeURIComponent(userId)}&select=*`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const state = {};
    rows.forEach(r => {
      state[r.card_id] = {
        interval:      r.interval,
        easeFactor:    r.ease_factor,
        repetitions:   r.repetitions,
        nextReview:    r.next_review,
        lastReviewed:  r.last_reviewed,
      };
    });
    return state;
  } catch (e) { console.warn('Supabase pull failed', e); return null; }
}