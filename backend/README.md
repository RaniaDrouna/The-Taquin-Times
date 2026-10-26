# Taquin A* backend

## Lancer FastAPI

Depuis la racine du projet :

```bash
python3 -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
```

Le frontend statique relaie `POST /api/solve` vers `http://127.0.0.1:8000/solve`.

Le contrat TypeScript de la réponse est dans `src/api.ts`; `src/api.js` en est le miroir runtime utilisé directement par le navigateur, car ce projet n’emploie pas de bundler.

## Tester

```bash
python3 -m pytest backend/tests -q
```
