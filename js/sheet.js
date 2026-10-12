// 画面の下からせり上がるシート。一度に1枚だけ開く
(function () {
  'use strict';
  var WP = window.WP;
  var wrap = null, onDismiss = null;

  function ensure() {
    if (wrap) return;
    wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.hidden = true;
    document.body.appendChild(wrap);

    // 外側をタップすると、保存せずに閉じる
    wrap.addEventListener('click', function (e) {
      if (e.target.classList.contains('sheet-dim')) close(true);
    });

    // 上部のつまみを下に引いても閉じる
    var sy = null, dy = 0;
    wrap.addEventListener('touchstart', function (e) {
      if (!e.target.closest('.grab-area')) return;
      sy = e.touches[0].clientY; dy = 0;
    }, { passive: true });
    wrap.addEventListener('touchmove', function (e) {
      if (sy === null) return;
      dy = Math.max(0, e.touches[0].clientY - sy);
      var sh = wrap.querySelector('.sheet');
      sh.style.transition = 'none';
      sh.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: true });
    wrap.addEventListener('touchend', function () {
      if (sy === null) return;
      sy = null;
      var sh = wrap.querySelector('.sheet');
      sh.style.transition = ''; sh.style.transform = '';
      if (dy > 80) close(true);
    });

    // キーボードが出たら、その分だけシートを持ち上げる
    if (window.visualViewport) {
      var vv = window.visualViewport;
      var fit = function () {
        wrap.style.setProperty('--kb', Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 'px');
      };
      vv.addEventListener('resize', fit);
      vv.addEventListener('scroll', fit);
    }
  }

  // html を中身にして開く。opts.onDismiss は、保存せずに閉じられたときに呼ぶ
  function open(html, opts) {
    ensure();
    var wasOpen = !wrap.hidden && wrap.classList.contains('open');
    onDismiss = (opts && opts.onDismiss) || null;
    wrap.innerHTML = '<div class="sheet-dim"></div><div class="sheet" role="dialog" aria-modal="true">' +
      '<div class="grab-area"><div class="grab"></div></div>' + html + '</div>';
    wrap.hidden = false;
    if (!wasOpen) {
      wrap.classList.remove('open');
      void wrap.offsetWidth;
    }
    wrap.classList.add('open');
    return wrap.querySelector('.sheet');
  }

  function close(dismissed) {
    if (!wrap || wrap.hidden) return;
    var cb = onDismiss;
    onDismiss = null;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    wrap.classList.remove('open');
    setTimeout(function () {
      if (!wrap.classList.contains('open')) { wrap.hidden = true; wrap.innerHTML = ''; }
    }, 260);
    if (dismissed && cb) cb();
  }

  WP.sheet = { open: open, close: close };
})();
