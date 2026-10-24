// Receitas: (1) orçamentos feitos e ainda não pagos pelos clientes (emolumentos do cartório) e
// (2) honorários do Luis, contratados pelo cliente (em geral o comprador) nos atos dos parceiros e na captação própria.
// Os dois ficam gravados na própria escritura/procuração (e os orçamentos avulsos no registro do orçamento),
// por isso vão para o Drive e aparecem iguais no PC e no celular.

const Rec = {
  aba: 'orc',

  // Valor do orçamento de um ato: a guia completa (ato + certidão + diligências) quando foi feita no app; senão os emolumentos.
  valorOrc: e => e.orcTotal || e.emolumentos || 0,
  partes: e => [e.outorgantes, e.outorgados].filter(Boolean).join(' x ') || e.nome,
  // A pasta do parceiro diz de onde veio o cliente: "LUIS VIANA (CAPTACAO PROPRIA)" é captação própria; as demais, parceiros.
  // Outras pastas podem ser marcadas como captação própria (lista comum entre aparelhos).
  propria: parceiro => /CAPTACAO PROPRIA|CAPTAÇÃO PRÓPRIA/i.test(parceiro || '') || (CFG.pastasProprias || []).includes(parceiro),
  origem: parceiro => Rec.propria(parceiro) ? 'Captação própria' : /^(AVULSO|SEM PASTA|SEM PARCEIRO)/i.test(parceiro || '') ? 'Sem parceiro' : 'Parceiro',

  async dados() {
    const atos = (await Reg.doCartorio('escrituras')).filter(e => /^(MINUTA|LAVRADA)$/.test(e.situacao || ''));
    const orcs = await Reg.doCartorio('orcamentos');
    // Data do orçamento: o mais recente feito no app para o ato.
    const dataOrc = {};
    orcs.forEach(o => { if (o.escId && (!dataOrc[o.escId] || o.data > dataOrc[o.escId])) dataOrc[o.escId] = o.data; });
    const linhasOrc = [
      ...atos.filter(e => this.valorOrc(e) > 0).map(e => ({
        tipo: 'ato', id: e.id, data: dataOrc[e.id] || e.dataLavratura || '', parceiro: e.parceiro, partes: this.partes(e), imovel: e.imovel || '',
        codigo: e.codigo || '', valor: this.valorOrc(e), situacao: e.situacao, pago: !!e.recebido, dataPago: e.dataRecebimento || '', nome: e.nome,
        rep: Ctl.repasse(e) // parte do Cartório de Santana (45% dos emolumentos; procuração 0)
      })),
      // Orçamentos avulsos (sem pasta de escritura).
      ...orcs.filter(o => !o.escId).map(o => ({
        tipo: 'avulso', id: o.id, data: o.data, parceiro: 'AVULSO (SEM PASTA)', partes: o.nome, imovel: o.imovel || '',
        codigo: o.codigo || '', valor: o.total || 0, situacao: 'ORÇAMENTO', pago: !!o.pago, dataPago: o.dataPago || '', nome: o.nome,
        rep: Ctl.repasse({ natureza: 'ESCRITURA', emolumentos: o.totalAto || 0 })
      }))
    ];
    const linhasHon = atos.filter(e => e.honorarios > 0).map(e => ({
      id: e.id, parceiro: e.parceiro, ato: e.nome, natureza: e.natureza || '', contratante: e.honContratante || e.outorgados || '',
      valor: e.honorarios, pago: !!e.honPago, dataPago: e.honData || '', situacao: e.situacao, data: e.dataLavratura || ''
    }));
    return { atos, linhasOrc, linhasHon };
  },

  somar: (l, f = () => true) => l.filter(f).reduce((s, x) => s + x.valor, 0),

  // Para a tela inicial.
  async resumo() {
    const { linhasOrc, linhasHon } = await this.dados();
    const aberto = linhasOrc.filter(x => !x.pago), honAberto = linhasHon.filter(x => !x.pago);
    // Receita futura (pedido do usuário, 24/10/2026): orçamentos em aberto entram como receita a receber; desconta-se o
    // repasse de 45% que irá ao Cartório de Santana e somam-se os honorários a receber = o que fica para o Luis.
    const repFuturo = aberto.reduce((s, x) => s + (x.rep || 0), 0), honAb = this.somar(honAberto);
    return { orcTotal: this.somar(linhasOrc), orcQtd: linhasOrc.length, orcAberto: this.somar(aberto), orcAbertoQtd: aberto.length,
      honTotal: this.somar(linhasHon), honAberto: honAb, honAbertoQtd: honAberto.length, honRecebido: this.somar(linhasHon, x => x.pago),
      repFuturo, futuraLiquida: this.somar(aberto) - repFuturo + honAb };
  },

  /* ------------------------------ Tela ------------------------------ */
  async render() {
    const { atos, linhasOrc, linhasHon } = await this.dados();
    document.querySelectorAll('#recAbas button').forEach(b => b.classList.toggle('ativo', b.dataset.aba === this.aba));
    const linhas = this.aba === 'orc' ? linhasOrc : linhasHon;
    const parcs = [...new Set(linhas.map(x => x.parceiro))].sort();
    const selP = $('recParceiro'), p = selP.value;
    selP.innerHTML = '<option value="">Todos os parceiros</option>' + parcs.map(x => `<option ${x === p ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const sit = $('recSituacao').value, q = semAcento($('recBusca').value).toLowerCase().trim(), org = $('recOrigem').value;
    const filtro = x => (!selP.value || x.parceiro === selP.value) && (!sit || (sit === 'pago') === x.pago) && (!org || this.origem(x.parceiro) === org) &&
      (!q || semAcento([x.partes, x.imovel, x.parceiro, x.contratante, x.ato, x.nome].join(' ')).toLowerCase().includes(q));
    // "Filtro atual" só aparece quando há filtro além do padrão (só a receber).
    const filtrado = !!(selP.value || org || q || sit !== 'aberto');
    const vis = linhas.filter(filtro).sort((a, b) => (a.pago - b.pago) || (b.data || '').localeCompare(a.data || ''));
    const pagoHTML = (x, attr) => x.pago ? `<span class="selo pago">PAGO${x.dataPago ? ' ' + dataBR(x.dataPago) : ''}</span>`
      : `<button class="peq" ${attr}>Marcar pago</button>`;

    if (this.aba === 'orc') {
      // Em destaque só o que está em aberto; os totais gerais ficam recolhidos (abrem ao tocar).
      $('recKpis').innerHTML = `
        <div class="kpi destaque"><small>Em aberto (não pagos)</small><b>R$ ${brl(this.somar(linhasOrc, x => !x.pago))}</b><span>${linhasOrc.filter(x => !x.pago).length} orçamento(s)</span></div>
        ${(() => { const ab = linhasOrc.filter(x => !x.pago), rep = ab.reduce((s, x) => s + (x.rep || 0), 0), hon = this.somar(linhasHon, x => !x.pago);
          return `<div class="kpi"><small>Receita futura (líquida)</small><b>R$ ${brl(this.somar(ab) - rep + hon)}</b><span>em aberto − repasse 45% (R$ ${brl(rep)}) + honorários a receber (R$ ${brl(hon)})</span></div>`; })()}
        ${filtrado ? `<div class="kpi"><small>Filtro atual</small><b>R$ ${brl(this.somar(vis))}</b><span>${vis.length} orçamento(s)</span></div>` : ''}
        <details class="totais"><summary>Ver totais gerais</summary>
          Orçamentos feitos: <b>R$ ${brl(this.somar(linhasOrc))}</b> (${linhasOrc.length}) · Já pagos: <b>R$ ${brl(this.somar(linhasOrc, x => x.pago))}</b> (${linhasOrc.filter(x => x.pago).length})</details>`;
      const ab = linhasOrc.filter(x => !x.pago);
      $('recAcoes').innerHTML = '<button id="recCsv">Exportar planilha (CSV)</button><button id="recProprias">Pastas de captação própria</button>' +
        `<div class="hint" style="flex-basis:100%">Em aberto – <b>parceiros</b>: R$ ${brl(this.somar(ab, x => this.origem(x.parceiro) === 'Parceiro'))} · <b>captação própria</b>: R$ ${brl(this.somar(ab, x => this.propria(x.parceiro)))} · <b>sem parceiro</b>: R$ ${brl(this.somar(ab, x => this.origem(x.parceiro) === 'Sem parceiro'))}</div>`;
      $('recTabela').innerHTML = `<thead><tr><th>Data</th><th>Partes</th><th>Imóvel</th><th>Parceiro</th><th>Ato</th><th class="n">Emolumentos (R$)</th><th>Pagamento</th></tr></thead><tbody>` +
        (vis.map(x => `<tr class="clic" ${x.tipo === 'ato' ? `data-esc="${esc(x.id)}"` : ''}><td>${dataBR(x.data) || '—'}</td><td>${esc(x.partes)}</td><td>${esc(x.imovel)}</td><td>${esc(x.parceiro)}<br><small>${this.origem(x.parceiro)}</small></td>
          <td><span class="selo ${x.situacao === 'LAVRADA' ? 'lavrada' : 'minuta'}">${x.situacao}</span>${x.codigo ? ' cód. ' + esc(x.codigo) : ''}</td>
          <td class="n">${brl(x.valor)}</td><td>${pagoHTML(x, `data-pagar-orc="${esc(x.id)}" data-tipo="${x.tipo}"`)}</td></tr>`).join('') ||
          '<tr><td colspan="7" class="vazio">Nenhum orçamento com esse filtro.</td></tr>') + '</tbody>';
    } else {
      // Resumo por parceiro (quem trouxe o cliente).
      const porParc = {};
      linhasHon.forEach(x => { const r = porParc[x.parceiro] = porParc[x.parceiro] || { t: 0, a: 0, n: 0 }; r.t += x.valor; r.n++; if (!x.pago) r.a += x.valor; });
      $('recKpis').innerHTML = `
        <div class="kpi destaque"><small>A receber</small><b>R$ ${brl(this.somar(linhasHon, x => !x.pago))}</b><span>${linhasHon.filter(x => !x.pago).length} ato(s)</span></div>
        ${filtrado ? `<div class="kpi"><small>Filtro atual</small><b>R$ ${brl(this.somar(vis))}</b><span>${vis.length} ato(s)</span></div>` : ''}
        <details class="totais"><summary>Ver totais gerais</summary>
          Contratados: <b>R$ ${brl(this.somar(linhasHon))}</b> (${linhasHon.length}) · Recebidos: <b>R$ ${brl(this.somar(linhasHon, x => x.pago))}</b> · Captação própria: <b>R$ ${brl(this.somar(linhasHon, x => this.propria(x.parceiro)))}</b> · Parceiros: <b>R$ ${brl(this.somar(linhasHon, x => !this.propria(x.parceiro)))}</b></details>`;
      $('recAcoes').innerHTML = '<button class="prim" id="recLancar">+ Lançar honorário</button><button id="recCsv">Exportar planilha (CSV)</button><button id="recProprias">Pastas de captação própria</button>' +
        (Object.keys(porParc).length ? `<div class="hint" style="flex-basis:100%">${Object.entries(porParc).sort((a, b) => b[1].t - a[1].t).map(([k, r]) => `<b>${esc(k)}</b>: R$ ${brl(r.t)} (${r.n})${r.a ? ' · a receber R$ ' + brl(r.a) : ''}`).join(' &nbsp;|&nbsp; ')}</div>` : '');
      $('recTabela').innerHTML = `<thead><tr><th>Ato</th><th>Parceiro</th><th>Contratante</th><th>Situação</th><th class="n">Honorários (R$)</th><th>Recebimento</th></tr></thead><tbody>` +
        (vis.map(x => `<tr class="clic" data-esc="${esc(x.id)}"><td>${esc(x.ato)}<br><small>${esc(x.natureza)}</small></td><td>${esc(x.parceiro)}<br><small>${this.origem(x.parceiro)}</small></td><td>${esc(x.contratante)}</td>
          <td><span class="selo ${x.situacao === 'LAVRADA' ? 'lavrada' : 'minuta'}">${x.situacao}</span></td><td class="n">${brl(x.valor)}</td>
          <td>${pagoHTML(x, `data-pagar-hon="${esc(x.id)}"`)} <button class="peq" data-editar-hon="${esc(x.id)}">Editar</button></td></tr>`).join('') ||
          `<tr><td colspan="6" class="vazio">${linhasHon.length ? 'Nenhum honorário com esse filtro.' : 'Nenhum honorário lançado ainda. Use "+ Lançar honorário".'}</td></tr>`) + '</tbody>';
    }
    this.ultimo = { atos, vis };
  },

  /* ----------------------------- Ações ----------------------------- */
  async marcarOrcPago(id, tipo) {
    const d = await pedir('Orçamento pago', 'O cliente pagou este orçamento (emolumentos do cartório).',
      [{ id: 'data', rotulo: 'Data do pagamento', tipo: 'date', valor: hojeISO() }], ['Marcar pago', 'Cancelar']);
    if (!d) return;
    if (tipo === 'avulso') {
      const o = await Reg.get('orcamentos', id);
      Object.assign(o, { pago: true, dataPago: d.data || hojeISO() });
      await Reg.salvar('orcamentos', o);
    } else {
      const e = await Reg.get('escrituras', id);
      Object.assign(e, { recebido: true, dataRecebimento: d.data || hojeISO(), valorRecebido: e.valorRecebido || this.valorOrc(e) });
      await Reg.salvar('escrituras', e);
    }
    aviso('Pagamento registrado.');
    App.atualizarTudo();
  },

  // Lançar ou editar honorários de um ato (escritura ou procuração).
  async lancarHon(idPre) {
    const atos = (await Reg.doCartorio('escrituras')).filter(e => /^(MINUTA|LAVRADA)$/.test(e.situacao || ''))
      .sort((a, b) => (a.situacao === 'MINUTA' ? 0 : 1) - (b.situacao === 'MINUTA' ? 0 : 1) || a.nome.localeCompare(b.nome));
    const e0 = idPre ? atos.find(e => e.id === idPre) : null;
    abrirModal(e0 && e0.honorarios ? 'Editar honorários' : 'Lançar honorários', `
      <label class="f">Ato (escritura ou procuração)</label>
      <select id="hnAto">${atos.map(e => `<option value="${esc(e.id)}" ${e0 && e.id === e0.id ? 'selected' : ''}>${e.situacao === 'MINUTA' ? '✎ ' : ''}${esc(e.nome)} (${esc(e.parceiro)})</option>`).join('')}</select>
      <div class="linha2">
        <div><label class="f">Honorários (R$)</label><input id="hnValor" type="text" inputmode="decimal"></div>
        <div><label class="f">Contratante (quem paga)</label><input id="hnContr" type="text"></div>
      </div>
      <div class="checks"><label><input type="checkbox" id="hnPago"> Já recebi</label></div>
      <label class="f">Data do recebimento</label><input id="hnData" type="date">
      <label class="f">Observação</label><input id="hnObs" type="text" placeholder="forma de pagamento, parcelas…">
      <div class="hint">O contratante vem preenchido com o outorgado/comprador, que costuma ser quem contrata.</div>
      <div class="acoes"><button class="prim" id="hnSalvar">Salvar</button>${e0 && e0.honorarios ? '<button id="hnZerar">Remover honorários</button>' : ''}</div>`, () => {
      const preencher = () => {
        const e = atos.find(x => x.id === $('hnAto').value);
        if (!e) return;
        $('hnValor').value = e.honorarios ? brl(e.honorarios) : '';
        $('hnContr').value = e.honContratante || e.outorgados || '';
        $('hnPago').checked = !!e.honPago;
        $('hnData').value = e.honData || '';
        $('hnObs').value = e.honObs || '';
      };
      formatarAoSair($('hnValor'));
      $('hnAto').onchange = preencher; preencher();
      $('hnPago').onchange = () => { if ($('hnPago').checked && !$('hnData').value) $('hnData').value = hojeISO(); };
      $('hnSalvar').onclick = async () => {
        const valor = lerValor($('hnValor').value);
        if (!valor) return aviso('Informe o valor dos honorários.', 'erro');
        const e = await Reg.get('escrituras', $('hnAto').value);
        Object.assign(e, { honorarios: valor, honContratante: $('hnContr').value.trim().toUpperCase(), honPago: $('hnPago').checked,
          honData: $('hnPago').checked ? ($('hnData').value || hojeISO()) : '', honObs: $('hnObs').value.trim() });
        await Reg.salvar('escrituras', e);
        fecharModal(); aviso('Honorários salvos.'); this.aba = 'hon'; App.atualizarTudo();
      };
      if ($('hnZerar')) $('hnZerar').onclick = async () => {
        if (!await confirmar('Remover honorários', 'Tirar os honorários deste ato?', 'Remover', 'Voltar')) return;
        const e = await Reg.get('escrituras', $('hnAto').value);
        Object.assign(e, { honorarios: 0, honPago: false, honData: '' });
        await Reg.salvar('escrituras', e);
        fecharModal(); App.atualizarTudo();
      };
    });
  },

  // Escolher quais pastas são captação própria (as demais contam como parceiros).
  async escolherProprias() {
    const parcs = [...new Set((await Reg.doCartorio('escrituras')).map(e => e.parceiro).filter(Boolean))].sort();
    abrirModal('Captação própria', `<div class="hint" style="margin-bottom:8px">Marque as pastas cujos clientes são seus (captação própria). As outras contam como parceiros.</div>
      <div class="checks">${parcs.map(p => `<label><input type="checkbox" data-propria="${esc(p)}" ${this.propria(p) ? 'checked' : ''} ${/CAPTACAO PROPRIA/i.test(p) ? 'disabled' : ''}> ${esc(p)}</label>`).join('')}</div>
      <div class="acoes"><button class="prim" id="ppSalvar">Salvar</button></div>`, corpo => {
      $('ppSalvar').onclick = async () => {
        const lista = [...corpo.querySelectorAll('[data-propria]')].filter(c => c.checked && !c.disabled).map(c => c.dataset.propria);
        await Reg.salvarCfg({ pastasProprias: lista });
        fecharModal(); aviso('Pastas de captação própria salvas.'); App.atualizarTudo();
      };
    });
  },

  async marcarHonPago(id) {
    const d = await pedir('Honorários recebidos', 'Registrar o recebimento dos seus honorários neste ato.',
      [{ id: 'data', rotulo: 'Data do recebimento', tipo: 'date', valor: hojeISO() }], ['Marcar recebido', 'Cancelar']);
    if (!d) return;
    const e = await Reg.get('escrituras', id);
    Object.assign(e, { honPago: true, honData: d.data || hojeISO() });
    await Reg.salvar('escrituras', e);
    aviso('Recebimento registrado.');
    App.atualizarTudo();
  },

  csv() {
    const { vis } = this.ultimo || { vis: [] };
    const num = c => (c / 100).toFixed(2).replace('.', ',');
    const [cab, lin] = this.aba === 'orc'
      ? [['Data', 'Partes', 'Imóvel', 'Parceiro', 'Situação', 'Código', 'Emolumentos', 'Pago', 'Data do pagamento'],
        vis.map(x => [dataBR(x.data), x.partes, x.imovel, x.parceiro, x.situacao, x.codigo, num(x.valor), x.pago ? 'SIM' : 'NÃO', dataBR(x.dataPago)])]
      : [['Ato', 'Natureza', 'Parceiro', 'Contratante', 'Situação', 'Honorários', 'Recebido', 'Data do recebimento'],
        vis.map(x => [x.ato, x.natureza, x.parceiro, x.contratante, x.situacao, num(x.valor), x.pago ? 'SIM' : 'NÃO', dataBR(x.dataPago)])];
    const txt = [cab, ...lin].map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    baixarBlob(new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' }), `NOTARIUS - ${this.aba === 'orc' ? 'ORCAMENTOS' : 'HONORARIOS'} ${hojeISO()}.csv`);
  },

  iniciar() {
    ['recParceiro', 'recSituacao', 'recBusca', 'recOrigem'].forEach(i => $(i).addEventListener('input', () => this.render()));
    $('view-receitas').addEventListener('click', ev => {
      const t = ev.target;
      if (t.closest('#recAbas button')) { this.aba = t.closest('button').dataset.aba; $('recParceiro').value = ''; return this.render(); }
      if (t.id === 'recLancar') return this.lancarHon();
      if (t.id === 'recCsv') return this.csv();
      if (t.id === 'recProprias') return this.escolherProprias();
      if (t.dataset.pagarOrc) return this.marcarOrcPago(t.dataset.pagarOrc, t.dataset.tipo);
      if (t.dataset.pagarHon) return this.marcarHonPago(t.dataset.pagarHon);
      if (t.dataset.editarHon) return this.lancarHon(t.dataset.editarHon);
      const it = t.closest('[data-esc]'); if (it) Esc.detalhe(it.dataset.esc);
    });
  }
};
