// テンプレート(週テンプレートと予定テンプレート)
(function () {
  'use strict';
  var WP = window.WP, U = WP.util, DB = WP.db;
  var WDAY = ['月', '火', '水', '木', '金', '土', '日'];

  function countText(nPlans, nTodos) { return '予定 ' + nPlans + '件' + (nTodos ? '、ToDo ' + nTodos + '件' : ''); }

  // 月〜日の小さなタイムライン。plans は { weekday, start_min, end_min, genre_id } の並び
  function previewHTML(plans, genreMap) {
    var minH = 8, maxH = 17;
    if (plans.length) {
      minH = 24; maxH = 0;
      plans.forEach(function (p) { minH = Math.min(minH, Math.floor(p.start_min / 60)); maxH = Math.max(maxH, Math.ceil(p.end_min / 60)); });
      while (maxH - minH < 6) { if (maxH < 24) maxH++; if (maxH - minH < 6 && minH > 0) minH--; }
    }
    var rows = maxH - minH, rh = Math.max(10, Math.min(18, Math.round(190 / rows)));
    var h = '<div class="pv"><div class="pvh"><span></span>' + WDAY.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div><div class="pvr"><div class="pvg">';
    for (var i = minH; i < maxH; i++) h += '<div style="height:' + rh + 'px">' + (rh >= 14 || (i - minH) % 2 === 0 ? i : '') + '</div>';
    h += '</div>';
    for (var d = 0; d < 7; d++) {
      h += '<div class="pvc" style="height:' + (rows * rh) + 'px;background-image:repeating-linear-gradient(to bottom,var(--soft) 0,var(--soft) 1px,transparent 1px,transparent ' + rh + 'px)">';
      plans.forEach(function (p) {
        if (p.weekday !== d) return;
        var g = p.genre_id && genreMap[p.genre_id];
        h += '<div class="pvb" style="top:' + ((p.start_min - minH * 60) / 60 * rh) + 'px;height:' + Math.max(3, (p.end_min - p.start_min) / 60 * rh - 1) +
          'px;background:' + (g ? g.color : '#B8B4C6') + '"></div>';
      });
      h += '</div>';
    }
    return h + '</div></div>';
  }

  // ---- 週ビューに出す TEMPLATE の行
  function rowHTML(data) {
    var apps = data.applications, tpls = data.weekTemplates;
    if (!apps.length && !tpls.length) return '';
    var applied = {};
    apps.forEach(function (a) { applied[a.template_id] = true; });
    var canApply = tpls.some(function (t) { return !applied[t.id]; });
    var h = '<div class="wk-full trow"><span class="hl">TEMPLATE</span><div class="tapps">';
    if (!apps.length) h += '<div class="tapp"><span class="nm mute">なし</span></div>';
    apps.forEach(function (a) {
      h += '<div class="tapp"><span class="nm">' + U.esc(a.template_name) + '</span><button class="btn sm" data-act="tpl-remove" data-id="' + a.id + '">外す</button></div>';
    });
    h += '</div>';
    if (canApply) {
      h += apps.length ? '<button class="tplus" data-act="tpl-apply" aria-label="別の週テンプレートを適用">' + U.icon('plus', 15) + '</button>'
        : '<button class="btn sm pri" data-act="tpl-apply">適用する</button>';
    }
    return h + '</div>';
  }

  // ---- 適用で重なった予定を、日付ごとに知らせる
  function reportOverlaps(ws, newPlans) {
    if (!newPlans.length) return Promise.resolve();
    return DB.loadWeek(ws).then(function (data) {
      var isNew = {}, todoMap = {};
      newPlans.forEach(function (p) { isNew[p.id] = true; });
      data.days.forEach(function (d) { d.todos.forEach(function (t) { todoMap[t.id] = t; }); });
      data.todoMap = todoMap;
      var h = '';
      data.days.forEach(function (d) {
        var hit = {};
        d.plans.forEach(function (n) {
          if (!isNew[n.id]) return;
          d.plans.forEach(function (o) {
            if (o.id !== n.id && o.start_min < n.end_min && o.end_min > n.start_min) { hit[n.id] = n; hit[o.id] = o; }
          });
        });
        var list = Object.keys(hit).map(function (k) { return hit[k]; }).sort(function (a, b) { return a.start_min - b.start_min || a.end_min - b.end_min; });
        if (!list.length) return;
        h += '<div class="ov-day">' + U.dayLabel(d.day) + '</div>';
        list.forEach(function (p) { h += '<div>' + U.hm(p.start_min) + '–' + U.hm(p.end_min) + ' ' + U.esc(WP.week.planTitle(p, data)) + '</div>'; });
      });
      if (!h) return null;
      return WP.modal({ title: '予定が重なっています', html: h, buttons: [{ label: 'OK', value: 'ok', primary: true }] });
    });
  }

  // ---- 週テンプレートを、この週に適用する
  function openApply(ws) {
    Promise.all([DB.getWeekTemplates(), DB.byIndex('template_applications', 'week_start', ws), DB.getGenres()]).then(function (r) {
      var applied = {}, genreMap = {};
      r[1].forEach(function (a) { if (a.status === 'active') applied[a.template_id] = true; });
      r[2].forEach(function (g) { genreMap[g.id] = g; });
      var tpls = r[0].filter(function (t) { return !applied[t.id]; });
      if (!tpls.length) { U.toast('適用できる週テンプレートがありません'); return; }
      Promise.all(tpls.map(function (t) { return DB.getTemplateItems(t.id); })).then(function (items) {
        var sel = 0;
        var h = '<p class="lab">週テンプレートを選ぶ</p><div id="apList">' + tpls.map(function (t, i) {
          return '<button class="opt' + (i === 0 ? ' sel' : '') + '" data-i="' + i + '"><span class="rad' + (i === 0 ? ' on' : '') + '"></span><span>' + U.esc(t.name) +
            '</span>' + (t.auto_apply ? '<span class="tag">自動で適用</span>' : '') + '</button>';
        }).join('') + '</div><p class="lab" style="margin-top:14px">PREVIEW</p><div id="apPrev"></div><div class="hint" id="apCount"></div>' +
          '<div class="act" style="margin-top:12px"><button class="btn" data-act="cancel">やめる</button><button class="btn pri" data-act="apply">適用</button></div>';
        var sheet = WP.sheet.open(h, {});
        function draw() {
          sheet.querySelector('#apPrev').innerHTML = previewHTML(items[sel].plans, genreMap);
          sheet.querySelector('#apCount').textContent = countText(items[sel].plans.length, items[sel].todos.length) + 'を' + U.weekLabel(ws) + 'に入れます';
        }
        draw();
        sheet.addEventListener('click', function (e) {
          var o = e.target.closest('.opt');
          if (o) {
            sel = +o.dataset.i;
            sheet.querySelectorAll('.opt').forEach(function (el, i) { el.classList.toggle('sel', i === sel); el.querySelector('.rad').classList.toggle('on', i === sel); });
            draw();
            return;
          }
          var act = e.target.closest('[data-act]');
          if (!act) return;
          if (act.dataset.act === 'cancel') WP.sheet.close(true);
          if (act.dataset.act === 'apply') {
            DB.applyTemplate(ws, tpls[sel], 'manual').then(function (res) {
              WP.sheet.close();
              return Promise.resolve(WP.app.refresh()).then(function () { return reportOverlaps(ws, res.plans); });
            });
          }
        });
      });
    });
  }

  // ---- その週から、テンプレート由来の予定とToDoをまとめて外す
  function confirmRemove(app) {
    if (!app) return;
    DB.applicationItems(app.id).then(function (it) {
      return WP.modal({
        title: 'この週から外しますか', center: true,
        html: '「' + U.esc(app.template_name) + '」から入った' + countText(it.plans.length, it.todos.length) + 'を、<br>' + U.weekLabel(app.week_start) + 'から消します。',
        buttons: [{ label: 'やめる', value: 'no' }, { label: '外す', value: 'yes', primary: true }]
      });
    }).then(function (v) {
      if (v !== 'yes') return;
      DB.removeApplication(app).then(function () { WP.app.refresh(); });
    });
  }

  // ---- 表示中の週から、週テンプレートを作る
  function openSave(ws) {
    DB.loadWeek(ws).then(function (data) {
      var todoMap = {}, plans = [], todos = [];
      data.days.forEach(function (d, i) {
        d.todos.forEach(function (t) { todoMap[t.id] = t; todos.push({ weekday: i, title: t.title, genre_id: t.genre_id }); });
      });
      data.days.forEach(function (d, i) {
        d.plans.forEach(function (p) {
          // タイトルが空でToDoと紐づいている予定は、ToDoの名前を写す
          var title = p.title || (p.todo_id && todoMap[p.todo_id] ? todoMap[p.todo_id].title : '');
          plans.push({ weekday: i, start_min: p.start_min, end_min: p.end_min, title: title, genre_id: p.genre_id });
        });
      });
      // この週で使われているジャンル。並びはジャンル管理の順、最後に「なし」
      var used = {};
      plans.concat(todos).forEach(function (x) { used[x.genre_id || ''] = true; });
      var chips = data.genres.filter(function (g) { return used[g.id]; }).map(function (g) { return { key: g.id, name: g.name, bg: g.color_light }; });
      if (used['']) chips.push({ key: '', name: 'なし', bg: 'var(--none)' });
      var st = { sel: {}, todos: false };
      function picked() {
        return {
          plans: plans.filter(function (p) { return st.sel[p.genre_id || '']; }),
          todos: st.todos ? todos.filter(function (t) { return st.sel[t.genre_id || '']; }) : []
        };
      }
      var h = '<div class="hint" style="margin-bottom:12px">' + U.weekLabel(ws) + 'の内容から作ります。</div>' +
        '<p class="lab">名前</p><input class="field" id="wtName" maxlength="30" autocomplete="off" placeholder="前期の時間割">' +
        '<p class="lab">含めるジャンル</p><div class="chips" id="wtChips">' +
        (chips.length ? chips.map(function (c) {
          return '<button class="chip off" data-key="' + c.key + '" style="background:' + c.bg + '">' + U.esc(c.name) + '</button>';
        }).join('') : '<span class="hint">この週には、まだ予定もToDoもありません。</span>') + '</div>' +
        '<div class="tog-row plain"><span class="lab">ToDoも含める</span><button class="tog" id="wtTodos" role="switch" aria-checked="false" aria-label="ToDoも含める"></button></div>' +
        '<p class="lab">PREVIEW</p><div id="wtPrev"></div><div class="hint" id="wtCount"></div><div class="err" id="wtErr" hidden style="margin-top:8px"></div>' +
        '<div class="act" style="margin-top:12px"><button class="btn" data-act="cancel">やめる</button><button class="btn pri" data-act="save">保存</button></div>';
      var sheet = WP.sheet.open(h, {});
      var err = sheet.querySelector('#wtErr');
      function draw() {
        var p = picked();
        sheet.querySelector('#wtPrev').innerHTML = previewHTML(p.plans, data.genreMap);
        sheet.querySelector('#wtCount').textContent = countText(p.plans.length, p.todos.length) + 'を保存します';
      }
      draw();
      sheet.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip[data-key]');
        if (chip) {
          var k = chip.dataset.key;
          st.sel[k] = !st.sel[k];
          chip.classList.toggle('off', !st.sel[k]); chip.classList.toggle('sel', !!st.sel[k]);
          err.hidden = true;
          draw();
          return;
        }
        var tg = e.target.closest('#wtTodos');
        if (tg) { st.todos = !st.todos; tg.classList.toggle('on', st.todos); tg.setAttribute('aria-checked', st.todos); draw(); return; }
        var act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'cancel') { WP.sheet.close(true); return; }
        var name = sheet.querySelector('#wtName').value.trim(), p = picked();
        if (!name) { err.textContent = '名前を入れてください'; err.hidden = false; sheet.querySelector('#wtName').focus(); return; }
        if (!p.plans.length && !p.todos.length) { err.textContent = '保存する予定がありません。含めるジャンルを選んでください'; err.hidden = false; return; }
        DB.createWeekTemplate(name, p.plans, p.todos).then(function () { WP.sheet.close(); U.toast('週テンプレートを保存しました'); WP.app.refresh(); });
      });
    });
  }

  // ---- 週テンプレートの名前の変更と削除
  function openWeekEdit(t) {
    Promise.all([DB.getTemplateItems(t.id), DB.getGenres()]).then(function (r) {
      var genreMap = {};
      r[1].forEach(function (g) { genreMap[g.id] = g; });
      var h = '<p class="lab">名前</p><input class="field" id="weName" maxlength="30" autocomplete="off" value="' + U.esc(t.name) + '">' +
        '<p class="lab">PREVIEW</p>' + previewHTML(r[0].plans, genreMap) + '<div class="hint">' + countText(r[0].plans.length, r[0].todos.length) + '</div>' +
        '<div class="err" id="weErr" hidden style="margin-top:8px"></div><div class="act" style="margin-top:12px">' +
        '<button class="btn del" data-act="delete" aria-label="削除">' + U.icon('trash', 19) + '</button><button class="btn pri" data-act="done">完了</button></div>';
      var sheet = WP.sheet.open(h, {});
      sheet.addEventListener('click', function (e) {
        var act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'done') {
          var name = sheet.querySelector('#weName').value.trim();
          if (!name) { var er = sheet.querySelector('#weErr'); er.textContent = '名前を入れてください'; er.hidden = false; return; }
          t.name = name;
          DB.saveWeekTemplate(t).then(function () { WP.sheet.close(); WP.app.refresh(); });
        } else if (act.dataset.act === 'delete') {
          WP.modal({
            title: '削除しますか', center: true,
            html: '週テンプレート「' + U.esc(t.name) + '」を削除します。<br>すでに適用した週の予定は残ります。',
            buttons: [{ label: 'やめる', value: 'no' }, { label: '削除', value: 'yes', primary: true }]
          }).then(function (v) {
            if (v !== 'yes') return;
            DB.deleteWeekTemplate(t.id).then(function () { WP.sheet.close(); WP.app.refresh(); });
          });
        }
      });
    });
  }

  // ---- 予定テンプレートの追加と編集
  function openPlanTpl(pt) {
    DB.getGenres().then(function (genres) {
      var d = { start: pt ? pt.start_min : 540, end: pt ? pt.end_min : 600, genre_id: pt ? pt.genre_id : null, active: null };
      var h = '<p class="lab">名前</p><input class="field" id="ptName" maxlength="20" autocomplete="off" value="' + U.esc(pt ? pt.name : '') + '" placeholder="バイト">' +
        WP.plan.timeHTML(d) + '<p class="lab">ジャンル</p><div class="chips" id="ptChips">' + WP.genre.chipsHTML(genres, d.genre_id, false) + '</div>' +
        '<div class="err" id="ptErr" hidden></div><div class="act">' +
        (pt ? '<button class="btn del" data-act="delete" aria-label="削除">' + U.icon('trash', 19) + '</button>' : '<span></span>') +
        '<button class="btn pri" data-act="done">完了</button></div>';
      var sheet = WP.sheet.open(h, {});
      var err = sheet.querySelector('#ptErr'), nameEl = sheet.querySelector('#ptName');
      function fail(msg) { err.textContent = msg; err.hidden = !msg; }
      var time = WP.plan.bindTime(sheet, d, function (bad) { fail(bad ? '終了は開始より後にしてください' : ''); });
      if (!pt) nameEl.focus();
      sheet.addEventListener('click', function (e) {
        var chip = e.target.closest('#ptChips .chip[data-genre]');
        if (chip) {
          d.genre_id = chip.dataset.genre || null;
          sheet.querySelectorAll('#ptChips .chip').forEach(function (c) { c.classList.toggle('sel', c === chip); });
          return;
        }
        var act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'done') {
          time.read();
          var name = nameEl.value.trim();
          if (!name) { fail('名前を入れてください'); nameEl.focus(); return; }
          if (d.end <= d.start) { fail('終了は開始より後にしてください'); return; }
          var rec = pt || {};
          rec.name = name; rec.start_min = d.start; rec.end_min = d.end; rec.genre_id = d.genre_id;
          DB.savePlanTemplate(rec).then(function () { WP.sheet.close(); WP.app.refresh(); });
        } else if (act.dataset.act === 'delete') {
          DB.del('plan_templates', pt.id).then(function () { WP.sheet.close(); WP.app.refresh(); });
        }
      });
    });
  }

  // ---- テンプレートの一覧の画面
  function render() {
    return Promise.all([DB.getWeekTemplates(), DB.getPlanTemplates(), DB.getGenres()]).then(function (r) {
      var weekly = r[0], plan = r[1], genreMap = {};
      r[2].forEach(function (g) { genreMap[g.id] = g; });
      var ws = WP.app.lastWeek();
      var h = '<div class="page"><div class="st out"><span>WEEKLY</span><i class="rule"></i><b class="dia"></b></div>';
      if (weekly.length) {
        h += '<div class="card list">' + weekly.map(function (t) {
          return '<div class="li"><div class="grow" role="button" tabindex="0" data-act="edit-week" data-id="' + t.id + '"><span>' + U.esc(t.name) + '</span><span class="sub">' +
            (t.auto_apply ? '自動で適用する' : '自動で適用しない') + '</span></div><button class="tog' + (t.auto_apply ? ' on' : '') + '" data-act="auto" data-id="' + t.id +
            '" role="switch" aria-checked="' + !!t.auto_apply + '" aria-label="自動で適用する"></button></div>';
        }).join('') + '</div>';
      } else {
        h += '<div class="empty">週テンプレートはまだありません。授業のように毎週同じ予定を、まとめて入れられます。</div>';
      }
      h += '<button class="add out" data-act="add-week">' + U.icon('plus', 18) + '表示中の週から作る</button>' +
        '<div class="hint" style="padding:0 4px;margin-top:-4px">' + U.weekLabel(ws) + 'の内容から作ります。別の週から作るときは、先にその週を表示してください。</div>';
      h += '<div class="st out" style="margin-top:10px"><span>PLAN</span><i class="rule"></i><b class="dia"></b></div>';
      if (plan.length) {
        h += '<div class="card list">' + plan.map(function (t) {
          var g = t.genre_id && genreMap[t.genre_id];
          return '<div class="li" role="button" tabindex="0" data-act="edit-plan" data-id="' + t.id + '" style="cursor:pointer"><span class="sw" style="background:' +
            (g ? g.color_light : 'var(--none)') + ';border-color:' + (g ? g.color : '#B8B4C6') + '"></span><span><span>' + U.esc(t.name) + '</span><span class="sub">' +
            U.hm(t.start_min) + '–' + U.hm(t.end_min) + '</span></span>' + U.icon('chevron-right', 17).replace('<svg', '<svg class="go"') + '</div>';
        }).join('') + '</div>';
      } else {
        h += '<div class="empty">予定テンプレートはまだありません。バイトのように時間が決まっている予定を、すぐ入れられます。</div>';
      }
      h += '<button class="add out" data-act="add-plan">' + U.icon('plus', 18) + '予定テンプレートを追加</button></div>';

      var view = document.getElementById('view');
      view.innerHTML = h;
      var wMap = {}, pMap = {};
      weekly.forEach(function (t) { wMap[t.id] = t; });
      plan.forEach(function (t) { pMap[t.id] = t; });
      view.querySelector('.page').addEventListener('click', function (e) {
        var el = e.target.closest('[data-act]');
        if (!el) return;
        var act = el.dataset.act;
        if (act === 'auto') {
          var t = wMap[el.dataset.id];
          t.auto_apply = !t.auto_apply;
          DB.saveWeekTemplate(t).then(function () {
            el.classList.toggle('on', t.auto_apply); el.setAttribute('aria-checked', t.auto_apply);
            el.parentNode.querySelector('.sub').textContent = t.auto_apply ? '自動で適用する' : '自動で適用しない';
          });
        } else if (act === 'edit-week') openWeekEdit(wMap[el.dataset.id]);
        else if (act === 'add-week') openSave(ws);
        else if (act === 'edit-plan') openPlanTpl(pMap[el.dataset.id]);
        else if (act === 'add-plan') openPlanTpl(null);
      });
    });
  }

  WP.template = { render: render, rowHTML: rowHTML, openApply: openApply, confirmRemove: confirmRemove, reportOverlaps: reportOverlaps };
})();
