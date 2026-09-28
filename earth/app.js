/* LiveEarth: near-real-time satellite imagery on a zoomable web map.
 *
 * Live layers come from NASA GIBS (WMTS, CORS-enabled, no key). Their exact
 * tile matrix, format and newest timestamp are read from the GIBS
 * GetCapabilities document at runtime; the values below are only used until
 * that arrives (or if it can't be fetched).
 */
(function () {
  'use strict';

  var GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
  var CAPS_URL = GIBS + '/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0';
  var CAPS_REFRESH_MS = 10 * 60 * 1000;
  var LIVE_FRAMES = 12;   // 12 x 10 min = last 2 hours
  var DAILY_FRAMES = 7;   // last week
  var ISS_URL = 'https://api.wheretheiss.at/v1/satellites/25544';
  var ISS_POLL_MS = 3000;

  var LAYERS = [
    {
      id: 'goes-east',
      name: 'GOES-East',
      desc: 'Americas & Atlantic · every 10 min · day & night',
      kind: 'live',
      candidates: ['GOES-East_ABI_GeoColor', 'GOES-East_ABI_Band2_Red_Visible_1km'],
      tms: 'GoogleMapsCompatible_Level7', ext: 'png', stepMin: 10, lagMin: 40,
      center: [20, -75]
    },
    {
      id: 'goes-west',
      name: 'GOES-West',
      desc: 'Pacific & western Americas · every 10 min',
      kind: 'live',
      candidates: ['GOES-West_ABI_GeoColor', 'GOES-West_ABI_Band2_Red_Visible_1km'],
      tms: 'GoogleMapsCompatible_Level7', ext: 'png', stepMin: 10, lagMin: 40,
      center: [20, -140]
    },
    {
      id: 'himawari',
      name: 'Himawari-9',
      desc: 'Asia & Australia · every 10 min · daylight visible',
      kind: 'live',
      candidates: ['Himawari_AHI_GeoColor', 'Himawari_AHI_Band3_Red_Visible_1km'],
      tms: 'GoogleMapsCompatible_Level7', ext: 'png', stepMin: 10, lagMin: 40,
      center: [10, 135]
    },
    {
      id: 'viirs-noaa20',
      name: 'VIIRS NOAA-20',
      desc: 'Whole planet · true colour · today\'s passes · ~250 m',
      kind: 'daily',
      candidates: ['VIIRS_NOAA20_CorrectedReflectance_TrueColor'],
      tms: 'GoogleMapsCompatible_Level9', ext: 'jpg'
    },
    {
      id: 'viirs-snpp',
      name: 'VIIRS Suomi NPP',
      desc: 'Whole planet · true colour · today\'s passes',
      kind: 'daily',
      candidates: ['VIIRS_SNPP_CorrectedReflectance_TrueColor'],
      tms: 'GoogleMapsCompatible_Level9', ext: 'jpg'
    },
    {
      id: 'modis-terra',
      name: 'MODIS Terra',
      desc: 'Whole planet · true colour · morning pass',
      kind: 'daily',
      candidates: ['MODIS_Terra_CorrectedReflectance_TrueColor'],
      tms: 'GoogleMapsCompatible_Level9', ext: 'jpg'
    },
    {
      id: 'archive',
      name: 'Archive only',
      desc: 'Sharpest detail (street level), not live',
      kind: 'none'
    }
  ];

  LAYERS.forEach(function (layer) { if (layer.candidates) layer.gibs = layer.candidates[0]; });

  // ---------- helpers ----------

  var $ = function (id) { return document.getElementById(id); };

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function isoMinute(d) {
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) +
      'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':00Z';
  }

  function isoDay(d) {
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function floorTo(date, stepMin) {
    var step = stepMin * 60000;
    return new Date(Math.floor(date.getTime() / step) * step);
  }

  // Parses the time strings GIBS uses: "2026-09-28", "2026-09-28T02:50:00Z".
  function parseGibsTime(s) {
    if (!s) return null;
    s = s.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00Z';
    var d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function timeAgo(date) {
    var mins = Math.round((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 48) return hrs + ' h ' + (mins % 60) + ' min ago';
    return Math.round(hrs / 24) + ' days ago';
  }

  var toastTimer;
  function toast(msg, ms) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 3500);
  }

  function nativeZoom(layer) {
    var m = /Level(\d+)/.exec(layer.tms || '');
    return m ? parseInt(m[1], 10) : 9;
  }

  // ---------- state ----------

  var state = {
    layer: null,
    frames: [],        // Date objects, oldest first
    frameIndex: 0,
    opacity: 1,
    smartBlend: true,
    playing: false,
    playTimer: null,
    tileLayer: null,   // currently visible live tile layer
    capsLoaded: false
  };

  // ---------- map ----------

  var initial = readHash();
  var defaultLayer = initial.layerId ? byId(initial.layerId) : guessLayerForUser();

  var map = L.map('map', {
    center: initial.center || [25, defaultLayer.center ? defaultLayer.center[1] : 0],
    zoom: initial.zoom != null ? initial.zoom : 3,
    minZoom: 2,
    maxZoom: 19,
    worldCopyJump: true,
    zoomControl: true,
    attributionControl: true
  });
  map.zoomControl.setPosition('bottomright');

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    maxNativeZoom: 19,
    attribution: 'Archive imagery &copy; Esri, Maxar, Earthstar Geographics'
  }).addTo(map);

  map.createPane('live');
  map.getPane('live').style.zIndex = 250;
  map.createPane('labels');
  map.getPane('labels').style.zIndex = 450;
  map.getPane('labels').style.pointerEvents = 'none';

  var labelsLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    pane: 'labels',
    maxZoom: 19,
    attribution: 'Labels &copy; Esri'
  }).addTo(map);

  map.attributionControl.addAttribution('Live imagery: <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a> / NOAA / JMA');

  function byId(id) {
    for (var i = 0; i < LAYERS.length; i++) if (LAYERS[i].id === id) return LAYERS[i];
    return LAYERS[0];
  }

  // Pick the geostationary satellite that looks at the viewer's side of the planet,
  // judged from their timezone offset.
  function guessLayerForUser() {
    var lng = -new Date().getTimezoneOffset() / 60 * 15;
    if (lng <= -105) return byId('goes-west');
    if (lng <= -25) return byId('goes-east');
    if (lng >= 75) return byId('himawari');
    return byId('viirs-noaa20');
  }

  // ---------- URL hash (#lat,lng,zoom/layer) ----------

  function readHash() {
    var out = {};
    var m = /^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?:\/([\w-]+))?/.exec(location.hash);
    if (m) {
      out.center = [parseFloat(m[1]), parseFloat(m[2])];
      out.zoom = Math.round(parseFloat(m[3]));
      if (m[4]) out.layerId = m[4];
    }
    return out;
  }

  function writeHash() {
    var c = map.getCenter().wrap();
    var h = '#' + c.lat.toFixed(4) + ',' + c.lng.toFixed(4) + ',' + map.getZoom() +
      (state.layer ? '/' + state.layer.id : '');
    history.replaceState(null, '', h);
  }
  map.on('moveend', writeHash);

  // ---------- live layer + frames ----------

  function tileUrl(layer, time) {
    var t = layer.kind === 'daily' ? isoDay(time) : isoMinute(time);
    if (layer.template) {
      return layer.template
        .replace('{Time}', t)
        .replace('{TileMatrixSet}', layer.tms)
        .replace('{TileMatrix}', '{z}')
        .replace('{TileRow}', '{y}')
        .replace('{TileCol}', '{x}');
    }
    return GIBS + '/' + layer.gibs + '/default/' + t + '/' + layer.tms + '/{z}/{y}/{x}.' + layer.ext;
  }

  function latestTime(layer) {
    if (layer.latest) return layer.latest;
    var now = new Date();
    if (layer.kind === 'daily') return parseGibsTime(isoDay(now));
    return floorTo(new Date(now.getTime() - layer.lagMin * 60000), layer.stepMin);
  }

  function buildFrames(layer) {
    var frames = [];
    if (layer.kind === 'none') return frames;
    var newest = latestTime(layer);
    var count = layer.kind === 'daily' ? DAILY_FRAMES : LIVE_FRAMES;
    var stepMs = layer.kind === 'daily' ? 86400000 : layer.stepMin * 60000;
    for (var i = count - 1; i >= 0; i--) frames.push(new Date(newest.getTime() - i * stepMs));
    return frames;
  }

  function blendFactor() {
    if (!state.smartBlend || !state.layer || state.layer.kind === 'none') return 1;
    var over = map.getZoom() - nativeZoom(state.layer);
    if (over <= 1) return 1;
    if (over >= 4) return 0.2;
    return 1 - (over - 1) * (0.8 / 3);
  }

  function currentOpacity() { return state.opacity * blendFactor(); }

  function makeTileLayer(layer, time) {
    return L.tileLayer(tileUrl(layer, time), {
      pane: 'live',
      maxZoom: 19,
      maxNativeZoom: nativeZoom(layer),
      minNativeZoom: 0,
      opacity: 0,
      keepBuffer: 4,
      updateWhenZooming: false,
      crossOrigin: true,
      errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
      attribution: ''
    });
  }

  // Show frame i. The new layer is added invisibly and faded in once its tiles
  // have loaded, so scrubbing and playback don't flash black.
  function showFrame(i) {
    if (!state.layer || state.layer.kind === 'none') return;
    state.frameIndex = Math.max(0, Math.min(state.frames.length - 1, i));
    var layer = state.layer;
    var time = state.frames[state.frameIndex];
    var next = makeTileLayer(layer, time);
    var prev = state.tileLayer;
    state.tileLayer = next;

    var swapped = false;
    function swap() {
      if (swapped || state.tileLayer !== next) return;
      swapped = true;
      next.setOpacity(currentOpacity());
      if (prev) map.removeLayer(prev);
    }
    next.once('load', swap);
    setTimeout(swap, state.playing ? 1400 : 2500);
    next.addTo(map);
    if (!prev) swap();

    updateTimebar();
  }

  function selectLayer(layer, opts) {
    opts = opts || {};
    stopPlaying();
    state.layer = layer;
    if (state.tileLayer) { map.removeLayer(state.tileLayer); state.tileLayer = null; }
    state.frames = buildFrames(layer);
    renderLayerList();

    var scrub = $('scrub');
    scrub.max = Math.max(0, state.frames.length - 1);
    $('timebar').classList.toggle('disabled', layer.kind === 'none');

    if (layer.kind !== 'none') {
      showFrame(state.frames.length - 1);
      if (opts.fly && layer.center && !map.getBounds().pad(-0.3).contains(layer.center)) {
        map.flyTo(layer.center, Math.min(map.getZoom(), 4), { duration: 1.2 });
      }
    } else {
      updateTimebar();
    }
    writeHash();
  }

  // Refresh the frame list with a newer "latest" without disturbing the user
  // unless they're parked on the live frame.
  function refreshFrames() {
    var layer = state.layer;
    if (!layer || layer.kind === 'none') return;
    var wasLive = state.frameIndex === state.frames.length - 1;
    var oldNewest = state.frames[state.frames.length - 1];
    var frames = buildFrames(layer);
    var newest = frames[frames.length - 1];
    if (oldNewest && newest.getTime() === oldNewest.getTime()) { updateTimebar(); return; }
    var currentTime = state.frames[state.frameIndex];
    state.frames = frames;
    $('scrub').max = frames.length - 1;
    if (wasLive && !state.playing) {
      showFrame(frames.length - 1);
      toast('New ' + layer.name + ' image: ' + newest.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } else {
      var idx = 0;
      for (var i = 0; i < frames.length; i++) if (frames[i] <= currentTime) idx = i;
      state.frameIndex = idx;
      updateTimebar();
    }
  }

  function applyOpacity() {
    if (state.tileLayer) state.tileLayer.setOpacity(currentOpacity());
  }
  map.on('zoomend', applyOpacity);

  // ---------- time bar ----------

  function updateTimebar() {
    var layer = state.layer;
    var label = $('frame-time');
    var age = $('frame-age');
    var nowBtn = $('now');
    if (!layer || layer.kind === 'none') {
      label.textContent = 'Archive imagery';
      age.textContent = 'not live';
      nowBtn.classList.remove('on');
      return;
    }
    var t = state.frames[state.frameIndex];
    $('scrub').value = state.frameIndex;
    if (layer.kind === 'daily') {
      label.textContent = t.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
      age.textContent = state.frameIndex === state.frames.length - 1 ? 'today\'s passes (UTC)' : 'daily composite';
    } else {
      label.textContent = t.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      age.textContent = timeAgo(t);
    }
    var isLive = state.frameIndex === state.frames.length - 1;
    nowBtn.classList.toggle('on', isLive);
    nowBtn.setAttribute('aria-pressed', String(isLive));
  }

  function play() {
    if (!state.layer || state.layer.kind === 'none') return;
    state.playing = true;
    $('play').textContent = '❚❚';
    $('play').setAttribute('aria-label', 'Pause');
    if (state.frameIndex >= state.frames.length - 1) showFrame(0);
    state.playTimer = setInterval(function () {
      var i = state.frameIndex + 1;
      if (i >= state.frames.length) i = 0;
      showFrame(i);
    }, 900);
  }

  function stopPlaying() {
    state.playing = false;
    clearInterval(state.playTimer);
    $('play').textContent = '▶';
    $('play').setAttribute('aria-label', 'Play');
  }

  $('play').addEventListener('click', function () { state.playing ? stopPlaying() : play(); });
  $('scrub').addEventListener('input', function (e) { stopPlaying(); showFrame(parseInt(e.target.value, 10)); });
  $('now').addEventListener('click', function () { stopPlaying(); showFrame(state.frames.length - 1); });

  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.key === ' ') { e.preventDefault(); state.playing ? stopPlaying() : play(); }
    else if (e.key === '[') { stopPlaying(); showFrame(state.frameIndex - 1); }
    else if (e.key === ']') { stopPlaying(); showFrame(state.frameIndex + 1); }
  });

  // ---------- layer panel ----------

  function renderLayerList() {
    var list = $('layer-list');
    list.innerHTML = '';
    LAYERS.forEach(function (layer) {
      var label = document.createElement('label');
      label.className = 'layer' + (layer.unavailable ? ' unavailable' : '');
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'live-layer';
      input.value = layer.id;
      input.checked = state.layer === layer;
      input.disabled = !!layer.unavailable;
      input.addEventListener('change', function () { selectLayer(layer, { fly: true }); });
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = layer.name;
      if (layer.kind === 'live') name.insertAdjacentHTML('beforeend', '<span class="badge live">LIVE</span>');
      if (layer.kind === 'daily') name.insertAdjacentHTML('beforeend', '<span class="badge daily">DAILY</span>');
      var desc = document.createElement('span');
      desc.className = 'desc';
      desc.textContent = layer.unavailable ? 'Not offered by GIBS right now' : layer.desc;
      label.appendChild(input);
      label.appendChild(name);
      label.appendChild(desc);
      list.appendChild(label);
    });
  }

  $('opacity').addEventListener('input', function (e) {
    state.opacity = parseInt(e.target.value, 10) / 100;
    applyOpacity();
  });
  $('smart-blend').addEventListener('change', function (e) {
    state.smartBlend = e.target.checked;
    applyOpacity();
  });

  var panel = $('panel');
  var toggle = $('panel-toggle');
  function setPanel(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }
  toggle.addEventListener('click', function () { setPanel(panel.hidden); });
  if (window.matchMedia('(max-width: 640px)').matches) setPanel(false);

  $('ov-labels').addEventListener('change', function (e) {
    e.target.checked ? labelsLayer.addTo(map) : map.removeLayer(labelsLayer);
  });

  // ---------- GIBS capabilities ----------

  function childText(el, localName) {
    for (var n = el.firstElementChild; n; n = n.nextElementSibling) {
      if (n.localName === localName) return n.textContent.trim();
    }
    return null;
  }

  function parseCapabilities(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    var info = {};
    var layers = doc.getElementsByTagNameNS('*', 'Layer');
    for (var i = 0; i < layers.length; i++) {
      var el = layers[i];
      var id = childText(el, 'Identifier');
      if (!id) continue;
      var entry = { id: id };
      var links = el.getElementsByTagNameNS('*', 'TileMatrixSet');
      if (links.length) entry.tms = links[0].textContent.trim();
      var res = el.getElementsByTagNameNS('*', 'ResourceURL');
      if (res.length) entry.template = res[0].getAttribute('template');
      var dims = el.getElementsByTagNameNS('*', 'Dimension');
      if (dims.length) {
        var dim = dims[0];
        entry.defaultTime = childText(dim, 'Default');
        var values = dim.getElementsByTagNameNS('*', 'Value');
        if (values.length) {
          // Periods look like "start/end/PT10M"; the last one ends at the newest image.
          var parts = values[values.length - 1].textContent.trim().split('/');
          entry.lastTime = parts.length > 1 ? parts[1] : parts[0];
        }
      }
      info[id] = entry;
    }
    return info;
  }

  function applyCapabilities(info) {
    LAYERS.forEach(function (layer) {
      if (layer.kind === 'none') return;
      var found = null;
      for (var i = 0; i < layer.candidates.length && !found; i++) found = info[layer.candidates[i]] || null;
      if (!found) { layer.unavailable = true; return; }
      layer.unavailable = false;
      layer.gibs = found.id;
      if (found.tms) layer.tms = found.tms;
      if (found.template) layer.template = found.template;
      var latest = parseGibsTime(found.lastTime) || parseGibsTime(found.defaultTime);
      if (latest && latest.getTime() <= Date.now() + 3600000) layer.latest = latest;
    });
  }

  function loadCapabilities() {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 45000);
    return fetch(CAPS_URL, { signal: ctrl && ctrl.signal, cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (text) {
        clearTimeout(timer);
        var first = !state.capsLoaded;
        applyCapabilities(parseCapabilities(text));
        state.capsLoaded = true;
        if (state.layer.unavailable) {
          var fallback = LAYERS.filter(function (l) { return !l.unavailable && l.kind !== 'none'; })[0] || byId('archive');
          selectLayer(fallback);
        } else if (first) {
          // Template/tile matrix may have changed, so rebuild from scratch.
          var keepIndexFromEnd = state.frames.length - 1 - state.frameIndex;
          selectLayer(state.layer);
          if (keepIndexFromEnd > 0) showFrame(state.frames.length - 1 - keepIndexFromEnd);
        } else {
          renderLayerList();
          refreshFrames();
        }
      })
      .catch(function (err) {
        clearTimeout(timer);
        if (!state.capsLoaded) console.warn('GIBS capabilities unavailable, using estimated times', err);
      });
  }

  // ---------- day / night terminator ----------

  function sunPosition(date) {
    var rad = Math.PI / 180;
    var n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
    var L0 = (280.460 + 0.9856474 * n) % 360;
    var g = ((357.528 + 0.9856003 * n) % 360) * rad;
    var lambda = (L0 + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
    var eps = (23.439 - 0.0000004 * n) * rad;
    var ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / rad;
    var dec = Math.asin(Math.sin(eps) * Math.sin(lambda)) / rad;
    var gmst = (18.697374558 + 24.06570982441908 * n) % 24;
    var lng = ra - gmst * 15;
    lng = ((lng + 540) % 360) - 180;
    return { lat: dec, lng: lng };
  }

  function nightPolygon(date) {
    var rad = Math.PI / 180;
    var sun = sunPosition(date);
    var dec = sun.lat === 0 ? 0.0001 : sun.lat;
    var pts = [];
    for (var lng = -360; lng <= 360; lng += 2) {
      var ha = (lng - sun.lng) * rad;
      var lat = Math.atan(-Math.cos(ha) / Math.tan(dec * rad)) / rad;
      pts.push([lat, lng]);
    }
    var pole = dec > 0 ? -90 : 90;
    pts.push([pole, 360], [pole, -360]);
    return pts;
  }

  var terminator = L.polygon(nightPolygon(new Date()), {
    stroke: false,
    fillColor: '#000814',
    fillOpacity: 0.3,
    interactive: false
  }).addTo(map);

  function updateTerminator() { terminator.setLatLngs(nightPolygon(new Date())); }
  $('ov-terminator').addEventListener('change', function (e) {
    e.target.checked ? terminator.addTo(map) : map.removeLayer(terminator);
  });

  // ---------- ISS ----------

  var issIcon = L.divIcon({ className: 'iss-icon', html: '🛰️', iconSize: [30, 30], iconAnchor: [15, 15] });
  var issMarker = L.marker([0, 0], { icon: issIcon, keyboard: false, zIndexOffset: 1000 });
  var issFootprint = L.circle([0, 0], { radius: 1, color: '#fbbf24', weight: 1, fillOpacity: 0.06, interactive: false });
  var issTrail = L.polyline([], { color: '#fbbf24', weight: 2, opacity: 0.8, interactive: false });
  var issGroup = L.layerGroup([issFootprint, issTrail, issMarker]).addTo(map);
  var issPoints = [];
  var issTimer = null;
  var issFailures = 0;
  var issPlaced = false;

  function trailSegments(points) {
    // Break the line where it crosses the antimeridian so it doesn't streak across the map.
    var segs = [[]];
    for (var i = 0; i < points.length; i++) {
      var cur = segs[segs.length - 1];
      if (cur.length && Math.abs(points[i][1] - cur[cur.length - 1][1]) > 180) segs.push(cur = []);
      cur.push(points[i]);
    }
    return segs;
  }

  function pollIss() {
    fetch(ISS_URL)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        issFailures = 0;
        var ll = [d.latitude, d.longitude];
        issMarker.setLatLng(ll);
        issFootprint.setLatLng(ll).setRadius((d.footprint || 4500) * 500);
        issPoints.push(ll);
        if (issPoints.length > 600) issPoints.shift();
        issTrail.setLatLngs(trailSegments(issPoints));
        issMarker.bindPopup(
          '<strong>International Space Station</strong><br>' +
          'Altitude: ' + Math.round(d.altitude) + ' km<br>' +
          'Speed: ' + Math.round(d.velocity).toLocaleString() + ' km/h<br>' +
          'Over: ' + (d.visibility === 'daylight' ? 'daylight side' : 'night side')
        );
        issPlaced = true;
        if ($('ov-follow').checked) map.panTo(ll, { animate: true, duration: 1 });
      })
      .catch(function () {
        issFailures++;
        if (issFailures === 3) toast('ISS position feed is not responding; retrying.');
      });
  }

  function startIss() {
    if (issTimer) return;
    pollIss();
    issTimer = setInterval(pollIss, ISS_POLL_MS);
  }
  function stopIss() { clearInterval(issTimer); issTimer = null; }

  $('ov-iss').addEventListener('change', function (e) {
    if (e.target.checked) { issGroup.addTo(map); startIss(); }
    else { map.removeLayer(issGroup); stopIss(); $('ov-follow').checked = false; }
  });
  $('ov-follow').addEventListener('change', function (e) {
    if (!e.target.checked) return;
    if (!$('ov-iss').checked) { $('ov-iss').checked = true; issGroup.addTo(map); startIss(); }
    if (issPlaced) map.flyTo(issMarker.getLatLng(), Math.max(map.getZoom(), 4));
  });
  map.on('dragstart', function () { $('ov-follow').checked = false; });

  // ---------- search ----------

  $('search').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = $('search-input').value.trim();
    if (!q) return;
    var m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(q);
    if (m) { map.flyTo([parseFloat(m[1]), parseFloat(m[2])], 12); return; }
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q), {
      headers: { 'Accept': 'application/json' }
    })
      .then(function (r) { return r.json(); })
      .then(function (results) {
        if (!results.length) { toast('No place found for "' + q + '"'); return; }
        var b = results[0].boundingbox.map(parseFloat);
        map.flyToBounds([[b[0], b[2]], [b[1], b[3]]], { maxZoom: 16, duration: 2 });
        $('search-input').blur();
      })
      .catch(function () { toast('Search is unavailable right now.'); });
  });

  // ---------- boot ----------

  $('smart-blend').checked = state.smartBlend;
  selectLayer(defaultLayer);
  loadCapabilities();
  startIss();

  setInterval(function () {
    updateTerminator();
    if (document.visibilityState !== 'visible') return;
    loadCapabilities().then(function () { if (!state.capsLoaded) refreshFrames(); });
  }, CAPS_REFRESH_MS);

  // Keep the "x min ago" label and night shading current.
  setInterval(function () { updateTimebar(); updateTerminator(); }, 60000);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      if ($('ov-iss').checked) startIss();
    } else {
      stopIss();
      stopPlaying();
    }
  });
})();
