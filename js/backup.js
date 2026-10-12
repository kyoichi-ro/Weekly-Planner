// バックアップ(書き出し・復元)と、7日ごとのお知らせ
(function () {
  'use strict';
  var WP = window.WP, U = WP.util, DB = WP.db;
  var DAY = 86400000, REMIND_DAYS = 7;
  var state = { due: false, days: 0, last: null, settings: null };
  var cache = null;

  function ymdSlash(iso) { var d = new Date(iso); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); }

  // 前回のバックアップ(まだなら使い始めた日)から何日たったかを調べる
  function check() {
    return DB.get('settings', 'app').then(function (s) {
      var base = s.last_backup_at || s.first_used_at;
      state.settings = s;
      state.last = s.last_backup_at;
      state.days = Math.max(0, Math.floor((Date.now() - new Date(base).getTime()) / DAY));
      state.due = state.days >= REMIND_DAYS;
      return state;
    });
  }

  // すべてのデータを1つにまとめる
  function build() {
    return Promise.all(DB.STORE_NAMES.map(function (n) { return DB.getAll(n); })).then(function (arrs) {
      var data = {};
      DB.STORE_NAMES.forEach(function (n, i) { data[n] = arrs[i]; });
      return { app: 'weekly-planner', format: 1, exported_at: U.nowISO(), data: data };
    });
  }
  // 書き出すファイルを先に用意しておく。iPhoneの共有メニューは、ボタンを押した直後でないと開けないため
  function prepare() {
    var version = DB.changes();
    return build().then(function (obj) {
      var json = JSON.stringify(obj), name = 'weekly-planner-backup-' + U.today() + '.json', file = null;
      try { file = new File([json], name, { type: 'application/json' }); } catch (e) { /* 古い環境ではファイルを作れない */ }
      cache = { version: version, json: json, name: name, file: file };
      return cache;
    });
  }

  function markDone() {
    return DB.get('settings', 'app').then(function (s) {
      s.last_backup_at = U.nowISO();
      return DB.put('settings', s);
    }).then(check).then(function () {
      U.toast('バックアップを書き出しました');
      WP.app.renderHeader();
      if (WP.app.cur().view === 'week') WP.app.refresh();
      return true;
    });
  }
  function download(c) {
    var url = URL.createObjectURL(new Blob([c.json], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url; a.download = c.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    return markDone();
  }
  // スマホやタブレットでは共有メニューを開き、パソコンではファイルとして保存する
  var MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  function send(c) {
    if (MOBILE && c.file && navigator.canShare && navigator.canShare({ files: [c.file] })) {
      return navigator.share({ files: [c.file], title: 'Weekly Planner のバックアップ' }).then(markDone, function (err) {
        if (err && err.name === 'AbortError') return false;
        if (err && err.name === 'NotAllowedError') { openSheet(); U.toast('もう一度「バックアップを書き出す」を押してください'); return false; }
        return download(c);
      });
    }
    return download(c);
  }
  function exportNow() {
    if (cache && cache.version === DB.changes()) return send(cache);
    return prepare().then(send);
  }

  // ---- 復元
  function validate(obj) {
    if (!obj || obj.app !== 'weekly-planner' || obj.format !== 1 || !obj.data || typeof obj.data !== 'object') return false;
    return DB.STORE_NAMES.every(function (n) {
      var list = obj.data[n];
      if (list === undefined) return true;
      if (!Array.isArray(list)) return false;
      var key = DB.keyOf(n);
      return list.every(function (x) { return x && typeof x === 'object' && x[key] !== undefined && x[key] !== null && x[key] !== ''; });
    });
  }
  // 今あるデータをすべて置き換える
  function applyRestore(obj) {
    var data = {};
    DB.STORE_NAMES.forEach(function (n) { data[n] = obj.data[n] || []; });
    var s = data.settings.filter(function (x) { return x.key === 'app'; })[0];
    if (!s) { s = { key: 'app', first_used_at: U.nowISO(), data_version: 1 }; data.settings = [s]; }
    // 復元した直後は、今のデータと同じ内容のバックアップがある状態
    s.last_backup_at = U.nowISO();
    s.backup_modal_shown_at = null;
    return DB.replaceAll(data);
  }
  function restoreFromText(text) {
    var obj = null;
    try { obj = JSON.parse(text); } catch (e) { obj = null; }
    if (!validate(obj)) {
      return WP.modal({
        title: '読み込めませんでした', center: true, html: 'このファイルは、Weekly Planner のバックアップではないようです。',
        buttons: [{ label: 'OK', value: 'ok', primary: true }]
      }).then(function () { return false; });
    }
    var d = obj.data;
    return WP.modal({
      title: '復元しますか', center: true,
      html: ymdSlash(obj.exported_at) + ' のバックアップを読み込みます。<br>ToDo ' + (d.todos || []).length + '件、予定 ' + (d.plans || []).length +
        '件<br><br>今あるデータは、すべて置き換わります。<br>置き換えた後は、元に戻せません。',
      buttons: [{ label: 'やめる', value: 'no' }, { label: '復元', value: 'yes', primary: true }]
    }).then(function (v) {
      if (v !== 'yes') return false;
      return applyRestore(obj).then(function () {
        history.replaceState(null, '', location.pathname + location.search);
        location.reload();
        return true;
      });
    });
  }

  // ---- バックアップのシート(ドロワーから開く)
  function lastText() {
    if (!state.last) return 'まだありません';
    var days = Math.floor((Date.now() - new Date(state.last).getTime()) / DAY);
    return ymdSlash(state.last) + '(' + (days ? days + '日前' : '今日') + ')';
  }
  function openSheet() {
    check().then(prepare).then(function () {
      var h = '<p class="lab">バックアップ</p><div class="bk-last">前回: ' + lastText() + '</div>' +
        '<div class="hint" style="margin-bottom:12px">すべてのデータを1つのファイルにまとめます。保存先は、iPhoneの「ファイル」などから選べます。</div>' +
        '<button class="btn pri wide" data-act="export">' + U.icon('download', 18) + 'バックアップを書き出す</button>' +
        '<div class="bk-sep"></div><p class="lab">復元</p>' +
        '<div class="hint" style="margin-bottom:12px">バックアップのファイルを読み込みます。今あるデータは、すべて置き換わります。</div>' +
        '<label class="btn wide">ファイルを選んで復元する<input type="file" class="vh" id="bkFile" accept=".json,application/json,text/plain"></label>';
      var sheet = WP.sheet.open(h, {});
      sheet.querySelector('[data-act="export"]').addEventListener('click', function () {
        Promise.resolve(exportNow()).then(function (ok) { if (ok) WP.sheet.close(); });
      });
      sheet.querySelector('#bkFile').addEventListener('change', function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function () { WP.sheet.close(); restoreFromText(String(rd.result)); };
        rd.readAsText(f);
      });
    });
  }

  // ---- 7日たったときのお知らせ。モーダルは1回だけ出す
  var reminding = false;
  function remind() {
    return check().then(function (st) {
      WP.app.renderHeader();
      var s = st.settings, base = s.last_backup_at || s.first_used_at;
      if (!st.due || reminding || (s.backup_modal_shown_at && s.backup_modal_shown_at >= base)) return null;
      reminding = true;
      s.backup_modal_shown_at = U.nowISO();
      return DB.put('settings', s).then(prepare).then(function () {
        return WP.modal({
          title: 'バックアップをおすすめします', center: true,
          html: st.last ? '前回のバックアップから' + st.days + '日たちました。' : '使い始めてから' + st.days + '日たちました。<br>まだバックアップがありません。',
          buttons: [{ label: 'OK', value: 'ok' }, { label: 'バックアップ', value: 'backup', primary: true }]
        });
      }).then(function (v) {
        reminding = false;
        if (v === 'backup') return exportNow();
        return null;
      });
    });
  }

  // 週ビューの上部に出すバナー
  function bannerHTML() {
    if (!state.due) return '';
    return '<div class="wk-full bk-banner">' + U.icon('download', 19) + '<span>' + (state.last ? 'バックアップから' + state.days + '日' : 'バックアップがまだありません') +
      '</span><button class="btn sm pri" data-act="backup-now">バックアップ</button></div>';
  }

  WP.backup = {
    state: state, check: check, build: build, prepare: prepare, exportNow: exportNow, validate: validate, applyRestore: applyRestore,
    restoreFromText: restoreFromText, openSheet: openSheet, remind: remind, bannerHTML: bannerHTML, lastText: lastText
  };
})();
