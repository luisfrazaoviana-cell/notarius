// Guarda os arquivos do app e as bibliotecas para abrir mesmo sem internet.
// Os dados (Drive) não passam por aqui.
const VERSAO = 'notarius-0.5.0';
const ARQUIVOS = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icones/icone-192.png', 'icones/icone-512.png', 'marca/logo-selo.png',
  'js/config.js', 'js/dados.js', 'js/base.js', 'js/nuvem.js', 'js/hd.js', 'js/registros.js', 'js/ferramentas.js',
  'js/escrituras.js', 'js/orcamentos.js', 'js/controle.js', 'js/comunicacoes.js', 'js/receitas.js', 'js/acervo.js', 'js/sinchd.js', 'js/app.js'];

self.addEventListener('install', ev => { ev.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS))); self.skipWaiting(); });
self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.hostname.endsWith('googleapis.com') || url.hostname === 'accounts.google.com') return;
  const cdn = /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/.test(url.hostname);
  if (url.origin === location.origin) {
    // App: rede primeiro, sem o cache do navegador (a versão nova chega na primeira abertura); sem internet, usa a cópia guardada.
    ev.respondWith(fetch(ev.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => { const c = r.clone(); caches.open(VERSAO).then(k => k.put(ev.request, c)); return r; })
      .catch(() => caches.match(ev.request)));
  } else if (cdn) {
    // Bibliotecas com versão fixa: cache primeiro.
    ev.respondWith(caches.match(ev.request).then(m => m || fetch(ev.request).then(r => { const c = r.clone(); caches.open(VERSAO).then(k => k.put(ev.request, c)); return r; })));
  }
});
