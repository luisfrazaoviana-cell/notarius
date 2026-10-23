// Pesquisa no acervo: nos dados das escrituras (partes, selo, livro, folha) e no texto
// dos arquivos do Drive (o Google lê o texto dos PDFs, inclusive escaneados).

const Acv = {
  paiDe: {},   // id da subpasta -> id da escritura (cache)

  async escrituraDoArquivo(arq, porPasta) {
    for (const pai of arq.pais) {
      if (porPasta.has(pai)) return porPasta.get(pai);
      if (this.paiDe[pai] !== undefined) return this.paiDe[pai] && porPasta.get(this.paiDe[pai]);
      try {
        const info = await Nuvem.info(pai);   // subpasta (01..04) -> pasta da escritura
        this.paiDe[pai] = info.pais[0] || null;
        if (porPasta.has(info.pais[0])) return porPasta.get(info.pais[0]);
      } catch { this.paiDe[pai] = null; }
    }
    return null;
  },

  async pesquisar() {
    const termo = $('acvBusca').value.trim();
    if (!termo) return;
    const q = semAcento(termo).toLowerCase(), dig = termo.replace(/\D/g, '');
    const todas = await Reg.todos('escrituras');
    const achadas = todas.filter(r => {
      const t = semAcento([r.nome, r.outorgantes, r.outorgados, r.imovel, r.selo, r.livro, r.folhas, r.parceiro, r.obs, r.natureza].join(' ')).toLowerCase();
      return t.includes(q) || (dig.length >= 4 && t.replace(/\D/g, '').includes(dig));
    });
    $('acvEscrituras').innerHTML = achadas.length ? achadas.map(r => Esc.itemHTML(r)).join('') : '<div class="vazio">Nenhuma escritura com esse termo.</div>';

    $('acvArquivos').innerHTML = '<div class="vazio">Pesquisando no Drive…</div>';
    try {
      // CPF/CNPJ: procura com e sem pontuação.
      const termos = [termo];
      if (dig.length === 11) termos.push(dig, `${dig.slice(0, 3)}.${dig.slice(3, 6)}.${dig.slice(6, 9)}-${dig.slice(9)}`);
      if (dig.length === 14) termos.push(dig, `${dig.slice(0, 2)}.${dig.slice(2, 5)}.${dig.slice(5, 8)}/${dig.slice(8, 12)}-${dig.slice(12)}`);
      const vistos = new Map();
      for (const t of [...new Set(termos)]) for (const f of await Nuvem.buscarTexto(t)) vistos.set(f.id, f);
      const porPasta = new Map(todas.filter(r => r.driveId).map(r => [r.driveId, r]));
      const linhasArq = [];
      for (const f of [...vistos.values()].slice(0, 80)) {
        const e = await this.escrituraDoArquivo(f, porPasta);
        linhasArq.push(`<div class="item"${e ? ` data-esc="${esc(e.id)}"` : ''}><div><div class="t"><a href="${Nuvem.link(f.id)}" target="_blank" rel="noopener">${esc(f.nome)}</a></div>
          <div class="s">${e ? esc(e.parceiro) + ' · ' + esc(e.nome) : 'fora das pastas de escrituras'}</div></div></div>`);
      }
      $('acvArquivos').innerHTML = linhasArq.join('') || '<div class="vazio">Nenhum arquivo com esse texto.</div>';
    } catch (e) { $('acvArquivos').innerHTML = `<div class="aviso">${esc(e.message)}</div>`; }
  },

  iniciar() {
    $('acvBuscar').onclick = () => this.pesquisar();
    $('acvBusca').addEventListener('keydown', ev => { if (ev.key === 'Enter') this.pesquisar(); });
    $('view-acervo').addEventListener('click', ev => {
      if (ev.target.closest('a')) return;
      const it = ev.target.closest('[data-esc]'); if (it) Esc.detalhe(it.dataset.esc);
    });
  }
};
