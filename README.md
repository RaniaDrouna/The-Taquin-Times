# Taquin — Search / Play

Une application de recherche interactive pour explorer le Taquin 8-puzzle avec A*, conçue pour une démonstration académique.

## Lancer le projet

```bash
npm start
```

Le serveur écoute sur `http://localhost:3000` (ou sur la valeur de `PORT`). Le contrôle de syntaxe est disponible avec :

```bash
npm run check
```

## Organisation

- `src/solver.js` : moteur A* indépendant du DOM, file de priorité, résolvabilité et heuristiques.
- `src/render.js` : rendu des plateaux, open/closed lists, arbre, journal, statistiques et chemin.
- `src/app.js` : orchestration de l’état, contrôles, replay, drag/pointer, thème et impression.
- `src/styles.css` : direction artistique papier/zine, animations et responsive.

## Utilisation

Configurez le plateau de départ par clic, drag ou touches fléchées. Déverrouillez `TARGET` pour modifier l’état final, choisissez une heuristique, puis utilisez `STEP` pour inspecter une expansion ou `PLAY TRACE` pour lire la trace automatiquement. Le panneau de gauche présente la file de priorité, les états fermés, l’arbre et le journal ; le workspace central présente le plateau, la cible et les statistiques. Le panneau `SOLUTION` devient disponible une fois le chemin optimal reconstruit.
