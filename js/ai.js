// ─── AI HELPERS VIA OPENROUTER ───────────────────────────────────────────────

// Point 3 : plus d'explication IA — on affiche la conjugaison complète + exemple statique
function getFullConjugation(card) {
  const verbData = VERBS[card.verb];
  if (!verbData) return null;
  const forms = verbData[card.tense];
  if (!forms) return null;
  return PRONOUNS.map((p, i) => ({ pronoun: p, form: forms[i] }));
}

// Point 5 : génération de texte pour l'exercice de traduction
const SUJETS = [
  'une journée typique à Madrid',
  'un voyage en train à travers l\'Espagne',
  'une conversation dans un café de Barcelone',
  'les habitudes alimentaires en Espagne',
  'une visite au marché local',
  'des vacances à la mer en été',
  'une conversation entre amis sur leurs projets',
  'la routine matinale d\'un étudiant espagnol',
  'une invitation à dîner chez des amis',
  'un week-end à la montagne',
  'une dispute amicale sur le football',
  'les préparatifs d\'une fête d\'anniversaire',
  'un entretien d\'embauche en espagne',
  'une visite chez le médecin',
  'un déménagement dans un nouvel appartement',
];

async function generateTranslationText(settings, direction, level) {
  const key = settings.openrouterKey;
  if (!key) return null;

  const sujet = SUJETS[Math.floor(Math.random() * SUJETS.length)];
  const seed  = Math.floor(Math.random() * 10000);
  const niveauLabel = level === 'A1-A2' ? 'débutant (A1-A2, phrases simples, présent)' : 'intermédiaire (B1-B2, plusieurs temps)';

  const sourceLang = direction === 'es-fr' ? 'espagnol' : 'français';
  const prompt = direction === 'es-fr'
    ? `Écris un court texte en espagnol (5-7 phrases) sur le sujet "${sujet}", niveau ${niveauLabel}. Seed: ${seed}.
Ensuite fournis la traduction française.
Réponds UNIQUEMENT en JSON strict, sans markdown :
{"text_es":"...","text_fr":"...","sujet":"${sujet}"}`
    : `Écris un court texte en français (5-7 phrases) sur le sujet "${sujet}", niveau ${niveauLabel}. Seed: ${seed}.
Ensuite fournis la traduction espagnole.
Réponds UNIQUEMENT en JSON strict, sans markdown :
{"text_fr":"...","text_es":"...","sujet":"${sujet}"}`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Conjugar',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-lite-001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw  = data.choices?.[0]?.message?.content || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) { console.warn('AI error', e); return null; }
}