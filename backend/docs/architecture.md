# Architecture détaillée

## Vue d'ensemble

L'app a **deux canaux distincts** entre le navigateur et nos services :

1. **WebSocket back ↔ front** : events de session, position GPS, commandes UI, transcript
2. **Connexion audio Gradbot ↔ front** : flux audio temps réel (mic input + voix du guide)

Le backend Python n'est **pas** sur le chemin de l'audio. Il orchestre la logique (LLM, tools, état de session) et pilote l'UI via le WebSocket. C'est Gradbot qui gère l'audio.

## Schéma

```
┌────────────────────────────────┐
│  Frontend (Vercel)             │
│  Vite + React + TS             │
│  Google Maps JS                │
└─┬──────────────────────────┬───┘
  │                          │
  │ WebSocket                │ Audio (WebRTC ou WS audio)
  │ (events + UI cmds)       │
  │                          │
  ▼                          ▼
┌────────────────────┐    ┌────────────────────┐
│ Backend (Railway)  │◄──►│ Gradbot            │
│ FastAPI + Python   │    │ (STT + LLM voice + │
│                    │    │  TTS streaming)    │
└─────────┬──────────┘    └────────────────────┘
          │
          │ (depuis le LLM, function calls)
          ▼
   ┌──────┴──────┬──────────┬──────────┐
   ▼             ▼          ▼          ▼
Google      Tavily     Wikipedia   (futurs)
Places
```

## Qui parle au LLM ?

Question importante à clarifier avec Gradbot le jour J : **est-ce que Gradbot encapsule déjà un LLM ou est-ce qu'il faut chaîner Gradbot STT → notre LLM → Gradbot TTS ?**

Deux scénarios possibles :

### Scénario A : Gradbot tout-en-un (idéal pour la latence)

Gradbot expose un endpoint type "voice agent" où on lui fournit :
- Un system prompt
- Une liste de tools (function calls)
- Une URL de callback pour les events

L'utilisateur parle → Gradbot transcrit + LLM + TTS d'un coup → renvoie l'audio. Quand le LLM veut appeler un tool, Gradbot fait un callback HTTP/WS vers notre back, qui exécute et répond.

→ Notre back reçoit les function calls comme des events, exécute, répond à Gradbot, et push les commandes UI via le WS au front.

### Scénario B : Gradbot = STT + TTS seulement

Gradbot fait STT en streaming et TTS en streaming. Notre back est entre les deux : il reçoit le texte transcrit, appelle OpenAI/Anthropic, gère les function calls, et pipe le texte vers Gradbot TTS.

Dans ce cas, l'audio passe **par notre back** (chunks audio entrants STT → chunks audio sortants TTS), ou bien le front parle directement à Gradbot pour STT/TTS et notre back ne voit que le texte.

**Décision à prendre au stand Gradbot. La doc à compléter dans `gradium.md` doit clarifier ça en priorité.**

## Session côté backend

Une session = une connexion WebSocket. Durée typique : 5-30 min. Plusieurs sessions concurrentes possibles, chacune dans sa propre task asyncio.

État maintenu par session :

```python
class SessionState:
    language: Language                          # 'fr' ou 'en'
    user_position: Optional[PositionUpdate]     # dernière position GPS reçue
    current_view: View                          # monument | activity | idle
    current_card_poi: Optional[POI]             # POI affiché en fiche
    queue: list[POI]                            # file d'activités
    conversation_history: list                  # historique LLM (selon scénario A/B)
    gradbot_session_id: Optional[str]           # référence Gradbot
```

Pas de DB pour l'instant — l'état est en mémoire. Si la session WS coupe, l'état est perdu. Acceptable pour un hackathon.

## Flow d'une interaction (scénario A)

```
1. User parle → audio → Gradbot (direct front)
2. Gradbot STT → texte
3. Gradbot LLM → réponse + éventuels function calls
4. Pour chaque function call :
   - Gradbot callback → notre back (HTTP ou WS dédié Gradbot)
   - Back exécute (Google Places, Wikipedia, etc.)
   - Back push une commande UI via WS frontend (ex: display_card)
   - Back répond à Gradbot avec le résultat du tool
5. Gradbot LLM continue → TTS → audio → front (direct)
6. Pendant ce temps, le back émet aussi voice_state, transcript_chunk au front via WS
```

## Function calls : data vs UI

Le LLM (Gradbot ou nous selon scénario) appelle des tools. Deux familles :

### Tools "data"
Retournent du contenu au LLM. Le front n'est pas directement impliqué.

- `find_nearby_places(category, radius_m)` → Google Places
- `get_place_details(place_id)` → Google Places (reviews, photos, horaires)
- `get_wikipedia_article(topic, lang)` → Wikipedia REST
- `web_search(query)` → Tavily

### Tools "UI"
Déclenchent une commande UI côté front. La valeur de retour au LLM est typiquement juste un ack.

- `display_card(poi)` → envoie `display_card` au front
- `clear_card()` → envoie `clear_card` au front
- `zoom_map(lat, lng, zoom)` → envoie `zoom_map` au front
- `set_queue(activities)` → envoie `set_queue` au front
- `highlight_poi(poi_id)` → envoie `highlight_poi` au front
- `switch_view(view)` → envoie `switch_view` au front

Le LLM apprend à appeler les UI tools **avant** de parler d'un lieu (pour que la fiche apparaisse synchrone avec la voix), via le system prompt + descriptions précises.

## Calculs géo côté back

Quand le back reçoit une `position_update` avec un `heading`, il peut enrichir les POI avant de les envoyer au front :

```python
def enrich_poi(poi_raw, user_lat, user_lng, user_heading):
    bearing = compute_bearing(user_lat, user_lng, poi_raw.lat, poi_raw.lng)
    distance = haversine(user_lat, user_lng, poi_raw.lat, poi_raw.lng)
    direction = bearing_to_direction(bearing, user_heading)
    return POI(
        ...,
        bearing=bearing,
        distance_m=int(distance),
        direction=direction,
    )
```

`bearing_to_direction` mappe (bearing - heading) % 360 en `left|right|front|behind`. Utile pour des phrases comme "Sur votre gauche se trouve…".

## System prompt du guide

À designer soigneusement. Doit inclure :

- **Rôle** : guide cultivé, chaleureux, type "Cicero" — adapte ton à l'utilisateur
- **Ton** : parlé, pas écrit. Phrases courtes. Pas de bullet points (c'est de l'audio !)
- **Langue** : selon `language` reçu en session_start, défaut français
- **Comportement UI** : 
  - appeler `display_card` AVANT de parler d'un lieu, pas après
  - `clear_card` quand on change de sujet
  - `zoom_map` quand on présente un endroit éloigné
- **Contexte injecté à chaque tour** : position user, vue actuelle, lieu actuel
- **Style narratif** : raconter des histoires, pas lister des faits
- **Format** : pas de markdown, pas de chiffres "$17.50" (TTS galère), écrire "dix-sept euros cinquante"

À itérer fortement pendant le hackathon. Garder une version V0 simple qui marche, puis raffiner.

## Concurrency

Chaque session WS = une coroutine indépendante. Au sein d'une session :

```python
async def handle_session(ws):
    state = SessionState()
    
    # On lance plusieurs tasks en parallèle :
    async with asyncio.TaskGroup() as tg:
        tg.create_task(receive_events(ws, state))      # front → back
        tg.create_task(forward_gradbot_events(ws, state))  # Gradbot → front
        tg.create_task(heartbeat(ws))                  # ping/pong
```

Toute opération bloquante (HTTP, fichiers) doit être async. Sinon, on bloque toute la session.
