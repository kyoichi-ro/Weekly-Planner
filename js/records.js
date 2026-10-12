// 過去の記録の一覧
(function () {
  'use strict';
  var WP = window.WP, U = WP.util, DB = WP.db;

  // 今週までの週のうち、ToDo・予定・メモ・振り返りのどれかがある週を、新しい順に集める
  function load() {
    return Promise.all([DB.getAll('todos'), DB.getAll('plans'), DB.getAll('day_notes'), DB.getAll('weeks'), DB.getGenres()]).then(function (r) {
      var thisWeek = U.mondayOf(U.today()), weeks = {}, genreMap = {};
      r[4].forEach(function (g) { genreMap[g.id] = g; });
      function touch(ws) {
        if (ws > thisWeek) return null;
        if (!weeks[ws]) weeks[ws] = { week_start: ws, plans: [] };
        return weeks[ws];
      }
      r[0].forEach(function (t) { touch(U.mondayOf(t.day)); });
      r[1].forEach(function (p) { var w = touch(U.mondayOf(p.day)); if (w) w.plans.push(p); });
      r[2].forEach(function (n) { if (n.memo && n.memo.trim()) touch(U.mondayOf(n.day)); });
      r[3].forEach(function (w) { if (w.review && w.review.trim()) touch(w.week_start); });
      var list = Object.keys(weeks).sort().reverse().map(function (ws) {
        var w = weeks[ws];
        w.totals = DB.totals(w.plans, genreMap);
        return w;
      });
      return { list: list, thisWeek: thisWeek };
    });
  }

  function render() {
    return load().then(function (d) {
      var max = 1;
      d.list.forEach(function (w) { max = Math.max(max, w.totals.total); });
      var h = '<div class="page">', year = null;
      if (!d.list.length) h += '<div class="empty" style="padding:8px 4px">まだ記録がありません。ToDoや予定を入れた週が、ここに並びます。</div>';
      d.list.forEach(function (w, i) {
        var y = U.parseYMD(w.week_start).getFullYear();
        if (y !== year) {
          if (year !== null) h += '</div>';
          year = y;
          h += '<div class="st out"' + (i ? ' style="margin-top:10px"' : '') + '><span>' + y + '</span><i class="rule"></i><b class="dia"></b></div><div class="card list">';
        }
        // バーの長さは、一覧の中で合計が最も多い週を基準にする
        var rest = max - w.totals.total;
        h += '<div class="li rec" role="button" tabindex="0" data-week="' + w.week_start + '"><div class="rec-head"><b>' + U.weekLabel(w.week_start) + '</b>' +
          (w.week_start === d.thisWeek ? '<span class="tag now">今週</span>' : '') + '<span class="rec-tot">' + U.durText(w.totals.total) + '</span>' +
          U.icon('chevron-right', 17) + '</div><div class="sbar">' + w.totals.byGenre.map(function (x) {
            return '<div style="flex:' + x.min + ';background:' + x.genre.color + '"></div>';
          }).join('') + (rest ? '<div style="flex:' + rest + '"></div>' : '') + '</div></div>';
      });
      if (year !== null) h += '</div>';
      h += '</div>';
      var view = document.getElementById('view');
      view.innerHTML = h;
      view.querySelector('.page').addEventListener('click', function (e) {
        var row = e.target.closest('.rec[data-week]');
        if (row) WP.app.go('week', row.dataset.week);
      });
    });
  }

  WP.records = { render: render };
})();
