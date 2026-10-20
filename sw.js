// 通信がなくても動くように、アプリのファイルを端末に保存しておく仕組み(サービスワーカー)
'use strict';

var CACHE = 'weekly-planner-v2';
var BASE = new URL('./', self.location).pathname;
var STATIC = ['manifest.webmanifest', 'assets/icon-180.png?v=2', 'assets/icon-192.png?v=2', 'assets/icon-512.png?v=2', 'assets/logo-w.png', 'assets/splash-logo.png', 'assets/splash-name.png'];

// index.html が読み込んでいる css と js の一覧を取り出す
function assetsOf(html) {
  var out = [], re = /(?:href|src)="((?:css|js)\/[^"]+)"/g, m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

// 古い版の css と js を消す
function prune(cache, list) {
  return cache.keys().then(function (keys) {
    return Promise.all(keys.map(function (req) {
      var u = new URL(req.url), rel = u.pathname.slice(BASE.length) + u.search;
      if (/^(css|js)\//.test(rel) && list.indexOf(rel) < 0) return cache.delete(req);
      return null;
    }));
  });
}

// 最新の index.html を取りにいく
function fetchIndex() {
  return fetch('index.html', { cache: 'no-store' }).then(function (res) {
    if (!res.ok) throw new Error('index.html を取得できませんでした');
    return res;
  });
}

// 取ってきた index.html と、それが使う css と js を保存し、古い版を消す
function keep(cache, res) {
  return res.clone().text().then(function (html) {
    var list = assetsOf(html);
    return cache.put('index.html', res).then(function () {
      return Promise.all(list.map(function (u) {
        return cache.match(u).then(function (hit) { return hit || cache.add(u); });
      }));
    }).then(function () { return prune(cache, list); });
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(STATIC).then(fetchIndex).then(function (res) { return keep(cache, res); });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // アプリの画面: 通信できれば最新を使う。3秒待っても取れないときと、通信がないときは、保存してあるものを使う
  if (url.pathname === BASE || url.pathname === BASE + 'index.html') {
    e.respondWith(caches.open(CACHE).then(function (cache) {
      var net = fetchIndex().catch(function () { return null; });
      var limit = new Promise(function (resolve) { setTimeout(resolve, 3000, null); });
      return Promise.race([net, limit]).then(function (res) {
        if (res) { e.waitUntil(keep(cache, res.clone())); return res; }
        return cache.match('index.html').then(function (hit) { return hit || net.then(function (r) { return r || fetch(req); }); });
      });
    }));
    return;
  }

  // それ以外: 保存してあればそれを返し、無ければ取りにいって保存する
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res.ok) cache.put(req, res.clone());
        return res;
      });
    });
  }));
});
