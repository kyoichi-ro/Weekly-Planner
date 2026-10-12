// ToDoの追加・編集シート
(function () {
  'use strict';
  var WP = window.WP, U = WP.util, DB = WP.db;
  var draft = null;

  function lastGenre() { try { return localStorage.getItem('wp-last-genre') || null; } catch (e) { return null; } }
  function rememberGenre(id) { try { if (id) localStorage.setItem('wp-last-genre', id); else localStorage.removeItem('wp-last-genre'); } catch (e) { /* 何もしない */ } }

  // opts.todo があれば編集、なければ opts.day に新しく作る
  function open(opts) {
    var t = opts.todo || null;
    draft = {
      todo: t, day: t ? t.day : opts.day, title: t ? t.title : '', genre_id: t ? t.genre_id : lastGenre(), focus: !t
    };
    show();
  }

  function show() {
    DB.getGenres().then(function (genres) {
      // 直前に使ったジャンルが、もう選べない状態なら「なし」にする
      if (draft.genre_id && !genres.some(function (g) { return g.id === draft.genre_id && (!g.archived || (draft.todo && draft.todo.genre_id === g.id)); })) {
        draft.genre_id = null;
      }
      var h = '<p class="lab">タイトル</p><input class="field" id="tTitle" maxlength="60" autocomplete="off" value="' + U.esc(draft.title) + '">' +
        '<p class="lab">ジャンル</p><div class="chips" id="tChips">' + WP.genre.chipsHTML(genres, draft.genre_id, true) + '</div>' +
        '<div class="err" id="tErr" hidden></div><div class="act">' +
        (draft.todo ? '<button class="btn del" data-act="delete" aria-label="削除">' + U.icon('trash', 19) + '</button>' : '<span></span>') +
        '<button class="btn pri" data-act="done">完了</button></div>';
      var sheet = WP.sheet.open(h, {});
      var titleEl = sheet.querySelector('#tTitle');
      if (draft.focus) titleEl.focus();

      function done() {
        var title = titleEl.value.trim();
        if (!title) {
          var er = sheet.querySelector('#tErr');
          er.textContent = 'タイトルを入れてください'; er.hidden = false;
          titleEl.focus();
          return;
        }
        var p;
        if (draft.todo) {
          draft.todo.title = title; draft.todo.genre_id = draft.genre_id;
          p = DB.saveTodo(draft.todo);
        } else {
          p = DB.addTodo(draft.day, title, draft.genre_id);
        }
        rememberGenre(draft.genre_id);
        p.then(function () { WP.sheet.close(); WP.app.refresh(); });
      }
      titleEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); done(); } });
      sheet.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip[data-genre]');
        if (chip) {
          draft.genre_id = chip.dataset.genre || null;
          sheet.querySelectorAll('#tChips .chip').forEach(function (c) { c.classList.toggle('sel', c === chip); });
          return;
        }
        var act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'new-genre') {
          // 入力中の内容を持ったまま、ジャンルの追加シートに切り替える
          draft.title = titleEl.value; draft.focus = false;
          WP.genre.openSheet({
            onDone: function (g) { draft.genre_id = g.id; show(); },
            onCancel: function () { setTimeout(show, 0); }
          });
        } else if (act.dataset.act === 'done') {
          done();
        } else if (act.dataset.act === 'delete') {
          DB.deleteTodo(draft.todo.id).then(function () { WP.sheet.close(); WP.app.refresh(); });
        }
      });
    });
  }

  WP.todo = { open: open, lastGenre: lastGenre, rememberGenre: rememberGenre };
})();
