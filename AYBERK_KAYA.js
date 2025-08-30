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
  });
})();
