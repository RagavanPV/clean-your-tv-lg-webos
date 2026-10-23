/* Start Home Helper only when it is not already running. On webOS 22 launching a
   native app, even one that is already running, takes the foreground away from the
   launcher and LG Home appears. When the helper does start, it reopens the launcher. */
(function () {
  'use strict';
  var bridge, timer;
  function done() {
    clearTimeout(timer);
    if (bridge) { try { bridge.cancel(); } catch (_) {} bridge = null; }
  }
  function launchHelper() {
    try {
      var b = new PalmServiceBridge();
      b.onservicecallback = function () { try { b.cancel(); } catch (_) {} };
      b.call('luna://com.webos.applicationManager/launch', JSON.stringify({id: 'com.local.nativehome', params: {nativeHomeAuto: true}}));
    } catch (_) {}
  }
  try {
    bridge = new PalmServiceBridge();
    bridge.onservicecallback = function (raw) {
      var r;
      try { r = JSON.parse(raw); } catch (_) { r = {}; }
      done();
      // Unknown status: leave it alone; the helper's boot activity starts it anyway.
      if (r.returnValue !== false && r.connected === false) launchHelper();
    };
    timer = setTimeout(done, 5000);
    bridge.call('luna://com.webos.service.bus/signal/registerServerStatus', JSON.stringify({serviceName: 'com.local.nativehome', subscribe: false}));
  } catch (_) { done(); }
}());
