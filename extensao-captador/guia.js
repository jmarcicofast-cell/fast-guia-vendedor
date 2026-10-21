// Captador FAST — roda no Guia do Vendedor.
// Entrega os contatos captados no Google Maps para a página do guia, que abre a conferência.
(function () {
  var ORIGEM = location.origin;
  var timer = null;

  function entregar() {
    chrome.storage.local.get(['pendente'], function (r) {
      var p = r && r.pendente;
      if (!p || !p.contatos || !p.contatos.length) { parar(); return; }
      window.postMessage({ fonte: 'captador-fast', tipo: 'contatos', dados: p }, ORIGEM);
    });
  }
  function parar() { if (timer) { clearInterval(timer); timer = null; } }
  function iniciar() {
    parar();
    var n = 0;
    entregar();
    // o guia pode ainda estar carregando ou esperando o login: tenta por até 3 minutos
    timer = setInterval(function () { if (++n > 90) parar(); else entregar(); }, 2000);
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window || !ev.data || ev.data.fonte !== 'guia-fast') return;
    if (ev.data.tipo === 'recebido') {
      parar();
      chrome.storage.local.set({ pendente: null, cesta: [] });
    }
  });
  chrome.storage.onChanged.addListener(function (ch) { if (ch.pendente && ch.pendente.newValue) iniciar(); });
  iniciar();
})();
