#!/usr/bin/env python3
"""Gera atacado-ba.html a partir de guia-vendedor.html (guia do Televendas).

O Atacado BA é uma operação separada: mesma ferramenta, mas
  - todos os dados no Firebase ficam em ba/... (pedidos, metas, discador, ranking, tudo);
  - o que o navegador guarda usa chaves fgvba_ (não mistura sessão nem preferências);
  - equipe, logins e gestora próprios.
Rode de novo sempre que o guia do Televendas mudar:  python3 ferramentas/gerar-atacado-ba.py
"""
import re, sys, os
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG = os.path.join(RAIZ, 'guia-vendedor.html')
DEST = os.path.join(RAIZ, 'atacado-ba.html')

TV = ['PEDRO', 'WELLINGTON', 'JONATAS', 'ANTONIO', 'GESSICA', 'LETICIA', 'ELIZIANE', 'THALES', 'BREDER', 'VITOR', 'MARIA PRISCILLA']
EQUIPE_BA = ['BRUNO', 'NIVIA']
GESTORA_BA = 'ANACAROLINA'

USUARIOS_BA = """const vendedores = {
  'BRUNO':    { senha: 'BRUNO123', nome: 'Bruno', lider: true,
    meta: 'R$ 0', realizado: 'R$ 0', pedidos: '0', ticket: 'R$ 0', pct: 0,
    obs: 'Bem-vindo, Bruno! Seus dados serão atualizados pela gestão.', credenciais: [] },
  'NIVIA':    { senha: 'NIVIA123', nome: 'Nivia',
    meta: 'R$ 0', realizado: 'R$ 0', pedidos: '0', ticket: 'R$ 0', pct: 0,
    obs: 'Bem-vinda, Nivia! Seus dados serão atualizados pela gestão.', credenciais: [] },
  'ANACAROLINA': { senha: 'ANA123', nome: 'Ana Carolina', tipo: 'gestora',
    meta: 'R$ 0', realizado: 'R$ 0', pedidos: '0', ticket: 'R$ 0', pct: 0,
    obs: 'Bem-vinda, Ana Carolina! Painel da gestão.', credenciais: [] },
  'POLIANA':  { senha: 'POLI123', nome: 'Poliana', tipo: 'gestora', diretoria: true,
    meta: 'R$ 0', realizado: 'R$ 0', pedidos: '0', ticket: 'R$ 0', pct: 0,
    obs: 'Bem-vinda, Poliana! Painel da diretoria.', credenciais: [] },
};"""

def q(n): return "'" + n + "'"

def main():
    s = open(ORIG, encoding='utf-8').read()
    n0 = len(s)
    def rep(a, b, minimo=1):
        nonlocal s
        c = s.count(a)
        if c < minimo: sys.exit('Não achei no guia: ' + a[:80])
        s = s.replace(a, b)

    # 1) usuários: troca o objeto inteiro de vendedores
    i = s.index('const vendedores = {'); j = s.index('\n};', i) + 3
    s = s[:i] + USUARIOS_BA + s[j:]

    # 2) listas da equipe do Televendas -> equipe do BA (lista completa) ou vazia (subconjuntos: novos, quizzes etc.)
    nomes = '|'.join(re.escape(n) for n in TV + ['JULIANA'])
    lista = re.compile(r"\[\s*'(?:%s)'(?:\s*,\s*'(?:%s)')*\s*\]" % (nomes, nomes))
    def troca(m):
        itens = re.findall(r"'([^']+)'", m.group(0))
        tv = [x for x in itens if x in TV]
        out = (EQUIPE_BA if len(tv) >= 6 else []) + ([GESTORA_BA] if 'JULIANA' in itens else [])
        return '[' + ','.join(q(x) for x in out) + ']'
    s = lista.sub(troca, s)
    s = s.replace("var CA_VENDEDORES_LIBERADOS = [];", "var CA_VENDEDORES_LIBERADOS = [" + ",".join(q(x) for x in EQUIPE_BA) + "];")

    # 3) botões e seleções fixos com nomes do Televendas (painéis da gestão)
    for fn in ('adminSelect', 'admTempoSelect'):
        pat = re.compile(r'[ \t]*<button onclick="%s\(\'(%s)\',this\)"[^\n]*</button>\n' % (fn, '|'.join(TV)))
        primeiro = [True]
        def bt(m, fn=fn):
            if not primeiro[0]: return ''
            primeiro[0] = False
            pre = 'abtn' if fn == 'adminSelect' else 'atbtn'
            return ''.join('        <button onclick="%s(\'%s\',this)" class="qf-btn%s" id="%s-%s">%s</button>\n' % (fn, v, ' active' if k == 0 else '', pre, v, v.title()) for k, v in enumerate(EQUIPE_BA))
        s = pat.sub(bt, s)
    s = re.sub(r'[ \t]*<option value="(%s)">[^<]*</option>\n' % '|'.join(TV), '', s)
    for v in TV:
        s = s.replace("adminSelect('%s'," % v, "adminSelect('%s'," % EQUIPE_BA[0])
        s = s.replace("getElementById('abtn-%s')" % v, "getElementById('abtn-%s')" % EQUIPE_BA[0])
    rep("let adminVendedor = 'PEDRO';", "let adminVendedor = '%s';" % EQUIPE_BA[0])

    # 4) gestora principal: Juliana -> Ana Carolina (a diretoria continua com os mesmos poderes via ehDona)
    s = s.replace("'JULIANA'", q(GESTORA_BA)).replace('"JULIANA"', '"%s"' % GESTORA_BA)
    s = s.replace("u === '%s' || !!(u && vendedores[u] && vendedores[u].diretoria)" % GESTORA_BA, "u === '%s' || !!(u && vendedores[u] && vendedores[u].diretoria)" % GESTORA_BA)

    # bases embutidas do Televendas (carteira geral de clientes, metas de produto de set/2026): o BA começa vazio
    i = s.index('var CLI_GERAL_SEED = ['); j = s.index('\n];', i) + 3
    nomes_tv = re.findall(r'nome:\s*"((?:[^"\\]|\\.)*)"|nome:\s*\'((?:[^\'\\]|\\.)*)\'', s[i:j])
    nomes_tv = sorted(set((x[0] or x[1]) for x in nomes_tv if (x[0] or x[1])))
    import json as _json
    s = s[:i] + 'var CLI_GERAL_SEED = []; // Atacado BA: carteira própria, cadastrada pela gestão\n' + \
        '// clientes do Televendas que entraram por engano em ba/clientesGeral (22/10/2026): saem da base do BA uma vez\n' + \
        'var CLI_GERAL_TV_NOMES = ' + _json.dumps(nomes_tv, ensure_ascii=False) + ';' + s[j:]
    # limpeza: a base do BA é só o que o BA cadastrar (pedidos e "+ Adicionar Cliente")
    rep("""  dbRef('clientesGeral').once('value').then(function(snap) {
    if (!snap.val()) {""", """  dbRef('clientesGeral').once('value').then(function(snap) {
    var atual = snap.val() || {}, tv = {}, tirar = {}, n = 0;
    CLI_GERAL_TV_NOMES.forEach(function(nm) { tv[cliChave(nm)] = 1; });
    Object.keys(atual).forEach(function(k) { if (tv[k] || (atual[k] && tv[cliChave(atual[k].nome || '')])) { tirar[k] = null; n++; } });
    if (n) dbRef('clientesGeral').update(tirar);
    if (false) {""")
    i = s.index('const CK_METAS_PRODUTO_SEED = {'); j = s.index('\n};', i) + 3
    s = s[:i] + 'const CK_METAS_PRODUTO_SEED = {}; // Atacado BA: metas definidas na tela' + s[j:]

    # a líder do Televendas tem alguns poderes de gestão: no BA são do vendedor líder
    s = s.replace("'ELIZIANE'", q(EQUIPE_BA[0]))

    # 5) dados separados: Firebase em ba/... e navegador com chaves fgvba_
    rep("      db = firebase.database();",
        "      db = (function(real){ var w = Object.create(real); w.ref = function(p){ p = String(p == null ? '' : p).replace(/^\\/+/, ''); return /^(\\.info|centralAbast)/.test(p) ? real.ref(p) : real.ref(p ? 'ba/' + p : 'ba'); }; w.__real = real; return w; })(firebase.database()); // Atacado BA: tudo em ba/, menos a Central de Abastecimento (interligada)")
    s = s.replace('fgv_', 'fgvba_')

    # 6) troca de operação (diretoria) e login de quem é do Televendas
    rep("var OP_ATUAL = { k: 'tv', nome: 'Televendas' };", "var OP_ATUAL = { k: 'ba', nome: 'Atacado BA' };")
    i = s.index("var OP_OUTRA = {"); j = s.index("};", i) + 2
    s = s[:i] + "var OP_OUTRA = { k: 'tv', nome: 'Televendas', url: 'guia-vendedor.html', logins: [" + ','.join(q(x) for x in TV + ['JULIANA']) + "], equipe: [" + ','.join(q(x) for x in TV if x != 'MARIA PRISCILLA') + "] };" + s[j:]
    rep("if (user === 'MARIA' || user === 'PRISCILLA') user = 'MARIA PRISCILLA';",
        "if (user === 'ANA' || user === 'ANA CAROLINA') user = '%s';" % GESTORA_BA)

    # 7) nomes na tela
    rep('<div class="login-sub">Televendas</div>', '<div class="login-sub">Atacado BA</div>')
    rep("<div class=\"t2\">Televendas</div>", "<div class=\"t2\">Atacado BA</div>")
    rep("<title>Guia do Vendedor</title>", "<title>Guia do Vendedor · Atacado BA</title>")
    s = s.replace('Ranking — Televendas', 'Ranking — Atacado BA').replace('&nbsp;·&nbsp; Televendas</footer>', '&nbsp;·&nbsp; Atacado BA</footer>')
    s = s.replace("var CA_UNIDADE_RIO = 'Televendas';", "var CA_UNIDADE_RIO = 'Atacado BA';")
    # textos que citam a gestora pelo nome (a autoria 'Juliana Marcico' fica como está)
    s = re.sub(r'Juliana(?! Marcico)', 'Ana Carolina', s)

    open(DEST, 'w', encoding='utf-8').write(s)
    print('atacado-ba.html gerado (%d KB)' % (len(s) // 1024))

if __name__ == '__main__':
    main()
