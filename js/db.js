// 端末内の保存(IndexedDB)。項目名は docs/data-model.md の ER 図と同じ
(function () {
  'use strict';
  var WP = window.WP;
  var U = WP.util;

  // 確認用のサンプル表示。URL に ?demo=1 を付けて開くと入り、?demo=0 で通常に戻る
  var DEMO = false;
  try {
    var dm = /[?&]demo=([01])/.exec(location.search);
    if (dm) { if (dm[1] === '1') localStorage.setItem('wp-demo', '1'); else localStorage.removeItem('wp-demo'); }
    DEMO = localStorage.getItem('wp-demo') === '1';
  } catch (e) { /* 保存領域が使えない場合は通常モード */ }

  var DB_NAME = DEMO ? 'weekly-planner-demo' : 'weekly-planner';
  // 2: todo_templates を追加
  var DB_VERSION = 2;
  var STORES = {
    genres: { keyPath: 'id' },
    weeks: { keyPath: 'week_start' },
    day_notes: { keyPath: 'day' },
    todos: { keyPath: 'id', indexes: ['day', 'application_id'] },
    plans: { keyPath: 'id', indexes: ['day', 'application_id', 'todo_id'] },
    week_templates: { keyPath: 'id' },
    week_template_plans: { keyPath: 'id', indexes: ['template_id'] },
    week_template_todos: { keyPath: 'id', indexes: ['template_id'] },
    template_applications: { keyPath: 'id', indexes: ['week_start'] },
    plan_templates: { keyPath: 'id' },
    todo_templates: { keyPath: 'id' },
    settings: { keyPath: 'key' }
  };

  // 基本の12色。color は濃い色(バーと凡例)、color_light は薄い色(行の背景)
  var PALETTE = [
    { name: 'ローズ', color: '#E08DAF', color_light: '#FBE3EC' },
    { name: 'コーラル', color: '#E79A8C', color_light: '#FCE1DC' },
    { name: 'アプリコット', color: '#EBAE6B', color_light: '#FCEAD6' },
    { name: 'レモン', color: '#DCC25A', color_light: '#FBF3CF' },
    { name: 'ライム', color: '#A7CB63', color_light: '#E9F4D3' },
    { name: 'ミント', color: '#69C3A1', color_light: '#DCF2E8' },
    { name: 'アクア', color: '#66BFCB', color_light: '#D8F0F3' },
    { name: 'スカイ', color: '#7DB0E6', color_light: '#E0EEFB' },
    { name: 'ペリウィンクル', color: '#8C98E6', color_light: '#DFE3FB' },
    { name: 'オーキッド', color: '#C99AD6', color_light: '#F3E0F7' },
    { name: 'サンド', color: '#C9A48F', color_light: '#F3E6DF' },
    { name: 'スレート', color: '#9AA7B8', color_light: '#E4E8EE' }
  ];

  var dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        Object.keys(STORES).forEach(function (name) {
          if (db.objectStoreNames.contains(name)) return;
          var os = db.createObjectStore(name, { keyPath: STORES[name].keyPath });
          (STORES[name].indexes || []).forEach(function (ix) { os.createIndex(ix, ix); });
        });
      };
      req.onsuccess = function () {
        // 別の画面が新しい形へ作り替えようとしたら、こちらは閉じて道をあける
        req.result.onversionchange = function () { req.result.close(); };
        resolve(req.result);
      };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }
  function wrap(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function store(name, mode) {
    return open().then(function (db) { return db.transaction(name, mode || 'readonly').objectStore(name); });
  }
  function get(name, key) { return store(name).then(function (s) { return wrap(s.get(key)); }); }
  function getAll(name) { return store(name).then(function (s) { return wrap(s.getAll()); }); }
  function byIndex(name, index, query) { return store(name).then(function (s) { return wrap(s.index(index).getAll(query)); }); }
  // データを変えた回数。バックアップのファイルを作り直すかどうかの判断に使う
  var changeCount = 0;
  function put(name, value) { changeCount++; return store(name, 'readwrite').then(function (s) { return wrap(s.put(value)); }); }
  function del(name, key) { changeCount++; return store(name, 'readwrite').then(function (s) { return wrap(s.delete(key)); }); }
  function putMany(name, values) {
    changeCount++;
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(name, 'readwrite');
        var os = tx.objectStore(name);
        values.forEach(function (v) { os.put(v); });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function makeGenre(name, paletteIndex, order, inTotal) {
    var c = PALETTE[paletteIndex];
    return {
      id: U.uid(), name: name, color: c.color, color_light: c.color_light,
      in_total: inTotal !== false, archived: false, sort_order: order, updated_at: U.nowISO()
    };
  }

  // 初めて開いたときだけ、設定と例のジャンルを入れる
  function init() {
    return get('settings', 'app').then(function (s) {
      if (s) return;
      var genres = DEMO
        ? [makeGenre('就活', 0, 1), makeGenre('自己投資', 5, 2), makeGenre('大学', 7, 3, false), makeGenre('FX', 2, 4)]
        : [makeGenre('仕事', 7, 1), makeGenre('勉強', 5, 2), makeGenre('プライベート', 0, 3)];
      return putMany('genres', genres).then(function () {
        return put('settings', {
          key: 'app', first_used_at: U.nowISO(), last_backup_at: null, backup_modal_shown_at: null, data_version: 1
        });
      }).then(function () { return DEMO ? seedDemo(genres) : null; });
    });
  }

  // 確認用のサンプル(サンプル表示のときだけ、別の保存場所に入れる)
  function seedDemo(genres) {
    var g = {}; genres.forEach(function (x) { g[x.name] = x.id; });
    var ws = U.mondayOf(U.today());
    var todos = [], plans = [];
    function todo(offset, title, genre, done) {
      var day = U.addDays(ws, offset);
      var t = {
        id: U.uid(), day: day, title: title, genre_id: g[genre] || null, done: !!done,
        sort_order: todos.filter(function (x) { return x.day === day; }).length + 1,
        application_id: null, updated_at: U.nowISO()
      };
      todos.push(t);
      return t;
    }
    function plan(offset, start, end, title, genre, todoRef) {
      plans.push({
        id: U.uid(), day: U.addDays(ws, offset), start_min: start, end_min: end, title: title,
        genre_id: g[genre] || null, todo_id: todoRef ? todoRef.id : null, application_id: null,
        source: 'manual', updated_at: U.nowISO()
      });
    }
    var es = todo(0, 'ES作成', '就活', true); todo(0, 'レポート課題', '大学'); var rd = todo(0, '読書30分', '自己投資'); var ch = todo(0, 'チャート分析', 'FX');
    todo(1, '企業研究', '就活'); todo(1, '講義の復習', '大学');
    todo(2, '実験レポート', '大学'); todo(2, '英語', '自己投資'); todo(2, '面接準備', '就活');
    todo(3, '説明会', '就活'); todo(3, '検証ノート', 'FX');
    todo(4, '面接練習', '就活'); todo(4, '課題提出', '大学');
    todo(5, '資格の勉強', '自己投資'); todo(5, 'ES見直し', '就活');
    todo(6, '来週の計画', '自己投資');
    plan(0, 480, 525, '読書', '自己投資', rd); plan(0, 540, 630, '線形代数', '大学'); plan(0, 645, 660, '', 'FX', ch);
    plan(0, 660, 750, 'ES作成', '就活', es); plan(0, 780, 870, '英語', '大学'); plan(0, 1020, 1320, 'バイト', null);
    plan(1, 510, 600, '企業研究', '就活'); plan(1, 640, 730, '電磁気学', '大学'); plan(1, 840, 960, '面接対策', '就活');
    plan(2, 480, 525, '英語', '自己投資'); plan(2, 540, 730, '実験', '大学'); plan(2, 540, 585, '企業のメール返信', '就活');
    plan(3, 480, 540, '検証ノート', 'FX'); plan(3, 600, 690, '説明会', '就活'); plan(3, 780, 870, '統計', '大学');
    plan(4, 540, 615, '面接練習', '就活'); plan(4, 640, 730, 'プログラミング', '大学');
    plan(5, 600, 720, '資格の勉強', '自己投資'); plan(5, 840, 930, 'ES見直し', '就活');
    plan(6, 540, 600, '検証ノート', 'FX'); plan(6, 1200, 1260, '来週の計画', '自己投資');
    return putMany('todos', todos).then(function () { return putMany('plans', plans); }).then(function () {
      return put('day_notes', { day: ws, memo: '午後は研究室。夜に来週の面接日程を確認する', updated_at: U.nowISO() });
    });
  }

  function getGenres() {
    return getAll('genres').then(function (list) {
      return list.sort(function (a, b) { return a.sort_order - b.sort_order; });
    });
  }

  // その週の記録を取り出す。まだ無ければ「初めて開いた日時」を入れて作り、
  // 自動で適用する週テンプレートを入れる。戻り値は { week, added(自動で入った予定) }
  var ensuring = {};
  function ensureWeek(ws) {
    if (ensuring[ws]) return ensuring[ws];
    ensuring[ws] = get('weeks', ws).then(function (w) {
      if (w) return { week: w, added: [] };
      w = { week_start: ws, review: '', first_opened_at: U.nowISO(), updated_at: U.nowISO() };
      return put('weeks', w).then(function () {
        // 自動適用は、今週とこれからの週だけ
        if (ws < U.mondayOf(U.today())) return { week: w, added: [] };
        return getWeekTemplates().then(function (list) {
          var added = [];
          return list.filter(function (t) { return t.auto_apply; }).reduce(function (p, t) {
            return p.then(function () { return applyTemplate(ws, t, 'auto'); }).then(function (r) { added = added.concat(r.plans); });
          }, Promise.resolve()).then(function () { return { week: w, added: added }; });
        });
      });
    });
    ensuring[ws].then(function () { delete ensuring[ws]; }, function () { delete ensuring[ws]; });
    return ensuring[ws];
  }

  // 週ビューと1日ビューが使う、1週間分のまとまり
  function loadWeek(ws) {
    var range = IDBKeyRange.bound(ws, U.addDays(ws, 6));
    return ensureWeek(ws).then(function (ew) {
      return Promise.all([
        getGenres(), byIndex('todos', 'day', range), byIndex('plans', 'day', range),
        store('day_notes').then(function (st) { return wrap(st.getAll(range)); }),
        byIndex('template_applications', 'week_start', ws), getWeekTemplates()
      ]).then(function (r) {
        var genreMap = {};
        r[0].forEach(function (g) { genreMap[g.id] = g; });
        var days = U.weekDays(ws).map(function (day) {
          return {
            day: day,
            todos: r[1].filter(function (t) { return t.day === day; }).sort(function (a, b) { return a.sort_order - b.sort_order; }),
            plans: r[2].filter(function (p) { return p.day === day; }).sort(function (a, b) { return a.start_min - b.start_min; }),
            note: (r[3].filter(function (n) { return n.day === day; })[0] || { memo: '' }).memo
          };
        });
        return {
          week_start: ws, week: ew.week, genres: r[0], genreMap: genreMap, days: days,
          applications: r[4].filter(function (a) { return a.status === 'active'; }).sort(function (a, b) { return a.applied_at < b.applied_at ? -1 : 1; }),
          weekTemplates: r[5], autoAdded: ew.added
        };
      });
    });
  }

  // 合計。足すのは「TOTALに入れる」がオンのジャンルの予定だけ。重なりはそのまま足す
  function totals(plans, genreMap) {
    var by = {}, total = 0;
    plans.forEach(function (p) {
      var g = p.genre_id && genreMap[p.genre_id];
      if (!g || !g.in_total) return;
      var m = p.end_min - p.start_min;
      by[g.id] = (by[g.id] || 0) + m;
      total += m;
    });
    var list = Object.keys(by).map(function (id) { return { genre: genreMap[id], min: by[id] }; })
      .sort(function (a, b) { return a.genre.sort_order - b.genre.sort_order; });
    return { total: total, byGenre: list };
  }

  function saveReview(ws, text) {
    return ensureWeek(ws).then(function (ew) {
      var w = ew.week;
      w.review = text; w.updated_at = U.nowISO();
      return put('weeks', w);
    });
  }
  function saveMemo(day, text) { return put('day_notes', { day: day, memo: text, updated_at: U.nowISO() }); }
  function toggleTodo(id) {
    return get('todos', id).then(function (t) {
      if (!t) return null;
      t.done = !t.done; t.updated_at = U.nowISO();
      return put('todos', t).then(function () { return t; });
    });
  }

  // ToDo
  function addTodo(day, title, genreId) {
    return byIndex('todos', 'day', day).then(function (list) {
      var max = 0;
      list.forEach(function (x) { max = Math.max(max, x.sort_order || 0); });
      var t = {
        id: U.uid(), day: day, title: title, genre_id: genreId || null, done: false, sort_order: max + 1,
        application_id: null, updated_at: U.nowISO()
      };
      return put('todos', t).then(function () { return t; });
    });
  }
  function saveTodo(t) { t.updated_at = U.nowISO(); return put('todos', t); }
  // ToDoを消しても、紐づけた予定は残す。紐づけだけを外す
  function deleteTodo(id) {
    return byIndex('plans', 'todo_id', id).then(function (plans) {
      plans.forEach(function (p) { p.todo_id = null; p.updated_at = U.nowISO(); });
      return putMany('plans', plans);
    }).then(function () { return del('todos', id); });
  }
  function reorder(storeName, ids) {
    return getAll(storeName).then(function (all) {
      var map = {}, changed = [];
      all.forEach(function (x) { map[x.id] = x; });
      ids.forEach(function (id, i) {
        var x = map[id];
        if (x && x.sort_order !== i + 1) { x.sort_order = i + 1; x.updated_at = U.nowISO(); changed.push(x); }
      });
      return putMany(storeName, changed);
    });
  }

  // ジャンル
  function addGenre(g) {
    return getAll('genres').then(function (list) {
      var max = 0;
      list.forEach(function (x) { max = Math.max(max, x.sort_order || 0); });
      var n = {
        id: U.uid(), name: g.name, color: g.color, color_light: g.color_light, in_total: g.in_total !== false,
        archived: false, sort_order: max + 1, updated_at: U.nowISO()
      };
      return put('genres', n).then(function () { return n; });
    });
  }
  function saveGenre(g) { g.updated_at = U.nowISO(); return put('genres', g); }

  // 予定
  function addPlan(p) {
    var n = {
      id: U.uid(), day: p.day, start_min: p.start_min, end_min: p.end_min, title: p.title || '', genre_id: p.genre_id || null,
      todo_id: p.todo_id || null, application_id: p.application_id || null, source: p.source || 'manual', updated_at: U.nowISO()
    };
    return put('plans', n).then(function () { return n; });
  }
  function savePlan(p) { p.updated_at = U.nowISO(); return put('plans', p); }

  // テンプレート
  function delMany(name, keys) {
    changeCount++;
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(name, 'readwrite');
        var os = tx.objectStore(name);
        keys.forEach(function (k) { os.delete(k); });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function bySort(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); }
  function getWeekTemplates() { return getAll('week_templates').then(function (l) { return l.sort(bySort); }); }
  function getPlanTemplates() { return getAll('plan_templates').then(function (l) { return l.sort(bySort); }); }
  function getTemplateItems(tid) {
    return Promise.all([byIndex('week_template_plans', 'template_id', tid), byIndex('week_template_todos', 'template_id', tid)]).then(function (r) {
      return { plans: r[0], todos: r[1].sort(bySort) };
    });
  }
  function nextOrder(name) {
    return getAll(name).then(function (l) { var m = 0; l.forEach(function (x) { m = Math.max(m, x.sort_order || 0); }); return m + 1; });
  }
  // plans と todos は、曜日(月曜が0)と中身だけを持つ写し
  function createWeekTemplate(name, plans, todos) {
    return nextOrder('week_templates').then(function (order) {
      var t = { id: U.uid(), name: name, auto_apply: false, sort_order: order, updated_at: U.nowISO() };
      var ps = plans.map(function (p) {
        return { id: U.uid(), template_id: t.id, weekday: p.weekday, start_min: p.start_min, end_min: p.end_min, title: p.title || '', genre_id: p.genre_id || null };
      });
      var ts = todos.map(function (x, i) {
        return { id: U.uid(), template_id: t.id, weekday: x.weekday, title: x.title, genre_id: x.genre_id || null, sort_order: i + 1 };
      });
      return put('week_templates', t).then(function () { return putMany('week_template_plans', ps); })
        .then(function () { return putMany('week_template_todos', ts); }).then(function () { return t; });
    });
  }
  function saveWeekTemplate(t) { t.updated_at = U.nowISO(); return put('week_templates', t); }
  // 削除しても、適用済みの週の予定と適用記録は残す
  function deleteWeekTemplate(id) {
    return getTemplateItems(id).then(function (it) {
      return delMany('week_template_plans', it.plans.map(function (p) { return p.id; }))
        .then(function () { return delMany('week_template_todos', it.todos.map(function (t) { return t.id; })); })
        .then(function () { return del('week_templates', id); });
    });
  }
  // 週テンプレートの中身を写して、その週に予定とToDoを入れる。戻り値は { application, plans, todos }
  function applyTemplate(ws, tpl, how) {
    var range = IDBKeyRange.bound(ws, U.addDays(ws, 6));
    return Promise.all([getTemplateItems(tpl.id), byIndex('todos', 'day', range)]).then(function (r) {
      var app = {
        id: U.uid(), week_start: ws, template_id: tpl.id, template_name: tpl.name, status: 'active', how: how, applied_at: U.nowISO()
      };
      var plans = r[0].plans.map(function (p) {
        return {
          id: U.uid(), day: U.addDays(ws, p.weekday), start_min: p.start_min, end_min: p.end_min, title: p.title || '',
          genre_id: p.genre_id || null, todo_id: null, application_id: app.id, source: 'week_template', updated_at: U.nowISO()
        };
      });
      var max = {};
      r[1].forEach(function (t) { max[t.day] = Math.max(max[t.day] || 0, t.sort_order || 0); });
      var todos = r[0].todos.map(function (x) {
        var day = U.addDays(ws, x.weekday);
        max[day] = (max[day] || 0) + 1;
        return {
          id: U.uid(), day: day, title: x.title, genre_id: x.genre_id || null, done: false, sort_order: max[day],
          application_id: app.id, updated_at: U.nowISO()
        };
      });
      return put('template_applications', app).then(function () { return putMany('plans', plans); })
        .then(function () { return putMany('todos', todos); }).then(function () { return { application: app, plans: plans, todos: todos }; });
    });
  }
  function applicationItems(appId) {
    return Promise.all([byIndex('plans', 'application_id', appId), byIndex('todos', 'application_id', appId)]).then(function (r) {
      return { plans: r[0], todos: r[1] };
    });
  }
  // その適用で入った予定とToDoをすべて消し、記録は「外した」として残す
  function removeApplication(app) {
    return applicationItems(app.id).then(function (it) {
      return delMany('plans', it.plans.map(function (p) { return p.id; }))
        .then(function () { return delMany('todos', it.todos.map(function (t) { return t.id; })); });
    }).then(function () {
      app.status = 'removed';
      return put('template_applications', app);
    });
  }
  function getTodoTemplates() { return getAll('todo_templates').then(function (l) { return l.sort(bySort); }); }
  function saveTodoTemplate(tt) {
    if (tt.id) return put('todo_templates', tt).then(function () { return tt; });
    return nextOrder('todo_templates').then(function (order) {
      var n = { id: U.uid(), title: tt.title, genre_id: tt.genre_id || null, sort_order: order };
      return put('todo_templates', n).then(function () { return n; });
    });
  }
  function savePlanTemplate(pt) {
    if (pt.id) return put('plan_templates', pt).then(function () { return pt; });
    return nextOrder('plan_templates').then(function (order) {
      var n = { id: U.uid(), name: pt.name, start_min: pt.start_min, end_min: pt.end_min, genre_id: pt.genre_id || null, sort_order: order };
      return put('plan_templates', n).then(function () { return n; });
    });
  }

  // 復元用。すべての保存場所を空にして、渡された内容に置き換える
  function replaceAll(data) {
    changeCount++;
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var names = Object.keys(STORES);
        var tx = db.transaction(names, 'readwrite');
        names.forEach(function (n) {
          var os = tx.objectStore(n);
          os.clear();
          (data[n] || []).forEach(function (v) { os.put(v); });
        });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  function setDemo(on) {
    try { if (on) localStorage.setItem('wp-demo', '1'); else localStorage.removeItem('wp-demo'); } catch (e) { /* 何もしない */ }
    location.reload();
  }

  WP.db = {
    DEMO: DEMO, PALETTE: PALETTE, STORE_NAMES: Object.keys(STORES), keyOf: function (n) { return STORES[n].keyPath; },
    changes: function () { return changeCount; }, replaceAll: replaceAll, init: init, get: get, getAll: getAll, byIndex: byIndex, put: put, del: del, putMany: putMany,
    getGenres: getGenres, ensureWeek: ensureWeek, loadWeek: loadWeek, totals: totals,
    saveReview: saveReview, saveMemo: saveMemo, toggleTodo: toggleTodo, setDemo: setDemo,
    addTodo: addTodo, saveTodo: saveTodo, deleteTodo: deleteTodo, reorder: reorder, addGenre: addGenre, saveGenre: saveGenre, addPlan: addPlan, savePlan: savePlan,
    getWeekTemplates: getWeekTemplates, getPlanTemplates: getPlanTemplates, getTemplateItems: getTemplateItems,
    createWeekTemplate: createWeekTemplate, saveWeekTemplate: saveWeekTemplate, deleteWeekTemplate: deleteWeekTemplate,
    applyTemplate: applyTemplate, applicationItems: applicationItems, removeApplication: removeApplication, savePlanTemplate: savePlanTemplate,
    getTodoTemplates: getTodoTemplates, saveTodoTemplate: saveTodoTemplate
  };
})();
