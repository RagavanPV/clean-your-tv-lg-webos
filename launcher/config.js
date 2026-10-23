window.CONFIG = {
  columns: 6,
  dockApps: [],
  hiddenApps: ["com.gathin.tvhome", "com.local.nativehome"],

  // Tabs under the app row. "apps" lists app ids or title matches ("a|b" = either);
  // the tab with rest: true shows every app not placed in another tab.
  tabs: [
    {name: "Movies", apps: ["Netflix", "YouTube", "Prime Video", "JioHotstar|Hotstar", "Sony LIV|SonyLIV", "ZEE5|Zee 5"]},
    {name: "Apps", rest: true}
  ],

  // source "bing": daily Bing images (market sets the region). source "local":
  // your own photos in launcher/wallpapers/, e.g. images: ["wallpapers/beach.jpg"].
  wallpaper: {source: "bing", market: "en-IN", rotateMinutes: 30, caption: true},

  // App to open from the Search button; the first one that launches wins.
  searchApps: ["com.webos.app.voice", "com.webos.app.search"],

  // Set to false if the TV feels slow: glass keeps its tint but drops the blur.
  glassBlur: true
};
