import { useStore } from '../lib/store'
import type { Category, Direction } from '../lib/commands'

const DIRECTION_ARROWS: Record<Direction, string> = {
  front: '↑',
  behind: '↓',
  left: '←',
  right: '→',
}

const CATEGORY_LABELS: Record<Category, string> = {
  monument: 'monument',
  cafe: 'cafe',
  restaurant: 'restaurant',
  gallery: 'gallery',
  shop: 'shop',
  park: 'park',
  other: 'place',
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km`
}

export default function ActivityQueue() {
  const queue = useStore((s) => s.activityQueue)
  const highlightedId = useStore((s) => s.highlightedPoiId)

  if (queue.length === 0) return null

  return (
    <section className="queue" aria-label="Nearby">
      <header className="queue__header">
        <h3>Nearby</h3>
        <span className="queue__count">{queue.length}</span>
      </header>

      <ul className="queue__list">
        {queue.map((poi) => {
          const isHighlight = poi.id === highlightedId
          return (
            <li
              key={poi.id}
              className={`queue__item${isHighlight ? ' is-highlight' : ''}`}
            >
              {poi.photo_url && (
                <div className="queue__thumb">
                  <img src={poi.photo_url} alt="" loading="lazy" />
                </div>
              )}
              <div className="queue__text">
                <span className="queue__category">
                  {CATEGORY_LABELS[poi.category]}
                </span>
                <h4>{poi.name}</h4>
                <span className="queue__dist">
                  <span aria-hidden="true">{DIRECTION_ARROWS[poi.direction]}</span>
                  {formatDistance(poi.distance_m)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
