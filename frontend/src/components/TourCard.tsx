import { useStore } from '../lib/store'
import type { Category, Direction } from '../lib/commands'

const CATEGORY_LABELS: Record<Category, string> = {
  monument: 'monument',
  cafe: 'café',
  restaurant: 'restaurant',
  gallery: 'galerie',
  shop: 'boutique',
  park: 'parc',
  other: 'lieu',
}

const DIRECTION_LABELS: Record<Direction, string> = {
  front: 'devant vous',
  behind: 'derrière vous',
  left: 'à gauche',
  right: 'à droite',
}

const DIRECTION_ARROWS: Record<Direction, string> = {
  front: '↑',
  behind: '↓',
  left: '←',
  right: '→',
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km`
}

export default function TourCard() {
  const poi = useStore((s) => s.currentCard)

  if (!poi) {
    return (
      <article className="tour-card tour-card--empty">
        <p>En attente du backend…</p>
      </article>
    )
  }

  return (
    <article className="tour-card" aria-labelledby={`card-${poi.id}`}>
      {poi.photo_url && (
        <div className="tour-card__media">
          <img src={poi.photo_url} alt="" loading="eager" />
          <span className="tour-card__chip">{CATEGORY_LABELS[poi.category]}</span>
        </div>
      )}

      <div className="tour-card__body">
        <div className="tour-card__heading">
          <h2 id={`card-${poi.id}`}>{poi.name}</h2>
          <span className="tour-card__direction" aria-label={DIRECTION_LABELS[poi.direction]}>
            <span aria-hidden="true">{DIRECTION_ARROWS[poi.direction]}</span>
            {formatDistance(poi.distance_m)}
          </span>
        </div>

        <dl className="tour-card__meta">
          {typeof poi.rating === 'number' && (
            <div>
              <dt>Note</dt>
              <dd>
                {poi.rating.toFixed(1)}
                {poi.user_ratings_total != null && (
                  <span className="tour-card__meta-sub"> · {poi.user_ratings_total}</span>
                )}
              </dd>
            </div>
          )}
          {typeof poi.price_level === 'number' && (
            <div>
              <dt>Prix</dt>
              <dd>{'€'.repeat(Math.max(1, poi.price_level))}</dd>
            </div>
          )}
          {typeof poi.is_open_now === 'boolean' && (
            <div>
              <dt>Statut</dt>
              <dd className={poi.is_open_now ? 'is-open' : 'is-closed'}>
                {poi.is_open_now ? 'ouvert' : 'fermé'}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </article>
  )
}
