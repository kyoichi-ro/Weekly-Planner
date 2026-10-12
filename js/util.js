// 日付・時刻・表示まわりの小さな道具
(function () {
  'use strict';
  var WP = window.WP = window.WP || {};
  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  function pad(n) { return String(n).padStart(2, '0'); }

  // 日付は 'YYYY-MM-DD' の文字で持つ(端末の現地時間)
  function toYMD(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYMD(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function isYMD(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && toYMD(parseYMD(s)) === s; }
  function addDays(s, n) { var d = parseYMD(s); d.setDate(d.getDate() + n); return toYMD(d); }
  function mondayOf(s) { var d = parseYMD(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return toYMD(d); }
  function today() { return toYMD(new Date()); }
  function weekDays(ws) { var a = []; for (var i = 0; i < 7; i++) a.push(addDays(ws, i)); return a; }
  function md(s) { var d = parseYMD(s); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function weekday(s) { return WD[parseYMD(s).getDay()]; }
  // 年またぎの週は月曜の年を使う
  function weekLabel(ws) { return '【' + parseYMD(ws).getFullYear() + '】' + md(ws) + '~' + md(addDays(ws, 6)); }
  function dayLabel(s) { return md(s) + '(' + weekday(s) + ')'; }

  // 時刻は「0時から数えた分」で持つ
  function hm(min) { return Math.floor(min / 60) + ':' + pad(min % 60); }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function durHTML(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return h + '<small>h</small>' + (m ? ' ' + m + '<small>m</small>' : '');
  }
  function durText(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return h + 'h' + (m ? ' ' + m + 'm' : '');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function nowISO() { return new Date().toISOString(); }
  function debounce(fn, ms) {
    var t;
    return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); };
  }

  var ICONS = {
    'chevron-left': 'M15 6l-6 6 6 6',
    'chevron-right': 'M9 6l6 6-6 6',
    'chevron-up': 'M6 15l6-6 6 6',
    'chevron-down': 'M6 9l6 6 6-6',
    menu: 'M4 7h16M4 12h16M4 17h16',
    plus: 'M12 5v14M5 12h14',
    check: 'M5 12l5 5L20 7',
    x: 'M6 6l12 12M18 6L6 18',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
    download: 'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 11l5 5 5-5M12 4v12',
    books: 'M5 4h4v16H5zM9 4h4v16H9zM14 8l4-1 3 12-4 1z',
    palette: 'M12 21a9 9 0 0 1 0-18c4.97 0 9 3.582 9 8c0 1.06-.474 2.078-1.318 2.828c-.844.75-1.989 1.172-3.182 1.172h-2.5a2 2 0 0 0-1 3.75a1.3 1.3 0 0 1-1 2.25M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
    template: 'M4 4h16v4H4zM4 12h6v8H4zM14 12h6M14 16h6M14 20h6',
    archive: 'M3 4h18v4H3zM5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4',
    grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01'
  };
  function icon(name, size) {
    size = size || 20;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + ICONS[name] + '"/></svg>';
  }

  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  // 複数行の入力欄を、中身の量に合わせて伸ばす
  function autoGrow(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.max(ta.scrollHeight, 78) + 'px';
  }

  // 同じ日の予定を、重なりがあれば横に並べる。戻り値は {plan, col, cols, overlap}
  function layoutPlans(plans) {
    var sorted = plans.slice().sort(function (a, b) { return a.start_min - b.start_min || a.end_min - b.end_min; });
    var out = [], group = [], groupEnd = -1;
    function flush() {
      var ends = [];
      group.forEach(function (it) {
        var c = 0;
        while (c < ends.length && ends[c] > it.plan.start_min) c++;
        ends[c] = it.plan.end_min;
        it.col = c;
      });
      group.forEach(function (it) { it.cols = ends.length; it.overlap = ends.length > 1; out.push(it); });
      group = []; groupEnd = -1;
    }
    sorted.forEach(function (p) {
      if (group.length && p.start_min >= groupEnd) flush();
      group.push({ plan: p });
      groupEnd = Math.max(groupEnd, p.end_min);
    });
    if (group.length) flush();
    return out;
  }

  WP.util = {
    toYMD: toYMD, parseYMD: parseYMD, isYMD: isYMD, addDays: addDays, mondayOf: mondayOf, today: today,
    weekDays: weekDays, md: md, weekday: weekday, weekLabel: weekLabel, dayLabel: dayLabel,
    hm: hm, nowMin: nowMin, durHTML: durHTML, durText: durText, esc: esc, uid: uid, nowISO: nowISO,
    debounce: debounce, icon: icon, toast: toast, autoGrow: autoGrow, layoutPlans: layoutPlans
  };
})();
