// 通信がなくても動くように、アプリのファイルを端末に保存しておく仕組み(サービスワーカー)
'use strict';

var CACHE = 'weekly-planner-v1';
var BASE = new URL('./', self.location).pathname;
var STATIC = ['manifest.webmanifest', 'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/logo-w.png', 'assets/splash-logo.png'];

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

// 最新の index.html を取りにいき、それが使うファイルもまとめて保存する
function refreshIndex(cache) {
  return fetch('index.html', { cache: 'no-store' }).then(function (res) {
    if (!res.ok) throw new Error('index.html を取得できませんでした');
    var copy = res.clone();
    return res.text().then(function (html) {
      var list = assetsOf(html);
      return Promise.all(list.map(function (u) {
        return cache.match(u).then(function (hit) { return hit || cache.add(u); });
      })).then(function () { return cache.put('index.html', copy); }).then(function () { return prune(cache, list); });
    });
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(STATIC).then(function () { return refreshIndex(cache); });
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

  // アプリの画面: 保存してあるものをすぐ返し、裏で最新を取りにいく(次に開いたときに新しくなる)
  if (url.pathname === BASE || url.pathname === BASE + 'index.html') {
    e.respondWith(caches.open(CACHE).then(function (cache) {
      return cache.match('index.html').then(function (hit) {
        var fresh = refreshIndex(cache).catch(function () { return null; });
        if (hit) { e.waitUntil(fresh); return hit; }
        return fresh.then(function () { return cache.match('index.html'); }).then(function (r) { return r || fetch(req); });
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
