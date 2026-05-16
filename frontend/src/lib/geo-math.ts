import type { Direction } from './commands'

const EARTH_RADIUS_M = 6_371_000
const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

export interface LatLng {
  lat: number
  lng: number
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/** Initial bearing from `from` to `to`, 0–360, 0 = north, clockwise. */
export function bearingDeg(from: LatLng, to: LatLng): number {
  const y = Math.sin(toRad(to.lng - from.lng)) * Math.cos(toRad(to.lat))
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.cos(toRad(to.lng - from.lng))
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Move `distance` meters from `origin` along `bearing` (0 = north, cw). */
export function destinationPoint(
  origin: LatLng,
  bearing: number,
  distance: number,
): LatLng {
  const d = distance / EARTH_RADIUS_M
  const br = toRad(bearing)
  const lat1 = toRad(origin.lat)
  const lng1 = toRad(origin.lng)
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br),
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    )
  return { lat: toDeg(lat2), lng: ((toDeg(lng2) + 540) % 360) - 180 }
}

/**
 * Quadrant of `bearingFromUser` relative to the user's facing direction.
 * If `userHeading` is null we default to 'front' (no compass available).
 */
export function relativeDirection(
  bearingFromUser: number,
  userHeading: number | null,
): Direction {
  if (userHeading === null) return 'front'
  const rel = (bearingFromUser - userHeading + 360) % 360
  if (rel < 45 || rel >= 315) return 'front'
  if (rel < 135) return 'right'
  if (rel < 225) return 'behind'
  return 'left'
}
