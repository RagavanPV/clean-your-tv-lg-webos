/* Wallpaper slideshow: daily Bing images (via the packaged service) or local photos.
   Falls back to the last list it saw, then to the plain gradient in style.css. */
(function () {
  'use strict';
  var CACHE_KEY = 'tvhome.wallpapers', REFRESH_MS = 6 * 3600 * 1000;
  var layers = [], active = 0, images = [], index = 0, rotateTimer = null, loadedDay = '';

  function rpc(uri, payload, callback) {
    var bridge, timer, done = false;
    function finish(result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (bridge) { try { bridge.cancel(); } catch (_) {} }
      callback(result || {returnValue: false});
    }
    try {
      bridge = new PalmServiceBridge();
      bridge.onservicecallback = function (raw) {
        try { finish(JSON.parse(raw)); } catch (_) { finish(null); }
      };
      timer = setTimeout(function () { finish(null); }, 15000);
      bridge.call(uri, JSON.stringify(payload || {}));
    } catch (_) { finish(null); }
  }

  function config() { return (window.CONFIG && CONFIG.wallpaper) || {source: 'bing'}; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }

  function readCache() {
    try { var c = JSON.parse(localStorage.getItem(CACHE_KEY)); return c && Array.isArray(c.images) ? c : null; }
    catch (_) { return null; }
  }
  function writeCache(list) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({savedAt: Date.now(), images: list})); } catch (_) {}
  }

  function caption(image) {
    var el = document.getElementById('caption');
    if (!el) return;
    var text = config().caption === false || !image ? '' : (image.copyright || image.title || '');
    el.textContent = text;
    el.classList.toggle('shown', !!text);
  }

  // Preload, then crossfade, so a slow download never shows a half-drawn photo.
  function show(i) {
    if (!images.length) return;
    index = (i + images.length) % images.length;
    var image = images[index], img = new Image();
    img.onload = function () {
      var next = layers[1 - active];
      next.style.backgroundImage = 'url("' + image.url.replace(/"/g, '%22') + '")';
      next.classList.add('shown');
      layers[active].classList.remove('shown');
      active = 1 - active;
      document.body.classList.add('has-wallpaper');
      caption(image);
    };
    img.onerror = function () {
      // Skip a broken image, but stop after one full lap.
      if (!show.failures) show.failures = 0;
      if (++show.failures < images.length) show(index + 1);
    };
    img.src = image.url;
  }

  function use(list) {
    if (!list || !list.length) return;
    var first = !images.length || images[0].url !== list[0].url;
    images = list;
    show.failures = 0;
    if (first) show(0);
  }

  function refresh(force) {
    var c = config();
    loadedDay = today();
    if (c.source === 'local') {
      use((c.images || []).map(function (url) { return {url: url}; }));
      return;
    }
    if (c.source !== 'bing') return;
    rpc('luna://com.gathin.tvhome.renewal/wallpapers', {market: c.market || 'en-IN', force: !!force}, function (r) {
      if (r.returnValue === true && Array.isArray(r.images) && r.images.length) {
        writeCache(r.images);
        use(r.images);
      }
    });
  }

  function start() {
    layers = [document.getElementById('wallA'), document.getElementById('wallB')];
    if (!layers[0] || !layers[1]) return;
    var c = config(), cached = readCache();
    if (c.source === 'bing' && cached) use(cached.images);
    refresh(false);
    var minutes = Math.max(1, Number(c.rotateMinutes) || 30);
    clearInterval(rotateTimer);
    rotateTimer = setInterval(function () { show(index + 1); }, minutes * 60000);
    setInterval(function () { refresh(false); }, REFRESH_MS);
    // A TV left in standby overnight should wake up on today's photo.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && loadedDay !== today()) refresh(true);
    });
  }

  window.Wallpaper = {start: start, next: function () { show(index + 1); }};
}());
