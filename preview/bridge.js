/* Browser-only webOS simulation. Injected by scripts/preview.py, never packaged. */
(function () {
  'use strict';
  var enabled = false, rootPhase = 'disabled', rootTrialTimer;
  var rootTransaction = 'preview-root-trial';
  var toastTimer;
  function message(text) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = 'Preview · ' + text;
    toast.classList.add('shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('shown'); }, 2400);
  }
  window.PalmServiceBridge = function () { this.timer = null; };
  window.PalmServiceBridge.prototype.cancel = function () { clearTimeout(this.timer); };
  window.PalmServiceBridge.prototype.call = function (uri, raw) {
    var bridge = this, payload = JSON.parse(raw || '{}');
    bridge.timer = setTimeout(function () {
      var result = {returnValue: false, errorText: 'Unavailable in browser preview'};
      if (uri === 'luna://com.webos.applicationManager/launch') {
        if (payload.id !== 'com.local.nativehome') {
          var app = (window.TV_APPS.apps || []).filter(function (a) { return a.id === payload.id; })[0];
          message(app ? app.title : payload.id === 'com.webos.app.firstuse-overlay' ? 'Network settings' : payload.id === 'com.palm.app.settings' ? 'TV settings' : payload.id);
        }
        result = {returnValue: true};
      } else if (uri === 'luna://com.palm.connectionmanager/getStatus') {
        result = {returnValue: true, isInternetConnectionAvailable: true, wifi: {state: 'connected', ssid: 'Demo Wi-Fi'}};
      } else if (uri === 'luna://com.webos.service.bus/signal/registerServerStatus') {
        result = {returnValue: true, connected: true};
      } else if (uri.indexOf('luna://com.cleanyourtv.root.preview.service/') === 0) {
        var rootMethod = uri.split('/').pop();
        if (rootMethod === 'enable') {
          clearTimeout(rootTrialTimer);
          rootPhase = 'trial';
          rootTrialTimer = setTimeout(function () { rootPhase = 'disabled'; }, 60000);
        } else if (rootMethod === 'confirm' && rootPhase === 'trial' && payload.transaction === rootTransaction) {
          clearTimeout(rootTrialTimer);
          rootPhase = 'active';
        } else if (rootMethod === 'restore') {
          clearTimeout(rootTrialTimer);
          rootPhase = 'disabled';
        }
        if (['status', 'enable', 'restore'].indexOf(rootMethod) >= 0 ||
            (rootMethod === 'confirm' && rootPhase === 'active' && payload.transaction === rootTransaction)) {
          var home = rootPhase === 'disabled' ? 'com.webos.app.home' : 'com.cleanyourtv.root.preview';
          var state = {intent: {phase: rootPhase}, journal: {transaction: rootTransaction},
            effective: {sam_home: home, profiles: {defaultApps: {categories: {home: home}}, idleApp: {appId: home}}}};
          result = {returnValue: true, result: {returnValue: true, result: rootMethod === 'restore' ? 'restored' : state}};
        }
      } else if (uri === 'luna://com.gathin.tvhome.renewal/turnOff') {
        message('TV turned off');
        result = {returnValue: true};
      } else if (uri === 'luna://com.gathin.tvhome.renewal/wallpapers') {
        // Served by scripts/preview.py from live Bing data; the static export has none.
        var x = new XMLHttpRequest();
        x.open('GET', '/preview/bing', true);
        x.onload = function () { if (bridge.onservicecallback) bridge.onservicecallback(x.status === 200 ? x.responseText : JSON.stringify(result)); };
        x.onerror = function () { if (bridge.onservicecallback) bridge.onservicecallback(JSON.stringify(result)); };
        x.send();
        return;
      } else if (uri.indexOf('luna://com.gathin.tvhome.renewal/') === 0) {
        var method = uri.split('/').pop();
        if (['status', 'enable', 'disable', 'check'].indexOf(method) >= 0) {
          if (method === 'enable') enabled = true;
          if (method === 'disable') enabled = false;
          result = {returnValue: true, state: {enabled: enabled, last: {status: 'healthy', remainingSeconds: 864000, checkedAt: Date.now()}}};
        }
      } else if (uri === 'luna://com.cleanyourtv.updater.service/check') {
        result = {returnValue: true, result: {home: '1.2.2', state: 'current', canInstall: false,
          candidate: {home: '1.2.2', notes: 'Browser preview: no real updates are checked or installed.'}}};
      } else if (uri === 'luna://com.cleanyourtv.updater.service/healthy') {
        result = {returnValue: true};
      }
      if (bridge.onservicecallback) bridge.onservicecallback(JSON.stringify(result));
    }, 30);
  };
}());
