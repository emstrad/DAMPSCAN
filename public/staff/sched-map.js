/* The map on the Scheduling page, so where everyone is reads at a glance:
   the chosen day's surveys as numbered pins in each surveyor's colour, joined
   in time order (their route), pencilled holds in grey, and every customer
   still to book as an orange pin. Tap an orange pin for its best fit times,
   from the board, and pencil in or book from there. Leaflet with
   OpenStreetMap tiles; positions come from postcodes on the server. */
(function (global) {
  'use strict';
  var COLOURS = { tom: '#4fa8e8', ben: '#b48cf2', ronnie: '#5fcf9e', scott: '#e3b341' };
  var map = null, layer = null;
  var cap = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
  function nice(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }

  function pin(L, at, colour, text, hollow) {
    var html = '<span class="map-pin' + (hollow ? ' is-hollow' : '') + '" style="--c:' + colour + '">' + (text || '') + '</span>';
    return L.marker([at.lat, at.lon], { icon: L.divIcon({ className: 'map-pin-wrap', html: html, iconSize: [28, 28], iconAnchor: [14, 14] }) });
  }

  /* A popup made of real buttons, so a tap books exactly like the board does. */
  function enquiryPopup(c, opts) {
    var box = document.createElement('div');
    var h = document.createElement('strong'); h.textContent = (c.name || 'No name') + (c.postcode ? ', ' + c.postcode : ''); box.appendChild(h);
    if (!c.best.length) { var p = document.createElement('p'); p.textContent = 'No free time in the next two weeks. Ask the surveyors to add hours.'; box.appendChild(p); }
    c.best.forEach(function (b) {
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn btn--sm map-fit';
      btn.textContent = nice(b.date) + ' ' + b.time + ' ' + cap(b.surveyor) + ': ' + b.why;
      btn.addEventListener('click', function () { opts.book(c, b); });
      box.appendChild(btn);
    });
    return box;
  }

  function render(mount, data, opts) {
    var L = global.L;
    /* The map library loads on its own, so the board never waits for it. */
    if (!L) {
      var js = document.getElementById('leaflet-js');
      if (js && !js.dataset.waiting) { js.dataset.waiting = '1'; js.addEventListener('load', function () { render(mount, data, opts); }); js.addEventListener('error', function () { mount.textContent = 'The map could not load.'; }); }
      if (!mount.textContent) mount.textContent = 'Loading the map.';
      return;
    }
    if (!map) mount.textContent = '';
    if (!map) {
      map = L.map(mount, { scrollWheelZoom: false }).setView([51.38, 0.4], 9);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    }
    if (layer) layer.remove();
    layer = L.layerGroup().addTo(map);
    var points = [];
    (data.dispatch.day.lanes || []).forEach(function (l) {
      var colour = COLOURS[l.surveyor] || '#999';
      var route = [];
      l.surveys.filter(function (s) { return s.at; }).forEach(function (s, i) {
        route.push([s.at.lat, s.at.lon]); points.push([s.at.lat, s.at.lon]);
        pin(L, s.at, colour, String(i + 1)).bindTooltip(cap(l.surveyor) + ' ' + (s.time || '') + ': ' + (s.name || '') + ', ' + (s.postcode || ''))
          .on('click', function () { if (global.DSPOP) global.DSPOP.open(s.id, { onChange: opts.reload }); }).addTo(layer);
      });
      if (route.length > 1) L.polyline(route, { color: colour, weight: 3, opacity: .8 }).addTo(layer);
      l.pencils.filter(function (p) { return p.at; }).forEach(function (p) {
        points.push([p.at.lat, p.at.lon]);
        pin(L, p.at, '#8a94a6', '?').bindTooltip('Pencilled ' + p.time + ': ' + (p.customerName || '') + ' (' + cap(l.surveyor) + ')').addTo(layer);
      });
    });
    (data.cards || []).filter(function (c) { return c.at; }).forEach(function (c) {
      points.push([c.at.lat, c.at.lon]);
      pin(L, c.at, '#f0a04b', '', true).bindTooltip('To book: ' + (c.name || '') + ', ' + (c.postcode || '')).bindPopup(enquiryPopup(c, opts)).addTo(layer);
    });
    if (points.length) map.fitBounds(points, { padding: [30, 30], maxZoom: 12 });
    setTimeout(function () { map.invalidateSize(); }, 50);
  }
  global.DSMAP = { render: render, colours: COLOURS };
})(window);
