"""Pure geometric helpers for POI enrichment relative to the user."""

import math
from typing import Final

from pydantic import BaseModel

from app.models import POI, Category, Direction, PositionUpdate

_EARTH_RADIUS_M: Final[float] = 6_371_000.0


class RawPOI(BaseModel):
    """A POI before geo enrichment: same shape as POI minus bearing/distance/direction."""

    id: str
    name: str
    lat: float
    lng: float
    category: Category
    rating: float | None = None
    user_ratings_total: int | None = None
    price_level: int | None = None
    is_open_now: bool | None = None
    photo_url: str | None = None


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in meters between two (lat, lng) points."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    )
    return 2 * _EARTH_RADIUS_M * math.asin(math.sqrt(a))


def compute_bearing(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Initial bearing from point 1 to point 2 in degrees, normalised to [0, 360)."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dlam = math.radians(lng2 - lng1)
    y = math.sin(dlam) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlam)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def bearing_to_direction(poi_bearing: float, user_heading: float | None) -> Direction:
    """Map a POI bearing to left/right/front/behind relative to the user's heading.

    Falls back to 'front' when the heading is unknown (e.g. desktop / compass denied).
    """
    if user_heading is None:
        return "front"
    relative = (poi_bearing - user_heading) % 360.0
    if relative < 45.0 or relative >= 315.0:
        return "front"
    if relative < 135.0:
        return "right"
    if relative < 225.0:
        return "behind"
    return "left"


def enrich_poi(raw_place: RawPOI, user_position: PositionUpdate) -> POI:
    """Combine haversine, compute_bearing and bearing_to_direction to produce a POI."""
    bearing = compute_bearing(
        user_position.lat, user_position.lng, raw_place.lat, raw_place.lng
    )
    distance = haversine(
        user_position.lat, user_position.lng, raw_place.lat, raw_place.lng
    )
    direction = bearing_to_direction(bearing, user_position.heading)
    return POI(
        id=raw_place.id,
        name=raw_place.name,
        lat=raw_place.lat,
        lng=raw_place.lng,
        bearing=bearing,
        distance_m=int(round(distance)),
        direction=direction,
        category=raw_place.category,
        rating=raw_place.rating,
        user_ratings_total=raw_place.user_ratings_total,
        price_level=raw_place.price_level,
        is_open_now=raw_place.is_open_now,
        photo_url=raw_place.photo_url,
    )
