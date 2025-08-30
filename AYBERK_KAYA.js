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

    /*
     * STYLES - "website" (current website carousel styles) | "screenshot" (the one on the hiring case PDF)
     */
    function injectStyles(variant) {
      $("style[data-ebk-carousel]").remove();

      const cssCommon = `
        .ebk-carousel{width:100vw;margin-left:calc(-50vw + 50%);margin-right:calc(-50vw + 50%);position:relative;background:transparent;--wrap-max:100vw;}
        .ebk-carousel .ebk-wrap{margin:24px auto;padding:0 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;}
        .ebk-carousel .ebk-link{display:block;text-decoration:none;color:inherit;}
        @media (min-width:576px){.ebk-carousel .ebk-wrap{max-width:540px}.ebk-carousel{--wrap-max:540px}}
        @media (min-width:768px){.ebk-carousel .ebk-wrap{max-width:720px}.ebk-carousel{--wrap-max:720px}}
        @media (min-width:992px){.ebk-carousel .ebk-wrap{max-width:960px}.ebk-carousel{--wrap-max:960px}}
        @media (min-width:1280px){.ebk-carousel .ebk-wrap{max-width:1180px}.ebk-carousel{--wrap-max:1180px}}
        @media (min-width:1480px){.ebk-carousel .ebk-wrap{max-width:1296px}.ebk-carousel{--wrap-max:1296px}}
        @media (min-width:1580px){.ebk-carousel .ebk-wrap{max-width:1320px}.ebk-carousel{--wrap-max:1320px}}
        .ebk-carousel .ebk-viewport{position:relative;overflow:visible;}
        .ebk-carousel .ebk-stage{position:relative;}
        .ebk-carousel .ebk-track{display:flex;gap:16px;overflow:hidden;cursor:grab;touch-action:pan-y;align-items:stretch;}
        .ebk-carousel.is-dragging .ebk-track{cursor:grabbing;}
        .ebk-carousel .ebk-item{flex:0 0 calc((100% - (16px * 4)) / 5);min-width:calc((100% - (16px * 4)) / 5);display:flex;}
        @media (max-width:1399px){.ebk-carousel .ebk-item{flex-basis:calc((100% - (16px * 3))/4);min-width:calc((100% - (16px * 3))/4)}}
        @media (max-width:1279px){.ebk-carousel .ebk-item{flex-basis:calc((100% - (16px * 2))/3);min-width:calc((100% - (16px * 2))/3)}}
        @media (max-width:989px){.ebk-carousel .ebk-item{flex-basis:calc((100% - 16px)/2);min-width:calc((100% - 16px)/2)}}
        .ebk-carousel .ebk-card{position:relative;background:#fff;border-radius:14px;overflow:hidden;width:100%;display:flex;flex-direction:column;border:1px solid #e9eef4;}
        .ebk-carousel .ebk-card:hover{border-color:#d7dee7;}
        .ebk-carousel .ebk-media{width:100%;aspect-ratio:4/3;background:#fff;}
        .ebk-carousel .ebk-img{width:100%;height:100%;object-fit:contain;object-position:center;display:block;pointer-events:none;}
        .ebk-carousel .ebk-card,*{user-select:none;-webkit-user-drag:none;}
        .ebk-carousel .ebk-info{padding:12px 14px 14px;display:flex;flex-direction:column;height:100%;justify-content:space-between;gap:8px;}
        .ebk-carousel .ebk-title{margin:0;font-size:13px;line-height:1.35;color:#2b2f36;}
        .ebk-carousel .ebk-title b{font-weight:700;}
        .ebk-carousel .ebk-title span{font-weight:400;}
        .ebk-carousel .ebk-rating{display:inline-flex;align-items:center;gap:6px;}
        .ebk-carousel .ebk-stars{display:inline-flex;gap:2px;}
        .ebk-carousel .ebk-rating svg{width:12px;height:12px;}
        .ebk-carousel .ebk-rcount{font-size:12px;color:#96a0aa;}
        .ebk-carousel .ebk-priceRow{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}
        .ebk-carousel .ebk-price .ebk-price-dec{font-size:14px;}
        .ebk-carousel .ebk-fav{position:absolute;top:10px;right:10px;z-index:2;width:22px;height:22px;background:transparent;border:none;padding:0;cursor:pointer;color:#ff8c26;}
        .ebk-carousel .ebk-fav .lucide-heart-icon{width:16px;height:16px;}
        .ebk-carousel .ebk-fav[aria-pressed="true"] .lucide-heart-icon path{fill:currentColor;}
        .ebk-carousel .ebk-nav{position:absolute;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;background:#fff;border:none;color:#212121;display:grid;place-items:center;cursor:pointer;z-index:3;box-shadow:0 4px 10px rgba(0,0,0,.1)}
        .ebk-carousel .ebk-prev{left:calc(50% - (min(var(--wrap-max),100vw)/2) - 52px)}
        .ebk-carousel .ebk-next{right:calc(50% - (min(var(--wrap-max),100vw)/2) - 52px)}
        .ebk-carousel .ebk-nav svg{width:20px;height:20px;}
        @media (max-width:575px){.ebk-carousel .ebk-nav{display:none}}
     `;

      // Theme: current ebebek carousel styles
      const cssWebsite = `
        .ebk-carousel .ebk-box{background:#fff;border-radius:16px;border:none;}
        .ebk-carousel .ebk-head{padding:12px 0;border:none;}
        .ebk-carousel .ebk-head .ebk-title{font-size:24px;}
        .ebk-carousel .ebk-priceRow--stack{display:flex;flex-direction:column;gap:0;}
        .ebk-carousel .ebk-priceTop{display:flex;align-items:baseline;gap:12px;}
        .ebk-carousel .ebk-original{font-size:12px;color:#a6afba;font-weight:600;text-decoration:line-through;}
        .ebk-carousel .ebk-discount-pill{display:inline-flex;align-items:center;padding:0 6px;background:#00a365;color:#fff;border-radius:999px;font-weight:600;font-size:12px;}
        .ebk-carousel .ebk-priceBottom .ebk-price{font-weight:600;font-size:18px;color:#00a365;line-height:14px;}
        .ebk-carousel .ebk-price--normal{font-weight:600;font-size:18px;color:#2b2f36;}
        .ebk-carousel .ebk-cta{position:absolute;right:12px;bottom:12px;width:44px;height:44px;border-radius:50%;border:none;background:#fff;color:#2f80ed;display:grid;place-items:center;box-shadow:0 4px 10px rgba(0,0,0,.1)}
        .ebk-carousel .ebk-cta.ebk-cta-circle:hover{background:#0091D5;color:#fff;}
      `;

      // Theme: the one on the hiring case PDF
      const cssScreenshot = `
        .ebk-carousel .ebk-viewport{position:relative;overflow:visible;padding:16px;}
        .ebk-carousel .ebk-box{background:#fff;border-radius:18px;border:1px solid #eef2f6;overflow:hidden;}
        .ebk-carousel .ebk-head{background:#fff4e8;border-bottom:1px solid #ffe9d3;padding:14px 18px;}
        .ebk-carousel .ebk-head .ebk-title{margin:0;font-size:20px;font-weight:700;color:#ff8c26;}
        .ebk-carousel .ebk-badges{position:absolute;top:10px;left:10px;display:flex;gap:6px;z-index:2;}
        .ebk-carousel .ebk-badge{background:#eafff5;color:#10a779;font-size:11px;font-weight:800;padding:4px 6px;border-radius:8px;border:1px solid #c9f3e4;}
        .ebk-carousel .ebk-rating svg{width:12px;height:12px;}
        .ebk-carousel .ebk-priceRow--stack{display:flex;flex-direction:column;gap:0;}
        .ebk-carousel .ebk-priceTop{display:flex;align-items:center;gap:8px;}
        .ebk-carousel .ebk-original{font-size:12px;color:#9aa0a6;text-decoration:line-through;font-weight:600;}
        .ebk-carousel .ebk-discount-pill{display:inline-flex;align-items:center;padding:0 8px;background:#e8f8f0;color:#13a76b;border-radius:999px;font-weight:800;font-size:12px;}
        .ebk-carousel .ebk-priceBottom .ebk-price{font-weight:600;font-size:24px;color:#13a76b;}
        .ebk-carousel .ebk-price--normal{font-weight:600;font-size:24px;color:#656565;}
        /* Full-width cream footer button like the first image (spacing + 50px radius) */
        .ebk-carousel .ebk-cta{
            display: block;
            width: calc(100% - 24px);
            margin: 10px 12px 14px;
            padding: 12px 18px;
            background: #fff4e8;
            color: #ff8c26;
            border: 1px solid #ffe9d3;
            border-radius: 50px;
            font-weight: 700;
            font-size: 14px;
            cursor: pointer;
            box-shadow: none;
            text-align: center;
        }
        .ebk-carousel .ebk-cta:hover{background:#ffedd9;}
        .ebk-carousel .ebk-nav{display:grid !important;}
      `;

      const css = cssCommon + (variant === "website" ? cssWebsite : cssScreenshot);
      $("<style>").attr("data-ebk-carousel", "true").attr("data-variant", variant).text(css).appendTo(document.head);
    }
  });
})();
