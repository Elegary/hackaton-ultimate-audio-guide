"""WebSocket protocol — source of truth, mirrored in frontend lib/commands.ts.

See docs/ws-protocol.md. Any change here MUST update commands.ts in the same PR;
bump PROTOCOL_VERSION on breaking changes.
"""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

PROTOCOL_VERSION = 1


# Shared types

Direction = Literal["left", "right", "front", "behind"]
Category = Literal[
    "monument", "cafe", "restaurant", "gallery", "shop", "park", "other"
]
View = Literal["monument", "activity", "idle"]
VoiceStateValue = Literal["speaking", "listening", "thinking", "idle"]
Language = Literal["fr", "en"]
Speaker = Literal["agent", "user"]
UserTapAction = Literal["activities", "monuments", "next", "pause", "resume"]


class POI(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    bearing: float
    distance_m: int
    direction: Direction
    category: Category
    rating: float | None = None
    user_ratings_total: int | None = None
    price_level: int | None = None
    is_open_now: bool | None = None
    photo_url: str | None = None


# Backend -> Frontend


class SessionReady(BaseModel):
    type: Literal["session_ready"] = "session_ready"
    protocol_version: int = PROTOCOL_VERSION
    # Legacy field from the initial contract; kept for protocol compat but
    # always null since audio is handled by Gradbot, not LiveKit.
    livekit: None = None


class SessionError(BaseModel):
    type: Literal["session_error"] = "session_error"
    code: str
    message: str


class Pong(BaseModel):
    type: Literal["pong"] = "pong"


class DisplayCard(BaseModel):
    type: Literal["display_card"] = "display_card"
    poi: POI


class UpdateCard(BaseModel):
    type: Literal["update_card"] = "update_card"
    poi: POI


class ClearCard(BaseModel):
    type: Literal["clear_card"] = "clear_card"


class HighlightPOI(BaseModel):
    type: Literal["highlight_poi"] = "highlight_poi"
    poi_id: str


class ZoomMap(BaseModel):
    type: Literal["zoom_map"] = "zoom_map"
    center_lat: float
    center_lng: float
    zoom: int


class SwitchView(BaseModel):
    type: Literal["switch_view"] = "switch_view"
    view: View


class SetQueue(BaseModel):
    type: Literal["set_queue"] = "set_queue"
    activities: list[POI]


class ClearQueue(BaseModel):
    type: Literal["clear_queue"] = "clear_queue"


class VoiceState(BaseModel):
    type: Literal["voice_state"] = "voice_state"
    state: VoiceStateValue


class TranscriptChunk(BaseModel):
    type: Literal["transcript_chunk"] = "transcript_chunk"
    text: str
    speaker: Speaker


class ErrorMessage(BaseModel):
    type: Literal["error"] = "error"
    message: str


FrontendCommand = Annotated[
    Union[
        SessionReady,
        SessionError,
        Pong,
        DisplayCard,
        UpdateCard,
        ClearCard,
        HighlightPOI,
        ZoomMap,
        SwitchView,
        SetQueue,
        ClearQueue,
        VoiceState,
        TranscriptChunk,
        ErrorMessage,
    ],
    Field(discriminator="type"),
]


# Frontend -> Backend


class SessionStart(BaseModel):
    type: Literal["session_start"] = "session_start"
    protocol_version: int
    language: Language | None = None


class SessionEnd(BaseModel):
    type: Literal["session_end"] = "session_end"


class Ping(BaseModel):
    type: Literal["ping"] = "ping"


class PositionUpdate(BaseModel):
    type: Literal["position_update"] = "position_update"
    lat: float
    lng: float
    heading: float | None
    accuracy: float


class UserTap(BaseModel):
    type: Literal["user_tap"] = "user_tap"
    action: UserTapAction
    poi_id: str | None = None


class UserTextInput(BaseModel):
    type: Literal["user_text_input"] = "user_text_input"
    text: str


FrontendEvent = Annotated[
    Union[
        SessionStart,
        SessionEnd,
        Ping,
        PositionUpdate,
        UserTap,
        UserTextInput,
    ],
    Field(discriminator="type"),
]
