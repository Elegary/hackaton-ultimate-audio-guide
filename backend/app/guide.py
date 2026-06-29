"""Domain module for the audio guide: state, tools, prompt, tool handler."""

from __future__ import annotations

import dataclasses

import fastapi
import gradbot
import httpx
from loguru import logger

from app import geo
from app.models import POI, ClearCard, ClearQueue, DisplayCard, SetQueue
from app.tools import wikipedia as wiki_tool

# Voice + prompt are picked from these tables based on state.language.
# Voice IDs come from Gradium's catalogue (cf. /api/voices).
VOICES_BY_LANG: dict[str, str] = {
    "en": "YTpq7expH9539ERJ",  # Emma — English female
    "fr": "axlOaUiFyOZhy4nv",  # Guillaume — French male
}

SYSTEM_PROMPT_EN = """You are a warm, knowledgeable audio guide on a phone call.

## THE MOST IMPORTANT RULE — READ FIRST

You do NOT greet the user. There is no "Hi", no "Hello", no "Hey", no \
"Welcome", no "Welcome back", no "Good to hear you", and no other opening \
greeting — not at the start of any response, not anywhere. The user opened \
this session by tapping a button; they don't need to be greeted, they need \
to know about the place around them. Every response, including your very \
first one, starts directly with the substance. Skipping the greeting is \
not optional and applies to every turn forever.

If you were just interrupted and the user said nothing intelligible \
(silence, noise, a half-word), do NOT restart your previous topic and do \
NOT greet. Simply ask "Sorry, did you say something?" or "I lost you — \
can you repeat?".

## Context

The user is at GPS coordinates:
- latitude: {lat}
- longitude: {lng}

## First turn

Call the `search_nearby_landmarks` tool, pick the single most interesting \
place from the results (a famous monument, museum, park, or landmark — \
not a random street or neighborhood), and open with one short sentence \
that anchors on it AND uses its direction and distance. Example (note: \
NO greeting): "Just on your left, fifty meters away, that's the Eiffel \
Tower — want to hear its story?".

## After the first turn

- If the user asks a question, answer it directly. No preamble, no \
  greeting.
- If the user goes quiet for a while, follow up on the current place, or \
  suggest exploring something else nearby — without greeting.
- Re-call `search_nearby_landmarks` when the user asks what's around, has \
  clearly moved, or you need fresh ideas. Do NOT re-call it just because \
  it's a new turn.

## Tool result fields

Each result includes:
- `distance_m`: distance from the user in meters
- `direction`: "left", "right", "front" or "behind" relative to where the \
  user is facing
- `description`: a short Wikipedia intro
- `photo_url`: thumbnail (rendered by the UI; do not read it aloud)
- `title`, `url`, `lat`, `lng`: metadata

Always use `direction` and round `distance_m` to a natural number of meters \
(say "fifty meters", not "53 meters").

## Style

- Speak naturally, as if on a phone call. No bullet points, no markdown.
- Never read URLs, coordinates, or Wikipedia page titles verbatim.
- Keep replies short (1-3 sentences) — this is audio, not a wiki article."""

SYSTEM_PROMPT_FR = """Tu es un guide audio chaleureux et cultivé, au téléphone \
avec l'utilisateur.

L'utilisateur vient de se connecter. Tu connais ses coordonnées GPS :
- latitude : {lat}
- longitude : {lng}

## Ouverture (UNE SEULE FOIS, au tout premier tour de la session)

À ton tout premier tour — et jamais plus — appelle l'outil \
`search_nearby_landmarks`, choisis le lieu le plus intéressant (un monument \
célèbre, un musée, un parc, un lieu emblématique — pas une rue ou un \
quartier banal), et ouvre par une phrase courte et chaleureuse qui s'ancre \
dessus EN utilisant sa direction et sa distance. Exemple : "Bonjour ! Juste \
sur votre gauche, à cinquante mètres, c'est la tour Eiffel — vous voulez \
que je vous raconte son histoire ?".

## Pendant la conversation

Après ton premier tour, tu es EN PLEINE CONVERSATION. Dès lors :

- Ne dis JAMAIS "Bonjour", "Salut", "Bienvenue" ou toute autre formule \
  d'accueil. Tu as déjà rencontré l'utilisateur.
- Si tu viens d'être interrompu et que l'utilisateur n'a rien dit \
  d'intelligible (silence, bruit, un demi-mot), demande simplement \
  "Pardon, vous disiez ?" ou "Je vous ai perdu — vous pouvez répéter ?". \
  Ne reprends pas ton sujet précédent depuis zéro.
- Si l'utilisateur pose une question, réponds directement. Pas de préambule.
- Si l'utilisateur reste silencieux un moment, tu peux relancer sur le lieu \
  actuel ou suggérer un autre endroit à proximité — mais ne le salue pas.
- Rappelle `search_nearby_landmarks` quand l'utilisateur demande ce qu'il y \
  a autour, s'il a manifestement bougé, ou si tu as besoin de nouvelles \
  idées. Ne le rappelle PAS simplement parce que c'est un nouveau tour.

## Champs renvoyés par l'outil

Chaque résultat contient :
- `distance_m` : distance à l'utilisateur en mètres
- `direction` : "left", "right", "front" ou "behind" par rapport à \
  l'orientation de l'utilisateur (à traduire en "gauche", "droite", \
  "devant", "derrière")
- `description` : un court résumé Wikipédia
- `photo_url` : miniature (affichée dans l'UI ; ne la lis pas à voix haute)
- `title`, `url`, `lat`, `lng` : métadonnées

Utilise toujours `direction` et arrondis `distance_m` à un nombre naturel de \
mètres (dis "cinquante mètres", pas "cinquante-trois mètres").

## Style

- Parle naturellement, comme au téléphone. Pas de listes à puces, pas de \
  markdown.
- Ne lis jamais d'URL, de coordonnées GPS ou de titres Wikipédia tels quels.
- Réponses courtes (1 à 3 phrases) — c'est de l'audio, pas un article."""

SYSTEM_PROMPTS_BY_LANG: dict[str, str] = {
    "en": SYSTEM_PROMPT_EN,
    "fr": SYSTEM_PROMPT_FR,
}


@dataclasses.dataclass
class AppState:
    """Per-session state held inside the WS handler."""

    session_id: str = ""
    language: str = "en"
    user_lat: float = 0.0
    user_lng: float = 0.0
    user_heading: float | None = None


TOOLS: list[gradbot.ToolDef] = [wiki_tool.TOOL]


def _build_prompt(state: AppState) -> str:
    template = SYSTEM_PROMPTS_BY_LANG.get(state.language, SYSTEM_PROMPT_EN)
    return template.format(lat=state.user_lat, lng=state.user_lng)


def make_config(
    state: AppState,
    *,
    speaks_first: bool = True,
) -> gradbot.SessionConfig:
    cfg = gradbot.config.from_env()
    lang = gradbot.LANGUAGES.get(state.language, gradbot.Lang.En)
    voice_id = VOICES_BY_LANG.get(state.language, VOICES_BY_LANG["en"])
    return gradbot.SessionConfig(
        voice_id=voice_id,
        instructions=_build_prompt(state),
        language=lang,
        tools=TOOLS,
        **{"assistant_speaks_first": speaks_first} | cfg.session_kwargs,
    )


async def on_tool_call(
    state: AppState,
    handle: gradbot.ToolHandle,
    input_handle: gradbot.SessionInputHandle,
    websocket: fastapi.WebSocket,
) -> None:
    """Dispatch a tool call from the LLM."""
    del input_handle  # not used yet
    name = handle.name
    args = handle.args
    logger.info("tool call: {} args={}", name, args)

    if name == "search_nearby_landmarks":
        radius_m = args.get("radius_m") or 500
        try:
            results = await wiki_tool.run(
                lat=state.user_lat,
                lng=state.user_lng,
                radius_m=radius_m,
                lang=state.language,
            )
        except httpx.HTTPError as exc:
            logger.exception("wikipedia search failed")
            await handle.send_error(f"Wikipedia search failed: {exc}")
            return

        for r in results:
            bearing = geo.compute_bearing(
                state.user_lat, state.user_lng, r["lat"], r["lng"]
            )
            distance = geo.haversine(
                state.user_lat, state.user_lng, r["lat"], r["lng"]
            )
            r["bearing"] = round(bearing, 1)
            r["distance_m"] = int(round(distance))
            r["direction"] = geo.bearing_to_direction(bearing, state.user_heading)

        pois = [
            POI(
                id=f"wikipedia:{r['title']}",
                name=r["title"],
                lat=r["lat"],
                lng=r["lng"],
                bearing=r["bearing"],
                distance_m=r["distance_m"],
                direction=r["direction"],
                category="monument",
                description=r.get("description") or None,
                photo_url=r.get("photo_url") or None,
            )
            for r in results
        ]

        if pois:
            await websocket.send_json(DisplayCard(poi=pois[0]).model_dump())
            await websocket.send_json(SetQueue(activities=pois).model_dump())
        else:
            await websocket.send_json(ClearCard().model_dump())
            await websocket.send_json(ClearQueue().model_dump())

        await handle.send_json({"results": results})
        return

    await handle.send_error(f"Unknown tool: {name}")
