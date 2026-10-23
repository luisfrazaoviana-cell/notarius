// Controle financeiro: arrecadação por mês, valores a receber de clientes e
// repasse ao Cartório de Santana (percentual sobre os emolumentos, vence todo dia 5 do mês seguinte).

const Ctl = {
  repasse: e => Math.round((e.emolumentos || 0) * (CFG.repassePct || 0) / 100),

  async dados() {
    const todas = await Reg.todos('escrituras');
    const lavradas = todas.filter(e => e.situacao === 'LAVRADA' && e.dataLavratura && e.emolumentos);
    return { todas, lavradas };
  },

  async render() {
    const { todas, lavradas } = await this.dados();
    if (!$('ctlMes').value) $('ctlMes').value = hojeISO().slice(0, 7);
    const mes = $('ctlMes').value, parc = $('ctlParceiro').value;
    const parcs = [...new Set(todas.map(e => e.parceiro))].sort();
    $('ctlParceiro').innerHTML = '<option value="">Todos os parceiros</option>' + parcs.map(p => `<option ${p === parc ? 'selected' : ''}>${esc(p)}</option>`).join('');
    const filtroP = e => !parc || e.parceiro === parc;
    const doMes = lavradas.filter(e => mesDe(e.dataLavratura) === mes && filtroP(e));
    const soma = (l, f) => l.reduce((s, e) => s + f(e), 0);
    const emolMes = soma(doMes, e => e.emolumentos), repMes = soma(doMes, e => this.repasse(e));
    const aReceber = lavradas.filter(e => !e.recebido && filtroP(e));
    const venc = `${mesSeguinte(mes)}-05`;
    $('ctlKpis').innerHTML = `
      <div class="kpi destaque"><small>Emolumentos de ${nomeMes(mes)}</small><b>R$ ${brl(emolMes)}</b><span>${doMes.length} lavrada(s)</span></div>
      <div class="kpi"><small>Repasse ao Cartório de Santana (${CFG.repassePct}%)</small><b>R$ ${brl(repMes)}</b><span>vence ${dataBR(venc)}${CFG.repassesPagos[mes] ? ' · pago' : ''}</span></div>
      <div class="kpi"><small>Saldo após repasse</small><b>R$ ${brl(emolMes - repMes)}</b><span>${nomeMes(mes)}</span></div>
      <div class="kpi"><small>A receber de clientes</small><b>R$ ${brl(soma(aReceber, e => e.emolumentos))}</b><span>${aReceber.length} escritura(s)</span></div>`;

    $('ctlTabela').innerHTML = `<thead><tr><th>Data</th><th>Parceiro</th><th>Escritura</th><th class="n">Emolumentos</th><th class="n">Repasse</th><th class="n">Saldo</th><th>Cliente</th></tr></thead><tbody>` +
      (doMes.sort((a, b) => a.dataLavratura.localeCompare(b.dataLavratura)).map(e => `<tr class="clic" data-esc="${esc(e.id)}"><td>${dataBR(e.dataLavratura)}</td><td>${esc(e.parceiro)}</td><td>${esc(e.nome)}</td>
        <td class="n">${brl(e.emolumentos)}</td><td class="n">${brl(this.repasse(e))}</td><td class="n">${brl(e.emolumentos - this.repasse(e))}</td>
        <td>${e.recebido ? '<span class="selo pago">PAGO</span>' : '<span class="selo pendente">A RECEBER</span>'}</td></tr>`).join('') ||
        '<tr><td colspan="7" class="vazio">Nenhuma escritura lavrada neste mês.</td></tr>') + '</tbody>';

    // Repasse mês a mês
    const porMes = {};
    lavradas.filter(filtroP).forEach(e => { const m = mesDe(e.dataLavratura); (porMes[m] = porMes[m] || []).push(e); });
    const meses = Object.keys(porMes).sort().reverse().slice(0, 18);
    $('ctlRepasse').innerHTML = `<thead><tr><th>Competência</th><th>Vencimento</th><th class="n">Qtd.</th><th class="n">Repasse</th><th>Situação</th></tr></thead><tbody>` +
      (meses.map(m => {
        const pago = CFG.repassesPagos[m];
        return `<tr><td>${nomeMes(m)}</td><td>${dataBR(mesSeguinte(m) + '-05')}</td><td class="n">${porMes[m].length}</td><td class="n">${brl(soma(porMes[m], e => this.repasse(e)))}</td>
          <td>${pago ? `<span class="selo pago">PAGO ${dataBR(pago)}</span>` : `<button class="peq" data-pagar="${m}">Marcar pago</button>`}</td></tr>`;
      }).join('') || '<tr><td colspan="5" class="vazio">Sem lavraturas com valor.</td></tr>') + '</tbody>';

    $('ctlReceber').innerHTML = aReceber.length ? aReceber.sort((a, b) => a.dataLavratura.localeCompare(b.dataLavratura)).map(e => Esc.itemHTML(e)).join('') : '<div class="vazio">Nada a receber.</div>';
  },

  async exportarCSV() {
    const { lavradas } = await this.dados();
    const cab = ['Parceiro', 'Escritura', 'Situação', 'Outorgado', 'Base de cálculo', 'Código', 'Emolumentos', 'Repasse', 'Saldo', 'Data lavratura', 'Competência', 'Vencimento repasse', 'Recebido', 'Data recebimento'];
    const num = c => c == null ? '' : (c / 100).toFixed(2).replace('.', ',');
    const linhasCsv = lavradas.sort((a, b) => a.dataLavratura.localeCompare(b.dataLavratura)).map(e => [
      e.parceiro, e.nome, e.situacao, e.outorgados, num(e.base), e.codigo, num(e.emolumentos), num(this.repasse(e)), num(e.emolumentos - this.repasse(e)),
      dataBR(e.dataLavratura), nomeMes(mesDe(e.dataLavratura)), dataBR(mesSeguinte(mesDe(e.dataLavratura)) + '-05'), e.recebido ? 'SIM' : 'NÃO', dataBR(e.dataRecebimento)]);
    const csv = [cab, ...linhasCsv].map(l => l.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    baixarBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `NOTARIUS - CONTROLE ${hojeISO()}.csv`);
  },

  iniciar() {
    ['ctlMes', 'ctlParceiro'].forEach(i => $(i).addEventListener('change', () => this.render()));
    $('ctlCsv').onclick = () => this.exportarCSV();
    $('view-controle').addEventListener('click', async ev => {
      const t = ev.target.closest('[data-esc]'); if (t) return Esc.detalhe(t.dataset.esc);
      const p = ev.target.closest('[data-pagar]');
      if (p) {
        const d = await pedir('Repasse pago', `Repasse de ${nomeMes(p.dataset.pagar)} ao Cartório de Santana.`,
          [{ id: 'data', rotulo: 'Data do pagamento', tipo: 'date', valor: hojeISO() }], ['Marcar pago', 'Cancelar']);
        if (!d) return;
        await Reg.salvarCfg({ repassesPagos: { ...CFG.repassesPagos, [p.dataset.pagar]: d.data || hojeISO() } });
        this.render();
      }
    });
  }
};
