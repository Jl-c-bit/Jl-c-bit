/* LiveEarth fresh-photo panel: pick a spot, see the newest high-resolution
 * satellite photos already taken there, see which satellites pass over next,
 * and order either one. Talks to the site's own /earth/api (see api/skyfi.mjs),
 * which holds the SkyFi key.
 */
(function () {
  'use strict';

  var API = 'api';
  var POLL_MS = 60000;
  var ORDERS_KEY = 'liveearth.orders';
  var PASS_KEY = 'liveearth.passcode';
  var AREA_SIDES_KM = { block: 1, neighbourhood: 3, district: 5 };

  var map = window.LiveEarth.map;
  var toast = window.LiveEarth.toast;
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    status: null,
    point: null,
    area: 'block',
    picking: false,
    archives: null,
    passes: null,
    searchError: null,
    passError: null,
    loading: false,
    priority: false,
    orders: loadOrders(),
    pollTimer: null
  };

  var aoiRect = null;
  var pinMarker = null;
  var previewLayer = null;
  var previewId = null;

  // ---------- small utilities ----------

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'class') node.className = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) node.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function store(kind) {
    try { return kind === 'session' ? window.sessionStorage : window.localStorage; } catch (e) { return null; }
  }

  function loadOrders() {
    try { return JSON.parse(store('local').getItem(ORDERS_KEY)) || []; } catch (e) { return []; }
  }

  function saveOrders() {
    try { store('local').setItem(ORDERS_KEY, JSON.stringify(state.orders.slice(0, 30))); } catch (e) { /* per-browser convenience only */ }
  }

  function getPasscode() {
    var input = $('fresh-passcode');
    if (input && input.value) return input.value;
    try { return store('session').getItem(PASS_KEY) || ''; } catch (e) { return ''; }
  }

  function rememberPasscode(code) {
    try { store('session').setItem(PASS_KEY, code); } catch (e) { /* ignore */ }
  }

  function money(usd) {
    if (usd === 0) return 'Free';
    if (usd == null || isNaN(usd)) return 'price on request';
    return '$' + (usd >= 100 ? Math.round(usd).toLocaleString() : usd.toFixed(2));
  }

  function ago(iso) {
    var t = new Date(iso);
    if (isNaN(t)) return 'unknown time';
    var mins = Math.round((Date.now() - t.getTime()) / 60000);
    if (mins < 60) return mins + ' min ago';
    var h = Math.round(mins / 60);
    if (h < 48) return h + ' hours ago';
    return Math.round(h / 24) + ' days ago';
  }

  function inFuture(iso) {
    var t = new Date(iso);
    var mins = Math.round((t.getTime() - Date.now()) / 60000);
    var when = t.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    if (mins < 60) return 'in ' + Math.max(mins, 0) + ' min (' + when + ')';
    var h = Math.floor(mins / 60);
    return 'in ' + h + ' h ' + (mins % 60) + ' min (' + when + ')';
  }

  function resolutionLabel(cm, fallback) {
    if (cm && cm < 100) return Math.round(cm) + ' cm';
    if (cm) return (cm / 100).toFixed(1).replace(/\.0$/, '') + ' m';
    return fallback || '';
  }

  function areaBounds(lat, lng, sideKm) {
    var half = sideKm / 2;
    var dLat = half / 110.574;
    var dLng = half / (111.32 * Math.cos(lat * Math.PI / 180));
    return [[lat - dLat, lng - dLng], [lat + dLat, lng + dLng]];
  }

  function wktBounds(wkt) {
    var nums = String(wkt || '').match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 4) return null;
    var minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (var i = 0; i + 1 < nums.length; i += 2) {
      var lng = parseFloat(nums[i]), lat = parseFloat(nums[i + 1]);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    }
    return [[minLat, minLng], [maxLat, maxLng]];
  }

  function safeUrl(u) { return typeof u === 'string' && /^https:\/\//.test(u) ? u : null; }

  function thumbnailOf(a) {
    if (!a.thumbnailUrls) return null;
    var keys = Object.keys(a.thumbnailUrls);
    for (var i = keys.length - 1; i >= 0; i--) {
      var u = safeUrl(a.thumbnailUrls[keys[i]]);
      if (u) return u;
    }
    return null;
  }

  var STATUS_TEXT = {
    CREATED: 'Order placed',
    STARTED: 'Order placed',
    PROVIDER_PENDING: 'Waiting for the satellite',
    PROVIDER_COMPLETE: 'Photo taken',
    PROCESSING_PENDING: 'Processing the photo',
    INTERNAL_IMAGE_PROCESSING_PENDING: 'Processing the photo',
    PROCESSING_COMPLETE: 'Almost ready',
    DELIVERY_PENDING: 'Almost ready',
    DELIVERY_COMPLETED: 'Ready'
  };

  function statusText(s) {
    if (!s) return 'Checking…';
    if (/FAILED/.test(s)) return 'Failed (' + s.replace(/_/g, ' ').toLowerCase() + ')';
    return STATUS_TEXT[s] || s.replace(/_/g, ' ').toLowerCase();
  }

  // ---------- API ----------

  function api(method, path, body, needsOwner) {
    var headers = { 'Accept': 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (needsOwner) headers['X-Earth-Passcode'] = getPasscode();
    return fetch(API + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) {
            var err = new Error(data.error || ('Request failed (' + r.status + ')'));
            err.status = r.status;
            throw err;
          }
          return data;
        });
      });
  }

  function loadStatus() {
    return api('GET', '/status').then(function (s) { state.status = s; })
      .catch(function () { state.status = { configured: false, ordering: false, unreachable: true }; });
  }

  // ---------- map interaction ----------

  function startPicking() {
    state.picking = true;
    map.getContainer().style.cursor = 'crosshair';
    toast('Tap the map where you want a photo', 4000);
    render();
  }

  function stopPicking() {
    state.picking = false;
    map.getContainer().style.cursor = '';
  }

  map.on('click', function (e) {
    if (!state.picking) return;
    stopPicking();
    setPoint(e.latlng.wrap());
  });

  function drawAoi() {
    if (!state.point) return;
    var b = areaBounds(state.point.lat, state.point.lng, AREA_SIDES_KM[state.area]);
    if (!aoiRect) {
      aoiRect = L.rectangle(b, { color: '#38bdf8', weight: 2, fillOpacity: 0.08, dashArray: '6 4', interactive: false }).addTo(map);
      pinMarker = L.circleMarker(state.point, { radius: 5, color: '#fff', weight: 2, fillColor: '#38bdf8', fillOpacity: 1, interactive: false }).addTo(map);
    } else {
      aoiRect.setBounds(b);
      pinMarker.setLatLng(state.point);
    }
    return b;
  }

  function setPoint(latlng) {
    state.point = { lat: latlng.lat, lng: latlng.lng };
    var b = drawAoi();
    map.flyToBounds(L.latLngBounds(b).pad(1.5), { maxZoom: 16, duration: 1.2 });
    runSearch();
  }

  function clearPreview() {
    if (previewLayer) map.removeLayer(previewLayer);
    previewLayer = null;
    previewId = null;
  }

  function preview(id, tilesUrl, thumb, bounds) {
    clearPreview();
    var tiles = safeUrl(tilesUrl);
    if (tiles) {
      previewLayer = L.tileLayer(tiles, { maxZoom: 21, maxNativeZoom: 19, zIndex: 300, bounds: bounds || undefined }).addTo(map);
    } else if (thumb && bounds) {
      previewLayer = L.imageOverlay(thumb, bounds, { opacity: 0.95, interactive: false, zIndex: 300 }).addTo(map);
    } else {
      toast('No preview is available for this photo.');
      return;
    }
    previewId = id;
    previewLayer.on('tileerror', function () { toast('The preview tiles need SkyFi sign-in; showing the outline only.'); });
    if (bounds) map.flyToBounds(bounds, { maxZoom: 17, duration: 1 });
    render();
  }

  // ---------- data ----------

  function runSearch() {
    if (!state.point || !state.status || !state.status.configured) { render(); return; }
    state.loading = true;
    state.archives = state.passes = null;
    state.searchError = state.passError = null;
    render();
    var body = { lat: state.point.lat, lng: state.point.lng, area: state.area };
    var a = api('POST', '/search', Object.assign({ days: 60 }, body))
      .then(function (d) { state.archives = d.archives || []; })
      .catch(function (e) { state.searchError = e.message; });
    var p = api('POST', '/passes', Object.assign({ hours: 72 }, body))
      .then(function (d) { state.passes = d.passes || []; })
      .catch(function (e) { state.passError = e.message; });
    Promise.all([a, p]).then(function () { state.loading = false; render(); });
  }

  function ownerCheck() {
    if (!state.status || !state.status.ordering) {
      toast('Ordering is switched off on this site.');
      return false;
    }
    if (!getPasscode()) {
      toast('Enter your ordering passcode first.');
      var input = $('fresh-passcode');
      if (input) input.focus();
      return false;
    }
    return true;
  }

  function addOrder(order, extra) {
    var entry = Object.assign({ orderId: order.orderId, placedAt: new Date().toISOString() }, extra, { last: order });
    state.orders = [entry].concat(state.orders.filter(function (o) { return o.orderId !== entry.orderId; }));
    saveOrders();
    schedulePoll();
  }

  function orderFailed(e) {
    if (e.status === 401) {
      try { store('session').removeItem(PASS_KEY); } catch (x) { /* ignore */ }
    }
    toast(e.message, 6000);
  }

  function buyArchive(a) {
    if (!ownerCheck()) return;
    var msg = 'Buy this ' + resolutionLabel(a.gsdCm, a.resolution) + ' photo taken ' + ago(a.captureTimestamp) +
      ' for ' + money(a.priceUsd) + '?\n\nYour SkyFi account is charged. Typical delivery: ' +
      (a.deliveryTimeHours ? a.deliveryTimeHours + ' hours' : 'a few hours') + '.';
    if (!window.confirm(msg)) return;
    rememberPasscode(getPasscode());
    api('POST', '/order-archive', {
      archiveId: a.archiveId, lat: state.point.lat, lng: state.point.lng, area: state.area, expectedUsd: a.priceUsd
    }, true).then(function (d) {
      addOrder(d.order, { kind: 'Existing photo', lat: state.point.lat, lng: state.point.lng, area: state.area, priceUsd: d.priceUsd });
      toast('Ordered. It will appear under "Your orders".');
      render();
    }).catch(orderFailed);
  }

  function orderPass(p) {
    if (!ownerCheck()) return;
    var msg = 'Order ' + p.satellite + ' (' + p.provider + ') to photograph this spot on its pass ' + inFuture(p.passDate) + '?\n\n' +
      'Estimated ' + money(p.priceUsd) + (state.priority ? ' plus the priority fee' : '') +
      '. SkyFi sets the final price and charges your account. If clouds block the view, the satellite retries during the next 48 hours.';
    if (!window.confirm(msg)) return;
    rememberPasscode(getPasscode());
    api('POST', '/order-tasking', {
      lat: state.point.lat, lng: state.point.lng, area: state.area,
      resolution: p.resolution, productType: p.productType, provider: p.provider,
      estimateUsd: p.priceUsd, priority: state.priority, hours: 48
    }, true).then(function (d) {
      addOrder(d.order, { kind: 'New capture', lat: state.point.lat, lng: state.point.lng, area: state.area, priceUsd: p.priceUsd });
      toast(d.overCap ? 'Ordered, but SkyFi\'s final price is above your cap. Check the order.' : 'Satellite ordered. We\'ll update this panel as it progresses.', 6000);
      render();
    }).catch(orderFailed);
  }

  function refreshOrders() {
    if (!state.orders.length || !getPasscode()) return Promise.resolve();
    var pending = state.orders.filter(function (o) { return !o.last || !/COMPLETED|FAILED/.test(o.last.status || ''); });
    return Promise.all(pending.map(function (o) {
      return api('GET', '/orders/' + o.orderId, null, true).then(function (d) {
        var before = o.last && o.last.status;
        o.last = d.order;
        if (before !== d.order.status && d.order.status === 'DELIVERY_COMPLETED') toast('Your fresh photo is ready!', 6000);
      }).catch(function () { /* keep the last known status */ });
    })).then(function () { saveOrders(); render(); });
  }

  function schedulePoll() {
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(function () {
      if (!$('fresh').hidden && document.visibilityState === 'visible') refreshOrders();
    }, POLL_MS);
  }

  function showOrder(o) {
    var last = o.last || {};
    var bounds = wktBounds(last.aoi) || (o.lat != null ? areaBounds(o.lat, o.lng, AREA_SIDES_KM[o.area] || 1) : null);
    if (last.tilesUrl) preview('order:' + o.orderId, last.tilesUrl, null, bounds);
    else if (bounds) map.flyToBounds(bounds, { maxZoom: 16 });
  }

  function download(o) {
    api('GET', '/orders/' + o.orderId + '/download?type=image', null, true)
      .then(function (d) { if (safeUrl(d.url)) window.open(d.url, '_blank', 'noopener'); })
      .catch(function (e) { toast(e.message); });
  }

  // ---------- rendering ----------

  function setupMessage() {
    var s = state.status || {};
    if (s.unreachable) {
      return el('div', { class: 'notice' }, [
        el('strong', { text: 'The photo service isn\'t running here.' }),
        el('p', { text: 'It runs on the Netlify site. Open LiveEarth from your Netlify address to use it.' })
      ]);
    }
    return el('div', { class: 'notice' }, [
      el('strong', { text: 'Connect SkyFi to turn this on' }),
      el('ol', null, [
        el('li', null, ['Create an account at ', el('a', { href: 'https://app.skyfi.com', target: '_blank', rel: 'noopener', text: 'app.skyfi.com' }), ' and copy your API key (My Profile).']),
        el('li', { text: 'In Netlify, open Site configuration > Environment variables and add SKYFI_API_KEY.' }),
        el('li', { text: 'To allow ordering, also add EARTH_ORDER_PASSCODE (a secret phrase only you know) and optionally EARTH_MAX_ORDER_USD (default $500).' }),
        el('li', { text: 'Redeploy the site.' })
      ])
    ]);
  }

  function areaPicker() {
    var labels = { block: 'Street block · 1 km', neighbourhood: 'Neighbourhood · 3 km', district: 'District · 5 km' };
    return el('label', { class: 'row' }, [
      el('span', { text: 'Area' }),
      el('select', {
        id: 'fresh-area',
        onchange: function (e) { state.area = e.target.value; drawAoi(); runSearch(); }
      }, Object.keys(labels).map(function (k) {
        return el('option', { value: k, selected: state.area === k, text: labels[k] });
      }))
    ]);
  }

  function archiveCard(a) {
    var bounds = wktBounds(a.footprint);
    var thumb = thumbnailOf(a);
    var id = 'archive:' + a.archiveId;
    return el('li', { class: 'card' + (previewId === id ? ' active' : '') }, [
      thumb ? el('img', { class: 'thumb', src: thumb, alt: '', loading: 'lazy' }) : el('div', { class: 'thumb empty', text: '🛰️' }),
      el('div', { class: 'card-main' }, [
        el('div', { class: 'card-title', text: ago(a.captureTimestamp) + ' · ' + resolutionLabel(a.gsdCm, a.resolution) }),
        el('div', { class: 'card-sub', text: [a.constellation || a.provider, a.cloudCoveragePercent != null ? Math.round(a.cloudCoveragePercent) + '% cloud' : null, a.deliveryTimeHours ? '~' + a.deliveryTimeHours + ' h delivery' : null].filter(Boolean).join(' · ') }),
        el('div', { class: 'card-actions' }, [
          (a.tilesUrl || thumb) ? el('button', { class: 'ghost-btn', type: 'button', text: previewId === id ? 'Hide preview' : 'Preview', onclick: function () {
            if (previewId === id) { clearPreview(); render(); } else preview(id, a.tilesUrl, thumb, bounds);
          } }) : null,
          el('button', { class: 'buy-btn', type: 'button', text: 'Buy · ' + money(a.priceUsd), disabled: !state.status.ordering, onclick: function () { buyArchive(a); } })
        ])
      ])
    ]);
  }

  function passCard(p) {
    var sar = p.productType === 'SAR';
    return el('li', { class: 'card' }, [
      el('div', { class: 'thumb empty', text: sar ? '📡' : '🛰️' }),
      el('div', { class: 'card-main' }, [
        el('div', { class: 'card-title', text: inFuture(p.passDate) }),
        el('div', { class: 'card-sub', text: [p.satellite, p.resolution && p.resolution.toLowerCase(), sar ? 'radar: sees through cloud & at night' : 'photo'].filter(Boolean).join(' · ') }),
        el('div', { class: 'card-actions' }, [
          el('button', { class: 'buy-btn', type: 'button', text: 'Order capture · ~' + money(p.priceUsd), disabled: !state.status.ordering, onclick: function () { orderPass(p); } })
        ])
      ])
    ]);
  }

  function orderCard(o) {
    var last = o.last || {};
    var ready = last.status === 'DELIVERY_COMPLETED' || last.hasImage;
    return el('li', { class: 'card' }, [
      el('div', { class: 'thumb empty', text: ready ? '✅' : /FAILED/.test(last.status || '') ? '⚠️' : '⏳' }),
      el('div', { class: 'card-main' }, [
        el('div', { class: 'card-title', text: statusText(last.status) }),
        el('div', { class: 'card-sub', text: [o.kind, 'ordered ' + ago(o.placedAt), last.orderCostUsd != null ? money(last.orderCostUsd) : (o.priceUsd != null ? '~' + money(o.priceUsd) : null)].filter(Boolean).join(' · ') }),
        el('div', { class: 'card-actions' }, [
          el('button', { class: 'ghost-btn', type: 'button', text: last.tilesUrl ? 'Show on map' : 'Go to spot', onclick: function () { showOrder(o); } }),
          ready ? el('button', { class: 'ghost-btn', type: 'button', text: 'Download', onclick: function () { download(o); } }) : null
        ])
      ])
    ]);
  }

  function section(title, body, extra) {
    return el('section', { class: 'fresh-section' }, [el('h3', { text: title }), extra || null].concat(body));
  }

  function listOrMessage(items, error, empty, cardFn, limit) {
    if (error) return [el('p', { class: 'error', text: error })];
    if (items == null) return [el('p', { class: 'muted', text: 'Searching…' })];
    if (!items.length) return [el('p', { class: 'muted', text: empty })];
    return [el('ul', { class: 'cards' }, items.slice(0, limit).map(cardFn))];
  }

  function render() {
    var body = $('fresh-body');
    body.innerHTML = '';
    var s = state.status;
    if (!s) { body.appendChild(el('p', { class: 'muted', text: 'Loading…' })); return; }

    body.appendChild(el('p', { class: 'hint', text: 'Satellites sharp enough to see cars pass over each spot a few times a day. Buy the newest photo already taken, or book the next pass. Think of it like hailing a taxi to take a snapshot.' }));

    if (!s.configured) { body.appendChild(setupMessage()); return; }

    body.appendChild(el('div', { class: 'pick-row' }, [
      el('button', { class: 'primary-btn', type: 'button', text: state.picking ? 'Tap the map…' : (state.point ? '📍 Pick another spot' : '📍 Pick a spot on the map'), onclick: startPicking }),
      state.point ? el('button', { class: 'ghost-btn', type: 'button', text: 'Use map centre', onclick: function () { setPoint(map.getCenter().wrap()); } }) : null
    ]));

    if (state.point) {
      body.appendChild(areaPicker());
      body.appendChild(section('Already taken · newest first',
        listOrMessage(state.archives, state.searchError, 'No clear photos of this spot in the last 60 days. Book a pass below.', archiveCard, 12)));
      body.appendChild(section('Next satellite passes · 72 h',
        listOrMessage(state.passes, state.passError, 'No passes found for this spot in the next 72 hours.', passCard, 12),
        el('label', { class: 'row check' }, [
          el('input', { type: 'checkbox', checked: state.priority, onchange: function (e) { state.priority = e.target.checked; } }),
          el('span', { text: 'Priority: jump the queue (costs more, faster delivery)' })
        ])));
    } else {
      body.appendChild(el('p', { class: 'muted', text: 'Pick a spot to see what\'s available.' }));
    }

    if (s.ordering) {
      body.appendChild(section('Ordering', [
        el('label', { class: 'row' }, [
          el('span', { text: 'Passcode' }),
          el('input', { id: 'fresh-passcode', type: 'password', autocomplete: 'current-password', oninput: function (e) { rememberPasscode(e.target.value); }, placeholder: getPasscode() ? '•••••• (remembered this session)' : 'Your EARTH_ORDER_PASSCODE' })
        ]),
        el('p', { class: 'muted', text: 'Orders are charged to your SkyFi account. Anything over ' + money(s.maxOrderUsd) + ' is refused.' })
      ]));
    } else {
      body.appendChild(el('p', { class: 'muted', text: 'Browsing only. Set EARTH_ORDER_PASSCODE on Netlify to allow ordering.' }));
    }

    if (state.orders.length) {
      body.appendChild(section('Your orders', [
        el('ul', { class: 'cards' }, state.orders.map(orderCard)),
        el('button', { class: 'ghost-btn', type: 'button', text: 'Refresh status', onclick: function () {
          if (!getPasscode()) { toast('Enter your passcode to check orders.'); return; }
          rememberPasscode(getPasscode());
          refreshOrders();
        } })
      ]));
    }
  }

  // ---------- open / close ----------

  function open() {
    $('fresh').hidden = false;
    if (window.matchMedia('(max-width: 640px)').matches) {
      $('panel').hidden = true;
      $('panel-toggle').setAttribute('aria-expanded', 'false');
    }
    render();
    loadStatus().then(function () {
      render();
      if (!state.point && state.status.configured) startPicking();
      refreshOrders();
    });
    schedulePoll();
  }

  function close() {
    $('fresh').hidden = true;
    stopPicking();
    clearInterval(state.pollTimer);
  }

  $('fresh-open').addEventListener('click', open);
  $('fresh-quick').addEventListener('click', function () { $('fresh').hidden ? open() : close(); });
  $('fresh-close').addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('fresh').hidden) close();
  });
})();
