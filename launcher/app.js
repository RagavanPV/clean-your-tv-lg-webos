/* Glass Home: photo wallpaper, a row of glass app pills, and tabs that switch the row. */
(function () {
  'use strict';
  var KEY_OK = 13, KEY_BACK = 461, KEY_ESC = 27, LEFT = 37, UP = 38, RIGHT = 39, DOWN = 40;
  var HOLD_MS = 600, TABS_KEY = 'tvhome.tabs', DOCK_WIDTH = 1728, GRID_COLUMNS = 5;
  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  // Per-app pill logos, matched against normalised app titles. src: a full-colour logo
  // shown alone; tvIcon: the app's own TV icon (SonyLIV and Sun NXT have no transparent logo);
  // h: logo height in TV pixels inside a 128 px pill; glyph: a white Simple Icons glyph
  // shown beside the app's name.
  var BRANDS = {
    netflix: {src: 'logos/netflix-wordmark.svg', h: 50},
    youtube: {src: 'logos/youtube-wordmark.svg', h: 46},
    primevideo: {src: 'logos/primevideo-color.svg', h: 56},
    amazonprimevideo: {src: 'logos/primevideo-color.svg', h: 56},
    jiohotstar: {src: 'logos/jiohotstar-white.png', h: 50},
    hotstar: {src: 'logos/jiohotstar-white.png', h: 50},
    zee5: {src: 'logos/zee5-color.svg', h: 76},
    sonyliv: {tvIcon: true, h: 92},
    sunnxt: {tvIcon: true, h: 92},
    youtubemusic: {glyph: 'youtubemusic'}, spotify: {glyph: 'spotify'}, twitch: {glyph: 'twitch'},
    appletv: {glyph: 'appletv'}, applemusic: {glyph: 'applemusic'}
  };

  var $ = function (id) { return document.getElementById(id); };
  var tilesEl = $('tiles'), tabBar = $('tabBar'), inputsPanel = $('inputsPanel'), allPanel = $('allPanel');
  var allGrid = $('allGrid'), toastEl = $('toast');
  var topButtons = [$('btnLgHome'), $('btnInputs'), $('btnSettings'), $('btnSearch'), $('btnPower')];

  var apps = [], tabs = [], dockItems = [], tabEls = [], inputRows = [], gridItems = [];
  var zone = 'dock', tabIndex = 0, tabFocus = 0, dockIndex = 0, topIndex = 0, inputIndex = 0, gridIndex = 0;
  var holdTimer = null, okDown = false, toastTimer = null;

  // ---- TV services ----------------------------------------------------------------------------

  function call(uri, payload, callback) {
    try {
      var bridge = new PalmServiceBridge();
      bridge.onservicecallback = function (raw) {
        var result;
        try { result = JSON.parse(raw); } catch (_) { result = {returnValue: false}; }
        if (callback) callback(result);
      };
      bridge.call(uri, JSON.stringify(payload || {}));
    } catch (e) {
      if (callback) callback({returnValue: false, errorText: String(e)});
    }
  }

  function launch(id, title, params, onFail) {
    call('luna://com.webos.applicationManager/launch', {id: id, params: params || {}}, function (r) {
      if (r.returnValue === false) {
        if (onFail) onFail();
        else toast("Can't open " + (title || id));
      }
    });
  }

  function launchFirst(ids, title) {
    if (!ids.length) { toast("Can't open " + title); return; }
    launch(ids[0], title, null, function () { launchFirst(ids.slice(1), title); });
  }

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('shown'); }, 2400);
  }

  // ---- apps and tabs --------------------------------------------------------------------------

  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function byTitle(a, b) { return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1; }

  // One matcher picks one app: an exact id, else an exact title, else a title prefix.
  function findApp(matcher, taken) {
    var free = apps.filter(function (a) { return !taken[a.id]; });
    var exact = free.filter(function (a) { return a.id === matcher; })[0];
    if (exact) return exact;
    var keys = String(matcher).split('|').map(norm).filter(Boolean);
    for (var i = 0; i < keys.length; i++) {
      var hit = free.filter(function (a) { return norm(a.title) === keys[i]; })[0] ||
        free.filter(function (a) { return norm(a.title).indexOf(keys[i]) === 0; })[0];
      if (hit) return hit;
    }
    return null;
  }

  function readOverrides() {
    try { return JSON.parse(localStorage.getItem(TABS_KEY)) || {}; } catch (_) { return {}; }
  }

  function saveOverride(name, ids) {
    var all = readOverrides();
    all[name] = ids;
    try { localStorage.setItem(TABS_KEY, JSON.stringify(all)); } catch (_) {}
  }

  function buildTabs() {
    var hidden = {}, byId = {}, overrides = readOverrides(), placed = {};
    (CONFIG.hiddenApps || []).forEach(function (id) { hidden[id] = true; });
    apps = ((window.TV_APPS && TV_APPS.apps) || []).filter(function (a) { return !hidden[a.id]; });
    apps.forEach(function (a) { byId[a.id] = a; });
    var config = CONFIG.tabs && CONFIG.tabs.length ? CONFIG.tabs : [{name: 'Apps', rest: true}];
    tabs = config.map(function (t) {
      var list = [];
      if (!t.rest) {
        if (Array.isArray(overrides[t.name])) {
          list = overrides[t.name].map(function (id) { return byId[id]; }).filter(Boolean);
        } else {
          var taken = {};
          (t.apps || []).forEach(function (m) {
            var app = findApp(m, taken);
            if (app) { list.push(app); taken[app.id] = true; }
          });
        }
        list.forEach(function (a) { placed[a.id] = true; });
      }
      return {name: t.name, rest: !!t.rest, apps: list};
    });
    tabs.forEach(function (t) {
      if (t.rest) t.apps = apps.filter(function (a) { return !placed[a.id]; }).sort(byTitle);
    });
    tabIndex = Math.min(tabIndex, tabs.length - 1);
  }

  // ---- rendering ------------------------------------------------------------------------------

  function makePill(app) {
    var el = document.createElement('div');
    el.className = 'item glass smoked';
    var brand = BRANDS[norm(app.title)] || {};
    var img = document.createElement('img');
    if (brand.src || (brand.tvIcon && app.icon)) {
      img.className = 'logo original' + (brand.tvIcon ? ' appIcon' : '');
      img.src = brand.tvIcon ? app.icon : brand.src;
      // A share of the pill's height, so logos scale with the smaller All apps pills.
      img.style.height = (brand.h / 128 * 100) + '%';
      el.appendChild(img);
      return el;
    }
    if (brand.glyph) {
      img.className = 'logo';
      img.src = 'logos/' + brand.glyph + '.svg';
      el.appendChild(img);
    }
    var label = document.createElement('span');
    label.className = 'label' + (app.title.length > 12 ? ' long' : '');
    label.textContent = app.title;
    el.appendChild(label);
    return el;
  }

  function renderDock() {
    var tab = tabs[tabIndex];
    tilesEl.innerHTML = '';
    tilesEl.style.transform = 'none';
    tilesEl.dataset.offset = 0;
    $('dock').classList.remove('more-left', 'more-right');
    dockItems = tab.apps.map(function (app, i) {
      var el = makePill(app);
      el.addEventListener('mouseover', function () { if (!panelOpen()) focusDock(i); });
      el.addEventListener('click', function () { launch(app.id, app.title); });
      tilesEl.appendChild(el);
      setTimeout(function () { el.classList.add('shown'); }, 40 + 45 * Math.min(i, 10));
      return {app: app, el: el};
    });
    $('emptyHint').classList.toggle('hidden', dockItems.length > 0);
    dockIndex = Math.min(dockIndex, Math.max(0, dockItems.length - 1));
  }

  function renderTabs() {
    tabBar.innerHTML = '';
    tabEls = tabs.map(function (t, i) {
      var el = document.createElement('div');
      el.className = 'tab';
      el.textContent = t.name;
      el.addEventListener('mouseover', function () { if (!panelOpen()) focusTab(i); });
      el.addEventListener('click', function () { selectTab(i); });
      tabBar.appendChild(el);
      return el;
    });
    var add = document.createElement('div');
    add.className = 'tab add glass';
    add.textContent = '+';
    add.addEventListener('mouseover', function () { if (!panelOpen()) focusTab(tabs.length); });
    add.addEventListener('click', openAll);
    tabBar.appendChild(add);
    tabEls.push(add);
    markActiveTab();
  }

  function markActiveTab() {
    tabEls.forEach(function (el, i) { el.classList.toggle('active', i === tabIndex); });
  }

  function selectTab(i) {
    if (i < 0 || i >= tabs.length) return;
    if (i !== tabIndex) {
      tabIndex = i;
      dockIndex = 0;
      renderDock();
      markActiveTab();
    }
  }

  // ---- focus ----------------------------------------------------------------------------------

  function clearFocus() {
    document.querySelectorAll('.focused').forEach(function (el) { el.classList.remove('focused'); });
  }

  function focusDock(i) {
    if (!dockItems.length) { focusTab(tabIndex); return; }
    zone = 'dock';
    clearFocus();
    dockIndex = Math.max(0, Math.min(i, dockItems.length - 1));
    var el = dockItems[dockIndex].el;
    el.classList.add('focused');
    // Scroll the row sideways so the focused pill stays fully visible.
    var offset = Number(tilesEl.dataset.offset || 0), left = el.offsetLeft, right = left + el.offsetWidth;
    if (right - offset > DOCK_WIDTH) offset = right - DOCK_WIDTH;
    if (left - offset < 0) offset = left;
    tilesEl.dataset.offset = offset;
    tilesEl.style.transform = 'translateX(' + -offset + 'px)';
    var last = dockItems[dockItems.length - 1].el;
    $('dock').classList.toggle('more-left', offset > 0);
    $('dock').classList.toggle('more-right', last.offsetLeft + last.offsetWidth - offset > DOCK_WIDTH);
  }

  function focusTab(i) {
    zone = 'tabs';
    clearFocus();
    tabFocus = Math.max(0, Math.min(i, tabEls.length - 1));
    tabEls[tabFocus].classList.add('focused');
    if (tabFocus < tabs.length) selectTab(tabFocus);
  }

  function focusTop(i) {
    zone = 'top';
    clearFocus();
    topIndex = Math.max(0, Math.min(i, topButtons.length - 1));
    topButtons[topIndex].classList.add('focused');
  }

  function activateTop(i) {
    var id = topButtons[i].id;
    if (id === 'btnLgHome') launch('com.webos.app.home', 'LG Home');
    else if (id === 'btnInputs') openInputs();
    else if (id === 'btnSettings') { if (window.RenewalPanel) window.RenewalPanel.open(); }
    else if (id === 'btnSearch') launchFirst((CONFIG.searchApps || []).slice(), 'Search');
    else if (id === 'btnPower') {
      // Relayed to Home Helper, which owns the paired TV session allowed to power off.
      call('luna://com.gathin.tvhome.renewal/turnOff', {}, function (r) {
        if (r.returnValue !== true) toast("Couldn't turn off the TV (" + (r.errorText || 'no reply') + ')');
      });
    }
    else if (id === 'btnResumeHome' && window.HelperControl) window.HelperControl.resume();
  }

  // ---- inputs dropdown ------------------------------------------------------------------------

  function openInputs() {
    inputsPanel.innerHTML = '';
    var list = ((window.TV_APPS && TV_APPS.inputs) || []).slice();
    if (CONFIG.liveTvApp) list.push({label: 'Live TV', appId: CONFIG.liveTvApp});
    if (!list.length) { toast('No inputs found'); return; }
    inputRows = list.map(function (input, i) {
      var row = document.createElement('div');
      row.className = 'inputRow';
      row.textContent = input.label;
      row.addEventListener('mouseover', function () { focusInput(i); });
      row.addEventListener('click', function () { closeInputs(); launch(input.appId, input.label); });
      inputsPanel.appendChild(row);
      return {el: row, input: input};
    });
    var r = $('btnInputs').getBoundingClientRect();
    inputsPanel.style.right = (1920 - r.right) + 'px';
    inputsPanel.style.top = (r.bottom + 40) + 'px';
    inputsPanel.classList.remove('hidden');
    focusInput(0);
  }

  function focusInput(i) {
    zone = 'inputs';
    clearFocus();
    inputIndex = Math.max(0, Math.min(i, inputRows.length - 1));
    inputRows[inputIndex].el.classList.add('focused');
  }

  function closeInputs() {
    inputsPanel.classList.add('hidden');
    focusTop(0);
  }

  // ---- all apps -------------------------------------------------------------------------------

  // Editing targets the tab that was showing; the "rest" tab is not editable.
  function editableTab() { return tabs[tabIndex].rest ? tabs.filter(function (t) { return !t.rest; })[0] : tabs[tabIndex]; }

  function renderAll() {
    var tab = editableTab();
    $('allTitle').innerHTML = '';
    $('allTitle').appendChild(document.createTextNode('All apps'));
    if (tab) {
      var hint = document.createElement('span');
      hint.innerHTML = '  ·  OK to open  ·  hold OK to add to or remove from <b></b>';
      hint.querySelector('b').textContent = tab.name.toUpperCase();
      $('allTitle').appendChild(hint);
    }
    allGrid.innerHTML = '';
    var members = {};
    if (tab) tab.apps.forEach(function (a) { members[a.id] = true; });
    gridItems = apps.slice().sort(byTitle).map(function (app, i) {
      var el = makePill(app);
      el.classList.toggle('member', !!members[app.id]);
      el.addEventListener('mouseover', function () { focusGrid(i); });
      el.addEventListener('click', function () { launch(app.id, app.title); });
      allGrid.appendChild(el);
      return {app: app, el: el};
    });
  }

  function openAll() {
    renderAll();
    allPanel.classList.remove('hidden');
    focusGrid(0);
  }

  function closeAll() {
    allPanel.classList.add('hidden');
    renderDock();
    focusTab(tabs.length);
  }

  function focusGrid(i) {
    zone = 'all';
    clearFocus();
    gridIndex = Math.max(0, Math.min(i, gridItems.length - 1));
    if (!gridItems.length) return;
    var el = gridItems[gridIndex].el;
    el.classList.add('focused');
    // Keep the focused row inside the sheet.
    var top = el.offsetTop, bottom = top + el.offsetHeight;
    if (bottom > allGrid.scrollTop + allGrid.clientHeight - 12) allGrid.scrollTop = bottom - allGrid.clientHeight + 12;
    if (top < allGrid.scrollTop + 12) allGrid.scrollTop = top - 12;
  }

  function toggleMembership() {
    var tab = editableTab(), item = gridItems[gridIndex];
    if (!tab || !item) return;
    var ids = tab.apps.map(function (a) { return a.id; }), at = ids.indexOf(item.app.id);
    if (at >= 0) ids.splice(at, 1); else ids.push(item.app.id);
    saveOverride(tab.name, ids);
    buildTabs();
    item.el.classList.toggle('member', at < 0);
    toast((at < 0 ? 'Added to ' : 'Removed from ') + tab.name);
  }

  // ---- keys -----------------------------------------------------------------------------------

  function panelOpen() {
    var update = $('updatePanel');
    return !!(window.RenewalPanel && window.RenewalPanel.isOpen()) || !!(update && !update.classList.contains('hidden'));
  }

  function ok() {
    if (zone === 'dock' && dockItems[dockIndex]) launch(dockItems[dockIndex].app.id, dockItems[dockIndex].app.title);
    else if (zone === 'tabs') { if (tabFocus === tabs.length) openAll(); else selectTab(tabFocus); }
    else if (zone === 'top') activateTop(topIndex);
    else if (zone === 'inputs') { var row = inputRows[inputIndex]; closeInputs(); launch(row.input.appId, row.input.label); }
    else if (zone === 'all' && gridItems[gridIndex]) launch(gridItems[gridIndex].app.id, gridItems[gridIndex].app.title);
  }

  function hold() {
    if (zone === 'all') toggleMembership();
    else ok();
  }

  function back() {
    if (zone === 'all') closeAll();
    else if (zone === 'inputs') closeInputs();
    else focusDock(dockIndex);
  }

  function arrow(key) {
    if (zone === 'dock') {
      if (key === LEFT) focusDock(dockIndex - 1);
      else if (key === RIGHT) focusDock(dockIndex + 1);
      else if (key === UP) focusTop(topButtons.length - 1);
      else if (key === DOWN) focusTab(tabIndex);
    } else if (zone === 'tabs') {
      if (key === LEFT) focusTab(tabFocus - 1);
      else if (key === RIGHT) focusTab(tabFocus + 1);
      else if (key === UP) focusDock(dockIndex);
    } else if (zone === 'top') {
      if (key === LEFT) focusTop(topIndex - 1);
      else if (key === RIGHT) focusTop(topIndex + 1);
      else if (key === DOWN) focusDock(dockIndex);
    } else if (zone === 'inputs') {
      if (key === UP) focusInput(inputIndex - 1);
      else if (key === DOWN) focusInput(inputIndex + 1);
      else closeInputs();
    } else if (zone === 'all') {
      if (key === LEFT) focusGrid(gridIndex - 1);
      else if (key === RIGHT) focusGrid(gridIndex + 1);
      else if (key === UP && gridIndex >= GRID_COLUMNS) focusGrid(gridIndex - GRID_COLUMNS);
      else if (key === DOWN && gridIndex + GRID_COLUMNS < gridItems.length) focusGrid(gridIndex + GRID_COLUMNS);
    }
  }

  document.addEventListener('keydown', function (e) {
    if (panelOpen()) { okDown = false; return; }
    var key = e.keyCode;
    if (key === KEY_OK) {
      // OK fires on release so a long press can mean "hold" instead.
      if (!okDown) {
        okDown = true;
        holdTimer = setTimeout(function () { holdTimer = null; hold(); }, HOLD_MS);
      }
    } else if (key === KEY_BACK || key === KEY_ESC) back();
    else if (key >= LEFT && key <= DOWN) arrow(key);
    else return;
    e.preventDefault();
  });

  document.addEventListener('keyup', function (e) {
    if (e.keyCode !== KEY_OK || !okDown) return;
    okDown = false;
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; ok(); }
  });

  // ---- clock ----------------------------------------------------------------------------------

  function tick() {
    var d = new Date(), h = d.getHours(), m = d.getMinutes();
    $('clock').textContent = (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + ' ' + (h < 12 ? 'AM' : 'PM');
    $('date').textContent = d.getDate() + ' ' + MONTHS[d.getMonth()] + " '" + String(d.getFullYear()).slice(2);
  }

  // ---- helper-control.js hooks ----------------------------------------------------------------

  window.helperResumeMessage = toast;
  window.setHelperResumeVisible = function (visible) {
    var button = $('btnResumeHome'), at = topButtons.indexOf(button);
    if (visible && at < 0) topButtons.push(button);
    if (!visible && at >= 0) {
      topButtons.splice(at, 1);
      if (zone === 'top' && topIndex >= topButtons.length) focusTop(topButtons.length - 1);
    }
    button.classList.toggle('hidden', !visible);
  };

  // ---- start ----------------------------------------------------------------------------------

  // Pressing Home brings the launcher back: close anything open and return to the app row.
  function reset() {
    tick();
    inputsPanel.classList.add('hidden');
    allPanel.classList.add('hidden');
    focusDock(dockIndex);
  }

  topButtons.concat($('btnResumeHome')).forEach(function (el) {
    el.addEventListener('mouseover', function () {
      var i = topButtons.indexOf(el);
      if (i >= 0 && !panelOpen() && zone !== 'inputs') focusTop(i);
    });
    el.addEventListener('click', function () {
      var i = topButtons.indexOf(el);
      if (i >= 0) activateTop(i);
    });
  });
  document.addEventListener('webOSRelaunch', reset);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) reset(); });

  if (CONFIG.glassBlur === false) document.body.classList.add('no-blur');
  buildTabs();
  renderTabs();
  renderDock();
  tick();
  setInterval(tick, 10000);
  if (window.Wallpaper) window.Wallpaper.start();
  focusDock(0);
}());
