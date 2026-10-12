// 長押しして、そのまま指を動かすと並べ替えられるようにする
(function () {
  'use strict';
  var WP = window.WP;
  var HOLD = 380, SLOP = 8;

  // container の中の sel に合う要素を並べ替える。終わると opts.onEnd(並び順のid一覧) を呼ぶ
  WP.sortable = function (container, sel, opts) {
    var item = null, timer = null, dragging = false, startY = 0, lastY = 0, sx = 0, sy = 0, swallow = false;

    function sibling(el, next) {
      var s = el;
      do { s = next ? s.nextElementSibling : s.previousElementSibling; } while (s && !s.matches(sel));
      return s;
    }
    function begin(el, x, y) {
      item = el; sx = x; sy = y; lastY = y;
      timer = setTimeout(function () {
        dragging = true; startY = lastY;
        item.classList.add('dragging');
        if (navigator.vibrate) navigator.vibrate(8);
      }, HOLD);
    }
    // 動かしている行の位置はそのままに、隣の行だけを入れ替える
    function swap(fn) {
      var before = item.offsetTop;
      fn();
      startY += item.offsetTop - before;
      item.style.transform = 'translateY(' + (lastY - startY) + 'px)';
    }
    function move(x, y, e) {
      if (!item) return;
      lastY = y;
      if (!dragging) {
        if (Math.abs(x - sx) > SLOP || Math.abs(y - sy) > SLOP) cancel();
        return;
      }
      if (e && e.cancelable) e.preventDefault();
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
    function finish() {
      clearTimeout(timer);
      if (dragging) {
        item.classList.remove('dragging');
        item.style.transform = '';
        swallow = true;
        setTimeout(function () { swallow = false; }, 350);
        var ids = Array.prototype.map.call(container.querySelectorAll(sel), function (el) { return el.dataset.id; });
        opts.onEnd(ids);
      }
      item = null; dragging = false;
    }
    function cancel() {
      clearTimeout(timer);
      if (dragging && item) { item.classList.remove('dragging'); item.style.transform = ''; }
      item = null; dragging = false;
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

    // 並べ替えの直後のタップで、編集画面が開かないようにする
    container.addEventListener('click', function (e) {
      if (swallow) { e.stopPropagation(); e.preventDefault(); swallow = false; }
    }, true);
  };
})();
