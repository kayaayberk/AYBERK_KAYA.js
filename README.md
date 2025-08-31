# Ebebek Product Carousel

A self-injecting product carousel for the Ebebek storefront.  
It mounts after the homepage hero section, fetches products from an API, caches results, and persists across SPA navigation events.

---

**Supports two themes:**
</br>

**!!!** Current carousel styles are different than what's displayed in the hiring case PDF. That's why we have two themes for both curren Ebebek styles and for the styles shown in the user story.

- **`website`** – current carousel styles used on the site
- **`screenshot`** – styles matching the hiring case PDF

  Please change `STYLE_VARIANT` defined in the .js file to `screenshot` to see the carousel theme shown in the PDF.

---

## Features

- Injects dynamically into the DOM after the hero section.
- Persists between back/forward navigation (pushState/replaceState).
- Fetches products from a remote JSON API with localStorage caching.
- Supports drag-to-scroll with snapping.
- Favorites stored locally in `localStorage`.

---

## Core Functions

### Utilities

- **`bumpToken()`** – Invalidates in-flight observers/fetches on navigation.
- **`isHomePage()`** – Detects if current route is `/`.
- **`readJSON(key)` / `writeJSON(key, val)`** – Safe localStorage helpers.

### Data

- **`loadProducts(currentToken)`** – Loads products from cache or fetches from API. Aborts if navigation changes.

### Rendering

- **`buildPriceHTML(value, class)`** – Formats TL currency with small decimals.
- **`discountInfo(p)`** – Returns `{ pct, now, was }` if discounted, else `null`.
- **`priceBlockHTML(product)`** – Renders stacked (discount) or single price block.
- **`buildItemHTML(p, isFav)`** – Creates product card (image, title, price, favorite, CTA).
- **`buildCarouselHTML(products, favSet)`** – Builds carousel container with items and nav buttons.

### Core Mechanics

- **`getStepSize($track)`** – Calculates scroll step (card width + gap).
- **`goRelative($track, delta)`** – Scrolls one card left/right.
- **`snapToNearest($track)`** – Aligns scroll position to nearest card.

### Events

- **`setupEvents($root)`** – Binds:
  - Prev/next navigation
  - Favorites toggle
  - CTA (open in new tab)
  - Drag vs click handling
  - Resize/scroll updates

### Mount / Unmount

- **`installLocationWatcherOnce()`** – Hooks into history API to fire custom `locationchange`.
- **`ensureMounted()`** – Ensures carousel mounts on homepage only, safely re-mounts after route changes.
- **`unmountCarousel()`** – Removes carousel if not on homepage.

### Styles

- **`injectStyles(variant)`** – Injects theme-specific CSS (`website` or `screenshot`) with common base styles.

### Thank you!
