/* core.js: the shared front-end engine (window.UI). Same in every app made from APP_MAKER/template;
   app-specific things live in web/app.js (brand, nav, footer) and web/pages/*.html (the pages).

   Pages:   UI.page(name, {title, nav, icon, auth, order, chrome}, mount)
              auth: null (anyone) | 'guest' (signed-out only) | 'user' | 'admin'
              nav: label for the header / phone tab bar (omit to keep it out of the menus)
              mount(view, ctx) draws into `view`; ctx = {args, me, go, api}. Return a Promise (the page
              is "ready" when it resolves) or {ready, destroy}. URLs are #name/arg1/arg2.
   Server:  UI.api(fn, ...args) -> Promise of the server function's return value. A reply of
              {ok: false, error} rejects with that message (shown as a toast unless you .catch it).
            UI.apiQuiet(fn, ...args) is the same without Anvil's loading spinner.
   Auth:    UI.auth('login'|'signup'|'reset'|'logout', {...}) -> Promise of {ok, me, message}
   Helpers: UI.esc, UI.icon, UI.toast, UI.modal, UI.confirm, UI.busy, UI.formData, UI.fmtDate, UI.ago,
            UI.store, UI.setTheme, UI.feedback, UI.go, UI.refresh
   Tests:   window.UI_READY is true when the current page has finished loading. */
(function () {
  'use strict';
  if (window.UI && window.UI.__v) return;
  var UI = window.UI = { __v: 1, pages: {}, me: null, config: { name: 'App', key: 'app', home: 'home', landing: 'landing' } };
  window.UI_READY = false;

  UI.configure = function (cfg) { Object.keys(cfg).forEach(function (k) { UI.config[k] = cfg[k]; }); };

  /* ------------------------------------------------------------------ small helpers */
  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
  UI.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  };
  UI.fmtDate = function (iso, opts) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  UI.fmtDateTime = function (iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };
  UI.ago = function (iso) {
    if (!iso) return '';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    var steps = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']], n = s / 60;
    for (var i = 0; i < steps.length; i++) {
      if (n < steps[i][0]) { n = Math.floor(n); return UI.plural(n, steps[i][1]) + ' ago'; }
      n = n / steps[i][0];
    }
    return '';
  };
  UI.store = {
    get: function (k, dflt) { try { var v = localStorage.getItem(UI.config.key + '.' + k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } },
    set: function (k, v) { try { localStorage.setItem(UI.config.key + '.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  UI.formData = function (form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  };
  /* Disable a button while a Promise runs; returns the Promise. */
  UI.busy = function (btn, promise) {
    if (!btn) return promise;
    btn.disabled = true; btn.classList.add('is-busy');
    var done = function () { btn.disabled = false; btn.classList.remove('is-busy'); };
    promise.then(done, done);
    return promise;
  };

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.7c2.2.6 3.5 2.4 3.5 5.3"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8V5M9 5.5 7.5 4M15 5.5 16.5 4M7 13H3M21 13h-4M7.5 18l-3 2M16.5 18l3 2M7.5 9.5l-3-2M16.5 9.5l3-2"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
  };
  UI.ICONS = ICONS;
  UI.icon = function (name, cls) {
    return '<svg class="ui-ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.sparkle) + '</svg>';
  };

  /* ------------------------------------------------------------------ toasts, modals */
  UI.toast = function (msg, kind) {
    var box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui ui-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'ui-toast' + (kind ? ' ' + kind : '');
    t.innerHTML = (kind === 'error' ? UI.icon('info') : kind === 'ok' ? UI.icon('check') : '') + '<span>' + UI.esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, kind === 'error' ? 6500 : 3200);
  };
  UI.modal = function (html, opts) {
    opts = opts || {};
    var prev = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'ui ui-modal-wrap';
    wrap.innerHTML = '<div class="ui-modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<button class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' + html + '</div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('ui-modal-open');
    function key(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (!wrap.parentNode) return;
      wrap.remove(); document.removeEventListener('keydown', key);
      if (!document.querySelector('.ui-modal-wrap')) document.documentElement.classList.remove('ui-modal-open');
      if (opts.onclose) opts.onclose();
      if (prev && prev.focus) prev.focus();
    }
    document.addEventListener('keydown', key);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    var first = wrap.querySelector('input, textarea, select');
    setTimeout(function () { (first || wrap.querySelector('.ui-modal')).focus && (first || wrap.querySelector('.ui-modal')).focus(); }, 30);
    return { el: wrap.querySelector('.ui-modal'), close: close };
  };
  UI.confirm = function (o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    return new Promise(function (resolve) {
      var answered = false;
      var m = UI.modal('<h2>' + UI.esc(o.title || 'Are you sure?') + '</h2>' + (o.text ? '<p class="muted">' + UI.esc(o.text) + '</p>' : '') +
        '<div class="ui-row end" style="margin-top:20px"><button class="ui-btn ghost" data-close>' + UI.esc(o.cancel || 'Cancel') + '</button>' +
        '<button class="ui-btn ' + (o.danger ? 'danger solid' : 'primary') + '" data-ok>' + UI.esc(o.ok || 'OK') + '</button></div>',
      { onclose: function () { if (!answered) resolve(false); } });
      m.el.querySelector('[data-ok]').onclick = function () { answered = true; m.close(); resolve(true); };
    });
  };

  /* ------------------------------------------------------------------ theme */
  UI.theme = function () { return UI.store.get('theme', 'auto'); };
  UI.applyTheme = function (t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('ui-dark', !!dark);
  };
  UI.setTheme = function (t) { UI.store.set('theme', t); UI.applyTheme(t); };
  UI.applyTheme(UI.theme());
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { UI.applyTheme(UI.theme()); }); } catch (e) {}
  }

  /* ------------------------------------------------------------------ server bridge */
  var bridge = null;
  function send(kind, payload) {
    if (!bridge) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = bridge(kind, JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(out).then(function (r) {
      r = typeof r === 'string' ? JSON.parse(r) : (r || {});
      if (r.error) {
        var err = new Error(r.error); err.uiApi = true; err.denied = !!r.denied;
        if (r.detail) console.error(kind, payload && payload.fn, r.detail);
        if (r.reload) setTimeout(function () { location.reload(); }, 2500);
        throw err;
      }
      return r.result;
    });
  }
  function apiCall(quiet, fn, args) {
    return send('call', { fn: fn, args: args, quiet: quiet }).then(function (res) {
      if (res && typeof res === 'object' && res.ok === false) {
        var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
        throw err;
      }
      return res;
    });
  }
  UI.api = function (fn) { return apiCall(false, fn, Array.prototype.slice.call(arguments, 1)); };
  UI.apiQuiet = function (fn) { return apiCall(true, fn, Array.prototype.slice.call(arguments, 1)); };
  /* Errors nobody caught become a toast, so a failed action is never silent. */
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* Sign in / up / out. On success it navigates: to where the visitor was heading (UI.after) or home
     after signing in, to the landing page after signing out. */
  UI.auth = function (kind, payload) {
    return send(kind, payload || {}).then(function (r) {
      if (r && r.ok === false) { var err = new Error(r.error); err.uiApi = true; err.expected = true; throw err; }
      if (r && 'me' in r && (r.me || kind === 'logout')) {
        UI.me = r.me || null;
        var target = r.me ? (UI.after || '#' + UI.config.home) : '#' + UI.config.landing;
        UI.after = null;
        if (location.hash === target) route(); else location.hash = target;
      }
      return r;
    });
  };
  /* Update the signed-in user's details (e.g. a new name) and redraw the header, without reloading the page. */
  UI.setMe = function (me) {
    UI.me = me || null;
    if (shellRoot) renderChrome(current.name);
  };

  /* ------------------------------------------------------------------ pages and routing */
  UI.page = function (name, opts, mount) {
    if (typeof opts === 'function') { mount = opts; opts = {}; }
    opts.name = name; opts.mount = mount;
    UI.pages[name] = opts;
  };
  UI.allowed = function (p) {
    if (!p) return false;
    if (p.auth === 'user') return !!UI.me;
    if (p.auth === 'admin') return !!(UI.me && UI.me.is_admin);
    if (p.auth === 'guest') return !UI.me;
    return true;
  };
  UI.navPages = function () {
    return Object.keys(UI.pages).map(function (k) { return UI.pages[k]; })
      .filter(function (p) { return p.nav && UI.allowed(p) && (!p.when || p.when()); })
      .sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  };
  UI.parseHash = function () {
    var h = (location.hash || '').replace(/^#!?\/?/, '');
    var parts = h.split('?')[0].split('/').filter(function (x) { return x !== ''; }).map(decodeURIComponent);
    return { name: parts[0] || '', args: parts.slice(1) };
  };
  UI.hashFor = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    return '#' + [name].concat(args.map(encodeURIComponent)).join('/');
  };
  UI.go = function (name) {
    var h = UI.hashFor.apply(null, arguments);
    if (location.hash === h) route(); else location.hash = h;
  };
  UI.refresh = function () { route(); };
  UI.after = null;  // where to go after signing in

  var shellRoot = null, view = null, current = { name: null, destroy: null }, routeSeq = 0;

  function defaultPage() { return UI.me ? UI.config.home : UI.config.landing; }

  function route() {
    var r = UI.parseHash(), name = r.name || defaultPage(), p = UI.pages[name];
    if (!p) { name = defaultPage(); p = UI.pages[name]; r.args = []; }
    if (p.auth === 'guest' && UI.me) { p = UI.pages[UI.config.home]; name = UI.config.home; r.args = []; }
    if ((p.auth === 'user' || p.auth === 'admin') && !UI.me) {
      UI.after = location.hash && location.hash !== '#' ? location.hash : null;
      p = UI.pages.auth; name = 'auth'; r.args = [];
    }
    if (p.auth === 'admin' && !(UI.me && UI.me.is_admin)) {
      UI.toast('That page is for admins only.', 'error');
      p = UI.pages[UI.config.home]; name = UI.config.home; r.args = [];
    }
    var seq = ++routeSeq;
    window.UI_READY = false;
    if (current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
    current = { name: name, args: r.args, destroy: null };
    if (shellRoot) {
      shellRoot.className = 'ui ui-shell page-' + name + (UI.me ? ' signed-in' : ' signed-out') + (p.chrome === false ? ' no-chrome' : '');
      renderChrome(name);
    }
    // A fresh element for every page, so listeners a page adds to `view` never pile up.
    var fresh = view.cloneNode(false);
    view.parentNode.replaceChild(fresh, view);
    view = fresh;
    window.scrollTo(0, 0);
    document.title = (p.title ? (typeof p.title === 'function' ? p.title(r.args) : p.title) + ' · ' : '') + UI.config.name;
    var ctx = { name: name, args: r.args, me: UI.me, go: UI.go, api: UI.api, page: p };
    var out;
    try { out = p.mount(view, ctx); } catch (e) { console.error(e); out = Promise.reject(e); }
    var ready = out && typeof out.then === 'function' ? out : (out && out.ready) || Promise.resolve();
    if (out && out.destroy) current.destroy = out.destroy;
    Promise.resolve(ready).then(function () { if (seq === routeSeq) window.UI_READY = true; },
      function (e) {
        if (seq !== routeSeq) return;
        console.error(e);
        if (!view.innerHTML) view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('info') +
          '<h3>This page didn\'t load</h3><p class="muted">' + UI.esc(e && e.message || 'Something went wrong.') + '</p>' +
          '<button class="ui-btn" onclick="UI.refresh()">Try again</button></div></div>';
        window.UI_READY = true;
      });
  }
  UI.current = function () { return current; };

  /* The shell's parts come from web/app.js: UI.shell = {header(me, active), footer(me), tabbar(me, active)} */
  function renderChrome(active) {
    var S = UI.shell || {};
    var hd = shellRoot.querySelector('[data-ui-header]'), ft = shellRoot.querySelector('[data-ui-footer]'), tb = shellRoot.querySelector('[data-ui-tabbar]');
    if (hd) hd.innerHTML = S.header ? S.header(UI.me, active) : '';
    if (ft) ft.innerHTML = S.footer ? S.footer(UI.me, active) : '';
    if (tb) tb.innerHTML = S.tabbar ? S.tabbar(UI.me, active) : '';
  }
  UI.renderChrome = function () { if (shellRoot) renderChrome(current.name); };

  /* Called by client_code/Main.py (and by the local harness) once the page is up. */
  UI.start = function (node, bridgeFn, bootJson) {
    bridge = bridgeFn;
    var boot = typeof bootJson === 'string' ? JSON.parse(bootJson || '{}') : (bootJson || {});
    UI.me = boot.me || null;
    var host = node && node.matches && node.matches('[data-ui-app]') ? node : (node && node.querySelector('[data-ui-app]')) || node || document.body;
    host.innerHTML = '<div class="ui ui-shell">' +
      '<header class="ui-header" data-ui-header></header>' +
      '<main class="ui-main" data-ui-view></main>' +
      '<footer class="ui-footer" data-ui-footer></footer>' +
      '<nav class="ui-tabbar" data-ui-tabbar aria-label="Main"></nav></div>';
    shellRoot = host.firstChild;
    view = host.querySelector('[data-ui-view]');
    if (UI.shell && UI.shell.wire) UI.shell.wire(shellRoot);
    window.addEventListener('hashchange', route);
    route();
  };

  /* ------------------------------------------------------------------ feedback form (footer + menu) */
  UI.feedback = function (kind) {
    var kinds = [['bug', 'Something\'s broken', 'bug'], ['idea', 'An idea', 'bulb'], ['question', 'A question', 'info'], ['other', 'Something else', 'chat']];
    var m = UI.modal('<h2>Send feedback</h2><p class="muted">Found a bug or have an idea? It goes straight to the people who make ' + UI.esc(UI.config.name) + '.</p>' +
      '<form class="ui-stack" data-fb>' +
      '<div class="ui-choices">' + kinds.map(function (k) {
        return '<label class="ui-choice"><input type="radio" name="kind" value="' + k[0] + '"' + ((kind || 'bug') === k[0] ? ' checked' : '') + '>' +
          '<span>' + UI.icon(k[2]) + UI.esc(k[1]) + '</span></label>';
      }).join('') + '</div>' +
      '<label class="ui-field"><span>What happened, or what would you like?</span><textarea name="message" rows="5" required minlength="5" placeholder="The more detail, the better."></textarea></label>' +
      (UI.me ? '' : '<label class="ui-field"><span>Your email <em>(optional, if you\'d like a reply)</em></span><input type="email" name="email" autocomplete="email"></label>') +
      '<p class="ui-hint">We also send the page you were on, your screen size and browser, to help us fix bugs.</p>' +
      '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" type="submit">' + UI.icon('arrow') + 'Send</button></div></form>');
    var form = m.el.querySelector('[data-fb]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(form);
      var ctx = { page: location.hash || '#', screen: innerWidth + 'x' + innerHeight, browser: navigator.userAgent.slice(0, 280), theme: UI.theme() };
      UI.busy(form.querySelector('[type=submit]'), UI.api('submit_feedback', v.kind, v.message, v.email || null, ctx)).then(function () {
        m.close(); UI.toast('Thank you! Your message was sent.', 'ok');
      });
    });
    return m;
  };

  /* Shared clicks: [data-go="page/arg"], [data-feedback], [data-theme-set] anywhere in the app. */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go],[data-feedback],[data-theme-set]');
    if (!el) return;
    if (el.hasAttribute('data-go')) { e.preventDefault(); UI.go.apply(null, el.getAttribute('data-go').split('/')); }
    else if (el.hasAttribute('data-feedback')) { e.preventDefault(); UI.feedback(el.getAttribute('data-feedback') || null); }
    else if (el.hasAttribute('data-theme-set')) { e.preventDefault(); UI.setTheme(el.getAttribute('data-theme-set')); if (UI.shell && UI.shell.onTheme) UI.shell.onTheme(); }
  });
})();


/* app.js: this app's identity and frame: name, header, footer, phone tab bar.
   Pages live in web/pages/*.html. The engine (window.UI) is web/core.js. */
(function () {
  'use strict';
  UI.configure({
    name: 'Business Buddy',
    key: 'businessbuddy',          // prefix for this app's browser storage
    tagline: 'Your step-by-step guide to opening a small business in Montréal.',   // footer line
    home: 'home',                // first page after signing in
    landing: 'landing'           // first page for visitors who aren't signed in
  });

  var esc = UI.esc;
  // Detail pages light up their section in the menus: a guide under Guides, a topic under Basics, a plan under Home.
  var PARENT = { guide: 'library', topic: 'basics', glossary: 'basics', plan: 'home' };
  function isActive(name, active) { return name === active || PARENT[active] === name; }

  function brand() {
    return '<a class="ui-brand" href="#" data-go="' + (UI.me ? UI.config.home : UI.config.landing) + '" aria-label="' + esc(UI.config.name) + ' home">' +
      '<img src="_/theme/icon.svg" alt="" width="32" height="32"><span>' + esc(UI.config.name) + '</span></a>';
  }

  function themeSwitch() {
    var t = UI.theme();
    return '<div class="ui-seg" role="group" aria-label="Appearance">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
      return '<button type="button" data-theme-set="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function userMenu(me) {
    return '<div class="ui-menu" data-menu hidden>' +
      '<div class="ui-menu-head"><strong>' + esc(me.name) + '</strong><span class="muted small">' + esc(me.email) + '</span></div>' +
      '<a href="#profile" data-go="profile">' + UI.icon('user') + 'Your profile</a>' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<div class="ui-menu-block"><span class="small muted">Appearance</span>' + themeSwitch() + '</div>' +
      '<button type="button" data-feedback>' + UI.icon('chat') + 'Send feedback</button>' +
      '<button type="button" data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms</button>' +
      '<button type="button" data-signout>' + UI.icon('logout') + 'Sign out</button></div>';
  }

  UI.shell = {
    header: function (me, active) {
      var nav = UI.navPages();
      return '<div class="ui-header-in">' + brand() +
        '<nav class="ui-nav" aria-label="Main">' + nav.map(function (p) {
          return '<a href="#' + p.name + '" class="' + (isActive(p.name, active) ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
        }).join('') + '</nav>' +
        '<div class="ui-header-right">' +
        (me ? '<button type="button" class="ui-avatar-btn" data-menu-toggle aria-label="Your account" aria-haspopup="true">' + esc(UI.initials(me.name)) + '</button>' + userMenu(me)
          : (active === 'auth' ? '' : '<a class="ui-btn ghost" href="#auth" data-go="auth">Sign in</a><a class="ui-btn primary" href="#auth/signup" data-go="auth/signup">Get started</a>')) +
        '</div></div>';
    },
    footer: function (me) {
      return '<div class="ui-footer-in"><div class="ui-footer-brand">' + brand() + '<p class="muted small">' + esc(UI.config.tagline) + '</p></div>' +
        '<div class="ui-footer-links">' +
        '<a href="#library" data-go="library">Guides</a>' +
        '<a href="#basics" data-go="basics">Basics</a>' +
        '<a href="#glossary" data-go="glossary">Glossary</a>' +
        '<a href="#tools" data-go="tools">Tools</a>' +
        '<a href="#landing" data-go="landing">About</a>' +
        '<button type="button" data-feedback>Send feedback</button>' +
        '<button type="button" data-lk-open="overview">Privacy &amp; Terms</button>' +
        '</div><p class="ui-footer-legal small muted">© ' + new Date().getFullYear() + ' ' + esc(UI.config.name) + ' · Made in Montréal. General information, not legal or tax advice: always confirm with the official source.</p></div>';
    },
    tabbar: function (me, active) {
      var nav = UI.navPages();
      if (nav.length < 2 || active === 'auth') return '';
      return nav.slice(0, 4).map(function (p) {
        return '<a href="#' + p.name + '" class="' + (isActive(p.name, active) ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
      }).join('') + (me ? '<a href="#profile" class="' + (active === 'profile' ? 'on' : '') + '">' + UI.icon('user') + '<span>You</span></a>'
        : '<a href="#auth" data-go="auth">' + UI.icon('user') + '<span>Sign in</span></a>');
    },
    wire: function (root) {
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-menu-toggle]');
        var menu = root.querySelector('[data-menu]');
        if (t && menu) { menu.hidden = !menu.hidden; t.setAttribute('aria-expanded', String(!menu.hidden)); return; }
        if (e.target.closest('[data-signout]')) { UI.auth('logout').then(function () { UI.toast('Signed out. See you soon!'); }); }
        if (menu && !menu.hidden && !e.target.closest('[data-menu] .ui-seg')) menu.hidden = true;
      });
      document.addEventListener('keydown', function (e) {
        var menu = root.querySelector('[data-menu]');
        if (e.key === 'Escape' && menu) menu.hidden = true;
      });
    },
    onTheme: function () {  // redraw the menu's Auto/Light/Dark buttons and keep the menu open
      var menu = document.querySelector('[data-menu]'), open = menu && !menu.hidden;
      UI.renderChrome();
      if (open) document.querySelector('[data-menu]').hidden = false;
    }
  };
})();


/* ===== _kb_core.html ===== */
(function () {
  'use strict';
  var BB = window.BB = window.BB || {};
  BB.updated = 'October 2026';
  BB.guides = BB.guides || [];
  BB.topics = BB.topics || [];

  BB.categories = [
    { id: 'food', name: 'Food & drink', icon: 'cup', blurb: 'Bakeries, cafés, food trucks, home kitchens, catering' },
    { id: 'beauty', name: 'Beauty & wellness', icon: 'scissors', blurb: 'Barbers, salons, studios, massage, fitness' },
    { id: 'trades', name: 'Home & trades', icon: 'wrench', blurb: 'Cleaning, renovation, painting, moving, landscaping' },
    { id: 'care', name: 'Kids, pets & learning', icon: 'paw', blurb: 'Dog walking, grooming, home daycare, tutoring' },
    { id: 'retail', name: 'Shops', icon: 'bag', blurb: 'Dépanneur, florist, vintage, bike shop, online store' },
    { id: 'services', name: 'Services & creative', icon: 'camera', blurb: 'Photography, freelance studio, bookkeeping, auto' }
  ];

  /* The launch roadmap every plan follows. Guides add their own tasks to these phases. */
  BB.phases = [
    { id: 'idea', name: 'Test the idea', icon: 'bulb', blurb: 'Make sure people will pay before you spend.' },
    { id: 'legal', name: 'Make it official', icon: 'stamp', blurb: 'Structure, name, registrations, bank.' },
    { id: 'place', name: 'Find your place', icon: 'store', blurb: 'Zoning, lease, borough permits.' },
    { id: 'permits', name: 'Licences & rules', icon: 'shield', blurb: 'The permits your trade needs.' },
    { id: 'setup', name: 'Set up shop', icon: 'wrench', blurb: 'Insurance, equipment, payments, books.' },
    { id: 'launch', name: 'Open the doors', icon: 'sparkle', blurb: 'Be found, open, learn, adjust.' }
  ];

  /* Universal tasks. `when` (optional) = flags the business must have: premises, home, food, mobile.
     `hiring` = only when the plan says you'll hire. `topic` links the task to a Basics topic. */
  BB.tasks = [
    { id: 'idea.talk', phase: 'idea', t: 'Talk to 15–20 potential customers', d: 'Ask what they buy today, where, how often and for how much. Listen more than you pitch. Write down the exact words they use.', topic: 'validate-idea' },
    { id: 'idea.compete', phase: 'idea', t: 'Visit 5 competitors and note their prices', d: 'Go as a customer. Note prices, opening hours, how busy they are at different times, what reviews complain about.', topic: 'validate-idea' },
    { id: 'idea.plan', phase: 'idea', t: 'Write a one-page business plan', d: 'Who you serve, what you sell, your price, where, how people find you, what it costs, when you break even.', topic: 'validate-idea' },
    { id: 'idea.budget', phase: 'idea', t: 'Build your startup budget', d: 'Use the cost sheet in your plan: one-time costs plus 6 months of monthly costs, plus 15% for surprises.', topic: 'pricing' },
    { id: 'idea.coach', phase: 'idea', t: 'Book a free advisor at PME MTL', d: 'Free one-on-one coaching for anyone starting a business on the island. They also know every local grant.', topic: 'financing' },
    { id: 'idea.money', phase: 'idea', t: 'Line up your money (savings, loan, grants)', d: 'Futurpreneur (18–39), PME MTL funds, BDC, your bank, Desjardins, family. Apply early: decisions take weeks.', topic: 'financing' },

    { id: 'legal.structure', phase: 'legal', t: 'Choose: sole proprietorship or corporation', d: 'Most 1–2 person businesses start as a sole proprietorship (or a partnership) and incorporate once profits grow.', topic: 'structure' },
    { id: 'legal.partner', phase: 'legal', t: 'Two founders? Sign a partnership agreement', d: 'Who owns what, who does what, how you split profit, what happens if one leaves. Do it while you still agree on everything.', topic: 'partners' },
    { id: 'legal.name', phase: 'legal', t: 'Pick a name that works in French', d: 'A French generic word plus your specific name ("Boulangerie Pain Perdu"). Check the enterprise register and the trademark database.', topic: 'french-rules' },
    { id: 'legal.req', phase: 'legal', t: 'Register with the Registraire des entreprises', d: 'Required unless you work under your own first and last name. $41 for a sole proprietor; you get your NEQ number.', topic: 'register' },
    { id: 'legal.bank', phase: 'legal', t: 'Open a business bank account', d: 'Keep business money separate from day one. It makes bookkeeping, taxes and loans much easier.', topic: 'banking-books' },
    { id: 'legal.taxes', phase: 'legal', t: 'Decide on GST/QST registration', d: 'Mandatory once you pass $30,000 in sales over four quarters. Registering early lets you claim back the taxes on your setup costs.', topic: 'gst-qst' },

    { id: 'place.zoning', phase: 'place', when: ['premises', 'home'], t: 'Check that zoning allows your activity', d: 'Before signing anything: the borough permit counter (comptoir des permis) or 311 confirms whether your use is allowed at that address.', topic: 'occupancy-permit' },
    { id: 'place.lease', phase: 'place', when: ['premises'], t: 'Negotiate the lease (with a permit clause)', d: 'Make the lease conditional on getting your occupancy permit. Negotiate free-rent months for the build-out.', topic: 'commercial-lease' },
    { id: 'place.occupancy', phase: 'place', when: ['premises', 'home'], t: 'Get the certificat d\'occupation from your borough', d: 'Every commercial activity needs one, including a home office. It is issued by the borough where you operate.', topic: 'occupancy-permit' },
    { id: 'place.reno', phase: 'place', when: ['premises'], t: 'Get a renovation permit for your build-out', d: 'Interior changes and façade work need a permis de transformation. Never start work before you have it.', topic: 'signs-renovations' },
    { id: 'place.sign', phase: 'place', when: ['premises'], t: 'Get a sign permit (French first)', d: 'A permis d\'enseigne needs your occupancy permit first. French must be clearly predominant on the sign.', topic: 'signs-renovations' },

    { id: 'permits.bizpal', phase: 'permits', t: 'Run the BizPaL check for your activity', d: 'The government\'s free tool lists the federal, provincial and municipal permits for your activity and address.', topic: 'roadmap' },
    { id: 'food.training', phase: 'permits', when: ['food'], t: 'Take the food manager hygiene course (12 h)', d: 'The person in charge of hygiene needs the MAPAQ "gestionnaire d\'établissement alimentaire" certificate. Staff who handle food need the 6-hour handler course.', topic: 'food-permits' },
    { id: 'food.permit', phase: 'permits', when: ['food'], t: 'Apply for your MAPAQ food permit', d: 'Restaurant or retail permit, by mail. Allow 2–6 weeks. You can\'t sell a single item before it arrives, and it must be displayed.', topic: 'food-permits' },

    { id: 'setup.insurance', phase: 'setup', t: 'Get liability insurance', d: 'Civil liability at minimum; add property/contents if you have premises and professional liability if you give advice.', topic: 'insurance' },
    { id: 'setup.equipment', phase: 'setup', t: 'Buy or lease your equipment', d: 'Buy used where you can (restaurant auctions, Marketplace). Keep every receipt: it is deductible and claimable for taxes.' },
    { id: 'setup.pay', phase: 'setup', t: 'Set up payments and booking', d: 'Card terminal or tap-to-pay on your phone, plus online booking if you sell appointments. Compare fees: they add up.', topic: 'banking-books' },
    { id: 'setup.books', phase: 'setup', t: 'Set up bookkeeping and a tax savings account', d: 'An app or a spreadsheet from day one. Move 25–30% of profit to a separate savings account for taxes.', topic: 'banking-books' },
    { id: 'setup.privacy', phase: 'setup', t: 'Name your privacy person (Law 25)', d: 'If you collect any customer info (bookings, emails), publish who is responsible for personal information and how to reach them.', topic: 'privacy-law25' },
    { id: 'hire.register', phase: 'setup', hiring: true, t: 'Register as an employer', d: 'Revenu Québec (source deductions), the CRA (payroll account) and the CNESST (workplace insurance), before your first payday.', topic: 'hiring' },
    { id: 'hire.contract', phase: 'setup', hiring: true, t: 'Write a simple employment contract', d: 'Hours, pay (at least $16.60/h since May 2026), duties, trial period, vacation. In French, or bilingual if both agree.', topic: 'hiring' },

    { id: 'launch.google', phase: 'launch', t: 'Create your Google Business Profile', d: 'Most local customers find you on Google Maps. Add hours, photos, prices and ask your first customers for reviews.', topic: 'marketing-local' },
    { id: 'launch.social', phase: 'launch', t: 'Show your work on Instagram', d: 'Post the making-of, not just the result. Tag the neighbourhood. A good photo of your product beats any ad.', topic: 'marketing-local' },
    { id: 'launch.neighbours', phase: 'launch', when: ['premises'], t: 'Meet your neighbours and the local SDC', d: 'Commercial street associations (SDC) run events, sidewalk sales and promotions. Join them; say hello to the shops around you.', topic: 'marketing-local' },
    { id: 'launch.soft', phase: 'launch', t: 'Do a soft opening', d: 'A week with friends, family and neighbours before the big day: fix the problems while the stakes are low.' },
    { id: 'launch.review', phase: 'launch', t: 'After 90 days: compare reality to your plan', d: 'Sales, costs, hours worked, what people ask for. Adjust prices and hours. Celebrate what works.', topic: 'pricing' }
  ];

  /* Permits and registrations: used by the permit finder and by guides (guide.permits = [ids]). */
  BB.permits = {
    req: { name: 'Enterprise registration (NEQ)', fr: 'Immatriculation au Registraire des entreprises', who: 'Registraire des entreprises du Québec', cost: '$41 (sole proprietor), $397 to incorporate', when: 'Unless you use only your own first and last name', topic: 'register', url: 'https://www.quebec.ca/en/businesses-and-self-employed-workers/start-entreprise/register-constitute-enterprise' },
    gstqst: { name: 'GST and QST registration', fr: 'Inscription aux fichiers de la TPS et de la TVQ', who: 'Revenu Québec (for both taxes)', cost: 'Free', when: 'Mandatory above $30,000 of sales in four quarters; optional before', topic: 'gst-qst', url: 'https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/registering-for-the-gst-and-qst/' },
    occupancy: { name: 'Certificate of occupancy', fr: 'Certificat (permis) d\'occupation', who: 'Your borough (arrondissement)', cost: 'A few hundred dollars (varies by borough)', when: 'Any commercial activity at an address, home office included', topic: 'occupancy-permit', url: 'https://montreal.ca/en/how-to/get-occupancy-permit-commercial-industrial-or-professional-activity' },
    renovation: { name: 'Renovation permit', fr: 'Permis de transformation', who: 'Your borough', cost: 'Based on the value of the work', when: 'Interior changes, plumbing, façade work', topic: 'signs-renovations', url: 'https://montreal.ca/articles/renovations-combien-coute-un-permis-2715' },
    sign: { name: 'Commercial sign permit', fr: 'Permis d\'enseigne commerciale', who: 'Your borough', cost: 'From about $150–$240 per sign + per m²', when: 'Any sign on or in front of the building', topic: 'signs-renovations', url: 'https://montreal.ca/en/how-to/get-commercial-sign-permit' },
    terrace: { name: 'Café-terrace permit', fr: 'Permis de café-terrasse', who: 'Your borough', cost: 'Seasonal fee, by area', when: 'Tables outside on the sidewalk or street', topic: 'signs-renovations', url: 'https://montreal.ca/services/terrasse-commerciale-sur-le-domaine-public' },
    mapaqRestaurant: { name: 'MAPAQ restaurant permit', fr: 'Permis de restauration', who: 'MAPAQ, Service des permis', cost: '$367/yr (general preparation) or $283 (hot/cold holding) + $144 first-time file fee', when: 'You prepare meals, snacks or drinks to eat on site or take away (home kitchens too)', topic: 'food-permits', url: 'https://www.quebec.ca/entreprises-et-travailleurs-autonomes/industries/industrie-bioalimentaire/permis-alimentaires/permis-restauration-vente-detail' },
    mapaqRetail: { name: 'MAPAQ retail permit', fr: 'Permis de vente au détail', who: 'MAPAQ, Service des permis', cost: '$367/yr (general preparation) or $283 (holding) + $144 first-time file fee', when: 'You sell food products (not meals) directly to consumers', topic: 'food-permits', url: 'https://www.quebec.ca/entreprises-et-travailleurs-autonomes/industries/industrie-bioalimentaire/permis-alimentaires/permis-restauration-vente-detail' },
    foodTraining: { name: 'Food hygiene training', fr: 'Formation en hygiène et salubrité alimentaires', who: 'MAPAQ-recognized trainers', cost: 'About $100–$250 per course', when: 'Manager course (12 h) for the person in charge; handler course (6 h) for staff', topic: 'food-permits', url: 'https://www.quebec.ca/sante/alimentation/salubrite-aliments-prevention-risques/etablissements-alimentaires/hygiene-nettoyage/formation-obligatoire-hygiene-salubrite-alimentaires' },
    racj: { name: 'Alcohol permit', fr: 'Permis d\'alcool (RACJ)', who: 'Régie des alcools, des courses et des jeux', cost: 'Several hundred dollars a year, by category', when: 'Selling or serving alcohol, or letting customers bring their own wine', topic: 'food-permits', url: 'https://www.racj.gouv.qc.ca/' },
    rbq: { name: 'Contractor licence', fr: 'Licence d\'entrepreneur (RBQ)', who: 'Régie du bâtiment du Québec', cost: 'Exams + licence fees + a $20,000–$40,000 bond', when: 'Construction or renovation work for clients', topic: 'trades-licences', url: 'https://www.rbq.gouv.qc.ca/en/' },
    cmeq: { name: 'Electrical contractor licence', fr: 'Licence de la CMEQ (sous-catégorie 16)', who: 'Corporation des maîtres électriciens du Québec', cost: 'Exam + membership + licence fees', when: 'Electrical work for clients', topic: 'trades-licences', url: 'https://www.cmeq.org/' },
    cmmtq: { name: 'Plumbing/heating contractor licence', fr: 'Licence de la CMMTQ', who: 'Corporation des maîtres mécaniciens en tuyauterie du Québec', cost: 'Exam + membership + licence fees', when: 'Plumbing, heating, gas work for clients', topic: 'trades-licences', url: 'https://www.cmmtq.org/' },
    dogwalker: { name: 'Dog walker permit', fr: 'Permis de promeneur de chiens', who: 'Ville de Montréal (Bureau Accès Montréal)', cost: '$111.80 a year', when: 'Walking more than 3 dogs at a time (maximum 8)', topic: 'roadmap', url: 'https://montreal.ca/demarches/obtenir-ou-renouveler-un-permis-pour-promeneur-de-chiens' },
    animals15: { name: 'Permit for 15+ cats or dogs', fr: 'Permis MAPAQ — 15 chats ou chiens et plus', who: 'MAPAQ', cost: 'About $137 file + $129 permit (15–49 animals)', when: 'Boarding or keeping 15 or more cats or dogs', topic: 'roadmap', url: 'https://cdn-contenu.quebec.ca/cdn-contenu/adm/min/agriculture-pecheries-alimentation/sante-animale/obligations/permis-chats-chiens/FO_Formulaire_permis_chatschiens_ProprioGardien_MAPAQ.pdf' },
    daycare: { name: 'Home childcare recognition', fr: 'Reconnaissance par un bureau coordonnateur (RSG)', who: 'A bureau coordonnateur de la garde en milieu familial', cost: 'Free to apply; training and home requirements', when: 'Since Sept. 1, 2026: caring for more than 2 children at home (unless siblings)', topic: 'roadmap', url: 'https://www.quebec.ca/famille-et-soutien-aux-personnes/enfance/garderies-et-services-de-garde/reconnus-non-reconnus' },
    tobacco: { name: 'Tobacco retail permit', fr: 'Permis de vente de tabac (Revenu Québec)', who: 'Revenu Québec', cost: 'Free; QST registration mandatory', when: 'Selling tobacco (also forces REQ registration)', topic: 'register', url: 'https://www.revenuquebec.ca/en/businesses/consumption-taxes/tobacco-tax/' },
    itinerant: { name: 'Itinerant merchant permit', fr: 'Permis de commerçant itinérant (OPC)', who: 'Office de la protection du consommateur', cost: 'Permit fee + a security (bond)', when: 'You sign contracts with consumers at their home or door-to-door', topic: 'consumer-rules', url: 'https://www.opc.gouv.qc.ca/en/merchant/' },
    employer: { name: 'Employer registrations', fr: 'Inscription employeur: Revenu Québec, ARC, CNESST', who: 'Revenu Québec, CRA, CNESST', cost: 'Free (you pay contributions on payroll)', when: 'Before your first employee\'s first payday', topic: 'hiring', url: 'https://www.revenuquebec.ca/en/businesses/source-deductions-and-employer-contributions/' },
    heavyVehicle: { name: 'Heavy vehicle registration', fr: 'Inscription au RPEVL (CTQ)', who: 'Commission des transports du Québec', cost: 'Annual fee', when: 'Trucks of 4,500 kg or more used for business', topic: 'trades-licences', url: 'https://www.ctq.gouv.qc.ca/' },
    drone: { name: 'Drone pilot certificate', fr: 'Certificat de pilote de drone', who: 'Transport Canada', cost: '$10 (basic) online exam', when: 'Flying drones of 250 g to 25 kg', topic: 'roadmap', url: 'https://tc.canada.ca/en/aviation/drone-safety' },
    autoDecree: { name: 'Automotive decree (Montréal region)', fr: 'Décret — industrie des services automobiles', who: 'Comité paritaire (CPA Montréal)', cost: 'Monthly levy on payroll', when: 'Auto repair shops with employees in the Montréal region', topic: 'hiring', url: 'https://www.cpamontreal.ca/' }
  };

  /* French ⇄ English: the words you will meet at the counter. [french, english, what it means] */
  BB.glossary = [
    ['Arrondissement', 'Borough', 'Montréal has 19 boroughs. Most business permits (occupancy, signs, renovations, terraces) come from yours, and each has its own rules and fees.'],
    ['Comptoir des permis', 'Permit counter', 'Your borough\'s permit office. Go or call before signing a lease: they confirm zoning and list the documents you need.'],
    ['Certificat (permis) d\'occupation', 'Certificate of occupancy', 'The borough\'s permission to run your activity at an address. Needed for shops, studios and home offices alike.'],
    ['Zonage / usage', 'Zoning / use', 'What the zoning by-law allows at an address (commercial, residential, mixed). Your activity has to be an allowed use.'],
    ['Usage conditionnel', 'Conditional use', 'A use allowed only after a special approval (public notice, committee, council vote). Takes months.'],
    ['Usage complémentaire', 'Accessory use (home business)', 'A business activity allowed inside a home, under conditions (area, signs, clients, employees).'],
    ['Permis de transformation', 'Renovation permit', 'Needed before interior work, plumbing changes or façade work on business premises.'],
    ['PIIA', 'Site-planning and architectural integration plan', 'Extra design review for signs and façades in certain sectors. Adds time, sometimes a committee.'],
    ['Bail commercial', 'Commercial lease', 'Unlike home leases, commercial leases are barely regulated: almost everything is negotiable, and the Tribunal administratif du logement doesn\'t apply.'],
    ['Bail brut / bail net', 'Gross / net lease', 'Gross: rent includes taxes and building costs. Net (or triple net): you also pay a share of taxes, insurance and maintenance on top.'],
    ['Registraire des entreprises (REQ)', 'Enterprise Registrar', 'Québec\'s business register. You register here (immatriculation) and file a yearly update.'],
    ['NEQ', 'Québec enterprise number', 'Your 10-digit business ID in Québec, given when you register. Many forms ask for it.'],
    ['Immatriculation', 'Registration', 'Registering your business with the Registraire des entreprises.'],
    ['Déclaration de mise à jour annuelle', 'Annual update declaration', 'The yearly check-in with the Registraire, with a fee. Late filing means penalties and eventually being struck off.'],
    ['Entreprise individuelle', 'Sole proprietorship', 'You and the business are the same legal person. Simple and cheap, but you are personally liable.'],
    ['Société en nom collectif (SENC)', 'General partnership', 'Two or more people in business together without incorporating. Each partner is liable for the partnership\'s debts.'],
    ['Société par actions (inc.)', 'Corporation', 'A separate legal person that you own through shares. More paperwork; limits liability; taxed at corporate rates.'],
    ['Convention entre actionnaires', 'Shareholders\' agreement', 'The contract between co-owners of a corporation: decisions, exits, buy-outs, disputes.'],
    ['TPS / TVQ', 'GST / QST', 'Federal Goods and Services Tax (5%) and Québec Sales Tax (9.975%). In Québec, Revenu Québec administers both.'],
    ['Petit fournisseur', 'Small supplier', 'A business under $30,000 of taxable sales over four quarters: GST/QST registration is optional.'],
    ['Méthode rapide', 'Quick method', 'A simpler way for small businesses to calculate the GST/QST they remit, using a flat percentage of sales.'],
    ['Acomptes provisionnels', 'Tax instalments', 'Quarterly advance payments of income tax (March 15, June 15, Sept. 15, Dec. 15) once you owe more than $1,800.'],
    ['RRQ', 'Québec Pension Plan (QPP)', 'Pension contributions. Self-employed people pay both the employee and employer shares on their net income.'],
    ['RQAP', 'Québec Parental Insurance Plan (QPIP)', 'Parental benefits. Self-employed people contribute on their income and can receive benefits.'],
    ['Retenues à la source', 'Source deductions', 'The taxes and contributions an employer withholds from pay and sends to Revenu Québec and the CRA.'],
    ['CNESST', 'Labour standards, pay equity and workplace health & safety board', 'Sets the work rules (minimum wage, vacations) and runs workplace accident insurance employers pay into.'],
    ['Relevé 1 (RL-1)', 'RL-1 slip', 'Québec\'s yearly employment income slip (the T4\'s twin), due by the end of February.'],
    ['MAPAQ', 'Québec agriculture, fisheries and food ministry', 'Issues food permits and sets hygiene rules. On the island, city inspectors check restaurants and shops on its behalf.'],
    ['Gestionnaire d\'établissement alimentaire', 'Food establishment manager', 'The 12-hour hygiene certificate the person in charge of a food business must hold.'],
    ['Manipulateur d\'aliments', 'Food handler', 'The 6-hour hygiene course for staff who prepare food.'],
    ['RACJ', 'Alcohol, racing and gaming board', 'Issues alcohol permits: restaurant, bar, grocery, events.'],
    ['Apportez votre vin', 'Bring your own wine', 'Restaurants where customers bring their own wine. They still need an RACJ permit to serve it.'],
    ['RBQ', 'Building board', 'Licenses construction contractors. Renovating for clients without the right licence brings heavy fines.'],
    ['CCQ', 'Construction commission', 'Runs construction labour rules and competency cards, mostly for commercial, institutional and industrial jobs.'],
    ['OQLF', 'French-language office', 'Enforces the Charter of the French Language: signs, labels, websites, contracts, service in French.'],
    ['Charte de la langue française', 'Charter of the French Language', 'The law (strengthened by Bill 96) that makes French the normal language of business in Québec.'],
    ['OPC', 'Consumer protection office', 'Enforces the Consumer Protection Act and issues permits to itinerant merchants and some other trades.'],
    ['PME MTL', 'Montréal\'s small business network', 'Six hubs across the island giving free advice, training and loans/grants to new businesses.'],
    ['SDC', 'Commercial development company', 'The merchants\' association of a commercial street (e.g. SDC Wellington). Membership is usually automatic and paid through a levy.'],
    ['Bureau coordonnateur (BC)', 'Coordinating office', 'Recognizes and supervises home daycare providers (RSG) in an area.'],
    ['Travailleur autonome', 'Self-employed worker', 'Someone working for themselves rather than for an employer.'],
    ['Loi 25', 'Law 25 (privacy)', 'Québec\'s privacy law: every business must protect personal information and name a person responsible for it.']
  ];

  BB.sources = [
    ['Entreprises Québec: start a business', 'https://www.quebec.ca/en/businesses-and-self-employed-workers/start-entreprise'],
    ['Montréal: open a business', 'https://montreal.ca/articles/ouvrir-un-commerce-ou-lancer-une-entreprise-18507'],
    ['BizPaL: which permits do I need?', 'https://bizpal-perle.ca/'],
    ['Revenu Québec: starting a business', 'https://www.revenuquebec.ca/en/businesses/life-cycle/starting-a-business/'],
    ['PME MTL', 'https://pmemtl.com/en'],
    ['MAPAQ: food permits', 'https://www.quebec.ca/entreprises-et-travailleurs-autonomes/industries/industrie-bioalimentaire/permis-alimentaires']
  ];

  /* Small lookups */
  BB.guide = function (slug) { for (var i = 0; i < BB.guides.length; i++) if (BB.guides[i].slug === slug) return BB.guides[i]; return null; };
  BB.topic = function (slug) { for (var i = 0; i < BB.topics.length; i++) if (BB.topics[i].slug === slug) return BB.topics[i]; return null; };
  BB.category = function (id) { for (var i = 0; i < BB.categories.length; i++) if (BB.categories[i].id === id) return BB.categories[i]; return null; };
})();

/* ===== _kb_guides_1.html ===== */
(function () {
  'use strict';
  var G = function (o) { window.BB.guides.push(o); };

  /* ------------------------------------------------------------------ FOOD & DRINK */
  G({ slug: 'bakery', name: 'Bakery', fr: 'Boulangerie-pâtisserie', cat: 'food', icon: 'croissant',
    tagline: 'Bread, viennoiseries and cakes from a neighbourhood shop.',
    flags: ['premises', 'food'], glance: { cost: [60000, 180000], weeks: [16, 32], difficulty: 4, home: false },
    intro: `<p>A bakery is one of the most loved and most demanding small businesses: early mornings, expensive ovens and thin margins, rewarded by loyal daily customers. Montréal has a strong bread culture and a lot of competition, so a clear specialty (sourdough, viennoiseries, a cuisine you grew up with, gluten-free) matters more than a big menu.</p>`,
    permits: ['req', 'occupancy', 'renovation', 'sign', 'mapaqRetail', 'foodTraining', 'gstqst'],
    rules: [
      ['Which MAPAQ permit', `<p>Selling bread and pastries to take home is <b>retail with general preparation</b> ($367/yr + $144 the first time). If you add seating, coffee and sandwiches and they become more than half your activity, you'd be a <b>restaurant</b> instead. Selling wholesale to cafés or grocers may need a different permit and full labelling: ask MAPAQ first.</p>`],
      ['The premises', `<p>A bakery is a change of use for many shops: you'll need hand-washing and 3-compartment sinks, washable surfaces, ventilation for the ovens, enough electrical (often 3-phase for deck ovens) and sometimes a grease trap. Have a contractor check before you sign the lease.</p>`],
      ['Labels', `<p>Pre-packaged products need French labels with ingredients, allergens and a best-before date. Bread sold unwrapped from the counter doesn't, but allergen information must be available.</p>`]
    ],
    costs: [['Deck or convection oven (used–new)', 8000, 45000, 'once'], ['Mixer, sheeter, proofer', 6000, 30000, 'once'], ['Fridges, freezer, racks, tables', 5000, 18000, 'once'],
      ['Renovation, plumbing, ventilation', 20000, 70000, 'once'], ['Counter, display case, POS', 5000, 15000, 'once'], ['Permits, sign, legal', 2500, 6000, 'once'],
      ['Opening stock', 2000, 5000, 'once'], ['Rent (600–1,000 ft²)', 2000, 4000, 'monthly'], ['Ingredients and packaging', 3000, 9000, 'monthly'],
      ['Electricity and gas', 500, 1500, 'monthly'], ['Insurance', 150, 350, 'monthly']],
    money: `<p>Ingredients are usually <b>25–35% of the price</b> of bread and pastries; labour is the big cost. A croissant at $4 might cost $1.10 in ingredients. With about $9,000 of fixed costs a month (rent, energy, insurance, loan payments and a modest salary for you), you need about <b>$9,000 of margin</b> a month. If the average customer spends $10 and leaves you about $6.50 after ingredients, packaging and card fees, that's roughly 1,400 customers a month: <b>about 55 a day</b> over 26 opening days. Coffee raises the average ticket.</p>`,
    tips: ['Start with a short menu you can execute perfectly every morning, then add.', 'Bake to sell out: count what is left at closing and adjust tomorrow\'s quantities.', 'Pre-orders for weekends and holidays (bûches, king cakes, Easter) smooth your planning.'],
    pro: ['Test at a farmers\' market or a shared commercial kitchen before signing a lease.', 'Negotiate free-rent months for the build-out: bakery renovations take time.', 'Wholesale to 3–5 cafés can pay your rent, but check the MAPAQ permit and your margin first.', 'Track waste daily: unsold product is the silent margin killer. Day-old discounts or Too Good To Go help.'],
    pitfalls: ['Underestimating the electrical and ventilation work.', 'A menu too big for two people at 4 a.m.', 'Pricing by copying the neighbour without knowing your costs.'],
    tasks: [{ id: 'bakery.kitchen', phase: 'place', t: 'Have a contractor inspect the space for oven power and ventilation', d: 'Deck ovens often need 3-phase power; hoods need a path outside. Know the cost before signing.' },
      { id: 'bakery.recipes', phase: 'setup', t: 'Cost every recipe', d: 'Ingredient cost per unit, target 25–35% of the price.' },
      { id: 'bakery.labels', phase: 'setup', t: 'Prepare French labels for packaged products', d: 'Ingredients, allergens, best-before date.' }],
    links: [['MAPAQ: restaurant and retail permits', 'https://www.quebec.ca/entreprises-et-travailleurs-autonomes/industries/industrie-bioalimentaire/permis-alimentaires/permis-restauration-vente-detail']],
    topics: ['food-permits', 'commercial-lease', 'occupancy-permit', 'pricing'] });

  G({ slug: 'cafe', name: 'Coffee shop', fr: 'Café', cat: 'food', icon: 'cup',
    tagline: 'A neighbourhood café with good coffee and a few bites.',
    flags: ['premises', 'food'], glance: { cost: [50000, 150000], weeks: [14, 30], difficulty: 3, home: false },
    intro: `<p>Montréal drinks a lot of coffee and has a lively third-wave scene, from Mile End to Verdun. A café lives on <b>location, speed and atmosphere</b>: commuters and remote workers on weekdays, brunch crowds on weekends. Food is where the margin often hides.</p>`,
    permits: ['req', 'occupancy', 'renovation', 'sign', 'mapaqRestaurant', 'foodTraining', 'terrace', 'gstqst'],
    rules: [
      ['Permits', `<p>Making drinks and food to eat on site or take away is a <b>restaurant</b> activity for MAPAQ ($367/yr for general preparation, or $283 if you only reheat and keep food cold). Want a terrace? A seasonal borough permit. Want to serve beer or wine? An RACJ permit, after your occupancy certificate.</p>`],
      ['Seating and washrooms', `<p>Seating triggers building-code requirements (washrooms, exits, accessibility). A takeaway counter with 6 stools is far simpler than a 40-seat café. Ask the borough what your seat count implies.</p>`]
    ],
    costs: [['Espresso machine + grinders', 10000, 30000, 'once'], ['Fridges, dishwasher, small appliances', 6000, 15000, 'once'], ['Renovation and furniture', 15000, 60000, 'once'],
      ['POS, cups, opening stock', 3000, 8000, 'once'], ['Permits, sign, legal', 2000, 5000, 'once'], ['Rent', 2500, 5000, 'monthly'], ['Coffee, milk, food, cups', 3000, 8000, 'monthly'], ['Insurance and utilities', 400, 1000, 'monthly']],
    money: `<p>A latte at $5.50 costs about <b>$1.00–1.40</b> in coffee, milk and cup. Margin is high per drink but volume is everything: at $5 margin per customer, $8,000 of monthly fixed costs means about <b>55 customers a day</b>, 6 days a week. Food and retail bags of beans raise the average ticket. Laptop campers lower turnover: plan seating and Wi-Fi accordingly.</p>`,
    tips: ['Location beats décor: count morning foot traffic before signing.', 'Buy a commercial machine with a good service contract; downtime is lost income.', 'Partner with a local bakery for pastries instead of baking at the start.'],
    pro: ['Lease or rent-to-own the espresso machine through your roaster: some include training and maintenance.', 'A strong takeaway window can make a tiny space profitable.', 'Track drinks per hour at peak: speed is your capacity.', 'Summer terrace + cold drinks can be 30% of your year: apply for the terrace permit in winter.'],
    pitfalls: ['Too many seats for too little turnover.', 'Ignoring the slow mid-afternoon: plan products or events for it.', 'Opening hours that don\'t match the street\'s rhythm.'],
    tasks: [{ id: 'cafe.roaster', phase: 'setup', t: 'Choose a roaster and taste the menu with them', d: 'Many local roasters offer training and equipment deals to new cafés.' },
      { id: 'cafe.terrace', phase: 'place', t: 'Apply for the terrace permit (if wanted)', d: 'Seasonal borough permit; apply before spring.' }],
    links: [['Montréal: café-terraces', 'https://montreal.ca/services/terrasse-commerciale-sur-le-domaine-public']],
    topics: ['food-permits', 'commercial-lease', 'signs-renovations', 'marketing-local'] });

  G({ slug: 'food-truck', name: 'Food truck', fr: 'Camion de cuisine de rue', cat: 'food', icon: 'truck',
    tagline: 'Street food at events, markets and the few spots the city allows.',
    flags: ['food', 'mobile'], glance: { cost: [60000, 160000], weeks: [12, 28], difficulty: 4, home: false },
    intro: `<p>Montréal banned street food for decades and reopened it carefully. Today, trucks mostly earn their living at <b>festivals, events, private property and corporate catering</b>, plus a handful of designated public spots. A truck is a restaurant on wheels: you need the same food permit and usually a home-base kitchen.</p>`,
    permits: ['req', 'mapaqRestaurant', 'foodTraining', 'gstqst'],
    rules: [
      ['Where you can park and sell', `<p>Public-street vending is limited to designated sites, and the rules have changed over the years. In Ville-Marie, the downtown sites are handled through the <b>Association des restaurateurs de rue du Québec</b> rather than an open city application. Other boroughs differ, and some don't allow trucks at all. Most trucks build their calendar around <b>events and private property</b> (breweries, offices, markets) with the owner's permission. Check with each borough and event organizer.</p>`],
      ['Food permit and kitchen', `<p>The truck needs a MAPAQ <b>restaurant permit</b>. Plan for a base: a licensed commercial kitchen where you prep, store and clean, since the truck's own kitchen is small. Water tanks, grey-water handling and hand washing are inspected.</p>`],
      ['Vehicle', `<p>Commercial insurance, SAAQ registration, propane and fire-suppression inspections. A heavy truck (4,500 kg+) must be registered with the Commission des transports.</p>`]
    ],
    costs: [['Truck and kitchen build (used–new)', 45000, 130000, 'once'], ['Equipment and opening stock', 5000, 15000, 'once'], ['Branding and wrap', 3000, 8000, 'once'],
      ['Commissary kitchen rental', 600, 2000, 'monthly'], ['Fuel, propane, maintenance', 600, 1500, 'monthly'], ['Event fees (per event)', 150, 800, 'monthly'], ['Insurance', 250, 600, 'monthly']],
    money: `<p>Food cost around <b>28–35%</b>. Your season is roughly <b>May to October</b>, so the whole year's fixed costs must be covered in about 25 weeks. Events charge a flat fee or a percentage (10–25%). A good festival day can do $3,000–8,000; a rainy one, nothing.</p>`,
    tips: ['Build a short menu that can be served in under 3 minutes.', 'Get on the lists of event organizers and festival vendors early (winter).', 'Private catering (weddings, offices) fills weekdays and pays upfront.'],
    pro: ['Buy a used, already-inspected truck from Québec: retrofits to meet code are expensive.', 'Negotiate exclusivity at events (no other burger truck).', 'Keep a winter plan: catering, a pop-up, or meal kits from your commissary.'],
    pitfalls: ['Assuming you can park on any street.', 'Ignoring the off-season in the budget.', 'A menu that needs a full restaurant kitchen.'],
    tasks: [{ id: 'truck.commissary', phase: 'place', t: 'Rent a commissary (commercial) kitchen', d: 'Your prep, storage and cleaning base.' },
      { id: 'truck.events', phase: 'launch', t: 'Apply to 10 events and festivals', d: 'Applications for summer festivals often close in winter or early spring.' },
      { id: 'truck.sites', phase: 'permits', t: 'Check street-vending rules with each borough you want to work in', d: 'Designated sites, schedules and who manages them.' }],
    links: [['Association des restaurateurs de rue du Québec', 'https://www.arrq.ca/']],
    topics: ['food-permits', 'insurance', 'pricing'] });

  G({ slug: 'home-food', name: 'Home kitchen food business', fr: 'Cuisine à domicile', cat: 'food', icon: 'home',
    tagline: 'Meals, cakes or preserves made at home and sold directly to customers.',
    flags: ['home', 'food'], glance: { cost: [1500, 8000], weeks: [4, 10], difficulty: 2, home: true },
    intro: `<p>Since MAPAQ opened the door to <b>home-kitchen permits</b>, you can legally sell meals and baked goods made in your own kitchen, as long as you stay small and sell directly to customers. It's the cheapest way to test a food idea in Montréal.</p>`,
    permits: ['occupancy', 'mapaqRestaurant', 'foodTraining'],
    rules: [
      ['The home-kitchen conditions', `<ul><li>A MAPAQ <b>restaurant permit</b> ($367/yr + $144 the first time) for meals; a <b>retail</b> permit if you only portion products for resale.</li>
        <li>At most <b>100 kg of food a month</b>.</li><li>Sell <b>directly to consumers</b>: no grocery shelves, no wholesale.</li>
        <li>You hold the <b>food manager certificate</b> (12 h).</li><li>All hygiene rules apply: cold chain, clean surfaces, no pets in the kitchen while preparing.</li></ul>`],
      ['Your borough', `<p>The borough must allow the activity at your address (home occupancy rules). Customers picking up at your door may be limited. Delivery or market sales avoid most issues.</p>`]
    ],
    costs: [['Hygiene course', 100, 250, 'once'], ['MAPAQ permit + file fee', 511, 511, 'once'], ['Occupancy permit (borough)', 150, 500, 'once'], ['Extra fridge, thermometers, containers', 600, 3000, 'once'],
      ['Labels and packaging', 200, 800, 'once'], ['Ingredients and packaging', 300, 1500, 'monthly'], ['Insurance rider', 30, 80, 'monthly']],
    money: `<p>Your margin is great because you don't pay rent, but the 100 kg/month limit caps volume. 100 kg is about 250–300 meal portions or 150 cakes a month. Price for quality and convenience: pre-orders, weekly menus and subscriptions work well.</p>`,
    tips: ['Take orders ahead (weekly menu, order by Wednesday, deliver Saturday) to avoid waste.', 'Use a separate fridge for business food: it simplifies hygiene and inspections.', 'Weigh your monthly production to stay under 100 kg.'],
    pro: ['When demand outgrows 100 kg, rent hours in a shared commercial kitchen before taking a lease.', 'Markets and pop-ups are a direct-to-consumer channel that fits the rules.', 'Tell your home insurer: business food production is often excluded.'],
    pitfalls: ['Selling through a café or grocery shelf (not allowed under the home permit).', 'Skipping the permit because "it\'s just a few cakes": fines start at $5,000.'],
    tasks: [{ id: 'home.weigh', phase: 'setup', t: 'Set up a monthly production log (kg)', d: 'Proves you stay under 100 kg a month.' },
      { id: 'home.insurer', phase: 'setup', t: 'Tell your home insurer and add a business rider', d: 'Home policies often exclude business activity.' }],
    links: [['MAPAQ: restaurant and retail permits', 'https://www.quebec.ca/entreprises-et-travailleurs-autonomes/industries/industrie-bioalimentaire/permis-alimentaires/permis-restauration-vente-detail']],
    topics: ['food-permits', 'working-from-home', 'insurance'] });

  G({ slug: 'catering', name: 'Catering', fr: 'Service de traiteur', cat: 'food', icon: 'cup',
    tagline: 'Office lunches, private parties and weddings.',
    flags: ['food'], glance: { cost: [10000, 60000], weeks: [8, 20], difficulty: 3, home: false },
    intro: `<p>Catering avoids the biggest restaurant risk, the empty dining room: you cook to order and usually get a deposit. In Montréal the steady money is <b>corporate lunches and meetings</b>; weddings and parties bring big weekends in season.</p>`,
    permits: ['req', 'occupancy', 'mapaqRestaurant', 'foodTraining', 'racj', 'gstqst'],
    rules: [
      ['Where you cook', `<p>You need a kitchen covered by a MAPAQ <b>restaurant permit</b>. Most new caterers rent hours in a <b>shared commercial kitchen</b> (there are several in Montréal) before leasing their own. The home-kitchen permit's 100 kg/month limit is quickly too small.</p>`],
      ['Transport and serving', `<p>Hot food above 60 °C, cold below 4 °C, in insulated carriers, with thermometers. Serving alcohol at events needs an RACJ permit (or the venue's / client's permit).</p>`]
    ],
    costs: [['Shared kitchen deposit and setup', 1000, 5000, 'once'], ['Chafing dishes, carriers, serveware', 3000, 12000, 'once'], ['Vehicle (used van) or rental', 0, 30000, 'once'],
      ['Shared kitchen hours', 800, 3000, 'monthly'], ['Ingredients', 2000, 8000, 'monthly'], ['Insurance', 150, 400, 'monthly']],
    money: `<p>Food cost 28–35%, labour on top, plus delivery. Quote per person with a minimum. Take a <b>30–50% deposit</b> and the balance before the event.</p>`,
    tips: ['Start with a tight menu that travels well.', 'Corporate clients want reliability: on time, labelled allergens, invoices that are easy to pay.', 'Photograph every event setup for your portfolio.'],
    pro: ['Get listed on corporate catering platforms and with event planners.', 'Offer drop-off (cheaper) and full-service (more profitable) tiers.', 'A written contract with cancellation terms protects your deposits.'],
    pitfalls: ['Underpricing labour and delivery time.', 'No contract for weddings.'],
    tasks: [{ id: 'catering.kitchen', phase: 'place', t: 'Book a shared commercial kitchen', d: 'Visit two or three; compare hours, storage and price.' },
      { id: 'catering.contract', phase: 'setup', t: 'Write your event contract and deposit policy', d: 'Menu, guest count deadline, deposit, cancellation, allergies.' }],
    links: [['RACJ (alcohol)', 'https://www.racj.gouv.qc.ca/']],
    topics: ['food-permits', 'pricing', 'consumer-rules'] });

  /* ------------------------------------------------------------------ BEAUTY & WELLNESS */
  G({ slug: 'barber-shop', name: 'Barber shop', fr: 'Salon de barbier', cat: 'beauty', icon: 'scissors',
    tagline: 'Cuts, fades and beard trims, one or two chairs.',
    flags: ['premises'], glance: { cost: [15000, 60000], weeks: [8, 20], difficulty: 2, home: true },
    intro: `<p>A barber shop is one of the most accessible shop businesses: small space, modest equipment and customers who come back every 3 to 5 weeks. Your <b>skill and your chair-side manner</b> are the product, and a full booking calendar is the goal.</p>`,
    permits: ['req', 'occupancy', 'renovation', 'sign', 'gstqst'],
    rules: [
      ['No barber licence in Québec', `<p>Unlike Ontario, Québec has <b>no mandatory licence</b> for hairdressers or barbers. The old regional hairdressing decrees were all abolished (the last one in 2020). A DEP in hairdressing is valued by clients and employers but not required. You still need the usual business registrations and permits.</p>`],
      ['The space', `<p>Plan for a shampoo sink with hot water (plumbing permit), good lighting, ventilation, and a washroom. Hygiene: disinfect tools between clients, single-use blades, clean capes; public health can inspect after complaints.</p>`],
      ['Chair rental', `<p>Renting a chair in an existing shop (around $150–$400 a week in Montréal) is a cheap way to build clientele before opening your own.</p>`]
    ],
    costs: [['Barber chairs (2, used–new)', 1500, 6000, 'once'], ['Clippers, trimmers, tools, products', 1500, 4000, 'once'], ['Shampoo sink and plumbing', 2000, 8000, 'once'],
      ['Renovation, mirrors, lighting', 5000, 30000, 'once'], ['Sign + permits', 1000, 3000, 'once'], ['Rent (400–700 ft²)', 1200, 2800, 'monthly'], ['Booking app, products, laundry', 150, 400, 'monthly'], ['Insurance', 50, 150, 'monthly']],
    money: `<p>Montréal cuts run roughly <b>$30–$50</b>, fades and beard combos more. At 3 clients an hour and 6 hours of actual cutting a day, one chair can gross $3,000+ a week when booked. With $3,000 of monthly fixed costs (rent, insurance, booking app, a share of loan) you break even at about <b>80 cuts a month</b>. A second chair, rented to another barber, can cover your rent.</p>`,
    tips: ['Build a clientele in a rented chair first; open when your book is full.', 'Online booking with deposits cuts no-shows.', 'Instagram your best fades: barbering is a visual business.'],
    pro: ['Rent the second chair (fixed weekly rent or commission) instead of hiring: simpler and no payroll.', 'Sell products (pomade, beard oil) for extra margin.', 'Track rebooking rate: clients who leave with their next appointment come back.', 'Above $30,000 of sales you must charge GST/QST: build it into the price before you get there.'],
    pitfalls: ['Opening before you have clients.', 'Underestimating plumbing costs for the sink.', 'A sign in English only.'],
    tasks: [{ id: 'barber.chair', phase: 'idea', t: 'Rent a chair and build your book', d: 'Aim for a full schedule before signing a lease.' },
      { id: 'barber.booking', phase: 'setup', t: 'Set up online booking with deposits', d: 'And a cancellation policy.' }],
    links: [['Montréal: occupancy permit', 'https://montreal.ca/demarches/obtenir-un-permis-doccupation-pour-activite-commerciale-industrielle-ou-professionnelle']],
    topics: ['occupancy-permit', 'commercial-lease', 'french-rules', 'marketing-local'] });

  G({ slug: 'beauty-studio', name: 'Beauty studio (nails, lashes, esthetics)', fr: 'Studio d\'esthétique', cat: 'beauty', icon: 'sparkle',
    tagline: 'Nails, lashes, brows, facials and waxing.',
    flags: ['premises'], glance: { cost: [5000, 40000], weeks: [4, 16], difficulty: 2, home: true },
    intro: `<p>Beauty services are personal and repeat: nails every 2–3 weeks, lashes every 3, brows monthly. Many estheticians start <b>at home or in a rented room</b> in a salon, then open a studio once their schedule is full.</p>`,
    permits: ['req', 'occupancy', 'sign', 'gstqst'],
    rules: [
      ['Licences', `<p>Québec doesn't license estheticians, nail technicians or lash artists. Training (a DEP in esthetics or private courses) matters for skill, insurance and clients' trust. <b>Tanning salons</b> are the exception: they must register with the Registraire des entreprises whatever their name, and can't serve minors.</p>`],
      ['Hygiene', `<p>Follow public-health hygiene practices: disinfect or sterilize tools (an autoclave for metal tools), single-use files and buffers, good ventilation for acrylics and gels. Products must be Health Canada-compliant.</p>`],
      ['At home', `<p>Many boroughs allow a one-person studio at home under conditions. Check your borough and tell your insurer.</p>`]
    ],
    costs: [['Table, chair, lamp, tools', 1000, 5000, 'once'], ['Autoclave / sterilizer', 300, 2500, 'once'], ['Ventilation for nail dust', 300, 2000, 'once'], ['Products and stock', 800, 3000, 'once'],
      ['Studio renovation (if premises)', 0, 20000, 'once'], ['Rent or room rental', 0, 2000, 'monthly'], ['Products', 200, 800, 'monthly'], ['Insurance', 40, 120, 'monthly']],
    money: `<p>A gel manicure might sell $45–$65, lash extensions $120–$200 for a full set, refills less. Time per service is what limits income: price per hour, not per service.</p>`,
    tips: ['Specialize: being "the brow person" in your neighbourhood beats offering everything.', 'Book the next appointment before the client leaves.', 'Photos of your work, consistently lit, are your best ad.'],
    pro: ['Professional liability insurance covers reactions and injuries; get it before the first client.', 'Patch tests for lash and brow tint protect you and your client.', 'Memberships (monthly brows + lashes) smooth income.'],
    pitfalls: ['Pricing per service without counting time.', 'Skipping sterilization records.'],
    tasks: [{ id: 'beauty.sterile', phase: 'setup', t: 'Set up sterilization and a cleaning log', d: 'Autoclave or approved disinfection, single-use items.' }],
    links: [['Health Canada: cosmetics', 'https://www.canada.ca/en/health-canada/services/consumer-product-safety/cosmetics.html']],
    topics: ['working-from-home', 'insurance', 'marketing-local'] });

  G({ slug: 'tattoo-studio', name: 'Tattoo studio', fr: 'Salon de tatouage', cat: 'beauty', icon: 'needle',
    tagline: 'A private or walk-in studio for one or two artists.',
    flags: ['premises'], glance: { cost: [15000, 60000], weeks: [8, 20], difficulty: 3, home: false },
    intro: `<p>Tattooing runs on <b>reputation and portfolio</b>. Many artists start as guests or resident artists in an existing shop and open their own private studio once they have a waiting list.</p>`,
    permits: ['req', 'occupancy', 'renovation', 'sign', 'gstqst'],
    rules: [
      ['No specific licence, strict hygiene', `<p>Québec has no tattoo licence as of our research. You're expected to follow public-health hygiene guidelines: single-use needles and tubes, sterilization, barrier protection, a hand-washing sink in the work area, safe disposal of sharps (biomedical waste contract) and records for every client.</p>`],
      ['Consent and minors', `<p>Written informed consent, aftercare instructions and age verification. Most studios refuse minors or require a parent present; check current rules and your insurer's conditions.</p>`],
      ['Zoning', `<p>Some boroughs treat tattoo studios differently from other personal services. Confirm the use at your address before signing.</p>`]
    ],
    costs: [['Machines, power supplies, furniture', 3000, 10000, 'once'], ['Sinks, plumbing, washable surfaces', 3000, 15000, 'once'], ['Autoclave, sharps, PPE', 1000, 4000, 'once'],
      ['Renovation and décor', 5000, 25000, 'once'], ['Rent', 1500, 3500, 'monthly'], ['Supplies (needles, ink, film)', 300, 1000, 'monthly'], ['Biomedical waste pickup', 40, 120, 'monthly'], ['Insurance', 80, 250, 'monthly']],
    money: `<p>Montréal artists usually charge <b>$150–$250 an hour</b> or by piece, with deposits on booking. Guest artists pay the studio 30–50% of what they bill: a spare station can cover rent.</p>`,
    tips: ['Deposits at booking, non-refundable within 48 hours.', 'Your portfolio and Instagram are your storefront.', 'Keep consent forms and lot numbers of inks for every client.'],
    pro: ['Invite guest artists to fill the calendar and build cross-audiences.', 'Professional liability insurance specific to tattooing is a must.'],
    pitfalls: ['Treating hygiene paperwork as optional.', 'Opening a walk-in shop on a street with no foot traffic.'],
    tasks: [{ id: 'tattoo.waste', phase: 'setup', t: 'Sign a biomedical waste (sharps) pickup contract', d: 'Needles never go in regular trash.' },
      { id: 'tattoo.consent', phase: 'setup', t: 'Write consent, aftercare and age-check forms (in French)', d: 'Keep them on file for every client.' }],
    links: [['INSPQ (public health)', 'https://www.inspq.qc.ca/']],
    topics: ['occupancy-permit', 'insurance', 'privacy-law25'] });

  G({ slug: 'massage-therapy', name: 'Massage therapy practice', fr: 'Cabinet de massothérapie', cat: 'beauty', icon: 'hand',
    tagline: 'Therapeutic massage in a room, clinic or at home.',
    flags: ['premises'], glance: { cost: [3000, 25000], weeks: [3, 12], difficulty: 2, home: true },
    intro: `<p>Massage therapy is low-cost to start and in steady demand, largely because many group insurance plans reimburse it. The key to that market is issuing <b>receipts that insurers accept</b>.</p>`,
    permits: ['req', 'occupancy', 'gstqst'],
    rules: [
      ['No professional order (yet)', `<p>Massage therapy isn't a regulated profession in Québec, so anyone can practise. In practice, clients want insurance receipts, and insurers only accept receipts from members of recognized <b>associations</b> (such as the FQM and others), which require training hours (often several hundred to 1,000) and continuing education.</p>`],
      ['Taxes', `<p>Massage therapy is generally taxable for GST/QST. Under $30,000 you can stay a small supplier.</p>`]
    ],
    costs: [['Table, linens, oils', 600, 2500, 'once'], ['Association membership and training', 300, 1500, 'once'], ['Room setup (if premises)', 0, 15000, 'once'], ['Room rental in a clinic', 0, 1500, 'monthly'], ['Laundry and supplies', 50, 200, 'monthly'], ['Insurance', 30, 80, 'monthly']],
    money: `<p>A 60-minute massage typically sells <b>$85–$120</b> in Montréal. Your body is the limit: 5–6 massages a day is a heavy load. Price by the hour you can sustain, not the hours in a day.</p>`,
    tips: ['Join an association recognized by insurers before marketing.', 'Renting a room in a clinic (physio, chiro) brings referrals.', 'Online booking with intake forms saves time.'],
    pro: ['Health intake forms hold sensitive data: Law 25 applies; store them securely.', 'Corporate chair massage days fill quiet weekdays.'],
    pitfalls: ['Booking too many sessions and injuring yourself.', 'Receipts insurers refuse.'],
    tasks: [{ id: 'massage.assoc', phase: 'permits', t: 'Join a massage therapy association recognized by insurers', d: 'Check the training hours they require.' }],
    links: [['Fédération québécoise des massothérapeutes', 'https://www.fqm.qc.ca/']],
    topics: ['working-from-home', 'insurance', 'privacy-law25'] });

  G({ slug: 'personal-training', name: 'Personal training / small fitness studio', fr: 'Entraînement personnel', cat: 'beauty', icon: 'dumbbell',
    tagline: 'One-on-one coaching, small groups, outdoor classes.',
    flags: [], glance: { cost: [1000, 40000], weeks: [2, 16], difficulty: 2, home: true },
    intro: `<p>You can start with almost nothing: train clients in their home, in a park or in a gym that rents space to coaches, then open a small studio when your client base is solid.</p>`,
    permits: ['req', 'occupancy', 'gstqst'],
    rules: [
      ['Training and titles', `<p>Personal training isn't regulated, but a recognized certification (kinesiology degree, CSEP, NSCA, canfitpro…) matters for insurance and credibility. Kinesiologists have a federation that issues receipts some insurers accept.</p>`],
      ['Parks', `<p>Commercial group classes in Montréal parks generally need borough authorization. Ask the borough before posting your bootcamp.</p>`]
    ],
    costs: [['Equipment (portable)', 500, 3000, 'once'], ['Certification', 400, 2000, 'once'], ['Studio fit-out (optional)', 0, 30000, 'once'], ['Gym space rental', 0, 2500, 'monthly'], ['Insurance', 30, 100, 'monthly']],
    money: `<p>Private sessions often sell <b>$70–$110</b> an hour; small groups earn more per hour. Packages and monthly memberships beat pay-as-you-go.</p>`,
    tips: ['Sell packages of 10 sessions, paid upfront.', 'Health questionnaires before the first session.'],
    pro: ['Semi-private (2–4 people) multiplies your hourly income.', 'Online programs between sessions keep clients engaged.'],
    pitfalls: ['Selling single sessions only.', 'No liability insurance.'],
    tasks: [{ id: 'pt.parq', phase: 'setup', t: 'Prepare a health questionnaire and waiver (in French)', d: 'Store it securely (Law 25).' }],
    links: [],
    topics: ['insurance', 'pricing', 'privacy-law25'] });
})();

/* ===== _kb_guides_2.html ===== */
(function () {
  'use strict';
  var G = function (o) { window.BB.guides.push(o); };

  /* ------------------------------------------------------------------ HOME & TRADES */
  G({ slug: 'cleaning', name: 'Cleaning service', fr: 'Entretien ménager', cat: 'trades', icon: 'broom',
    tagline: 'Home cleaning, move-out cleans and small offices.',
    flags: ['home'], glance: { cost: [1000, 6000], weeks: [1, 4], difficulty: 1, home: true },
    intro: `<p>Cleaning is one of the fastest businesses to start: no premises, little equipment, steady recurring clients. Montréal's <b>July 1 moving day</b> creates a yearly rush of move-out cleans. Trust is everything: clients give you their keys.</p>`,
    permits: ['req', 'occupancy', 'gstqst', 'itinerant'],
    rules: [
      ['Home office permit', `<p>Your activity happens at clients' homes, but your business address is your home office: most boroughs expect an occupancy permit for it (simple for an office use).</p>`],
      ['Contracts with consumers', `<p>If you sell and sign contracts at the client's home, the Consumer Protection Act's <b>itinerant merchant</b> rules can apply (OPC permit, 10-day cancellation). Quoting and signing online or by phone keeps things simpler. Always give a written quote.</p>`],
      ['When you hire', `<p>Cleaning of commercial and public buildings in the Montréal region is covered by a <b>collective agreement decree</b> with its own wages and a joint committee. Residential cleaning for households is a different situation. Check which applies before you hire staff for office contracts.</p>`]
    ],
    costs: [['Vacuums, mops, microfiber, products', 400, 1500, 'once'], ['Logo, website, booking', 200, 1500, 'once'], ['Occupancy permit (home office)', 150, 500, 'once'], ['Supplies', 100, 400, 'monthly'], ['Car or transit costs', 100, 600, 'monthly'], ['Liability insurance + bond', 40, 120, 'monthly']],
    money: `<p>Montréal home cleaning often runs <b>$35–$55 an hour</b> or a flat price per visit. Recurring biweekly clients are the base: 20 regular clients at $140 a visit every two weeks is about $5,600 a month for one person. Travel time between clients is unpaid: group clients by neighbourhood.</p>`,
    tips: ['Group clients geographically to cut travel.', 'Offer recurring service at a better rate than one-offs.', 'Use a checklist per home: consistency is what clients pay for.'],
    pro: ['Liability insurance with "care, custody and control" covers broken items and lost keys.', 'Book move-out cleans for late June and early July months ahead at premium prices.', 'Eco-friendly products are a selling point in many neighbourhoods.'],
    pitfalls: ['Underpricing because you only count hours on site.', 'No written policy for cancellations and lockouts.'],
    tasks: [{ id: 'clean.checklist', phase: 'setup', t: 'Write a cleaning checklist per type of visit', d: 'Standard, deep, move-out. Share it with clients.' },
      { id: 'clean.july', phase: 'launch', t: 'Open move-out bookings for July 1 early', d: 'Advertise in May; price for the rush.' }],
    links: [['OPC: itinerant merchants', 'https://www.opc.gouv.qc.ca/en/merchant/']],
    topics: ['working-from-home', 'consumer-rules', 'insurance', 'hiring'] });

  G({ slug: 'handyman-renovation', name: 'Handyman & renovation', fr: 'Rénovation résidentielle', cat: 'trades', icon: 'hammer',
    tagline: 'Repairs, small renovations and finishing work in homes.',
    flags: ['home'], glance: { cost: [8000, 40000], weeks: [6, 20], difficulty: 4, home: true },
    intro: `<p>Montréal's old plexes keep renovators busy all year. But in Québec, almost any construction or renovation work for clients requires an <b>RBQ licence</b>, and doing it without one is costly. Plan the licence first.</p>`,
    permits: ['req', 'occupancy', 'rbq', 'gstqst', 'itinerant'],
    rules: [
      ['The RBQ licence', `<p>To do or organize renovation work for others, you need an RBQ contractor licence in the right subcategory (general, or specialized such as finishing, carpentry, flooring). You pass exams (or show equivalent training), post a <b>bond</b> ($20,000 specialized / $40,000 general) and pay fees. Some small jobs are exempt: RBQ publishes the list. Advertising renovation services without a licence is itself an offence.</p>`],
      ['Electrical and plumbing', `<p>Electrical and plumbing work need the CMEQ or CMMTQ licence and qualified tradespeople. A handyman can't legally replace a light fixture's wiring or move a drain without them.</p>`],
      ['Contracts', `<p>Renovation contracts with consumers signed at their home are itinerant-merchant contracts (OPC permit, 10-day cancellation). Written quotes with scope, price, payment schedule and warranty.</p>`]
    ],
    costs: [['RBQ exams, licence, bond', 1500, 4000, 'once'], ['Tools', 3000, 15000, 'once'], ['Used van or trailer', 0, 25000, 'once'], ['Vehicle costs', 400, 1200, 'monthly'], ['Liability insurance ($2M)', 100, 300, 'monthly'], ['Software (quotes, invoices)', 20, 80, 'monthly']],
    money: `<p>Labour rates in Montréal commonly run <b>$55–$90 an hour</b> depending on the trade; materials are billed with a markup (10–20%). Quote by job for well-defined work, by the hour for repairs. Deposits for materials are normal.</p>`,
    tips: ['Display your RBQ number on quotes, van and website: clients check.', 'Photograph before/after for your portfolio.', 'Written change orders for anything outside the quote.'],
    pro: ['Specialize (bathrooms, flooring, kitchens) to charge more and quote faster.', 'Partner with licensed electricians and plumbers you trust.', 'Construction holiday (last 2 weeks of July) and spring are booked months ahead.'],
    pitfalls: ['Working without the right subcategory.', 'Verbal agreements on scope.', 'Underestimating time on old Montréal plexes.'],
    tasks: [{ id: 'reno.rbq', phase: 'permits', t: 'Get your RBQ licence (right subcategory)', d: 'Exams or equivalence, bond, fees. Allow weeks to months.' },
      { id: 'reno.partners', phase: 'setup', t: 'Line up a licensed electrician and plumber', d: 'For the parts of jobs you can\'t legally do.' },
      { id: 'reno.contract', phase: 'setup', t: 'Prepare a written quote and contract template', d: 'Scope, price, schedule, deposit, warranty, change orders.' }],
    links: [['RBQ', 'https://www.rbq.gouv.qc.ca/en/'], ['RBQ: work not requiring a licence', 'https://www.rbq.gouv.qc.ca/en/licence/knowing-if-a-licence-is-required/work-not-requiring-a-licence/']],
    topics: ['trades-licences', 'consumer-rules', 'insurance'] });

  G({ slug: 'painting', name: 'Painting company', fr: 'Entreprise de peinture', cat: 'trades', icon: 'brush',
    tagline: 'Interior and exterior painting for homes and offices.',
    flags: ['home'], glance: { cost: [4000, 20000], weeks: [4, 14], difficulty: 3, home: true },
    intro: `<p>Painting has low equipment costs and huge demand around moving season. In Québec, painting for clients is generally considered construction finishing work: plan for an <b>RBQ licence</b> (specialized subcategory) unless your jobs fit the RBQ's small-work exemptions.</p>`,
    permits: ['req', 'occupancy', 'rbq', 'gstqst'],
    rules: [
      ['Licence', `<p>Check the RBQ's list of work that doesn't need a licence. Most painting contractors hold a specialized licence covering finishing work.</p>`],
      ['Old paint', `<p>Many Montréal homes built before 1980 may have lead paint. Sanding it is a health hazard: use safe removal practices and tell clients.</p>`]
    ],
    costs: [['RBQ licence and bond', 1500, 3500, 'once'], ['Ladders, sprayer, brushes, drop cloths', 1500, 6000, 'once'], ['Vehicle costs', 300, 900, 'monthly'], ['Insurance', 80, 200, 'monthly']],
    money: `<p>Quote by room or by square foot for interiors. Paint is billed at cost plus a markup. Two painters can do a typical room in a day.</p>`,
    tips: ['Book June and July early: everyone repaints between tenants.', 'A clean, protected work site wins referrals.'],
    pro: ['Commercial repaints (offices, shops) on nights and weekends pay premiums.', 'Offer colour consultations as an upsell.'],
    pitfalls: ['Painting for clients without checking the licence rules.', 'Not counting prep time.'],
    tasks: [{ id: 'paint.rbq', phase: 'permits', t: 'Confirm your RBQ licence needs', d: 'Check the exemptions list; get the specialized licence if required.' }],
    links: [['RBQ: work not requiring a licence', 'https://www.rbq.gouv.qc.ca/en/licence/knowing-if-a-licence-is-required/work-not-requiring-a-licence/']],
    topics: ['trades-licences', 'consumer-rules', 'pricing'] });

  G({ slug: 'landscaping-snow', name: 'Landscaping & snow removal', fr: 'Aménagement paysager et déneigement', cat: 'trades', icon: 'leaf',
    tagline: 'Lawns and gardens in summer, snow in winter: a year-round business.',
    flags: ['home'], glance: { cost: [5000, 60000], weeks: [3, 12], difficulty: 3, home: true },
    intro: `<p>Two seasons, one client list: lawn care and planting from April to November, snow removal from December to March. The <b>seasonal contract</b> paid upfront or in instalments is the engine.</p>`,
    permits: ['req', 'occupancy', 'gstqst', 'itinerant', 'heavyVehicle'],
    rules: [
      ['Pesticides', `<p>Montréal heavily restricts pesticide use, and applying pesticides commercially requires a Québec environment ministry permit and a certificate. Most residential landscapers go pesticide-free.</p>`],
      ['Snow and the street', `<p>You can't push private snow onto the street or sidewalk in Montréal; snow-removal contractors may need to register depending on the borough. Clearing on time before the city's plow passes matters.</p>`],
      ['Hardscaping', `<p>Retaining walls, paving stones and some structural landscaping can fall under RBQ licensing. Lawn and garden maintenance doesn't.</p>`]
    ],
    costs: [['Mowers, trimmers, tools', 2000, 8000, 'once'], ['Snow blower or plow', 2000, 40000, 'once'], ['Trailer or truck', 0, 30000, 'once'], ['Fuel and maintenance', 300, 1200, 'monthly'], ['Insurance', 100, 300, 'monthly']],
    money: `<p>Snow contracts in Montréal are sold per season (often a few hundred dollars per driveway) and paid in 2–3 instalments. Landscaping: weekly maintenance contracts plus one-off projects. Density matters: 30 clients on the same few streets beat 30 spread across the island.</p>`,
    tips: ['Sell snow contracts in September and October.', 'Written seasonal contracts with what\'s included (accumulation threshold, steps, salting).'],
    pro: ['Cross-sell: summer clients become winter clients.', 'Snowstorm days need a backup driver and machine.'],
    pitfalls: ['Too many clients for one machine during a big storm.', 'Pushing snow into the street.'],
    tasks: [{ id: 'snow.contracts', phase: 'launch', t: 'Sell seasonal snow contracts by October', d: 'Instalments, clear terms, a route map.' }],
    links: [],
    topics: ['consumer-rules', 'insurance', 'pricing'] });

  G({ slug: 'moving', name: 'Moving company', fr: 'Déménagement', cat: 'trades', icon: 'truck',
    tagline: 'Local moves with a truck and a strong back (or two).',
    flags: ['home'], glance: { cost: [5000, 60000], weeks: [3, 12], difficulty: 3, home: true },
    intro: `<p>Montréal's July 1 moving day makes moving a famously seasonal business: a few weeks of extreme demand and a quieter rest of the year. Reliability is what clients pay for.</p>`,
    permits: ['req', 'occupancy', 'gstqst', 'heavyVehicle', 'employer'],
    rules: [
      ['The truck', `<p>A truck of 4,500 kg or more (gross weight) used for business must be registered with the <b>Commission des transports du Québec</b>, with safety rules (inspections, logs). Smaller cube vans avoid much of this. The driver's licence class depends on the truck.</p>`],
      ['Parking', `<p>Reserving street space for a move can need a borough parking permit. Plan it for your clients.</p>`]
    ],
    costs: [['Truck (rental to start, or used)', 0, 50000, 'once'], ['Dollies, blankets, straps', 800, 2500, 'once'], ['Truck rental (per busy month)', 0, 4000, 'monthly'], ['Insurance (cargo + liability)', 150, 500, 'monthly']],
    money: `<p>Hourly rates for 2 movers and a truck commonly run <b>$120–$180/h</b> in Montréal, more around July 1. Minimum hours and travel fees are standard.</p>`,
    tips: ['Rent trucks the first season before buying.', 'Book July 1 months ahead with deposits.'],
    pro: ['Cargo insurance protects clients\' belongings: advertise it.', 'Off-season: office moves, deliveries for shops, junk removal.'],
    pitfalls: ['Paying helpers "cash as contractors" when they are employees.', 'No written estimate.'],
    tasks: [{ id: 'move.truck', phase: 'permits', t: 'Check if your truck needs CTQ registration', d: '4,500 kg+ for business use.' }],
    links: [['Commission des transports du Québec', 'https://www.ctq.gouv.qc.ca/']],
    topics: ['hiring', 'insurance', 'consumer-rules'] });

  G({ slug: 'electrician', name: 'Electrical contractor', fr: 'Entrepreneur électricien', cat: 'trades', icon: 'bolt',
    tagline: 'From journeyman to running your own electrical business.',
    flags: ['home'], glance: { cost: [10000, 50000], weeks: [8, 30], difficulty: 5, home: true },
    intro: `<p>Licensed electricians are in demand everywhere in Québec, with Hydro-Québec's electrification push (heat pumps, chargers) adding work. To work on your own account you need both your <b>competency certificate</b> and an <b>electrical contractor licence</b> through the CMEQ.</p>`,
    permits: ['req', 'occupancy', 'cmeq', 'gstqst'],
    rules: [
      ['The CMEQ licence', `<p>The Corporation des maîtres électriciens du Québec issues the subcategory 16 contractor licence. You need to pass the <b>master electrician exam</b>, have about <b>3 years of experience</b>, and meet the CMEQ's financial and membership requirements. Holding the exam alone doesn't let you sell services to the public.</p>`],
      ['Code', `<p>A new edition of Québec's electrical code came into force in March 2026: make sure your references are current.</p>`]
    ],
    costs: [['Exams, licence, membership', 2000, 5000, 'once'], ['Tools and testers', 3000, 10000, 'once'], ['Van and stock', 5000, 35000, 'once'], ['Vehicle costs', 400, 1200, 'monthly'], ['Insurance', 150, 400, 'monthly']],
    money: `<p>Contractors charge well above a journeyman wage per hour to cover travel, admin, insurance and unpaid quoting time. Materials with a markup.</p>`,
    tips: ['Heat pumps, EV chargers and panel upgrades are steady residential demand.', 'Keep a running relationship with renovators who need a licensed electrician.'],
    pro: ['Check the latest subsidies (Hydro-Québec, federal) your clients can claim: it sells jobs.'],
    pitfalls: ['Starting jobs before the licence is issued.'],
    tasks: [{ id: 'elec.cmeq', phase: 'permits', t: 'Pass the master electrician exam and apply to the CMEQ', d: 'Exam within 12 months of applying.' }],
    links: [['CMEQ', 'https://www.cmeq.org/']],
    topics: ['trades-licences', 'insurance', 'consumer-rules'] });

  /* ------------------------------------------------------------------ KIDS, PETS & LEARNING */
  G({ slug: 'dog-walking', name: 'Dog walking & pet sitting', fr: 'Promenade de chiens et garde d\'animaux', cat: 'care', icon: 'paw',
    tagline: 'Daily walks, drop-in visits and pet sitting.',
    flags: ['home'], glance: { cost: [300, 2500], weeks: [1, 4], difficulty: 1, home: true },
    intro: `<p>A great first business: almost no startup cost and recurring clients. Montréal has a specific rule you must know: <b>more than 3 dogs at a time needs a city permit</b>.</p>`,
    permits: ['dogwalker', 'gstqst', 'animals15'],
    rules: [
      ['The dog walker permit', `<p>Walking <b>more than 3 dogs at once</b> requires Montréal's dog walker permit (<b>$111.80</b> a year in 2026, applied for in person at a Bureau Accès Montréal), and you can never walk more than <b>8</b>. Carry the permit on walks. Every dog also needs its own city licence: ask clients for proof.</p>`],
      ['Boarding at home', `<p>Keeping many animals at home is limited by city by-laws (at home, generally up to 3 dogs or 4 dogs and cats combined), and keeping <b>15 or more cats or dogs</b> needs a MAPAQ permit. Overnight boarding of several dogs at home is often not allowed.</p>`]
    ],
    costs: [['Leashes, bags, treats, first aid', 100, 400, 'once'], ['Dog walker permit', 111.8, 111.8, 'once'], ['Pet first-aid course', 80, 200, 'once'], ['Insurance (care, custody)', 30, 90, 'monthly'], ['Phone and booking app', 0, 40, 'monthly']],
    money: `<p>Group walks of about an hour often sell <b>$20–$30 per dog</b>; solo walks more. Six dogs twice a day, 5 days a week, can gross $5,000+ a month. Your limit is how many dogs you can safely handle and route density.</p>`,
    tips: ['Meet-and-greet before accepting a dog; check vaccination and licence.', 'Routes by neighbourhood: keys and travel eat your time.', 'Send a photo after each walk: clients love it.'],
    pro: ['A written service agreement with emergency vet authorization.', 'Insurance that covers dogs in your care and dog bites.'],
    pitfalls: ['Walking 4+ dogs without the permit.', 'Mixing dogs that don\'t get along.'],
    tasks: [{ id: 'dog.permit', phase: 'permits', t: 'Get the Montréal dog walker permit', d: 'In person at a Bureau Accès Montréal; renew yearly.' },
      { id: 'dog.agreement', phase: 'setup', t: 'Write a client agreement with vet authorization', d: 'Keys, emergencies, cancellation, payment.' }],
    links: [['Montréal: dog walker permit', 'https://montreal.ca/demarches/obtenir-ou-renouveler-un-permis-pour-promeneur-de-chiens'], ['Montréal: dogs', 'https://montreal.ca/sujets/chiens']],
    topics: ['insurance', 'pricing', 'marketing-local'] });

  G({ slug: 'pet-grooming', name: 'Pet grooming', fr: 'Toilettage', cat: 'care', icon: 'paw',
    tagline: 'A grooming salon, a home studio or a mobile van.',
    flags: ['premises'], glance: { cost: [8000, 80000], weeks: [6, 20], difficulty: 3, home: true },
    intro: `<p>Grooming combines craft and patience, with clients returning every 6–8 weeks. You can start in a small salon, at home where allowed, or in a <b>mobile grooming van</b> that comes to the client.</p>`,
    permits: ['req', 'occupancy', 'renovation', 'sign', 'gstqst'],
    rules: [
      ['Licences', `<p>No specific licence for groomers in Québec, but the provincial animal welfare law and regulation apply: humane handling, safe drying, no animal left unattended in danger. Training through a grooming school builds skill and trust.</p>`],
      ['Premises', `<p>Tub with hot water and drainage (hair traps), ventilation, noise (barking), and a safe waiting area. Neighbours in mixed buildings may complain about noise.</p>`]
    ],
    costs: [['Tub, table, dryers, clippers', 3000, 10000, 'once'], ['Renovation and plumbing', 3000, 25000, 'once'], ['Mobile van (alternative)', 0, 80000, 'once'], ['Rent', 0, 2500, 'monthly'], ['Shampoos and supplies', 150, 500, 'monthly'], ['Insurance', 50, 150, 'monthly']],
    money: `<p>Prices depend on size and coat: roughly <b>$60–$150</b> per groom. 5–7 dogs a day is a full day for one groomer.</p>`,
    tips: ['Book the next groom at pickup.', 'Price by breed and coat condition; charge for matting.'],
    pro: ['Mobile grooming commands a premium and avoids rent, but the van is a big investment.'],
    pitfalls: ['Underestimating drying time and noise.'],
    tasks: [{ id: 'groom.plumbing', phase: 'place', t: 'Plan the tub plumbing and hair traps', d: 'A contractor quote before signing the lease.' }],
    links: [],
    topics: ['occupancy-permit', 'commercial-lease', 'insurance'] });

  G({ slug: 'home-daycare', name: 'Home daycare', fr: 'Service de garde en milieu familial', cat: 'care', icon: 'baby',
    tagline: 'Caring for young children in your home.',
    flags: ['home'], glance: { cost: [2000, 10000], weeks: [8, 24], difficulty: 3, home: true },
    intro: `<p>Québec has a chronic shortage of daycare spots, so home daycares are in demand. The rules changed on <b>September 1, 2026</b>: unrecognized home daycares are now limited to <b>2 children</b> (unless siblings), so most providers become <b>recognized</b> home daycare providers (RSG) through a coordinating office.</p>`,
    permits: ['daycare'],
    rules: [
      ['The 2026 change', `<p>Until August 31, 2026, a person could care for up to 6 children at home without recognition. Since <b>September 1, 2026</b>, anyone caring for <b>more than 2 children</b> at home (except children of the same family living together) must be <b>recognized by a bureau coordonnateur (BC)</b>.</p>`],
      ['Recognized providers (RSG)', `<p>A recognized provider can care for up to <b>6 children</b> alone (no more than 2 under 18 months), or up to <b>9</b> with an assistant (no more than 4 under 18 months). Recognition involves training, first aid, background checks for everyone in the home, home safety requirements and inspections. Many recognized spots are subsidized, which means families pay the reduced rate and you receive subsidies.</p>`],
      ['Taxes', `<p>Childcare services are generally exempt from GST/QST. As a recognized provider you're self-employed: keep good books and set aside income tax.</p>`]
    ],
    costs: [['Safety equipment (gates, locks, smoke detectors)', 500, 2000, 'once'], ['Furniture, toys, cots', 1000, 5000, 'once'], ['First aid and training', 150, 600, 'once'], ['Food and supplies', 400, 1200, 'monthly'], ['Insurance', 40, 120, 'monthly']],
    money: `<p>Recognized subsidized providers receive government subsidies per child plus the parent contribution. Non-subsidized recognized providers set their own fees, and parents claim the childcare tax credit. Contact your coordinating office for the current subsidy amounts.</p>`,
    tips: ['Contact the bureau coordonnateur for your area first: they explain the steps and timelines.', 'Write your internal rules (hours, illness policy, payments).'],
    pro: ['Waiting lists are long: a clear educational program sets you apart.', 'Home insurance must explicitly cover the daycare.'],
    pitfalls: ['Continuing with 3–6 children without recognition after Sept. 1, 2026.'],
    tasks: [{ id: 'daycare.bc', phase: 'permits', t: 'Contact your bureau coordonnateur and start recognition', d: 'Training, background checks, home inspection.' }],
    links: [['Québec: recognized and unrecognized childcare', 'https://www.quebec.ca/famille-et-soutien-aux-personnes/enfance/garderies-et-services-de-garde/reconnus-non-reconnus']],
    topics: ['working-from-home', 'insurance', 'income-tax'] });

  G({ slug: 'tutoring', name: 'Tutoring & lessons', fr: 'Tutorat et cours privés', cat: 'care', icon: 'book',
    tagline: 'School tutoring, music, languages, test prep.',
    flags: [], glance: { cost: [100, 3000], weeks: [1, 3], difficulty: 1, home: true },
    intro: `<p>Tutoring is the leanest business here: your knowledge, a schedule and some word of mouth. French and English language tutoring, math and science, and music lessons are in steady demand in Montréal.</p>`,
    permits: ['gstqst'],
    rules: [
      ['Licences', `<p>No licence is needed. Families often ask for a <b>police background check</b> when you work with minors: get one in advance.</p>`],
      ['Taxes', `<p>Some tutoring is GST/QST-exempt (for example, tutoring in a course leading to school credits), while other lessons are taxable. Under $30,000 it rarely matters; above, check the rules for your type of teaching.</p>`]
    ],
    costs: [['Materials and books', 50, 500, 'once'], ['Background check', 0, 100, 'once'], ['Website or tutoring platform fees', 0, 100, 'monthly']],
    money: `<p>Private tutoring often sells <b>$35–$70 an hour</b> depending on the subject and level; small groups earn more per hour. Packages paid in advance reduce cancellations.</p>`,
    tips: ['Sell monthly packages, not single sessions.', 'Exam periods (December, May–June) are peak demand.'],
    pro: ['Online sessions widen your market beyond your neighbourhood.', 'Small-group workshops for exam prep multiply income.'],
    pitfalls: ['No cancellation policy.'],
    tasks: [{ id: 'tutor.check', phase: 'permits', t: 'Get a police background check', d: 'Families of minors will ask.' }],
    links: [['Revenu Québec: GST/QST exempt supplies', 'https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/']],
    topics: ['pricing', 'gst-qst', 'privacy-law25'] });
})();

/* ===== _kb_guides_3.html ===== */
(function () {
  'use strict';
  var G = function (o) { window.BB.guides.push(o); };

  /* ------------------------------------------------------------------ SHOPS */
  G({ slug: 'depanneur', name: 'Dépanneur (convenience store)', fr: 'Dépanneur', cat: 'retail', icon: 'store',
    tagline: 'The corner store: snacks, beer, wine, lottery and essentials.',
    flags: ['premises', 'food'], glance: { cost: [40000, 200000], weeks: [8, 24], difficulty: 3, home: false },
    intro: `<p>The dépanneur is a Montréal institution. Most new owners <b>buy an existing store</b> rather than start from scratch, because the permits, supplier accounts and customer habits come with it. Margins are thin on most products; beer, wine, prepared food and services make the difference.</p>`,
    permits: ['req', 'occupancy', 'sign', 'mapaqRetail', 'foodTraining', 'racj', 'tobacco', 'gstqst'],
    rules: [
      ['Tobacco forces registration', `<p>Selling tobacco means you <b>must register</b> with the Registraire des entreprises (even under your own name), hold a <b>Revenu Québec</b> tobacco permit and be registered for <b>QST from the first dollar</b>. Vaping products have their own display and registration rules. Selling to minors brings heavy fines.</p>`],
      ['Beer and wine', `<p>Selling beer and wine needs an <b>RACJ grocery permit</b> (permis d'épicerie), which requires a real grocery offering. Permits don't automatically transfer when you buy a store: apply in your name.</p>`],
      ['Food', `<p>A MAPAQ <b>retail</b> permit covers selling food; preparing sandwiches or hot food raises the category. Lottery sales need a Loto-Québec retailer agreement.</p>`]
    ],
    costs: [['Purchase of an existing store (goodwill + stock)', 30000, 180000, 'once'], ['Shelving, fridges (if new)', 0, 40000, 'once'], ['Permits and legal (purchase)', 3000, 8000, 'once'], ['Rent', 2000, 5000, 'monthly'], ['Inventory replenishment', 15000, 40000, 'monthly'], ['Electricity (fridges)', 600, 1500, 'monthly'], ['Insurance', 150, 400, 'monthly']],
    money: `<p>Gross margins run from very low on tobacco and lottery (a few percent commission) to 25–40% on snacks, prepared food and household items. Long hours are the hidden cost: two people covering 7 days a week is hard. Ask to see <b>real sales records</b> (POS reports, tax returns) before buying a store.</p>`,
    tips: ['Buy with an accountant reviewing the books and a lawyer on the contract.', 'Plan the RACJ and tobacco permit transfers before the closing date.', 'Prepared food and local products differentiate you from the chains.'],
    pro: ['Negotiate a transition period with the seller (they stay 2–4 weeks).', 'Inventory count on closing day sets the stock price.', 'Theft and shrinkage: cameras and a good layout pay for themselves.'],
    pitfalls: ['Buying on the seller\'s word about sales.', 'Opening day without the tobacco or alcohol permit in your name.'],
    tasks: [{ id: 'dep.due', phase: 'idea', t: 'Get the store\'s real sales records and an accountant\'s review', d: 'POS reports, supplier invoices, tax returns.' },
      { id: 'dep.racj', phase: 'permits', t: 'Apply for the RACJ grocery permit in your name', d: 'Weeks of processing; plan for the closing date.' },
      { id: 'dep.tobacco', phase: 'permits', t: 'Get the Revenu Québec tobacco permit', d: 'Plus REQ registration and QST registration.' }],
    links: [['RACJ', 'https://www.racj.gouv.qc.ca/'], ['Revenu Québec: tobacco tax', 'https://www.revenuquebec.ca/en/businesses/consumption-taxes/tobacco-tax/']],
    topics: ['register', 'gst-qst', 'food-permits', 'commercial-lease'] });

  G({ slug: 'florist', name: 'Florist', fr: 'Fleuriste', cat: 'retail', icon: 'flower',
    tagline: 'Bouquets, plants, weddings and events.',
    flags: ['premises'], glance: { cost: [15000, 60000], weeks: [6, 18], difficulty: 3, home: true },
    intro: `<p>Flowers are perishable and seasonal: <b>Valentine's Day, Mother's Day</b> and wedding season can make the year. Many florists start with events and online orders from a studio before opening a storefront.</p>`,
    permits: ['req', 'occupancy', 'sign', 'gstqst'],
    rules: [
      ['Licences', `<p>No specific licence. Usual permits, plus a walk-in cooler (electrical) and good drainage.</p>`]
    ],
    costs: [['Walk-in cooler or flower fridge', 3000, 15000, 'once'], ['Shop fit-out', 5000, 30000, 'once'], ['Opening stock', 1500, 4000, 'once'], ['Rent', 1500, 3500, 'monthly'], ['Flowers (wholesale)', 2000, 8000, 'monthly'], ['Delivery', 200, 1000, 'monthly'], ['Insurance', 60, 150, 'monthly']],
    money: `<p>Flowers are commonly marked up <b>2.5 to 3.5 times</b> their wholesale cost to cover waste and labour. Weddings and corporate subscriptions (weekly arrangements for offices, restaurants) are steady income.</p>`,
    tips: ['Order for holidays early and pre-sell.', 'Track waste: unsold stems are a cost every week.'],
    pro: ['Subscriptions for restaurants and offices smooth the slow months.', 'Workshops (bouquet making) use slow evenings and build community.'],
    pitfalls: ['Too much perishable stock in a slow week.'],
    tasks: [{ id: 'flor.wholesale', phase: 'setup', t: 'Open accounts with flower wholesalers', d: 'Montréal has wholesale markets and importers; compare quality and delivery.' }],
    links: [],
    topics: ['commercial-lease', 'pricing', 'marketing-local'] });

  G({ slug: 'thrift-store', name: 'Vintage & second-hand shop', fr: 'Friperie', cat: 'retail', icon: 'bag',
    tagline: 'Curated vintage clothing, furniture or collectibles.',
    flags: ['premises'], glance: { cost: [8000, 40000], weeks: [4, 14], difficulty: 2, home: true },
    intro: `<p>Montréal has one of North America's liveliest vintage scenes. Curation is the product: what you choose to sell, and how you show it. Many start online or at markets and pop-ups.</p>`,
    permits: ['req', 'occupancy', 'sign', 'gstqst'],
    rules: [
      ['Second-hand dealers', `<p>Pawnshops and dealers in used goods can be subject to extra municipal rules (records of purchases, holding periods) to fight resale of stolen goods. A curated vintage shop buying from pickers and estate sales usually just needs the regular permits, but ask your borough what applies to second-hand trade.</p>`],
      ['Used children\'s products', `<p>Selling used cribs, car seats and children's products has Health Canada safety rules; some recalled items can't be sold at all.</p>`]
    ],
    costs: [['Initial inventory', 2000, 10000, 'once'], ['Racks, displays, fitting room', 1500, 8000, 'once'], ['Fit-out', 2000, 15000, 'once'], ['Rent', 1200, 3000, 'monthly'], ['Inventory buying', 800, 3000, 'monthly'], ['Insurance', 50, 120, 'monthly']],
    money: `<p>Buy at 20–30% of your selling price. Consignment (you pay the owner 40–60% when it sells) needs no upfront inventory money but more record-keeping.</p>`,
    tips: ['Sell online and in store; post new arrivals daily.', 'Price consistently and rotate stock.'],
    pro: ['Pop-ups at markets and festivals test new neighbourhoods.'],
    pitfalls: ['Buying more than you can sell.'],
    tasks: [{ id: 'thrift.rules', phase: 'permits', t: 'Ask the borough about second-hand trade rules', d: 'Records or holding periods may apply.' }],
    links: [['Health Canada: used children\'s products', 'https://www.canada.ca/en/health-canada/services/consumer-product-safety/advisories-warnings-recalls.html']],
    topics: ['occupancy-permit', 'consumer-rules', 'marketing-local'] });

  G({ slug: 'online-shop', name: 'Online shop', fr: 'Boutique en ligne', cat: 'retail', icon: 'laptop',
    tagline: 'Selling your products through Etsy, Shopify or your own site.',
    flags: ['home'], glance: { cost: [500, 10000], weeks: [2, 8], difficulty: 2, home: true },
    intro: `<p>An online shop lets you test a product with very little money: make or source it, photograph it well, and sell across Canada. Québec has specific rules for <b>distance contracts</b> and <b>French</b> that most generic e-commerce guides skip.</p>`,
    permits: ['req', 'occupancy', 'gstqst'],
    rules: [
      ['French website', `<p>A business established in Québec must offer its website and product information in French (English can be added).</p>`],
      ['Distance contract rules', `<p>Before the order: a clear description, the total price with fees, delivery and return terms, your contact details. After: send the contract (order confirmation) within 15 days. Customers can cancel if you don't deliver within 30 days of the date promised.</p>`],
      ['Taxes', `<p>Above $30,000 you must charge GST/QST, and when shipping to other provinces, the HST or GST rate of the customer's province. Platforms like Etsy may collect some taxes for you; read their tax settings.</p>`],
      ['Food and cosmetics', `<p>Food sold online still needs a MAPAQ permit. Cosmetics (soaps, creams) must be notified to Health Canada and labelled bilingually.</p>`]
    ],
    costs: [['Product samples and stock', 300, 5000, 'once'], ['Photography setup', 100, 1000, 'once'], ['Website and theme', 0, 2000, 'once'], ['Platform fees and apps', 30, 200, 'monthly'], ['Packaging and shipping supplies', 100, 600, 'monthly']],
    money: `<p>Platform and payment fees typically take 5–15% of each sale; shipping is often your biggest cost. Price to cover product + packaging + fees + shipping subsidy + your time.</p>`,
    tips: ['Great photos and honest descriptions sell more than ads.', 'Compare Canada Post small business rates and courier aggregators.'],
    pro: ['Your own Shopify site plus Etsy reaches two audiences.', 'Email list (with consent) is your most valuable asset.', 'Law 25: publish a privacy policy and name the person in charge.'],
    pitfalls: ['Free shipping that eats the margin.', 'English-only site.'],
    tasks: [{ id: 'shop.terms', phase: 'setup', t: 'Write shipping, returns and privacy pages (French first)', d: 'Required information for distance contracts and Law 25.' },
      { id: 'shop.shipping', phase: 'setup', t: 'Open a Canada Post small business account', d: 'Discounts start from the first parcel.' }],
    links: [['OPC: online purchases', 'https://www.opc.gouv.qc.ca/en/merchant/'], ['Health Canada: cosmetic notification', 'https://www.canada.ca/en/health-canada/services/consumer-product-safety/cosmetics.html']],
    topics: ['consumer-rules', 'privacy-law25', 'french-rules', 'gst-qst'] });

  G({ slug: 'bike-repair', name: 'Bike repair shop', fr: 'Atelier de réparation de vélos', cat: 'retail', icon: 'bike',
    tagline: 'Tune-ups, repairs and parts for a city that loves cycling.',
    flags: ['premises'], glance: { cost: [10000, 50000], weeks: [6, 16], difficulty: 2, home: true },
    intro: `<p>Montréal's bike network keeps growing, and so does demand for repairs. The season is intense (April to October); winter is for overhauls, e-bike service and planning.</p>`,
    permits: ['req', 'occupancy', 'sign', 'gstqst'],
    rules: [
      ['Licences', `<p>No specific licence. E-bike batteries need safe storage and charging (fire risk); ask your insurer.</p>`]
    ],
    costs: [['Stands, tools, truing stand', 3000, 10000, 'once'], ['Parts inventory', 3000, 15000, 'once'], ['Shop fit-out', 2000, 15000, 'once'], ['Rent', 1200, 3000, 'monthly'], ['Parts replenishment', 1000, 4000, 'monthly'], ['Insurance', 60, 150, 'monthly']],
    money: `<p>Tune-ups often sell $70–$150 plus parts; parts carry a 30–50% markup. Spring is a rush: offer pre-season booking in March.</p>`,
    tips: ['Winter storage + overhaul packages fill the off-season.', 'Mobile repair (a cargo bike with tools) can start before a shop.'],
    pro: ['E-bike service and certified brands are growing fast.', 'Partner with cycling clubs and offices.'],
    pitfalls: ['Too much parts inventory in slow months.'],
    tasks: [{ id: 'bike.winter', phase: 'launch', t: 'Design a winter overhaul and storage offer', d: 'Keeps income flowing from November to March.' }],
    links: [],
    topics: ['commercial-lease', 'pricing', 'insurance'] });

  /* ------------------------------------------------------------------ SERVICES & CREATIVE */
  G({ slug: 'photography', name: 'Photography', fr: 'Photographie', cat: 'services', icon: 'camera',
    tagline: 'Weddings, portraits, products, real estate and events.',
    flags: ['home'], glance: { cost: [3000, 20000], weeks: [1, 6], difficulty: 2, home: true },
    intro: `<p>Photography is easy to start and hard to stand out in. A <b>niche</b> (weddings, food, real estate, corporate headshots) and a strong portfolio make the difference. Québec has strict image rights you must respect.</p>`,
    permits: ['req', 'occupancy', 'gstqst', 'drone'],
    rules: [
      ['Image rights in Québec', `<p>Québec's Civil Code protects a person's right to their image: <b>publishing</b> a photo of an identifiable person generally needs their consent, even if taken in public (with exceptions such as newsworthy events). Use model releases for anything you post or sell.</p>`],
      ['Drones', `<p>Flying a drone of 250 g to 25 kg needs a <b>Transport Canada pilot certificate</b> (basic or advanced) and a registered drone. Many urban areas of Montréal need the advanced certificate (near airports and people).</p>`],
      ['Contracts', `<p>A written contract with deliverables, delivery time, usage rights (licence) and deposit. Copyright stays with you unless you transfer it.</p>`]
    ],
    costs: [['Camera bodies and lenses', 2000, 12000, 'once'], ['Lighting and accessories', 300, 3000, 'once'], ['Editing software and storage', 30, 80, 'monthly'], ['Website/portfolio', 15, 50, 'monthly'], ['Equipment insurance', 30, 100, 'monthly']],
    money: `<p>Weddings in Montréal range widely ($2,000–$6,000+); portrait and headshot sessions $150–$500; commercial work by day rate. Editing time often equals shooting time: price both.</p>`,
    tips: ['Pick a niche and build a portfolio that shows only that.', 'Back up every shoot in two places before formatting cards.'],
    pro: ['Licence images to businesses (usage terms) rather than selling copyright.', 'Real-estate photography with drone and floor plans is steady weekday work.'],
    pitfalls: ['Posting client photos without consent.', 'No backup.'],
    tasks: [{ id: 'photo.release', phase: 'setup', t: 'Prepare a contract and model release (French and English)', d: 'Deliverables, usage rights, deposit, consent to publish.' }],
    links: [['Transport Canada: drone safety', 'https://tc.canada.ca/en/aviation/drone-safety']],
    topics: ['consumer-rules', 'privacy-law25', 'insurance'] });

  G({ slug: 'freelance-studio', name: 'Freelance studio (design, web, translation)', fr: 'Travailleur autonome en services', cat: 'services', icon: 'laptop',
    tagline: 'Selling your skills to businesses from a home office.',
    flags: ['home'], glance: { cost: [500, 5000], weeks: [1, 3], difficulty: 1, home: true },
    intro: `<p>Designers, developers, translators, writers and consultants can start a business in a day. The work is in <b>finding clients, pricing well and staying organized</b> about taxes.</p>`,
    permits: ['req', 'occupancy', 'gstqst'],
    rules: [
      ['Titles', `<p>Some titles are reserved in Québec: you can translate without being a certified translator (OTTIAQ), but you can't call yourself "traducteur agréé"; similarly engineer, architect, accountant (CPA). Check before you print business cards.</p>`],
      ['Contracts with businesses', `<p>Business clients aren't protected by the Consumer Protection Act, so your contract matters: scope, revisions, payment terms (net 30), late fees, intellectual property transfer on full payment.</p>`]
    ],
    costs: [['Computer and software', 0, 4000, 'once'], ['Software subscriptions', 30, 200, 'monthly'], ['Professional liability insurance', 30, 120, 'monthly'], ['Co-working (optional)', 0, 400, 'monthly']],
    money: `<p>Use the hourly rate calculator: target income ÷ billable hours (often 60% of worked hours), plus expenses and taxes. Business clients often prefer GST/QST-registered suppliers since they claim the taxes back.</p>`,
    tips: ['Deposit before starting, especially with new clients.', 'Send invoices the day work is delivered.'],
    pro: ['Retainers (monthly packages) beat one-off projects.', 'Registering for GST/QST early can make sense when your clients are businesses.'],
    pitfalls: ['Scope creep without a change order.', 'Forgetting instalments in year two.'],
    tasks: [{ id: 'free.contract', phase: 'setup', t: 'Write your service contract template', d: 'Scope, revisions, payment terms, IP, late fees.' }],
    links: [['Revenu Québec: self-employed', 'https://www.revenuquebec.ca/en/citizens/self-employed-people/information-for-the-self-employed/']],
    topics: ['income-tax', 'gst-qst', 'pricing', 'working-from-home'] });

  G({ slug: 'bookkeeping', name: 'Bookkeeping & tax preparation', fr: 'Tenue de livres et déclarations', cat: 'services', icon: 'receipt',
    tagline: 'Keeping the books for small businesses and families.',
    flags: ['home'], glance: { cost: [1000, 6000], weeks: [1, 4], difficulty: 2, home: true },
    intro: `<p>Every small business needs a bookkeeper, and tax season brings a wave of individual returns. You don't need to be a CPA to keep books or prepare returns, but you can't use the CPA title or sign audits.</p>`,
    permits: ['req', 'occupancy', 'gstqst'],
    rules: [
      ['Titles and limits', `<p>"Comptable professionnel agréé (CPA)" is reserved for members of the Ordre des CPA. Audits and review engagements are CPA-only. Bookkeeping, payroll and tax preparation are open.</p>`],
      ['Filing for others', `<p>Paid tax preparers file electronically through the CRA's EFILE and Revenu Québec's programs, which require registration. Clients sign authorization forms for you to represent them.</p>`],
      ['Confidentiality', `<p>You hold very sensitive data (SINs, income): Law 25 applies fully. Secure storage, encrypted sharing, a privacy policy.</p>`]
    ],
    costs: [['Accounting and tax software', 300, 2500, 'once'], ['Software subscriptions', 50, 300, 'monthly'], ['Professional liability (E&O)', 50, 150, 'monthly']],
    money: `<p>Monthly bookkeeping for a small business often sells $150–$600 a month; personal tax returns $80–$250 each. Recurring monthly clients beat seasonal rush income.</p>`,
    tips: ['Monthly packages with clear scope.', 'A secure client portal instead of email attachments.'],
    pro: ['Specialize in one industry (restaurants, trades) to work faster.', 'E&O insurance protects you from costly mistakes.'],
    pitfalls: ['Sending SINs by email.', 'Unlimited "quick questions" not in the price.'],
    tasks: [{ id: 'books.efile', phase: 'permits', t: 'Register for CRA EFILE and Revenu Québec e-filing', d: 'Needed to file returns for clients.' }],
    links: [['CRA: EFILE for service providers', 'https://www.canada.ca/en/revenue-agency/services/e-services/e-services-businesses/efile-electronic-filers.html']],
    topics: ['privacy-law25', 'insurance', 'income-tax'] });

  G({ slug: 'auto-repair', name: 'Auto repair & detailing', fr: 'Mécanique et esthétique automobile', cat: 'services', icon: 'car',
    tagline: 'A small garage, mobile mechanic or detailing service.',
    flags: ['premises'], glance: { cost: [10000, 120000], weeks: [6, 24], difficulty: 4, home: false },
    intro: `<p>Mechanics and detailers can start mobile (at clients' homes or workplaces) and grow into a bay. In the Montréal region, auto repair employers are covered by a specific <b>collective agreement decree</b>.</p>`,
    permits: ['req', 'occupancy', 'renovation', 'sign', 'gstqst', 'autoDecree'],
    rules: [
      ['The automotive decree', `<p>Auto service businesses in the Montréal region with employees fall under the <b>Décret sur l'industrie des services automobiles de la région de Montréal</b>, administered by a joint committee (CPA Montréal): minimum wages by trade, registers, monthly reports and a levy. Check your obligations before hiring.</p>`],
      ['Environment', `<p>Used oil, filters, antifreeze and batteries must go to authorized recyclers. Floor drains may need oil separators. Zoning for garages is restricted: confirm the address early.</p>`],
      ['Consumer rules', `<p>Québec's Consumer Protection Act requires a <b>written estimate</b> before repairs over a small amount (unless the client waives it in writing), and a warranty on repairs (3 months or 5,000 km).</p>`]
    ],
    costs: [['Lift, compressor, tools, scanner', 10000, 60000, 'once'], ['Garage fit-out and drains', 5000, 40000, 'once'], ['Mobile van setup (alternative)', 0, 25000, 'once'], ['Rent', 2000, 5000, 'monthly'], ['Waste recycling', 50, 200, 'monthly'], ['Garage insurance', 200, 600, 'monthly']],
    money: `<p>Shop rates in Montréal commonly run $100–$150 an hour; parts with a markup. Detailing packages from $100 to $400.</p>`,
    tips: ['Written estimates, every time.', 'Seasonal tire changes (mandatory winter tires Dec. 1 to March 15) bring a rush twice a year.'],
    pro: ['Tire storage is steady recurring income.', 'A mobile detailing van avoids garage zoning at first.'],
    pitfalls: ['Hiring without checking the decree.', 'A garage address that zoning doesn\'t allow.'],
    tasks: [{ id: 'auto.decree', phase: 'permits', t: 'Check your obligations with CPA Montréal before hiring', d: 'Registers, wages and levy under the automotive decree.' },
      { id: 'auto.waste', phase: 'setup', t: 'Set up used oil and parts recycling', d: 'Authorized recyclers; keep the receipts.' }],
    links: [['CPA Montréal', 'https://www.cpamontreal.ca/'], ['OPC: car repairs', 'https://www.opc.gouv.qc.ca/en/consumer/']],
    topics: ['hiring', 'consumer-rules', 'occupancy-permit'] });

  G({ slug: 'alterations', name: 'Alterations & tailoring', fr: 'Retouches et couture', cat: 'services', icon: 'needle',
    tagline: 'Hems, fittings, repairs and custom sewing.',
    flags: ['home'], glance: { cost: [1500, 15000], weeks: [1, 8], difficulty: 1, home: true },
    intro: `<p>Clothing repair is booming with second-hand fashion. A sewing studio can start at home with one good machine, and grow into a small shop on a busy street, often near a dry cleaner or vintage store.</p>`,
    permits: ['req', 'occupancy', 'sign', 'gstqst'],
    rules: [
      ['Licences', `<p>No specific licence. Clients' garments are in your care: insurance with "care, custody and control" coverage protects you.</p>`]
    ],
    costs: [['Sewing machine, serger, iron, tools', 800, 5000, 'once'], ['Small shop fit-out (optional)', 0, 10000, 'once'], ['Rent (if shop)', 0, 1800, 'monthly'], ['Supplies', 50, 200, 'monthly'], ['Insurance', 30, 80, 'monthly']],
    money: `<p>Simple hems from about $15–$25, more for suits and formal wear. Wedding and prom season pay premiums for rush work.</p>`,
    tips: ['Tag every garment with a ticket and the client\'s phone number.', 'Partner with vintage shops and bridal boutiques for referrals.'],
    pro: ['Repair and upcycling workshops attract younger clients.'],
    pitfalls: ['Losing a garment: a clear tracking system avoids it.'],
    tasks: [{ id: 'alt.tickets', phase: 'setup', t: 'Set up a ticket system for garments', d: 'Number, client, work, price, date ready.' }],
    links: [],
    topics: ['working-from-home', 'insurance', 'marketing-local'] });
})();

/* ===== _kb_topics.html ===== */
(function () {
  'use strict';
  var BB = window.BB;
  BB.stages = [
    { id: 'start', name: 'Before you start', icon: 'bulb' },
    { id: 'official', name: 'Make it official', icon: 'stamp' },
    { id: 'place', name: 'Your place', icon: 'store' },
    { id: 'money', name: 'Money & taxes', icon: 'coins' },
    { id: 'rules', name: 'Rules for your trade', icon: 'shield' },
    { id: 'people', name: 'People & customers', icon: 'users' }
  ];

  var T = function (o) { BB.topics.push(o); };

  T({ slug: 'roadmap', title: 'The Montréal launch roadmap', fr: 'Démarrer une entreprise à Montréal', icon: 'map', stage: 'start', minutes: 6,
    summary: 'The whole journey on one page: what to do, in what order, and who you deal with at each step.',
    basics: [
      ['The short version', `<p>Opening a small business in Montréal is less about one big licence and more about a handful of small steps with three levels of government. In order:</p>
        <ol><li><b>Test the idea</b> with real customers and build a budget.</li>
        <li><b>Choose a structure</b> (most start as a sole proprietorship) and <b>register</b> with the Registraire des entreprises if you use a business name.</li>
        <li><b>Find your place</b>: check zoning <em>before</em> you sign a lease, then get the borough's <b>certificate of occupancy</b>.</li>
        <li><b>Get the licences for your trade</b>: food (MAPAQ), alcohol (RACJ), construction (RBQ), childcare, and so on.</li>
        <li><b>Set up</b>: insurance, bank account, payments, bookkeeping, GST/QST when needed.</li>
        <li><b>Open</b>, get on Google Maps, and review your numbers after 90 days.</li></ol>`],
      ['Who does what', `<ul><li><b>Your borough</b> (one of 19 arrondissements): zoning, certificate of occupancy, renovation, sign and terrace permits.</li>
        <li><b>The City of Montréal</b>: a few city-wide permits (dog walkers, street vending sites), food inspections on behalf of MAPAQ, and PME MTL, its small-business network.</li>
        <li><b>Québec</b>: business registration (Registraire des entreprises), sales and income tax (Revenu Québec), labour rules (CNESST), trade licences (MAPAQ, RBQ, RACJ…), French-language rules (OQLF).</li>
        <li><b>Canada</b>: federal income tax and payroll (CRA), federal incorporation, trademarks, drones.</li></ul>`],
      ['How long it takes', `<p>A home-based service business can be legal in <b>a week or two</b>. A shop with renovations typically takes <b>3 to 6 months</b> from first visit to opening: the lease negotiation, the occupancy permit and the renovation permit are the slow parts. Food businesses add the MAPAQ permit (2 to 6 weeks) and often more inspections.</p>`],
      ['Free help you should use', `<p><b>PME MTL</b> gives every new entrepreneur on the island free coaching, workshops and access to its loans and grants. <b>BizPaL</b> lists the permits for your activity and address. Your <b>borough's economic development commissioner</b> knows the commercial streets and their grants. Book these before you spend money: it costs nothing.</p>`]
    ],
    deeper: [
      ['The order that saves you money', `<p>The most expensive mistake is signing a lease for a space where your activity isn't allowed, or where the build-out costs double because of plumbing, ventilation or accessibility. So: <b>zoning check → conditional lease → occupancy permit → renovation permit → work → inspections → open</b>. Negotiate a lease clause that lets you walk away if the permits are refused.</p>`],
      ['Two sneaky rules', `<ul><li><b>Some activities force you to register</b> even under your own name: selling tobacco, running a tanning salon.</li>
        <li><b>Some activities force GST/QST registration</b> even under $30,000: selling tobacco or fuel, taxi and ride-hailing.</li></ul>`],
      ['When the rules differ by borough', `<p>Fees, allowed uses on a street, sign sizes, terrace rules, even whether food trucks can park: these vary across boroughs. When a guide here says "a few hundred dollars", it's because Ville-Marie, Rosemont and Verdun each publish their own tariff by-law. Call 311 or the borough's permit counter with your exact address.</p>`]
    ],
    links: [['BizPaL permit finder', 'https://bizpal-perle.ca/'], ['Montréal: open a business', 'https://montreal.ca/articles/ouvrir-un-commerce-ou-lancer-une-entreprise-18507'], ['Entreprises Québec', 'https://www.quebec.ca/en/businesses-and-self-employed-workers/start-entreprise'], ['PME MTL', 'https://pmemtl.com/en']],
    related: ['validate-idea', 'register', 'occupancy-permit', 'financing'] });

  T({ slug: 'validate-idea', title: 'Test your idea before you spend', fr: 'Valider son idée', icon: 'bulb', stage: 'start', minutes: 5,
    summary: 'Customer conversations, competitor visits and a one-page plan: the cheapest insurance you will ever buy.',
    basics: [
      ['Talk to 15–20 real customers', `<p>Not friends who will be nice. People who would actually pay. Ask about their <b>past behaviour</b>, not your idea: "Where did you get your hair cut last time? How much? What annoyed you?" If nobody has the problem, or they solve it for free, you learned something valuable for the price of a coffee.</p>`],
      ['Visit the competition', `<p>Go as a customer to five places that do what you want to do. Note prices, hours, how busy they are on a Tuesday at 3 p.m. versus a Saturday, and read their 1- and 2-star reviews: that's the list of things customers want and don't get.</p>`],
      ['Write a one-page plan', `<p>Seven lines: <b>who</b> you serve, <b>what</b> you sell, at what <b>price</b>, <b>where</b>, how people <b>find</b> you, what it <b>costs</b> (one-time and monthly), and how many sales you need to <b>break even</b>. The break-even calculator in Tools does the maths.</p>`]
    ],
    deeper: [
      ['Pre-sell', `<p>The strongest proof is money. Take deposits for your first cakes, sell 10 haircut gift cards, book cleaning clients before you buy the second vacuum. A market stall, a pop-up or a weekend at a friend's shop tests demand for very little.</p>`],
      ['Pick a location with data', `<p>Count foot traffic at different times, check what's within 500 m, look at the borough's commercial street studies (many SDCs publish them). A cheap rent on a dead street is not cheap.</p>`],
      ['Keep a "kill list"', `<p>Before you start, write down what would make you stop: "if fewer than 5 of 20 people would pay $X", "if rent is over $Y". Deciding in advance protects you from sunk-cost thinking.</p>`]
    ],
    related: ['pricing', 'financing', 'roadmap'] });

  T({ slug: 'structure', title: 'Sole proprietorship, partnership or corporation?', fr: 'Entreprise individuelle, société ou compagnie?', icon: 'stamp', stage: 'official', minutes: 6,
    summary: 'Most 1–2 person businesses start simple and incorporate later. Here is how to choose.',
    basics: [
      ['Sole proprietorship (entreprise individuelle)', `<p><b>You are the business.</b> Profits go on your personal tax return; you can deduct your business expenses. Cheapest and simplest: no registration at all if you use your own name, $41 if you use a business name. The catch: <b>you are personally responsible</b> for the business's debts and lawsuits (insurance covers much of the lawsuit risk).</p>`],
      ['Partnership (société en nom collectif)', `<p>Two people in business together without incorporating. Each partner reports their share of profits. You must register the partnership. <b>Each partner can be on the hook for the partnership's debts</b>, including ones the other partner created, so write a partnership agreement.</p>`],
      ['Corporation (société par actions / inc.)', `<p>A separate legal person you own through shares. It costs <b>$397</b> to incorporate in Québec plus a yearly update ($106). It limits your personal liability (though banks and landlords will ask you to sign personal guarantees) and can lower taxes once profits are higher than what you need to live on. It also means a separate tax return, separate bookkeeping and usually an accountant.</p>`],
      ['A simple rule of thumb', `<p>Start as a sole proprietor (or partnership) when profits are modest and risks are covered by insurance. Look at incorporating when you <b>leave money in the business</b> (profits beyond what you need to live on), take on serious debts or contracts, or bring in another owner.</p>`]
    ],
    deeper: [
      ['The Québec small-business rate catch', `<p>Corporations get a low federal tax rate on the first $500,000 of active business income. Québec's matching small-business deduction, however, generally requires the corporation to pay for at least <b>5,000 hours of work</b> in the year (with exceptions in some sectors). A one- or two-person corporation often doesn't reach that and pays Québec's general rate on that slice. The gap between corporate and personal tax is smaller than people assume: get an accountant to run your numbers.</p>`],
      ['Québec or federal incorporation?', `<p>A <b>Québec</b> corporation is simplest for a business that only operates here. A <b>federal</b> corporation costs about $200 online and gives name protection across Canada, but it must also register in Québec (another fee and yearly update), so you pay twice. For a neighbourhood shop, Québec incorporation is usually enough.</p>`],
      ['Switching later', `<p>You can move a sole proprietorship's assets into a new corporation without immediate tax using a "rollover" (section 85 election). That's a job for an accountant, but it means starting simple doesn't lock you in.</p>`]
    ],
    links: [['Registraire: fees for corporations', 'https://www.quebec.ca/entreprises-et-travailleurs-autonomes/tarifs-registraire-entreprises/societe-par-actions'], ['Registraire: fees for sole proprietors', 'https://www.quebec.ca/entreprises-et-travailleurs-autonomes/tarifs-registraire-entreprises/personne-physique-exploitant-une-entreprise-individuelle']],
    related: ['register', 'partners', 'income-tax'] });

  T({ slug: 'register', title: 'Registering your business (the NEQ)', fr: 'Immatriculer son entreprise', icon: 'stamp', stage: 'official', minutes: 4,
    summary: 'Who must register with the Registraire des entreprises, what it costs, and the yearly update.',
    basics: [
      ['Do you need to register?', `<p><b>You must register</b> if you are a sole proprietor working under a name that isn't just your own first and last name ("Coiffure Maya" yes, "Maya Chen" no), any partnership, and every corporation. <b>Exceptions that must register anyway</b>: tobacco retailers and tanning salons, whatever the name.</p>
        <p>Registering is still worth it for many sole proprietors: some banks, suppliers and platforms ask for an NEQ.</p>`],
      ['What it costs (2026)', `<ul><li>Sole proprietor: <b>$41</b> to register (priority: $61.50), then a yearly update with the annual fee.</li>
        <li>Corporation: <b>$397</b> for the certificate of incorporation, name reservation $27 (optional), initial declaration free, yearly update <b>$106</b>.</li></ul>
        <p>Do it online through Entreprises Québec / clicSÉQUR. You get your <b>NEQ</b> (Québec enterprise number) quickly, often within a couple of days.</p>`],
      ['The yearly update', `<p>Every year you file the <b>déclaration de mise à jour annuelle</b> and pay the annual fee. Many sole proprietors do it on their income tax return (line 438). Late filing brings penalties and, eventually, being struck off the register.</p>`]
    ],
    deeper: [
      ['Names: what the Registraire checks', `<p>Your name must comply with the Charter of the French Language (a French generic term like "Boulangerie", "Salon", "Services"), not be misleading, and not be too similar to an existing business. The register is public: search it before printing anything. Registering a name is <b>not</b> a trademark: to protect your brand across Canada, look at the Canadian Intellectual Property Office.</p>`],
      ['What becomes public', `<p>The register shows your name, business address and the people in charge. If you work from home, your home address may appear: some people rent a mailbox or use a co-working address.</p>`]
    ],
    links: [['Who must register', 'https://www.quebec.ca/en/businesses-and-self-employed-workers/start-entreprise/register-constitute-enterprise/learn-about-registration/about-registration'], ['Search the enterprise register', 'https://www.registreentreprises.gouv.qc.ca/'], ['Canadian trademarks database', 'https://ised-isde.canada.ca/cipo/trademark-search/srch']],
    related: ['structure', 'french-rules', 'gst-qst'] });

  T({ slug: 'french-rules', title: 'French-language rules (Bill 96) for small businesses', fr: 'La Charte de la langue française en affaires', icon: 'chat', stage: 'official', minutes: 5,
    summary: 'Your name, sign, website, receipts and service must work in French. Here is what that means in practice.',
    basics: [
      ['Your business name', `<p>Use a French generic term with your specific name: <b>"Barbier Fade Factory"</b>, <b>"Boulangerie Pain Perdu"</b>, <b>"Nettoyage Sparkle"</b>. A specific made-up or foreign word is fine when the descriptive part is in French.</p>`],
      ['Signs', `<p>Since <b>June 1, 2025</b>, French must be <b>markedly predominant</b> on outdoor signs and storefronts: in practice, French text takes about twice the space of any other language, and it has to be visible from outside. A trademark in another language is only allowed alone if it is registered and no French version exists, and even then French text must dominate the storefront.</p>`],
      ['Website, menus, receipts, contracts', `<p>Customer-facing documents must be available in French: your website, menus, price lists, invoices, receipts, warranties, contracts of adhesion. You can add English, as long as French is at least as prominent.</p>`],
      ['Serving customers', `<p>Customers have the right to be informed and served in French. You can of course serve people in any language they're comfortable with.</p>`]
    ],
    deeper: [
      ['Small businesses and francization', `<p>Francization programs with the OQLF apply to businesses with 25 or more employees. A 1–2 person business doesn't need a francization certificate, but all the rules above still apply.</p>`],
      ['How enforcement works', `<p>The OQLF mostly acts on complaints: they contact you, explain what to fix and give you time. Repeated non-compliance can bring fines. Fixing a sign before you print it is far cheaper than after.</p>`]
    ],
    links: [['OQLF: businesses', 'https://www.oqlf.gouv.qc.ca/']],
    related: ['register', 'signs-renovations', 'marketing-local'] });

  T({ slug: 'gst-qst', title: 'GST and QST: when to register and how they work', fr: 'TPS et TVQ', icon: 'receipt', stage: 'money', minutes: 6,
    summary: 'The $30,000 rule, why registering early can pay off, and how to file without stress.',
    basics: [
      ['The rates', `<p><b>GST 5%</b> (federal) + <b>QST 9.975%</b> (Québec) = <b>14.975%</b> on most goods and services. In Québec, <b>Revenu Québec administers both</b>: one registration, one return.</p>`],
      ['The $30,000 rule', `<p>You're a <b>small supplier</b> as long as your taxable sales (with any associated businesses) stay at or under <b>$30,000</b> in a calendar quarter and over the last four quarters. Small suppliers don't have to register or charge taxes. Once you pass it, you must register and start charging GST/QST. The threshold tracker in Tools helps you watch it.</p>`],
      ['Should you register early?', `<p>Registering voluntarily means you <b>charge</b> tax to customers but also <b>claim back</b> the GST/QST you pay on rent, equipment and supplies (input tax credits and refunds). If you sell to businesses, or you're about to spend $20,000 on a build-out, registering early often pays. If you sell to the public at a fixed price, staying a small supplier keeps your prices 15% lower.</p>`],
      ['Exceptions', `<p>Some sellers must register from the first dollar: <b>tobacco and fuel retailers</b>, and <b>taxi / ride-hailing</b> drivers. Some sales are exempt or zero-rated (basic groceries, many health services, some education).</p>`]
    ],
    deeper: [
      ['Filing', `<p>Small businesses usually file <b>once a year</b> (you can choose quarterly or monthly). Keep every invoice with the supplier's GST and QST numbers: without them, you can't claim the credits. Separate the tax you collect into a savings account: it isn't your money.</p>`],
      ['The quick method', `<p>Businesses under about $400,000 of taxable sales (GST included) can use the <b>quick method</b>: you remit a flat percentage of your tax-included sales instead of tracking every credit. In 2026, retailers remit about <b>1.8% (GST) and 3.4% (QST)</b>; service businesses pay higher rates (QST 6.6%). It often saves money for low-expense service businesses. Check the current rates on Revenu Québec before electing.</p>`],
      ['Prices on your menu', `<p>Price tags can show the price before tax (taxes added at the till), which is the norm. Be consistent and clear. If you're a small supplier, don't charge "taxes": you can't.</p>`]
    ],
    links: [['Revenu Québec: register for GST/QST', 'https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/registering-for-the-gst-and-qst/'], ['Small suppliers', 'https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/registering-for-the-gst-and-qst/small-suppliers/'], ['The quick method', 'https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/reporting-gsthst-and-qst/the-quick-method-of-accounting-for-calculating-gst-and-qst-remittances/']],
    related: ['income-tax', 'banking-books', 'pricing'] });

  T({ slug: 'banking-books', title: 'Bank account, payments and bookkeeping', fr: 'Banque, paiements et tenue de livres', icon: 'coins', stage: 'money', minutes: 5,
    summary: 'Separate accounts, a simple bookkeeping habit and a tax savings account: the boring things that keep you alive.',
    basics: [
      ['Separate your money', `<p>Open a business chequing account (and a business credit card) on day one, even as a sole proprietor. Every business expense goes through it; nothing personal does. Your bookkeeping gets 10 times easier, and banks will lend more readily later.</p>`],
      ['Getting paid', `<p>Card terminals and tap-to-pay on your phone (Square, Stripe, Moneris, Helcim, Clover…) charge roughly <b>2–3% per transaction</b>, sometimes plus monthly fees. Interac e-Transfer is free or cheap for services. Appointment businesses should take <b>deposits or card holds</b> online to cut no-shows.</p>`],
      ['A 15-minute weekly habit', `<p>Once a week: snap receipts, categorize transactions in your app (Wave, QuickBooks, Xero…) or spreadsheet, and move <b>25–30% of profit</b> into a savings account for income tax and GST/QST. Keep records for at least <b>6 years</b>.</p>`]
    ],
    deeper: [
      ['What you can deduct', `<p>Rent, supplies, equipment (through capital cost allowance), insurance, phone and internet (business part), vehicle costs (business kilometres, keep a log), marketing, software, professional fees, training, bank fees. Working from home: a share of rent, electricity, heating and internet based on the area used.</p>`],
      ['When to hire an accountant', `<p>A bookkeeper for monthly entries, an accountant (CPA) for year-end and tax returns. Even if you do your own books, paying for a first-year review or incorporation advice usually pays for itself.</p>`]
    ],
    related: ['gst-qst', 'income-tax', 'pricing'] });

  T({ slug: 'income-tax', title: 'Income tax and contributions when you\'re self-employed', fr: 'Impôts et cotisations du travailleur autonome', icon: 'receipt', stage: 'money', minutes: 6,
    summary: 'What a sole proprietor pays on profit, the deadlines, and why you should set money aside from day one.',
    basics: [
      ['How it works', `<p>As a sole proprietor, your <b>business profit</b> (revenue minus expenses) is added to your income on your federal (T1, form T2125) and Québec (TP-1, schedule L) returns. You pay federal and Québec income tax on it, at your personal rates.</p>`],
      ['Contributions on top', `<ul><li><b>Québec Pension Plan (RRQ/QPP)</b>: as a self-employed person you pay <b>both</b> halves, about <b>12.6%</b> of net self-employment income (10.6% base + 2% first additional) up to the 2026 ceiling of about $74,600, after a $3,500 exemption, plus a smaller second additional contribution above that. Half is deductible.</li>
        <li><b>Québec Parental Insurance (RQAP/QPIP)</b>: <b>0.764%</b> in 2026, up to $103,000. It gives you access to parental benefits.</li>
        <li>A <b>Health Services Fund</b> contribution may apply on your Québec return when you have self-employment income.</li></ul>`],
      ['Deadlines', `<p>Self-employed people have until <b>June 15</b> to file, but any balance owing must be <b>paid by April 30</b>, or interest runs.</p>`]
    ],
    deeper: [
      ['Instalments (acomptes provisionnels)', `<p>If your income tax owing is more than <b>$1,800</b> for the year and was more than $1,800 in either of the previous two years, both Revenu Québec and the CRA ask for quarterly instalments: <b>March 15, June 15, September 15 and December 15</b>. Your first profitable year usually has no instalments, which makes the second year's April a shock. Save 25–30% of profit from the start.</p>`],
      ['The first year trap', `<p>No employer withholds tax for you. Many new business owners spend the money that belonged to the tax man. Make the transfer to your tax savings account automatic, every week.</p>`],
      ['Corporations', `<p>A corporation files its own federal (T2) and Québec (CO-17) returns and pays corporate tax on its profit; you then pay yourself a salary (with payroll) or dividends. It's a different system: get an accountant.</p>`]
    ],
    links: [['Revenu Québec: self-employed', 'https://www.revenuquebec.ca/en/citizens/self-employed-people/information-for-the-self-employed/'], ['QPP contributions for the self-employed', 'https://www.revenuquebec.ca/en/citizens/income-tax-return/paying-a-balance-due-or-receiving-a-refund/paying-contributions-and-premiums/contributions-and-premiums-payable-by-a-self-employed-person-or-a-member-of-a-partnership/qpp-contribution-payable-by-a-self-employed-person-or-a-member-of-a-partnership/']],
    related: ['gst-qst', 'banking-books', 'structure'] });

  T({ slug: 'pricing', title: 'Pricing, break-even and cash flow', fr: 'Prix, seuil de rentabilité et liquidités', icon: 'chart', stage: 'money', minutes: 6,
    summary: 'How to set a price that pays you, how many sales you need, and how not to run out of cash.',
    basics: [
      ['Start from costs, finish with the market', `<p>Add up your <b>fixed monthly costs</b> (rent, insurance, phone, software, loan payments, <b>and your own pay</b>). Work out the <b>variable cost</b> of each sale (ingredients, products, card fees). Your price minus that variable cost is your <b>margin per sale</b>. Fixed costs ÷ margin = sales needed per month. Then compare your price with competitors and adjust.</p>`],
      ['Pay yourself in the maths', `<p>A business that only "breaks even" when you work for free is a hobby with rent. Put a realistic salary for yourself in the fixed costs.</p>`],
      ['Service businesses: the hourly rate', `<p>You won't bill 40 hours a week: travel, admin, quotes and marketing eat 30–50% of your time. Divide your target income plus costs by <b>billable</b> hours, not worked hours. The hourly rate calculator in Tools does it.</p>`]
    ],
    deeper: [
      ['Cash flow is not profit', `<p>You can be profitable and still run out of cash: you pay suppliers before customers pay you, the equipment loan starts before the busy season, GST/QST and instalments come due. Keep a simple 12-month cash-flow table and a reserve of 3 months of fixed costs.</p>`],
      ['Seasonality in Montréal', `<p>Terraces, ice cream and landscaping boom from May to September; snow removal and holiday baking peak in winter; construction holiday (the last two weeks of July) and the July 1 moving day shift demand. Plan cash for the slow months.</p>`],
      ['Raising prices', `<p>Raise prices a little every year rather than a lot every few years. Announce it, explain it briefly, and offer a reason to stay (loyalty card, bundle).</p>`]
    ],
    related: ['validate-idea', 'banking-books', 'financing'] });

  T({ slug: 'financing', title: 'Money to start: loans, grants and free help', fr: 'Financement et accompagnement', icon: 'coins', stage: 'start', minutes: 7,
    summary: 'The Montréal and Québec programs that fund and coach small new businesses, and how to approach them.',
    basics: [
      ['Start with PME MTL', `<p>Six service hubs cover the whole island. Every new entrepreneur gets <b>free one-on-one coaching</b>, workshops and help with the business plan. They manage local funds: the <b>Fonds jeunes entreprises</b> (support for young businesses, amounts in the tens of thousands, partly non-repayable depending on the year) and <b>PME MTL loans</b>. Your hub depends on your business address.</p>`],
      ['Futurpreneur (ages 18–39)', `<p>Loans of up to <b>$75,000</b> (part from Futurpreneur, part from BDC) to start or buy a business, with a <b>two-year mentor</b>. A 1% management fee. There's also a newcomer version and a side-hustle version with smaller amounts.</p>`],
      ['Services Québec\'s self-employment support (STA)', `<p>The <b>Soutien au travail autonome (STA)</b> used to pay people on EI or social assistance a weekly allowance while they built their business. <b>New admissions have been suspended since May 1, 2024</b> (people accepted before continue). Ask your local Services Québec office whether it has reopened before you count on it.</p>`],
      ['Banks and credit unions', `<p>Banks lend to new businesses mostly with personal guarantees and a solid plan; government-backed <b>Canada Small Business Financing Program</b> loans help for equipment and leasehold improvements. Desjardins has <b>Créavenir</b> for young entrepreneurs (a small grant plus credit, amounts vary by region).</p>`]
    ],
    deeper: [
      ['More programs worth a look', `<ul><li><b>BDC</b>: loans for startups with some track record or strong plans.</li>
        <li><b>Evol</b> (formerly Femmessor): financing and support for women and diverse entrepreneurs.</li>
        <li><b>Fondation du Grand Montréal and Fondation Montréal inc.</b>: grants and mentorship for young founders (calls for applications).</li>
        <li><b>Réseau Mentorat</b>: volunteer mentors who ran businesses themselves.</li>
        <li><b>Borough programs</b>: some boroughs subsidize façade renovations or accessibility work on commercial streets.</li></ul>`],
      ['How to get a yes', `<p>A clear one-page plan, a startup budget, a 12-month cash-flow, proof of demand (pre-sales, letters of intent, a waiting list) and some of your own money in the project. Lenders like to see you put in 10–25% yourself.</p>`],
      ['Amounts change', `<p>Programs open, close and change amounts every budget. Treat the figures here as a starting point and confirm with the program before you plan around it.</p>`]
    ],
    links: [['PME MTL', 'https://pmemtl.com/en'], ['Futurpreneur', 'https://www.futurpreneur.ca/en/'], ['BDC', 'https://www.bdc.ca/en'], ['Services Québec: Soutien au travail autonome (status)', 'https://www.quebec.ca/entreprises-et-travailleurs-autonomes/demarrer-entreprise/aide-financiere-devenir-travailleur-autonome'], ['Evol', 'https://evol.ca/en/'], ['Réseau Mentorat', 'https://www.reseaumentorat.com/en/']],
    related: ['validate-idea', 'pricing', 'roadmap'] });

  T({ slug: 'occupancy-permit', title: 'Zoning and the certificate of occupancy', fr: 'Zonage et certificat d\'occupation', icon: 'store', stage: 'place', minutes: 6,
    summary: 'The borough permit every business address needs, and the zoning check to do before you sign anything.',
    basics: [
      ['What it is', `<p>The <b>certificat d'occupation</b> (also called permis d'occupation or certificat d'autorisation d'usage) is your borough's confirmation that your activity is allowed at your address. You need one for <b>any commercial, industrial or professional activity</b>, including when you use part of your home as an office or studio. It's tied to both the premises and the operator, so a new owner needs a new one.</p>`],
      ['Check zoning first', `<p>Before you sign a lease, call or visit the borough's <b>comptoir des permis</b> (or call 311) with the exact address and a one-line description of your activity. Montréal's interactive zoning map is a good first look, but the counter's answer is what counts. Some uses are allowed only as "conditional uses" that need months of approval.</p>`],
      ['Applying', `<p>Apply online or at the counter with the lease (or proof of ownership), a floor plan, a description of the activity and the fee. Fees are set by each borough's tariff by-law: expect <b>a few hundred dollars</b>. Processing takes from a few days to several weeks. Restaurants and bars need it before applying for an alcohol permit.</p>`]
    ],
    deeper: [
      ['Things that trigger more review', `<ul><li>A change of use (shop → restaurant, office → studio).</li><li>Renovations, especially plumbing, ventilation or structural work.</li><li>Heritage sectors and streets with a PIIA (architectural review).</li><li>Accessibility and fire-safety upgrades a new use requires.</li></ul>`],
      ['Negotiate with the permit in mind', `<p>Sign a lease that is <b>conditional on obtaining the certificate of occupancy</b> (and the renovation permit), with a deadline. Ask the landlord for the previous tenant's permits: if the last tenant did the same activity, it's usually simpler.</p>`]
    ],
    links: [['Montréal: occupancy permit (commercial or professional activity)', 'https://montreal.ca/demarches/obtenir-un-permis-doccupation-pour-activite-commerciale-industrielle-ou-professionnelle'], ['Montréal: open a business', 'https://montreal.ca/articles/ouvrir-un-commerce-ou-lancer-une-entreprise-18507']],
    related: ['commercial-lease', 'signs-renovations', 'working-from-home'] });

  T({ slug: 'working-from-home', title: 'Running a business from home', fr: 'Travailler à domicile', icon: 'home', stage: 'place', minutes: 4,
    summary: 'What boroughs allow at home, the permit you still need, and what changes with your insurance and taxes.',
    basics: [
      ['Yes, you usually need a permit', `<p>Montréal applies the occupancy permit to home businesses too. Most boroughs allow an office or quiet service as an "accessory use" of a home, with conditions such as a <b>maximum area</b>, no or limited signage, few client visits, no outside storage and no (or few) employees. The exact limits depend on your borough and zone.</p>`],
      ['What works well at home', `<p>Offices and freelance work, online shops, tutoring, a one-chair hair or nail studio (where allowed), home baking with a MAPAQ permit, home daycare (with recognition above 2 children).</p>`],
      ['Tell your insurer and landlord', `<p>Home insurance often excludes business activity: add a rider or a separate policy. If you rent, check your lease: a residential lease can forbid commercial use, and clients coming and going may be an issue with the landlord.</p>`]
    ],
    deeper: [
      ['Deducting your home office', `<p>If your workspace is your main place of business, or used regularly to meet clients, you can deduct the business share (by area) of rent, electricity, heating, insurance and internet. If you own, be careful with depreciation on the home: it can affect the tax-free sale of your principal residence.</p>`],
      ['Your address goes public', `<p>Your business address appears on the enterprise register and often on Google. Consider a mailbox service or co-working address for mail and the register.</p>`]
    ],
    related: ['occupancy-permit', 'insurance', 'food-permits'] });

  T({ slug: 'commercial-lease', title: 'Signing a commercial lease in Montréal', fr: 'Le bail commercial', icon: 'key', stage: 'place', minutes: 7,
    summary: 'Commercial leases have almost no legal protection: everything is negotiable. What to ask for and what to watch.',
    basics: [
      ['It is not a home lease', `<p>The Tribunal administratif du logement and residential rent rules <b>don't apply</b>. There's no rent control and few default protections: what you sign is what you get. Read every clause, and have a lawyer review it before signing (a few hundred dollars well spent).</p>`],
      ['What rent really costs', `<p>Rent is quoted <b>per square foot per year</b>. Street-front retail in neighbourhoods like Mile End or Rosemont often lists around <b>$20–$35/ft²/yr</b>, more on the busiest streets and downtown. Then ask: is it <b>gross</b> (all-in) or <b>net</b> (you also pay your share of property taxes, insurance and maintenance, often another $8–$20/ft²)? A 700 ft² shop at $28 net + $12 extra is about $2,330 a month plus GST/QST.</p>`],
      ['Ask for these', `<ul><li>A clause making the lease <b>conditional on your permits</b>.</li><li><b>Free rent months</b> during your build-out (2–6 months is common).</li><li>A <b>tenant improvement allowance</b> if the landlord benefits from the work.</li><li>A short first term (3–5 years) with <b>renewal options</b> at a set formula.</li><li>The right to <b>sublet or assign</b> if you sell or close.</li><li>A <b>cap on yearly increases</b> and on extra charges.</li></ul>`]
    ],
    deeper: [
      ['Personal guarantees', `<p>Landlords will ask you to personally guarantee a new business's lease, even a corporation's. Try to limit it in time (e.g. the first 2 years) or in amount (e.g. 6 months of rent).</p>`],
      ['Check the space like an inspector', `<p>Electrical capacity, plumbing (sinks for a salon, grease trap for food), ventilation and exhaust, accessibility (step at the entrance, washroom), the building's zoning history, heating costs, and who repairs the roof and the HVAC.</p>`],
      ['The end of the lease', `<p>Many leases require you to return the space as it was, which can mean paying to demolish your own renovations. Negotiate that clause up front.</p>`]
    ],
    related: ['occupancy-permit', 'signs-renovations', 'insurance'] });

  T({ slug: 'signs-renovations', title: 'Renovation, sign and terrace permits', fr: 'Permis de transformation, d\'enseigne et de terrasse', icon: 'hammer', stage: 'place', minutes: 4,
    summary: 'The borough permits for your build-out, your sign and your summer terrace.',
    basics: [
      ['Renovation permit', `<p>Interior changes (walls, plumbing, electrical), any façade work, and a change of use or layout since the last occupancy permit need a <b>permis de transformation</b> (renovation permit). Purely cosmetic work such as painting usually doesn't. For a commercial space, expect <b>plans by a licensed architect</b>; the permit often has to be issued before your occupancy permit. The City's formula is about <b>$9.80 per $1,000 of work</b>, with a minimum of about <b>$490</b> for commercial buildings (boroughs adjust). Use licensed contractors (RBQ). Work started without a permit can be stopped and fined.</p>`],
      ['Sign permit', `<p>Any commercial sign needs a <b>permis d'enseigne</b>. You must hold your occupancy permit (or have applied). Fees vary: roughly <b>$150–$240 minimum per sign</b> plus about $15 per m², more if an architectural review (PIIA) applies. Remember: French must be markedly predominant.</p>`],
      ['Terrace (café-terrasse)', `<p>Tables on the sidewalk or street need a seasonal borough permit and must follow layout rules (clear path, accessibility, hours). Terraces on private land have their own rules. Apply early: spring is busy.</p>`]
    ],
    deeper: [
      ['The Commerce-Montréal renovation grant', `<p>The City's <b>Commerce-Montréal</b> program (which replaced PR@M-Commerce) can cover about <b>40% of eligible renovation costs, up to $50,000</b> per project, for commercial spaces and buildings. Applications open in set windows during the year, and <b>work started before your eligibility is confirmed isn't covered</b>: apply before you hire the contractor. Some boroughs add façade and accessibility grants: ask your borough's economic development commissioner.</p>`]
    ],
    links: [['Montréal: commercial sign permit', 'https://montreal.ca/en/how-to/get-commercial-sign-permit'], ['Montréal: what a renovation permit costs', 'https://montreal.ca/articles/renovations-combien-coute-un-permis-2715'], ['Commerce-Montréal renovation grant', 'https://montreal.ca/en/programs/commerce-montreal-renovation-grant-commercial-buildings-and-spaces'], ['Terraces on public property', 'https://montreal.ca/services/terrasse-commerciale-sur-le-domaine-public']],
    related: ['occupancy-permit', 'french-rules', 'trades-licences'] });

  T({ slug: 'food-permits', title: 'Food permits (MAPAQ) and hygiene training', fr: 'Permis alimentaires du MAPAQ', icon: 'cup', stage: 'rules', minutes: 7,
    summary: 'Which MAPAQ permit you need, what it costs, the mandatory hygiene courses, and home-kitchen rules.',
    basics: [
      ['Restaurant or retail?', `<p><b>Restaurant permit</b>: you prepare meals, snacks or drinks to eat on site or take away (cafés, food trucks, caterers, home kitchens selling meals). <b>Retail permit</b>: you sell food products, not meals, directly to consumers (bakery shelves, grocery, dépanneur with prepared food). If you do both, pick the one that's <b>more than 50%</b> of your activity.</p>`],
      ['What it costs (2026)', `<ul><li>General preparation: <b>$367/year</b> (restaurant or retail).</li><li>Only keeping food hot or cold (no real cooking): <b>$283/year</b>.</li><li>With a buffet: $566.</li><li>First application: plus a <b>$144</b> file fee.</li></ul>
        <p>Apply by mail to MAPAQ's Service des permis with a cheque or money order. Processing takes <b>2 to 6 weeks</b>. You can't start before you have it, and it must be displayed where customers see it. Operating without one: fines start at <b>$5,000</b>.</p>`],
      ['Mandatory hygiene training', `<p>The person in charge of hygiene must hold the <b>food establishment manager</b> certificate (a 12-hour course with an exam). Employees who handle food need the <b>food handler</b> course (6 hours), following MAPAQ's ratio rules. Courses are given by MAPAQ-recognized trainers, online or in class, for roughly $100–$250.</p>`]
    ],
    deeper: [
      ['Cooking at home', `<p>Selling meals from your home kitchen needs a <b>restaurant permit</b>. Conditions: no more than <b>100 kg of food per month</b>, sales <b>directly to consumers</b> only (no grocery or wholesale), all hygiene rules apply (cold chain included) and you must hold the manager certificate. Your borough must also allow the activity at home.</p>`],
      ['Who inspects in Montréal', `<p>On the island, the City of Montréal's food inspectors act on MAPAQ's behalf: they visit restaurants and shops, follow up complaints, and can seize or close. Fines and convictions are public, and local media report them.</p>`],
      ['Selling to other businesses', `<p>Selling wholesale (to cafés, grocers) or making products that are distributed can require a different permit and labelling (nutrition facts, allergens, bilingual labels). Ask the Service des permis before you sign your first wholesale customer.</p>`],
      ['Alcohol', `<p>Selling or serving alcohol needs an <b>RACJ permit</b> (restaurant, bar, grocery…), and your certificate of occupancy first. "Apportez votre vin" restaurants also need an RACJ permit to let customers bring their own wine. Allow several weeks.</p>`]
    ],
    links: [['MAPAQ: restaurant and retail permits', 'https://www.quebec.ca/entreprises-et-travailleurs-autonomes/industries/industrie-bioalimentaire/permis-alimentaires/permis-restauration-vente-detail'], ['Mandatory hygiene training', 'https://www.quebec.ca/sante/alimentation/salubrite-aliments-prevention-risques/etablissements-alimentaires/hygiene-nettoyage/formation-obligatoire-hygiene-salubrite-alimentaires'], ['Montréal food inspection', 'https://montreal.ca/en/topics/food-inspection'], ['RACJ (alcohol permits)', 'https://www.racj.gouv.qc.ca/']],
    related: ['occupancy-permit', 'working-from-home', 'insurance'] });

  T({ slug: 'trades-licences', title: 'Construction trades: RBQ, CMEQ, CMMTQ', fr: 'Licences d\'entrepreneur en construction', icon: 'hammer', stage: 'rules', minutes: 6,
    summary: 'When you need a contractor licence, what it takes to get one, and the trades with their own corporations.',
    basics: [
      ['Who needs an RBQ licence', `<p>Anyone who does or organizes <b>construction or renovation work for others</b> (and anyone who advertises it) needs a licence from the <b>Régie du bâtiment du Québec</b>, in the right subcategory (general contractor, or specialized: finishing, carpentry, roofing…). Many finishing jobs, painting included, fall under a specialized subcategory. RBQ publishes a list of the small jobs that don't need a licence: check it for your exact services.</p>`],
      ['What it takes', `<ul><li>Exams on administration, health and safety, and the technical side of your subcategory (or recognized equivalent training).</li>
        <li>A <b>bond</b>: $20,000 for specialized, $40,000 for general contractors (a 2026 proposal would raise these).</li>
        <li>Licence fees, and proof you're registered with Revenu Québec and the CNESST if you have employees.</li></ul>
        <p>Processing has been slow in 2026 (weeks to months). Start early.</p>`],
      ['Electricians and plumbers', `<p>Electrical contractors get their licence (subcategory 16) through the <b>CMEQ</b>: you need a master electrician exam and 3 years of experience. Plumbing and heating contractors go through the <b>CMMTQ</b>. Each worker also needs their own competency certificate.</p>`]
    ],
    deeper: [
      ['Without a licence', `<p>Unlicensed work brings fines in the thousands to tens of thousands of dollars, and you can't legally sue a client who doesn't pay. Clients check licences on the RBQ site: display your number on quotes and your van.</p>`],
      ['The CCQ', `<p>Commercial, institutional and industrial construction falls under the Commission de la construction du Québec: workers need competency cards and union rules apply. Residential renovation done by a self-employed contractor is mostly outside it. Know which world your jobs are in.</p>`],
      ['Heavy trucks', `<p>A truck of 4,500 kg or more used for business must be registered with the Commission des transports du Québec.</p>`]
    ],
    links: [['RBQ: is a licence required?', 'https://www.rbq.gouv.qc.ca/en/licence/knowing-if-a-licence-is-required/work-not-requiring-a-licence/'], ['CMEQ', 'https://www.cmeq.org/'], ['CMMTQ', 'https://www.cmmtq.org/']],
    related: ['insurance', 'consumer-rules', 'signs-renovations'] });

  T({ slug: 'insurance', title: 'Insurance for a small business', fr: 'Assurances d\'entreprise', icon: 'shield', stage: 'rules', minutes: 4,
    summary: 'The coverage almost everyone needs, the extras for your trade, and what it costs.',
    basics: [
      ['The basics', `<ul><li><b>Civil (general) liability</b>: someone slips in your shop, a client's floor gets damaged. Usually $1–2 million of coverage; landlords and many clients require it.</li>
        <li><b>Property / contents</b>: your equipment and stock against fire, theft, water damage.</li>
        <li><b>Business interruption</b>: income while you're closed after an insured event.</li>
        <li><b>Professional liability (E&O)</b>: if you give advice or design (bookkeepers, designers, consultants, trainers).</li>
        <li><b>Commercial auto</b>: if you drive for work, personal car insurance may not cover it.</li></ul>`],
      ['What it costs', `<p>For most 1–2 person businesses, expect roughly <b>$500 to $3,000 a year</b>, depending on the trade, revenue and claims. Food and construction cost more; a freelancer at home costs less. Get two or three broker quotes.</p>`]
    ],
    deeper: [
      ['Home businesses', `<p>Home insurance usually excludes business equipment and clients visiting. Add a business rider or a separate policy.</p>`],
      ['Read the exclusions', `<p>Ask specifically about: equipment you carry to clients' homes, clients' belongings in your care (dogs, bikes, clothes for alterations), products you sell, and work done by subcontractors.</p>`]
    ],
    related: ['commercial-lease', 'working-from-home', 'trades-licences'] });

  T({ slug: 'hiring', title: 'Hiring your first employee', fr: 'Embaucher un premier employé', icon: 'users', stage: 'people', minutes: 7,
    summary: 'Registrations, payroll, minimum wage and labour standards for your first hire in Québec.',
    basics: [
      ['Before the first payday', `<ul><li>Register with <b>Revenu Québec</b> for source deductions (Québec tax, QPP, QPIP, Health Services Fund…).</li>
        <li>Open a <b>CRA payroll account</b> (federal tax and EI).</li>
        <li>Register with the <b>CNESST</b> (workplace accident insurance).</li>
        <li>Have your employee fill in <b>TD1 and TP-1015.3</b> forms.</li></ul>`],
      ['Pay and hours', `<p>Minimum wage is <b>$16.60/h</b> since May 1, 2026 (<b>$13.30</b> for tipped employees). Overtime at time and a half after 40 hours a week. Pay at least every 16 days (twice a month). Give a pay slip with every pay.</p>`],
      ['Vacation and holidays', `<p>2 weeks of vacation (4% pay) in the first years, 3 weeks (6%) after 3 years of service. Statutory holidays, including the Fête nationale (June 24) and Canada Day (July 1), plus sick and family-leave days set by the Labour Standards Act.</p>`],
      ['What an employee really costs', `<p>On top of wages, employer contributions (QPP, EI, QPIP, Health Services Fund, CNESST, labour standards) add roughly <b>12–16%</b>, plus vacation pay and holidays. A $20/h employee costs you about $23–24/h.</p>`]
    ],
    deeper: [
      ['Paperwork that comes back every year', `<p>Monthly (or quarterly) remittances of source deductions, RL-1 and T4 slips by the end of February, Record of Employment when someone leaves, the CNESST yearly salary declaration.</p>`],
      ['Employee or contractor?', `<p>Calling someone a contractor doesn't make them one. If you set their hours, give them the tools and they work only for you, they're likely an employee, and Revenu Québec and the CRA can reassess you for the missed contributions.</p>`],
      ['Sector decrees', `<p>A few industries in the Montréal region are governed by collective agreement decrees with their own minimum wages and levies: <b>automotive services</b> (CPA Montréal) and <b>building maintenance/cleaning of public buildings</b>, for example. Check whether one covers your trade before you hire.</p>`],
      ['Hiring help', `<p>Wage subsidies exist for hiring young people, newcomers and people far from the job market (Services Québec, Canada Summer Jobs for students). Ask before the hire: most can't be claimed after.</p>`]
    ],
    links: [['Revenu Québec: source deductions', 'https://www.revenuquebec.ca/en/businesses/source-deductions-and-employer-contributions/'], ['CNESST: labour standards', 'https://www.cnesst.gouv.qc.ca/en'], ['CRA: payroll', 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll.html']],
    related: ['banking-books', 'partners', 'insurance'] });

  T({ slug: 'partners', title: 'Starting with a partner', fr: 'Démarrer à deux', icon: 'users', stage: 'people', minutes: 5,
    summary: 'Two-person businesses are great until they aren\'t. The agreement to write while you still agree on everything.',
    basics: [
      ['Pick the structure', `<p>Two people can form a <b>general partnership</b> (registered, each partner liable) or a <b>corporation</b> owned 50/50 or otherwise. Many couples and friends start as a partnership and incorporate later.</p>`],
      ['Write it down', `<p>A partnership agreement (or a shareholders' agreement in a corporation) covers: who owns what share, who puts in what money and time, who decides what, how you pay yourselves, what happens if one wants out, gets sick, dies or stops working, and how you settle disagreements.</p>`]
    ],
    deeper: [
      ['50/50 deadlock', `<p>With two equal owners, every disagreement is a tie. Decide in advance who has the final word on what (one on the kitchen, the other on money), or name a mediator.</p>`],
      ['The buy-sell clause', `<p>Agree on how a departing partner's share is valued and paid (over time, from the business's cash flow). A "shotgun" clause (one names a price, the other must buy or sell at it) is common between two partners.</p>`],
      ['Couples', `<p>Spouses in business together: think about how the business is treated if you separate, and about family patrimony rules. A notary or lawyer can help you set it up.</p>`]
    ],
    related: ['structure', 'register', 'hiring'] });

  T({ slug: 'consumer-rules', title: 'Consumer protection: quotes, contracts, door-to-door', fr: 'Protection du consommateur', icon: 'scale', stage: 'people', minutes: 5,
    summary: 'Québec\'s Consumer Protection Act is strict. The rules that most often catch small businesses.',
    basics: [
      ['Show the real price', `<p>The price you advertise must include all fees except QST/GST and some duties. No surprise "service fees" at the end.</p>`],
      ['Contracts at the customer\'s home', `<p>If you solicit or sign contracts with consumers <b>outside your place of business</b> (door-to-door, at their home), you're an <b>itinerant merchant</b>: you generally need an <b>OPC permit</b> and a security, and the customer can cancel within 10 days. Renovation, insulation, cleaning and snow-removal contracts often fall here. Signing the contract online, by phone or at your shop changes the rules.</p>`],
      ['Online and distance sales', `<p>Distance contracts (online, phone) require a clear description, the total price, delivery and cancellation terms, and a copy of the contract sent to the customer within 15 days.</p>`]
    ],
    deeper: [
      ['Warranties', `<p>Products sold to consumers come with a legal warranty: they must be fit for normal use for a reasonable time, whatever your own warranty says.</p>`],
      ['Gift cards', `<p>Gift cards can't expire or carry inactivity fees in Québec (with a few exceptions). Count unredeemed cards as a liability, not income.</p>`],
      ['Tips at checkout', `<p>Payment terminals that suggest tips must calculate them on the price before taxes.</p>`]
    ],
    links: [['OPC: for merchants', 'https://www.opc.gouv.qc.ca/en/merchant/'], ['Itinerant merchants', 'https://www.opc.gouv.qc.ca/en/merchant/']],
    related: ['marketing-local', 'trades-licences', 'privacy-law25'] });

  T({ slug: 'privacy-law25', title: 'Customer data and Law 25', fr: 'Renseignements personnels (Loi 25)', icon: 'lock', stage: 'people', minutes: 4,
    summary: 'Even a one-person business collecting emails or bookings has duties under Québec\'s privacy law.',
    basics: [
      ['Name a person in charge', `<p>By default, the owner is the <b>person in charge of the protection of personal information</b>. Publish their title and contact details on your website.</p>`],
      ['Collect only what you need', `<p>A booking needs a name and a phone number, not a birth date. Say why you collect information, get consent for marketing emails, and delete what you no longer need.</p>`],
      ['Have a privacy policy', `<p>If you have a website or app that collects information, publish a simple, clear privacy policy in French (and English if you like).</p>`]
    ],
    deeper: [
      ['Incidents', `<p>Keep a register of privacy incidents (a lost phone with client files, a hacked email). Serious incidents must be reported to the Commission d'accès à l'information and to the people affected.</p>`],
      ['Your suppliers', `<p>Booking apps, mailing tools and cloud storage handle your clients' data for you: pick reputable ones and know where data is stored. Transfers outside Québec call for a quick privacy assessment.</p>`]
    ],
    links: [['Commission d\'accès à l\'information', 'https://www.cai.gouv.qc.ca/']],
    related: ['consumer-rules', 'marketing-local', 'banking-books'] });

  T({ slug: 'marketing-local', title: 'Getting your first customers', fr: 'Trouver ses premiers clients', icon: 'megaphone', stage: 'people', minutes: 5,
    summary: 'Google Maps, Instagram, your street and word of mouth: the marketing that works for neighbourhood businesses.',
    basics: [
      ['Google Business Profile first', `<p>Most local searches end on Google Maps. Create your profile as soon as you have an address (it's free): exact category, hours, photos, prices or menu, a booking link. Ask every happy customer for a review in the first months, and answer every review, in French and English.</p>`],
      ['Instagram shows the craft', `<p>Short videos of the making (the fade, the croissant lamination, the before/after of a cleaning) beat polished ads. Tag your neighbourhood and nearby businesses. Collaborate with the café next door.</p>`],
      ['Your street', `<p>Join the <b>SDC</b> (merchants' association) if there is one: they run sidewalk sales, festivals and promotions. Introduce yourself to neighbouring shops: they'll send you customers.</p>`]
    ],
    deeper: [
      ['Make it easy to come back', `<p>A loyalty card, a "book your next appointment" habit, a newsletter (with consent, Law 25), seasonal products. Keeping a customer costs far less than finding a new one.</p>`],
      ['Bilingual, French first', `<p>Montréal is bilingual in practice, but your sign, website and posts must put French first. Bilingual captions widen your reach.</p>`],
      ['Measure', `<p>Ask new customers how they found you. In three months you'll know which two channels deserve your time.</p>`]
    ],
    related: ['french-rules', 'privacy-law25', 'pricing'] });
})();

/* ===== _kb_ui.html ===== */
(function () {
  'use strict';
  var BB = window.BB, esc = UI.esc;

  /* ---------------------------------------------------------------- icons for the knowledge base */
  var more = {
    cup: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3c0 1.5 1.5 1.5 1.5 3M12 3c0 1.5 1.5 1.5 1.5 3"/>',
    scissors: '<circle cx="6" cy="6.5" r="2.8"/><circle cx="6" cy="17.5" r="2.8"/><path d="M8.3 8.2 20 18M8.3 15.8 20 6"/>',
    wrench: '<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-2-2z"/><path d="M14.5 6.5 17 4l3 3-2.5 2.5"/>',
    paw: '<circle cx="7" cy="9" r="1.8"/><circle cx="11" cy="6" r="1.8"/><circle cx="15.5" cy="6.5" r="1.8"/><circle cx="18.5" cy="10.5" r="1.8"/><path d="M8 16.5c0-2.5 2-5 4.5-5s4.5 2.5 4.5 5c0 2-1.5 3-3 3-1 0-1-.6-1.5-.6s-.5.6-1.5.6c-1.5 0-3-1-3-3z"/>',
    bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    stamp: '<path d="M9 13V9.5a3 3 0 1 1 6 0V13"/><path d="M5 13h14v4H5z"/><path d="M6 21h12"/>',
    store: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12v8h13v-8"/><path d="M10 20v-5h4v5"/>',
    coins: '<ellipse cx="9" cy="7" rx="5.5" ry="2.5"/><path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7"/><path d="M9.5 16.3c.7 1.3 2.8 2.2 5.5 2.2 3 0 5.5-1.1 5.5-2.5v-4c0-1.3-2.2-2.4-5-2.5"/>',
    receipt: '<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M7 15l4-4 3 3 5-6"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2 2M14 9l2 2"/>',
    hammer: '<path d="M14 6 4.5 15.5a2 2 0 0 0 3 3L17 9"/><path d="M13 4.5 15.5 2 22 8.5 19.5 11z"/>',
    scale: '<path d="M12 3v18M7 21h10M5 7h14"/><path d="M5 7 2.5 13a3 3 0 0 0 5 0z"/><path d="M19 7l-2.5 6a3 3 0 0 0 5 0z"/>',
    megaphone: '<path d="M3 10v4h4l7 4V6L7 10z"/><path d="M17 9a4 4 0 0 1 0 6"/><path d="M7 14l1 5h3l-1-4"/>',
    croissant: '<path d="M3.5 14c2-6 6-9 8.5-9s6.5 3 8.5 9"/><path d="M3.5 14c1.5 1.8 3.5 2.5 5.5 1.5M20.5 14c-1.5 1.8-3.5 2.5-5.5 1.5"/><path d="M9 15.5c1 .8 2 1 3 1s2-.2 3-1"/><path d="M9.5 7.5 11 13M14.5 7.5 13 13"/>',
    truck: '<path d="M2 6h12v10H2z"/><path d="M14 9h4l3 3.5V16h-7"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    broom: '<path d="M14 3 9.5 11"/><path d="M6 11h7l2 9H4z"/><path d="M8 15v5M11 15v5"/>',
    brush: '<path d="M18 3h3v6l-6 6"/><path d="M15 15l-3-3 6-9"/><path d="M12 12c-3 0-5 2-5 4 0 1.5-1 3-3 4 4 1 9 0 10-4"/>',
    leaf: '<path d="M5 19c0-8 5-14 15-15 0 9-5 15-13 15z"/><path d="M5 19c3-5 6-8 10-10"/>',
    baby: '<circle cx="12" cy="8" r="4"/><path d="M10.5 8h.01M13.5 8h.01"/><path d="M7 21c0-3 2.2-6 5-6s5 3 5 6"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 0 2 1h13v-3"/>',
    bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-8h5l3 8M10 8 12.5 16H6M14 5h2"/>',
    flower: '<circle cx="12" cy="8" r="2.2"/><path d="M12 5.8c0-2 2.5-2.5 3 0M14.2 8c2 0 2.5 2.5 0 3M12 10.2c0 2-2.5 2.5-3 0M9.8 8c-2 0-2.5-2.5 0-3"/><path d="M12 11v10M12 17c-2 0-4-1-4.5-3M12 15c2 0 3.5-1 4-2.5"/>',
    needle: '<path d="M20 4 7 17"/><path d="M5 19l2-2"/><path d="M17.5 4.5a1.4 1.4 0 0 1 2 2"/><path d="M3 21c2-4 6-3 7-6"/>',
    dumbbell: '<path d="M7 7v10M17 7v10M4 9.5v5M20 9.5v5M7 12h10"/>',
    car: '<path d="M4 15v-3l2-5h12l2 5v3z"/><path d="M4 15v3h3v-3M17 15v3h3v-3M4 12h16"/><circle cx="8" cy="13.6" r=".6"/><circle cx="16" cy="13.6" r=".6"/>',
    laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
    hand: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14"/><path d="M8 13l-1.5-1.5a1.6 1.6 0 0 0-2.3 2.2L8 19c1.2 1.3 2.6 2 4.5 2H13a4 4 0 0 0 4-4v-3"/>',
    bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
    bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
    bookmarked: '<path d="M6 4h12v17l-6-4-6 4z" fill="currentColor"/>',
    thumb: '<path d="M7 11v9H4v-9z"/><path d="M7 11l4-7c1.5 0 2.5 1 2.2 2.6L12.6 10H19a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7"/>',
    thumbdown: '<path d="M7 13V4H4v9z"/><path d="M7 13l4 7c1.5 0 2.5-1 2.2-2.6L12.6 14H19a2 2 0 0 0 2-2.3l-1.2-6A2 2 0 0 0 17.8 4H7"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    note: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/>',
    print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    rocket: '<path d="M12 15c-2-1-3-2-4-4 1.5-5 5-8 11-8 0 6-3 9.5-8 11z"/><path d="M8 11l-4 1 2-4h4M13 16l-1 4 4-2v-4"/><circle cx="14.5" cy="8.5" r="1.5"/>'
  };
  Object.keys(more).forEach(function (k) { UI.ICONS[k] = more[k]; });

  /* ---------------------------------------------------------------- formatting */
  BB.money = function (n, opts) {
    n = Number(n) || 0;
    var round = !(opts && opts.cents) && Math.abs(n) >= 100;
    return n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: round ? 0 : 2, minimumFractionDigits: round ? 0 : (n % 1 ? 2 : 0) });
  };
  BB.kmoney = function (n) {
    n = Number(n) || 0;
    if (n >= 1000) return '$' + (Math.round(n / 1000 * (n < 10000 ? 10 : 1)) / (n < 10000 ? 10 : 1)) + 'k';
    return '$' + Math.round(n);
  };
  BB.range = function (r) { return BB.kmoney(r[0]) + '–' + BB.kmoney(r[1]); };
  BB.weeks = function (w) {
    if (w[1] <= 8) return w[0] + '–' + w[1] + ' weeks';
    return Math.max(1, Math.round(w[0] / 4.3)) + '–' + Math.round(w[1] / 4.3) + ' months';
  };
  BB.dots = function (n) {
    var out = '<span class="bb-dots" aria-label="Difficulty ' + n + ' of 5">';
    for (var i = 1; i <= 5; i++) out += '<i class="' + (i <= n ? 'on' : '') + '"></i>';
    return out + '</span>';
  };
  BB.diffLabel = function (n) { return ['', 'Easy start', 'Approachable', 'Moderate', 'Demanding', 'Expert'][n] || ''; };
  BB.daysUntil = function (iso) {
    if (!iso) return null;
    var d = new Date(iso + 'T12:00:00'), now = new Date();
    return Math.round((d - now) / 86400000);
  };

  /* ---------------------------------------------------------------- plans: the checklist for a guide */
  BB.planPhases = function (guide, opts) {
    opts = opts || {};
    var flags = (guide && guide.flags) || [];
    var extras = (guide && guide.tasks) || [];
    return BB.phases.map(function (ph) {
      var tasks = BB.tasks.filter(function (t) {
        if (t.phase !== ph.id) return false;
        if (t.hiring && !opts.hiring) return false;
        if (t.when && !t.when.some(function (f) { return flags.indexOf(f) >= 0; })) return false;
        return true;
      }).concat(extras.filter(function (t) { return t.phase === ph.id; }).map(function (t) { var c = {}; for (var k in t) c[k] = t[k]; c.special = true; return c; }));
      return { id: ph.id, name: ph.name, icon: ph.icon, blurb: ph.blurb, tasks: tasks };
    }).filter(function (ph) { return ph.tasks.length; });
  };
  BB.planTaskIds = function (guide, opts) {
    var ids = [];
    BB.planPhases(guide, opts).forEach(function (ph) { ph.tasks.forEach(function (t) { ids.push(t.id); }); });
    return ids;
  };
  BB.planProgress = function (plan) {
    var g = BB.guide(plan.guide), ids = BB.planTaskIds(g, { hiring: plan.hiring });
    var done = ids.filter(function (id) { return (plan.done || []).indexOf(id) >= 0; }).length;
    return { done: done, total: ids.length, pct: ids.length ? Math.round(done * 100 / ids.length) : 0 };
  };
  BB.nextTasks = function (plan, n) {
    var g = BB.guide(plan.guide), out = [];
    BB.planPhases(g, { hiring: plan.hiring }).forEach(function (ph) {
      ph.tasks.forEach(function (t) { if ((plan.done || []).indexOf(t.id) < 0 && out.length < (n || 3)) out.push({ task: t, phase: ph }); });
    });
    return out;
  };
  /* the guide's typical costs as a starting cost sheet (midpoint of each range) */
  BB.starterCosts = function (guide) {
    return ((guide && guide.costs) || []).map(function (c) {
      return { label: c[0], amount: Math.round((c[1] + c[2]) / 2 / 10) * 10, kind: c[3] === 'monthly' ? 'monthly' : 'once' };
    });
  };

  /* ---------------------------------------------------------------- search */
  function plain(html) { return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' '); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  var index = null;
  function buildIndex() {
    index = [];
    BB.guides.forEach(function (g) {
      index.push({ kind: 'guide', item: g, head: norm(g.name + ' ' + g.fr + ' ' + g.tagline),
        body: norm(plain(g.intro) + ' ' + (g.rules || []).map(function (r) { return r[0] + ' ' + plain(r[1]); }).join(' ') + ' ' + (g.tips || []).join(' ') + ' ' + (g.pro || []).join(' ')) });
    });
    BB.topics.forEach(function (t) {
      index.push({ kind: 'topic', item: t, head: norm(t.title + ' ' + t.fr + ' ' + t.summary),
        body: norm((t.basics || []).concat(t.deeper || []).map(function (s) { return s[0] + ' ' + plain(s[1]); }).join(' ')) });
    });
    BB.glossary.forEach(function (w) { index.push({ kind: 'term', item: w, head: norm(w[0] + ' ' + w[1]), body: norm(w[2]) }); });
  }
  BB.search = function (q) {
    if (!index) buildIndex();
    var words = norm(q).split(/[^a-z0-9$]+/).filter(function (w) { return w.length > 1; });
    if (!words.length) return [];
    var out = [];
    index.forEach(function (e) {
      var score = 0, all = true;
      words.forEach(function (w) {
        var h = e.head.indexOf(w) >= 0, b = e.body.indexOf(w) >= 0;
        if (!h && !b) all = false;
        score += (h ? 6 : 0) + (b ? 1 : 0);
      });
      if (all && score) out.push({ kind: e.kind, item: e.item, score: score + (e.kind === 'guide' ? 1 : 0) });
    });
    return out.sort(function (a, b) { return b.score - a.score; });
  };

  /* ---------------------------------------------------------------- cards */
  BB.guideCard = function (g, extra) {
    return '<a class="ui-card bb-card bb-cat-' + esc(g.cat) + '" href="#guide/' + esc(g.slug) + '" data-go="guide/' + esc(g.slug) + '">' +
      '<div class="ui-row" style="gap:12px;flex-wrap:nowrap"><span class="bb-tile">' + UI.icon(g.icon) + '</span><div style="min-width:0"><h3>' + esc(g.name) + '</h3>' +
      '<div class="fr" style="margin-top:2px">' + esc(g.fr) + '</div></div></div>' +
      '<p>' + esc(g.tagline) + '</p><div class="meta"><span class="ui-badge">' + UI.icon('coins') + esc(BB.range(g.glance.cost)) + '</span>' +
      '<span class="ui-badge">' + UI.icon('clock') + esc(BB.weeks(g.glance.weeks)) + '</span>' +
      (g.glance.home ? '<span class="ui-badge accent">' + UI.icon('home') + 'Can start at home</span>' : '') + (extra || '') + '</div></a>';
  };
  BB.topicCard = function (t) {
    return '<a class="ui-card bb-card" href="#topic/' + esc(t.slug) + '" data-go="topic/' + esc(t.slug) + '">' +
      '<div class="ui-row" style="gap:12px;flex-wrap:nowrap"><span class="bb-tile teal">' + UI.icon(t.icon) + '</span><div style="min-width:0"><h3>' + esc(t.title) + '</h3>' +
      '<div class="fr" style="margin-top:2px">' + esc(t.fr) + '</div></div></div><p>' + esc(t.summary) + '</p>' +
      '<div class="meta"><span class="ui-badge">' + UI.icon('clock') + t.minutes + ' min read</span></div></a>';
  };
  BB.termRow = function (w) {
    return '<div class="ui-item"><div class="grow"><h3 style="margin-bottom:2px">' + esc(w[0]) + ' <span class="muted" style="font:500 .9rem var(--font-body)">· ' + esc(w[1]) + '</span></h3><p class="muted">' + esc(w[2]) + '</p></div></div>';
  };
  BB.sourceLinks = function (links) {
    if (!links || !links.length) return '';
    return '<div class="bb-sources">' + links.map(function (l) {
      return '<a href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + UI.icon('external') + esc(l[0]) + '</a>';
    }).join('') + '</div>';
  };
  BB.checkNote = function () {
    return '<div class="bb-note">' + UI.icon('info') + '<div>Checked in ' + esc(BB.updated) + '. Fees and rules change every year and can differ by borough: confirm with the official source before you pay or sign. This is general information, not legal or tax advice.</div></div>';
  };

  /* ---------------------------------------------------------------- save + "was this helpful?" */
  /* view: the page's element (listeners go there, so they never pile up); box: where the Save button goes;
     voteBox: where the helpful vote goes. Returns the Promise of page_state. */
  BB.pageBar = function (view, box, voteBox, kind, slug, me) {
    var state = null;
    function drawSave() {
      if (!box) return;
      if (!me) { box.innerHTML = '<a class="ui-btn" href="#auth/signup" data-go="auth/signup">' + UI.icon('bookmark') + 'Save</a>'; return; }
      box.innerHTML = '<button class="ui-btn' + (state && state.saved ? ' accent' : '') + '" data-save aria-pressed="' + !!(state && state.saved) + '">' +
        UI.icon(state && state.saved ? 'bookmarked' : 'bookmark') + (state && state.saved ? 'Saved' : 'Save') + '</button>';
    }
    function drawVote() {
      if (!voteBox) return;
      var v = state ? state.my_vote : null;
      voteBox.innerHTML = '<div class="bb-vote"><strong style="margin-right:4px">Was this page helpful?</strong>' +
        '<button class="ui-btn sm' + (v === true ? ' on' : '') + '" data-vote="1">' + UI.icon('thumb') + 'Yes</button>' +
        '<button class="ui-btn sm' + (v === false ? ' on' : '') + '" data-vote="0">' + UI.icon('thumbdown') + 'Not really</button>' +
        '<span class="ui-spacer"></span><span class="small muted">' + (state && state.votes ? state.helpful + ' of ' + state.votes + ' found it helpful' : 'Be the first to say') +
        (state && state.views ? ' · ' + UI.plural(state.views, 'view') : '') + '</span>' +
        '<button class="ui-btn sm ghost" data-feedback="other">' + UI.icon('flag') + 'Report outdated info</button></div>';
    }
    function onClick(e) {
      var s = e.target.closest('[data-save]');
      if (s && box && box.contains(s)) {
        UI.busy(s, UI.api('toggle_save', kind, slug)).then(function (r) { state.saved = r.saved; drawSave(); UI.toast(r.saved ? 'Saved to your dashboard' : 'Removed from saved', 'ok'); });
        return;
      }
      var v = e.target.closest('[data-vote]');
      if (v && voteBox && voteBox.contains(v)) {
        UI.apiQuiet('vote', kind, slug, v.getAttribute('data-vote') === '1').then(function (r) {
          state.helpful = r.helpful; state.votes = r.votes; state.my_vote = r.my_vote; drawVote(); UI.toast('Thanks for the feedback!', 'ok');
        });
      }
    }
    view.addEventListener('click', onClick);
    drawSave(); drawVote();
    return UI.apiQuiet('page_state', kind, slug).then(function (r) { state = r; drawSave(); drawVote(); return r; }, function () { state = { saved: false }; drawSave(); drawVote(); return null; });
  };

  /* ---------------------------------------------------------------- the storefront street (landing, home) */
  BB.street = function () {
    function awning(x, w, cls) {
      var n = Math.round(w / 26), sw = w / n, s = '';
      for (var i = 0; i < n; i++) s += '<rect class="' + (i % 2 ? 'aw-b' : cls) + '" x="' + (x + i * sw) + '" y="118" width="' + sw + '" height="26"/>';
      for (i = 0; i < n; i++) s += '<path class="' + (i % 2 ? 'aw-b' : cls) + '" d="M' + (x + i * sw) + ' 144a' + (sw / 2) + ' ' + (sw / 2.4) + ' 0 0 0 ' + sw + ' 0z"/>';
      return s + '<path class="line" d="M' + x + ' 118h' + w + '"/>';
    }
    return '<svg class="bb-street" viewBox="0 0 560 330" role="img" aria-label="Three little shops on a Montréal street: a bakery, a barber and a café">' +
      '<rect class="sky" x="0" y="0" width="560" height="330" rx="28"/>' +
      '<circle class="tree" cx="520" cy="190" r="34"/><rect x="516" y="210" width="8" height="70" class="ink"/>' +
      // bakery
      '<rect class="wall" x="28" y="60" width="160" height="220"/><rect class="sign" x="48" y="78" width="120" height="28" rx="6"/><text class="signtx" x="108" y="97" text-anchor="middle">BOULANGERIE</text>' +
      awning(28, 160, 'aw-a') + '<rect class="glass" x="44" y="168" width="70" height="70" rx="4"/><rect class="door" x="128" y="168" width="44" height="112" rx="3"/>' +
      '<path class="line" d="M56 214c10-14 36-14 46 0M60 214h38"/><circle class="ink" cx="164" cy="226" r="3"/>' +
      // barber
      '<rect class="wall2" x="200" y="40" width="150" height="240"/><rect class="sign" x="215" y="58" width="120" height="28" rx="6"/><text class="signtx" x="275" y="77" text-anchor="middle">BARBIER</text>' +
      awning(200, 150, 'aw-c') + '<rect class="glass" x="214" y="168" width="64" height="70" rx="4"/><rect class="door2" x="292" y="168" width="44" height="112" rx="3"/>' +
      '<rect x="234" y="182" width="10" height="44" rx="5" fill="#fbf6ee" stroke="var(--c-ink)" stroke-width="2.5"/><path d="M234 190l10 8M234 202l10 8M234 214l10 8" stroke="var(--c-stripe)" stroke-width="3"/>' +
      // café
      '<rect class="wall" x="362" y="70" width="150" height="210"/><rect class="sign" x="377" y="88" width="120" height="28" rx="6"/><text class="signtx" x="437" y="107" text-anchor="middle">CAFÉ</text>' +
      awning(362, 150, 'aw-a') + '<rect class="glass" x="376" y="168" width="70" height="70" rx="4"/><rect class="door" x="458" y="168" width="40" height="112" rx="3"/>' +
      '<path class="line" d="M395 222h28v-16h-28zM423 210h5a4 4 0 0 1 0 8h-5M402 200c0-4 4-4 4-8M412 200c0-4 4-4 4-8"/>' +
      '<rect class="ground" x="0" y="280" width="560" height="50"/><path class="line" d="M0 280h560"/>' +
      '<rect x="60" y="292" width="40" height="5" rx="2.5" class="ink" opacity=".25"/><rect x="250" y="300" width="60" height="5" rx="2.5" class="ink" opacity=".25"/><rect x="430" y="292" width="40" height="5" rx="2.5" class="ink" opacity=".25"/>' +
      '</svg>';
  };

  BB.BOROUGHS = ['Ahuntsic-Cartierville', 'Anjou', 'Côte-des-Neiges–Notre-Dame-de-Grâce', 'L\'Île-Bizard–Sainte-Geneviève', 'Lachine', 'LaSalle',
    'Le Plateau-Mont-Royal', 'Le Sud-Ouest', 'Mercier–Hochelaga-Maisonneuve', 'Montréal-Nord', 'Outremont', 'Pierrefonds-Roxboro',
    'Rivière-des-Prairies–Pointe-aux-Trembles', 'Rosemont–La Petite-Patrie', 'Saint-Laurent', 'Saint-Léonard', 'Verdun', 'Ville-Marie',
    'Villeray–Saint-Michel–Parc-Extension', 'Another city on the island (Westmount, Dorval…)', 'Not decided yet'];
})();

/* ===== admin.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['overview', 'Overview', 'grid'], ['content', 'Content', 'book'], ['feedback', 'Feedback', 'inbox'], ['users', 'Users', 'users'], ['demo', 'Demo data', 'database']];

  UI.page('admin', { title: 'Admin', auth: 'admin' }, function (view, ctx) {
    var tab = TABS.some(function (t) { return t[0] === ctx.args[0]; }) ? ctx.args[0] : 'overview';
    var fbFilter = 'new';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><h1>Admin</h1><p class="muted">Only admins see this page.</p></div></div>' +
      '<nav class="ui-tabs">' + TABS.map(function (t) {
        return '<a href="#admin/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>';
      }).join('') + '</nav><div data-body><div class="ui-skel"></div></div></div>';
    var body = view.querySelector('[data-body]');

    function overview() {
      return UI.api('admin_overview').then(function (d) {
        var stat = function (n, label, go) { return '<a class="ui-card ui-stat" href="#admin/' + go + '" style="text-decoration:none;color:inherit"><b>' + n + '</b><span>' + label + '</span></a>'; };
        body.innerHTML = '<div class="ad-stats">' + stat(d.users, 'people signed up', 'users') + stat(d.admins, UI.plural(d.admins, 'admin').replace(/^\d+ /, ''), 'users') +
          stat(d.feedback_new, 'new feedback', 'feedback') + stat(d.plans, 'launch plans', 'content') + stat(d.votes, 'helpful votes', 'content') + '</div>' +
          '<p class="muted small" style="margin-top:18px">Demo data is <b>' + esc(d.demo.state) + '</b> (' + d.demo.counts.users + ' demo people). Manage it in the Demo data tab.</p>';
      });
    }

    function feedback() {
      return UI.api('list_feedback', null).then(function (d) {
        var items = d.items.filter(function (i) { return fbFilter === 'all' || i.status === fbFilter; });
        body.innerHTML = '<div class="ui-row" style="margin-bottom:16px"><div class="ui-seg">' + [['new', 'New'], ['read', 'Read'], ['done', 'Done'], ['all', 'All']].map(function (f) {
          var n = f[0] === 'all' ? d.items.length : d.counts[f[0]];
          return '<button data-filter="' + f[0] + '" class="' + (fbFilter === f[0] ? 'on' : '') + '">' + f[1] + ' (' + n + ')</button>';
        }).join('') + '</div></div>' +
          (items.length ? '<div class="ad-fb">' + items.map(function (i) {
            var c = i.context || {};
            return '<div class="ui-item" data-id="' + esc(i.id) + '"><div class="meta"><span class="ui-badge ' + (i.kind === 'bug' ? 'bad' : i.kind === 'idea' ? 'brand' : '') + '">' + esc(i.kind_label) + '</span>' +
              '<b>' + esc(i.name) + '</b>' + (i.email ? '<a href="mailto:' + esc(i.email) + '">' + esc(i.email) + '</a>' : '') + '<span>' + esc(UI.fmtDateTime(i.created)) + '</span></div>' +
              '<p class="msg">' + esc(i.message) + '</p>' +
              '<div class="ctx">' + esc([c.page, c.screen, c.theme, c.browser].filter(Boolean).join(' · ')) + '</div>' +
              '<textarea data-note placeholder="Private note (only admins see it)">' + esc(i.note) + '</textarea>' +
              '<div class="ui-row" style="margin-top:10px">' + ['new', 'read', 'done'].map(function (s) {
                return '<button class="ui-btn sm' + (i.status === s ? ' primary' : '') + '" data-status="' + s + '">' + s[0].toUpperCase() + s.slice(1) + '</button>';
              }).join('') + '<span class="ui-spacer"></span><button class="ui-btn sm danger" data-del-fb>' + UI.icon('trash') + 'Delete</button></div></div>';
          }).join('') + '</div>'
            : '<div class="ui-empty">' + UI.icon('inbox') + '<h3>No ' + (fbFilter === 'all' ? '' : fbFilter + ' ') + 'messages</h3><p>Messages from the "Send feedback" form show up here.</p></div>');
      });
    }

    function users(query) {
      return UI.api('list_users', query || null).then(function (d) {
        body.innerHTML = '<form class="ui-row" data-search style="margin-bottom:14px"><input type="search" name="q" placeholder="Search by name or email" value="' + esc(query || '') + '" style="max-width:360px">' +
          '<button class="ui-btn" type="submit">' + UI.icon('search') + 'Search</button><span class="muted small">' + UI.plural(d.total, 'person', 'people') + '</span></form>' +
          '<table class="ad-users"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Admin</th><th>Active</th></tr></thead><tbody>' +
          d.users.map(function (u) {
            return '<tr data-id="' + esc(u.id) + '"><td><b>' + esc(u.name) + '</b></td><td class="email">' + esc(u.email) + '</td><td class="joined muted">' + esc(UI.fmtDate(u.joined)) + '</td>' +
              '<td><label class="ui-check"><input type="checkbox" data-admin' + (u.is_admin ? ' checked' : '') + '> Admin</label></td>' +
              '<td><label class="ui-check"><input type="checkbox" data-enabled' + (u.enabled ? ' checked' : '') + '> Active</label></td></tr>';
          }).join('') + '</tbody></table>';
      });
    }

    function demo() {
      return UI.api('admin_overview').then(function (d) {
        var c = d.demo.counts;
        body.innerHTML = '<div class="ui-card ui-narrow" style="margin:0"><h3>Demo data</h3>' +
          '<p class="muted">Example people and content, so the app never looks empty for the first visitors. Demo rows are flagged, so removing them never touches real data. Once removed, it stays removed until you load it again.</p>' +
          '<p>Status: <b>' + esc(d.demo.state) + '</b> · ' + Object.keys(c).map(function (k) { return c[k] + ' ' + esc(k); }).join(', ') + '</p>' +
          '<div class="ui-row"><button class="ui-btn primary" data-demo="load">' + UI.icon('refresh') + (d.demo.state === 'loaded' ? 'Reload demo data' : 'Load demo data') + '</button>' +
          '<button class="ui-btn danger" data-demo="remove">' + UI.icon('trash') + 'Remove demo data</button></div></div>';
      });
    }

    function content() {
      return UI.api('admin_content').then(function (d) {
        var BB = window.BB, rows = d.pages.map(function (p) {
          var it = p.kind === 'guide' ? BB.guide(p.slug) : BB.topic(p.slug);
          p.title = it ? (it.name || it.title) : p.slug + ' (unknown)';
          p.pct = p.up + p.down ? Math.round(p.up * 100 / (p.up + p.down)) : null;
          return p;
        });
        // pages nobody opened yet still show, so the list doubles as a content inventory
        BB.guides.forEach(function (g) { if (!rows.some(function (r) { return r.kind === 'guide' && r.slug === g.slug; })) rows.push({ kind: 'guide', slug: g.slug, title: g.name, views: 0, up: 0, down: 0, plans: 0, pct: null }); });
        BB.topics.forEach(function (t) { if (!rows.some(function (r) { return r.kind === 'topic' && r.slug === t.slug; })) rows.push({ kind: 'topic', slug: t.slug, title: t.title, views: 0, up: 0, down: 0, plans: 0, pct: null }); });
        body.innerHTML = '<p class="muted">Views include demo numbers while the demo data is loaded. Content lives in <code>web/pages/_kb_*.html</code> (last checked ' + esc(BB.updated) + '). Pages with "not helpful" votes or outdated-info reports in Feedback are the first to review.</p>' +
          '<table class="ad-users"><thead><tr><th>Page</th><th>Type</th><th>Views</th><th>Helpful</th><th>Plans</th></tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr><td><a href="#' + r.kind + '/' + esc(r.slug) + '" data-go="' + r.kind + '/' + esc(r.slug) + '"><b>' + esc(r.title) + '</b></a></td><td class="muted">' + (r.kind === 'guide' ? 'Guide' : 'Basics') + '</td>' +
              '<td>' + r.views + '</td><td>' + (r.pct == null ? '<span class="muted">–</span>' : '<span class="ui-badge ' + (r.pct >= 70 ? 'good' : r.pct >= 40 ? 'warn' : 'bad') + '">' + r.pct + '% of ' + (r.up + r.down) + '</span>') + '</td>' +
              '<td>' + (r.kind === 'guide' ? r.plans : '<span class="muted">–</span>') + '</td></tr>';
          }).join('') + '</tbody></table>';
      });
    }

    var DRAW = { overview: overview, content: content, feedback: feedback, users: users, demo: demo };

    view.addEventListener('click', function (e) {
      var f = e.target.closest('[data-filter]');
      if (f) { fbFilter = f.getAttribute('data-filter'); feedback(); return; }
      var st = e.target.closest('[data-status]');
      if (st) {
        var card = st.closest('[data-id]');
        UI.api('set_feedback_status', card.getAttribute('data-id'), st.getAttribute('data-status'), card.querySelector('[data-note]').value).then(function () { UI.toast('Saved', 'ok'); feedback(); });
        return;
      }
      var del = e.target.closest('[data-del-fb]');
      if (del) {
        UI.confirm({ title: 'Delete this message?', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_feedback', del.closest('[data-id]').getAttribute('data-id')).then(feedback);
        });
        return;
      }
      var dm = e.target.closest('[data-demo]');
      if (dm) {
        var load = dm.getAttribute('data-demo') === 'load';
        UI.confirm({ title: load ? 'Load the demo data?' : 'Remove the demo data?', text: load ? 'Demo people and content are added (any old demo rows are replaced).' : 'Every demo row is deleted. Real data stays.', ok: load ? 'Load' : 'Remove', danger: !load })
          .then(function (yes) { if (yes) UI.busy(dm, UI.api(load ? 'demo_load' : 'demo_remove')).then(function () { UI.toast('Done', 'ok'); demo(); }); });
      }
    });
    view.addEventListener('change', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (!row) return;
      var id = row.getAttribute('data-id'), box = e.target;
      var fn = box.hasAttribute('data-admin') ? 'set_admin' : box.hasAttribute('data-enabled') ? 'set_enabled' : null;
      if (fn) UI.api(fn, id, box.checked).then(function () { UI.toast('Saved', 'ok'); }, function (err) { box.checked = !box.checked; UI.toast(err.message, 'error'); });
    });
    view.addEventListener('submit', function (e) {
      if (e.target.matches('[data-search]')) { e.preventDefault(); users(UI.formData(e.target).q); }
    });
    return DRAW[tab]();
  });
})();

/* ===== auth.html ===== */
(function () {
  var esc = UI.esc;
  function pw(name, auto) {
    return '<div class="au-pw"><input type="password" name="' + name + '" autocomplete="' + auto + '" required minlength="8">' +
      '<button type="button" data-show>Show</button></div>';
  }
  UI.page('auth', { title: 'Sign in', auth: 'guest' }, function (view, ctx) {
    var mode = ['signup', 'reset'].indexOf(ctx.args[0]) >= 0 ? ctx.args[0] : 'login';
    function draw(msg, isErr) {
      var heading = { login: 'Welcome back', signup: 'Create your account', reset: 'Reset your password' }[mode];
      var sub = { login: 'Sign in to continue to ' + esc(UI.config.name) + '.', signup: 'It\'s free and takes a few seconds.',
        reset: 'We\'ll email you a link to choose a new password.' }[mode];
      view.innerHTML = '<div class="au-wrap"><div class="ui-card au-card">' +
        '<h1>' + heading + '</h1><p class="muted">' + sub + '</p>' +
        (mode !== 'reset' ? '<div class="ui-seg" role="tablist"><button type="button" data-mode="login" class="' + (mode === 'login' ? 'on' : '') + '">Sign in</button>' +
          '<button type="button" data-mode="signup" class="' + (mode === 'signup' ? 'on' : '') + '">Create account</button></div>' : '<div style="height:14px"></div>') +
        '<form class="ui-stack" data-form="' + mode + '" novalidate>' +
        (mode === 'signup' ? '<label class="ui-field"><span>Your name</span><input type="text" name="name" autocomplete="name" required maxlength="60"></label>' : '') +
        '<label class="ui-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>' +
        (mode === 'login' ? '<label class="ui-field"><span>Password</span>' + pw('password', 'current-password') + '</label>' : '') +
        (mode === 'signup' ? '<label class="ui-field"><span>Password <em>(at least 8 characters)</em></span>' + pw('password', 'new-password') + '</label>' +
          (window.LegalKit ? '<div>' + LegalKit.consentField() + '</div>' : '') : '') +
        '<div data-msg role="alert"' + (msg ? ' class="' + (isErr ? 'ui-error' : 'ui-note') + '">' + esc(msg) : ' hidden>') + '</div>' +
        '<button class="ui-btn primary block" type="submit">' + { login: 'Sign in', signup: 'Create account', reset: 'Send the link' }[mode] + '</button></form>' +
        '<div class="au-links">' + (mode === 'login' ? '<a data-mode="reset">Forgot your password?</a>' : '<a data-mode="login">' + UI.icon('back') + ' Back to sign in</a>') +
        '<a href="#landing" data-go="landing">About ' + esc(UI.config.name) + '</a></div></div></div>';
      var first = view.querySelector('input');
      if (first && !msg) first.focus();
    }
    view.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mode]');
      if (m) { e.preventDefault(); mode = m.getAttribute('data-mode'); history.replaceState(null, '', '#auth' + (mode === 'login' ? '' : '/' + mode)); draw(); return; }
      var s = e.target.closest('[data-show]');
      if (s) { var i = s.parentNode.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; s.textContent = i.type === 'password' ? 'Show' : 'Hide'; }
    });
    view.addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target, v = UI.formData(form);
      var problem = !/^\S+@\S+\.\S+$/.test(v.email || '') ? 'Please enter a valid email address.'
        : mode !== 'reset' && (v.password || '').length < (mode === 'signup' ? 8 : 1) ? (mode === 'signup' ? 'Please choose a password of at least 8 characters.' : 'Please enter your password.')
        : mode === 'signup' && (v.name || '').trim().length < 2 ? 'Please tell us your name.' : null;
      if (problem) { say(problem, true); return; }
      if (mode === 'signup' && window.LegalKit && !LegalKit.consentChecked(form)) return;  // the kit shows its own message
      UI.busy(form.querySelector('[type=submit]'), UI.auth(mode, v)).then(function (r) {
        if (mode === 'reset' || (r && !r.me)) { mode = 'login'; draw(r && r.message, false); restore({ email: v.email }); }
        else UI.toast(mode === 'signup' ? 'Welcome to ' + UI.config.name + '!' : 'Welcome back!', 'ok');
      }, function (err) { say(err.message, true); });
    });
    function say(msg, isErr) {
      var box = view.querySelector('[data-msg]');
      box.className = isErr ? 'ui-error' : 'ui-note'; box.textContent = msg; box.hidden = false;
    }
    function restore(v) {
      ['name', 'email'].forEach(function (k) { var i = view.querySelector('[name=' + k + ']'); if (i && v[k]) i.value = v[k]; });
    }
    draw();
  });
})();

/* ===== basics.html ===== */
(function () {
  var esc = UI.esc, BB = window.BB;
  UI.page('basics', { title: 'The Basics', nav: 'Basics', icon: 'map', order: 30 }, function (view, ctx) {
    var stages = BB.stages.map(function (s) { return { s: s, ts: BB.topics.filter(function (t) { return t.stage === s.id; }) }; });
    var picks = BB.glossary.filter(function (w) { return ['Arrondissement', 'NEQ', 'TPS / TVQ', 'Certificat (permis) d\'occupation', 'Bail commercial', 'MAPAQ'].indexOf(w[0]) >= 0; });
    view.innerHTML = '<div class="ui-wrap"><section class="bs-hero"><div><div class="eyebrow">For every kind of business</div><h1>The Montréal basics</h1>' +
      '<p class="lead">' + BB.topics.length + ' short, practical topics on what every small business here has to deal with: registering, taxes, borough permits, leases, hiring, French rules. Each one has the basics and a "going deeper" part.</p>' +
      '<div class="ui-row" style="margin-top:18px"><a class="ui-btn primary" href="#topic/roadmap" data-go="topic/roadmap">' + UI.icon('map') + 'Start with the roadmap</a>' +
      '<a class="ui-btn" href="#glossary" data-go="glossary">' + UI.icon('book') + 'French ⇄ English glossary</a></div></div>' +
      '<div class="bs-steps">' + stages.map(function (x) { return '<a class="bs-step" href="#basics" data-stage="' + x.s.id + '"><b>' + esc(x.s.name) + '</b><span class="ui-spacer"></span><span class="muted small">' + UI.plural(x.ts.length, 'topic') + '</span></a>'; }).join('') + '</div></section>' +
      stages.map(function (x, i) {
        return '<section class="bs-stage" id="bs-' + x.s.id + '"><div class="bs-stage-head"><span class="n">' + (i + 1) + '</span><h2>' + esc(x.s.name) + '</h2></div>' +
          '<div class="ui-grid">' + x.ts.map(BB.topicCard).join('') + '</div></section>';
      }).join('') +
      '<section class="bs-stage"><div class="bs-stage-head">' + UI.icon('book') + '<h2>Words you\'ll hear at the counter</h2></div>' +
      '<div class="bs-gloss">' + picks.map(function (w) { return '<div><b>' + esc(w[0]) + '</b><span>' + esc(w[1]) + '</span></div>'; }).join('') + '</div>' +
      '<a class="ui-btn" href="#glossary" data-go="glossary">See all ' + BB.glossary.length + ' terms ' + UI.icon('arrow') + '</a></section>' +
      '<section class="bs-stage"><div class="bs-stage-head">' + UI.icon('external') + '<h2>Official starting points</h2></div><div class="ui-card">' + BB.sourceLinks(BB.sources) + '</div>' +
      '<div style="margin-top:14px">' + BB.checkNote() + '</div></section></div>';
    view.addEventListener('click', function (e) {
      var s = e.target.closest('[data-stage]');
      if (s) { e.preventDefault(); var el = view.querySelector('#bs-' + s.getAttribute('data-stage')); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
    });
  });
})();

/* ===== glossary.html ===== */
(function () {
  var esc = UI.esc, BB = window.BB;
  UI.page('glossary', { title: 'Glossary' }, function (view) {
    view.innerHTML = '<div class="ui-wrap"><section class="gl-head"><nav class="gd-crumbs"><a href="#basics" data-go="basics">The Basics</a><span>›</span><span>Glossary</span></nav>' +
      '<h1>French ⇄ English glossary</h1><p class="muted" style="font-size:1.1rem">The words on the forms and at the counter, with what they mean for your business.</p>' +
      '<div class="bb-search" style="margin-top:16px">' + UI.icon('search') + '<input type="search" data-filter placeholder="Filter: bail, TVQ, permit…" aria-label="Filter the glossary"></div></section><div class="gl-list" data-list></div></div>';
    var list = view.querySelector('[data-list]');
    function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    function draw(q) {
      var words = BB.glossary.slice().sort(function (a, b) { return norm(a[0]).localeCompare(norm(b[0])); })
        .filter(function (w) { return !q || norm(w.join(' ')).indexOf(norm(q)) >= 0; });
      var last = '';
      list.innerHTML = words.length ? words.map(function (w) {
        var l = norm(w[0]).charAt(0).toUpperCase(), head = l !== last ? '<div class="gl-letter">' + esc(l) + '</div>' : '';
        last = l;
        return head + BB.termRow(w);
      }).join('') : '<div class="ui-empty">' + UI.icon('book') + '<h3>No term matches</h3><p>Try a French or English word.</p></div>';
    }
    view.querySelector('[data-filter]').addEventListener('input', function (e) { draw(e.target.value.trim()); });
    draw('');
  });
})();

/* ===== guide.html ===== */
(function () {
  var esc = UI.esc, BB = window.BB;

  UI.page('guide', { title: function (a) { var g = BB.guide(a[0]); return g ? g.name : 'Guide'; } }, function (view, ctx) {
    var g = BB.guide(ctx.args[0]);
    if (!g) {
      view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('search') + '<h3>We don\'t have that guide</h3><p>It may have moved. Browse all the guides instead.</p>' +
        '<a class="ui-btn primary" href="#library" data-go="library">All guides</a></div></div>';
      return Promise.resolve();
    }
    var cat = BB.category(g.cat), totalOnce = [0, 0], totalMonthly = [0, 0];
    g.costs.forEach(function (c) { var t = c[3] === 'monthly' ? totalMonthly : totalOnce; t[0] += c[1]; t[1] += c[2]; });
    var phases = BB.planPhases(g, {});
    var secs = [['overview', 'Overview'], ['permits', 'Permits you\'ll need'], ['rules', 'What\'s special'], ['costs', 'Startup costs'], ['money', 'The money'],
      ['tips', 'Tips'], ['deeper', 'Going deeper'], ['pitfalls', 'Pitfalls'], ['roadmap', 'Your roadmap'], ['sources', 'Sources']];

    function costTable(kind, caption, total) {
      var rows = g.costs.filter(function (c) { return (c[3] === 'monthly') === (kind === 'monthly'); });
      if (!rows.length) return '';
      return '<table class="gd-costs" style="margin-bottom:22px"><caption>' + esc(caption) + '</caption><thead><tr><th>Item</th><th class="n">Low</th><th class="n">High</th></tr></thead><tbody>' +
        rows.map(function (c) { return '<tr><td>' + esc(c[0]) + '</td><td class="n">' + BB.money(c[1]) + '</td><td class="n">' + BB.money(c[2]) + '</td></tr>'; }).join('') +
        '<tr class="total"><td>Total' + (kind === 'monthly' ? ' per month' : '') + '</td><td class="n">' + BB.money(total[0]) + '</td><td class="n">' + BB.money(total[1]) + '</td></tr></tbody></table>';
    }
    function permitCard(id) {
      var p = BB.permits[id];
      if (!p) return '';
      return '<div class="ui-card gd-permit"><h4>' + esc(p.name) + '</h4><div class="fr">' + esc(p.fr) + '</div><dl>' +
        '<dt>From</dt><dd>' + esc(p.who) + '</dd><dt>Cost</dt><dd>' + esc(p.cost) + '</dd><dt>When</dt><dd>' + esc(p.when) + '</dd></dl>' +
        '<div class="ui-row" style="margin-top:10px;gap:14px">' + (p.topic ? '<a class="small" href="#topic/' + esc(p.topic) + '" data-go="topic/' + esc(p.topic) + '">How it works</a>' : '') +
        (p.url ? '<a class="small" href="' + esc(p.url) + '" target="_blank" rel="noopener">Official page ' + UI.icon('external') + '</a>' : '') + '</div></div>';
    }

    view.innerHTML = '<div class="ui-wrap"><section class="gd-hero bb-cat-' + esc(g.cat) + '">' +
      '<nav class="gd-crumbs" aria-label="Breadcrumb"><a href="#library" data-go="library">Guides</a><span>›</span><a href="#library/' + esc(g.cat) + '" data-go="library/' + esc(g.cat) + '">' + esc(cat ? cat.name : '') + '</a></nav>' +
      '<div class="gd-title"><span class="bb-tile lg">' + UI.icon(g.icon) + '</span><div><div class="eyebrow" style="margin-bottom:6px">How to start it in Montréal</div><h1>' + esc(g.name) + '</h1>' +
      '<div class="fr">' + esc(g.fr) + '</div><p class="lead">' + esc(g.tagline) + '</p></div></div>' +
      '<div class="gd-glance"><div><span>Startup cost</span><b>' + esc(BB.range(g.glance.cost)) + '</b></div><div><span>Time to open</span><b>' + esc(BB.weeks(g.glance.weeks)) + '</b></div>' +
      '<div><span>Difficulty</span><b>' + BB.dots(g.glance.difficulty) + ' <small style="font:500 .85rem var(--font-body);color:var(--c-muted)">' + esc(BB.diffLabel(g.glance.difficulty)) + '</small></b></div>' +
      '<div><span>At home?</span><b>' + (g.glance.home ? 'Possible' : 'Needs premises') + '</b></div></div>' +
      '<div class="gd-actions"><span data-plan-btn><a class="ui-btn primary" href="#plan/new/' + esc(g.slug) + '" data-go="plan/new/' + esc(g.slug) + '">' + UI.icon('rocket') + 'Start my launch plan</a></span>' +
      '<span data-save-box></span><button class="ui-btn ghost" data-print>' + UI.icon('print') + 'Print</button></div></section>' +
      '<div class="gd-layout"><nav class="gd-toc" aria-label="On this page">' + secs.map(function (s) { return '<a href="#guide/' + esc(g.slug) + '" data-jump="' + s[0] + '">' + esc(s[1]) + '</a>'; }).join('') + '</nav><article>' +
      '<section class="gd-sec" id="gd-overview"><h2>' + UI.icon('info') + 'Overview</h2><div class="bb-prose">' + g.intro + '</div>' + BB.checkNote() + '</section>' +
      '<section class="gd-sec" id="gd-permits"><h2>' + UI.icon('stamp') + 'Permits you\'ll need</h2><p class="muted">The registrations and licences that usually apply. Your exact list depends on your address and setup: the permit finder in Tools helps.</p>' +
        '<div class="gd-permits">' + g.permits.map(permitCard).join('') + '</div></section>' +
      '<section class="gd-sec" id="gd-rules"><h2>' + UI.icon('shield') + 'What\'s special about this business</h2>' + g.rules.map(function (r) { return '<div class="gd-rule"><h3>' + esc(r[0]) + '</h3><div class="bb-prose">' + r[1] + '</div></div>'; }).join('') + '</section>' +
      '<section class="gd-sec" id="gd-costs"><h2>' + UI.icon('coins') + 'Startup costs</h2><p class="muted">Rough Montréal ranges for a 1–2 person business, before taxes. Your plan turns these into your own cost sheet.</p>' +
        costTable('once', 'One-time costs', totalOnce) + costTable('monthly', 'Monthly costs', totalMonthly) +
        '<div class="ui-note">To open safely, have the one-time costs <b>plus about 6 months of monthly costs</b> and a 15% cushion: roughly <b>' + BB.money((totalOnce[0] + 6 * totalMonthly[0]) * 1.15) + ' to ' + BB.money((totalOnce[1] + 6 * totalMonthly[1]) * 1.15) + '</b>.</div></section>' +
      '<section class="gd-sec" id="gd-money"><h2>' + UI.icon('chart') + 'The money</h2><div class="bb-prose">' + g.money + '</div>' +
        '<a class="ui-btn sm" href="#tools/breakeven" data-go="tools/breakeven">' + UI.icon('chart') + 'Try the break-even calculator</a></section>' +
      '<section class="gd-sec" id="gd-tips"><h2>' + UI.icon('bulb') + 'Tips to start right</h2><ul class="gd-list good">' + g.tips.map(function (t) { return '<li>' + UI.icon('check') + '<span>' + esc(t) + '</span></li>'; }).join('') + '</ul></section>' +
      '<section class="gd-sec" id="gd-deeper"><h2>' + UI.icon('sparkle') + 'Going deeper <span class="ui-badge accent" style="font-family:var(--font-body)">Advanced</span></h2><ul class="gd-list pro">' + g.pro.map(function (t) { return '<li>' + UI.icon('star') + '<span>' + esc(t) + '</span></li>'; }).join('') + '</ul></section>' +
      '<section class="gd-sec" id="gd-pitfalls"><h2>' + UI.icon('flag') + 'Common pitfalls</h2><ul class="gd-list bad">' + g.pitfalls.map(function (t) { return '<li>' + UI.icon('x') + '<span>' + esc(t) + '</span></li>'; }).join('') + '</ul></section>' +
      '<section class="gd-sec" id="gd-roadmap"><h2>' + UI.icon('map') + 'Your roadmap</h2><div class="gd-road">' + phases.map(function (ph, i) {
        var special = ph.tasks.filter(function (t) { return t.special; });
        return '<div class="gd-phase"><span class="num">' + (i + 1) + '</span><div><h4>' + esc(ph.name) + ' <span class="muted small" style="font-weight:500">· ' + UI.plural(ph.tasks.length, 'step') + '</span></h4>' +
          '<p>' + esc(ph.tasks.slice(0, 3).map(function (t) { return t.t; }).join(' · ')) + (ph.tasks.length > 3 ? ' · …' : '') + '</p>' +
          (special.length ? '<p style="margin-top:4px"><span class="ui-badge brand wrap">' + UI.icon('star') + 'Specific to this business: ' + esc(special.map(function (t) { return t.t; }).join('; ')) + '</span></p>' : '') + '</div></div>';
      }).join('') + '</div>' +
        '<div class="gd-plan-cta"><div class="bb-awning"></div><span class="bb-tile lg" style="background:var(--c-stripe);color:#fff">' + UI.icon('rocket') + '</span>' +
        '<div style="flex:1;min-width:220px"><h3>Turn this into your own checklist</h3><p>Tick off each step, keep notes, track your startup budget and your opening date. Free.</p></div>' +
        '<span data-plan-btn2><a class="ui-btn lg" href="#plan/new/' + esc(g.slug) + '" data-go="plan/new/' + esc(g.slug) + '">Start my plan ' + UI.icon('arrow') + '</a></span></div></section>' +
      '<section class="gd-sec" id="gd-sources"><h2>' + UI.icon('external') + 'Official sources</h2>' + BB.sourceLinks((g.links || []).concat([['BizPaL: permits for your activity and address', 'https://bizpal-perle.ca/']])) +
        '<h3 style="margin-top:26px">Read next in the Basics</h3><div class="ui-grid">' + g.topics.map(function (s) { var t = BB.topic(s); return t ? BB.topicCard(t) : ''; }).join('') + '</div></section>' +
      '<div data-vote></div></article></div></div>';

    view.addEventListener('click', function (e) {
      var j = e.target.closest('[data-jump]');
      if (j) { e.preventDefault(); var el = view.querySelector('#gd-' + j.getAttribute('data-jump')); if (el) el.scrollIntoView({ behavior: 'smooth' }); return; }
      if (e.target.closest('[data-print]')) window.print();
    });
    return BB.pageBar(view, view.querySelector('[data-save-box]'), view.querySelector('[data-vote]'), 'guide', g.slug, ctx.me).then(function (st) {
      if (st && st.plan) {
        var btn = '<a class="ui-btn primary" href="#plan/' + esc(st.plan.id) + '" data-go="plan/' + esc(st.plan.id) + '">' + UI.icon('list') + 'Open my plan</a>';
        view.querySelector('[data-plan-btn]').innerHTML = btn;
        view.querySelector('[data-plan-btn2]').innerHTML = '<a class="ui-btn lg" href="#plan/' + esc(st.plan.id) + '" data-go="plan/' + esc(st.plan.id) + '">Open "' + esc(st.plan.title) + '" ' + UI.icon('arrow') + '</a>';
      }
    });
  });
})();

/* ===== home.html ===== */
(function () {
  var esc = UI.esc, BB = window.BB;
  var DATES = [['Feb 28', 'RL-1 and T4 slips to employees (if you have any)'], ['Mar 15', 'Income tax instalment (if required)'], ['Apr 30', 'Pay any income tax balance owing'],
    ['Jun 15', 'File your return as a self-employed person; instalment'], ['Sep 15', 'Income tax instalment'], ['Dec 15', 'Income tax instalment']];

  function planCard(p) {
    var g = BB.guide(p.guide), pr = BB.planProgress(p), days = BB.daysUntil(p.target_date), next = BB.nextTasks(p, 3);
    return '<div class="ui-card hm-plan"><div class="hm-plan-top"><span class="bb-ring" style="--p:' + pr.pct + '"><span>' + pr.pct + '%</span></span>' +
      '<div style="min-width:0;flex:1"><h3>' + esc(p.title) + '</h3><div class="muted small">' + esc(g ? g.name : p.guide) + (p.area ? ' · ' + esc(p.area) : '') + '</div>' +
      '<div class="small" style="margin-top:4px">' + (days == null ? '<span class="muted">No opening date yet</span>' : days >= 0 ? UI.icon('calendar') + ' Opening in <b>' + UI.plural(days, 'day') + '</b>' : UI.icon('calendar') + ' Opened ' + UI.plural(-days, 'day') + ' ago') + '</div></div>' +
      '<a class="ui-btn primary" href="#plan/' + esc(p.id) + '" data-go="plan/' + esc(p.id) + '">Open</a></div>' +
      '<div class="bb-progress"><i style="width:' + pr.pct + '%"></i></div><div class="small muted">' + pr.done + ' of ' + pr.total + ' steps done' + (p.cost_once ? ' · budget ' + BB.money(p.cost_once) + ' + ' + BB.money(p.cost_monthly) + '/month' : '') + '</div>' +
      (next.length ? '<div class="hm-next"><b class="small">Next up</b>' + next.map(function (n) {
        return '<a href="#plan/' + esc(p.id) + '" data-go="plan/' + esc(p.id) + '">' + UI.icon('arrow') + '<span>' + esc(n.task.t) + ' <span class="muted">· ' + esc(n.phase.name) + '</span></span></a>';
      }).join('') + '</div>' : '<div class="ui-note">' + UI.icon('star') + ' Every step is done. Congratulations, and good luck with the opening!</div>') + '</div>';
  }

  UI.page('home', { title: 'Home', nav: 'Home', icon: 'home', auth: 'user', order: 10 }, function (view, ctx) {
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:260px"></div></div>';
    return UI.api('get_home').then(function (d) {
      var first = esc(ctx.me.name.split(' ')[0]);
      var saved = d.saved.map(function (s) {
        var it = s.kind === 'guide' ? BB.guide(s.slug) : BB.topic(s.slug);
        if (!it) return '';
        return '<a href="#' + s.kind + '/' + esc(s.slug) + '" data-go="' + s.kind + '/' + esc(s.slug) + '"><span class="bb-tile' + (s.kind === 'topic' ? ' teal' : ' ' + esc(it.cat)) + '">' + UI.icon(it.icon) + '</span>' + esc(it.name || it.title) + '</a>';
      }).join('');
      var popular = d.popular.map(function (p) { var g = BB.guide(p.slug); return g ? '<a href="#guide/' + esc(g.slug) + '" data-go="guide/' + esc(g.slug) + '"><span class="bb-tile ' + esc(g.cat) + '">' + UI.icon(g.icon) + '</span>' + esc(g.name) + '<span class="ui-spacer"></span><span class="small muted">' + UI.plural(p.views, 'read') + '</span></a>' : ''; }).join('');
      view.innerHTML = '<div class="ui-wrap"><section class="hm-hero"><div><div class="eyebrow">Your launch desk</div><h1>Bonjour, ' + first + '!</h1>' +
        '<p class="muted" style="font-size:1.08rem">' + (d.plans.length ? 'Here\'s where your ' + (d.plans.length === 1 ? 'plan stands' : UI.plural(d.plans.length, 'plan') + ' stand') + '. One step at a time.' : 'Pick the business you want to open and we\'ll turn it into a step-by-step plan.') +
        (d.builders > 1 ? ' <span class="ui-badge accent">' + UI.icon('users') + d.builders + ' people are building a plan</span>' : '') + '</p></div><div class="hm-art">' + BB.street() + '</div></section>' +
        '<div class="hm-grid"><div class="ui-stack">' +
        (d.plans.length ? d.plans.map(planCard).join('') + '<a class="ui-btn" href="#library" data-go="library">' + UI.icon('plus') + 'Plan another business</a>'
          : '<div class="ui-card hm-start"><span class="bb-tile lg">' + UI.icon('rocket') + '</span><h2 style="margin:0">Start your first launch plan</h2>' +
            '<p class="muted" style="margin:0">Choose a business from the guides, tap "Start my launch plan", and you\'ll get the full Montréal checklist for it, a startup budget and a countdown to opening day.</p>' +
            '<div class="ui-row"><a class="ui-btn primary" href="#library" data-go="library">' + UI.icon('grid') + 'Browse the guides</a><a class="ui-btn" href="#tools/finder" data-go="tools/finder">' + UI.icon('stamp') + 'Which permits do I need?</a></div></div>') +
        '</div><div class="ui-stack hm-side">' +
        '<div class="ui-card"><h3>' + UI.icon('bookmark') + 'Saved</h3>' + (saved ? '<div class="hm-links">' + saved + '</div>' : '<p class="bb-empty-hint">Tap "Save" on any guide or topic to keep it here.</p>') + '</div>' +
        '<div class="ui-card"><h3>' + UI.icon('calendar') + 'Tax calendar</h3><div class="hm-cal">' + DATES.map(function (x) { return '<div><b>' + x[0] + '</b><span>' + esc(x[1]) + '</span></div>'; }).join('') + '</div>' +
          '<p class="small muted" style="margin:10px 0 0">GST/QST: usually once a year for small businesses, 3 months after your fiscal year ends.</p></div>' +
        (popular ? '<div class="ui-card"><h3>' + UI.icon('star') + 'Popular in Montréal</h3><div class="hm-links">' + popular + '</div></div>' : '') +
        '</div></div></div>';
    });
  });
})();

/* ===== landing.html ===== */
(function () {
  var BB = window.BB;
  var COPY = {
    eyebrow: 'Montréal · 1–2 person businesses',
    title: 'Open your <em>own little shop</em> in Montréal, step by step.',
    lead: 'Barber shop, bakery, cleaning service, food truck, home daycare… Business Buddy explains exactly what it takes here: the permits, the borough, the taxes, the real costs, and the tricks people only learn the hard way.',
    cta: 'Create my free plan',
    proof: ['Free, no ads', 'Made for Montréal', 'Basics + advanced'],
    stepsTitle: 'How it works',
    stepsLead: 'From "I have an idea" to "we\'re open", without the guesswork.',
    steps: [['Pick your business', 'Read its guide: permits, costs, money maths, pitfalls and pro tips, all specific to Montréal.'],
            ['Get your launch plan', 'One tap turns the guide into your checklist, with a startup budget and a countdown to opening day.'],
            ['Tick it off', 'Work through the six phases, keep notes from every phone call, and watch the progress ring fill up.']],
    featuresTitle: 'Everything in one place',
    features: [['grid', 'Guides', 'Step-by-step guides for 30 kinds of small businesses, from bakeries to electricians.'],
               ['map', 'The Basics', 'Registering, GST/QST, the certificate of occupancy, leases, hiring, French rules: explained simply, then in depth.'],
               ['stamp', 'Permit finder', 'Answer a few questions and get the list of permits and registrations that apply to you.'],
               ['chart', 'Calculators', 'Break-even, hourly rate, GST/QST, the $30,000 threshold tracker and a structure quiz.'],
               ['list', 'Your launch plan', 'A private checklist with notes, a budget sheet and your opening date.'],
               ['book', 'French ⇄ English', 'A glossary of the words on the forms and at the borough counter.']],
    mtl: [['store', 'Your borough is your city hall', 'Occupancy permits, signs, renovations and terraces come from your arrondissement, and each has its own rules and fees.'],
          ['receipt', 'Revenu Québec collects both sales taxes', 'GST and QST, one registration, one return, and the $30,000 small-supplier rule.'],
          ['chat', 'French comes first', 'Your name, sign and website must work in French. We show you how to do it right the first time.'],
          ['cup', 'MAPAQ for anything food', 'Which permit, what it costs, the 12-hour manager course, and the home-kitchen rules.']],
    faq: [['Is it free?', 'Yes. Reading everything is free and needs no account. A free account lets you save guides and build launch plans.'],
          ['Is this legal advice?', 'No. It\'s carefully researched general information (checked in ' + BB.updated + ') with links to the official sources. Fees change every year and rules differ by borough, so confirm before you pay or sign, and see a lawyer or accountant for your specific situation.'],
          ['My business isn\'t in the list. Can I still use it?', 'Yes: the Basics and the permit finder apply to every business. And tell us which guide you\'d like next with the feedback button.'],
          ['Who can see my plans?', 'Only you. Your plans, notes and budgets are private. The Privacy & Terms page has the details.'],
          ['What about the suburbs or the rest of Québec?', 'Provincial rules (registration, taxes, MAPAQ, RBQ…) are the same everywhere in Québec. Municipal permits are Montréal-specific here; other cities work similarly but with their own by-laws.']],
    bandTitle: 'Your shop could open this year.',
    bandLead: 'Start with the guide for your business. It takes 10 minutes to read and saves months.'
  };

  function heroArt() {
    var top = BB.guide('barber-shop'), bakery = BB.guide('bakery');
    return '<div class="lp-art" aria-hidden="true">' + BB.street() +
      '<div class="tag t1"><span class="bb-tile food">' + UI.icon('croissant') + '</span><div><b>Bakery</b><span class="muted">' + BB.range(bakery.glance.cost) + ' to start</span></div></div>' +
      '<div class="tag t2"><span class="bb-ring" style="--p:62;width:40px;height:40px"><span style="width:30px;height:30px;font-size:.7rem">62%</span></span><div><b>' + UI.esc(top.name) + ' plan</b><span class="muted">Opening in 75 days</span></div></div></div>';
  }

  UI.page('landing', { title: 'Welcome' }, function (view, ctx) {
    var me = ctx.me, C = COPY, esc = UI.esc;
    var primary = '<a class="ui-btn primary lg" href="#library" data-go="library">' + UI.icon('grid') + 'Browse the guides</a>' +
      (me ? '<a class="ui-btn lg" href="#home" data-go="home">Open my plans ' + UI.icon('arrow') + '</a>'
        : '<a class="ui-btn lg" href="#auth/signup" data-go="auth/signup">' + esc(C.cta) + ' ' + UI.icon('arrow') + '</a>');
    view.innerHTML =
      '<section class="lp-hero"><div class="ui-wrap"><div>' +
        '<div class="eyebrow">' + esc(C.eyebrow) + '</div><h1>' + C.title + '</h1><p class="lp-lead">' + esc(C.lead) + '</p>' +
        '<div class="lp-cta">' + primary + '</div>' +
        '<div class="lp-proof">' + C.proof.map(function (p) { return '<span>' + UI.icon('check') + esc(p) + '</span>'; }).join('') + '</div>' +
      '</div>' + heroArt() + '</div></section>' +
      '<section class="lp-strip"><div class="ui-wrap" style="padding-top:0;padding-bottom:0"><div class="lp-cats">' + BB.categories.map(function (c) {
        var n = BB.guides.filter(function (g) { return g.cat === c.id; }).length;
        return '<a class="ui-card lp-cat bb-cat-' + c.id + '" href="#library/' + c.id + '" data-go="library/' + c.id + '"><span class="bb-tile">' + UI.icon(c.icon) + '</span><b>' + esc(c.name) + '</b><span>' + UI.plural(n, 'guide') + '</span></a>';
      }).join('') + '</div></div></section>' +
      '<section class="lp-section" id="how"><div class="ui-wrap"><div class="lp-head"><h2>' + esc(C.stepsTitle) + '</h2><p>' + esc(C.stepsLead) + '</p></div>' +
        '<div class="lp-steps">' + C.steps.map(function (s) { return '<div class="ui-card lp-step"><h3>' + esc(s[0]) + '</h3><p class="muted">' + esc(s[1]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-mtl"><div><div class="eyebrow">Why a Montréal guide?</div><h2>Generic "start a business" advice skips the parts that trip people up here.</h2>' +
        '<p class="muted" style="font-size:1.06rem">Three levels of government, 19 boroughs, two sales taxes, French-first rules. We researched them so you don\'t lose weeks finding out who issues what.</p>' +
        '<a class="ui-btn" href="#basics" data-go="basics">' + UI.icon('map') + 'Read the Basics</a></div>' +
        '<ul>' + C.mtl.map(function (m) { return '<li>' + UI.icon(m[0]) + '<div><b>' + esc(m[1]) + '</b><span>' + esc(m[2]) + '</span></div></li>'; }).join('') + '</ul></div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>' + esc(C.featuresTitle) + '</h2></div>' +
        '<div class="ui-grid">' + C.features.map(function (f) { return '<div class="ui-card lp-feature">' + UI.icon(f[0]) + '<h3>' + esc(f[1]) + '</h3><p>' + esc(f[2]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Questions</h2></div><div class="lp-faq">' +
        C.faq.map(function (q) { return '<details><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-band"><div class="bb-awning"></div><div><h2>' + esc(C.bandTitle) + '</h2><p>' + esc(C.bandLead) + '</p></div>' +
        '<a class="ui-btn lg" href="#library" data-go="library">Find my business ' + UI.icon('arrow') + '</a>' +
      '</div></div></section>';
  });
})();

/* ===== library.html ===== */
(function () {
  var esc = UI.esc, BB = window.BB;
  var FILTERS = [['home', 'Can start at home', 'home'], ['cheap', 'Under $10k to start', 'coins'], ['nolicence', 'No trade licence', 'check']];
  var SPECIAL = ['mapaqRestaurant', 'mapaqRetail', 'racj', 'rbq', 'cmeq', 'cmmtq', 'daycare', 'tobacco', 'dogwalker', 'autoDecree'];

  UI.page('library', { title: 'Business guides', nav: 'Guides', icon: 'grid', order: 20 }, function (view, ctx) {
    var cat = BB.category(ctx.args[0]) ? ctx.args[0] : 'all';
    var st = { q: '', cat: cat, f: {}, sort: 'popular' }, popular = {};

    view.innerHTML = '<div class="ui-wrap"><section class="lb-hero"><div class="eyebrow">' + BB.guides.length + ' businesses · Montréal edition</div>' +
      '<h1>What do you want to open?</h1><p class="lead">Each guide covers the permits, the real costs, the money maths and the advanced tricks for one kind of business, in Montréal.</p>' +
      '<form class="bb-search" data-search role="search">' + UI.icon('search') + '<input type="search" name="q" placeholder="Search: bakery, permit, GST, certificat d\'occupation…" aria-label="Search guides and topics" autocomplete="off"></form></section>' +
      '<div class="lb-tools"><div class="lb-scroll"><div class="bb-chips" data-cats></div></div>' +
      '<div class="lb-filters"><div class="bb-chips" data-filters></div><div class="ui-row"><span class="lb-count" data-count></span>' +
      '<select data-sort aria-label="Sort" style="width:auto;min-height:38px;padding:6px 10px"><option value="popular">Most read</option><option value="cheap">Cheapest to start</option><option value="fast">Fastest to open</option><option value="az">A to Z</option></select></div></div></div>' +
      '<div data-body></div></div>';
    var body = view.querySelector('[data-body]'), input = view.querySelector('input[name=q]');

    function chips() {
      view.querySelector('[data-cats]').innerHTML = [['all', 'All', 'grid']].concat(BB.categories.map(function (c) { return [c.id, c.name, c.icon]; })).map(function (c) {
        return '<button type="button" class="bb-chip' + (st.cat === c[0] ? ' on' : '') + '" data-cat="' + c[0] + '">' + UI.icon(c[2]) + esc(c[1]) + '</button>';
      }).join('');
      view.querySelector('[data-filters]').innerHTML = FILTERS.map(function (f) {
        return '<button type="button" class="bb-chip' + (st.f[f[0]] ? ' on' : '') + '" data-filter="' + f[0] + '" aria-pressed="' + !!st.f[f[0]] + '">' + UI.icon(f[2]) + esc(f[1]) + '</button>';
      }).join('');
    }

    function list() {
      var gs = BB.guides.filter(function (g) {
        if (st.cat !== 'all' && g.cat !== st.cat) return false;
        if (st.f.home && !g.glance.home) return false;
        if (st.f.cheap && g.glance.cost[0] >= 10000) return false;
        if (st.f.nolicence && g.permits.some(function (p) { return SPECIAL.indexOf(p) >= 0; })) return false;
        return true;
      });
      var by = {
        popular: function (a, b) { return (popular[b.slug] || 0) - (popular[a.slug] || 0) || a.name.localeCompare(b.name); },
        cheap: function (a, b) { return a.glance.cost[0] - b.glance.cost[0]; },
        fast: function (a, b) { return a.glance.weeks[0] - b.glance.weeks[0]; },
        az: function (a, b) { return a.name.localeCompare(b.name); }
      };
      return gs.sort(by[st.sort]);
    }

    function draw() {
      chips();
      if (st.q.trim().length > 1) return drawSearch();
      var gs = list();
      view.querySelector('[data-count]').textContent = UI.plural(gs.length, 'guide');
      if (!gs.length) {
        body.innerHTML = '<div class="ui-empty">' + UI.icon('search') + '<h3>No guide matches all of those filters</h3><p>Try removing one, or tell us which business you\'d like a guide for.</p>' +
          '<button class="ui-btn" data-feedback="idea">' + UI.icon('bulb') + 'Suggest a business</button></div>';
        return;
      }
      var groups = st.cat === 'all' && st.sort === 'az' ? BB.categories.map(function (c) { return { c: c, gs: gs.filter(function (g) { return g.cat === c.id; }) }; }).filter(function (x) { return x.gs.length; }) : [{ c: null, gs: gs }];
      var top = Object.keys(popular).sort(function (a, b) { return popular[b] - popular[a]; }).slice(0, 3);
      body.innerHTML = groups.map(function (grp) {
        return '<section class="lb-section">' + (grp.c ? '<h2>' + UI.icon(grp.c.icon) + esc(grp.c.name) + '</h2>' : '') + '<div class="ui-grid">' +
          grp.gs.map(function (g) { return BB.guideCard(g, top.indexOf(g.slug) >= 0 ? '<span class="ui-badge brand">' + UI.icon('star') + 'Popular</span>' : ''); }).join('') + '</div></section>';
      }).join('') +
        '<div class="ui-card flat" style="margin-top:28px;display:flex;gap:16px;align-items:center;flex-wrap:wrap"><span class="bb-tile teal">' + UI.icon('map') + '</span>' +
        '<div style="flex:1;min-width:220px"><h3 style="margin:0 0 4px">New to all this? Start with the Basics</h3><p class="muted" style="margin:0">Registering, taxes, permits, leases, hiring: what every Montréal business needs to know.</p></div>' +
        '<a class="ui-btn primary" href="#basics" data-go="basics">Read the Basics ' + UI.icon('arrow') + '</a></div>';
    }

    function drawSearch() {
      var hits = BB.search(st.q).filter(function (h) { return st.cat === 'all' || h.kind !== 'guide' || h.item.cat === st.cat; }).slice(0, 40);
      view.querySelector('[data-count]').textContent = UI.plural(hits.length, 'result');
      if (!hits.length) {
        body.innerHTML = '<div class="ui-empty">' + UI.icon('search') + '<h3>Nothing found for "' + esc(st.q) + '"</h3><p>Try another word, in English or French (e.g. "permis", "taxes", "barber").</p></div>';
        return;
      }
      body.innerHTML = '<div class="lb-results">' + hits.map(function (h) {
        if (h.kind === 'guide') return '<a class="ui-item lb-hit bb-cat-' + esc(h.item.cat) + '" href="#guide/' + esc(h.item.slug) + '" data-go="guide/' + esc(h.item.slug) + '"><span class="bb-tile">' + UI.icon(h.item.icon) + '</span><div class="grow"><h3>' + esc(h.item.name) + '</h3><p>' + esc(h.item.tagline) + '</p></div><span class="ui-badge">Guide</span></a>';
        if (h.kind === 'topic') return '<a class="ui-item lb-hit" href="#topic/' + esc(h.item.slug) + '" data-go="topic/' + esc(h.item.slug) + '"><span class="bb-tile teal">' + UI.icon(h.item.icon) + '</span><div class="grow"><h3>' + esc(h.item.title) + '</h3><p>' + esc(h.item.summary) + '</p></div><span class="ui-badge accent">Basics</span></a>';
        return '<a class="ui-item lb-hit" href="#glossary" data-go="glossary"><span class="bb-tile">' + UI.icon('book') + '</span><div class="grow"><h3>' + esc(h.item[0]) + ' · <span class="muted">' + esc(h.item[1]) + '</span></h3><p>' + esc(h.item[2]) + '</p></div><span class="ui-badge">Glossary</span></a>';
      }).join('') + '</div>';
    }

    view.addEventListener('click', function (e) {
      var c = e.target.closest('[data-cat]');
      if (c) { st.cat = c.getAttribute('data-cat'); history.replaceState(null, '', st.cat === 'all' ? '#library' : '#library/' + st.cat); draw(); return; }
      var f = e.target.closest('[data-filter]');
      if (f) { var k = f.getAttribute('data-filter'); st.f[k] = !st.f[k]; draw(); }
    });
    var timer;
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { st.q = input.value; draw(); }, 120); });
    view.querySelector('[data-search]').addEventListener('submit', function (e) { e.preventDefault(); st.q = input.value; draw(); });
    view.querySelector('[data-sort]').addEventListener('change', function (e) { st.sort = e.target.value; draw(); });
    var q = (location.hash.split('?')[1] || '').match(/(?:^|&)q=([^&]*)/);
    if (q) { st.q = decodeURIComponent(q[1].replace(/\+/g, ' ')); input.value = st.q; }
    draw();
    return UI.apiQuiet('get_popular').then(function (r) {
      r.guides.forEach(function (p) { popular[p.slug] = p.views; });
      draw();
    }, function () {});
  });
})();

/* ===== plan.html ===== */
(function () {
  var esc = UI.esc, BB = window.BB;

  function confetti() {
    var box = document.createElement('div'), colors = ['#c2412d', '#e8705a', '#1f7a6b', '#f0b34f', '#fbf6ee'];
    box.className = 'pl-confetti';
    for (var i = 0; i < 70; i++) {
      var c = document.createElement('i');
      c.style.left = Math.random() * 100 + 'vw'; c.style.background = colors[i % colors.length];
      c.style.animationDelay = (Math.random() * .5) + 's'; c.style.animationDuration = (1.2 + Math.random()) + 's';
      box.appendChild(c);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 2800);
  }

  function areaOptions(cur) {
    return '<option value="">Choose…</option>' + BB.BOROUGHS.map(function (b) { return '<option' + (b === cur ? ' selected' : '') + '>' + esc(b) + '</option>'; }).join('');
  }

  /* ---------------------------------------------------------------- new plan */
  function newPlan(view, ctx) {
    var g = BB.guide(ctx.args[1]) || null;
    var opts = BB.categories.map(function (c) {
      return '<optgroup label="' + esc(c.name) + '">' + BB.guides.filter(function (x) { return x.cat === c.id; }).map(function (x) {
        return '<option value="' + esc(x.slug) + '"' + (g && g.slug === x.slug ? ' selected' : '') + '>' + esc(x.name) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    view.innerHTML = '<div class="ui-wrap"><div class="pl-new"><div class="pl-head"><span class="bb-tile lg">' + UI.icon('rocket') + '</span><div class="grow"><div class="eyebrow">New launch plan</div><h1>What are you opening?</h1></div></div>' +
      '<form class="ui-card ui-stack" data-new><label class="ui-field"><span>Type of business</span><select name="guide" required><option value="">Choose a business…</option>' + opts + '</select></label>' +
      '<label class="ui-field"><span>Name of your business <em>(a working name is fine)</em></span><input type="text" name="title" maxlength="80" required placeholder="e.g. Boulangerie Pain Perdu" value="' + esc(g ? 'My ' + g.name.toLowerCase() : '') + '"></label>' +
      '<div class="ui-grid two"><label class="ui-field"><span>Borough</span><select name="area">' + areaOptions('') + '</select></label>' +
      '<label class="ui-field"><span>Target opening date <em>(optional)</em></span><input type="date" name="target_date"></label></div>' +
      '<label class="ui-check"><input type="checkbox" name="costs" checked> Start my budget with this business\'s typical Montréal costs</label>' +
      '<div class="ui-row end"><a class="ui-btn ghost" href="#home" data-go="home">Cancel</a><button class="ui-btn primary" type="submit">' + UI.icon('rocket') + 'Create my plan</button></div></form></div></div>';
    var f = view.querySelector('[data-new]');
    f.guide.addEventListener('change', function () {
      var x = BB.guide(f.guide.value);
      if (x && (!f.title.value || /^My /.test(f.title.value))) f.title.value = 'My ' + x.name.toLowerCase();
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(f), x = BB.guide(v.guide);
      UI.busy(f.querySelector('[type=submit]'), UI.api('create_plan', v.guide, v.title, v.area, v.target_date || null, v.costs && x ? BB.starterCosts(x) : [])).then(function (r) {
        UI.toast('Your plan is ready. Let\'s go!', 'ok');
        UI.go('plan', r.plan.id);
      });
    });
    return Promise.resolve();
  }

  /* ---------------------------------------------------------------- one plan */
  UI.page('plan', { title: 'Launch plan', auth: 'user' }, function (view, ctx) {
    if (ctx.args[0] === 'new' || !ctx.args[0]) return newPlan(view, ctx);
    var id = ctx.args[0], tab = ['budget', 'details'].indexOf(ctx.args[1]) >= 0 ? ctx.args[1] : 'checklist';
    var plan = null, g = null, closed = UI.store.get('closed.' + id, {});
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:300px"></div></div>';

    function head() {
      var pr = BB.planProgress(plan), days = BB.daysUntil(plan.target_date);
      return '<div class="pl-head"><span class="bb-ring lg" data-ring style="--p:' + pr.pct + '"><span>' + pr.pct + '%</span></span><div class="grow">' +
        '<div class="eyebrow">' + esc(g ? g.name : plan.guide) + ' · launch plan</div><h1>' + esc(plan.title) + '</h1><div class="pl-meta">' +
        (plan.area ? '<span class="ui-badge">' + UI.icon('pin') + esc(plan.area) + '</span>' : '') +
        (days == null ? '<span class="ui-badge">' + UI.icon('calendar') + 'No opening date</span>' : '<span class="ui-badge ' + (days < 0 ? 'good' : days < 30 ? 'warn' : 'brand') + '">' + UI.icon('calendar') + (days >= 0 ? 'Opening in ' + UI.plural(days, 'day') : 'Opened ' + UI.plural(-days, 'day') + ' ago') + '</span>') +
        '<span class="ui-badge good" data-count>' + UI.icon('check') + pr.done + ' / ' + pr.total + ' steps</span>' + (plan.hiring ? '<span class="ui-badge">' + UI.icon('users') + 'Hiring</span>' : '') + '</div></div>' +
        (g ? '<a class="ui-btn" href="#guide/' + esc(g.slug) + '" data-go="guide/' + esc(g.slug) + '">' + UI.icon('book') + 'Read the guide</a>' : '') + '</div>' +
        '<nav class="ui-tabs">' + [['checklist', 'Checklist', 'list'], ['budget', 'Budget', 'coins'], ['details', 'Details', 'edit']].map(function (t) {
          return '<a href="#plan/' + esc(id) + (t[0] === 'checklist' ? '' : '/' + t[0]) + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>';
        }).join('') + '</nav>';
    }

    function checklist() {
      var phases = BB.planPhases(g, { hiring: plan.hiring }), done = plan.done || [], notes = plan.notes || {};
      return phases.map(function (ph, i) {
        var n = ph.tasks.filter(function (t) { return done.indexOf(t.id) >= 0; }).length, all = n === ph.tasks.length;
        var isClosed = closed[ph.id] != null ? closed[ph.id] : all;
        return '<section class="ui-card pl-phase' + (all ? ' done' : '') + (isClosed ? ' closed' : '') + '" data-phase="' + ph.id + '">' +
          '<button class="pl-phase-head" data-toggle aria-expanded="' + !isClosed + '"><span class="bb-tile">' + UI.icon(all ? 'check' : ph.icon) + '</span><div><div class="small muted">Phase ' + (i + 1) + '</div><h3>' + esc(ph.name) + '</h3></div>' +
          '<span class="count" data-phase-count>' + n + ' / ' + ph.tasks.length + '</span>' + UI.icon('chevron', 'chev') + '</button><div class="pl-tasks">' +
          ph.tasks.map(function (t) {
            var on = done.indexOf(t.id) >= 0, note = notes[t.id] || '', topic = t.topic ? BB.topic(t.topic) : null;
            return '<div class="pl-task' + (on ? ' is-done' : '') + '" data-task="' + esc(t.id) + '"><input type="checkbox" data-check aria-label="' + esc(t.t) + '"' + (on ? ' checked' : '') + '>' +
              '<div><div class="t" data-check-label>' + esc(t.t) + (t.special ? ' <span class="ui-badge brand" style="vertical-align:2px">' + esc(g ? g.name : '') + '</span>' : '') + '</div>' +
              '<p class="d">' + esc(t.d) + '</p><div class="links">' + (topic ? '<a href="#topic/' + esc(topic.slug) + '" data-go="topic/' + esc(topic.slug) + '">' + UI.icon('book') + esc(topic.title) + '</a>' : '') +
              '<button type="button" data-note-open>' + UI.icon('note') + (note ? 'Edit note' : 'Add a note') + '</button></div>' +
              (note ? '<div class="pl-note" data-note-view>' + esc(note) + '</div>' : '') + '</div><span></span></div>';
          }).join('') + '</div></section>';
      }).join('') + '<p class="small muted" style="margin-top:6px">' + UI.icon('info') + ' Your plan is private: only you can see it.</p>';
    }

    function budget() {
      var rows = plan.costs || [];
      return '<div class="pl-totals" data-totals></div><form class="ui-card" data-budget><table class="pl-budget"><thead><tr><th>Item</th><th>Amount ($)</th><th>Type</th><th></th></tr></thead><tbody data-rows>' +
        rows.map(rowHtml).join('') + '</tbody></table><div class="ui-row" style="margin-top:14px"><button type="button" class="ui-btn" data-add-row>' + UI.icon('plus') + 'Add a line</button>' +
        '<span class="ui-spacer"></span><span class="small muted" data-dirty></span><button class="ui-btn primary" type="submit">' + UI.icon('check') + 'Save budget</button></div></form>' +
        (g ? '<p class="small muted" style="margin-top:12px">Typical for a ' + esc(g.name.toLowerCase()) + ' in Montréal: ' + esc(BB.range(g.glance.cost)) + ' to start. See the cost table in <a href="#guide/' + esc(g.slug) + '" data-go="guide/' + esc(g.slug) + '">the guide</a>.</p>' : '');
    }
    function rowHtml(r) {
      r = r || { label: '', amount: '', kind: 'once' };
      return '<tr><td class="label"><input type="text" name="label" maxlength="80" value="' + esc(r.label) + '" placeholder="e.g. Espresso machine" aria-label="Item"></td>' +
        '<td class="amt"><input type="number" name="amount" min="0" step="any" inputmode="decimal" value="' + esc(r.amount) + '" aria-label="Amount"></td>' +
        '<td class="kind"><select name="kind" aria-label="Type"><option value="once"' + (r.kind !== 'monthly' ? ' selected' : '') + '>One-time</option><option value="monthly"' + (r.kind === 'monthly' ? ' selected' : '') + '>Monthly</option></select></td>' +
        '<td class="x"><button type="button" class="ui-btn ghost icon" data-del-row aria-label="Remove line">' + UI.icon('trash') + '</button></td></tr>';
    }
    function readRows() {
      return Array.prototype.map.call(view.querySelectorAll('[data-rows] tr'), function (tr) {
        return { label: tr.querySelector('[name=label]').value, amount: parseFloat(tr.querySelector('[name=amount]').value) || 0, kind: tr.querySelector('[name=kind]').value };
      });
    }
    function totals() {
      var rows = readRows(), once = 0, monthly = 0;
      rows.forEach(function (r) { if (r.kind === 'monthly') monthly += r.amount; else once += r.amount; });
      view.querySelector('[data-totals]').innerHTML = '<div class="ui-card"><span>One-time costs</span><b>' + BB.money(once) + '</b></div>' +
        '<div class="ui-card"><span>Monthly costs</span><b>' + BB.money(monthly) + '</b></div>' +
        '<div class="ui-card" style="border-color:var(--c-accent)"><span>Money to open safely <em>(one-time + 6 months + 15%)</em></span><b style="color:var(--c-accent)">' + BB.money((once + 6 * monthly) * 1.15) + '</b></div>';
    }

    function details() {
      return '<form class="ui-card ui-stack ui-narrow" style="margin:0" data-details><label class="ui-field"><span>Name of your business</span><input type="text" name="title" maxlength="80" required value="' + esc(plan.title) + '"></label>' +
        '<div class="ui-grid two"><label class="ui-field"><span>Borough</span><select name="area">' + areaOptions(plan.area) + '</select></label>' +
        '<label class="ui-field"><span>Target opening date</span><input type="date" name="target_date" value="' + esc(plan.target_date || '') + '"></label></div>' +
        '<label class="ui-check"><input type="checkbox" name="hiring"' + (plan.hiring ? ' checked' : '') + '> I\'ll hire employees (adds the employer steps to the checklist)</label>' +
        '<div class="ui-row"><button class="ui-btn danger" type="button" data-delete>' + UI.icon('trash') + 'Delete this plan</button><span class="ui-spacer"></span><button class="ui-btn primary" type="submit">Save</button></div></form>';
    }

    function draw() {
      var body = tab === 'budget' ? budget() : tab === 'details' ? details() : checklist();
      view.innerHTML = '<div class="ui-wrap">' + head() + '<div data-body>' + body + '</div></div>';
      if (tab === 'budget') totals();
    }
    function refreshHead() {
      var pr = BB.planProgress(plan), ring = view.querySelector('[data-ring]');
      if (ring) { ring.style.setProperty('--p', pr.pct); ring.querySelector('span').textContent = pr.pct + '%'; }
      var c = view.querySelector('[data-count]');
      if (c) c.innerHTML = UI.icon('check') + pr.done + ' / ' + pr.total + ' steps';
    }

    view.addEventListener('click', function (e) {
      var tg = e.target.closest('[data-toggle]');
      if (tg) {
        var sec = tg.closest('[data-phase]'), isClosed = sec.classList.toggle('closed');
        tg.setAttribute('aria-expanded', String(!isClosed));
        closed[sec.getAttribute('data-phase')] = isClosed; UI.store.set('closed.' + id, closed);
        return;
      }
      var lbl = e.target.closest('[data-check-label]');
      if (lbl) { var cb = lbl.closest('[data-task]').querySelector('[data-check]'); cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); return; }
      var no = e.target.closest('[data-note-open]');
      if (no) {
        var task = no.closest('[data-task]'), tid = task.getAttribute('data-task');
        if (task.querySelector('textarea')) return;
        var ta = document.createElement('textarea');
        ta.maxLength = 1500; ta.value = (plan.notes || {})[tid] || ''; ta.placeholder = 'Who you called, what they said, documents needed…';
        var nv = task.querySelector('[data-note-view]'); if (nv) nv.remove();
        no.parentNode.after(ta); ta.focus();
        var save = document.createElement('div');
        save.className = 'ui-row'; save.style.marginTop = '6px';
        save.innerHTML = '<button type="button" class="ui-btn sm primary" data-note-save>Save note</button><button type="button" class="ui-btn sm ghost" data-note-cancel>Cancel</button>';
        ta.after(save);
        return;
      }
      var ns = e.target.closest('[data-note-save]');
      if (ns) {
        var t2 = ns.closest('[data-task]'), id2 = t2.getAttribute('data-task'), val = t2.querySelector('textarea').value;
        UI.busy(ns, UI.apiQuiet('set_note', id, id2, val)).then(function (r) {
          plan.notes = plan.notes || {}; if (r.note) plan.notes[id2] = r.note; else delete plan.notes[id2];
          UI.toast('Note saved', 'ok'); draw();
        });
        return;
      }
      if (e.target.closest('[data-note-cancel]')) { draw(); return; }
      if (e.target.closest('[data-add-row]')) {
        var tb = view.querySelector('[data-rows]'); tb.insertAdjacentHTML('beforeend', rowHtml(null)); tb.lastElementChild.querySelector('input').focus();
        view.querySelector('[data-dirty]').textContent = 'Unsaved changes'; totals(); return;
      }
      var dr = e.target.closest('[data-del-row]');
      if (dr) { dr.closest('tr').remove(); view.querySelector('[data-dirty]').textContent = 'Unsaved changes'; totals(); return; }
      if (e.target.closest('[data-delete]')) {
        UI.confirm({ title: 'Delete "' + plan.title + '"?', text: 'Your checklist, notes and budget for this plan are deleted. This can\'t be undone.', ok: 'Delete plan', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_plan', id).then(function () { UI.toast('Plan deleted'); UI.go('home'); });
        });
      }
    });
    view.addEventListener('change', function (e) {
      var cb = e.target.closest('[data-check]');
      if (!cb) return;
      var task = cb.closest('[data-task]'), tid = task.getAttribute('data-task'), on = cb.checked;
      task.classList.toggle('is-done', on);
      plan.done = (plan.done || []).filter(function (x) { return x !== tid; }); if (on) plan.done.push(tid);
      var sec = cb.closest('[data-phase]'), boxes = sec.querySelectorAll('[data-check]'), n = sec.querySelectorAll('[data-check]:checked').length;
      sec.querySelector('[data-phase-count]').textContent = n + ' / ' + boxes.length;
      var all = n === boxes.length, was = sec.classList.contains('done');
      sec.classList.toggle('done', all);
      refreshHead();
      UI.apiQuiet('set_task', id, tid, on).then(function (r) { plan.done = r.done; refreshHead(); }, function (err) {
        cb.checked = !on; task.classList.toggle('is-done', !on); UI.toast(err.message, 'error');
      });
      if (all && !was && on) {
        confetti();
        var pr = BB.planProgress(plan);
        UI.toast(pr.pct === 100 ? 'Every step done. Time to open the doors!' : 'Phase complete: "' + sec.querySelector('h3').textContent + '"', 'ok');
      }
    });
    view.addEventListener('input', function (e) {
      if (e.target.closest('[data-rows]')) { view.querySelector('[data-dirty]').textContent = 'Unsaved changes'; totals(); }
    });
    view.addEventListener('submit', function (e) {
      e.preventDefault();
      if (e.target.matches('[data-budget]')) {
        UI.busy(e.target.querySelector('[type=submit]'), UI.api('save_costs', id, readRows())).then(function (r) { plan = r.plan; UI.toast('Budget saved', 'ok'); draw(); });
      } else if (e.target.matches('[data-details]')) {
        var v = UI.formData(e.target);
        UI.busy(e.target.querySelector('[type=submit]'), UI.api('update_plan', id, v.title, v.area, v.target_date || null, !!v.hiring)).then(function (r) { plan = r.plan; UI.toast('Saved', 'ok'); draw(); });
      }
    });

    return UI.api('get_plan', id).then(function (r) { plan = r.plan; g = BB.guide(plan.guide); draw(); });
  });
})();

/* ===== profile.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('profile', { title: 'Your profile', auth: 'user' }, function (view, ctx) {
    var me = ctx.me;
    view.innerHTML = '<div class="ui-wrap ui-narrow"><div class="pf-head"><span class="ui-avatar">' + esc(UI.initials(me.name)) + '</span>' +
      '<div><h1>' + esc(me.name) + '</h1><div class="muted">' + esc(me.email) + (me.joined ? ' · member since ' + esc(UI.fmtDate(me.joined, { month: 'long', year: 'numeric' })) : '') + '</div></div></div>' +
      '<div class="pf-grid"><form class="ui-card ui-stack" data-name><h3>Your name</h3><label class="ui-field"><span>Shown to other people</span>' +
      '<input type="text" name="name" value="' + esc(me.name) + '" maxlength="60" required></label><button class="ui-btn primary" type="submit">Save</button></form>' +
      '<div class="ui-card ui-stack"><h3>Appearance</h3><p class="muted small">Follow your device, or pick one.</p><div data-theme-box></div>' +
      '<h3 style="margin-top:22px">Password</h3><p class="muted small">We\'ll email you a link to choose a new one.</p>' +
      '<button class="ui-btn" data-reset>' + UI.icon('mail') + 'Email me a reset link</button></div></div>' +
      '<div class="ui-card" style="margin-top:16px"><div class="pf-links">' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<button data-feedback>' + UI.icon('chat') + 'Send feedback</button>' +
      '<button data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms, and your data</button>' +
      '<button data-signout-here>' + UI.icon('logout') + 'Sign out</button></div></div></div>';
    function themeBox() {
      var t = UI.theme();
      view.querySelector('[data-theme-box]').innerHTML = '<div class="ui-seg">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
        return '<button type="button" data-theme-pick="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    }
    themeBox();
    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-theme-pick]');
      if (t) { UI.setTheme(t.getAttribute('data-theme-pick')); themeBox(); UI.renderChrome(); return; }
      if (e.target.closest('[data-reset]')) {
        UI.busy(e.target.closest('[data-reset]'), UI.auth('reset', { email: me.email })).then(function (r) { UI.toast(r.message, 'ok'); });
      }
      if (e.target.closest('[data-signout-here]')) UI.auth('logout');
    });
    view.querySelector('[data-name]').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(e.target);
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('update_profile', v.name)).then(function (r) {
        UI.setMe(r.me); ctx.me = r.me; UI.toast('Saved', 'ok');
        view.querySelector('.pf-head h1').textContent = r.me.name;
      });
    });
  });
})();

/* ===== tools.html ===== */
(function () {
  var esc = UI.esc, BB = window.BB;
  var TOOLS = [['finder', 'Permit finder', 'stamp'], ['breakeven', 'Break-even', 'chart'], ['taxes', 'GST/QST', 'receipt'], ['threshold', '$30k tracker', 'flag'],
    ['rate', 'Hourly rate', 'clock'], ['structure', 'Which structure?', 'scale']];
  function num(v) { var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
  function field(name, label, val, hint, cls) {
    return '<label class="ui-field ' + (cls || '') + '"><span>' + label + '</span><input type="number" inputmode="decimal" min="0" step="any" name="' + name + '" value="' + esc(val) + '">' + (hint ? '<p class="ui-hint">' + hint + '</p>' : '') + '</label>';
  }
  function opt(type, name, value, label, checked, icon) {
    return '<label class="tl-opt"><input type="' + type + '" name="' + name + '" value="' + value + '"' + (checked ? ' checked' : '') + '><span>' + (icon ? UI.icon(icon) : '') + esc(label) + '</span></label>';
  }

  /* ---------------------------------------------------------------- permit finder */
  var FQ = [
    ['where', 'radio', 'Where will you work?', [['premises', 'A shop, studio or office', 'store'], ['home', 'At home', 'home'], ['clients', 'At clients\' places or online only', 'laptop'], ['mobile', 'Truck, markets or events', 'truck']]],
    ['name', 'radio', 'What name will you use?', [['own', 'My own first and last name'], ['name', 'A business name'], ['inc', 'I\'ll incorporate']]],
    ['sales', 'radio', 'Sales in your first year?', [['low', 'Under $30,000'], ['high', 'Over $30,000'], ['unsure', 'Not sure']]],
    ['food', 'radio', 'Food?', [['none', 'No food'], ['meals', 'I prepare meals, snacks or drinks'], ['products', 'I sell food products'], ['home', 'I cook at home to sell']]],
    ['extra', 'checkbox', 'Anything else? (tick all that apply)', [['alcohol', 'Alcohol', 'cup'], ['reno', 'Renovation or construction work', 'hammer'], ['electric', 'Electrical work', 'bolt'],
      ['plumbing', 'Plumbing or heating', 'wrench'], ['kids', 'Childcare for 3+ kids at home', 'baby'], ['dogs', 'Walking 4+ dogs at once', 'paw'], ['animals', 'Keeping 15+ cats or dogs', 'paw'],
      ['hire', 'Hiring employees', 'users'], ['sign', 'A sign on a building', 'store'], ['terrace', 'A terrace', 'sun'], ['door', 'Selling at customers\' homes / door-to-door', 'home'],
      ['tobacco', 'Tobacco', 'bag'], ['drone', 'Flying a drone', 'camera'], ['truck', 'A truck of 4,500 kg+', 'truck'], ['auto', 'Car repair with employees', 'car']]]
  ];
  function finderResult(a) {
    var out = [], ex = a.extra || [];
    function add(id, why) { if (BB.permits[id] && !out.some(function (o) { return o.id === id; })) out.push({ id: id, why: why }); }
    if (a.name !== 'own' || ex.indexOf('tobacco') >= 0) add('req', a.name === 'own' ? 'Tobacco sellers must register whatever their name.' : a.name === 'inc' ? 'Every corporation is registered (incorporation: $397).' : 'You use a name other than your own.');
    if (a.sales === 'high' || ex.indexOf('tobacco') >= 0) add('gstqst', a.sales === 'high' ? 'Mandatory above $30,000 of sales.' : 'Mandatory from the first dollar for tobacco.');
    else if (a.sales === 'unsure') add('gstqst', 'Watch the $30,000 threshold (use the tracker); registering early can pay.');
    if (a.where === 'premises' || a.where === 'home') add('occupancy', a.where === 'home' ? 'Home businesses need one too, in most cases.' : 'Required for any business address.');
    if (a.where === 'clients') add('occupancy', 'If you run the business from a home office, the borough usually expects one.');
    if (a.where === 'premises') add('renovation', 'If you renovate the space (plumbing, walls, façade).');
    if (ex.indexOf('sign') >= 0) add('sign', 'Needs your occupancy permit first; French must dominate.');
    if (ex.indexOf('terrace') >= 0) add('terrace', 'Seasonal permit from the borough.');
    if (a.food === 'meals' || a.food === 'home') add('mapaqRestaurant', a.food === 'home' ? 'Home kitchens: max 100 kg/month, direct sales only.' : 'Preparing food to eat on site or take away.');
    if (a.food === 'products') add('mapaqRetail', 'Selling food products to consumers.');
    if (a.food && a.food !== 'none') add('foodTraining', 'The manager course is mandatory for the person in charge.');
    if (ex.indexOf('alcohol') >= 0) add('racj', 'Selling or serving alcohol, including bring-your-own-wine.');
    if (ex.indexOf('reno') >= 0) add('rbq', 'Renovation for clients needs the right RBQ subcategory.');
    if (ex.indexOf('electric') >= 0) add('cmeq', 'Electrical contracting goes through the CMEQ.');
    if (ex.indexOf('plumbing') >= 0) add('cmmtq', 'Plumbing and heating contracting goes through the CMMTQ.');
    if (ex.indexOf('kids') >= 0) add('daycare', 'Since Sept. 1, 2026, more than 2 children needs recognition.');
    if (ex.indexOf('dogs') >= 0) add('dogwalker', 'More than 3 dogs at once in Montréal (max 8).');
    if (ex.indexOf('animals') >= 0) add('animals15', 'Keeping 15 or more cats or dogs.');
    if (ex.indexOf('hire') >= 0) add('employer', 'Before the first payday.');
    if (ex.indexOf('door') >= 0) add('itinerant', 'Contracts signed at the consumer\'s home.');
    if (ex.indexOf('tobacco') >= 0) add('tobacco', 'Plus age checks and display rules.');
    if (ex.indexOf('drone') >= 0) add('drone', 'For drones of 250 g to 25 kg.');
    if (ex.indexOf('truck') >= 0) add('heavyVehicle', 'Business trucks of 4,500 kg or more.');
    if (ex.indexOf('auto') >= 0) add('autoDecree', 'Montréal-region auto services with employees.');
    return out;
  }
  function finder(box) {
    var a = UI.store.get('finder', { where: 'premises', name: 'name', sales: 'low', food: 'none', extra: ['sign'] });
    box.innerHTML = '<div class="tl-grid"><form class="ui-card" data-finder>' + FQ.map(function (q) {
      return '<div class="tl-q"><b>' + esc(q[2]) + '</b><div class="tl-opts">' + q[3].map(function (o) {
        var on = q[1] === 'radio' ? a[q[0]] === o[0] : (a[q[0]] || []).indexOf(o[0]) >= 0;
        return opt(q[1], q[0], o[0], o[1], on, o[2]);
      }).join('') + '</div></div>';
    }).join('') + '</form><div class="ui-card tl-result" data-result></div></div>';
    var form = box.querySelector('[data-finder]');
    function read() {
      var v = { extra: [] };
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.checked) return;
        if (el.type === 'checkbox') v.extra.push(el.value); else v[el.name] = el.value;
      });
      return v;
    }
    function draw() {
      a = read(); UI.store.set('finder', a);
      var res = finderResult(a);
      box.querySelector('[data-result]').innerHTML = '<h3>' + UI.icon('stamp') + 'Your list: ' + UI.plural(res.length, 'item') + '</h3>' +
        (res.length ? res.map(function (r) {
          var p = BB.permits[r.id];
          return '<div class="tl-permit"><span class="bb-tile">' + UI.icon('check') + '</span><div style="flex:1;min-width:0"><b>' + esc(p.name) + '</b><small>' + esc(p.who) + ' · ' + esc(p.cost) + '</small>' +
            '<small style="color:var(--c-ink);margin-top:3px">' + esc(r.why) + '</small>' +
            '<div class="ui-row" style="gap:12px;margin-top:4px">' + (p.topic ? '<a class="small" href="#topic/' + esc(p.topic) + '" data-go="topic/' + esc(p.topic) + '">Learn more</a>' : '') +
            '<a class="small" href="' + esc(p.url) + '" target="_blank" rel="noopener">Official page</a></div></div></div>';
        }).join('') : '<p class="muted">With those answers, you may not need any registration yet: a sole proprietor under their own name, under $30,000, without premises. Still get insurance and keep good records.</p>') +
        '<p class="small muted" style="margin-top:14px">Always also: liability insurance, a business bank account, Law 25 if you collect customer info. Run <a href="https://bizpal-perle.ca/" target="_blank" rel="noopener">BizPaL</a> with your address for the complete official list.</p>';
    }
    form.addEventListener('change', draw);
    draw();
  }

  /* ---------------------------------------------------------------- break-even */
  function breakeven(box) {
    var v = UI.store.get('be', { fixed: 4500, pay: 3500, price: 35, varcost: 6, days: 22 });
    box.innerHTML = '<div class="tl-grid"><form class="ui-card" data-calc><h3>Your numbers (per month)</h3><div class="tl-fields">' +
      field('fixed', 'Fixed costs', v.fixed, 'Rent, insurance, phone, software, loan payments.') + field('pay', 'What you want to pay yourself', v.pay, 'Before income tax.') +
      field('price', 'Average price per sale', v.price, 'Before GST/QST.') + field('varcost', 'Variable cost per sale', v.varcost, 'Ingredients, products, card fees.') +
      field('days', 'Days open per month', v.days, '', 'wide') + '</div></form><div class="ui-card tl-out" data-out></div></div>';
    var f = box.querySelector('[data-calc]');
    function draw() {
      v = UI.formData(f); Object.keys(v).forEach(function (k) { v[k] = num(v[k]); }); UI.store.set('be', v);
      var margin = v.price - v.varcost, need = v.fixed + v.pay, out = box.querySelector('[data-out]');
      if (margin <= 0) { out.innerHTML = '<h3>Break-even</h3><div class="ui-error">Your price must be higher than the variable cost of each sale.</div>'; return; }
      var sales = Math.ceil(need / margin), perDay = v.days ? sales / v.days : 0;
      out.innerHTML = '<h3>' + UI.icon('chart') + 'To break even</h3><div><div class="tl-big">' + sales.toLocaleString('en-CA') + ' sales</div><div class="muted">a month, about <b>' + (Math.ceil(perDay * 10) / 10) + ' a day</b></div></div>' +
        '<div><div class="tl-kv"><span>Margin per sale</span><b>' + BB.money(margin, { cents: true }) + ' (' + Math.round(margin / v.price * 100) + '%)</b></div>' +
        '<div class="tl-kv"><span>Revenue needed per month</span><b>' + BB.money(sales * v.price) + '</b></div>' +
        '<div class="tl-kv"><span>Revenue per year</span><b>' + BB.money(sales * v.price * 12) + '</b></div></div>' +
        (sales * v.price * 12 > 30000 ? '<div class="ui-note">At that level you\'re above the <b>$30,000</b> small-supplier threshold: plan for GST/QST.</div>' : '') +
        '<p class="small muted">Tip: each extra sale above break-even is ' + BB.money(margin, { cents: true }) + ' of profit (before tax).</p>';
    }
    f.addEventListener('input', draw); draw();
  }

  /* ---------------------------------------------------------------- GST / QST */
  function taxes(box) {
    var v = UI.store.get('tx', { amount: 100, mode: 'add' });
    box.innerHTML = '<div class="tl-grid"><form class="ui-card" data-calc><h3>GST 5% + QST 9.975%</h3><div class="tl-fields">' + field('amount', 'Amount ($)', v.amount, '', 'wide') +
      '<div class="wide tl-opts">' + opt('radio', 'mode', 'add', 'Add taxes to a price', v.mode === 'add') + opt('radio', 'mode', 'remove', 'Taxes are included: split them out', v.mode === 'remove') + '</div></div></form>' +
      '<div class="ui-card tl-out" data-out></div></div>';
    var f = box.querySelector('[data-calc]');
    function draw() {
      v = UI.formData(f); v.amount = num(v.amount); UI.store.set('tx', v);
      var base = v.mode === 'add' ? v.amount : v.amount / 1.14975, gst = base * 0.05, qst = base * 0.09975;
      box.querySelector('[data-out]').innerHTML = '<h3>' + UI.icon('receipt') + (v.mode === 'add' ? 'With taxes' : 'Before taxes') + '</h3>' +
        '<div class="tl-big">' + BB.money(v.mode === 'add' ? base + gst + qst : base, { cents: true }) + '</div><div>' +
        '<div class="tl-kv"><span>Price before taxes</span><b>' + BB.money(base, { cents: true }) + '</b></div>' +
        '<div class="tl-kv"><span>GST (5%)</span><b>' + BB.money(gst, { cents: true }) + '</b></div>' +
        '<div class="tl-kv"><span>QST (9.975%)</span><b>' + BB.money(qst, { cents: true }) + '</b></div>' +
        '<div class="tl-kv"><span>Total</span><b>' + BB.money(base + gst + qst, { cents: true }) + '</b></div></div>' +
        '<p class="small muted">Only charge these once you\'re registered. Small suppliers (under $30,000) don\'t charge them.</p>';
    }
    f.addEventListener('input', draw); f.addEventListener('change', draw); draw();
  }

  /* ---------------------------------------------------------------- $30k tracker */
  function threshold(box) {
    var v = UI.store.get('th', { q1: 4000, q2: 6500, q3: 9000, q4: 8000 });
    box.innerHTML = '<div class="tl-grid"><form class="ui-card" data-calc><h3>Your taxable sales, last four calendar quarters</h3><p class="muted small">Quarters are Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec. Count sales of you and any associated business.</p><div class="tl-fields">' +
      field('q1', 'Oldest quarter', v.q1) + field('q2', 'Next quarter', v.q2) + field('q3', 'Next quarter', v.q3) + field('q4', 'Most recent quarter', v.q4) + '</div></form><div class="ui-card tl-out" data-out></div></div>';
    var f = box.querySelector('[data-calc]');
    function draw() {
      v = UI.formData(f); Object.keys(v).forEach(function (k) { v[k] = num(v[k]); }); UI.store.set('th', v);
      var total = v.q1 + v.q2 + v.q3 + v.q4, one = Math.max(v.q1, v.q2, v.q3, v.q4), over = total > 30000, single = one > 30000;
      box.querySelector('[data-out]').innerHTML = '<h3>' + UI.icon('flag') + 'Small supplier check</h3><div class="tl-big">' + BB.money(total) + '</div><div class="muted">over four quarters</div>' +
        '<div class="tl-meter' + (over ? ' over' : '') + '"><i style="width:' + Math.min(100, total / 300) + '%"></i></div><div class="small muted">' + Math.round(total / 300) + '% of the $30,000 threshold</div>' +
        (single ? '<div class="ui-error">One quarter alone is over $30,000: you stop being a small supplier right away and must register before the sale that crossed the line.</div>'
          : over ? '<div class="ui-error"><b>You\'re over $30,000.</b> You must register for GST/QST and start charging them by the end of the month after the quarter in which you crossed it.</div>'
          : '<div class="ui-note">You\'re a small supplier: registering is optional. ' + BB.money(30000 - total) + ' to go before it becomes mandatory.</div>') +
        '<a class="small" href="#topic/gst-qst" data-go="topic/gst-qst">How GST and QST work</a>';
    }
    f.addEventListener('input', draw); draw();
  }

  /* ---------------------------------------------------------------- hourly rate */
  function rate(box) {
    var v = UI.store.get('rt', { income: 55000, expenses: 6000, hours: 40, billable: 60, weeks: 4 });
    box.innerHTML = '<div class="tl-grid"><form class="ui-card" data-calc><h3>What should you charge per hour?</h3><div class="tl-fields">' +
      field('income', 'Yearly income you want ($)', v.income, 'Before income tax.') + field('expenses', 'Business expenses per year ($)', v.expenses, 'Tools, insurance, phone, software, car…') +
      field('hours', 'Hours you work per week', v.hours) + field('billable', 'Billable share (%)', v.billable, 'Travel, admin, quotes and marketing aren\'t billable: 50–70% is common.') +
      field('weeks', 'Weeks off per year', v.weeks, 'Holidays, sick days, slow weeks.', 'wide') + '</div></form><div class="ui-card tl-out" data-out></div></div>';
    var f = box.querySelector('[data-calc]');
    function draw() {
      v = UI.formData(f); Object.keys(v).forEach(function (k) { v[k] = num(v[k]); }); UI.store.set('rt', v);
      var qpp = Math.min(v.income, 74600) * 0.126 / 2;  // rough: the employer half of QPP you pay as self-employed
      var hours = Math.max(1, v.hours * (v.billable / 100) * Math.max(1, 52 - v.weeks));
      var r = (v.income + v.expenses + qpp) / hours;
      box.querySelector('[data-out]').innerHTML = '<h3>' + UI.icon('clock') + 'Your minimum rate</h3><div class="tl-big">' + BB.money(Math.ceil(r), { cents: false }) + ' / h</div>' +
        '<div><div class="tl-kv"><span>Billable hours per year</span><b>' + Math.round(hours).toLocaleString('en-CA') + '</b></div>' +
        '<div class="tl-kv"><span>Extra QPP you pay as self-employed (approx.)</span><b>' + BB.money(qpp) + '</b></div>' +
        '<div class="tl-kv"><span>Day rate (7 billable h)</span><b>' + BB.money(Math.ceil(r) * 7) + '</b></div></div>' +
        '<p class="small muted">This is your floor. Check what clients pay competitors, then price for your value. Add GST/QST on top once registered.</p>';
    }
    f.addEventListener('input', draw); draw();
  }

  /* ---------------------------------------------------------------- structure quiz */
  var SQ = [
    ['people', 'How many owners?', [['1', 'Just me', 0], ['2', 'Two of us', 1]]],
    ['profit', 'Expected yearly profit after a year or two?', [['low', 'Under $60,000', 0], ['mid', '$60,000–$120,000', 1], ['high', 'Over $120,000', 2]]],
    ['keep', 'Will you leave profits in the business (not spend them)?', [['no', 'No, I need it to live', 0], ['some', 'Some', 1], ['yes', 'Yes, a lot', 2]]],
    ['risk', 'Big contracts, debts or risks insurance won\'t cover?', [['no', 'Not really', 0], ['yes', 'Yes', 2]]],
    ['admin', 'Your appetite for paperwork and accountant fees?', [['low', 'Keep it simple', -1], ['ok', 'Fine with it', 1]]]
  ];
  function structure(box) {
    var a = UI.store.get('sq', { people: '1', profit: 'low', keep: 'no', risk: 'no', admin: 'low' });
    box.innerHTML = '<div class="tl-grid"><form class="ui-card tl-quiz" data-calc>' + SQ.map(function (q) {
      return '<div class="tl-q"><b>' + esc(q[1]) + '</b><div class="tl-opts">' + q[2].map(function (o) { return opt('radio', q[0], o[0], o[1], a[q[0]] === o[0]); }).join('') + '</div></div>';
    }).join('') + '</form><div class="ui-card tl-out" data-out></div></div>';
    var f = box.querySelector('[data-calc]');
    function draw() {
      a = UI.formData(f); UI.store.set('sq', a);
      var score = 0;
      SQ.forEach(function (q) { q[2].forEach(function (o) { if (a[q[0]] === o[0]) score += o[2]; }); });
      var two = a.people === '2', inc = score >= 4, maybe = score >= 2 && !inc;
      var title = inc ? 'Consider incorporating' : maybe ? (two ? 'Start as a partnership, plan to incorporate' : 'Start as a sole proprietor, revisit next year') : (two ? 'A registered partnership' : 'A sole proprietorship');
      var why = inc ? 'You expect profits you won\'t need to live on, or risks you want to keep away from your personal assets. A corporation costs $397 to create plus yearly filings and accountant fees, so run the numbers with an accountant first.'
        : maybe ? 'Start simple and cheap. When profits grow beyond what you need to live on, a corporation may lower taxes: you can move the business into one later.'
        : 'Simple, cheap and enough for most 1–2 person businesses starting out. Cover the lawsuit risk with liability insurance.' + (two ? ' Register the partnership and write a partnership agreement.' : '');
      box.querySelector('[data-out]').innerHTML = '<h3>' + UI.icon('scale') + 'Our suggestion</h3><div class="tl-big" style="font-size:1.7rem">' + esc(title) + '</div><p>' + esc(why) + '</p>' +
        '<div class="ui-row"><a class="ui-btn sm" href="#topic/structure" data-go="topic/structure">Compare the structures</a>' + (two ? '<a class="ui-btn sm" href="#topic/partners" data-go="topic/partners">Starting with a partner</a>' : '') + '</div>' +
        '<p class="small muted">A rule-of-thumb quiz, not tax advice.</p>';
    }
    f.addEventListener('change', draw); draw();
  }

  var DRAW = { finder: finder, breakeven: breakeven, taxes: taxes, threshold: threshold, rate: rate, structure: structure };
  UI.page('tools', { title: 'Tools', nav: 'Tools', icon: 'sliders', order: 40 }, function (view, ctx) {
    var tool = DRAW[ctx.args[0]] ? ctx.args[0] : 'finder';
    view.innerHTML = '<div class="ui-wrap"><section class="tl-head"><div class="eyebrow">Free tools</div><h1>Work it out</h1><p class="muted" style="font-size:1.08rem;max-width:40em">Find the permits that apply to you, and check your numbers before you commit. Your answers stay in this browser.</p></section>' +
      '<nav class="ui-tabs" aria-label="Tools">' + TOOLS.map(function (t) {
        return '<a href="#tools/' + t[0] + '" class="' + (t[0] === tool ? 'on' : '') + '">' + UI.icon(t[2]) + esc(t[1]) + '</a>';
      }).join('') + '</nav><div data-tool></div></div>';
    DRAW[tool](view.querySelector('[data-tool]'));
  });
})();

/* ===== topic.html ===== */
(function () {
  var esc = UI.esc, BB = window.BB;
  UI.page('topic', { title: function (a) { var t = BB.topic(a[0]); return t ? t.title : 'Basics'; } }, function (view, ctx) {
    var t = BB.topic(ctx.args[0]);
    if (!t) {
      view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('search') + '<h3>We don\'t have that topic</h3><a class="ui-btn primary" href="#basics" data-go="basics">All the basics</a></div></div>';
      return Promise.resolve();
    }
    var stage = BB.stages.filter(function (s) { return s.id === t.stage; })[0];
    var users = BB.guides.filter(function (g) { return g.topics.indexOf(t.slug) >= 0; });
    function secs(list) { return list.map(function (s) { return '<section class="tp-sec"><h2>' + esc(s[0]) + '</h2><div class="bb-prose">' + s[1] + '</div></section>'; }).join(''); }
    view.innerHTML = '<div class="ui-wrap tp-wrap"><section class="tp-hero"><nav class="gd-crumbs" aria-label="Breadcrumb"><a href="#basics" data-go="basics">The Basics</a><span>›</span><span>' + esc(stage ? stage.name : '') + '</span></nav>' +
      '<div class="ui-row" style="gap:16px;flex-wrap:nowrap;align-items:flex-start"><span class="bb-tile teal lg">' + UI.icon(t.icon) + '</span><div><h1>' + esc(t.title) + '</h1><div class="fr">' + esc(t.fr) + '</div></div></div>' +
      '<p class="lead">' + esc(t.summary) + '</p><div class="ui-row"><span class="ui-badge">' + UI.icon('clock') + t.minutes + ' min read</span><span data-save-box></span>' +
      (t.deeper && t.deeper.length ? '<a class="ui-btn ghost sm" href="#topic/' + esc(t.slug) + '" data-jump-deeper>' + UI.icon('sparkle') + 'Skip to going deeper</a>' : '') + '</div></section>' +
      '<div style="margin:22px 0">' + BB.checkNote() + '</div>' +
      secs(t.basics) +
      (t.deeper && t.deeper.length ? '<div class="tp-deeper" id="tp-deeper"><div class="tp-deeper-head"><span class="bb-tile">' + UI.icon('sparkle') + '</span><div><span class="ui-badge accent">Advanced</span><h2>Going deeper</h2></div></div>' + secs(t.deeper) + '</div>' : '') +
      (t.links && t.links.length ? '<section class="tp-sec"><h2>Official sources</h2>' + BB.sourceLinks(t.links) + '</section>' : '') +
      (users.length ? '<section class="tp-sec"><h2>Businesses where this matters most</h2><div class="tp-guides">' + users.map(function (g) {
        return '<a class="bb-chip" href="#guide/' + esc(g.slug) + '" data-go="guide/' + esc(g.slug) + '">' + UI.icon(g.icon) + esc(g.name) + '</a>';
      }).join('') + '</div></section>' : '') +
      (t.related && t.related.length ? '<section class="tp-sec"><h2>Read next</h2><div class="ui-grid">' + t.related.map(function (s) { var r = BB.topic(s); return r ? BB.topicCard(r) : ''; }).join('') + '</div></section>' : '') +
      '<div data-vote></div></div>';
    view.addEventListener('click', function (e) {
      if (e.target.closest('[data-jump-deeper]')) { e.preventDefault(); var el = view.querySelector('#tp-deeper'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
    });
    return BB.pageBar(view, view.querySelector('[data-save-box]'), view.querySelector('[data-vote]'), 'topic', t.slug, ctx.me);
  });
})();
