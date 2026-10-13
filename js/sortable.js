// 長押しして、そのまま指を動かすと並べ替えられるようにする
(function () {
  'use strict';
  var WP = window.WP, U = WP.util;
  var HOLD = 380, SLOP = 8, EDGE = 64;

  // container の中の sel に合う要素を並べ替える。終わると opts.onEnd(並び順のid一覧) を呼ぶ
  // 次の4つは、なくてもよい
  //   opts.scroller: 上端・下端の近くまで運ぶと、自動で流す要素
  //   opts.outside(item, x, y, now, scrolled): 並べ替え以外の場所(タイムラインなど)が引き受けるなら true を返す
  //   opts.drop(item, x, y): 離したときに呼ぶ。true を返すと、並びを元に戻して onEnd を呼ばない
  //   opts.cancel(): 途中でやめたときに呼ぶ
  WP.sortable = function (container, sel, opts) {
    var item = null, timer = null, dragging = false, startY = 0, lastX = 0, lastY = 0, sx = 0, sy = 0;
    var orig = null, away = false, far = false, raf = 0, limit = 0, flow = opts.scroller ? U.creep(opts.scroller) : null;

    function sibling(el, next) {
      var s = el;
      do { s = next ? s.nextElementSibling : s.previousElementSibling; } while (s && !s.matches(sel));
      return s;
    }
    function begin(el, x, y) {
      item = el; sx = lastX = x; sy = lastY = y;
      timer = setTimeout(function () {
        dragging = true; away = false; far = false; startY = lastY;
        orig = Array.prototype.slice.call(container.querySelectorAll(sel));
        // 運んでいる行のぶんだけ画面が下へ伸びてしまうので、流せる限界を先に覚えておく
        if (flow) limit = opts.scroller.scrollHeight - opts.scroller.clientHeight;
        item.classList.add('dragging');
        if (navigator.vibrate) navigator.vibrate(8);
        if (flow || opts.outside) raf = requestAnimationFrame(loop);
      }, HOLD);
    }
    // 動かしている行の位置はそのままに、隣の行だけを入れ替える
    function swap(fn) {
      var before = item.offsetTop;
      fn();
      startY += item.offsetTop - before;
      item.style.transform = 'translateY(' + (lastY - startY) + 'px)';
    }
    // 動かしている行はそのままに、周りの行を元の並びに戻す
    function restore() {
      var i = orig.indexOf(item), k;
      for (k = 0; k < i; k++) container.insertBefore(orig[k], item);
      for (k = orig.length - 1; k > i; k--) container.insertBefore(orig[k], item.nextSibling);
    }
    function track(now, scrolled) {
      // 外が引き受けている間は、行を元の位置に戻して薄くしておく
      var out = opts.outside ? !!opts.outside(item, lastX, lastY, now, scrolled) : false;
      if (out !== away) {
        away = out;
        if (away) swap(restore);
        item.classList.toggle('away', away);
      }
      if (away) { item.style.transform = ''; return; }
      item.style.transform = 'translateY(' + (lastY - startY) + 'px)';
      var r = item.getBoundingClientRect(), c = r.top + r.height / 2;
      var next = sibling(item, true), prev = sibling(item, false), o;
      if (next) {
        o = next.getBoundingClientRect();
        if (c > o.top + o.height / 2) { swap(function () { container.insertBefore(next, item); }); return; }
      }
      if (prev) {
        o = prev.getBoundingClientRect();
        if (c < o.top + o.height / 2) swap(function () { container.insertBefore(prev, item.nextSibling); });
      }
    }
    // 指を止めていても、端の近くでは流し続ける
    function loop(now) {
      if (!dragging) return;
      var moved = 0;
      if (flow && far) {
        // 端の近くから運び始めたときは、そこからさらに端へ寄せたときだけ流す
        var sc = opts.scroller, r = sc.getBoundingClientRect();
        var speed = U.edgeSpeed(Math.min(r.top, sy - 6 - EDGE), Math.max(r.bottom, sy + 6 + EDGE), lastY, EDGE);
        moved = flow(speed > 0 && sc.scrollTop >= limit ? 0 : speed, now);
        if (sc.scrollTop > limit && moved > 0) { moved -= sc.scrollTop - limit; sc.scrollTop = limit; }
        startY -= moved;
      }
      track(now, moved);
      raf = requestAnimationFrame(loop);
    }
    function move(x, y, e) {
      if (!item) return;
      lastX = x; lastY = y;
      if (!dragging) {
        if (Math.abs(x - sx) > SLOP || Math.abs(y - sy) > SLOP) cancel();
        return;
      }
      if (e && e.cancelable) e.preventDefault();
      if (Math.abs(y - sy) > SLOP) far = true;
      track(performance.now(), 0);
    }
    function finish() {
      clearTimeout(timer);
      if (dragging) {
        cancelAnimationFrame(raf);
        var handled = opts.drop ? opts.drop(item, lastX, lastY) : false;
        if (handled && !away) restore();
        item.classList.remove('dragging');
        item.classList.remove('away');
        item.style.transform = '';
        U.hush();
        if (!handled) {
          var ids = Array.prototype.map.call(container.querySelectorAll(sel), function (el) { return el.dataset.id; });
          opts.onEnd(ids);
        }
      }
      item = null; dragging = false; away = false;
    }
    function cancel() {
      clearTimeout(timer);
      if (dragging && item) {
        cancelAnimationFrame(raf);
        if (!away) restore();
        item.classList.remove('dragging');
        item.classList.remove('away');
        item.style.transform = '';
        if (opts.cancel) opts.cancel();
      }
      item = null; dragging = false; away = false;
    }

    container.addEventListener('touchstart', function (e) {
      var el = e.target.closest(sel);
      if (!el || e.touches.length !== 1) return;
      begin(el, e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    container.addEventListener('touchmove', function (e) {
      move(e.touches[0].clientX, e.touches[0].clientY, e);
    }, { passive: false });
    container.addEventListener('touchend', finish);
    container.addEventListener('touchcancel', cancel);

    function onMouseMove(e) { move(e.clientX, e.clientY, e); }
    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      finish();
    }
    container.addEventListener('mousedown', function (e) {
      var el = e.target.closest(sel);
      if (!el || e.button !== 0) return;
      begin(el, e.clientX, e.clientY);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  };
})();
