# Conventions de code

## Style général

- Python 3.12+
- Ligne max 100 chars (configuré dans ruff)
- Type hints partout sur les fonctions publiques
- Docstrings sur les fonctions non triviales (style Google)
- Imports triés par ruff (isort intégré)

## Naming

- `snake_case` pour fonctions, variables, modules
- `PascalCase` pour classes
- `UPPER_CASE` pour constantes module-level
- Préfixe `_` pour fonctions privées au module

## Async

- Toute fonction qui fait de l'I/O : `async def`
- Toute lib HTTP : `httpx.AsyncClient`
- Pour les libs sync incontournables : `asyncio.to_thread(...)`

## Logging

```python
from loguru import logger

logger.info("Session started for user")  # Info générale
logger.debug(f"Audio chunk received: {len(chunk)} bytes")  # Détails debug
logger.warning("Gradium STT slow: 2.1s")  # Anomalie non bloquante
logger.error("Failed to fetch Wikipedia")  # Erreur
logger.exception("Unexpected crash")  # Erreur + stack trace auto
```

## Validation des inputs

Tout message WS entrant passe par un Pydantic model :

```python
from app.schemas import IncomingMessage

try:
    msg = IncomingMessage.model_validate_json(raw)
except ValidationError as e:
    logger.warning(f"Invalid message: {e}")
    await ws.send_json({"type": "error", "code": "bad_request"})
    continue
```

## Gestion d'erreur

Trois niveaux :

1. **Erreur récupérable** (API tierce down, timeout) → log + envoie un `error` message au front avec `recoverable: true` + continue la session
2. **Erreur de session** (état corrompu, message invalide répété) → log + envoie un `error` + close proprement
3. **Erreur critique** (bug code) → log avec `logger.exception` + crash de la session uniquement (les autres sessions continuent)

Jamais d'erreur silencieuse. Toujours logger.

## Tests

[À ajouter quand on en aura — pas la priorité hackathon]
