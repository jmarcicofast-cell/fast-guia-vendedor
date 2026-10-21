// Captador FAST — roda no Google Maps.
// Painel flutuante: captura a loja aberta ou os resultados carregados da busca,
// junta numa "cesta" e manda para a conferência no Discador do Guia.
(function () {
  if (window.__captadorFast) return;
  window.__captadorFast = true;

  var GUIA_URL = 'https://jmarcicofast-cell.github.io/fast-guia-vendedor/guia-vendedor.html#captador';
  var cesta = [];
  var aberto = true;

  function dig(s) { return String(s || '').replace(/\D/g, ''); }
  function limpo(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function chave(c) { var d = dig(c.tel); return d ? 'T' + d.slice(-10) : 'N' + limpo(c.nome).toUpperCase(); }
  function telBR(d) {
    d = dig(d);
    if (d.indexOf('55') === 0 && (d.length === 12 || d.length === 13)) d = d.slice(2);
    if (d.charAt(0) === '0') d = d.replace(/^0+/, '');
    return d;
  }
  // "Rua X, 10 - Centro, Joinville - SC, 89201-000" → { cidade, uf }
  function cidadeUf(end) {
    var m = String(end || '').match(/,\s*([^,\d]+?)\s*-\s*([A-Z]{2})\b/);
    return m ? { cidade: limpo(m[1]), uf: m[2] } : { cidade: '', uf: '' };
  }
  function busca() {
    var m = location.pathname.match(/\/maps\/search\/([^/]+)/);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }

  // ── leitura da ficha aberta ──
  function lerFicha() {
    // com a lista aberta existem dois painéis "main": usa o da ficha (o que tem endereço/telefone)
    var mains = [].slice.call(document.querySelectorAll('div[role="main"]'));
    var scope = mains.filter(function (m) { return m.querySelector('[data-item-id="address"],[data-item-id^="phone:tel:"]'); })[0];
    if (!scope) return null;
    var h1 = scope.querySelector('h1.DUwDvf') || scope.querySelector('h1');
    var nome = limpo((h1 && h1.textContent) || scope.getAttribute('aria-label'));
    if (!nome) return null;
    var telEl = scope.querySelector('[data-item-id^="phone:tel:"]');
    var tel = telEl ? telBR(telEl.getAttribute('data-item-id').replace('phone:tel:', '')) : '';
    var endEl = scope.querySelector('[data-item-id="address"]');
    var end = endEl ? limpo((endEl.getAttribute('aria-label') || endEl.textContent).replace(/^Endere[çc]o:\s*/i, '')) : '';
    var catEl = scope.querySelector('button.DkEaL') || scope.querySelector('button[jsaction*="category"]');
    var site = scope.querySelector('a[data-item-id="authority"]');
    var cu = cidadeUf(end);
    return { nome: nome, tel: tel, categoria: catEl ? limpo(catEl.textContent) : '', endereco: end, cidade: cu.cidade, uf: cu.uf, site: site ? site.href : '', link: location.href.split('?')[0] };
  }

  // ── leitura dos cartões da lista de resultados ──
  function lerLista() {
    var feed = document.querySelector('div[role="feed"]');
    if (!feed) return [];
    var out = [];
    feed.querySelectorAll('a.hfpxzc, a[href*="/maps/place/"]').forEach(function (a) {
      var nome = limpo(a.getAttribute('aria-label'));
      if (!nome) return;
      var card = a.parentElement;
      for (var i = 0; i < 4 && card && card.innerText.split('\n').length < 3; i++) card = card.parentElement;
      var txt = card ? card.innerText : '';
      var telM = txt.match(/\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/);
      var categoria = '', endereco = '';
      txt.split('\n').map(limpo).forEach(function (ln) {
        if (ln.indexOf('·') < 0) return;
        ln.split('·').map(limpo).forEach(function (p) {
          if (!p || /^\d+[,.]\d/.test(p) || /^\(?\d/.test(p) || /aberto|fechado|abre|fecha/i.test(p)) return;
          if (!categoria && !/\d/.test(p)) categoria = p;
          else if (!endereco && /\d|rua|av|rod|estr/i.test(p)) endereco = p;
        });
      });
      out.push({ nome: nome, tel: telM ? telBR(telM[0]) : '', categoria: categoria, endereco: endereco, cidade: '', uf: '', site: '', link: (a.href || '').split('?')[0] });
    });
    return out;
  }

  // ── cesta ──
  function salvar() { try { chrome.storage.local.set({ cesta: cesta }); } catch (e) {} render(); }
  function adicionar(lst) {
    var tem = {}; cesta.forEach(function (c) { tem[chave(c)] = 1; });
    var n = 0;
    lst.forEach(function (c) { var k = chave(c); if (tem[k]) return; tem[k] = 1; c.busca = busca(); cesta.push(c); n++; });
    salvar();
    aviso(n ? n + ' adicionado' + (n > 1 ? 's' : '') + ' à cesta' : 'Já estavam na cesta');
  }
  function enviar() {
    if (!cesta.length) { aviso('A cesta está vazia'); return; }
    chrome.storage.local.set({ pendente: { contatos: cesta, busca: busca(), em: Date.now() } }, function () {
      window.open(GUIA_URL, 'guia-fast');
      aviso('Abrindo a conferência no Guia…');
    });
  }

  // ── painel ──
  var box = document.createElement('div');
  box.id = 'captador-fast';
  box.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(box);
  var root = box.shadowRoot;

  function aviso(m) {
    var t = root.getElementById('av'); if (!t) return;
    t.textContent = m; t.style.opacity = 1;
    clearTimeout(aviso.h); aviso.h = setTimeout(function () { t.style.opacity = 0; }, 2400);
  }

  function render() {
    var ficha = lerFicha(), feed = document.querySelector('div[role="feed"]');
    var nLista = feed ? lerLista().length : 0;
    root.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.p{position:fixed;right:16px;bottom:24px;z-index:2147483646;width:280px;background:#fff;color:#1f2328;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.25);font:13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}' +
      '.h{display:flex;align-items:center;justify-content:space-between;background:#1F8A5C;color:#fff;padding:9px 12px;font-weight:700;cursor:pointer}' +
      '.c{padding:10px 12px;display:flex;flex-direction:column;gap:8px}' +
      'button{font:inherit;border-radius:9px;border:1px solid #d0d7de;background:#f6f8fa;padding:8px 10px;cursor:pointer;text-align:left}' +
      'button:hover{background:#eef1f4}button[disabled]{opacity:.45;cursor:default}' +
      '.pri{background:#1F8A5C;color:#fff;border-color:#1F8A5C;font-weight:700;text-align:center}.pri:hover{background:#18744c}' +
      '.s{color:#656d76;font-size:12px}.f{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.row{display:flex;gap:6px}.row button{flex:1;text-align:center}' +
      '#av{position:absolute;left:12px;right:12px;bottom:8px;background:#1f2328;color:#fff;border-radius:8px;padding:6px 8px;font-size:12px;opacity:0;transition:opacity .2s;pointer-events:none}' +
      '.min{width:auto}.min .c{display:none}' +
      '</style>' +
      '<div class="p' + (aberto ? '' : ' min') + '"><div class="h" id="tg"><span>📥 Captador FAST</span><span>' + cesta.length + (aberto ? ' ▾' : ' ▴') + '</span></div>' +
      '<div class="c">' +
      (ficha
        ? '<div><div class="f">' + esc(ficha.nome) + '</div><div class="s">' + esc([ficha.categoria, ficha.tel ? fmt(ficha.tel) : 'sem telefone'].filter(Boolean).join(' · ')) + '</div></div>' +
          '<button id="b1">＋ Capturar esta loja</button>'
        : '<div class="s">Abra uma loja no mapa para capturar, ou faça uma busca (ex.: "drywall Joinville").</div>') +
      (feed ? '<button id="b2">＋ Capturar os ' + nLista + ' resultados carregados</button><div class="s">Role a lista do Maps para carregar mais resultados.</div>' : '') +
      '<div class="row"><button class="pri" id="b3"' + (cesta.length ? '' : ' disabled') + '>Enviar ' + cesta.length + ' para conferência</button></div>' +
      (cesta.length ? '<button id="b4" class="s" style="text-align:center">Esvaziar cesta</button>' : '') +
      '</div><div id="av"></div></div>';
    root.getElementById('tg').onclick = function () { aberto = !aberto; render(); };
    var b1 = root.getElementById('b1'); if (b1) b1.onclick = function () { var f = lerFicha(); if (f) adicionar([f]); };
    var b2 = root.getElementById('b2'); if (b2) b2.onclick = function () { adicionar(lerLista()); };
    var b3 = root.getElementById('b3'); if (b3) b3.onclick = enviar;
    var b4 = root.getElementById('b4'); if (b4) b4.onclick = function () { cesta = []; salvar(); };
  }
  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(d) { d = dig(d); return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : d.length === 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6) : d; }

  try {
    chrome.storage.local.get(['cesta'], function (r) { cesta = (r && r.cesta) || []; render(); });
    chrome.storage.onChanged.addListener(function (ch) { if (ch.cesta) { cesta = ch.cesta.newValue || []; render(); } });
  } catch (e) { render(); }

  // o Maps troca de tela sem recarregar: atualiza o painel quando a URL ou a ficha mudam
  var ultimo = '';
  setInterval(function () {
    var f = lerFicha(), k = location.href + '|' + (f ? f.nome + f.tel : '') + '|' + (document.querySelector('div[role="feed"]') ? lerLista().length : 0);
    if (k !== ultimo) { ultimo = k; render(); }
  }, 1200);
})();
