Vendored browser builds. The console runs under a strict
Content-Security-Policy (script-src 'self'), so third-party code must be
served from this origin rather than a CDN.

  xterm.js              @xterm/xterm      (MIT)
  xterm.css             @xterm/xterm      (MIT)
  xterm-addon-fit.js    @xterm/addon-fit  (MIT)

Refresh with:
  npm install @xterm/xterm @xterm/addon-fit
  cp node_modules/@xterm/xterm/lib/xterm.js        app/vendor/xterm.js
  cp node_modules/@xterm/xterm/css/xterm.css       app/vendor/xterm.css
  cp node_modules/@xterm/addon-fit/lib/addon-fit.js app/vendor/xterm-addon-fit.js
