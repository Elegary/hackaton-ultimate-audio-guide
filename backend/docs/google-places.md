# Google Places API — Cheatsheet

## Setup

- Variable d'env : `GOOGLE_MAPS_API_KEY`
- API utilisée : **Places API (New)** (pas la legacy)
- SDK : `googlemaps` (officiel)
- Activer les APIs dans Google Cloud Console : Places API, Maps JavaScript API, Geocoding API

## Endpoints utiles

### Nearby Search

Trouve les lieux d'un certain type autour d'une position.

```python
import googlemaps
gmaps = googlemaps.Client(key=settings.google_maps_api_key)

results = gmaps.places_nearby(
    location=(lat, lng),
    radius=500,  # mètres
    type='restaurant',  # ou 'cafe', 'museum', 'tourist_attraction', etc.
    language='fr'
)
```

Types supportés (extrait) : `restaurant`, `cafe`, `bar`, `museum`, `tourist_attraction`, `art_gallery`, `church`, `park`, `bakery`.

### Place Details (avec reviews)

```python
details = gmaps.place(
    place_id='ChIJ...',
    fields=[
        'name', 'formatted_address', 'geometry',
        'rating', 'user_ratings_total',
        'review', 'photo', 'opening_hours',
        'website', 'formatted_phone_number',
        'price_level', 'editorial_summary'
    ],
    language='fr'
)
```

### Text Search

```python
results = gmaps.places(
    query='meilleur café Montmartre',
    location=(lat, lng),
    radius=2000,
    language='fr'
)
```

### Photos

L'API renvoie des `photo_reference`. Pour obtenir l'URL réelle :

```python
photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference={ref}&key={api_key}"
```

## Coûts (free tier $200/mois)

- Nearby Search : $32 / 1000 calls
- Place Details : $17 / 1000 calls (avec reviews : +$5)
- Text Search : $32 / 1000 calls

Pour un hackathon : largement OK.

## Best practices

- Cacher les `place_id` une fois obtenus (évite de re-search)
- Demander uniquement les `fields` nécessaires (facturé par field group)
- Pour les photos, générer l'URL côté back et la passer au front (évite d'exposer la clé)
