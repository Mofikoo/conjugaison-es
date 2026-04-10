# Conjugaison Espagnol — SM-2

Appli de révision de conjugaison espagnole avec l'algorithme de répétition espacée **SM-2** (même algo qu'Anki).

## Stack
- Vanilla HTML / CSS / JS — zéro dépendance, zéro build
- `localStorage` pour la progression (usage solo)
- OpenRouter (optionnel) pour les explications IA quand tu rates une carte

## Contenu
- **30 verbes** : réguliers (-ar/-er/-ir) + irréguliers essentiels (ser, estar, ir, tener, hacer, poder, querer, decir, saber, poner, venir, ver, dar, salir…)
- **5 temps** : présent, prétérit, imparfait, futur, subjonctif présent
- **6 personnes** par verbe/temps → ~900 cartes au total
- Tu choisis les temps actifs dans les Réglages

## Algo SM-2
Après chaque carte tu notes : **À revoir** (1) · **Difficile** (3) · **Facile** (5)

- Si tu rates → intervalle repart à 1 jour
- Sinon → intervalle × `easeFactor` (commence à 2.5, s'ajuste selon tes résultats)
- Première révision : +1j → +6j → +N×easeFactor jours…

## Deploy sur GitHub Pages

```bash
# 1. Crée un repo GitHub (ex: conjugaison-es)
git init
git add .
git commit -m "init"
git remote add origin https://github.com/TON_USER/conjugaison-es.git
git push -u origin main

# 2. Dans Settings > Pages > Source : "Deploy from branch" > main > / (root)
# URL : https://TON_USER.github.io/conjugaison-es/
```

## Ajouter des verbes
Dans `js/data.js`, ajouter une entrée dans l'objet `VERBS` :

```js
mirar: {
  label: 'regarder',
  presente:   ['miro','miras','mira','miramos','miráis','miran'],
  preterito:  ['miré','miraste','miró','miramos','mirasteis','miraron'],
  imperfecto: ['miraba','mirabas','miraba','mirábamos','mirabais','miraban'],
  futuro:     ['miraré','mirarás','mirará','miraremos','miraréis','mirarán'],
  subjuntivo: ['mire','mires','mire','miremos','miréis','miren'],
},
```

## OpenRouter (optionnel)
Dans Réglages, colle ta clé `sk-or-v1-…`  
Modèle utilisé : `google/gemini-flash-1.5` (rapide et pas cher)  
L'IA s'active **uniquement** quand tu rates une carte → explication grammaticale en français.