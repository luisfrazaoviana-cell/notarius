// Orçamento no padrão do cartório: Guia de Pagamento – PIX, em uma página,
// com uma única linha de descrição e o valor somado (ato + certidão + diligências + avulsos).

const Orc = {
  calc: null,

  compor() {
    const preco = lerValor($('orcPreco').value) || 0, venal = lerValor($('orcVenal').value) || 0;
    const base = Math.max(preco, venal);
    if (!base) { this.calc = null; $('orcComp').innerHTML = '<div class="vazio">Informe preço ou valor venal.</div>'; return; }
    const perc = 30 * (+$('orcOnus').value + ($('orcRural').checked ? 1 : 0));
    const ato = calcularAto(TAB()?.escComValor, base, perc);
    if (!ato) { this.calc = null; $('orcComp').innerHTML = '<div class="aviso">A tabela deste cartório não tem faixa de escritura com valor declarado para esse valor (Ajustes → Cartório).</div>'; return; }
    const ct = C();
    const itens = [[`Escritura – cód. ${ato.linha.cod}${perc ? ` (+${Math.min(perc, 90)}%)` : ''}`, ato.total]];
    if ($('orcCert').checked && avulsoDe(ct.codCertidao)) itens.push([`Certidão de inteiro teor da matrícula – cód. ${ct.codCertidao}`, totalAvulso(ct.codCertidao)]);
    const dil = Math.max(0, parseInt($('orcDil').value, 10) || 0);
    if (dil && avulsoDe(ct.codDiligencia)) itens.push([`Diligência${dil > 1 ? 's' : ''} – cód. ${ct.codDiligencia} (${dil} ×)`, totalAvulso(ct.codDiligencia, dil)]);
    const outros = lerValor($('orcOutros').value) || 0;
    if (outros) itens.push(['Outros valores', outros]);
    const total = itens.reduce((s, i) => s + i[1], 0);
    this.calc = { base, origem: venal >= preco ? 'Valor Venal' : 'Preço Declarado', ato, itens, total, perc };
    $('orcComp').innerHTML = `<div class="codigo"><div><div class="hint">Código do ato</div><b>${ato.linha.cod}</b></div><small>Base: R$ ${brl(base)} – ${this.calc.origem}<br>Faixa ${ato.linha.desc}</small></div>
      <table class="res">${itens.map(([n, v]) => `<tr><td>${esc(n)}</td><td>R$ ${brl(v)}</td></tr>`).join('')}
      <tr class="total"><td>Total da guia</td><td>R$ ${brl(total)}</td></tr></table>`;
  },

  async novo(pre = {}) {
    App.ir('orcamentos');
    ['orcNome', 'orcCpf', 'orcImovel', 'orcPreco', 'orcVenal', 'orcOutros'].forEach(i => $(i).value = '');
    $('orcOnus').value = pre.onus || 0; $('orcRural').checked = !!pre.rural;
    $('orcCert').checked = true; $('orcDil').value = 1;
    $('orcDesc').value = C().descricaoGuia || ''; $('orcData').value = hojeISO();
    await this.preencherEscrituras();
    $('orcEsc').value = pre.escId || '';
    if (pre.preco) $('orcPreco').value = brl(pre.preco);
    if (pre.escId) await this.daEscritura(pre.escId);
    this.compor();
  },

  async daEscritura(id) {
    const e = await Reg.get('escrituras', id);
    if (!e) return;
    const comprador = String(e.outorgados || '').replace(/^[A-ZÇÃÁÉÍÓÚ ()]+:\s*/i, '');
    if (!$('orcNome').value) $('orcNome').value = comprador;
    if (!$('orcImovel').value) $('orcImovel').value = e.imovel || '';
    if (e.base && !$('orcVenal').value && !$('orcPreco').value) $('orcPreco').value = brl(e.base);
    $('orcRural').checked = !!e.rural;
  },

  async preencherEscrituras() {
    const lista = (await Reg.doCartorio('escrituras')).sort((a, b) => (a.situacao === 'MINUTA' ? 0 : 1) - (b.situacao === 'MINUTA' ? 0 : 1) || a.nome.localeCompare(b.nome));
    const atual = $('orcEsc').value;
    $('orcEsc').innerHTML = '<option value="">— avulso, sem pasta —</option>' +
      lista.map(r => `<option value="${esc(r.id)}">${r.situacao === 'MINUTA' ? '✎ ' : ''}${esc(r.nome)} (${esc(r.parceiro)})</option>`).join('');
    $('orcEsc').value = atual;
  },

  async gerarPDF() {
    if (!this.calc) throw new Error('Informe preço ou valor venal.');
    const nomeInt = $('orcNome').value.trim().toUpperCase();
    if (!nomeInt) throw new Error('Informe o interessado.');
    await Promise.all([carregarScript(LIB.jspdf), carregarScript(LIB.qr)]);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20, ct = C();
    const cor = (ct.cor || '#14284b').match(/\w\w/g).map(h => parseInt(h, 16));
    let y = 18;
    // Timbre: logo à esquerda e o nome completo do cartório como título.
    const logo = await logoDataURL();
    const linhasCab = (ct.cabecalho || ct.nome).split('\n');
    const xTxt = logo ? M + 26 : W / 2, alinh = logo ? 'left' : 'center';
    if (logo) doc.addImage(logo, 'PNG', M, y - 4, 22, 22);
    linhasCab.forEach((l, i) => {
      if (i === 0) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...cor); }
      else if (i === 1) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(196, 154, 58); }
      else { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(40); }
      doc.text(doc.splitTextToSize(l, logo ? W - M - xTxt : W - 2 * M), xTxt, y + 3 + i * 5.5, { align: alinh });
    });
    doc.setTextColor(0);
    y = Math.max(y + 22, y + 3 + linhasCab.length * 5.5) + 2;
    doc.setDrawColor(...cor); doc.setLineWidth(0.7); doc.line(M, y, W - M, y);
    doc.setDrawColor(196, 154, 58); doc.setLineWidth(0.3); doc.line(M, y + 1.2, W - M, y + 1.2); y += 11;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15); doc.text('GUIA DE PAGAMENTO – PIX', W / 2, y, { align: 'center' }); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(ct.tabela === 'PA2026' ? 'Conforme Tabela de Emolumentos 2026 dos Serviços Notariais e de Registro do Estado do Pará'
      : `Conforme ${(CFG.tabelas || {})[ct.tabela]?.nome || 'Tabela de Emolumentos vigente'}`, W / 2, y, { align: 'center' }); y += 11;

    doc.setFontSize(11);
    const campo = (rot, val) => { doc.setFont('helvetica', 'bold'); doc.text(rot, M, y); doc.setFont('helvetica', 'normal'); doc.text(doc.splitTextToSize(val, W - 2 * M - 32), M + 32, y); y += 7; };
    campo('Interessado:', nomeInt);
    if ($('orcCpf').value.trim()) campo('CPF/CNPJ:', $('orcCpf').value.trim());
    if ($('orcImovel').value.trim()) campo('Imóvel:', $('orcImovel').value.trim().toUpperCase());
    y += 4;

    // Tabela CUSTAS E EMOLUMENTOS
    const tw = W - 2 * M;
    doc.setFillColor(...cor); doc.rect(M, y, tw, 8, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.text('CUSTAS E EMOLUMENTOS', W / 2, y + 5.5, { align: 'center' });
    doc.setTextColor(0); y += 8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.rect(M, y, tw, 7); doc.text(`Base de Cálculo: R$ ${brl(this.calc.base)} – ${this.calc.origem}`, M + 3, y + 4.8); y += 7;
    doc.setFillColor(234, 237, 244); doc.rect(M, y, tw, 7, 'FD');
    doc.setFont('helvetica', 'bold'); doc.text('DESCRIÇÃO', M + 3, y + 4.8); doc.text('VALOR', W - M - 3, y + 4.8, { align: 'right' }); y += 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    const desc = doc.splitTextToSize($('orcDesc').value.trim() || ct.descricaoGuia || 'Escritura Pública', tw - 45);
    const h = Math.max(9, desc.length * 5 + 4);
    doc.rect(M, y, tw, h); doc.text(desc, M + 3, y + 6); doc.text('R$ ' + brl(this.calc.total), W - M - 3, y + 6, { align: 'right' }); y += h;
    doc.setFont('helvetica', 'bold'); doc.setFillColor(246, 238, 219); doc.rect(M, y, tw, 9, 'FD');
    doc.text('TOTAL', M + 3, y + 6); doc.text('R$ ' + brl(this.calc.total), W - M - 3, y + 6, { align: 'right' }); y += 18;

    // Dados bancários e QR Code Pix
    const qrTam = 42, qrX = W - M - qrTam;
    doc.setFontSize(11); doc.text('DADOS PARA PAGAMENTO', M, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const yQr = y - 6;
    (ct.banco || 'Dados bancários não informados (Ajustes → Cartório)').split('\n').forEach(l => { doc.text(doc.splitTextToSize(l, qrX - M - 6), M, y); y += 5.5; });
    if (ct.pix) {
      const qr = qrcode(0, 'M'); qr.addData(ct.pix); qr.make();
      const n = qr.getModuleCount(), cel = qrTam / n;
      doc.setFillColor(0);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) doc.rect(qrX + c * cel, yQr + r * cel, cel + 0.02, cel + 0.02, 'F');
      doc.setFontSize(8); doc.text('Pague com Pix (QR Code)', qrX + qrTam / 2, yQr + qrTam + 4, { align: 'center' });
      y = Math.max(y, yQr + qrTam + 8);
    }
    y += 10;
    const [a, m, d] = ($('orcData').value || hojeISO()).split('-').map(Number);
    doc.setFontSize(11); doc.text(`${ct.cidadeData || ''}${ct.cidadeData ? ', ' : ''}${String(d).padStart(2, '0')} de ${MESES_NOME[m - 1]} de ${a}.`, W / 2, y, { align: 'center' });
    return { blob: doc.output('blob'), nome: `ORÇAMENTO COM QRCODE ${nomePasta(ct.siglaArquivo || ct.nome, 40)} - ${nomePasta(nomeInt, 80)}.pdf` };
  },

  async salvar(soBaixar) {
    const b = soBaixar ? $('orcBaixar') : $('orcSalvar'); b.disabled = true;
    try {
      const { blob, nome: nomeArq } = await this.gerarPDF();
      if (soBaixar) { baixarBlob(blob, nomeArq); return; }
      const escId = $('orcEsc').value;
      let arquivo = null;
      if (escId) arquivo = await Esc.salvarNaSubpasta(escId, '04 - ORCAMENTOS', nomeArq, blob);
      else {
        await Pastas.preparar();
        const pasta = await Nuvem.acharOuCriarPasta('ORCAMENTOS AVULSOS', Pastas.app);
        arquivo = (await Nuvem.enviar(pasta.id, nomeArq, blob, new Set((await Nuvem.listar(pasta.id)).map(f => f.nome)))).nome;
      }
      const rec = { id: 'orc-' + agora(), cartorioId: CFG.cartorioAtual, escId, nome: $('orcNome').value.trim().toUpperCase(), cpf: $('orcCpf').value.trim(), imovel: $('orcImovel').value.trim(),
        base: this.calc.base, codigo: this.calc.ato.linha.cod, totalAto: this.calc.ato.total, total: this.calc.total, data: $('orcData').value, arquivo };
      await Reg.salvar('orcamentos', rec);
      if (escId) {
        const e = await Reg.get('escrituras', escId);
        Object.assign(e, { base: rec.base, codigo: rec.codigo, emolumentos: rec.totalAto, orcTotal: rec.total, rural: $('orcRural').checked });
        await Reg.salvar('escrituras', e);
      }
      baixarBlob(blob, nomeArq);
      aviso(escId ? `Orçamento salvo em 04 - ORCAMENTOS (${arquivo}).` : `Orçamento salvo em NOTARIUS/ORCAMENTOS AVULSOS.`);
      App.atualizarTudo();
    } catch (e) { aviso(e.message, 'erro'); } finally { b.disabled = false; }
  },

  async render() {
    await this.preencherEscrituras();
    const lista = (await Reg.doCartorio('orcamentos')).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 30);
    $('orcLista').innerHTML = lista.length ? lista.map(o => `<div class="item"><div><div class="t">${esc(o.nome)}</div>
      <div class="s">${dataBR(o.data)} · cód. ${o.codigo} · base R$ ${brl(o.base)}${o.imovel ? ' · ' + esc(o.imovel) : ''}</div></div>
      <div class="v">R$ ${brl(o.total)}</div></div>`).join('') : '<div class="vazio">Nenhum orçamento ainda.</div>';
  },

  iniciar() {
    ['orcPreco', 'orcVenal', 'orcOutros'].forEach(i => formatarAoSair($(i)));
    ['orcPreco', 'orcVenal', 'orcOutros', 'orcDil', 'orcOnus', 'orcRural', 'orcCert'].forEach(i => $(i).addEventListener('input', () => this.compor()));
    $('orcEsc').addEventListener('change', async () => { await this.daEscritura($('orcEsc').value); this.compor(); });
    $('orcSalvar').onclick = () => this.salvar(false);
    $('orcBaixar').onclick = () => this.salvar(true);
    $('orcDesc').value = C().descricaoGuia || '';
    $('orcData').value = hojeISO();
  }
};
