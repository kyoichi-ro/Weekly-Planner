// 予定の入力・編集シートと、時刻を選ぶホイール
(function () {
  'use strict';
  var WP = window.WP, U = WP.util, DB = WP.db;
  var ITEM = 40, DAY_END = 1440;
  var draft = null;

  function p2(n) { return String(n).padStart(2, '0'); }
  function fmt(min) { return p2(Math.floor(min / 60)) + ':' + p2(min % 60); }

  // 開始・終了の欄と、その下に出るホイール。d は { start, end, active } を持つ
  function timeHTML(d) {
    return '<div class="time-row"><div><p class="lab">開始</p><button class="field time" data-t="start">' + fmt(d.start) + '</button></div>' +
      '<div><p class="lab">終了</p><button class="field time" data-t="end">' + fmt(d.end) + '</button></div></div>' +
      '<div class="wheel" data-wheel hidden><div class="wband"></div><div class="wcol" data-k="h"></div><div class="wsep">:</div><div class="wcol" data-k="m"></div></div>';
  }
  // onChange(終了が開始より後でなければ true) を、時刻が変わるたびに呼ぶ
  function bindTime(sheet, d, onChange) {
    var wheel = sheet.querySelector('[data-wheel]');
    var hcol = wheel.querySelector('[data-k="h"]'), mcol = wheel.querySelector('[data-k="m"]');

    function showTimes() {
      sheet.querySelector('[data-t="start"]').textContent = fmt(d.start);
      sheet.querySelector('[data-t="end"]').textContent = fmt(d.end);
      onChange(d.end <= d.start);
    }
    function mark() {
      if (!d.active) return;
      var v = d[d.active], hi = Math.floor(v / 60), mi = (v % 60) / 5;
      hcol.querySelectorAll('.wi').forEach(function (el, i) { el.classList.toggle('on', i === hi); });
      mcol.querySelectorAll('.wi').forEach(function (el, i) { el.classList.toggle('on', i === mi); });
    }
    function position() {
      if (!d.active) return;
      var v = d[d.active];
      hcol.scrollTop = Math.floor(v / 60) * ITEM;
      mcol.scrollTop = (v % 60) / 5 * ITEM;
      mark();
    }
    // 開始は 0〜23時、終了は 24:00 まで選べる
    function toggle(which) {
      if (d.active === which) { d.active = null; wheel.hidden = true; }
      else {
        d.active = which;
        var maxH = which === 'end' ? 24 : 23, i, s = '';
        for (i = 0; i <= maxH; i++) s += '<div class="wi">' + p2(i) + '</div>';
        hcol.innerHTML = s;
        s = '';
        for (i = 0; i < 60; i += 5) s += '<div class="wi">' + p2(i) + '</div>';
        mcol.innerHTML = s;
        wheel.hidden = false;
        position();
      }
      sheet.querySelectorAll('.field.time').forEach(function (b) { b.classList.toggle('on', b.dataset.t === d.active); });
    }
    function read() {
      if (!d.active) return;
      var maxH = d.active === 'end' ? 24 : 23;
      var hh = Math.min(maxH, Math.max(0, Math.round(hcol.scrollTop / ITEM)));
      var mm = Math.min(11, Math.max(0, Math.round(mcol.scrollTop / ITEM))) * 5;
      var v = hh * 60 + mm;
      if (v > DAY_END) { v = DAY_END; mcol.scrollTo({ top: 0, behavior: 'smooth' }); }
      if (d.active === 'start') {
        // 開始を動かすと、長さを保ったまま終了も動く
        var dur = Math.max(5, d.end - d.start);
        d.start = v;
        d.end = Math.min(DAY_END, v + dur);
      } else {
        d.end = v;
      }
      showTimes(); mark();
    }
    [hcol, mcol].forEach(function (col) {
      var t;
      col.addEventListener('scroll', function () { clearTimeout(t); t = setTimeout(read, 110); });
      col.addEventListener('click', function (e) {
        var it = e.target.closest('.wi');
        if (it) col.scrollTo({ top: Array.prototype.indexOf.call(col.children, it) * ITEM, behavior: 'smooth' });
      });
    });
    sheet.addEventListener('click', function (e) {
      var tf = e.target.closest('.field.time');
      if (tf) toggle(tf.dataset.t);
    });
    return { read: read, refresh: function () { showTimes(); position(); } };
  }

  // opts.plan があれば編集、なければ opts.day の opts.start(分)からの予定を新しく作る。opts.end がなければ1時間
  function open(opts) {
    var p = opts.plan || null;
    draft = {
      plan: p, day: p ? p.day : opts.day,
      start: p ? p.start_min : opts.start,
      end: p ? p.end_min : (opts.end != null ? opts.end : Math.min(opts.start + 60, DAY_END)),
      title: p ? p.title : '', genre_id: p ? p.genre_id : WP.todo.lastGenre(), todo_id: p ? p.todo_id : null,
      genreTouched: !!p, active: null, source: p ? p.source : 'manual', saveAs: false, saveName: ''
    };
    show();
  }

  function show() {
    Promise.all([DB.getGenres(), DB.byIndex('todos', 'day', draft.day), DB.getPlanTemplates()]).then(function (r) {
      var genres = r[0], todos = r[1].sort(function (a, b) { return a.sort_order - b.sort_order; }), tpls = r[2];
      var todoMap = {}, genreMap = {}, tplMap = {};
      todos.forEach(function (t) { todoMap[t.id] = t; });
      genres.forEach(function (g) { genreMap[g.id] = g; });
      tpls.forEach(function (t) { tplMap[t.id] = t; });
      // 直前に使ったジャンルが、消えたかアーカイブ済みなら「なし」にする
      if (draft.genre_id && (!genreMap[draft.genre_id] || (genreMap[draft.genre_id].archived && !draft.plan && !draft.genreTouched))) draft.genre_id = null;
      if (draft.todo_id && !todoMap[draft.todo_id]) draft.todo_id = null;
      // チップに出すジャンル。アーカイブ済みでも、今選ばれているものは出す
      function chips() { return WP.genre.chipsHTML(genres, draft.genre_id, true); }

      var h = '';
      // 予定テンプレートのチップは、新しい予定のときだけ出す
      if (!draft.plan && tpls.length) {
        h += '<p class="lab">TEMPLATE</p><div class="chips tchips">' + tpls.map(function (t) {
          var g = t.genre_id && genreMap[t.genre_id];
          return '<button class="chip" data-pt="' + t.id + '" style="background:' + (g ? g.color_light : 'var(--none)') + '">' + U.esc(t.name) + ' ' +
            U.hm(t.start_min) + '–' + U.hm(t.end_min) + '</button>';
        }).join('') + '</div>';
      }
      h += '<p class="lab">タイトル(任意)</p><input class="field" id="pTitle" maxlength="60" autocomplete="off" value="' + U.esc(draft.title) + '">' +
        timeHTML(draft) +
        '<p class="lab">ジャンル</p><div class="chips" id="pChips">' + chips() + '</div>' +
        '<p class="lab">ToDoと紐づけ(任意)</p><select class="field pick" id="pTodo"><option value="">なし</option>';
      todos.forEach(function (t) {
        h += '<option value="' + t.id + '"' + (t.id === draft.todo_id ? ' selected' : '') + '>' + U.esc(t.title) + '</option>';
      });
      h += '</select><div id="pSave"' + (draft.saveAs ? ' class="savebox"' : '') + '><div class="saveas" role="button" tabindex="0"><button class="chk' + (draft.saveAs ? ' on' : '') +
        '" id="pSaveChk" role="checkbox" aria-checked="' + draft.saveAs + '">' + U.icon('check', 15) + '</button><span>この内容をテンプレートに保存</span></div>' +
        '<div id="pSaveName"' + (draft.saveAs ? '' : ' hidden') + '><p class="lab">テンプレートの名前</p><input class="field" id="pTName" maxlength="20" autocomplete="off" value="' +
        U.esc(draft.saveName) + '"></div></div>' +
        '<div class="err" id="pErr" hidden></div><div class="act">' +
        (draft.plan ? '<button class="btn del" data-act="delete" aria-label="削除">' + U.icon('trash', 19) + '</button>' : '<span></span>') +
        '<button class="btn pri" data-act="done">完了</button></div>';

      var sheet = WP.sheet.open(h, {});
      var titleEl = sheet.querySelector('#pTitle'), err = sheet.querySelector('#pErr');
      function fail(msg) { err.textContent = msg; err.hidden = !msg; }
      var time = bindTime(sheet, draft, function (bad) { fail(bad ? '終了は開始より後にしてください' : ''); });

      function done() {
        time.read();
        if (draft.end <= draft.start) { fail('終了は開始より後にしてください'); return; }
        var p = draft.plan, title = titleEl.value.trim(), tname = sheet.querySelector('#pTName').value.trim(), save;
        if (draft.saveAs && !tname) { fail('テンプレートの名前を入れてください'); sheet.querySelector('#pTName').focus(); return; }
        if (p) {
          p.title = title; p.start_min = draft.start; p.end_min = draft.end; p.genre_id = draft.genre_id; p.todo_id = draft.todo_id;
          save = DB.savePlan(p);
        } else {
          save = DB.addPlan({
            day: draft.day, start_min: draft.start, end_min: draft.end, title: title, genre_id: draft.genre_id, todo_id: draft.todo_id, source: draft.source
          });
        }
        WP.todo.rememberGenre(draft.genre_id);
        save.then(function () {
          if (!draft.saveAs) return null;
          return DB.savePlanTemplate({ name: tname, start_min: draft.start, end_min: draft.end, genre_id: draft.genre_id });
        }).then(function () { WP.sheet.close(); WP.app.refresh(); });
      }
      titleEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); titleEl.blur(); } });
      sheet.querySelector('#pTodo').addEventListener('change', function (e) {
        draft.todo_id = e.target.value || null;
        // ジャンルをまだ選んでいなければ、紐づけたToDoのジャンルを入れる
        var t = draft.todo_id && todoMap[draft.todo_id];
        if (t && !draft.genreTouched && t.genre_id) {
          draft.genre_id = t.genre_id;
          sheet.querySelector('#pChips').innerHTML = chips();
        }
      });
      sheet.addEventListener('click', function (e) {
        var pt = e.target.closest('.chip[data-pt]');
        if (pt) {
          // テンプレートの時刻とジャンルを入れる。タイトルが空なら、名前も入れる
          var t = tplMap[pt.dataset.pt];
          draft.start = t.start_min; draft.end = t.end_min; draft.genre_id = t.genre_id && genreMap[t.genre_id] ? t.genre_id : null;
          draft.genreTouched = true; draft.source = 'plan_template';
          if (!titleEl.value.trim()) titleEl.value = t.name;
          sheet.querySelectorAll('.chip[data-pt]').forEach(function (c) { c.classList.toggle('sel', c === pt); });
          sheet.querySelector('#pChips').innerHTML = chips();
          time.refresh();
          return;
        }
        var chip = e.target.closest('#pChips .chip[data-genre]');
        if (chip) {
          draft.genre_id = chip.dataset.genre || null; draft.genreTouched = true;
          sheet.querySelectorAll('#pChips .chip').forEach(function (c) { c.classList.toggle('sel', c === chip); });
          return;
        }
        if (e.target.closest('.saveas')) {
          draft.saveAs = !draft.saveAs;
          var box = sheet.querySelector('#pSave'), chk = sheet.querySelector('#pSaveChk'), nm = sheet.querySelector('#pTName');
          box.classList.toggle('savebox', draft.saveAs);
          chk.classList.toggle('on', draft.saveAs); chk.setAttribute('aria-checked', draft.saveAs);
          sheet.querySelector('#pSaveName').hidden = !draft.saveAs;
          if (draft.saveAs && !nm.value) nm.value = titleEl.value.trim();
          return;
        }
        var act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'new-genre') {
          time.read();
          draft.title = titleEl.value; draft.saveName = sheet.querySelector('#pTName').value; draft.active = null;
          WP.genre.openSheet({
            onDone: function (g) { draft.genre_id = g.id; draft.genreTouched = true; show(); },
            onCancel: function () { setTimeout(show, 0); }
          });
        } else if (act.dataset.act === 'done') {
          done();
        } else if (act.dataset.act === 'delete') {
          DB.del('plans', draft.plan.id).then(function () { WP.sheet.close(); WP.app.refresh(); });
        }
      });
    });
  }

  WP.plan = { open: open, timeHTML: timeHTML, bindTime: bindTime, fmt: fmt };
})();
