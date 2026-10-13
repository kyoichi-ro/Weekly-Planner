// 1日ビューのタイムラインでのドラッグ操作(予定の移動、長さの変更、長押しでの新規作成、ToDoを運び入れる)
(function () {
  'use strict';
  var WP = window.WP, U = WP.util, DB = WP.db;
  var HOLD = 380, SLOP = 8, SNAP = 15, MINLEN = 15, EDGE = 40, DAY_END = 1440, DWELL = 300;
  var lastTouch = 0;

  function snap(m) { return Math.round(m / SNAP) * SNAP; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function range(s, e) { return U.hm(s) + '–' + U.hm(e); }

  // 枠(.tlwin)のうち、画面に見えている部分
  function visible(win) {
    var r = win.getBoundingClientRect(), p = win.closest('.day-page').getBoundingClientRect();
    return { top: Math.max(r.top, p.top), bottom: Math.min(r.bottom, p.bottom), left: r.left, right: r.right };
  }

  // ブロックを s〜e(分)の位置に置き、今の時刻のラベルを付ける
  function place(el, win, off, s, e) {
    var PX = WP.week.PX;
    el.style.top = ((s - off) * PX) + 'px';
    el.style.height = ((e - s) * PX - 1) + 'px';
    el.classList.toggle('short', e - s < 30);
    var lab = el.querySelector('.dlab');
    if (!lab) { lab = document.createElement('span'); lab.className = 'dlab'; el.appendChild(lab); }
    lab.textContent = range(s, e);
    // 枠の上端に近いときは、ラベルをブロックの内側に出す
    lab.classList.toggle('in', (s - off) * PX - win.scrollTop < 26);
    var bt = el.querySelector('.bt');
    if (bt) bt.textContent = range(s, e);
  }

  function undoToast(msg, undo) {
    U.toast(msg, { action: '元に戻す', onAction: function () { undo().then(function () { WP.app.refresh(); }); } });
  }

  // win はタイムラインの枠(.tlwin)、day はその日付
  function bind(win, day) {
    var PX = WP.week.PX;
    var tlin = win.querySelector('.tlin'), area = win.querySelector('.tl-area'), off = +win.dataset.off;
    var flow = U.creep(win);
    var mode = null, timer = null, sx = 0, sy = 0, py = 0;
    var el = null, plan = null, orig = null, cur = null, grab = 0, anchor = 0, moved = false, raf = 0;

    function timeAt(y) { return (y - tlin.getBoundingClientRect().top) / PX + off; }

    // 指の位置から、今の開始と終了を決める(15分刻み)
    function update() {
      var t = timeAt(py), dur;
      if (mode === 'move') {
        dur = orig.e - orig.s;
        cur.s = clamp(snap(t - grab), Math.min(off, orig.s), DAY_END - dur);
        cur.e = cur.s + dur;
      } else if (mode === 'top') {
        cur.s = clamp(snap(t), Math.min(off, orig.s), cur.e - MINLEN);
      } else if (mode === 'bot') {
        cur.e = clamp(snap(t), cur.s + MINLEN, DAY_END);
      } else if (mode === 'create') {
        // 動かす前は1時間。下へ動かすと、指の位置まで伸びる
        cur.s = anchor;
        cur.e = moved ? clamp(snap(t), anchor + MINLEN, DAY_END) : Math.min(DAY_END, anchor + 60);
      }
      place(el, win, off, cur.s, cur.e);
    }

    // 指を動かした後、枠の上端・下端の近くにいる間は、枠を自動で流す。
    // 端の近くから動かし始めたときは、そこからさらに端へ寄せたときだけ流す
    function loop(now) {
      if (!mode) return;
      var v = visible(win);
      var speed = moved ? U.edgeSpeed(Math.min(v.top, sy - 6 - EDGE), Math.max(v.bottom, sy + 6 + EDGE), py, EDGE) : 0;
      if (flow(speed, now)) update();
      raf = requestAnimationFrame(loop);
    }

    function begin(kind, target) {
      var st = WP.day.state;
      if (kind === 'create') {
        if (st.selected) WP.day.deselect();
        anchor = clamp(Math.floor(timeAt(py) / SNAP) * SNAP, off, DAY_END - MINLEN);
        el = document.createElement('div');
        el.className = 'blk ghost';
        area.appendChild(el);
        cur = { s: anchor, e: Math.min(DAY_END, anchor + 60) };
      } else {
        el = target.closest('.blk');
        plan = st.data.planMap[el.dataset.plan];
        if (!plan) return;
        if (st.selected && st.selected !== plan.id) WP.day.deselect();
        orig = { s: plan.start_min, e: plan.end_min };
        cur = { s: orig.s, e: orig.e };
        grab = timeAt(py) - orig.s;
        el.classList.add('lift');
      }
      mode = kind; moved = false;
      win.classList.add('dragging-tl');
      if (navigator.vibrate) navigator.vibrate(8);
      place(el, win, off, cur.s, cur.e);
      raf = requestAnimationFrame(loop);
    }

    function finish(cancelled) {
      clearTimeout(timer); timer = null;
      if (!mode) return;
      cancelAnimationFrame(raf);
      var kind = mode;
      mode = null;
      win.classList.remove('dragging-tl');
      U.hush();
      if (kind === 'create') {
        el.remove();
        if (!cancelled) WP.plan.open({ day: day, start: cur.s, end: cur.e });
        return;
      }
      // 離した後も選んだままにして、上下にハンドルを出す
      WP.day.state.selected = plan.id;
      if (cancelled || (cur.s === orig.s && cur.e === orig.e)) { WP.app.refresh(); return; }
      var id = plan.id, before = orig;
      plan.start_min = cur.s; plan.end_min = cur.e;
      DB.savePlan(plan).then(function () { return WP.app.refresh(); }).then(function () {
        undoToast(range(cur.s, cur.e) + ' に変更', function () {
          return DB.get('plans', id).then(function (p) {
            if (!p) return;
            p.start_min = before.s; p.end_min = before.e;
            return DB.savePlan(p);
          });
        });
      });
    }

    function press(target, x, y) {
      clearTimeout(timer); timer = null;
      if (mode) return;
      sx = x; sy = py = y;
      // ハンドルは、長押しを待たずにすぐ動かせる
      var hd = target.closest('.hd');
      if (hd) { begin(hd.classList.contains('top') ? 'top' : 'bot', hd); return; }
      var blk = target.closest('.blk[data-plan]');
      timer = setTimeout(function () { timer = null; begin(blk ? 'move' : 'create', blk); }, HOLD);
    }
    function drag(x, y, e) {
      if (mode) {
        py = y;
        if (e && e.cancelable) e.preventDefault();
        if (Math.abs(y - sy) > 4) moved = true;
        update();
      } else if (timer) {
        // 長押しが効く前に指が動いたら、スクロールとして扱う
        if (Math.abs(x - sx) > SLOP || Math.abs(y - sy) > SLOP) { clearTimeout(timer); timer = null; }
        else py = y;
      }
    }

    win.addEventListener('touchstart', function (e) {
      lastTouch = Date.now();
      if (e.touches.length !== 1) { finish(true); return; }
      press(e.target, e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    win.addEventListener('touchmove', function (e) { drag(e.touches[0].clientX, e.touches[0].clientY, e); }, { passive: false });
    win.addEventListener('touchend', function () { lastTouch = Date.now(); finish(false); });
    win.addEventListener('touchcancel', function () { lastTouch = Date.now(); finish(true); });

    function onMove(e) { drag(e.clientX, e.clientY, e); }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      finish(false);
    }
    win.addEventListener('mousedown', function (e) {
      // 指で触った直後に届く、形だけのマウスの合図は無視する
      if (e.button !== 0 || Date.now() - lastTouch < 800) return;
      press(e.target, e.clientX, e.clientY);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    // 長押しで出るメニューを止める
    win.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  // ToDo の行をタイムラインの上まで運んできたときの受け口。WP.sortable に渡して使う
  function carrier(page, day) {
    var PX = WP.week.PX;
    var win = page.querySelector('.tlwin'), tlin = win.querySelector('.tlin'), area = win.querySelector('.tl-area'), off = +win.dataset.off;
    var flow = U.creep(win), ghost = null, start = 0, edgeSince = 0;

    function clear() { if (ghost) { ghost.remove(); ghost = null; } edgeSince = 0; }
    // 一度入った後は、枠から少しはみ出しても中にいるものとして扱う
    function inside(x, y) {
      var v = visible(win), slack = ghost ? 30 : 0;
      return v.bottom - v.top > 40 && x >= v.left && x <= v.right && y >= v.top - slack && y <= v.bottom + slack;
    }

    return {
      // 指が枠の上にあれば、その時刻から1時間の仮のブロックを出して true を返す
      over: function (item, x, y, now, scrolled) {
        if (!inside(x, y)) { clear(); return false; }
        if (!ghost) {
          if (WP.day.state.selected) WP.day.deselect();
          ghost = document.createElement('div');
          ghost.className = 'blk ghost';
          ghost.style.background = item.style.background;
          ghost.innerHTML = '<div class="wbt">' + U.esc(item.querySelector('.tx').textContent) + '</div>';
          area.appendChild(ghost);
        }
        // 上から入ってくるときに流れてしまわないよう、端の近くで少し止まってから流す
        var v = visible(win), speed = scrolled ? 0 : U.edgeSpeed(v.top, v.bottom, y, EDGE);
        if (!speed) edgeSince = 0;
        else if (!edgeSince) edgeSince = now;
        flow(speed && now - edgeSince > DWELL ? speed : 0, now);
        var t = (y - tlin.getBoundingClientRect().top) / PX + off;
        start = clamp(snap(t), off, DAY_END - 60);
        place(ghost, win, off, start, start + 60);
        return true;
      },
      // 枠の上で離したら、その ToDo に紐づく1時間の予定を入れて true を返す
      drop: function (item) {
        if (!ghost) return false;
        clear();
        var todo = WP.day.state.data.todoMap[item.dataset.id];
        if (!todo) return false;
        var s = start;
        DB.addPlan({ day: day, start_min: s, end_min: s + 60, title: '', genre_id: todo.genre_id, todo_id: todo.id, source: 'manual' }).then(function (p) {
          WP.day.state.selected = p.id;
          return WP.app.refresh().then(function () {
            undoToast(range(s, s + 60) + ' に追加', function () { return DB.del('plans', p.id); });
          });
        });
        return true;
      },
      clear: clear
    };
  }

  WP.tldrag = { bind: bind, carrier: carrier };
})();
