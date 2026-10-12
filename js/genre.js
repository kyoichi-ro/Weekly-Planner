// ジャンルの編集シートと、ジャンル管理の画面
(function () {
  'use strict';
  var WP = window.WP, U = WP.util, DB = WP.db;

  // 自分で作った色から、行の背景に使う薄い色を作る(白を多めに混ぜる)
  function lighten(hex) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function mix(c) { return Math.round(c * 0.24 + 255 * 0.76).toString(16).padStart(2, '0'); }
    return '#' + (mix(r) + mix(g) + mix(b)).toUpperCase();
  }

  // ジャンルを選ぶチップの並び。先頭は「なし」。アーカイブ済みは、今選ばれているものだけ出す
  function chipsHTML(genres, selectedId, withPlus) {
    var h = '<button class="chip' + (!selectedId ? ' sel' : '') + '" data-genre="" style="background:var(--none)">なし</button>';
    genres.forEach(function (g) {
      if (g.archived && g.id !== selectedId) return;
      h += '<button class="chip' + (g.id === selectedId ? ' sel' : '') + '" data-genre="' + g.id + '" style="background:' + g.color_light + '">' +
        U.esc(g.name) + '</button>';
    });
    if (withPlus) h += '<button class="chip plus" data-act="new-genre" aria-label="ジャンルを追加">' + U.icon('plus', 15) + '</button>';
    return h;
  }

  // opts.genre があれば編集、なければ新規。終わると opts.onDone(ジャンル)、やめると opts.onCancel()
  function openSheet(opts) {
    opts = opts || {};
    DB.getGenres().then(function (genres) {
      var g = opts.genre || null;
      var sel;
      if (g) {
        sel = { color: g.color, color_light: g.color_light };
      } else {
        var used = genres.filter(function (x) { return !x.archived; }).map(function (x) { return x.color; });
        var free = DB.PALETTE.filter(function (c) { return used.indexOf(c.color) < 0; })[0] || DB.PALETTE[0];
        sel = { color: free.color, color_light: free.color_light };
      }
      var inTotal = g ? g.in_total : true;
      var isPreset = DB.PALETTE.some(function (c) { return c.color === sel.color; });

      var h = '<p class="lab">名前</p><input class="field" id="gName" maxlength="20" autocomplete="off" value="' + U.esc(g ? g.name : '') + '">' +
        '<p class="lab">色</p><div class="pal">';
      DB.PALETTE.forEach(function (c, i) {
        h += '<button class="pc' + (c.color === sel.color ? ' sel' : '') + '" data-ci="' + i + '" style="background:' + c.color_light +
          ';border-color:' + c.color + '" aria-label="' + c.name + '"></button>';
      });
      h += '<label class="pc plus' + (isPreset ? '' : ' custom sel') + '" id="gCustom" aria-label="色を作る"' +
        (isPreset ? '' : ' style="background:' + sel.color_light + ';border-color:' + sel.color + '"') + '>' +
        (isPreset ? U.icon('plus', 16) : '') + '<input type="color" id="gColor" value="' + (isPreset ? '#9C88DD' : sel.color) + '"></label></div>';
      h += '<div class="tog-row"><span><span class="lab">TOTALに入れる</span><span class="hint">オフにすると合計時間に含めません</span></span>' +
        '<button class="tog' + (inTotal ? ' on' : '') + '" id="gTotal" role="switch" aria-checked="' + inTotal + '" aria-label="TOTALに入れる"></button></div>';
      h += '<div class="err" id="gErr" hidden></div><div class="act">' +
        (g ? '<button class="btn" data-act="archive">' + U.icon('archive', 17) + (g.archived ? '元に戻す' : 'アーカイブ') + '</button>' : '<span></span>') +
        '<button class="btn pri" data-act="done">完了</button></div>';

      var sheet = WP.sheet.open(h, { onDismiss: function () { if (opts.onCancel) opts.onCancel(); } });
      var nameEl = sheet.querySelector('#gName');
      if (!g) nameEl.focus();

      function clearSel() { sheet.querySelectorAll('.pc.sel').forEach(function (el) { el.classList.remove('sel'); }); }
      sheet.querySelector('#gColor').addEventListener('input', function (e) {
        sel = { color: e.target.value.toUpperCase(), color_light: lighten(e.target.value) };
        clearSel();
        var lb = sheet.querySelector('#gCustom');
        lb.classList.add('custom', 'sel');
        lb.style.background = sel.color_light; lb.style.borderColor = sel.color;
        var ic = lb.querySelector('svg');
        if (ic) ic.remove();
      });
      function done() {
        var name = nameEl.value.trim();
        if (!name) {
          var er = sheet.querySelector('#gErr');
          er.textContent = '名前を入れてください'; er.hidden = false;
          nameEl.focus();
          return;
        }
        var p;
        if (g) {
          g.name = name; g.color = sel.color; g.color_light = sel.color_light; g.in_total = inTotal;
          p = DB.saveGenre(g).then(function () { return g; });
        } else {
          p = DB.addGenre({ name: name, color: sel.color, color_light: sel.color_light, in_total: inTotal });
        }
        p.then(function (saved) {
          if (opts.onDone) opts.onDone(saved); else { WP.sheet.close(); WP.app.refresh(); }
        });
      }
      nameEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); done(); } });
      sheet.addEventListener('click', function (e) {
        var pc = e.target.closest('.pc[data-ci]');
        if (pc) {
          var c = DB.PALETTE[+pc.dataset.ci];
          sel = { color: c.color, color_light: c.color_light };
          clearSel(); pc.classList.add('sel');
          return;
        }
        var tg = e.target.closest('#gTotal');
        if (tg) { inTotal = !inTotal; tg.classList.toggle('on', inTotal); tg.setAttribute('aria-checked', inTotal); return; }
        var act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'done') done();
        if (act.dataset.act === 'archive') {
          g.archived = !g.archived;
          DB.saveGenre(g).then(function () {
            if (opts.onDone) opts.onDone(g); else { WP.sheet.close(); WP.app.refresh(); }
          });
        }
      });
    });
  }

  // ジャンル管理の画面
  function render() {
    return DB.getGenres().then(function (genres) {
      var active = genres.filter(function (g) { return !g.archived; });
      var archived = genres.filter(function (g) { return g.archived; });
      var h = '<div class="page"><div class="st out"><span>GENRE</span><i class="rule"></i><b class="dia"></b></div>';
      if (active.length) {
        h += '<div class="card list" id="gList">';
        active.forEach(function (g) {
          h += '<div class="li g-row" role="button" tabindex="0" data-id="' + g.id + '"><span class="sw" style="background:' + g.color_light +
            ';border-color:' + g.color + '"></span><span>' + U.esc(g.name) + '</span>' +
            (g.in_total ? '' : '<span class="tag">TOTALに入れない</span>') + '<span class="grip">' + U.icon('grip', 20) + '</span></div>';
        });
        h += '</div>';
      } else {
        h += '<div class="empty">ジャンルはまだありません。</div>';
      }
      h += '<button class="add out" data-act="add-genre">' + U.icon('plus', 18) + 'ジャンルを追加</button>';
      if (archived.length) {
        h += '<div class="st out" style="margin-top:10px"><span>ARCHIVE</span><i class="rule"></i><b class="dia"></b></div><div class="card list">';
        archived.forEach(function (g) {
          h += '<div class="li" style="color:var(--mute)"><span class="sw" style="background:' + g.color_light + ';border-color:' + g.color +
            '"></span><span>' + U.esc(g.name) + '</span><button class="btn sm" style="margin-left:auto" data-act="restore" data-id="' + g.id + '">戻す</button></div>';
        });
        h += '</div>';
      }
      h += '<div class="hint" style="padding:0 4px">行を長押しして、そのまま動かすと並べ替えられます。</div></div>';

      var view = document.getElementById('view');
      view.innerHTML = h;
      var byId = {};
      genres.forEach(function (g) { byId[g.id] = g; });
      var list = document.getElementById('gList');
      if (list) WP.sortable(list, '.g-row', { onEnd: function (ids) { DB.reorder('genres', ids); } });
      view.querySelector('.page').addEventListener('click', function (e) {
        var rs = e.target.closest('[data-act="restore"]');
        if (rs) {
          var g = byId[rs.dataset.id];
          g.archived = false;
          DB.saveGenre(g).then(render);
          return;
        }
        if (e.target.closest('[data-act="add-genre"]')) { openSheet({}); return; }
        var row = e.target.closest('.g-row');
        if (row) openSheet({ genre: byId[row.dataset.id] });
      });
    });
  }

  WP.genre = { openSheet: openSheet, render: render, chipsHTML: chipsHTML };
})();
