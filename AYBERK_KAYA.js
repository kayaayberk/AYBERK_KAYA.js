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
  });
})();
