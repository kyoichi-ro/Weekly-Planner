// 起動と、画面の切り替え
(function () {
  'use strict';
  var WP = window.WP, U = WP.util, DB = WP.db;
  var cur = { view: 'week', ws: null, day: null };
  var hdr = document.getElementById('hdr');
  // 一覧の画面。見出しと、表示する関数
  var PAGES = {
    genres: { title: 'ジャンル管理', render: function () { return WP.genre.render(); } },
    records: { title: '過去の記録', render: function () { return WP.records.render(); } },
    templates: { title: 'テンプレート', render: function () { return WP.template.render(); } }
  };

  // 表示中の画面は URL の # 以降で表す(#/week/2026-10-12、#/day/2026-10-12)
  function parse() {
    var m = location.hash.match(/^#\/(week|day)\/(\d{4}-\d{2}-\d{2})$/);
    if (m && U.isYMD(m[2])) return { view: m[1], date: m[2] };
    var pg = location.hash.replace(/^#\//, '');
    if (PAGES[pg]) return { view: pg };
    return { view: 'week', date: U.today() };
  }

  function renderHeader() {
    var menu = '<button class="hbtn menu" data-act="menu" aria-label="メニュー">' + U.icon('menu', 25) +
      (WP.backup.state.due ? '<span class="dot"></span>' : '') + '</button>';
    if (PAGES[cur.view]) {
      hdr.innerHTML = '<button class="hbtn back" data-act="page-back" aria-label="戻る">' + U.icon('chevron-left', 20) + '戻る</button>' +
        '<h1 class="ttl">' + PAGES[cur.view].title + '</h1>' + menu;
    } else if (cur.view === 'day') {
      hdr.innerHTML = '<button class="hbtn back" data-act="back" aria-label="週に戻る">' + U.icon('chevron-left', 20) + '週</button>' +
        '<h1 class="date">' + U.dayLabel(cur.day) + '</h1>' + menu;
    } else {
      hdr.innerHTML = '<button class="hbtn logo" data-act="this-week" aria-label="今週に戻る"><img src="assets/logo-w.png" alt="" width="36" height="36"></button>' +
        '<h1 class="ttl">' + U.weekLabel(cur.ws) + '</h1>' + menu;
    }
  }

  function route() {
    var r = parse();
    if (PAGES[r.view]) {
      cur = { view: r.view, ws: null, day: null };
      renderHeader();
      return PAGES[r.view].render();
    }
    if (r.view === 'day') {
      cur = { view: 'day', day: r.date, ws: U.mondayOf(r.date) };
      lastWs = cur.ws;
      renderHeader();
      return WP.day.render(r.date);
    }
    cur = { view: 'week', ws: U.mondayOf(r.date), day: null };
    lastWs = cur.ws;
    renderHeader();
    return WP.week.render(cur.ws);
  }

  var pushedPage = false;
  // 最後に表示していた週(テンプレートを「表示中の週から作る」ときに使う)
  var lastWs = null;
  function go(view, date, replace) {
    var h = date ? '#/' + view + '/' + date : '#/' + view;
    if (!date) pushedPage = true;
    if (replace) history.replaceState(null, '', h); else history.pushState(null, '', h);
    return route().catch(fail);
  }

  // 保存した後などに、今の画面を表示し直す
  function refresh() {
    if (cur.view === 'day') return WP.day.render(cur.day, { keep: true });
    if (PAGES[cur.view]) return PAGES[cur.view].render();
    return WP.week.render(cur.ws, { keep: true });
  }

  // 1日ビューでスワイプして日が変わったとき
  function setDay(day) {
    cur.day = day;
    history.replaceState(null, '', '#/day/' + day);
    renderHeader();
  }

  function fail(err) {
    console.error(err);
    document.getElementById('view').innerHTML =
      '<div class="card" style="margin:14px">データを読み込めませんでした。ブラウザのプライベートモードでは保存ができないことがあります。</div>';
  }

  hdr.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'menu') WP.drawer.open();
    else if (el.dataset.act === 'back') go('week', U.mondayOf(cur.day), true);
    else if (el.dataset.act === 'page-back') {
      if (pushedPage) { pushedPage = false; history.back(); } else go('week', U.mondayOf(U.today()), true);
    }
    else if (el.dataset.act === 'this-week') go('week', U.mondayOf(U.today()), true);
  });

  window.addEventListener('popstate', function () { route().catch(fail); });
  window.addEventListener('resize', function () { WP.week.layout(); WP.day.reposition(); });
  window.addEventListener('keydown', function (e) {
    if (cur.view !== 'day' || /^(TEXTAREA|INPUT)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft') WP.day.step(-1);
    if (e.key === 'ArrowRight') WP.day.step(1);
  });

  // 現在時刻の線を動かす
  function tick() {
    var top = U.nowMin() * WP.week.PX + 'px';
    document.querySelectorAll('[data-now]').forEach(function (el) { el.style.top = top; });
  }
  setInterval(tick, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });

  WP.app = {
    go: go, setDay: setDay, refresh: refresh, renderHeader: renderHeader, cur: function () { return cur; },
    lastWeek: function () { return lastWs || U.mondayOf(U.today()); }
  };

  // 画面に戻ってきたときにも、バックアップのお知らせを確かめる
  document.addEventListener('visibilitychange', function () { if (!document.hidden) WP.backup.remind().catch(fail); });

  // 起動時のスプラッシュは、最初の画面が出たらすぐ消す
  function hideSplash() {
    var sp = document.getElementById('splash');
    if (!sp) return;
    sp.classList.add('out');
    setTimeout(function () { sp.remove(); }, 260);
  }

  DB.init().then(WP.backup.check).then(route).then(hideSplash, function (err) { hideSplash(); fail(err); }).then(WP.backup.remind).catch(fail);

  // 通信がなくても動くようにする仕組みを登録する。開発中のパソコン(localhost)では、
  // 古いファイルが残って紛らわしいので登録しない(?sw=1 を付けたときだけ試せる)
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && (!local || /[?&]sw=1/.test(location.search))) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function (e) { console.error(e); }); });
  }
})();
