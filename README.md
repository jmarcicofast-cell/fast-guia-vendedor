# fast-guia-vendedor
## Aviso de versão nova
O guia só avisa "Saiu uma versão nova" quando o campo `versao` de `versao.json` muda. Ao publicar uma mudança no guia que a equipe deve receber, troque `versao` (ex.: 2026-10-21.2) e escreva em `nota` o que mudou, numa frase. Mudanças na extensão ou em outros arquivos não precisam trocar.

## Atacado BA (operação separada)
`atacado-ba.html` é gerado a partir de `guia-vendedor.html` por `python3 ferramentas/gerar-atacado-ba.py`.
Mesma ferramenta, mas com equipe e logins próprios, dados no Firebase em `ba/...` e chaves `fgvba_` no navegador:
nada de pedidos, metas, ligações ou resultados se mistura com o Televendas. Depois de mudar o guia do Televendas,
rode o script de novo para levar a melhoria ao Atacado BA. A diretoria (Poliana) entra nos dois e troca pelo menu.
