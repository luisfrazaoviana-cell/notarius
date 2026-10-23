// Escrituras: espelham as pastas PARCEIRO/(MINUTA|LAVRADA) - NOME do Drive,
// com os dados de controle (partes, selo, livro, valores, recebimento).

const NATUREZAS = ['ESCRITURA PÚBLICA DE COMPRA E VENDA', 'ESCRITURA PÚBLICA DE INVENTÁRIO E PARTILHA', 'ESCRITURA PÚBLICA DE DIVÓRCIO',
  'ESCRITURA PÚBLICA DE DAÇÃO EM PAGAMENTO', 'ESCRITURA PÚBLICA DE CESSÃO DE DIREITOS', 'ESCRITURA PÚBLICA DE DOAÇÃO',
  'ESCRITURA PÚBLICA DECLARATÓRIA', 'PROCURAÇÃO PÚBLICA', 'ADITAMENTO / RE-RATIFICAÇÃO', 'OUTRA'];

const Esc = {
  parceiros: [],   // [{nome, id}]

  // "IMÓVEL - VENDEDOR x COMPRADOR" -> partes, quando ainda não preenchidas.
  partesDoNome(nomeAto) {
    const i = nomeAto.lastIndexOf(' x ');
    if (i < 0) return {};
    const esq = nomeAto.slice(0, i), j = esq.lastIndexOf(' - ');
    return { imovel: j > 0 ? esq.slice(0, j) : '', outorgantes: j > 0 ? esq.slice(j + 3) : esq, outorgados: nomeAto.slice(i + 3) };
  },

  // Lê as pastas do Drive e atualiza a lista de escrituras.
  async escanear() {
    await Pastas.preparar();
    const pastasParc = (await Nuvem.listar(Pastas.raiz)).filter(f => f.pasta);
    this.parceiros = pastasParc.map(p => ({ nome: p.nome, id: p.id })).sort((a, b) => a.nome.localeCompare(b.nome));
    const existentes = new Map((await DB.todos('escrituras')).map(r => [r.id, r]));
    const vistos = new Set(), mudadas = [];
    for (const p of pastasParc) {
      for (const f of (await Nuvem.listar(p.id)).filter(x => x.pasta)) {
        const m = f.nome.match(RE_ESCRITURA);
        if (!m) continue;
        const id = `${p.nome}/${m[2]}`;
        vistos.add(id);
        const sit = m[1].toUpperCase();
        let r = existentes.get(id);
        if (!r) {
          r = { id, parceiro: p.nome, nome: m[2], natureza: 'ESCRITURA PÚBLICA DE COMPRA E VENDA', ...this.partesDoNome(m[2]), criadoEm: agora() };
        } else if (r.pasta === f.nome && r.driveId === f.id && r.situacao === sit && !r.semPasta) continue;
        Object.assign(r, { pasta: f.nome, driveId: f.id, situacao: sit, parceiroId: p.id, semPasta: false, atualizadoEm: agora() });
        mudadas.push(r);
      }
    }
    for (const r of existentes.values()) if (!vistos.has(r.id) && !r.excluido && !r.semPasta && r.driveId) { r.semPasta = true; r.atualizadoEm = agora(); mudadas.push(r); }
    if (mudadas.length) { await DB.putVarios('escrituras', mudadas); Reg.agendar(); }
    await salvarCfg({ parceirosCache: this.parceiros.map(p => p.nome) });
    return mudadas.length;
  },

  async pastaDe(e) {
    if (e.driveId) return e.driveId;
    await this.escanear();
    const r = await Reg.get('escrituras', e.id);
    if (!r || !r.driveId) throw new Error('A pasta desta escritura não foi encontrada no Drive.');
    return r.driveId;
  },

  async subpasta(e, nomeSub) {
    const id = await this.pastaDe(e);
    return Nuvem.acharOuCriarPasta(nomeSub, id);
  },

  async salvarNaSubpasta(escId, nomeSub, nomeArq, blob) {
    const e = await Reg.get('escrituras', escId);
    const sp = await this.subpasta(e, nomeSub);
    const nomes = new Set((await Nuvem.listar(sp.id)).map(f => f.nome));
    const f = await Nuvem.enviar(sp.id, nomeArq, blob, nomes);
    return f.nome;
  },

  /* ---------------------------- Lista ---------------------------- */
  async render() {
    const todos = (await Reg.todos('escrituras')).sort((a, b) => (b.dataLavratura || '9').localeCompare(a.dataLavratura || '9') || a.nome.localeCompare(b.nome));
    const parcs = [...new Set(todos.map(r => r.parceiro))].sort();
    const sel = $('escParceiro'), atual = sel.value;
    sel.innerHTML = '<option value="">Todos os parceiros</option>' + parcs.map(p => `<option ${p === atual ? 'selected' : ''}>${esc(p)}</option>`).join('');
    const q = semAcento($('escBusca').value).toLowerCase().trim(), sit = $('escSituacao').value;
    const lista = todos.filter(r => (!sel.value || r.parceiro === sel.value) && (!sit || r.situacao === sit) &&
      (!q || semAcento([r.nome, r.outorgantes, r.outorgados, r.imovel, r.selo, r.livro, r.folhas, r.parceiro].join(' ')).toLowerCase().includes(q)));
    $('escResumo').textContent = `${lista.length} de ${todos.length} escrituras · ${todos.filter(r => r.situacao === 'MINUTA').length} minutas · ${todos.filter(r => r.situacao === 'LAVRADA').length} lavradas`;
    $('escLista').innerHTML = lista.length ? lista.map(r => this.itemHTML(r)).join('') : '<div class="vazio">Nenhuma escritura. Use "Atualizar do Drive" ou "+ Nova escritura".</div>';
  },

  itemHTML(r) {
    const recebido = r.situacao === 'LAVRADA' && r.emolumentos ? (r.recebido ? '<span class="selo pago">RECEBIDO</span>' : '<span class="selo pendente">A RECEBER</span>') : '';
    return `<div class="item" data-esc="${esc(r.id)}">
      <div><div class="t">${esc(r.nome)}</div>
        <div class="s"><span class="selo ${r.situacao === 'LAVRADA' ? 'lavrada' : 'minuta'}">${r.situacao || '—'}</span> ${esc(r.parceiro)}${r.dataLavratura ? ' · ' + dataBR(r.dataLavratura) : ''}${r.selo ? ' · selo ' + esc(r.selo) : ''}${r.semPasta ? ' · <b style="color:var(--red)">pasta não encontrada</b>' : ''}</div></div>
      <div class="v">${r.emolumentos ? 'R$ ' + brl(r.emolumentos) : ''}<div>${recebido}</div></div></div>`;
  },

  /* ---------------------------- Nova ---------------------------- */
  nova() {
    const parcs = (this.parceiros.length ? this.parceiros.map(p => p.nome) : CFG.parceirosCache || []);
    abrirModal('Nova escritura', `
      <label class="f">Parceiro (pasta)</label>
      <select id="nvParc">${parcs.map(p => `<option>${esc(p)}</option>`).join('')}<option value="__novo">+ Novo parceiro…</option></select>
      <input id="nvParcNovo" type="text" class="hidden" placeholder="Nome do parceiro (vira MAIÚSCULAS, sem acento)" style="margin-top:6px">
      <label class="f">Natureza</label>
      <select id="nvNat">${NATUREZAS.map(n => `<option>${n}</option>`).join('')}</select>
      <label class="f">Imóvel (curto)</label><input id="nvImovel" type="text" placeholder="LOTE 09 AGUAS DO PARICA">
      <div class="linha2">
        <div><label class="f">Outorgante(s) / vendedor</label><input id="nvA" type="text" placeholder="JOSE E MARIA"></div>
        <div><label class="f">Outorgado(s) / comprador</label><input id="nvB" type="text" placeholder="ANA SOUZA"></div>
      </div>
      <div class="checks"><label><input type="checkbox" id="nvRural"> Imóvel rural</label></div>
      <div class="hint" id="nvPrev"></div>
      <div class="acoes"><button class="prim" id="nvCriar">Criar pasta</button></div>`, corpo => {
      const prev = () => {
        $('nvParcNovo').classList.toggle('hidden', $('nvParc').value !== '__novo');
        $('nvPrev').textContent = 'Pasta: ' + this.nomeNovaPasta();
      };
      corpo.querySelectorAll('input,select').forEach(el => el.addEventListener('input', prev));
      prev();
      $('nvCriar').addEventListener('click', () => this.criar());
    });
  },

  nomeNovaPasta() {
    // Padrão do HD: "MINUTA - IMOVEL - VENDEDOR x COMPRADOR" (o "x" fica minúsculo).
    const esq = [$('nvImovel').value, $('nvA').value].map(s => nomePasta(s)).filter(Boolean).join(' - ');
    return 'MINUTA - ' + nomePasta(esq, 90) + ' x ' + nomePasta($('nvB').value, 50);
  },

  async criar() {
    const b = $('nvCriar'); b.disabled = true;
    try {
      const parceiro = $('nvParc').value === '__novo' ? nomePasta($('nvParcNovo').value) : $('nvParc').value;
      if (!parceiro) throw new Error('Informe o parceiro.');
      if (!$('nvA').value.trim() || !$('nvB').value.trim()) throw new Error('Informe outorgante e outorgado.');
      const nomeFull = this.nomeNovaPasta(), nomeAto = nomeFull.replace(RE_ESCRITURA, '$2');
      await Pastas.preparar();
      const parc = await Nuvem.acharOuCriarPasta(parceiro, Pastas.raiz);
      const irmas = await Nuvem.listar(parc.id);
      const ja = irmas.find(f => f.pasta && f.nome.replace(RE_ESCRITURA, '$2') === nomeAto);
      const pasta = ja || await Nuvem.criarPasta(nomeFull, parc.id);
      if (!ja) for (const s of SUBPASTAS) await Nuvem.criarPasta(s, pasta.id);
      const id = `${parceiro}/${nomeAto}`;
      const rec = { ...(await Reg.get('escrituras', id) || {}), id, parceiro, parceiroId: parc.id, nome: nomeAto, pasta: pasta.nome, driveId: pasta.id,
        situacao: RE_ESCRITURA.exec(pasta.nome)[1].toUpperCase(), natureza: $('nvNat').value, imovel: $('nvImovel').value.trim().toUpperCase(),
        outorgantes: $('nvA').value.trim().toUpperCase(), outorgados: $('nvB').value.trim().toUpperCase(), rural: $('nvRural').checked, criadoEm: agora() };
      await Reg.salvar('escrituras', rec);
      if (!this.parceiros.find(p => p.nome === parceiro)) this.parceiros.push({ nome: parceiro, id: parc.id });
      aviso(ja ? 'Já existia uma pasta deste ato; abri a existente.' : 'Pasta criada com as 4 subpastas.');
      fecharModal();
      App.atualizarTudo();
      this.detalhe(id);
    } catch (e) { aviso(e.message, 'erro'); b.disabled = false; }
  },

  /* ---------------------------- Detalhe ---------------------------- */
  async detalhe(id) {
    const r = await Reg.get('escrituras', id);
    if (!r) return;
    const campo = (k, rot, tipo = 'text', extra = '') => `<div><label class="f">${rot}</label><input id="ed_${k}" type="${tipo}" value="${esc(tipo === 'text' && ['base', 'emolumentos', 'valorRecebido'].includes(k) ? (r[k] ? brl(r[k]) : '') : (r[k] || ''))}" ${extra}></div>`;
    abrirModal(r.nome, `
      <div class="hint" style="margin-bottom:6px"><span class="selo ${r.situacao === 'LAVRADA' ? 'lavrada' : 'minuta'}">${r.situacao}</span> ${esc(r.parceiro)} · <a href="${Nuvem.linkPasta(r.driveId)}" target="_blank" rel="noopener">abrir pasta no Drive</a></div>
      <div class="linha2">
        <div><label class="f">Natureza</label><select id="ed_natureza">${NATUREZAS.map(n => `<option ${n === r.natureza ? 'selected' : ''}>${n}</option>`).join('')}${NATUREZAS.includes(r.natureza) || !r.natureza ? '' : `<option selected>${esc(r.natureza)}</option>`}</select></div>
        ${campo('imovel', 'Imóvel')}
        ${campo('outorgantes', 'Outorgante(s)')}
        ${campo('outorgados', 'Outorgado(s)')}
        ${campo('dataLavratura', 'Data da lavratura', 'date')}
        ${campo('selo', 'Selo digital')}
        ${campo('livro', 'Livro')}
        ${campo('folhas', 'Folha(s)')}
        ${campo('base', 'Base de cálculo (R$)', 'text', 'inputmode="decimal"')}
        ${campo('codigo', 'Código do ato')}
        ${campo('emolumentos', 'Total emolumentos (R$)', 'text', 'inputmode="decimal"')}
        <div class="checks" style="align-self:end"><label><input type="checkbox" id="ed_rural" ${r.rural ? 'checked' : ''}> Imóvel rural</label></div>
      </div>
      <h3>Recebimento</h3>
      <div class="linha2">
        <div class="checks" style="align-self:end"><label><input type="checkbox" id="ed_recebido" ${r.recebido ? 'checked' : ''}> Cliente já pagou</label></div>
        ${campo('dataRecebimento', 'Data do pagamento', 'date')}
        ${campo('valorRecebido', 'Valor recebido (R$)', 'text', 'inputmode="decimal"')}
      </div>
      <label class="f">Observação</label><textarea id="ed_obs">${esc(r.obs || '')}</textarea>
      <div class="acoes">
        <button class="prim" id="edSalvar">Salvar</button>
        ${r.situacao !== 'LAVRADA' ? '<button class="ouro" id="edLavrar">Marcar como LAVRADA</button>' : ''}
        <button id="edOrc">Fazer orçamento</button>
        <button id="edMinuta">Fazer minuta</button>
        <button id="edExcluir" style="margin-left:auto">Tirar da lista</button>
      </div>
      <h3>Documentos</h3>
      <div class="docs" id="edDocs"><div class="vazio">Carregando pastas…</div></div>`, () => {
      ['base', 'emolumentos', 'valorRecebido'].forEach(k => formatarAoSair($('ed_' + k)));
      $('edSalvar').onclick = () => this.salvarDetalhe(id);
      if ($('edLavrar')) $('edLavrar').onclick = () => this.lavrar(id);
      $('edOrc').onclick = () => { fecharModal(); Orc.novo({ escId: id }); };
      $('edMinuta').onclick = () => { fecharModal(); App.ir('ferramentas'); abrirSub('minuta'); minutaDaEscritura(id); };
      $('edExcluir').onclick = async () => {
        if (!await confirmar('Tirar da lista', 'Tirar esta escritura da lista do Notarius? A pasta no Drive não é apagada.')) return;
        await Reg.excluir('escrituras', id); fecharModal(); App.atualizarTudo();
      };
      this.carregarDocs(r);
    });
  },

  async salvarDetalhe(id) {
    const r = await Reg.get('escrituras', id);
    const val = k => $('ed_' + k).value.trim();
    Object.assign(r, {
      natureza: val('natureza'), imovel: val('imovel'), outorgantes: val('outorgantes'), outorgados: val('outorgados'),
      dataLavratura: val('dataLavratura'), selo: val('selo'), livro: val('livro'), folhas: val('folhas'), codigo: val('codigo'),
      base: lerValor(val('base')), emolumentos: lerValor(val('emolumentos')), rural: $('ed_rural').checked,
      recebido: $('ed_recebido').checked, dataRecebimento: val('dataRecebimento'), valorRecebido: lerValor(val('valorRecebido')), obs: val('obs')
    });
    if (r.recebido && !r.dataRecebimento) r.dataRecebimento = hojeISO();
    await Reg.salvar('escrituras', r);
    aviso('Escritura salva.');
    fecharModal();
    App.atualizarTudo();
  },

  // Renomeia a pasta de MINUTA - para LAVRADA - (no Drive; o HD acompanha na próxima sincronização).
  async lavrar(id) {
    const r = await Reg.get('escrituras', id);
    const resp = await pedir('Marcar como LAVRADA', 'A pasta passa de "MINUTA - " para "LAVRADA - ".', [
      { id: 'data', rotulo: 'Data da lavratura', tipo: 'date', valor: r.dataLavratura || hojeISO() },
      { id: 'selo', rotulo: 'Selo digital (pode deixar em branco)', valor: r.selo || '' }], ['Marcar como LAVRADA', 'Cancelar']);
    if (!resp) return;
    try {
      const novo = 'LAVRADA - ' + r.nome;
      await Nuvem.renomear(await this.pastaDe(r), novo);
      Object.assign(r, { situacao: 'LAVRADA', pasta: novo, dataLavratura: resp.data || r.dataLavratura || hojeISO(), selo: resp.selo });
      await Reg.salvar('escrituras', r);
      aviso('Pasta renomeada para LAVRADA.');
      fecharModal(); App.atualizarTudo(); this.detalhe(id);
    } catch (e) { aviso(e.message, 'erro'); }
  },

  async carregarDocs(r) {
    const box = $('edDocs');
    try {
      const pasta = await this.pastaDe(r);
      const subs = (await Nuvem.listar(pasta)).filter(f => f.pasta);
      box.innerHTML = '';
      for (const nomeSub of SUBPASTAS) {
        const sp = subs.find(s => s.nome === nomeSub) || await Nuvem.criarPasta(nomeSub, pasta);
        const arqs = (await Nuvem.listar(sp.id)).filter(f => !f.pasta).sort((a, b) => a.nome.localeCompare(b.nome));
        const div = document.createElement('div');
        div.className = 'docpasta';
        div.innerHTML = `<h4>${nomeSub}<small>${arqs.length}</small></h4>
          <ul>${arqs.map(f => `<li><a href="${Nuvem.link(f.id)}" target="_blank" rel="noopener">${esc(f.nome)}</a></li>`).join('') || '<li class="hint">vazia</li>'}</ul>
          <div class="soltar">Arraste arquivos aqui ou toque para escolher<br><small>fotos e imagens viram PDF</small></div>
          <input type="file" multiple class="hidden" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx">`;
        const zona = div.querySelector('.soltar'), inp = div.querySelector('input');
        zona.onclick = () => inp.click();
        inp.onchange = () => this.enviarDocs(r, sp, [...inp.files]);
        zona.ondragover = ev => { ev.preventDefault(); zona.classList.add('sobre'); };
        zona.ondragleave = () => zona.classList.remove('sobre');
        zona.ondrop = ev => { ev.preventDefault(); zona.classList.remove('sobre'); this.enviarDocs(r, sp, [...ev.dataTransfer.files]); };
        box.appendChild(div);
      }
    } catch (e) { box.innerHTML = `<div class="aviso">${esc(e.message)}</div>`; }
  },

  // Salva os arquivos na subpasta: imagens são convertidas em PDF; PDF e Word vão como estão.
  async enviarDocs(r, sp, arquivos) {
    if (!arquivos.length) return;
    let juntar = null;
    const imagens = arquivos.filter(f => /^image\/(jpeg|png|webp|gif)$/.test(f.type));
    if (imagens.length > 1) juntar = await pedir('Imagens', `Juntar as ${imagens.length} imagens em um único PDF? (ex.: RG frente e verso)`,
      [{ id: 'nome', rotulo: 'Nome do PDF', valor: imagens[0].name.replace(/\.[^.]+$/, '') }], ['Juntar em um PDF', 'Um PDF por imagem']);
    const nomes = new Set((await Nuvem.listar(sp.id)).map(f => f.nome));
    let n = 0, avisos = [];
    try {
      if (juntar) {
        const f = await Nuvem.enviar(sp.id, nomePasta(juntar.nome || 'DOCUMENTOS') + '.pdf', await imagensParaPDF(imagens), nomes);
        nomes.add(f.nome); n++;
      }
      for (const arq of arquivos) {
        if (juntar && imagens.includes(arq)) continue;
        let blob = arq, nomeArq = arq.name;
        if (imagens.includes(arq)) { blob = await imagensParaPDF([arq]); nomeArq = arq.name.replace(/\.[^.]+$/, '') + '.pdf'; }
        else if (/\.(docx?|xlsx?)$/i.test(arq.name)) avisos.push(arq.name);
        else if (/heic|heif/i.test(arq.type + arq.name)) avisos.push(arq.name + ' (HEIC: tire a foto em JPG ou envie pelo celular como "compatível")');
        const f = await Nuvem.enviar(sp.id, nomeArq, blob, nomes);
        nomes.add(f.nome); n++;
      }
      aviso(`${n} arquivo(s) salvo(s) em ${sp.nome}.`);
      if (avisos.length) aviso('Enviados sem converter para PDF: ' + avisos.join(', '), 'erro');
    } catch (e) { aviso(e.message, 'erro'); }
    this.carregarDocs(r);
  },

  /* --------------------- Importar índice do HD --------------------- */
  // Lê "00 - INDICE DAS ESCRITURAS.xlsx" e a aba DETALHE do repasse (cópias no Drive)
  // e preenche só os campos ainda vazios, sem apagar o que foi digitado no app.
  async importarIndice() {
    await carregarScript(LIB.xlsx);
    await Pastas.preparar();
    const raizArqs = await Nuvem.listar(Pastas.raiz);
    const ler = async nome => {
      const f = raizArqs.find(x => x.nome === nome);
      return f ? XLSX.read(await (await Nuvem.baixar(f.id)).arrayBuffer(), { cellDates: true }) : null;
    };
    const idx = await ler('00 - INDICE DAS ESCRITURAS.xlsx');
    const rep = await ler('00 - REPASSE CARTORIO SANTANA - EMOLUMENTOS.xlsx');
    if (!idx && !rep) throw new Error('As planilhas não estão no Drive. Sincronize o HD com o Drive pelo PC primeiro.');
    const paraISO = d => d instanceof Date ? new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : isoDeBR(d);
    const cents = x => x === '' || x == null ? null : Math.round(Number(x) * 100);
    const atual = new Map((await DB.todos('escrituras')).map(r => [r.id, r]));
    const mudadas = new Map();
    const preencher = (id, dados) => {
      const r = mudadas.get(id) || atual.get(id) || { id, criadoEm: agora() };
      let mudou = !atual.has(id);
      for (const [k, v] of Object.entries(dados)) if ((r[k] === undefined || r[k] === '' || r[k] === null) && v !== '' && v != null) { r[k] = v; mudou = true; }
      if (mudou) { r.atualizadoEm = agora(); mudadas.set(id, r); }
    };
    if (idx) {
      for (const l of XLSX.utils.sheet_to_json(idx.Sheets[idx.SheetNames[0]], { defval: '' })) {
        const pasta = String(l['Pasta'] || '').trim(), parc = String(l['Parceiro'] || '').trim();
        if (!pasta || !parc) continue;
        const m = pasta.match(RE_ESCRITURA), nomeAto = m ? m[2] : pasta;
        preencher(`${parc}/${nomeAto}`, {
          parceiro: parc, nome: nomeAto, pasta, situacao: m ? m[1].toUpperCase() : String(l['Situação'] || '').toUpperCase(),
          natureza: l['Natureza'], outorgantes: l['Outorgante(s)'], outorgados: l['Outorgado(s)'], dataLavratura: paraISO(l['Data lavratura']),
          selo: String(l['Selo'] || ''), livro: String(l['Livro'] || ''), folhas: String(l['Folha(s)'] || ''), codigo: String(l['Orçamento cód.'] || ''),
          emolumentos: cents(l['Total emolumentos (R$)']), obs: l['Observação']
        });
      }
    }
    if (rep && rep.Sheets['DETALHE']) {
      for (const l of XLSX.utils.sheet_to_json(rep.Sheets['DETALHE'], { defval: '' })) {
        const nomeAto = String(l['Escritura (pasta)'] || '').trim(), parc = String(l['Parceiro'] || '').trim();
        if (!nomeAto || !parc) continue;
        preencher(`${parc}/${nomeAto}`, { parceiro: parc, nome: nomeAto, base: cents(l['Base de cálculo (R$)']), codigo: String(l['Código do ato'] || ''),
          emolumentos: cents(l['Emolumentos (R$)']), dataLavratura: paraISO(l['Data da lavratura']), situacao: 'LAVRADA' });
      }
    }
    if (mudadas.size) { await DB.putVarios('escrituras', [...mudadas.values()]); Reg.agendar(); }
    return mudadas.size;
  },

  iniciar() {
    ['escBusca', 'escParceiro', 'escSituacao'].forEach(i => $(i).addEventListener('input', () => this.render()));
    $('escLista').addEventListener('click', ev => { const it = ev.target.closest('[data-esc]'); if (it) this.detalhe(it.dataset.esc); });
    $('escNova').onclick = () => this.nova();
    $('escAtualizar').onclick = async () => {
      const b = $('escAtualizar'); b.disabled = true; b.textContent = 'Lendo o Drive…';
      try { const n = await this.escanear(); aviso(n ? `${n} escritura(s) atualizada(s).` : 'Tudo em dia com o Drive.'); App.atualizarTudo(); }
      catch (e) { aviso(e.message, 'erro'); } finally { b.disabled = false; b.textContent = 'Atualizar do Drive'; }
    };
    $('escImportar').onclick = async () => {
      const b = $('escImportar'); b.disabled = true;
      try { const n = await this.importarIndice(); aviso(n ? `${n} escritura(s) completada(s) com o índice.` : 'Nada novo no índice.'); App.atualizarTudo(); }
      catch (e) { aviso(e.message, 'erro'); } finally { b.disabled = false; }
    };
  }
};

// Converte imagens em um PDF A4 (uma imagem por página, centralizada).
async function imagensParaPDF(arquivos) {
  await carregarScript(LIB.jspdf);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  for (let i = 0; i < arquivos.length; i++) {
    const url = URL.createObjectURL(arquivos[i]);
    const img = await new Promise((ok, err) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => err(new Error('Imagem ilegível: ' + arquivos[i].name)); im.src = url; });
    // Reduz fotos muito grandes para o PDF não ficar pesado.
    const esc2 = Math.min(1, 2000 / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * esc2); cv.height = Math.round(img.height * esc2);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(url);
    const paisagem = cv.width > cv.height;
    if (i > 0) doc.addPage('a4', paisagem ? 'l' : 'p'); else if (paisagem) { doc.deletePage(1); doc.addPage('a4', 'l'); }
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), m = 8;
    const k = Math.min((W - 2 * m) / cv.width, (H - 2 * m) / cv.height);
    const w2 = cv.width * k, h2 = cv.height * k;
    doc.addImage(cv.toDataURL('image/jpeg', 0.85), 'JPEG', (W - w2) / 2, (H - h2) / 2, w2, h2);
  }
  return doc.output('blob');
}
