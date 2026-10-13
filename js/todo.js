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
      todo: t, day: t ? t.day : opts.day, title: t ? t.title : '', genre_id: t ? t.genre_id : lastGenre(), focus: !t,
      saveAs: false, picked: null
    };
    show();
  }

  function show() {
    Promise.all([DB.getGenres(), DB.getTodoTemplates()]).then(function (r) {
      var genres = r[0], tpls = r[1], genreMap = {}, tplMap = {};
      genres.forEach(function (g) { genreMap[g.id] = g; });
      tpls.forEach(function (t) { tplMap[t.id] = t; });
      // 直前に使ったジャンルが、もう選べない状態なら「なし」にする
      if (draft.genre_id && !genres.some(function (g) { return g.id === draft.genre_id && (!g.archived || draft.picked || (draft.todo && draft.todo.genre_id === g.id)); })) {
        draft.genre_id = null;
      }
      function chips() { return WP.genre.chipsHTML(genres, draft.genre_id, true); }

      var h = '';
      // ToDoテンプレートのチップは、新しいToDoを追加するときだけ出す
      if (!draft.todo && tpls.length) {
        h += '<p class="lab">TEMPLATE</p><div class="chips tchips">' + tpls.map(function (t) {
          var g = t.genre_id && genreMap[t.genre_id];
          return '<button class="chip' + (draft.picked === t.id ? ' sel' : '') + '" data-tt="' + t.id + '" style="background:' + (g ? g.color_light : 'var(--none)') + '">' +
            U.esc(t.title) + '</button>';
        }).join('') + '</div>';
      }
      h += '<p class="lab">タイトル</p><input class="field" id="tTitle" maxlength="60" autocomplete="off" value="' + U.esc(draft.title) + '">' +
        '<p class="lab">ジャンル</p><div class="chips" id="tChips">' + chips() + '</div>' +
        '<div class="saveas" role="button" tabindex="0"><button class="chk' + (draft.saveAs ? ' on' : '') + '" id="tSaveChk" role="checkbox" aria-checked="' + draft.saveAs + '">' +
        U.icon('check', 15) + '</button><span>この内容をテンプレートに保存</span></div>' +
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
        p.then(function () {
          // 同じタイトルとジャンルのテンプレートがすでにあれば、重ねて保存しない
          if (!draft.saveAs || tpls.some(function (t) { return t.title === title && (t.genre_id || null) === (draft.genre_id || null); })) return null;
          return DB.saveTodoTemplate({ title: title, genre_id: draft.genre_id });
        }).then(function () { WP.sheet.close(); WP.app.refresh(); });
      }
      titleEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); done(); } });
      sheet.addEventListener('click', function (e) {
        var tt = e.target.closest('.chip[data-tt]');
        if (tt) {
          // テンプレートのタイトルとジャンルを入力欄に入れる
          var t = tplMap[tt.dataset.tt];
          draft.picked = t.id;
          titleEl.value = t.title;
          draft.genre_id = t.genre_id && genreMap[t.genre_id] ? t.genre_id : null;
          sheet.querySelectorAll('.chip[data-tt]').forEach(function (c) { c.classList.toggle('sel', c === tt); });
          sheet.querySelector('#tChips').innerHTML = chips();
          return;
        }
        var chip = e.target.closest('#tChips .chip[data-genre]');
        if (chip) {
          draft.genre_id = chip.dataset.genre || null;
          sheet.querySelectorAll('#tChips .chip').forEach(function (c) { c.classList.toggle('sel', c === chip); });
          return;
        }
        if (e.target.closest('.saveas')) {
          draft.saveAs = !draft.saveAs;
          var chk = sheet.querySelector('#tSaveChk');
          chk.classList.toggle('on', draft.saveAs); chk.setAttribute('aria-checked', draft.saveAs);
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
