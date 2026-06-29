---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, applications, or interfaces — including map-based UIs built on the Google Maps JavaScript API, Mapbox GL JS, MapLibre, or Leaflet. Generates creative, polished code that avoids generic AI aesthetics.
license: Complete terms in LICENSE.txt
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, map view, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, hand-drawn/illustrated, risograph print, architectural blueprint, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work — the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

---

## Map UIs: editorial / illustrated aesthetic

When the user asks for a map view (Google Maps, Mapbox, MapLibre, Leaflet), the default look is generic and clinical. Treat the map as a designed object, not a data widget. The reference aesthetic to reach for is **editorial illustration** — printed-map-in-a-magazine, hand-drawn city guide, risograph travel zine. Coral/terracotta land, cream paper background, hatched fills, no clutter, route lines that look inked.

### How far each library can be styled

- **Google Maps JS API**: pass a `styles` array to the `Map` constructor (or use a cloud-based Map Style ID via `mapId`). You can fully recolor land, water, parks, roads, POIs, and labels; you can hide entire feature categories. You **cannot** add texture/hatching to fills directly — those have to be layered on top as SVG/Canvas overlays. The vector renderer (`mapId` + cloud styles) is preferred for crisp scaling. Raster styling via inline `styles` still works and is easier to inline in code.
- **Mapbox GL JS / MapLibre**: deepest control — fill-pattern lets you actually apply a hatched PNG/SVG to land polygons natively. Use this if the user wants the *real* printed-map look.
- **Leaflet**: thin renderer; the aesthetic comes from the tile source (use Stadia "Stamen Watercolor" / "Toner", or a custom Mapbox style URL) plus SVG overlays.

If the user names Google Maps specifically, go with Google Maps and accept that hatching requires an overlay. If they're open, suggest Mapbox/MapLibre for a closer match to the references.

### The coral/terracotta editorial palette

Use these as CSS variables; tweak per project but keep the relationships:

```css
:root {
  --paper:        #f4ede2;  /* cream background, the "page" */
  --paper-warm:   #ede4d3;  /* slightly darker variant for water/insets */
  --land:         #e8a598;  /* coral land fill (the dominant color) */
  --land-deep:    #d97b6a;  /* hatching stroke / darker buildings */
  --ink:          #1a1a1a;  /* labels, key landmarks */
  --ink-soft:     #2a2a2a;  /* secondary text */
  --route:        #c44536;  /* route line, the "you go here" red */
  --accent:       #f5f5dc;  /* highlights, callouts */
}
```

Variations worth trying: dusty terracotta (`#c97b63` land, `#8b3a2a` ink), faded riso red (`#e85a4f` land, `#3d3d3d` ink on `#f0ead6` paper), or a bluer printed-map mood (`#a8c5d6` land, `#2a4858` ink on `#f5f0e1` paper).

### Google Maps style array — start here

```javascript
const editorialMapStyle = [
  // Hide everything noisy first
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },

  // Paper / land / water
  { elementType: "geometry", stylers: [{ color: "#e8a598" }] },        // land
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#f4ede2" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#e8a598" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#edb0a3" }] },

  // Roads as cream cuts through the coral
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#f4ede2" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#d97b6a" }, { weight: 0.5 }] },
  { featureType: "road.arterial", elementType: "geometry.stroke", stylers: [{ visibility: "off" }] },

  // Type — keep only major labels, in ink
  { elementType: "labels.text.fill", stylers: [{ color: "#1a1a1a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f4ede2" }, { weight: 2 }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
];

const map = new google.maps.Map(el, {
  center, zoom,
  styles: editorialMapStyle,
  disableDefaultUI: true,      // remove Google's chrome — replace with custom controls
  gestureHandling: "greedy",
  backgroundColor: "#f4ede2",  // shows during tile load, keeps the page feel
});
```

`disableDefaultUI: true` is non-negotiable for this aesthetic — Google's default zoom/streetview buttons break the illusion immediately. Build custom controls in HTML positioned over the map.

### Getting the hatched / hand-drawn quality

The references all have diagonal line hatching on the coral fills. Google Maps tiles won't do this natively. Three working approaches, in order of fidelity:

1. **SVG overlay with `<pattern>` clipped to land geometry.** Define a diagonal stripe pattern in an SVG that sits absolutely over the map div, with `pointer-events: none` so clicks pass through. Use `mix-blend-mode: multiply` so it tints the underlying coral. This is the easiest win — looks great at fixed zoom levels but the pattern doesn't scale with zoom.

   ```html
   <div class="map-stage">
     <div id="map"></div>
     <svg class="hatch-overlay" preserveAspectRatio="none">
       <defs>
         <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
           <line x1="0" y1="0" x2="0" y2="6" stroke="#d97b6a" stroke-width="1.5" opacity="0.45"/>
         </pattern>
       </defs>
       <rect width="100%" height="100%" fill="url(#hatch)"/>
     </svg>
   </div>
   ```

   ```css
   .map-stage { position: relative; }
   .hatch-overlay {
     position: absolute; inset: 0;
     pointer-events: none;
     mix-blend-mode: multiply;
     opacity: 0.7;
   }
   ```

2. **CSS `filter` on the map container** for a subtle printed feel: `filter: contrast(1.05) saturate(1.1);` combined with an SVG noise/grain overlay (a tiny `feTurbulence` pattern at low opacity) gives that paper texture without the literal hatching.

3. **Switch to Mapbox/MapLibre and use `fill-pattern`** with a PNG of diagonal stripes — this is the only way to get hatching that follows actual land polygons and scales with zoom. If hatching realism matters, this is the right tool.

### Route lines that look inked

For routes (the bold red lines in image 2 and 3), do NOT use Google's default polyline. Build it like this:

```javascript
new google.maps.Polyline({
  path: routePath,
  geodesic: true,
  strokeColor: "#c44536",
  strokeOpacity: 0.95,
  strokeWeight: 5,
  map,
  // Slight offset shadow line drawn underneath for depth:
});
// Draw a second polyline 1–2px offset, darker, lower opacity, beneath for a "double-print" feel.
```

For an even more illustrated look, generate the route as an SVG path overlay (use the map's projection to convert lat/lng → pixel coords on `projection_changed` and `bounds_changed`) and apply a `stroke-dasharray` of irregular dashes to mimic an ink pen. Tiny `filter: url(#roughen)` with `feTurbulence` + `feDisplacementMap` will give it a wobbly hand-drawn edge.

### Markers as illustrations, not pins

Google's red teardrop pin is the giveaway that you didn't try. Always replace it. Options:

- **`AdvancedMarkerElement`** (the modern API) accepts any HTML element as content. Use this. Pass in a small SVG: a hand-drawn circle, a numbered tag, a tiny building illustration, a hatched square — whatever matches the aesthetic.
- For the "CANTEEN" callout look in image 1, use an HTML marker that's a black rectangle with serif type inside, with a small dot indicating the precise location.

```javascript
const pin = document.createElement("div");
pin.className = "marker-canteen";
pin.innerHTML = `<span>CANTEEN</span><b></b>`;
new google.maps.marker.AdvancedMarkerElement({ map, position, content: pin });
```

```css
.marker-canteen {
  background: #1a1a1a; color: #f4ede2;
  font-family: "Domaine Display", "Playfair Display", serif;
  letter-spacing: 0.15em; font-size: 11px;
  padding: 8px 14px 8px 14px; position: relative;
  transform: translate(-50%, -100%);
}
.marker-canteen b {
  position: absolute; left: 50%; bottom: -3px;
  width: 4px; height: 4px; background: #f4ede2;
  border-radius: 50%; transform: translateX(-50%);
}
```

### Typography on maps

The references lean hard on type — it's half the aesthetic. Use a condensed serif or geometric sans for street labels and a stronger display face for landmark callouts. Suggested pairings (rotate, don't reuse the same one every time):

- **Editorial / printed map**: *Domaine Display* or *Canela* for landmarks + *GT Sectra Mono* or *Söhne Mono* for coordinates/labels.
- **Hand-drawn**: *Caslon Doric* or *Reckless* + a hand-drawn face like *Bestie* or *Migra* for headlines.
- **Riso / zine**: *Authentic Sans*, *Romie*, *Pangram Sans Rounded* + a chunky display like *Migra Italic*.

Native Google Maps labels can't use arbitrary web fonts — that text is rendered by Google. So either (a) hide all Google labels and render your own as HTML overlays positioned via the projection API, or (b) accept Google's labels (style them via the `labels.text.fill` styler) and add your custom-font callouts only for important places. (a) gets you the references; (b) is fine for prototypes.

### Chrome around the map

The references all feel like a *page* with a map on it, not a map filling the viewport. Frame the map:
- Cream/paper page background extending beyond the map's bounds
- A title set in a strong serif above it ("BRICK LANE & SPITALFIELDS" energy)
- A legend or key in a corner
- The map itself with a subtle inset shadow or hairline border, not a hard rectangle
- Custom zoom/recenter controls styled as small serif buttons, not Google's pill

### What to keep restrained

- Zoom levels above ~16 reveal that the hatch overlay doesn't follow geometry — limit `maxZoom` to 15 or 16 unless you went with the Mapbox route.
- Don't show traffic, transit, or live data layers — they fight the aesthetic.
- Animations on the map itself should be minimal. Animate the *UI around it* (sidebar slides, marker callouts fading in, legend revealing). The map is the still painting; the interface is what moves.

### Reference checklist before shipping a map UI

- [ ] Default UI disabled, custom controls built
- [ ] All default POI/transit/road labels hidden or restyled
- [ ] Land color is the dominant warm tone, not gray
- [ ] Water reads as paper, not blue
- [ ] At least one texture layer (hatch overlay, grain, or paper noise)
- [ ] Markers are custom HTML/SVG, not default pins
- [ ] Route lines are styled (not Google's default blue)
- [ ] A real typeface — not a system font — is used somewhere prominent
- [ ] `maxZoom` capped to where the aesthetic still holds
- [ ] The map sits inside a designed page, not edge-to-edge browser chrome

---

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
