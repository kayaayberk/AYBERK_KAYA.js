(() => {
  const JQ_URL = "https://code.jquery.com/jquery-3.7.1.min.js";
  function withjQuery(cb) {
    if (window.jQuery) return cb(window.jQuery);
    const s = document.createElement("script");
    s.src = JQ_URL;
    s.onload = () => cb(window.jQuery);
    s.onerror = () => console.error("[ebk] failed to load jQuery");
    document.head.appendChild(s);
  }

  withjQuery((jQuery) => {
    const $ = jQuery;
    const ANCHOR_SELECTOR = "body > eb-root > cx-storefront > main > cx-page-layout > cx-page-slot.Section1.has-components";
    const API_URL = "https://gist.githubusercontent.com/sevindi/8bcbde9f02c1d4abe112809c974e1f49/raw/9bf93b58df623a9b16f1db721cd0a7a539296cf0/products.json";

    const ROOT_CLASS = "ebk-carousel";
    const PRODUCTS_KEY = "ebk:products";
    const FAVORITES_KEY = "ebk:favorites";
    const TITLE_TEXT = "Beğenebileceğinizi düşündüklerimiz";
    const STYLE_VARIANT = "website";

    // Drag/snap feel
    const DRAG_THRESHOLD_PX = 3;
    const ALIGN_EPSILON_PX = 1.5;

    // Lifecycle tokens
    let navToken = 0;
    let pendingObserver = null;
    let pendingFetchController = null;
    let didLogWrongPage = false;
    let locationWatcherInstalled = false;

    /*
     * UTILITIES (pure helpers)
     */
    // Invalidate any in-flight work (fetch/observer) on route change
    function bumpToken() {
      pendingFetchController = null;

      if (pendingObserver) {
        try {
          pendingObserver.disconnect();
        } catch {}
      }

      pendingObserver = null;
      navToken += 1;
      
      return navToken;
    }

    // Consider homepage when path is exactly "/"
    function isHomePage() {
      const path = location.pathname.replace(/\/+$/, "/");
      return path === "/";
    }

    // Safe localStorage helpers
    function readJSON(key) {
      try {
        return JSON.parse(localStorage.getItem(key) || "null");
      } catch {
        return null;
      }
    }

    function writeJSON(key, val) {
      try {
        localStorage.setItem(key, JSON.stringify(val));
      } catch {}
    }

    // Currency output with small decimals: `12.345,67 TL`
    function buildPriceHTML(value, wrapperClass) {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        return `<span class="${wrapperClass}">${String(value)} TL</span>`;
      }
      const formatted = n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const [intPart, decPart] = formatted.split(",");
      return `<span class="${wrapperClass}"><span class="ebk-price-int">${intPart}</span>,<span class="ebk-price-dec">${decPart} TL</span></span>`;
    }

    // Compute discount `{pct, now, was}` or `null`
    function discountInfo(p) {
      const now = Number(p.price);
      const was = Number(p.original_price);

      if (!Number.isFinite(now) || !Number.isFinite(was) || was <= 0 || now >= was) return null;
      
      const pct = Math.round(((was - now) / was) * 100);
      return { pct, now, was };
    }

    // Wait for the hero slot (or time out). Returns the anchor element or null.
    function waitForAnchor(selector, timeoutMs = 6000) {
      const el = document.querySelector(selector);

      if (el) return Promise.resolve(el);

      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          try {
            pendingObserver?.disconnect();
          } catch {}

          pendingObserver = null;
          resolve(null);
        }, timeoutMs);

        pendingObserver = new MutationObserver(() => {
          const node = document.querySelector(selector);

          if (node) {
            clearTimeout(timer);
            try {
              pendingObserver?.disconnect();
            } catch {}

            pendingObserver = null;
            resolve(node);
          }
        });
        pendingObserver.observe(document.documentElement, { childList: true, subtree: true });
      });
    }

    /*
     * DATA (cache → fetch)
     */
    async function loadProducts(currentToken) {
      // Try local cache
      const cached = readJSON(PRODUCTS_KEY);
      if (Array.isArray(cached) && cached.length) return cached;

      // Fetch fresh if no cache
      try {
        pendingFetchController = typeof AbortController !== "undefined" ? new AbortController() : null;

        const res = await fetch(API_URL, { cache: "no-cache", signal: pendingFetchController?.signal });

        if (currentToken !== navToken) return []; // stale navigation

        if (!res.ok) throw new Error("HTTP " + res.status);

        const data = await res.json();

        if (currentToken !== navToken) return []; // stale navigation

        writeJSON(PRODUCTS_KEY, data);

        return data;

      } catch (e) {
        if (String(e?.name).toLowerCase() !== "aborterror") console.error("[ebk] product fetch failed:", e);

        return [];

      } finally {
        pendingFetchController = null;
      }
    }

    /*
     * SVG ICONS
     */
    function heartSVG() {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart-icon lucide-heart"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/></svg>`;
    }
    function plusSVG() {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus-icon lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;
    }
    function arrowRightSVG() {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right-icon lucide-arrow-right"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
    }
    function starSVG(filled) {
      const fill = filled ? "#f9b300" : "none";
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17.27l6.18 3.73-1.64-7.03L21 9.24l-7.19-.61L12 2 10.19 8.63 3 9.24l4.46 4.73L5.82 21z" fill="${fill}" stroke="#f9b300" stroke-width="1.5"/></svg>`;
    }

    /*
     * HTML BUILDERS
     */
    // Stacked or single price block
    function priceBlockHTML(product) {
      const d = discountInfo(product);
      if (d) {
        return `
            <div class="ebk-priceRow ebk-priceRow--stack">
                <div class="ebk-priceTop">
                    ${buildPriceHTML(d.was, "ebk-original")}
                    <span class="ebk-discount-pill">%${d.pct}</span>
                </div>
                <div class="ebk-priceBottom">
                    ${buildPriceHTML(d.now, "ebk-price")}
                </div>
            </div>`;
      }
      return `<div class="ebk-priceRow">${buildPriceHTML(product.price, "ebk-price ebk-price--normal")}</div>`;
    }

    // Product card
    function buildItemHTML(p, isFav) {
      const title = `<p class="ebk-title">${p.brand ? `<b>${p.brand}</b> - ` : ""}<span>${p.name}</span></p>`;
      const favAttr = isFav ? 'aria-pressed="true"' : 'aria-pressed="false"';
      const ctaInner = STYLE_VARIANT === "website" ? plusSVG() : "Sepete Ekle";
      const ctaClass = STYLE_VARIANT === "website" ? "ebk-cta ebk-cta-circle" : "ebk-cta";

      return `
        <div class="ebk-item">
            <div class="ebk-card">
                <div class="ebk-media">
                    <button class="ebk-fav" type="button" data-id="${String(p.id)}" ${favAttr} aria-label="${isFav ? "Favorilerden çıkar" : "Favorilere ekle"}">${heartSVG()}</button>
                    <a class="ebk-link" href="${p.url}" target="_blank" rel="noopener">
                        <img class="ebk-img" src="${p.img}" alt="${p.name}" loading="lazy">
                    </a>
                </div>
                <div class="ebk-info">
                    ${title}
                    ${priceBlockHTML(p)}
                </div>
                <button class="${ctaClass}" type="button" data-href="${p.url}">${ctaInner}</button>
            </div>
        </div>`;
    }

    // Carousel shell (prev/next + wrap + track)
    function buildCarouselHTML(products, favSet) {
      const items = products.map((p) => buildItemHTML(p, favSet.has(String(p.id)))).join("");
      return `
        <section class="${ROOT_CLASS}" role="region" aria-label="${TITLE_TEXT}">
            <button class="ebk-nav ebk-prev" type="button" aria-label="Önceki">
                <span style="display:inline-block;transform:rotate(180deg)">${arrowRightSVG()}</span>
            </button>
            <div class="ebk-wrap">
                <div class="ebk-box">
                    <div class="ebk-head"><h2 class="ebk-title">${TITLE_TEXT}</h2></div>
                    <div class="ebk-viewport">
                        <div class="ebk-stage">
                            <div class="ebk-track">
                                ${items}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <button class="ebk-nav ebk-next" type="button" aria-label="Sonraki">${arrowRightSVG()}</button>
        </section>`;
    }

    /*
     * CORE MECHANICS (step size, animate, snap, nav disable)
     */
    // Step = card width + gap (computed from first item)
    function getStepSize($track) {
      const $first = $track.find(".ebk-item").first();

      if (!$first.length) return $track[0].clientWidth;

      const rect = $first[0].getBoundingClientRect();
      const gap = parseFloat(getComputedStyle($track[0]).gap || "16") || 16;

      return rect.width + gap;
    }

    // Move exactly one item left/right
    function goRelative($track, delta) {
      const step = getStepSize($track);
      const current = Math.round($track.scrollLeft() / step);
      const targetIdx = Math.max(0, current + delta);
      const target = targetIdx * step;
      $track.stop(true).animate({ scrollLeft: target }, 220, "linear");
    }

    // Snap to nearest item after drag
    function snapToNearest($track) {
      const step = getStepSize($track);
      const left = $track.scrollLeft();
      const rem = left % step;

      if (rem < ALIGN_EPSILON_PX || step - rem < ALIGN_EPSILON_PX) return;

      const idx = Math.round(left / step);
      const target = idx * step;
      $track.stop(true).animate({ scrollLeft: target }, 240, "swing");
    }

    // Disable prev at start, next at end
    function updateNavDisabled($root, $track) {
      const max = $track[0].scrollWidth - $track[0].clientWidth - 1;
      const atStart = $track.scrollLeft() <= 1;
      const atEnd = $track.scrollLeft() >= max;
      $root.find(".ebk-prev").prop("disabled", atStart);
      $root.find(".ebk-next").prop("disabled", atEnd);
    }

    /*
     * EVENTS (delegated nav/fav/cta, drag vs click, resize/scroll)
     */
    function toggleFavorite($btn) {
      const id = $btn.attr("data-id");

      if (!id) return;

      const set = new Set((readJSON(FAVORITES_KEY) || []).map(String));
      const willFav = !set.has(id);
      willFav ? set.add(id) : set.delete(id);
      writeJSON(FAVORITES_KEY, Array.from(set));
      $btn.attr("aria-pressed", String(willFav)).attr("aria-label", willFav ? "Favorilerden çıkar" : "Favorilere ekle");
    }

    function setupEvents($root) {
      const $track = $root.find(".ebk-track");

      // Prev/next (one step)
      $root.on("click", ".ebk-prev", () => goRelative($track, -1));
      $root.on("click", ".ebk-next", () => goRelative($track, 1));

      // Favorite (persist id list)
      $root.on("click", ".ebk-fav", function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite($(this));
      });

      // CTA (open in new tab)
      $root.on("click", ".ebk-cta", function () {
        const href = $(this).attr("data-href");

        if (href) window.open(href, "_blank", "noopener");
      });

      // Drag vs click (mouse + touch), with one-click suppression after a drag
      const drag = { active: false, moved: false, startX: 0, startScroll: 0 };
      let suppressNextLinkClick = false;

      // Cancel exactly one anchor click after a true drag
      $track.on("click", ".ebk-link", function (e) {
        if (suppressNextLinkClick) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        suppressNextLinkClick = false;
      });

      function start(x) {
        drag.active = true;
        drag.moved = false;
        drag.startX = x;
        drag.startScroll = $track.scrollLeft();
        $root.addClass("is-dragging");
      }

      function move(x) {
        if (!drag.active) return;

        const dx = x - drag.startX;

        if (!drag.moved && Math.abs(dx) >= DRAG_THRESHOLD_PX) drag.moved = true;

        if (drag.moved) $track.scrollLeft(drag.startScroll - dx);
      }

      function end() {
        if (!drag.active) return;

        $root.removeClass("is-dragging");

        if (drag.moved) {
          suppressNextLinkClick = true;
          snapToNearest($track);
        }

        drag.active = false;
        updateNavDisabled($root, $track);
      }

      // Mouse
      $track.on("mousedown", function (e) {
        if (e.button === 0) start(e.clientX);
      });
      $(document).on("mousemove", (e) => move(e.clientX));
      $(document).on("mouseup", end);

      // Touch
      $track.on("touchstart", (e) => start(e.originalEvent.touches[0].clientX));
      $track.on("touchmove", (e) => {
        move(e.originalEvent.touches[0].clientX);
        if (drag.moved) e.preventDefault(); // prevent scroll chaining while dragging
      });
      $track.on("touchend touchcancel", end);

      // Keep nav state fresh
      $track.on("scroll", () => updateNavDisabled($root, $track));
      $(window).on("resize", () => updateNavDisabled($root, $track));
      updateNavDisabled($root, $track);
    }

    /*
     * MOUNT / UNMOUNT
     */
    // Fire custom "locationchange" on pushState/replaceState/popstate to prevent race conditions
    function installLocationWatcherOnce() {
      if (locationWatcherInstalled) return;

      locationWatcherInstalled = true;

      const fire = () => window.dispatchEvent(new Event("locationchange"));
      const push = history.pushState;

      history.pushState = function () {
        push.apply(this, arguments);
        fire();
      };

      const replace = history.replaceState;

      history.replaceState = function () {
        replace.apply(this, arguments);
        fire();
      };

      window.addEventListener("popstate", fire);
    }

    // Mount only on homepage and when the anchor is present
    async function ensureMounted() {
      const myToken = bumpToken();

      if (!isHomePage()) {
        unmountCarousel();

        if (!didLogWrongPage) {
          console.log("wrong page");
          didLogWrongPage = true;
        }
        return;
      }

      const anchor = await waitForAnchor(ANCHOR_SELECTOR, 6000);

      if (myToken !== navToken) return; // route changed while waiting
      
      if (!anchor) {
        unmountCarousel();

        if (!didLogWrongPage) {
          console.log("wrong page");
          didLogWrongPage = true;
        }
        return;
      }
      didLogWrongPage = false;

      // If a carousel already exists, move it under the current anchor
      // Carousel was rendering on top of the anchor between page changes
      const $existing = $("." + ROOT_CLASS);
      if ($existing.length) {

        if ($existing.prev()[0] !== anchor) $(anchor).after($existing);
        return;
      }

      // First mount
      injectStyles(STYLE_VARIANT);

      const products = await loadProducts(myToken);

      if (myToken !== navToken || !Array.isArray(products) || !products.length) return;

      const favSet = new Set((readJSON(FAVORITES_KEY) || []).map(String));

      const html = buildCarouselHTML(products, favSet);

      if (!isHomePage()) return;

      // Safety check
      const stillThere = document.querySelector(ANCHOR_SELECTOR);

      if (!stillThere) return;

      $(stillThere).after(html);
      const $root = $("." + ROOT_CLASS).first();
      setupEvents($root);
    }

    // Remove the carousel root (if present)
    function unmountCarousel() {
      $("." + ROOT_CLASS).remove();
    }
  });
})();
