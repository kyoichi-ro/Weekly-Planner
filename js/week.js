// 週ビュー(ホーム画面)
(function () {
  'use strict';
  var WP = window.WP, U = WP.util, DB = WP.db;
  var HOUR = 48, PX = HOUR / 60, GUT = 30;
  var state = { ws: null, data: null };
  var enterDir = 0;

  function genreBg(data, id) { var g = id && data.genreMap[id]; return g ? g.color_light : 'var(--none)'; }

  // タイトルが空の予定は、紐づけたToDoの名前、なければジャンルの名前を出す
  function planTitle(p, data) {
    if (p.title) return p.title;
    var t = p.todo_id && data.todoMap[p.todo_id];
    if (t) return t.title;
    var g = p.genre_id && data.genreMap[p.genre_id];
    return g ? g.name : '';
  }

  function barHTML(t) {
    return '<div class="sbar">' + t.byGenre.map(function (x) {
      return '<div style="flex:' + x.min + ';background:' + x.genre.color + '"></div>';
    }).join('') + '</div>';
  }
  function legendHTML(t) {
    if (!t.byGenre.length) return '';
    return '<div class="leg">' + t.byGenre.map(function (x) {
      return '<span><i style="background:' + x.genre.color + '"></i>' + U.esc(x.genre.name) + ' ' + U.durText(x.min) + '</span>';
    }).join('') + '</div>';
  }

  function blockHTML(it, data, cls) {
    var p = it.plan, dur = p.end_min - p.start_min;
    var left = (it.col / it.cols * 100), width = (100 / it.cols);
    var title = U.esc(planTitle(p, data));
    var inner = '';
    if (dur >= 60) inner = U.hm(p.start_min) + '–' + U.hm(p.end_min) + '<b>' + title + '</b>';
    else if (dur >= 30) inner = '<b>' + title + '</b>';
    return '<div class="' + cls + (dur < 30 ? ' short' : '') + '" style="top:' + (p.start_min * PX) + 'px;height:' + (dur * PX - 1) +
      'px;left:calc(' + left + '% + 2px);width:calc(' + width + '% - 4px);background:' + genreBg(data, p.genre_id) + '">' +
      (inner ? '<div class="wbt">' + inner + '</div>' : '') + (it.overlap ? '<span class="bdg"></span>' : '') + '</div>';
  }

  // opts.keep が真なら、表示し直してもスクロール位置を保つ
  function render(ws, opts) {
    var old = opts && opts.keep && document.getElementById('wkScroll');
    var keep = old ? { top: old.scrollTop, left: old.scrollLeft } : { top: 0, left: 0 };
    return DB.loadWeek(ws).then(function (data) {
      state.ws = ws; state.data = data;
      data.todoMap = {};
      var allPlans = [], maxTodos = 0, today = U.today();
      data.days.forEach(function (d) {
        d.todos.forEach(function (t) { data.todoMap[t.id] = t; });
        allPlans = allPlans.concat(d.plans);
        maxTodos = Math.max(maxTodos, d.todos.length);
      });
      var wt = DB.totals(allPlans, data.genreMap);

      var h = '<div class="pull top" id="pullTop">' + U.icon('chevron-up', 16) + 'LAST WEEK</div>' +
        '<div class="pull bottom" id="pullBottom">' + U.icon('chevron-down', 16) + 'NEXT WEEK</div>' +
        '<div class="wk-scroll" id="wkScroll"><div class="wk-inner">';

      h += WP.backup.bannerHTML();

      h += '<div class="wk-full wk-tot"><div class="tot-head"><span class="hl">WEEKLY TOTAL</span><span class="big">' +
        U.durHTML(wt.total) + '</span></div>' + barHTML(wt) + legendHTML(wt) + '</div>';

      h += WP.template.rowHTML(data);

      h += '<div class="card wk-card"><div class="wk-row wk-dates"><div class="gut"></div>';
      data.days.forEach(function (d) {
        var dt = DB.totals(d.plans, data.genreMap).total;
        h += '<div class="col dh' + (d.day === today ? ' today' : '') + '" data-day="' + d.day + '"><div class="dd">' + U.md(d.day) +
          '<span>(' + U.weekday(d.day) + ')</span></div><div class="dt">' + U.durText(dt) + '</div></div>';
      });
      h += '</div>';

      h += '<div class="st wk-st"><span>TO DO</span><i class="rule"></i><b class="dia"></b></div>';
      if (!maxTodos) {
        h += '<div class="wk-empty empty">ToDoはまだありません。日付をタップして、その日の画面で追加します。</div>';
      } else {
        h += '<div class="wk-row"><div class="gut"></div>';
        data.days.forEach(function (d) {
          h += '<div class="col" data-day="' + d.day + '">';
          for (var i = 0; i < maxTodos; i++) {
            var t = d.todos[i];
            h += t ? '<div class="tc" style="background:' + genreBg(data, t.genre_id) + '"><button class="chk' + (t.done ? ' on' : '') +
              '" data-act="toggle" data-id="' + t.id + '" aria-label="チェック">' + U.icon('check', 12) + '</button><span class="tx' +
              (t.done ? ' done' : '') + '">' + U.esc(t.title) + '</span></div>' : '<div class="tc"></div>';
          }
          h += '</div>';
        });
        h += '</div>';
      }

      h += '<div class="st wk-st"><span>TIMELINE</span><i class="rule"></i><b class="dia"></b></div>';
      h += '<div class="wk-row"><div class="gut">';
      for (var hr = 0; hr < 24; hr++) h += '<div class="hr">' + hr + '</div>';
      h += '</div>';
      data.days.forEach(function (d) {
        h += '<div class="col" data-day="' + d.day + '"><div class="tl">';
        U.layoutPlans(d.plans).forEach(function (it) { h += blockHTML(it, data, 'wb'); });
        if (d.day === today) h += '<div class="nowl" data-now style="top:' + (U.nowMin() * PX) + 'px"></div>';
        h += '</div></div>';
      });
      h += '</div></div>';

      h += '<div class="wk-full card"><div class="st"><span>WEEK IN REVIEW</span><i class="rule"></i><b class="dia"></b></div>' +
        '<textarea class="memo" id="review" rows="3" placeholder="1週間の振り返りを書き込めます">' + U.esc(data.week.review) + '</textarea></div>';
      h += '</div></div>';

      var view = document.getElementById('view');
      view.innerHTML = h;
      layout();
      var sc = document.getElementById('wkScroll');
      sc.scrollTop = keep.top; sc.scrollLeft = keep.left;
      // 週送りで入ってきたときは、動いた向きが分かるように短く動かす
      if (enterDir) { sc.firstElementChild.classList.add(enterDir > 0 ? 'in-next' : 'in-last'); enterDir = 0; }
      if (data.autoAdded.length) WP.template.reportOverlaps(ws, data.autoAdded);
      // バナーが出ている間は、押してすぐ書き出せるようにファイルを用意しておく
      if (WP.backup.state.due) WP.backup.prepare();
      bind();
    });
  }

  // 画面の幅に合わせて列の幅を決める。縦向きは3日分と少し、横向きは7日分
  function layout() {
    var sc = document.getElementById('wkScroll');
    if (!sc) return;
    var sw = sc.clientWidth;
    var wide = sw >= 640 || window.innerWidth > window.innerHeight;
    var colw = Math.floor((sw - 44 - GUT) / (wide ? 7 : 3.4) * 10) / 10;
    sc.style.setProperty('--sw', sw + 'px');
    sc.style.setProperty('--colw', colw + 'px');
    sc.classList.toggle('ls', wide);
    var rv = document.getElementById('review');
    if (rv) U.autoGrow(rv);
  }

  function bind() {
    var sc = document.getElementById('wkScroll');
    sc.addEventListener('click', function (e) {
      var chk = e.target.closest('[data-act="toggle"]');
      if (chk) {
        DB.toggleTodo(chk.dataset.id).then(function (t) {
          if (!t) return;
          chk.classList.toggle('on', t.done);
          chk.nextElementSibling.classList.toggle('done', t.done);
        });
        return;
      }
      if (e.target.closest('[data-act="backup-now"]')) { WP.backup.exportNow(); return; }
      var tp = e.target.closest('[data-act="tpl-apply"], [data-act="tpl-remove"]');
      if (tp) {
        if (tp.dataset.act === 'tpl-apply') WP.template.openApply(state.ws);
        else WP.template.confirmRemove(state.data.applications.filter(function (a) { return a.id === tp.dataset.id; })[0]);
        return;
      }
      var col = e.target.closest('.col[data-day]');
      if (col) WP.app.go('day', col.dataset.day);
    });
    var rv = document.getElementById('review');
    var save = U.debounce(function () { DB.saveReview(state.ws, rv.value); }, 400);
    rv.addEventListener('input', function () { U.autoGrow(rv); save(); });
    rv.addEventListener('blur', function () { DB.saveReview(state.ws, rv.value); });
    bindPull(sc);
  }

  // 端からさらに引っ張ると前後の週へ。案内は引っ張っている間だけ出る
  function bindPull(sc) {
    var top = document.getElementById('pullTop'), bottom = document.getElementById('pullBottom');
    var TH = 86, sy = 0, sx = 0, mode = null, dist = 0, atTop = false, atBottom = false;

    function show(dir, d) {
      var el = dir < 0 ? top : bottom, other = dir < 0 ? bottom : top;
      other.style.height = '0px'; other.style.opacity = 0;
      el.style.height = d + 'px';
      el.style.opacity = Math.min(1, d / TH);
      el.classList.toggle('armed', d >= TH);
      sc.style.transform = d ? 'translateY(' + (dir < 0 ? d : -d) + 'px)' : '';
    }
    function reset() {
      sc.classList.add('anim');
      show(-1, 0); show(1, 0);
      setTimeout(function () { sc.classList.remove('anim'); }, 240);
    }
    function commit(dir) { enterDir = dir; WP.app.go('week', U.addDays(state.ws, dir * 7), true); }
    function edge(dir) { return dir < 0 ? sc.scrollTop <= 0 : sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1; }

    sc.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { mode = 'x'; return; }
      sy = e.touches[0].clientY; sx = e.touches[0].clientX;
      mode = null; dist = 0; atTop = edge(-1); atBottom = edge(1);
    }, { passive: true });
    sc.addEventListener('touchmove', function (e) {
      if (mode === 'scroll' || mode === 'x') return;
      var dy = e.touches[0].clientY - sy, dx = e.touches[0].clientX - sx;
      if (mode === null) {
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
        if (Math.abs(dx) > Math.abs(dy)) mode = 'x';
        else if (dy > 0 && atTop) mode = 'top';
        else if (dy < 0 && atBottom) mode = 'bottom';
        else mode = 'scroll';
        if (mode === 'scroll' || mode === 'x') return;
      }
      e.preventDefault();
      dist = Math.max(0, mode === 'top' ? dy : -dy) * 0.35;
      show(mode === 'top' ? -1 : 1, dist);
    }, { passive: false });
    function end() {
      if (mode !== 'top' && mode !== 'bottom') { mode = null; return; }
      var dir = mode === 'top' ? -1 : 1;
      mode = null;
      if (dist >= TH) commit(dir); else reset();
    }
    sc.addEventListener('touchend', end);
    sc.addEventListener('touchcancel', function () { mode = null; reset(); });

    // マウスのホイールやトラックパッドでも同じ動きにする(パソコンでの確認用)。
    // 必要な量を回した時点で、止まるのを待たずにすぐ切り替える
    sc.addEventListener('wheel', function (e) {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      var now = Date.now(), dir = e.deltaY > 0 ? 1 : -1, atEdge = edge(dir);
      var fresh = now - wheel.lastT > 180 || dir !== wheel.dir;
      if (wheel.locked) {
        // 切り替えた直後は、勢いで続く分を読み捨てる。いったん止まったら解除する
        if (!fresh) { wheel.lastT = now; e.preventDefault(); return; }
        wheel.locked = false;
      }
      if (fresh) wheel.startedAtEdge = atEdge;
      if (now - wheel.lastT > 700 || dir !== wheel.dir) wheel.acc = 0;
      wheel.lastT = now; wheel.dir = dir;
      if (!atEdge) return;
      // 途中で端に着いた場合、マウスのホイール(1目盛りが大きい)だけはそのまま数える。
      // トラックパッドは勢いで動き続けるので、端から回し始めたときだけ数える
      var mouse = Math.abs(e.deltaY) >= 50;
      if (!wheel.startedAtEdge && !mouse) return;
      e.preventDefault();
      wheel.acc += Math.abs(e.deltaY);
      var need = wheel.startedAtEdge ? 420 : 630;
      clearTimeout(wheel.timer);
      if (wheel.acc >= need) { wheel.acc = 0; wheel.locked = true; commit(dir); return; }
      show(dir, wheel.acc / need * TH);
      wheel.timer = setTimeout(function () { wheel.acc = 0; reset(); }, 700);
    }, { passive: false });
  }

  // ホイールの状態は、週を切り替えても引き継ぐ
  var wheel = { acc: 0, dir: 0, lastT: 0, startedAtEdge: false, locked: false, timer: null };

  WP.week = { render: render, layout: layout, state: state, planTitle: planTitle, genreBg: genreBg, barHTML: barHTML, HOUR: HOUR, PX: PX };
})();
