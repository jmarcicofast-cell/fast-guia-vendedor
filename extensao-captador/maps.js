// Captador do Guia — roda no Google Maps.
// Painel flutuante: captura a loja aberta ou os resultados carregados da busca,
// junta numa "cesta" e manda para a conferência no Discador do Guia.
(function () {
  if (window.__captadorFast) return;
  window.__captadorFast = true;

  var GUIA_URL = 'https://jmarcicofast-cell.github.io/fast-guia-vendedor/guia-vendedor.html#captador';
  var VERSAO = (function () { try { return chrome.runtime.getManifest().version; } catch (e) { return ''; } })();
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

  // ── lista salva ("Salvos" → uma lista com N lugares) ──
  // Os cartões da lista salva não mostram telefone: o captador abre loja por loja,
  // lê a ficha e volta para a lista, até o fim ou até o vendedor clicar em Parar.
  var LOTE = { rodando: false, parar: false, feitos: 0, total: 0, achados: 0, msg: '' };
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function itensSalvos() {
    return [].slice.call(document.querySelectorAll('button[aria-label="Adicionar nota"],button[aria-label="Add note"],button[aria-label="Editar nota"],button[aria-label="Edit note"]')).map(function (n) {
      var c = n;
      for (var i = 0; i < 6 && c; i++) {
        c = c.parentElement; if (!c) break;
        var abre = [].slice.call(c.querySelectorAll('button')).filter(function (b) { return !/nota|note|excluir|delete|remov/i.test(b.getAttribute('aria-label') || '') && limpo(b.innerText).length > 2; })[0];
        if (abre) {
          var linhas = abre.innerText.split('\n').map(limpo).filter(Boolean);
          var cat = linhas.slice(1).filter(function (l) { return !/^\d+[,.]\d|^\(\d|^nota$/i.test(l); })[0] || '';
          return { abre: abre, nome: linhas[0] || '', categoria: cat };
        }
      }
      return null;
    }).filter(Boolean);
  }
  function nomeLista() {
    var m = [].slice.call(document.querySelectorAll('div[role="main"]')).map(function (x) { return x.innerText; }).join('\n').match(/^(.+)\n.*?(\d+)\s+lugares/m);
    return m ? { nome: limpo(m[1]), total: parseInt(m[2], 10) } : { nome: '', total: 0 };
  }
  function rolador() {
    var it = itensSalvos()[0]; if (!it) return null;
    for (var e = it.abre; e && e !== document.body; e = e.parentElement)
      if (e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY)) return e;
    return null;
  }
  // usa a seta "Voltar" do próprio Maps (history.back poderia sair do Maps)
  function botaoVoltar() {
    var b = [].slice.call(document.querySelectorAll('button[aria-label="Voltar"],button[aria-label="Back"]')).filter(function (x) { return x.offsetParent; })[0];
    if (b) b.click();
  }
  async function voltarLista() {
    var voltou = false;
    for (var t = 0; t < 3 && !itensSalvos().length; t++) { voltou = true; botaoVoltar(); for (var w = 0; w < 50 && !itensSalvos().length; w++) await sleep(100); }
    if (voltou && itensSalvos().length) await sleep(250); // deixa a lista terminar de desenhar
    return itensSalvos().length > 0;
  }
  async function carregarAte(k) {
    var parado = 0;
    while (itensSalvos().length <= k && parado < 4 && !LOTE.parar) {
      var n = itensSalvos().length, r = rolador(); if (!r) return false;
      r.scrollTop = r.scrollHeight; await sleep(600);
      parado = itensSalvos().length === n ? parado + 1 : 0;
    }
    return itensSalvos().length > k;
  }
  function mesmoNome(a, b) { a = limpo(a).toUpperCase().slice(0, 14); b = limpo(b).toUpperCase().slice(0, 14); return a && a === b; }
  async function capturarSalvos(soEstes) {
    if (LOTE.rodando) return;
    var info = nomeLista();
    var quero = null; if (soEstes) { quero = {}; soEstes.forEach(function (n) { quero[n.toUpperCase()] = 1; }); }
    LOTE = { rodando: true, parar: false, feitos: 0, total: soEstes ? soEstes.length : (info.total || itensSalvos().length), achados: 0, msg: '', lista: info.nome };
    var vistos = 0;
    var jaTem = {}; cesta.forEach(function (c) { jaTem[limpo(c.nome).toUpperCase()] = 1; });
    render();
    for (var k = 0; !LOTE.parar; k++) {
      if (!(await voltarLista())) { LOTE.msg = 'Não consegui voltar para a lista.'; break; }
      if (!(await carregarAte(k))) break; // chegou ao fim da lista
      var x = itensSalvos()[k]; if (!x) break;
      if (quero && !quero[x.nome.toUpperCase()]) continue;
      LOTE.feitos = ++vistos; render();
      if (quero && vistos >= LOTE.total) LOTE.ultimo = true;
      if (jaTem[x.nome.toUpperCase()]) { if (LOTE.ultimo) break; continue; }
      x.abre.scrollIntoView({ block: 'center' }); await sleep(40);
      (itensSalvos()[k] || x).abre.click();
      var f = null;
      // confere a ficha a cada 120 ms e lê assim que o telefone aparece (sem esperas fixas)
      for (var w = 0; w < 100 && !LOTE.parar; w++) { await sleep(120); f = lerFicha(); if (f && mesmoNome(f.nome, x.nome)) break; f = null; }
      if (f && !f.tel) for (var w2 = 0; w2 < 5; w2++) { await sleep(120); var f2 = lerFicha(); if (f2 && f2.tel) { f = f2; break; } }
      if (f) { f.busca = LOTE.lista ? 'Lista: ' + LOTE.lista : ''; adicionarSilencioso(f); LOTE.achados++; jaTem[x.nome.toUpperCase()] = 1; }
      else adicionarSilencioso({ nome: x.nome, tel: '', categoria: x.categoria || '', endereco: '', cidade: '', uf: '', site: '', link: '', busca: LOTE.lista ? 'Lista: ' + LOTE.lista : '' });
      if (LOTE.ultimo) break;
    }
    await voltarLista();
    LOTE.rodando = false; render();
    aviso(LOTE.parar ? 'Captura interrompida: ' + LOTE.achados + ' lojas na cesta' : 'Lista capturada: ' + LOTE.achados + ' lojas na cesta');
  }
  // ── ler todos de uma vez e escolher ──
  var SEL = { ativo: false, tipo: '', itens: [], filtro: '' };
  async function lerTodos() {
    var feed = document.querySelector('div[role="feed"]');
    var tipo = feed ? 'busca' : 'salva';
    SEL = { ativo: true, tipo: tipo, itens: [], filtro: '', carregando: true }; render();
    // rola até o fim para carregar todos
    var alvo = tipo === 'busca' ? feed : rolador(), parado = 0, n0 = -1, total = tipo === 'salva' ? nomeLista().total : 0;
    for (var t = 0; t < 120 && parado < 6 && alvo; t++) {
      var n = tipo === 'busca' ? lerLista().length : itensSalvos().length;
      if (total && n >= total) break;
      parado = n === n0 ? parado + 1 : 0; n0 = n;
      alvo.scrollTop = alvo.scrollHeight; await sleep(700);
      if (tipo === 'busca' && /chegou ao final|end of the list/i.test(feed.innerText)) break;
    }
    var vistos = {}, lst = tipo === 'busca' ? lerLista() : itensSalvos().map(function (x) { return { nome: x.nome, categoria: x.categoria, tel: '' }; });
    var naCesta = {}; cesta.forEach(function (c) { naCesta[limpo(c.nome).toUpperCase()] = 1; });
    SEL.itens = lst.filter(function (x) { var k = x.nome.toUpperCase(); if (!x.nome || vistos[k]) return false; vistos[k] = 1; return true; })
      .map(function (x) { x.on = !naCesta[x.nome.toUpperCase()] && (tipo !== 'busca' || !!x.tel); x.naCesta = !!naCesta[x.nome.toUpperCase()]; return x; });
    SEL.carregando = false; render();
  }
  // fluxo principal: captura tudo e, ao terminar, abre a conferência no Guia (lá se escolhe quem vai)
  async function capturarTudo() {
    var feed = document.querySelector('div[role="feed"]');
    if (feed) {
      var parado = 0, n0 = -1;
      for (var t = 0; t < 120 && parado < 6; t++) {
        var n = lerLista().length; parado = n === n0 ? parado + 1 : 0; n0 = n;
        feed.scrollTop = feed.scrollHeight; await sleep(700);
        if (/chegou ao final|end of the list/i.test(feed.innerText)) break;
      }
      adicionar(lerLista());
      if (cesta.length) enviar();
      return;
    }
    await capturarSalvos();
    if (!LOTE.parar && cesta.length) enviar();
  }
  function selVisiveis() { var q = limpo(SEL.filtro).toUpperCase(); return SEL.itens.filter(function (x) { return !q || (x.nome + ' ' + (x.categoria || '')).toUpperCase().indexOf(q) >= 0; }); }
  function selConfirmar() {
    var marcados = SEL.itens.filter(function (x) { return x.on; });
    if (!marcados.length) { aviso('Marque pelo menos uma loja'); return; }
    var tipo = SEL.tipo; SEL = { ativo: false, tipo: '', itens: [], filtro: '' };
    if (tipo === 'busca') { adicionar(marcados.map(function (x) { var c = Object.assign({}, x); delete c.on; delete c.naCesta; return c; })); return; }
    capturarSalvos(marcados.map(function (x) { return x.nome; }));
  }
  function adicionarSilencioso(c) {
    var k = chave(c); if (cesta.some(function (x) { return chave(x) === k; })) return;
    cesta.push(c); try { chrome.storage.local.set({ cesta: cesta }); } catch (e) {}
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
      '.p.sel{width:340px}input#sf{font:inherit;border:1px solid #d0d7de;border-radius:9px;padding:7px 9px}' +
      '.sl{max-height:45vh;overflow:auto;border:1px solid #e5e7eb;border-radius:9px}' +
      '.si{display:flex;gap:8px;align-items:flex-start;padding:7px 9px;border-bottom:1px solid #f0f0f0;cursor:pointer}.si.on{background:#eef8f2}' +
      '.si small{display:block;color:#656d76;font-size:11.5px}.si input{margin-top:2px}' +
      '</style>' +
      '<div class="p' + (aberto ? '' : ' min') + (SEL.ativo ? ' sel' : '') + '"><div class="h" id="tg"><span>📥 Captador do Guia <small style="font-weight:400;opacity:.8">v' + VERSAO + '</small></span><span>' + cesta.length + (aberto ? ' ▾' : ' ▴') + '</span></div>' +
      '<div class="c">' +
      (SEL.ativo ? htmlSelecao() : '') +
      (SEL.ativo ? '' : (ficha
        ? '<div><div class="f">' + esc(ficha.nome) + '</div><div class="s">' + esc([ficha.categoria, ficha.tel ? fmt(ficha.tel) : 'sem telefone'].filter(Boolean).join(' · ')) + '</div></div>' +
          '<button id="b1">＋ Capturar esta loja</button>'
        : '<div class="s">Abra uma loja no mapa para capturar, ou faça uma busca (ex.: "drywall Joinville").</div>') +
      (LOTE.rodando
        ? '<div><b>Capturando a lista…</b><div class="s">' + LOTE.feitos + ' de ' + (LOTE.total || '?') + ' lojas · ' + LOTE.achados + ' com ficha lida</div><div style="height:6px;background:#eee;border-radius:4px;margin-top:6px"><div style="height:6px;border-radius:4px;background:#1F8A5C;width:' + (LOTE.total ? Math.min(100, Math.round(LOTE.feitos / LOTE.total * 100)) : 5) + '%"></div></div><div class="s" style="margin-top:4px">' + (document.hidden ? '<b style="color:#C2413B">Aba em segundo plano: o Chrome deixa mais lento. Volte para esta aba.</b>' : 'Não mexa nesta aba até terminar.') + '</div></div><button id="b5" style="text-align:center">Parar</button>'
        : ((itensSalvos().length && !ficha) || feed ? '<button id="b7" class="pri">📋 Capturar todas as lojas ' + (feed ? 'da busca' : 'da lista' + (nomeLista().total ? ' (' + nomeLista().total + ')' : '')) + '</button><div class="s">' + (feed ? 'Pega a busca inteira com telefone.' : 'Abre loja por loja para pegar o telefone (uns 3 s cada).') + ' No fim abre a conferência no Guia para você marcar quem vai para o discador.</div>' : '')) +
      '<div class="row"><button class="pri" id="b3"' + (cesta.length ? '' : ' disabled') + '>Enviar ' + cesta.length + ' para conferência</button></div>' +
      (cesta.length ? '<button id="b4" class="s" style="text-align:center">Esvaziar cesta</button>' : '')) +
      '</div><div id="av"></div></div>';
    root.getElementById('tg').onclick = function () { aberto = !aberto; render(); };
    var b1 = root.getElementById('b1'); if (b1) b1.onclick = function () { var f = lerFicha(); if (f) adicionar([f]); };
    var b5 = root.getElementById('b5'); if (b5) b5.onclick = function () { LOTE.parar = true; b5.textContent = 'Parando…'; };
    var b7 = root.getElementById('b7'); if (b7) b7.onclick = capturarTudo;
    ligarSelecao();
    var b3 = root.getElementById('b3'); if (b3) b3.onclick = enviar;
    var b4 = root.getElementById('b4'); if (b4) b4.onclick = function () { cesta = []; salvar(); };
  }
  function htmlSelecao() {
    if (SEL.carregando) return '<div><b>Lendo a lista…</b><div class="s">Carregando todas as lojas, só um instante.</div></div>';
    var n = SEL.itens.filter(function (x) { return x.on; }).length;
    return '<div><b>' + SEL.itens.length + ' lojas lidas</b><div class="s">Marque as que vão para o discador.' + (SEL.tipo === 'salva' ? ' O telefone é buscado só das marcadas (uns 3 s cada).' : '') + '</div></div>' +
      '<input id="sf" placeholder="Filtrar por nome ou tipo…" value="' + esc(SEL.filtro) + '">' +
      '<div class="row"><button id="sm">Marcar todas</button><button id="sd">Desmarcar todas</button></div>' +
      '<div class="sl" id="sl">' + htmlItensSel() + '</div>' +
      '<div class="row"><button id="sc" style="text-align:center">Cancelar</button><button class="pri" id="sk"' + (n ? '' : ' disabled') + '>' + (SEL.tipo === 'salva' ? 'Buscar telefone das ' : 'Mandar ') + n + ' marcadas</button></div>';
  }
  function htmlItensSel() {
    var v = selVisiveis();
    if (!v.length) return '<div class="s" style="padding:8px">Nada com esse filtro.</div>';
    return v.map(function (x) {
      var i = SEL.itens.indexOf(x), sem = SEL.tipo === 'busca' && !x.tel;
      return '<label class="si' + (x.on ? ' on' : '') + '"><input type="checkbox" data-i="' + i + '"' + (x.on ? ' checked' : '') + (sem ? ' disabled' : '') + '><span><b>' + esc(x.nome) + '</b><small>' +
        esc([x.categoria, x.tel ? fmt(x.tel) : (SEL.tipo === 'busca' ? 'sem telefone' : ''), x.naCesta ? 'já na cesta' : ''].filter(Boolean).join(' · ')) + '</small></span></label>';
    }).join('');
  }
  function ligarSelecao() {
    if (!SEL.ativo || SEL.carregando) return;
    var lista = root.getElementById('sl');
    function contar() { var n = SEL.itens.filter(function (x) { return x.on; }).length, b = root.getElementById('sk'); if (b) { b.disabled = !n; b.textContent = (SEL.tipo === 'salva' ? 'Buscar telefone das ' : 'Mandar ') + n + ' marcadas'; } }
    function ligarCaixas() { lista.querySelectorAll('input[data-i]').forEach(function (c) { c.onchange = function () { SEL.itens[+c.dataset.i].on = c.checked; c.closest('.si').classList.toggle('on', c.checked); contar(); }; }); }
    ligarCaixas();
    root.getElementById('sf').oninput = function () { SEL.filtro = this.value; lista.innerHTML = htmlItensSel(); ligarCaixas(); };
    root.getElementById('sm').onclick = function () { selVisiveis().forEach(function (x) { if (SEL.tipo !== 'busca' || x.tel) x.on = true; }); lista.innerHTML = htmlItensSel(); ligarCaixas(); contar(); };
    root.getElementById('sd').onclick = function () { selVisiveis().forEach(function (x) { x.on = false; }); lista.innerHTML = htmlItensSel(); ligarCaixas(); contar(); };
    root.getElementById('sc').onclick = function () { SEL = { ativo: false, tipo: '', itens: [], filtro: '' }; render(); };
    root.getElementById('sk').onclick = selConfirmar;
  }
  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(d) { d = dig(d); return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : d.length === 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6) : d; }

  try {
    chrome.storage.local.get(['cesta'], function (r) { cesta = (r && r.cesta) || []; render(); });
    chrome.storage.onChanged.addListener(function (ch) { if (ch.cesta) { cesta = ch.cesta.newValue || []; if (!SEL.ativo) render(); } });
  } catch (e) { render(); }

  // o Maps troca de tela sem recarregar: atualiza o painel quando a URL ou a ficha mudam
  var ultimo = '';
  setInterval(function () {
    var f = lerFicha(), k = location.href + '|' + (f ? f.nome + f.tel : '') + '|' + (document.querySelector('div[role="feed"]') ? lerLista().length : 0);
    if (k !== ultimo && !SEL.ativo) { ultimo = k; render(); }
  }, 1200);
})();
