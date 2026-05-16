# Contrat WebSocket front ↔ back

> **Source de vérité** : ce contrat est implémenté dans `app/models.py` (backend) et `lib/commands.ts` (frontend). Les deux fichiers DOIVENT rester synchronisés. Tout changement = bump de `PROTOCOL_VERSION` + update simultané front+back dans la même PR.

## Version actuelle

`PROTOCOL_VERSION = 1`

## Principes

- Tous les messages JSON ont un champ `type` discriminant
- Côté Python : Pydantic `BaseModel` par message, `Union` global pour les deux directions
- Côté TS : `type` literal pour un discriminated union
- Audio temps réel : **pas via ce WebSocket** — on passe par **Gradbot** (voir plus bas), et le WS sert uniquement aux events de session + commandes UI
- Pas de breaking change sans bump de `PROTOCOL_VERSION`

## Audio : pourquoi pas dans le WS

L'audio temps réel (mic input + voix du guide) passe par **Gradbot** directement, **pas par ce WebSocket**. Le navigateur ouvre une connexion audio dédiée avec Gradbot (selon ce qu'ils exposent : WebRTC, WebSocket audio, etc. — voir `gradium.md` pour les détails).

Ce WebSocket sert à :
- Initialiser la session
- Recevoir les events utilisateur non-audio (position GPS, taps, etc.)
- Pousser les commandes UI au front (cards, map, queues)
- Pousser le transcript et l'état vocal
- Signaler les erreurs

## Types partagés

```ts
// Direction relative à l'orientation du user
type Direction = 'left' | 'right' | 'front' | 'behind';

// Catégories de POI exposées par le LLM
type Category = 'monument' | 'cafe' | 'restaurant' | 'gallery' | 'shop' | 'park' | 'other';

// Vue affichée côté front (l'app peut switcher entre modes)
type View = 'monument' | 'activity' | 'idle';

// État de la voix du guide
type VoiceStateValue = 'speaking' | 'listening' | 'thinking' | 'idle';

// Langue de session
type Language = 'fr' | 'en';
```

## Modèle POI

Le point d'intérêt enrichi, partagé entre `display_card`, `update_card`, `set_queue`, etc.

```ts
interface POI {
  id: string;                  // "google:ChIJ..." (préfixe = source)
  name: string;
  lat: number;
  lng: number;
  bearing: number;             // 0-360° depuis l'user
  distance_m: number;
  direction: Direction;        // left/right/front/behind relatif à l'user
  category: Category;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  is_open_now?: boolean;
  photo_url?: string;
}
```

`bearing` et `direction` sont calculés côté back à partir de la position user + heading (boussole) + position du POI. Le front les affiche tels quels.

---

## Backend → Frontend

### Session lifecycle

#### `session_ready`
Accusé de réception du `session_start`. Indique que le back est prêt et que l'audio Gradbot peut être initialisé côté front.

```json
{
  "type": "session_ready",
  "protocol_version": 1,
  "livekit": null
}
```

> Le champ `livekit` est legacy du contrat initial. On le **garde** pour compat, mais il sera toujours `null` car on utilise Gradbot. Le front ignore ce champ et ouvre la connexion Gradbot via ses propres credentials.

#### `session_error`
Erreur fatale qui empêche la session de démarrer (auth échouée, protocole incompatible, etc.).

```json
{
  "type": "session_error",
  "code": "protocol_mismatch",
  "message": "Client uses v0, server requires v1"
}
```

#### `pong`
Réponse à un `ping` du front (keepalive).

```json
{ "type": "pong" }
```

### Cards & POI

#### `display_card`
Affiche une fiche de POI à l'écran. Typiquement appelé par le LLM via function call quand il commence à parler d'un lieu.

```json
{
  "type": "display_card",
  "poi": { /* POI complet */ }
}
```

#### `update_card`
Met à jour la fiche actuelle (changement d'orientation user → recalcul de `direction` et `distance_m`, par ex).

```json
{
  "type": "update_card",
  "poi": { /* POI mis à jour */ }
}
```

#### `clear_card`
Cache la fiche actuelle (fin de discussion sur un lieu).

```json
{ "type": "clear_card" }
```

#### `highlight_poi`
Met en surbrillance un POI sur la carte sans l'afficher en fiche pleine.

```json
{
  "type": "highlight_poi",
  "poi_id": "google:ChIJ..."
}
```

### Map

#### `zoom_map`
Recentre et zoome la carte.

```json
{
  "type": "zoom_map",
  "center_lat": 48.8530,
  "center_lng": 2.3499,
  "zoom": 17
}
```

### Views & queues

#### `switch_view`
Change la vue principale (monument détaillé / liste d'activités / idle).

```json
{ "type": "switch_view", "view": "activity" }
```

#### `set_queue`
Définit la file d'activités/POI à proposer (mode "tour" ou "suggestions").

```json
{
  "type": "set_queue",
  "activities": [ /* POI[] */ ]
}
```

#### `clear_queue`
Vide la file.

```json
{ "type": "clear_queue" }
```

### Voice / transcript

#### `voice_state`
État courant de la voix du guide (pour animer le micro / l'avatar côté UI).

```json
{ "type": "voice_state", "state": "speaking" }
```

Valeurs : `speaking`, `listening`, `thinking`, `idle`.

#### `transcript_chunk`
Bout de transcript en streaming (pour subtitles ou debug). Émis pour user ET agent.

```json
{
  "type": "transcript_chunk",
  "text": "Devant vous se trouve...",
  "speaker": "agent"
}
```

### Erreurs

#### `error`
Erreur non-fatale (un tool a foiré, etc.). La session continue.

```json
{
  "type": "error",
  "message": "Failed to fetch Wikipedia article"
}
```

---

## Frontend → Backend

### Session lifecycle

#### `session_start`
Premier message envoyé après ouverture du WS.

```json
{
  "type": "session_start",
  "protocol_version": 1,
  "language": "fr"
}
```

#### `session_end`
Fermeture propre demandée par le front.

```json
{ "type": "session_end" }
```

#### `ping`
Keepalive.

```json
{ "type": "ping" }
```

### Position & orientation

#### `position_update`
Position GPS + cap boussole. Envoyé régulièrement (toutes les 3-5s ou sur changement significatif).

```json
{
  "type": "position_update",
  "lat": 48.8566,
  "lng": 2.3522,
  "heading": 45.0,
  "accuracy": 10
}
```

`heading` peut être `null` si la boussole n'est pas autorisée ou indispo (typique sur desktop).

### User interactions

#### `user_tap`
Action tap sur un bouton ou un POI.

```json
{
  "type": "user_tap",
  "action": "activities",
  "poi_id": "google:ChIJ..."
}
```

Actions possibles :
- `activities` : passer en vue activités/suggestions
- `monuments` : passer en vue monuments
- `next` : POI suivant dans la queue
- `pause` : pause guide
- `resume` : reprise guide

`poi_id` optionnel selon l'action.

#### `user_text_input`
Fallback texte si le micro est KO ou si l'user préfère taper.

```json
{
  "type": "user_text_input",
  "text": "Y a-t-il un café ouvert près d'ici ?"
}
```

---

## Implémentation Pydantic (backend)

Voir `app/models.py`. Chaque message est une classe Pydantic. Validation à la réception :

```python
from pydantic import TypeAdapter
from app.models import FrontendEvent

event_adapter = TypeAdapter(FrontendEvent)

raw = await ws.receive_text()
event = event_adapter.validate_json(raw)  # raise ValidationError si invalide
# event est typé selon le bon Union member
```

## Implémentation TypeScript (frontend)

Voir `lib/commands.ts`. Discriminated unions sur `type` :

```ts
function handleCommand(cmd: FrontendCommand) {
  switch (cmd.type) {
    case 'display_card': showCard(cmd.poi); break;
    case 'voice_state': setVoiceState(cmd.state); break;
    // exhaustive switch grâce au discriminated union
  }
}
```

## Workflow d'évolution du contrat

1. Décider d'un changement (front+back ensemble)
2. Si breaking : bump `PROTOCOL_VERSION` dans les deux fichiers
3. Update `models.py` ET `commands.ts` dans la même PR
4. Update ce document
5. Tester end-to-end avant merge
