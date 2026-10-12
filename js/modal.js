// 画面の中央に出る確認(モーダル)。押されたボタンの value を返す
(function () {
  'use strict';
  var WP = window.WP, U = WP.util;

  // opts: { title, html, center, buttons: [{ label, value, primary }] }
  WP.modal = function (opts) {
    return new Promise(function (resolve) {
      var w = document.createElement('div');
      w.className = 'modal-wrap';
      w.innerHTML = '<div class="modal-dim"></div><div class="modal" role="alertdialog" aria-modal="true"><h3>' + U.esc(opts.title) + '</h3>' +
        '<div class="modal-body' + (opts.center ? ' center' : '') + '">' + opts.html + '</div><div class="modal-act">' +
        opts.buttons.map(function (b) {
          return '<button class="btn' + (b.primary ? ' pri' : '') + '" data-v="' + U.esc(b.value) + '">' + U.esc(b.label) + '</button>';
        }).join('') + '</div></div>';
      document.body.appendChild(w);
      void w.offsetWidth;
      w.classList.add('open');
      w.addEventListener('click', function (e) {
        var b = e.target.closest('[data-v]');
        if (!b) return;
        w.remove();
        resolve(b.dataset.v);
      });
    });
  };
})();
