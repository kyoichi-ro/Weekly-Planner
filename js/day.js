// 1日ビュー。その週の7日分を横に並べ、スワイプで1日ずつ移動する
(function () {
  'use strict';
  var WP = window.WP, U = WP.util, DB = WP.db, W = WP.week;
  var PX = W.PX, HOUR = W.HOUR;
  var state = { day: null, ws: null, data: null, early: false, resetWin: false, selected: null };

  function blockHTML(it, data, off) {
    var p = it.plan, dur = p.end_min - p.start_min;
    var left = it.col / it.cols * 100, width = 100 / it.cols;
    var title = U.esc(W.planTitle(p, data)), time = U.hm(p.start_min) + '–' + U.hm(p.end_min);
    var inner = '', sel = state.selected === p.id;
    if (dur >= 30) inner = '<span class="bt">' + time + '</span>' + (it.cols > 1 && dur >= 60 ? '<br>' : ' ') + title;
    // 選んでいる予定には、長さを変えるためのハンドルを上下に付ける
    return '<div class="blk' + (dur < 30 ? ' short' : '') + (sel ? ' sel' : '') + '" data-plan="' + p.id + '" style="top:' + ((p.start_min - off) * PX) + 'px;height:' +
      (dur * PX - 1) + 'px;left:calc(' + left + '% + 1px);width:calc(' + width + '% - 2px);background:' + W.genreBg(data, p.genre_id) + '">' +
      (inner ? '<div class="wbt">' + inner + '</div>' : '') + (it.overlap ? '<span class="bdg"></span>' : '') +
      (sel ? '<i class="hd top"></i><i class="hd bot"></i>' : '') + '</div>';
  }

  function pageHTML(d, data, today) {
    var t = DB.totals(d.plans, data.genreMap);
    var h = '<section class="day-page" data-day="' + d.day + '">';
    h += '<div class="day-tot"><div class="tot-head"><span class="hl">TOTAL</span><span class="big">' + U.durHTML(t.total) + '</span></div>' +
      W.barHTML(t) + '</div>';

    h += '<div class="card"><div class="st"><span>TO DO</span><i class="rule"></i><b class="dia"></b></div>';
    if (!d.todos.length) h += '<div class="empty">ToDoはまだありません。</div>';
    h += '<div class="todo-list">';
    d.todos.forEach(function (td) {
      h += '<div class="todo" role="button" tabindex="0" data-act="edit-todo" data-id="' + td.id + '" style="background:' +
        W.genreBg(data, td.genre_id) + '"><button class="chk' + (td.done ? ' on' : '') + '" data-act="toggle" data-id="' + td.id +
        '" aria-label="チェック">' + U.icon('check', 15) + '</button><span class="tx' + (td.done ? ' done' : '') + '">' + U.esc(td.title) + '</span></div>';
    });
    h += '</div><button class="add" data-act="add-todo">' + U.icon('plus', 18) + '追加</button></div>';

    // 6時より前は、予定があるときと、「もっと見る」を押したときだけ見せる
    var must = W.needsEarly(d), expanded = must || state.early, off = expanded ? 0 : W.EARLY;
    h += '<div class="card"><div class="st"><span>TIMELINE</span><i class="rule"></i><b class="dia"></b></div>' + (must ? '' : W.moreHTML(expanded)) +
      '<div class="tlwin" data-act="timeline" data-off="' + off + '"><div class="tlin" style="height:' + ((1440 - off) * PX) + 'px">';
    for (var hr = off / 60; hr < 24; hr++) h += '<div class="hr">' + hr + '</div>';
    h += '<div class="tl-area">';
    U.layoutPlans(d.plans).forEach(function (it) { h += blockHTML(it, data, off); });
    h += '</div>';
    if (d.day === today) h += '<div class="nowl" data-now data-off="' + off + '" style="top:' + ((U.nowMin() - off) * PX) + 'px"></div>';
    h += '</div></div></div>';

    h += '<div class="card"><div class="st"><span>MEMO</span><i class="rule"></i><b class="dia"></b></div>' +
      '<textarea class="memo" rows="3" data-memo="' + d.day + '" placeholder="自由に書き込めます">' + U.esc(d.note) + '</textarea></div>';
    return h + '</section>';
  }

  // opts.keep が真なら、表示し直しても各所のスクロール位置を保つ
  function render(day, opts) {
    var ws = U.mondayOf(day);
    var keep = null;
    if (!(opts && opts.keep)) { state.early = false; state.selected = null; }
    if (opts && opts.keep && document.getElementById('pager')) {
      keep = {};
      document.querySelectorAll('.day-page').forEach(function (pg) {
        keep[pg.dataset.day] = { page: pg.scrollTop, win: pg.querySelector('.tlwin').scrollTop };
      });
    }
    return DB.loadWeek(ws).then(function (data) {
      state.day = day; state.ws = ws; state.data = data;
      data.todoMap = {}; data.planMap = {};
      data.days.forEach(function (d) {
        d.todos.forEach(function (t) { data.todoMap[t.id] = t; });
        d.plans.forEach(function (p) { data.planMap[p.id] = p; });
      });
      if (state.selected && !data.planMap[state.selected]) state.selected = null;
      var today = U.today();
      var view = document.getElementById('view');
      view.innerHTML = '<div class="pager" id="pager">' + data.days.map(function (d) { return pageHTML(d, data, today); }).join('') + '</div>';
      var pager = document.getElementById('pager');
      reposition();
      // タイムラインの枠の最初の位置。今日は現在時刻が真ん中、他の日は最初の予定(なければ6時)
      pager.querySelectorAll('.day-page').forEach(function (page, i) {
        var d = data.days[i], win = page.querySelector('.tlwin'), off = +win.dataset.off, top;
        if (d.day === today) top = (U.nowMin() - off) * PX - win.clientHeight / 2;
        else if (d.plans.length) top = (d.plans[0].start_min - off) * PX - 12;
        else top = (W.EARLY - off) * PX;
        win.scrollTop = Math.max(0, top);
        page.querySelectorAll('.memo').forEach(U.autoGrow);
        if (keep && keep[d.day]) { page.scrollTop = keep[d.day].page; if (!state.resetWin) win.scrollTop = keep[d.day].win; }
        // 「もっと見る」で開け閉めした直後は、表示中の日の枠を先頭から見せる
        if (state.resetWin && d.day === day) win.scrollTop = 0;
        WP.tldrag.bind(win, d.day);
        // ToDo の行は、一覧の中では並べ替え、タイムラインの枠まで運ぶと予定になる
        var list = page.querySelector('.todo-list'), carry = WP.tldrag.carrier(page, d.day);
        WP.sortable(list, '.todo', {
          scroller: page,
          outside: carry.over,
          drop: function (item, x, y) {
            if (carry.drop(item)) return true;
            // TO DO の枠の外で離したら、並べ替えずに元の位置へ戻す
            var r = list.closest('.card').getBoundingClientRect();
            return y < r.top || y > r.bottom;
          },
          cancel: carry.clear,
          onEnd: function (ids) { DB.reorder('todos', ids); }
        });
      });
      state.resetWin = false;
      bind(pager);
      if (data.autoAdded.length) WP.template.reportOverlaps(ws, data.autoAdded);
    });
  }

  // 予定を選んだ状態(ハンドルが出ている状態)をやめる
  function deselect() {
    state.selected = null;
    var b = document.querySelector('.blk.sel');
    if (!b) return;
    b.classList.remove('sel');
    b.querySelectorAll('.hd').forEach(function (h) { h.remove(); });
  }

  function index() { return U.weekDays(state.ws).indexOf(state.day); }
  function reposition() {
    var pager = document.getElementById('pager');
    if (!pager) return;
    pager.scrollLeft = index() * pager.clientWidth;
  }
  function step(dir) {
    var pager = document.getElementById('pager');
    if (!pager) return;
    var i = Math.min(6, Math.max(0, index() + dir));
    pager.scrollTo({ left: i * pager.clientWidth, behavior: 'smooth' });
  }

  function bind(pager) {
    var raf = 0;
    pager.addEventListener('scroll', function () {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        if (!pager.clientWidth || pager.classList.contains('drag')) return;
        var d = state.data.days[Math.round(pager.scrollLeft / pager.clientWidth)];
        if (d && d.day !== state.day) { state.day = d.day; deselect(); WP.app.setDay(d.day); }
      });
    });

    pager.addEventListener('click', function (e) {
      if (dragged) { dragged = false; return; }
      // 予定を選んでいるときは、ほかの場所を押すと解除する。タイムラインの中なら、解除だけして終わる
      if (state.selected) {
        var onSel = e.target.closest('.blk.sel');
        deselect();
        if (!onSel && e.target.closest('[data-act="timeline"]')) return;
      }
      var chk = e.target.closest('[data-act="toggle"]');
      if (chk) {
        DB.toggleTodo(chk.dataset.id).then(function (t) {
          if (!t) return;
          chk.classList.toggle('on', t.done);
          chk.nextElementSibling.classList.toggle('done', t.done);
        });
        return;
      }
      if (e.target.closest('[data-act="add-todo"]')) { WP.todo.open({ day: state.day }); return; }
      var row = e.target.closest('[data-act="edit-todo"]');
      if (row) { WP.todo.open({ todo: state.data.todoMap[row.dataset.id] }); return; }
      if (e.target.closest('[data-act="early"]')) { state.early = !state.early; state.resetWin = true; WP.app.refresh(); return; }
      var win = e.target.closest('[data-act="timeline"]');
      if (!win) return;
      var blk = e.target.closest('.blk[data-plan]');
      if (blk) { WP.plan.open({ plan: state.data.planMap[blk.dataset.plan] }); return; }
      // タップした位置の時刻を、15分単位に丸めて開始時刻にする
      var y = e.clientY - win.querySelector('.tlin').getBoundingClientRect().top;
      var min = Math.max(0, Math.min(1380, Math.round((y / PX + (+win.dataset.off)) / 15) * 15));
      WP.plan.open({ day: win.closest('.day-page').dataset.day, start: min });
    });

    pager.addEventListener('input', function (e) {
      var ta = e.target.closest('[data-memo]');
      if (!ta) return;
      U.autoGrow(ta);
      clearTimeout(ta._t);
      ta._t = setTimeout(function () { DB.saveMemo(ta.dataset.memo, ta.value); }, 400);
    });
    pager.addEventListener('focusout', function (e) {
      var ta = e.target.closest && e.target.closest('[data-memo]');
      if (ta) { clearTimeout(ta._t); DB.saveMemo(ta.dataset.memo, ta.value); }
    });

    pager.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || e.target.closest('textarea, .tlwin, .todo')) return;
      down = true; dragged = false; sx = e.clientX; sl = pager.scrollLeft;
    });
  }

  // マウスで横に引いても日送りできるようにする(パソコンでの確認用)
  var down = false, dragged = false, sx = 0, sl = 0;
  window.addEventListener('mousemove', function (e) {
    var pager = document.getElementById('pager');
    if (!down || !pager) return;
    var dx = e.clientX - sx;
    if (!dragged && Math.abs(dx) < 6) return;
    dragged = true;
    pager.classList.add('drag');
    pager.scrollLeft = sl - dx;
  });
  window.addEventListener('mouseup', function (e) {
    var pager = document.getElementById('pager');
    if (!down) return;
    down = false;
    if (!dragged || !pager) return;
    var dx = e.clientX - sx, i = index();
    if (dx < -60) i++; else if (dx > 60) i--;
    i = Math.min(6, Math.max(0, i));
    pager.scrollTo({ left: i * pager.clientWidth, behavior: 'smooth' });
    setTimeout(function () { pager.classList.remove('drag'); pager.dispatchEvent(new Event('scroll')); }, 320);
  });

  WP.day = { render: render, reposition: reposition, step: step, state: state, deselect: deselect };
})();
