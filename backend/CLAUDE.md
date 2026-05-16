# Hackaton Ultimate Audio Guide — Backend

> **Pour Claude Code** : lis ce fichier en entier au début de chaque session. Il décrit l'architecture, les conventions, et où trouver les détails. Charge les fichiers de `docs/` quand tu travailles sur les domaines correspondants.

## Le produit en une phrase

Une web app mobile-first où l'utilisateur arrive, autorise géoloc + micro + boussole, et démarre une **conversation audio temps réel avec Gradbot** (un guide IA vocal). Le guide lui parle des monuments, restaurants, cafés et lieux intéressants autour de lui. **Le guide pilote aussi l'UI du téléphone** : il déclenche l'affichage de fiches POI, le zoom sur la carte, des queues d'activités, etc., en parlant.

## Architecture

Deux canaux distincts entre le navigateur et nos services :

1. **WebSocket back ↔ front** : events de session, position GPS, commandes UI, transcript
2. **Connexion audio Gradbot ↔ front** : flux audio temps réel (mic + voix)

```
┌────────────────────────────────┐
│  Frontend (Vercel)             │
│  Vite + React + TS + Google Maps│
└─┬──────────────────────────┬───┘
  │ WebSocket (events/UI)    │ Audio (Gradbot)
  ▼                          ▼
┌────────────────────┐    ┌────────────────────┐
│ Backend (Railway)  │◄──►│ Gradbot            │
│ FastAPI + Python   │    │ (voice agent)      │
└─────────┬──────────┘    └────────────────────┘
          │
   ┌──────┼──────────┬──────────┐
   ▼      ▼          ▼          ▼
Google  Tavily   Wikipedia    ...
Places
```

**Important** : le backend Python n'est **pas** sur le chemin de l'audio. Gradbot gère l'audio directement avec le front. Notre back orchestre la logique métier (function calls, état session, calculs géo) et pilote l'UI via le WebSocket.

**Latence cible** : time-to-first-audio < 2s. Gradbot s'en charge côté voix, on s'en occupe côté UI.

## Stack

- Python 3.12+ avec uv pour la gestion des deps
- FastAPI + uvicorn (serveur ASGI)
- WebSocket natif FastAPI
- Pydantic v2 pour la validation des messages WS (`app/models.py`)
- httpx async pour les appels HTTP
- loguru pour les logs
- Gradbot : voir `docs/gradium.md`
- Google Maps Python SDK officiel
- OpenAI SDK (selon scénario d'intégration Gradbot — voir `architecture.md`)

## Structure du code

```
backend/
├── app/
│   ├── main.py              # Entry point FastAPI, routes
│   ├── config.py            # Settings via pydantic-settings (.env)
│   ├── models.py            # SOURCE DE VÉRITÉ du contrat WS (Pydantic)
│   ├── ws_handler.py        # Boucle principale d'une session WS
│   ├── session_state.py     # État d'une session
│   ├── geo.py               # Calculs bearing/distance/direction
│   ├── gradbot.py           # Intégration Gradbot (callbacks, tools)
│   └── tools/
│       ├── __init__.py      # Registre des tools exposés au LLM
│       ├── google_places.py # Nearby search, place details, reviews
│       ├── tavily.py        # Web search pour infos contextuelles
│       ├── wikipedia.py     # Monuments, histoire, lieux culturels
│       └── ui_commands.py   # Tools qui forwarde des commandes au front
├── docs/                    # Documentation détaillée par domaine
├── pyproject.toml
├── uv.lock
├── .python-version
├── .env.example
├── railway.json
└── CLAUDE.md                # ce fichier
```

## Le contrat WebSocket — SOURCE DE VÉRITÉ

Le contrat est défini dans :
- **Backend** : `app/models.py`

Le détail de chaque message est dans `docs/ws-protocol.md`.

**Côté Python**, validation des events entrants via `TypeAdapter` :

```python
from pydantic import TypeAdapter
from app.models import FrontendEvent

event_adapter = TypeAdapter(FrontendEvent)
raw = await ws.receive_text()
event = event_adapter.validate_json(raw)
```

Envoi de commandes typées au front :

```python
from app.models import DisplayCard, POI

cmd = DisplayCard(poi=POI(id="google:ChIJ...", name="Notre-Dame", ...))
await ws.send_text(cmd.model_dump_json())
```

## Documentation par domaine

Charge ces fichiers selon ton besoin :

- **Architecture & flow détaillés** → `docs/architecture.md`
- **Contrat WebSocket (messages front↔back)** → `docs/ws-protocol.md`
- **Intégration Gradbot (audio + LLM voice)** → `docs/gradium.md`
- **Google Places API (search, details, reviews)** → `docs/google-places.md`
- **Conventions de code, naming, style** → `docs/conventions.md`

## Variables d'environnement

Voir `.env.example`. Toujours utiliser `settings` (from `app.config import settings`), jamais `os.getenv()` directement dans le code métier.

## Commandes utiles

```bash
# Lancer le serveur en local
uv run uvicorn app.main:app --reload --port 8000

# Ajouter une dépendance
uv add <package>

# Lint
uv run ruff check .
uv run ruff format .

# Type check
uv run mypy app/
```

## Workflow Git

- Branche `main` protégée, jamais de commit direct
- Branches `feat/xxx`, `fix/xxx`, `chore/xxx`
- Conventional commits : `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
- PR review obligatoire avant merge

## Règles importantes pour Claude Code

1. **Le contrat WS est la source de vérité** : avant de modifier un message WS, lire `docs/ws-protocol.md` et `app/models.py`. Toute modification = update simultané côté front (`lib/commands.ts`).

2. **Toujours async** : tout I/O passe par `async`/`await`. Pas de `requests`, utilise `httpx.AsyncClient`. Pas de `time.sleep`, utilise `asyncio.sleep`.

3. **Validation Pydantic stricte** : tout message WS entrant est validé via les models de `app/models.py`. Si tu ajoutes un type de message, ajoute la classe Pydantic correspondante ET son entrée dans `FrontendEvent`/`FrontendCommand`.

4. **Function calls = source de vérité du contrat tools** : la liste des tools dans `app/tools/__init__.py` doit toujours rester synchronisée avec ce que Gradbot/le LLM peut appeler. Documenter chaque tool avec une description précise (le LLM lit ces descriptions).

5. **Gestion d'erreur explicite** : un appel API qui échoue ne doit pas crasher la session. Catch, log, envoyer un message `error` (recoverable) au front, continuer.

6. **Pas de print()** : utiliser `logger` de loguru. `logger.info()`, `logger.error()`, `logger.debug()`.

7. **Types partout** : annotations de type complètes sur toutes les fonctions publiques. `mypy` en mode strict.

8. **Pas de globals mutables** : les états vivent dans le scope d'une session WS (`SessionState`), pas en module-level.

9. **Pas de breaking change silencieux du contrat** : si tu touches `models.py`, vérifier qu'il y a une mention de mettre à jour `commands.ts` dans la PR + bump de `PROTOCOL_VERSION` si breaking.

10. **POI enrichi côté back** : les POI envoyés au front ont toujours `bearing`, `distance_m`, `direction` calculés depuis la position user. Voir `app/geo.py`.

## Anti-patterns à éviter

- Bloquer dans une coroutine (CPU lourd ou lib sync) → utiliser `asyncio.to_thread`
- Stocker des secrets en dur dans le code
- Mixer sync et async dans la même chaîne d'appel
- Renvoyer des erreurs HTTP brutes au front sur le WS (utiliser le message `error` du contrat)
- Faire confiance aux inputs front sans validation Pydantic
- Modifier `models.py` sans toucher `commands.ts` (= contrat cassé)
- Mettre l'audio dans le WebSocket back ↔ front (l'audio est sur Gradbot)
