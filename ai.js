// ─── AI EXPLANATION VIA OPENROUTER ──────────────────────────────────────────

async function getAIExplanation(card, userAnswer, settings) {
  const key = settings.openrouterKey;
  if (!key) return null;

  const prompt = `Tu es un professeur de grammaire espagnole. Un élève francophone vient de faire une erreur en conjugaison.

Carte : "${card.pronoun} — ${card.verb}" (${card.verbLabel}) au ${card.tenseLabel}
Bonne réponse : "${card.answer}"
Réponse de l'élève : "${userAnswer}"

Donne une explication courte (3-4 phrases max) en français :
1. Pourquoi "${card.answer}" est correct
2. La règle ou l'astuce à retenir (irrégularité, changement de radical, terminaison type...)
3. Un exemple de phrase courte avec la forme correcte

Sois précis, pédagogique, et va droit au but. Pas de fioritures.`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Conjugaison Espagnol',
      },
      body: JSON.stringify({
        model: 'google/gemini-flash-1.5',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}