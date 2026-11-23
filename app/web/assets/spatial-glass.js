/* Reflet spatial local : aucun appel réseau, aucune donnée lue. */
(function () {
  'use strict';
  var SELECTOR = '.ios-glass,.ios-widget,.ios-dock,.ios-tabbar,' +
    '.card,.stat-card,.unit-card,.auth-card,.storage-card,' +
    '.welcome-card,.metric-card,.region-card,.recent-list,.shelf-panel,' +
    '.summary-region,.summary-stats article,' +
    '.laas-file-viewer,.file-viewer-toolbar,.file-viewer-stage,' +
    '.sidebar,.topbar,.progress-card,.panel,.palette-box,' +
    '.module-card,.lesson-card,.unit-card,.aside-card,.callout,' +
    '[class*="bg-[#101217]"],' +
    '.admin-metric,.admin-panel,.admin-chart-panel,.admin-console,' +
    '.admin-storage-card,.storage-card';

  document.addEventListener('pointermove', function (e) {
    var el = e.target.closest && e.target.closest(SELECTOR);
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.width && r.height) {
        el.style.setProperty('--ios-x', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
        el.style.setProperty('--ios-y', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
      }
    }
    var dock = e.target.closest && e.target.closest('.ios-dock,.ios-tabbar');
    if (dock) {
      var items = dock.children;
      for (var i = 0; i < items.length; i++) {
        var ir = items[i].getBoundingClientRect();
        var d = Math.abs(e.clientX - (ir.left + ir.width / 2));
        var s = 1 + 0.28 * Math.exp(-(d * d) / (74 * 74));
        items[i].style.transform = 'translateY(' + (-10 * ((s - 1) / 0.28)).toFixed(1) + 'px) scale(' + s.toFixed(3) + ')';
      }
    }
  }, { passive: true });

  document.addEventListener('pointerout', function (e) {
    var dock = e.target.closest && e.target.closest('.ios-dock,.ios-tabbar');
    if (dock && !dock.contains(e.relatedTarget)) {
      for (var i = 0; i < dock.children.length; i++) dock.children[i].style.transform = '';
    }
  }, { passive: true });
})();
