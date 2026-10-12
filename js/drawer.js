// ドロワー(右上のメニューから開く)
(function () {
  'use strict';
  var WP = window.WP, U = WP.util, DB = WP.db;
  var wrap = document.getElementById('drawer');
  var ITEMS = [
    { act: 'records', icon: 'books', label: '過去の記録', ready: true },
    { act: 'genres', icon: 'palette', label: 'ジャンル管理', ready: true },
    { act: 'templates', icon: 'template', label: 'テンプレート', ready: true },
    { act: 'backup', icon: 'download', label: 'バックアップ', ready: true }
  ];

  function open() {
    var h = '<div class="drawer-dim" data-act="close"></div><aside class="drawer" role="dialog" aria-label="メニュー">' +
      '<div class="dr-head"><img src="assets/splash-logo.png" alt="Weekly Planner" width="176"></div>' +
      '<nav style="margin-top:20px">';
    ITEMS.forEach(function (it) {
      var bk = it.act === 'backup';
      h += '<button class="mi" data-act="' + it.act + '"><span class="mi-ic">' + U.icon(it.icon, 23) + (bk && WP.backup.state.due ? '<span class="dot"></span>' : '') +
        '</span><span>' + it.label + (bk ? '<span class="sub">前回 ' + WP.backup.lastText() + '</span>' : '') + '</span>' +
        (it.ready ? '' : '<span class="soon">準備中</span>') + '</button>';
    });
    h += '</nav><div class="dr-ver"><span>バージョン ' + WP.app.version() + '</span><button data-act="update">最新にする</button></div></aside>';
    wrap.innerHTML = h;
    wrap.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { wrap.classList.add('open'); }); });
  }
  function close() {
    wrap.classList.remove('open');
    setTimeout(function () { wrap.hidden = true; wrap.innerHTML = ''; }, 240);
  }

  wrap.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;
    if (act === 'close') close();
    else if (act === 'genres' || act === 'records' || act === 'templates') { close(); WP.app.go(act); }
    else if (act === 'backup') { close(); WP.backup.openSheet(); }
    else if (act === 'update') WP.app.update();
  });

  WP.drawer = { open: open, close: close };
})();
