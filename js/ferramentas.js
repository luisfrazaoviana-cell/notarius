// Calculadora de emolumentos, checklist de documentos e minutas (modelos tradicional e revisado).

function abrirSub(id) {
  document.querySelectorAll('#view-ferramentas .subtabs button').forEach(b => b.classList.toggle('ativo', b.dataset.sub === id));
  document.querySelectorAll('#view-ferramentas .sub').forEach(s => s.classList.toggle('ativo', s.id === 'sub-' + id));
}
document.querySelectorAll('#view-ferramentas .subtabs button').forEach(b => b.addEventListener('click', () => abrirSub(b.dataset.sub)));

/* ------------------------- Calculadora ------------------------- */
const TIPOS = [
  { id: 'escComValor', nome: 'Escritura com valor declarado', tabela: 'Tabela V – I', faixa: true, modal: 'cv' },
  { id: 'escInventario', nome: 'Escritura de inventário, separação ou divórcio com bens', tabela: 'Tabela V – II', faixa: true, modal: 'inventario' },
  { id: 'escSemValor', nome: 'Escritura sem valor declarado', tabela: 'Tabela V – III', faixa: false,
    adicional: { item: '680', cod: '681', label: 'Laudas que acrescerem (ata notarial)' }, excluir: ['681'] },
  { id: 'procuracao', nome: 'Procuração', tabela: 'Tabela V – VII', faixa: false,
    adicional: { cod: '694', label: 'Outorgantes adicionais' }, excluir: ['694'] },
  { id: 'regImovel', nome: 'Registro com valor declarado (Imóveis)', tabela: 'Tabela III – III', faixa: true },
  { id: 'avbComValor', nome: 'Averbação com valor declarado (Imóveis)', tabela: 'Tabela III – XIV', faixa: true },
  { id: 'avbSemValor', nome: 'Averbação sem valor declarado (Imóveis)', tabela: 'Tabela III – XIII', faixa: false },
  { id: 'escMaritimo', nome: 'Escritura – Contratos Marítimos', tabela: 'Tabela IV – IV', faixa: true }
];

// Atos adicionais que podem ser marcados junto com o ato principal (tabela do Pará).
const AVULSOS_PA = [
  { cod: '695', nome: 'Diligência' },
  { cod: '453', nome: 'Certidão de inteiro teor da matrícula (atualizada)' },
  { cod: '456', nome: 'Certidão de inteiro teor com ônus e ações (atualizada)' },
  { cod: '016', nome: 'Certidão de casamento (atualizada – 2ª via)' },
  { cod: '678', nome: 'Certidão de escritura (atualizada)' },
  { cod: '698', nome: 'Certidão de procuração (atualizada)' }
];
// Em tabela importada, os avulsos são os itens do grupo "avulsos" da própria tabela.
const listaAvulsos = () => C().tabela === 'PA2026' ? AVULSOS_PA : (TAB()?.avulsos || []).map(r => ({ cod: r.cod, nome: r.desc }));

function tipoAtual() { return TIPOS.find(t => t.id === $('tipo').value); }
function porCodigo(lista, cod) { return (lista || []).find(r => r.cod === cod); }
function acharFaixa(lista, c) { return lista.find(r => r.de !== null && c >= r.de && (r.ate === null || c <= r.ate)); }

function montarTipos() {
  const tab = TAB();
  const tipos = tab ? TIPOS.filter(t => (tab[t.id] || []).length) : [];
  $('tipo').innerHTML = tipos.map(t => `<option value="${t.id}">${t.nome}${C().tabela === 'PA2026' ? ` (${t.tabela})` : ''}</option>`).join('');
}

function montarAvulsos() {
  const lista = listaAvulsos();
  $('avulsos').innerHTML = lista.map(a => {
    const r = porCodigo(TAB().avulsos, a.cod);
    return `<label class="avulso"><input type="checkbox" id="av_${a.cod}">
      <span>${esc(a.nome)} <small>cód. ${a.cod} – R$ ${brl(r.total)}</small></span>
      <input type="number" id="avq_${a.cod}" min="1" step="1" value="1" title="Quantidade"></label>`;
  }).join('') || '<div class="hint">Esta tabela não tem atos adicionais.</div>';
  lista.forEach(a => {
    $('av_' + a.cod).addEventListener('change', calcular);
    $('avq_' + a.cod).addEventListener('input', () => { if (+$('avq_' + a.cod).value > 0) $('av_' + a.cod).checked = true; calcular(); });
  });
}

function montarItens() {
  const t = tipoAtual();
  if (!t) { ['blocoValor', 'blocoItem', 'blocoQtd', 'detFaixas'].forEach(i => $(i).classList.add('hidden')); return; }
  $('blocoValor').classList.toggle('hidden', !t.faixa);
  $('blocoItem').classList.toggle('hidden', t.faixa);
  if (!t.faixa) {
    const itens = TAB()[t.id].filter(r => !(t.excluir || []).includes(r.cod));
    $('item').innerHTML = itens.map(r => `<option value="${r.cod}">${r.cod} – ${r.desc}</option>`).join('');
  }
  $('qtd').value = 0;
  atualizarQtd();
  montarFaixas(null);
}

function atualizarQtd() {
  const ad = tipoAtual()?.adicional;
  const mostra = ad && (!ad.item || $('item').value === ad.item);
  $('blocoQtd').classList.toggle('hidden', !mostra);
  if (mostra) $('qtdLabel').textContent = ad.label;
}

function montarFaixas(atual) {
  const t = tipoAtual();
  $('detFaixas').classList.toggle('hidden', !t || !t.faixa);
  if (!t || !t.faixa) return;
  $('faixas').innerHTML = '<table><thead><tr><th>Código</th><th>Faixa (R$)</th><th>Emolumentos</th><th>Selo</th><th>ISS</th><th>Total</th></tr></thead><tbody>' +
    TAB()[t.id].map(r => `<tr class="${atual && r.cod === atual.cod ? 'atual' : ''}"><td>${r.cod}</td><td>${r.desc}</td><td>${brl(r.emol)}</td><td>${brl(r.selo)}</td><td>${brl(r.iss)}</td><td>${brl(r.total)}</td></tr>`).join('') +
    '</tbody></table>';
}

let resumoTexto = '';

function calcular() {
  const t = tipoAtual();
  if (!t) { $('saida').innerHTML = '<div class="vazio">A tabela de emolumentos deste cartório ainda não foi importada (Ajustes → Cartório).</div>'; resumoTexto = ''; return; }
  const lista = TAB()[t.id];
  let linha, valor = null;

  if (t.faixa) {
    valor = lerValor($('valor').value);
    if (valor === null) {
      $('saida').innerHTML = '<div class="vazio">Informe o valor para calcular.</div>';
      resumoTexto = ''; montarFaixas(null); return;
    }
    linha = acharFaixa(lista, valor);
    montarFaixas(linha);
  } else {
    linha = porCodigo(lista, $('item').value);
  }
  if (!linha) { $('saida').innerHTML = '<div class="vazio">Nenhuma faixa encontrada.</div>'; return; }

  // 30% por ônus/cláusula resolutiva (até 3) e 30% por imóvel rural; teto de 90%,
  // e o acréscimo nunca ultrapassa o valor dos emolumentos.
  const nOnus = +$('nOnus').value, rural = $('rural').checked;
  const motivos = [];
  if (nOnus) motivos.push(nOnus === 1 ? '1 ônus/cláusula' : `${nOnus} ônus/cláusulas`);
  if (rural) motivos.push('imóvel rural');
  const percBruto = 30 * (nOnus + (rural ? 1 : 0));
  const perc = Math.min(percBruto, 90);

  const emolBase = linha.emol;
  const acresc = Math.min(pct(emolBase, perc), emolBase);
  const emol = emolBase + acresc;
  const fundos = (linha.frc || 0) + (linha.frj || 0);
  const selo = linha.selo;
  const iss = issDe(emol);
  let total = emol + fundos + selo + iss;

  const linhas = [];
  linhas.push(['Emolumentos (tabela)', emolBase]);
  if (perc) linhas.push([`Acréscimo de ${perc}% (${motivos.join(' + ')})`, acresc]);
  if (perc) linhas.push(['Emolumentos com acréscimo', emol]);
  if (linha.frc) linhas.push(['FRC', linha.frc]);
  if (linha.frj) linhas.push(['FRJ', linha.frj]);
  linhas.push(['Selo', selo]);
  linhas.push([`ISS (${C().issPct ?? 5}%)`, iss]);
  linhas.push(['Subtotal do ato', emol + fundos + selo + iss, 'grupo']);

  const ad = t.adicional;
  const qtd = Math.max(0, parseInt($('qtd').value, 10) || 0);
  const adR = ad && porCodigo(lista, ad.cod);
  if (adR && (!ad.item || linha.cod === ad.item) && qtd > 0) {
    const sub = (adR.emol + adR.selo + issDe(adR.emol)) * qtd;
    linhas.push([`${ad.label}: ${qtd} × cód. ${adR.cod} (R$ ${brl(adR.total)})`, sub, 'sub']);
    total += sub;
  }

  let temAvulso = false;
  listaAvulsos().forEach(a => {
    if (!$('av_' + a.cod) || !$('av_' + a.cod).checked) return;
    const q = Math.max(1, parseInt($('avq_' + a.cod).value, 10) || 1);
    const r = porCodigo(TAB().avulsos, a.cod);
    if (!temAvulso) { linhas.push(['Atos adicionais', null, 'grupo']); temAvulso = true; }
    const sub = (r.emol + (r.frc || 0) + (r.frj || 0) + (r.selo || 0) + issDe(r.emol)) * q;
    linhas.push([`${a.nome}: ${q} × cód. ${r.cod} (R$ ${brl(r.total)})`, sub, 'sub']);
    total += sub;
  });

  const faixaTxt = t.faixa && !/^A partir/.test(linha.desc) ? `Faixa ${linha.desc}` : linha.desc;
  const nomeTab = C().tabela === 'PA2026' ? t.tabela : esc(TAB().nome || 'Tabela importada');
  let html = `<div class="codigo"><div><div class="hint">Código</div><b>${linha.cod}</b></div><small>${nomeTab}<br>${faixaTxt}</small></div>`;
  if (t.faixa) html += `<div class="hint" style="margin-bottom:8px">Valor informado: R$ ${brl(valor)}</div>`;
  html += '<table class="res">' + linhas.map(([n, v, cls]) =>
    `<tr class="${cls || ''}"><td>${n}</td><td>${v === null ? '' : 'R$ ' + brl(v)}</td></tr>`).join('') +
    `<tr class="total"><td>Total</td><td>R$ ${brl(total)}</td></tr></table>`;
  if (percBruto > 90) html += `<div class="aviso">Os acréscimos marcados somam ${percBruto}%; foi aplicado o teto de 90%.</div>`;
  if (linha.obs) html += `<div class="aviso">${linha.obs}</div>`;
  $('saida').innerHTML = html;

  resumoTexto = [
    `${C().nome} – ${t.nome} (${nomeTab})`,
    t.faixa ? `Valor: R$ ${brl(valor)}` : null,
    `Código ${linha.cod} – ${faixaTxt}`,
    ...linhas.filter(l => l[1] !== null).map(([n, v]) => `${n}: R$ ${brl(v)}`),
    `TOTAL: R$ ${brl(total)}`
  ].filter(Boolean).join('\n');
}

/* -------------------------- Checklist -------------------------- */
function listaDocumentos(m, imovel, op) {
  const S = [];
  const add = (titulo, itens) => S.push({ titulo, itens: itens.filter(Boolean) });
  if (m === 'procuracao') {
    add('Mandante (quem outorga)', [
      'RG e CPF, ou CNH, originais – o mandante comparece pessoalmente',
      'Estado civil: certidão de nascimento ou de casamento (para procuração que envolva imóvel, atualizada até 90 dias)',
      op.casados && 'Para vender ou gravar imóvel: o cônjuge também outorga ou dá anuência (art. 1.647 do Código Civil), salvo separação total de bens',
      'Comprovante de endereço e profissão',
      op.menor && 'Menor de 16 anos: representado pelos pais; entre 16 e 18 anos: comparece assistido pelos pais'
    ]);
    if (op.pj) add('Pessoa jurídica mandante', [
      'Contrato social ou estatuto consolidado e última alteração', 'Certidão simplificada da JUCEPA (até 30 dias)', 'Cartão CNPJ',
      'Documentos pessoais do sócio administrador que assina'
    ]);
    add('Procurador (não precisa comparecer)', [
      'Nome completo, nacionalidade, estado civil, profissão, RG, CPF e endereço – de preferência cópia dos documentos'
    ]);
    add('Conforme a finalidade', [
      'Imóvel: certidão de inteiro teor da matrícula (para descrever o bem com matrícula e cartório)' + (imovel === 'rural' ? ', CCIR e recibo do CAR' : ''),
      'Previdenciária (INSS): número do benefício (NB) e banco/agência de pagamento; validade máxima de 12 meses (art. 109 da Lei 8.213/1991)',
      'Previdenciária: atestado médico ou declaração do motivo (ausência, doença ou dificuldade de locomoção), exigido pelo INSS para cadastrar o procurador',
      'Bancos: nome do banco, agência e conta, quando os poderes forem para uma conta específica'
    ]);
    add('Se o mandante não souber ou não puder assinar', [
      'Pessoa que assina a rogo: RG e CPF, ou CNH, e endereço (art. 215, § 2º, do Código Civil)',
      'Duas testemunhas: RG e CPF, ou CNH, e endereço'
    ]);
    add('Feito pelo cartório', ['Comunicação à CENSEC (arts. 264 e seguintes do Código Nacional de Normas)']);
    return S;
  }
  const partes = { cv: 'Vendedores e compradores', dacao: 'Devedor e credor', inventario: 'Herdeiros, cônjuge/companheiro sobrevivente e cessionários', divorcio: 'Divorciandos' }[m];
  add(partes + ' (pessoas físicas)', [
    'RG e CPF, ou CNH, originais – de todos os comparecentes e cônjuges',
    'Certidão de nascimento (solteiros) ou de casamento atualizada (até 90 dias), com averbações de divórcio ou óbito, se houver',
    op.casados && 'Pacto antenupcial registrado, se houver; escritura ou declaração de união estável, se for o caso',
    'Comprovante de endereço, profissão, telefone e e-mail',
    'Declaração de pessoa exposta politicamente (feita no ato)'
  ]);
  if (op.pj) add('Pessoa jurídica', [
    'Contrato social ou estatuto consolidado e última alteração', 'Certidão simplificada da JUCEPA (até 30 dias)', 'Cartão CNPJ',
    'Documentos pessoais do sócio administrador ou presentante', 'Certidão Negativa de Débitos federais (RFB/PGFN) da empresa',
    'Distrato social e nomeação do liquidante, se a empresa estiver extinta'
  ]);
  if (op.proc) add('Procurador', [
    'Certidão atualizada da procuração pública (até 30 dias), com poderes específicos para o ato',
    'Substabelecimentos, se houver, com toda a cadeia de poderes', 'RG e CPF, ou CNH, do procurador'
  ]);
  const imv = [
    'Certidão de inteiro teor da matrícula com negativa de ônus e de ações reais e pessoais reipersecutórias (até 30 dias)',
    op.cond && 'Declaração de inexistência de débitos condominiais, assinada pelo síndico (art. 2º, §2º, da Lei 7.433/85)'
  ];
  if (imovel === 'urbano') imv.push(
    'Certidão do cadastro imobiliário municipal com valor venal (CIF, em Ananindeua; espelho do IPTU nos demais municípios)',
    'Certidão negativa de débitos municipais do imóvel (pode ser dispensada pelo adquirente)',
    'Certidão de aforamento/autorização da SPU (CAT) e comprovante de laudêmio, se for terreno de marinha ou foreiro'
  ); else imv.push(
    'CCIR – Certificado de Cadastro de Imóvel Rural (INCRA), do último exercício, quitado',
    'Certidão Negativa de Débitos do ITR (Receita Federal) – últimos 5 exercícios',
    'Recibo de inscrição no CAR – Cadastro Ambiental Rural',
    'Georreferenciamento certificado no SIGEF/INCRA, quando exigível pela área (Decreto 4.449/2002)',
    'Observar a fração mínima de parcelamento (FMP) do município em caso de desmembramento',
    'Se o adquirente for estrangeiro: autorização do INCRA (Lei 5.709/71)'
  );
  add('Imóvel ' + imovel, imv);
  if (m === 'cv') add('Compra e venda', [
    'Preço, data e forma de pagamento (comprovantes de transferência, se houver)',
    'Guia do ITBI (DAM) e comprovante de pagamento – ou declaração do comprador de que apresentará no Registro de Imóveis',
    'Se o vendedor adquiriu por escritura não registrada: certidão dessa escritura'
  ]);
  if (m === 'dacao') add('Dação em pagamento', [
    'Documento da dívida (contrato, título, confissão de dívida) com valor e data',
    'Acordo sobre o valor atribuído ao imóvel e a quitação da dívida',
    'Guia do ITBI (DAM) e comprovante de pagamento – a dação é transmissão onerosa'
  ]);
  if (m === 'inventario') add('Inventário e partilha', [
    'Certidão de óbito do autor da herança', 'RG, CPF e certidão de casamento ou nascimento do autor da herança',
    'Certidões que comprovem o parentesco de cada herdeiro (nascimento ou casamento atualizadas)',
    'Certidão negativa de testamento da CENSEC/RCTO (havendo testamento: decisão judicial que o registrou)',
    'Documentos de todos os bens: imóveis (acima), veículos (CRLV), extratos bancários, quotas sociais',
    'Certidão Negativa de Débitos federais (RFB/PGFN) em nome do autor da herança', 'Certidões negativas de débitos estadual e municipal',
    'Declaração do ITCMD na SEFA/PA e comprovante de pagamento ou de isenção (deve anteceder a lavratura)',
    'Plano de partilha (quinhões de cada herdeiro e meação)', 'Advogado: nome e inscrição na OAB (obrigatório)',
    op.menor && 'Havendo menor ou incapaz: partilha em partes ideais e manifestação favorável do Ministério Público (Resolução CNJ 35/2007, redação da Resolução CNJ 571/2024)'
  ]);
  if (m === 'divorcio') add('Divórcio consensual', [
    'Certidão de casamento atualizada (até 90 dias)', 'Pacto antenupcial registrado, se houver',
    'Certidão de nascimento dos filhos comuns, ou declaração de que não há filhos',
    'Declaração de que a mulher não está grávida ou desconhece a gravidez',
    op.menor && 'Havendo filhos menores ou incapazes: decisão judicial prévia sobre guarda, convivência e alimentos',
    'Acordo sobre nome (manter ou voltar ao de solteira) e alimentos entre os cônjuges',
    'Documentos dos bens a partilhar e plano de partilha',
    'Se houver partilha desigual (excesso de meação): guia e comprovante de ITBI ou ITCMD',
    'Advogado: nome e inscrição na OAB (obrigatório)'
  ]);
  add('Feito pelo cartório', [
    'Consulta à CNIB (Central Nacional de Indisponibilidade de Bens)', 'DOI à Receita Federal e comunicação à CENSEC',
    m === 'inventario' && 'Consulta ao RCTO/CENSEC (testamentos)'
  ]);
  return S;
}

const NOMES_MODAL = { cv: 'Compra e venda', inventario: 'Inventário e partilha', divorcio: 'Divórcio consensual com partilha', dacao: 'Dação em pagamento', procuracao: 'Procuração pública' };
const opcoesChecklist = () => ({ casados: $('cCasados').checked, pj: $('cPJ').checked, proc: $('cProc').checked, cond: $('cCond').checked, menor: $('cMenor').checked });

function montarChecklist() {
  const m = $('cModal').value, imovel = $('cImovel').value;
  const secs = listaDocumentos(m, imovel, opcoesChecklist());
  $('cTitulo').textContent = `Documentos – ${NOMES_MODAL[m]}` + (m === 'procuracao' ? '' : ` – imóvel ${imovel}`);
  $('cLista').innerHTML = secs.map((s, i) => `<div class="chk-sec"><h4>${s.titulo}</h4>` +
    s.itens.map((it, j) => `<label><input type="checkbox" id="ck${i}_${j}"><span>${it}</span></label>`).join('') + '</div>').join('');
}

// Dados comuns do checklist impresso e copiado.
function dadosChecklist() {
  const m = $('cModal').value, imovel = $('cImovel').value, ct = C();
  const [hA, hM, hD] = hojeISO().split('-').map(Number);
  return {
    m, ct, secs: listaDocumentos(m, imovel, opcoesChecklist()),
    ato: NOMES_MODAL[m] + (m === 'procuracao' ? '' : ` – imóvel ${imovel}`),
    cliente: $('cCliente').value.trim().toUpperCase(),
    data: `${ct.cidadeData || ''}${ct.cidadeData ? ', ' : ''}${hD} de ${MESES_NOME[hM - 1]} de ${hA}.`,
    atende: [ct.lavrador, ct.cargo].filter(Boolean).join(' – '),
    contato: ct.contato || ''
  };
}
const AVISO_CHECKLIST = 'Prazos usuais: certidão de matrícula, 30 dias; certidões de registro civil, 90 dias. Traga os documentos originais. A lista pode mudar conforme o caso concreto.';

// Timbre modelo 13 em PDF A4 (jsPDF, mm): faixa azul de borda a borda, selo, linha dourada. ÚNICO modelo para
// todo PDF do app (checklist, orçamento...) – nunca voltar ao cabeçalho antigo (pedido do usuário, 27/10/2026).
// Devolve a função que desenha o timbre (repetir em cada página nova); o texto começa em y = 48 mm.
function timbre13PDF(doc, ct, logo) {
  const W = 210, ME = 30, MD = 20;
  const cor = (ct.cor || '#14284b').match(/\w\w/g).map(h => parseInt(h, 16)), OURO = [196, 154, 58];
  const l = (ct.timbre || ct.cabecalho || ct.nome || '').split('\n').map(s => s.trim()).filter(Boolean);
  const [l1 = '', l2 = '', l3 = '', ...resto] = l;
  const tit = resto.join(' · ').split(/\s+[–-]\s+/);
  const direita = [tit[0], tit.slice(1).join(' – '), ...(ct.endereco || '').split('\n')].map(s => (s || '').trim()).filter(Boolean);
  return () => {
    doc.setFillColor(...cor); doc.rect(0, 0, W, 36, 'F');
    doc.setFillColor(...OURO); doc.rect(0, 36, W, 1.1, 'F');
    let x = ME;
    if (logo) { doc.addImage(logo, 'PNG', ME - 3, 4.5, 27, 27); x = ME + 27; }
    doc.setTextColor(255); doc.setFont('times', 'bold'); doc.setFontSize(15); doc.text(l1, x, 15.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(223, 229, 239); doc.text(l2, x, 21);
    doc.setTextColor(232, 211, 162); doc.text(l3, x, 25.5);
    doc.setFontSize(7.6);
    const larg = Math.max(...direita.map((t, i) => { doc.setFont('helvetica', i ? 'normal' : 'bold'); return doc.getTextWidth(t); }));
    const yIni = 18 - (direita.length - 1) * 2;
    doc.setDrawColor(...OURO); doc.setLineWidth(0.3); doc.line(W - MD - larg - 3, yIni - 3.5, W - MD - larg - 3, yIni + (direita.length - 1) * 4 + 1.5);
    direita.forEach((t, i) => {
      doc.setFont('helvetica', i ? 'normal' : 'bold'); doc.setTextColor(...(i ? [223, 229, 239] : [255, 255, 255]));
      doc.text(t, W - MD, yIni + i * 4, { align: 'right' });
    });
    doc.setTextColor(0);
  };
}

// Checklist em PDF A4 com o timbre das escrituras (modelo 13).
// Cada página nova repete o timbre. Itens com quadradinho para marcar à mão.
async function checklistPDF() {
  await carregarScript(LIB.jspdf);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const D = dadosChecklist(), ct = D.ct, logo = await logoDataURL();
  const W = 210, H = 297, ME = 30, MD = 20, LARG = W - ME - MD;
  const cor = (ct.cor || '#14284b').match(/\w\w/g).map(h => parseInt(h, 16)), OURO = [196, 154, 58];
  const TOPO = 48;
  const timbre = timbre13PDF(doc, ct, logo);
  timbre();
  let y = TOPO;
  const cabe = h => { if (y + h > H - 15) { doc.addPage(); timbre(); y = TOPO; } };
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...cor);
  doc.text('CHECKLIST DE DOCUMENTOS', ME + LARG / 2, y, { align: 'center' }); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...OURO);
  doc.text(D.ato, ME + LARG / 2, y, { align: 'center' }); y += 5;
  if (D.cliente) { doc.setTextColor(60); doc.setFontSize(10); doc.text('Cliente: ' + D.cliente, ME + LARG / 2, y, { align: 'center' }); y += 5; }
  doc.setDrawColor(...OURO); doc.setLineWidth(0.3); doc.line(ME + LARG / 2 - 25, y, ME + LARG / 2 + 25, y); y += 7;
  D.secs.forEach((s, i) => {
    cabe(16);
    doc.setFillColor(234, 237, 244); doc.rect(ME, y - 4.6, LARG, 6.8, 'F');
    doc.setFillColor(...cor); doc.rect(ME, y - 4.6, 1.2, 6.8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...cor);
    doc.text(`${i + 1}. ${s.titulo.toUpperCase()}`, ME + 3.5, y); y += 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30);
    s.itens.forEach(it => {
      const linhas = doc.splitTextToSize(it, LARG - 8);
      cabe(linhas.length * 4.6 + 1.5);
      doc.setDrawColor(...cor); doc.setLineWidth(0.3); doc.rect(ME + 1, y - 3.1, 3.4, 3.4);
      doc.text(linhas, ME + 7.5, y); y += linhas.length * 4.6 + 1.6;
    });
    y += 3;
  });
  const fim = doc.splitTextToSize(AVISO_CHECKLIST, LARG);
  cabe(fim.length * 4 + 30);
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(90); doc.text(fim, ME, y); y += fim.length * 4 + 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30); doc.text(D.data, ME + LARG / 2, y, { align: 'center' }); y += 9;
  if (D.atende) {
    doc.setDrawColor(...OURO); doc.line(ME + LARG / 2 - 35, y - 4, ME + LARG / 2 + 35, y - 4);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...cor); doc.text(D.atende, ME + LARG / 2, y, { align: 'center' }); y += 5;
  }
  if (D.contato) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70); doc.text(D.contato, ME + LARG / 2, y, { align: 'center' }); }
  const nome = `CHECKLIST - ${nomePasta(NOMES_MODAL[D.m], 40)}${D.cliente ? ' - ' + nomePasta(D.cliente, 60) : ''}.pdf`;
  return { blob: doc.output('blob'), nome };
}

// No celular abre a tela de compartilhar (imprimir, WhatsApp, e-mail); no PC baixa o PDF.
async function imprimirChecklist(b) {
  b.disabled = true;
  try {
    const { blob, nome } = await checklistPDF();
    const arq = new File([blob], nome, { type: 'application/pdf' });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [arq] })) {
      try { await navigator.share({ files: [arq], title: nome }); }
      catch (e) { if (e.name !== 'AbortError') baixarBlob(blob, nome); }
    } else baixarBlob(blob, nome);
  } catch (e) { aviso(e.message, 'erro'); } finally { b.disabled = false; }
}

// Cópia com formatação: negrito e itálico do WhatsApp no texto simples e uma versão HTML para e-mail e Word.
function checklistTexto() {
  const D = dadosChecklist(), l = ['*' + (C().timbre || C().nome).split('\n')[0] + '*' + (D.ct.cidadeData ? ' · ' + D.ct.cidadeData : ''),
    '_Checklist de documentos_', '', '*' + D.ato.toUpperCase() + '*'];
  if (D.cliente) l.push('Cliente: ' + D.cliente);
  D.secs.forEach((s, i) => l.push('', `*${i + 1}. ${s.titulo.toUpperCase()}*`, ...s.itens.map(it => '☐ ' + it)));
  l.push('', '_' + AVISO_CHECKLIST + '_', '', D.data);
  if (D.atende) l.push('', '*' + D.atende + '*');
  if (D.contato) l.push(D.contato);
  return l.join('\n');
}
function checklistHTMLCopia() {
  const D = dadosChecklist(), cor = D.ct.cor || '#14284b', t = (C().timbre || C().nome).split('\n')[0];
  return `<div style="font-family:Arial,sans-serif;font-size:11pt;color:#222;max-width:640px">` +
    `<div style="background:${cor};color:#fff;padding:10px 14px;border-bottom:3px solid #c49a3a"><b style="font-family:Georgia,serif;font-size:14pt;letter-spacing:1px">${esc(t)}</b>` +
    `<div style="font-size:9pt;color:#e8d3a2">Checklist de documentos</div></div>` +
    `<p style="margin:10px 0 2px;color:${cor}"><b>${esc(D.ato.toUpperCase())}</b></p>` + (D.cliente ? `<p style="margin:0 0 6px">Cliente: ${esc(D.cliente)}</p>` : '') +
    D.secs.map((s, i) => `<p style="margin:12px 0 4px;background:#eaedf4;border-left:4px solid ${cor};padding:4px 8px;color:${cor}"><b>${i + 1}. ${esc(s.titulo.toUpperCase())}</b></p>` +
      s.itens.map(it => `<div style="margin:3px 0 3px 8px">☐ ${esc(it)}</div>`).join('')).join('') +
    `<p style="font-size:9pt;color:#666;font-style:italic;margin-top:12px">${esc(AVISO_CHECKLIST)}</p><p>${esc(D.data)}</p>` +
    (D.atende ? `<p style="margin:10px 0 0;color:${cor}"><b>${esc(D.atende)}</b></p>` : '') + (D.contato ? `<p style="margin:0;color:#555">${esc(D.contato)}</p>` : '') + '</div>';
}
async function copiarChecklist(b) {
  const txt = checklistTexto(), rotulo = b.textContent;
  try {
    if (!window.ClipboardItem) throw 0;
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([txt], { type: 'text/plain' }), 'text/html': new Blob([checklistHTMLCopia()], { type: 'text/html' }) })]);
    b.textContent = 'Copiado!'; setTimeout(() => b.textContent = rotulo, 1500);
  } catch { copiar(txt, b); }
}

/* ------------------------ Por extenso ------------------------ */
const UN = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
  'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CT = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
function ate999(n) {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100, p = [];
  if (c) p.push(CT[c]);
  if (r && r < 20) p.push(UN[r]);
  else if (r) p.push(r % 10 ? `${DZ[Math.floor(r / 10)]} e ${UN[r % 10]}` : DZ[r / 10]);
  return p.join(' e ');
}
function extensoInt(n) {
  if (n === 0) return 'zero';
  const escalas = [['bilhão', 'bilhões'], ['milhão', 'milhões'], ['mil', 'mil'], ['', '']];
  const grupos = [1e9, 1e6, 1e3, 1].map(d => Math.floor(n / d) % 1000);
  const partes = [];
  grupos.forEach((g, i) => {
    if (!g) return;
    const [s, p] = escalas[i];
    partes.push({ g, t: i === 2 && g === 1 ? 'mil' : ate999(g) + (s ? ' ' + (g === 1 ? s : p) : '') });
  });
  return partes.map((p, i) => i === 0 ? p.t : ((p.g < 100 || p.g % 100 === 0) ? ' e ' : ', ') + p.t).join('');
}
function extensoReais(c) {
  const r = Math.floor(c / 100), ct = c % 100, p = [];
  if (r) p.push(extensoInt(r) + (r % 1e6 === 0 ? ' de reais' : r === 1 ? ' real' : ' reais'));
  if (ct) p.push(extensoInt(ct) + (ct === 1 ? ' centavo' : ' centavos'));
  return p.join(' e ') || 'zero real';
}
function dataExtenso(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  const dia = d === 1 ? 'ao primeiro dia' : `aos ${extensoInt(d)} dias`;
  return `${dia} do mês de ${MESES_NOME[m - 1]} do ano de ${extensoInt(a)} (${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a})`;
}
function dataCurta(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  return `${d === 1 ? '1º' : d} de ${MESES_NOME[m - 1]} de ${a}`;
}

/* --------------------------- Minutas --------------------------- */
// Marcação dos modelos: **negrito**, __negrito sublinhado__, //itálico//, [[vermelho]].
function marcacao(s) {
  return esc(s)
    .replace(/\[\[(.+?)\]\]/g, '<span class="red">$1</span>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<b><u>$1</u></b>')
    .replace(/\/\/(.+?)\/\//g, '<i>$1</i>');
}
// Regra do usuário: o nome das partes fica SEMPRE em negrito, em todo o texto (inclusive dentro da qualificação
// digitada). Nomes já marcados com ** não são marcados de novo.
function negritarNomes(texto) {
  const c = contexto();
  const nomes = [...(c.A?.pessoas || []), ...(c.B?.pessoas || []), ...(c.Fal?.pessoas || [])].map(p => (p.nome || '').trim()).filter(n => n.length >= 5);
  for (const n of nomes.sort((a, b) => b.length - a.length)) {
    // Nome entre aspas (“NOME”, nas certidões) fica sem negrito – pedido do usuário em 24/10/2026.
    const re = new RegExp(`(?<![\\wÀ-ÿ*“])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?![\\wÀ-ÿ*])`, 'gi');
    texto = texto.replace(re, m => `**${m}**`);
  }
  return texto;
}
// Gênero de cada pessoa pelo que vem logo depois do nome na QUALIFICAÇÃO digitada ("brasileira", "portadora",
// "inscrita", "casada"...), nunca pelo nome. Sem pista clara, fica o gênero do grupo.
function generoPessoa(nomeP, qual, gGrupo) {
  const n = (nomeP || '').trim();
  if (!n || !qual) return gGrupo;
  const i = qual.toUpperCase().indexOf(n.toUpperCase());
  if (i < 0) return gGrupo;
  // "de nacionalidade brasileira" vale para homens e mulheres (redação da casa): não indica o gênero.
  const depois = qual.slice(i + n.length, i + n.length + 120).toLowerCase().replace(/nacionalidade\s+(brasileira|estrangeira)/g, 'nacionalidade');
  const fem = depois.match(/\b(brasileira|estrangeira|portadora|inscrita|solteira|casada|viúva|divorciada|separada|aposentada|nascida|residente e domiciliada)\b/);
  const mas = depois.match(/\b(brasileiro|estrangeiro|portador|inscrito|solteiro|casado|viúvo|divorciado|separado|aposentado|nascido|residente e domiciliado)\b/);
  if (fem && (!mas || fem.index < mas.index)) return 'F';
  if (mas) return 'M';
  return gGrupo;
}
const v = id => $(id).value.trim();
const F = (id, rotulo) => v(id) || `[[${rotulo} xxx]]`;
const linhas = id => v(id).split('\n').map(s => s.trim()).filter(Boolean);
function valorB(id, rotulo) {
  const c = lerValor(v(id));
  return c === null ? `**R$** [[${rotulo} xxx]]` : `**R$ ${brl(c)} (${extensoReais(c)})**`;
}
function negrito(rotulo, valor, faltando) { return valor ? `**${rotulo} ${valor}**` : `**${rotulo}** [[${faltando} xxx]]`; }
function romano(n) {
  return [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce((s, [k, r]) => { while (n >= k) { s += r; n -= k; } return s; }, '');
}

// Grupo de partes, com concordância de gênero e número.
// "NOME | papel" ou "EMPRESA | P/P NOME | Vendedora": cada parte depois do nome vira uma linha da assinatura.
function grupo(idNomes, gen, forcarPlural) {
  const pessoas = linhas(idNomes).map(l => { const [nome, ...pap] = l.split('|').map(s => s.trim()); return { nome, papel: pap.filter(Boolean).join('\n') || undefined }; });
  // Grupo marcado "Masculino / misto" mas todas as pessoas são mulheres pela qualificação: o texto concorda no feminino.
  const qual = { m_aNomes: 'm_aQual', m_bNomes: 'm_bQual' }[idNomes];
  if (gen === 'M' && qual && pessoas.length && pessoas.every(p => generoPessoa(p.nome, v(qual), 'M') === 'F')) gen = 'F';
  return { pessoas, pl: forcarPlural || pessoas.length > 1, g: gen };
}
const w = (G, ms, fs, mp, fp) => G.pl ? (G.g === 'F' ? fp : mp) : (G.g === 'F' ? fs : ms);
const vb = (G, s, p) => G.pl ? p : s;
// VENDEDOR -> VENDEDORA/VENDEDORES/VENDEDORAS; HERDEIRO -> HERDEIRA/HERDEIROS/HERDEIRAS.
function nome(base, G) {
  if (base.includes('HERANÇA')) return base;
  const m = base.match(/^(.*?)(OR|O)$/);
  if (!m) return base;
  const [, raiz, fim] = m;
  return raiz + (fim === 'OR' ? w(G, 'OR', 'ORA', 'ORES', 'ORAS') : w(G, 'O', 'A', 'OS', 'AS'));
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const art = { o: G => w(G, 'o', 'a', 'os', 'as'), ao: G => w(G, 'ao', 'à', 'aos', 'às'), pelo: G => w(G, 'pelo', 'pela', 'pelos', 'pelas'), do: G => w(G, 'do', 'da', 'dos', 'das') };
const R = ([G, base]) => `**${nome(base, G)}**`;
function nomesTitulo(G) {
  const n = G.pessoas.map(p => p.nome);
  if (!n.length) return '[[nomes xxx]]';
  return '**' + (n.length > 1 ? n.slice(0, -1).join(', ') + ' E ' + n[n.length - 1] : n[0]).toUpperCase() + '**';
}

function contexto() {
  const m = v('m_modal'), rural = v('m_imovel') === 'rural';
  const c = { m, rural, trad: v('m_modelo') === 'trad' };
  if (m === 'cv') { c.A = grupo('m_aNomes', v('m_aGen')); c.rA = 'VENDEDOR'; c.B = grupo('m_bNomes', v('m_bGen')); c.rB = 'COMPRADOR'; }
  if (m === 'dacao') { c.A = grupo('m_aNomes', v('m_aGen')); c.rA = 'DEVEDOR'; c.B = grupo('m_bNomes', v('m_bGen')); c.rB = 'CREDOR'; }
  if (m === 'inventario') {
    c.A = grupo('m_aNomes', 'M', true); c.rA = 'HERDEIRO';
    c.Fal = { pessoas: [{ nome: v('m_falNome') }], pl: false, g: v('m_falGen') };
    c.rFal = c.Fal.g === 'F' ? 'AUTORA DA HERANÇA' : 'AUTOR DA HERANÇA';
  }
  if (m === 'divorcio') { c.A = grupo('m_aNomes', 'M', true); c.rA = 'DIVORCIANDO'; }
  if (m === 'procuracao') { c.A = grupo('m_aNomes', v('m_aGen')); c.rA = 'MANDANTE'; c.B = grupo('m_bNomes', v('m_bGen')); c.rB = 'MANDATÁRIO'; }
  if (m === 'aditamento' || m === 'rerratificacao') {
    // Partes do ato corrigido, com os papéis que nele ocupam (pela natureza digitada).
    const nat = v('m_adNat'), [rA, rB] = /da[cç][aã]o/i.test(nat) ? ['DEVEDOR', 'CREDOR'] : /doa[cç][aã]o/i.test(nat) ? ['DOADOR', 'DONATÁRIO']
      : /compra|venda/i.test(nat) || !nat ? ['VENDEDOR', 'COMPRADOR'] : ['OUTORGANTE', 'OUTORGADO'];
    c.A = grupo('m_aNomes', v('m_aGen')); c.rA = rA; c.B = grupo('m_bNomes', v('m_bGen')); c.rB = rB;
  }
  c.prop = m === 'inventario' ? [c.Fal, c.rFal] : [c.A, c.rA];
  c.adq = m === 'cv' || m === 'dacao' ? [c.B, c.rB] : [c.A, c.rA];
  // Matrículas: uma por linha, "número | descrição". Mais de uma = texto no plural ("os imóveis").
  const ms = linhas('m_matricula').map(l => { const [n, d] = l.split('|').map(s => s.trim()); return { n, d }; });
  c.im = { ms, pl: ms.length > 1 };
  c.ces = m === 'cv' && $('m_cessao') && $('m_cessao').checked; // venda ao cessionário (modelo da 137)
  c.pres = v('m_aPresenta') && (m === 'cv' || m === 'dacao') ? `, por ${v('m_aPresenta')},` : ''; // empresa: "por seu sócio administrador"
  return c;
}
// Palavra no singular ou no plural conforme o número de imóveis.
const ip = (c, s, p) => c.im.pl ? p : s;
function textoMatriculas(c) {
  const ms = c.im.ms;
  if (ms.length <= 1) return negrito('Matrícula nº', ms[0] && ms[0].n, 'número da matrícula') + (ms[0] && ms[0].d ? ` (${ms[0].d})` : '');
  const it = ms.map((m, i) => `**${i ? '' : 'Matrículas nºs '}${m.n}**` + (m.d ? ` (${m.d})` : ''));
  return it.slice(0, -1).join(', ') + ' e ' + it[it.length - 1];
}
// Imóvel aforado (terreno de marinha, foro municipal etc.): só o domínio útil é objeto da escritura.
function textoAforamento(c) {
  if (!$('m_afor') || !$('m_afor').checked) return '';
  const s = v('m_aforSenhorio'), senh = s ? (/^Uni[aã]o\b/i.test(s) ? 'à ' : 'ao ') + s : 'ao [[senhorio direto xxx]]';
  const cert = F('m_aforCert', 'certidão de quitação de foro e laudêmio');
  if ($('m_cond').checked) return c.trad
    ? ` **OBSERVAÇÃO – DOMÍNIO ÚTIL:** As frações ideais vinculadas às unidades correspondem ao domínio útil do terreno onde está edificado o empreendimento, pertencendo o domínio direto ${senh}, conforme ${cert}.`
    : ` As frações ideais vinculadas às unidades correspondem ao domínio útil do terreno do empreendimento; o domínio direto pertence ${senh}, conforme ${cert}.`;
  return c.trad
    ? ` **OBSERVAÇÃO – DOMÍNIO ÚTIL:** ${ip(c, 'O imóvel é foreiro', 'Os imóveis são foreiros')}, correspondendo o objeto desta escritura ao domínio útil, pertencendo o domínio direto ${senh}, conforme ${cert}.`
    : ` ${ip(c, 'O imóvel é foreiro', 'Os imóveis são foreiros')}: o objeto desta escritura é o domínio útil, e o domínio direto pertence ${senh}, conforme ${cert}.`;
}
// Cadastro municipal por município (preenche os campos; o ITBI de Belém tem texto próprio, aprovado na minuta 137).
const MUNICIPIOS = {
  ananindeua: { mun: 'Ananindeua/PA', sigla: 'CIF', nome: 'Certidão Imobiliária Fiscal – CIF', orgao: 'Secretaria Municipal de Gestão Fazendária de Ananindeua/PA' },
  belem: { mun: 'Belém/PA', sigla: 'Inscrição Imobiliária', nome: 'Certidão de Cadastro Imobiliário', orgao: 'Departamento de Tributos Imobiliários – DETI da Secretaria Municipal de Finanças de Belém/PA',
    itbi: (G, X, trad) => trad
      ? `, sendo ${vb(G, 'contribuinte', 'contribuintes')} ${art.o(G)} ${X}, nos termos do art. 7º, I, do Decreto Municipal nº 67.738/2011, que regulamenta a Lei Municipal nº 8.792/2010, com base de cálculo apurada na forma do art. 8º do mesmo Decreto, devendo a Declaração de Transmissão de Bens Imóveis – DTBI e o recolhimento ser realizados antes do registro, nos termos do art. 2º do Decreto Municipal nº 92.480/2018`
      : ` ${vb(G, 'O contribuinte é', 'Os contribuintes são')} ${art.o(G)} ${X}, nos termos do art. 7º, I, do Decreto Municipal nº 67.738/2011, que regulamenta a Lei Municipal nº 8.792/2010; a base de cálculo é apurada na forma do art. 8º do mesmo Decreto; e a Declaração de Transmissão de Bens Imóveis – DTBI e o recolhimento devem ser realizados antes do registro, nos termos do art. 2º do Decreto Municipal nº 92.480/2018.` }
};
// Sujeito da frase do cadastro ("o apartamento", "as vagas de garagem"): concordância pelo artigo digitado.
function sujeitoCadastro(t) {
  const pl = /^(os|as)\s/i.test(t), f = /^(a|as)\s/i.test(t);
  return { t: cap(t), est: pl ? 'estão' : 'está', cad: pl ? (f ? 'cadastradas' : 'cadastrados') : (f ? 'cadastrada' : 'cadastrado') };
}
// Venda ao cessionário: textos da minuta 137 (aprovada em 27/10/2026), com os dados do caso.
function dadosCessao(c) {
  const ced = v('m_cesCedentes') || '[[cedentes: nomes e CPF xxx]]';
  const negs = v('m_cesNegs') || 'o negócio original e a cessão de direitos';
  return {
    // "declara que, em 2002, alienou..." – o texto pode começar com vírgula
    origem: (/^,/.test(v('m_cesOrigem')) ? '' : ' ') + (v('m_cesOrigem') || '[[o que o vendedor declara sobre a primeira alienação: data, negócio, adquirentes e quitação xxx]]'),
    ced, cederam: /^(o|a)\s/i.test(ced) ? 'cedeu' : 'cederam', virg: ced.includes(',') ? ',' : '',
    obj: v('m_cesObjExtra') ? ', ' + v('m_cesObjExtra') : '',
    instr: v('m_cesInstr') || '[[instrumento da cessão xxx]]', data: F('m_cesData', 'data da cessão'), valor: valorB('m_cesValor', 'valor da cessão'),
    negs, fem: /^a\s/i.test(negs), pagoA: v('m_cesPagoA') || 'aos cedentes',
    quit: v('m_cesQuit') || 'integralmente o preço do negócio descrito no item {{cessao}}', docs: v('m_cesDocs')
  };
}
function itCessao(c) {
  const { A, B } = c, V = R([A, c.rA]), Cp = R([B, c.rB]), d = dadosCessao(c);
  const cess = w(B, 'cessionário', 'cessionária', 'cessionários', 'cessionárias'), tit = vb(A, 'titular registral', 'titulares registrais');
  const sobre = ip(c, 'o imóvel', 'os imóveis');
  if (c.trad) return { k: 'cessao', tt: 'ORIGEM DOS DIREITOS ' + w(B, 'DO', 'DA', 'DOS', 'DAS') + ' ' + nome(c.rB, B), x:
    `${cap(art.o(A))} ${V}${c.pres} ${vb(A, 'declara', 'declaram')} que${d.origem}. Posteriormente, ${d.ced.charAt(0).toLowerCase() + d.ced.slice(1)}${d.virg} ${d.cederam} ${art.ao(B)} ${Cp} todos os direitos sobre ${sobre}${d.obj}, por meio do **${d.instr}** datado de ${d.data}, pelo valor de ${d.valor}. Em razão da referida cessão, ${art.o(A)} ${V}, ${tit}, ${vb(A, 'outorga', 'outorgam')} a presente escritura diretamente ${art.ao(B)} ${Cp}, na qualidade de ${cess}. ` +
    (d.docs ? `${d.docs} ficam arquivados em classificador próprio desta Serventia.` : 'Os instrumentos mencionados neste item ficam arquivados em classificador próprio desta Serventia.') };
  return { k: 'cessao', tr: 'DA ORIGEM DOS DIREITOS ' + w(B, 'DO', 'DA', 'DOS', 'DAS') + ' ' + nome(c.rB, B), x:
    `${cap(art.o(A))} ${V} ${vb(A, 'declara', 'declaram')} que${d.origem}. ${d.ced}${d.virg} ${d.cederam} ${art.ao(B)} ${Cp} todos os direitos sobre ${sobre}${d.obj}, pelo **${d.instr}** de ${d.data}, pelo valor de ${d.valor}. Por isso, ${art.o(A)} ${V}, ${tit}, ${vb(A, 'outorga', 'outorgam')} esta escritura diretamente ${art.ao(B)} ${Cp}, na qualidade de ${cess}.` };
}

/* Itens comuns aos dois modelos */
// Dados que o CNSNR-PA exige na qualificação e que faltam no texto digitado saem em vermelho (aprovado em 24/10/2026):
// pacto antenupcial (art. 255, II) e dados da procuração com a data da certidão de inteiro teor (art. 255, IV).
function pendenciasQual(q) {
  const ex = [];
  if ((/comunh[aã]o universal|separa[cç][aã]o (total|convencional|absoluta)|participa[cç][aã]o final/i.test(q) && !/pacto/i.test(q)) || (/pacto antenupcial/i.test(q) && !/livro/i.test(q)))
    ex.push('[[pacto antenupcial: data, serventia, livro e folhas xxx]]');
  if (/procurador|procuradora|representad[oa] por|\bP\/P\b/i.test(q) && !/certid[aã]o de inteiro teor|traslado/i.test(q))
    ex.push('[[procuração: data, livro, folhas, serventia e data da certidão de inteiro teor, se não for o traslado xxx]]');
  return ex.length ? ' (' + ex.join('; ') + ')' : '';
}
const temCNPJ = id => /CNPJ/i.test(v(id));
function itQualificacao(c, G, base, lado) {
  const outorg = lado === 'A' ? w(G, 'OUTORGANTE', 'OUTORGANTE', 'OUTORGANTES', 'OUTORGANTES') : w(G, 'OUTORGADO', 'OUTORGADA', 'OUTORGADOS', 'OUTORGADAS');
  const rot = nome(base, G), id = lado === 'A' ? 'm_aQual' : 'm_bQual';
  // Qualificação que já traz o "doravante denominada" no meio (empresa presentada por sócio) fica como foi digitada.
  const q = v(id), jaDen = /doravante\s+denominad/i.test(q);
  return {
    tt: `${outorg} / ${rot}`, tr: `${w(G, 'DO', 'DA', 'DOS', 'DAS')} ${outorg} ${rot}`,
    x: (jaDen ? q.replace(/[.\s]+$/, '') + pendenciasQual(q) + '.' : `${F(id, 'qualificação completa')}${pendenciasQual(q)}, doravante ${w(G, 'denominado', 'denominada', 'denominados', 'denominadas')} **${rot}**.`) + (c.trad ? ' Documentos arquivados em classificador próprio desta Serventia.' : '')
  };
}
function itIdentidade(c) {
  return c.trad
    ? { tt: 'IDENTIDADE E CAPACIDADE', x: 'Reconheço a identidade das **PARTES**, sendo as próprias de que trato, mediante os documentos, em originais, que me foram exibidos, os quais ficam arquivados em classificador próprio desta Serventia. Reconheço, ainda, a capacidade jurídica dos **COMPARECENTES**, nos termos do art. 215, §1º, do Código Civil, mediante as perguntas que lhes fiz e as respostas que me foram dadas, estando em perfeito juízo e claro entendimento, segundo o meu parecer, do que **DOU FÉ**.' }
    : { tr: 'DA IDENTIDADE E DA CAPACIDADE DAS PARTES', x: 'Reconheço a identidade dos comparecentes pelos documentos originais que me foram apresentados e a sua capacidade jurídica pelas perguntas que lhes fiz e pelas respostas que obtive, nos termos do art. 215, § 1º, II, do Código Civil. Os documentos apresentados ficam arquivados em classificador próprio desta Serventia. Dou fé.' };
}
function itObjeto(c) {
  const loc = v('m_local');
  const q = loc ? `//“${loc}”//` : '“[[localização do imóvel xxx]]”';
  return c.trad
    ? { k: 'objeto', tt: 'OBJETO', x: `${ip(c, 'O imóvel objeto desta escritura possui', 'Os imóveis objeto desta escritura possuem')} a seguinte qualificação objetiva: ${q}. A qualificação objetiva foi descrita conforme consta ${ip(c, 'da Certidão de Inteiro Teor da matrícula do imóvel, indicada', 'das Certidões de Inteiro Teor das matrículas dos imóveis, indicadas')} no item seguinte, nos termos do §1º, do art. 2, da Lei 7.433/85.` }
    : { k: 'objeto', tr: ip(c, 'DO IMÓVEL', 'DOS IMÓVEIS'), x: `${ip(c, 'O objeto desta escritura é o seguinte imóvel', 'O objeto desta escritura são os seguintes imóveis')}: ${q}. A descrição corresponde ${ip(c, 'à certidão de inteiro teor da matrícula indicada', 'às certidões de inteiro teor das matrículas indicadas')} no item seguinte, na forma do art. 2º, § 1º, da Lei nº 7.433/1985.` };
}
function itTitulo(c) {
  const [G, base] = c.prop, ri = F('m_ri', 'Ofício de Registro de Imóveis');
  const riD = F('m_riData', 'data de expedição da certidão de inteiro teor');
  const mat = textoMatriculas(c), afor = textoAforamento(c);
  const onus = linhas('m_onus'), L = i => String.fromCharCode((c.trad ? 65 : 97) + i);
  let obs = '';
  if (onus.length) {
    obs = ' **OBSERVAÇÃO – ÔNUS NÃO CANCELADOS:** ' + onus.map((o, i) => `**${L(i)})** ${o}`).join('; ') + '.';
    if ($('m_indisp').checked) obs += c.trad
      ? ' As **PARTES** foram expressamente cientificadas da existência das referidas ordens de indisponibilidade, consignando-se a circunstância neste ato, nos termos do parágrafo único do art. 320-F do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial (Provimento CNJ nº 149/2023), estando cientes de que o registro da presente escritura dependerá do prévio cancelamento das indisponibilidades acima descritas.'
      : ' As partes foram expressamente cientificadas da existência dessas ordens de indisponibilidade, circunstância que consigno neste ato, nos termos do parágrafo único do art. 320-F do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial (Provimento CNJ nº 149/2023), e estão cientes de que o registro desta escritura depende do prévio cancelamento dessas indisponibilidades.';
  }
  const arq = ip(c, ' Documento arquivado', ' Documentos arquivados') + ' em classificador próprio desta Serventia.';
  if (c.trad) return { k: 'titulo', tt: 'TÍTULO AQUISITIVO E DISPONIBILIDADE DO BEM',
    x: `${ip(c, 'O imóvel qualificado acima foi havido nos termos descritos da Certidão de Inteiro Teor expedida', 'Os imóveis qualificados acima foram havidos nos termos descritos das Certidões de Inteiro Teor expedidas')} pelo ${ri} em ${riD}, devidamente ${ip(c, 'registrado sob a', 'registrados sob as')} ${mat}, Livro 02 – Registro Geral` +
      (onus.length ? '.' + arq + obs + afor
        : `, estando ${ip(c, 'livre e desimpedido', 'livres e desimpedidos')} de quaisquer ônus reais, pessoais e reipersecutórios.` + afor + arq) };
  const ser = c.m === 'inventario' ? vb(G, 'era', 'eram') : vb(G, 'é', 'são');
  // Venda ao cessionário: o vendedor é "titular" (já alienou os direitos; continua dono no registro).
  const dono = c.ces ? vb(G, 'titular', 'titulares') : w(G, 'proprietário', 'proprietária', 'proprietários', 'proprietárias');
  return { k: 'titulo', tr: 'DO TÍTULO AQUISITIVO E DA DISPONIBILIDADE',
    x: `${cap(art.o(G))} ${R([G, base])} ${ser} ${dono} ${ip(c, 'do imóvel, registrado sob a', 'dos imóveis, registrados sob as')} ${mat}, Livro 2 – Registro Geral, do ${ri}, conforme ${ip(c, 'certidão de inteiro teor expedida', 'certidões de inteiro teor expedidas')} em ${riD}.` +
      (onus.length ? obs : ` ${ip(c, 'O imóvel encontra-se livre e desembaraçado', 'Os imóveis encontram-se livres e desembaraçados')} de quaisquer ônus reais e de ações reais ou pessoais reipersecutórias.`) + afor };
}
function itCadastro(c) {
  const venal = valorB('m_venal', 'valor venal');
  if (!c.rural) {
    const sig = F('m_cadSigla', 'sigla do cadastro'), num = F('m_cadNum', 'número do cadastro'), mun = F('m_municipio', 'município/UF');
    const doc = F('m_cadNome', 'nome do documento fiscal'), org = F('m_cadOrgao', 'órgão expedidor');
    // "sob o CIF" / "sob a Inscrição Imobiliária"; "pela Secretaria" / "pelo Departamento".
    const aS = /^(inscri|matr)/i.test(v('m_cadSigla')) ? 'a' : 'o';
    const pOrg = /^(departamento|setor|servi[cç]o|instituto|n[uú]cleo|centro)/i.test(v('m_cadOrgao')) ? 'pelo' : 'pela';
    // CIB obrigatório nos atos notariais (IN RFB 2.275/2025, art. 5º; LC 214/2025, art. 266) – aprovado em 24/10/2026.
    const cib = `no **Cadastro Imobiliário Brasileiro – CIB** sob o nº ${F('m_cib', 'número do CIB')}`;
    const S = sujeitoCadastro(v('m_cadQual') || ip(c, 'o imóvel', 'os imóveis'));
    // Outros cadastros (ex.: vagas de garagem): uma linha por cadastro, "quem | nº | CIB | valor venal".
    const extras = linhas('m_cadExtra').map(l => {
      const [quem, n, cb, vv] = l.split('|').map(s => (s || '').trim()), E = sujeitoCadastro(quem || 'o outro imóvel'), cv = lerValor(vv || '');
      return ` ${E.t} ${E.est} ${E.cad} sob ${aS} ${sig} nº ${n || '[[número do cadastro xxx]]'} e no CIB sob o nº ${cb || '[[número do CIB xxx]]'}, com ${c.trad ? 'o ' : ''}valor venal de ${cv === null ? '**R$** [[valor venal xxx]]' : `**R$ ${brl(cv)} (${extensoReais(cv)})**`}.`;
    }).join('');
    return c.trad
      ? { tt: 'CADASTRO FISCAL', x: `${S.t} objeto desta Escritura ${S.est} devidamente ${S.cad} junto à Prefeitura Municipal de ${mun}, sob ${aS} ${sig} nº ${num}, e ${cib}, com o valor venal de ${venal}, conforme ${doc}, expedida ${pOrg} ${org}.${extras} Documentos arquivados em classificador próprio desta Serventia.` }
      : { tr: 'DO CADASTRO FISCAL', x: `${S.t} ${S.est} ${S.cad} na Prefeitura Municipal de ${mun} sob ${aS} ${sig} nº ${num} e ${cib}, com valor venal de ${venal}, conforme ${doc} emitida ${pOrg} ${org}.${extras}` };
  }
  const t = `no Instituto Nacional de Colonização e Reforma Agrária – INCRA, conforme **Certificado de Cadastro de Imóvel Rural – CCIR** nº ${F('m_ccir', 'número do CCIR')}, quitado; na Receita Federal do Brasil, sob o **Cadastro Imobiliário Brasileiro – CIB/NIRF** nº ${F('m_nirf', 'número do CIB/NIRF')}, com **Certidão Negativa de Débitos relativos ao Imposto sobre a Propriedade Territorial Rural – ITR** nº ${F('m_itr', 'número da certidão negativa do ITR')}, nos termos do art. 22, §§ 1º e 2º, da Lei nº 4.947/1966 e do art. 21 da Lei nº 9.393/1996; e no **Cadastro Ambiental Rural – CAR** sob o nº ${F('m_car', 'número do CAR')}, nos termos da Lei nº 12.651/2012, com valor atribuído de ${venal}`;
  return c.trad
    ? { tt: 'CADASTRO RURAL', x: `O imóvel rural objeto desta Escritura está devidamente cadastrado ${t}. Documentos arquivados em classificador próprio desta Serventia.` }
    : { tr: 'DO CADASTRO RURAL', x: `O imóvel rural está cadastrado ${t}.` };
}
function itImposto(c) {
  const [G, base] = c.adq, op = v('m_imp');
  const tt = 'IMPOSTO', tr = 'DO IMPOSTO DE TRANSMISSÃO';
  if (op === 'nao_incide') return { tt, tr, x: 'Não incide imposto de transmissão sobre o presente ato, por não haver transmissão onerosa nem excesso de meação.' };
  if (op === 'pendente') {
    let x = `${cap(art.o(G))} ${R([G, base])} ${vb(G, 'declara', 'declaram')} que se ${vb(G, 'responsabiliza', 'responsabilizam')} em apresentar o comprovante de recolhimento do Imposto de Transmissão de Bens Imóveis – ITBI ao Serviço de Registro de Imóveis competente, quando do registro da presente Escritura, nos termos do inc. I, do art. 35, da Lei nº 5.172/66, bem como nos termos do art. 1.227, do Código Civil.`;
    // ITBI no município (Belém) e, na venda ao cessionário, só sobre esta transmissão (textos da minuta 137).
    const mun = (c.m === 'cv' || c.m === 'dacao') && MUNICIPIOS[v('m_munPreset')], itbiMun = mun && mun.itbi ? mun.itbi : null;
    if (c.ces) {
      const d = dadosCessao(c), [GA, bA] = c.prop;
      x += ` O ITBI devido em razão deste ato é exclusivamente o incidente sobre a transmissão ${art.do(GA)} ${R([GA, bA])} ${art.ao(G)} ${R([G, base])}, objeto desta escritura` +
        (itbiMun && c.trad ? itbiMun(G, R([G, base]), true) + '.' : '.' + (itbiMun ? itbiMun(G, R([G, base]), false) : '')) +
        ` ${cap(d.negs)} ${d.fem ? 'descritas' : 'descritos'} no ${c.trad ? 'Item' : 'item'} {{cessao}} não são objeto deste título nem do seu registro.`;
    } else if (itbiMun) x += itbiMun(G, R([G, base]), false);
    return { tt, tr, x };
  }
  const val = valorB('m_impValor', 'valor do ITBI'), bc = valorB('m_impBase', 'base de cálculo'), docs = F('m_impDocs', 'documentos do ITBI (DAM e comprovante)');
  return c.trad
    ? { tt, x: `Foi devidamente recolhido aos cofres da municipalidade competente o Imposto de Transmissão de Bens Imóveis – ITBI, no valor de ${val}, com base de cálculo no valor de ${bc}, nos termos dos seguintes documentos: ${docs}. Documentos arquivados em classificador próprio desta Serventia.` }
    : { tr, x: `Foi recolhido o Imposto de Transmissão de Bens Imóveis – ITBI, no valor de ${val}, sobre a base de cálculo de ${bc}, conforme ${docs}.` };
}
// Certidões APRESENTADAS em nome de cada alienante (aprovado pelo usuário em 24/10/2026, segurança jurídica): ações
// cíveis do TJPA, CNDT do TST, cível do TRF1 e dívida ativa tributária e não tributária da SEFA/PA. As demais seguem
// dispensadas pelo adquirente, "em destaque" (art. 259, IV, do CNSNR). Cada campo: uma linha por alienante, na ordem
// dos nomes, "nº | data | resultado"; o que faltar sai em vermelho.
const SITES_CERTIDOES = [
  { nome: 'TJPA – cíveis', url: 'https://portal-certidao.tjpa.jus.br/' },
  { nome: 'TST – CNDT', url: 'https://cndt-certidao.tst.jus.br/inicio.faces' },
  { nome: 'TRF1 – cível', url: 'https://sistemas.trf1.jus.br/certidao/' },
  { nome: 'SEFA/PA – dívida ativa', url: 'https://app.sefa.pa.gov.br/emissao-certidao/template.action' }
];
// Cada certidão pode ser APRESENTADA (dados em "nº | data | resultado", uma linha por alienante) ou DISPENSADA pelo
// adquirente, sob sua responsabilidade (pedido do usuário, 24/10/2026); a dispensa vai para o parágrafo "em destaque".
const CERTIDOES_VENDEDOR = [
  { id: 'm_certTJ', disp: 'm_dispTJ', tit: 'CERTIDÃO DE AÇÕES CÍVEIS – TJPA', trad: '**Certidão de Ações Cíveis**, expedida pelo Tribunal de Justiça do Estado do Pará – TJPA', rev: 'certidão de ações cíveis do Tribunal de Justiça do Estado do Pará – TJPA' },
  { id: 'm_certTST', disp: 'm_dispTST', tit: 'CERTIDÃO NEGATIVA DE DÉBITOS TRABALHISTAS – CNDT – TST', trad: '**Certidão Negativa de Débitos Trabalhistas – CNDT**, expedida pelo Tribunal Superior do Trabalho – TST, nos termos do inc. V do art. 259 do CNSNR', rev: 'Certidão Negativa de Débitos Trabalhistas – CNDT, do Tribunal Superior do Trabalho (art. 259, V, do CNSNR)' },
  { id: 'm_certTRF', disp: 'm_dispTRF', tit: 'CERTIDÃO DE DISTRIBUIÇÃO CÍVEL – TRF1', trad: '**Certidão de Distribuição Cível da Justiça Federal**, expedida pelo Tribunal Regional Federal da 1ª Região – TRF1', rev: 'certidão de distribuição cível do Tribunal Regional Federal da 1ª Região – TRF1' },
  { id: 'm_certSEFA', disp: 'm_dispSEFA', pl: true, tit: 'CERTIDÕES DE DÍVIDA ATIVA TRIBUTÁRIA E NÃO TRIBUTÁRIA – SEFA/PA', trad: '**Certidões de Dívida Ativa Tributária e Não Tributária**, expedidas pela Secretaria de Estado da Fazenda do Pará – SEFA/PA', rev: 'certidões de dívida ativa tributária e não tributária da Secretaria de Estado da Fazenda do Pará – SEFA/PA' }
];
const certDispensada = ct => !!($(ct.disp) && $(ct.disp).checked);
function itCertidoes(c) {
  const [GA, baseA] = c.prop, [G, base] = c.adq, trad = c.trad;
  const pessoas = GA.pessoas.length ? GA.pessoas : [{ nome: '' }];
  let positiva = false;
  const L = i => String.fromCharCode((trad ? 65 : 97) + i);
  // Formato do usuário (24/10/2026), uma entrada por certidão e por vendedor:
  // CERTIDÃO DE AÇÕES CÍVEIS – TJPA, emitida em xxx, sob o nº xxx, em favor do “NOME DO VENDEDOR”.
  // "do/da" pelo gênero da pessoa na qualificação; nome entre aspas e SEM negrito (só aqui).
  const blocos = [];
  CERTIDOES_VENDEDOR.filter(ct => !certDispensada(ct)).forEach(ct => {
    const lns = linhas(ct.id);
    pessoas.forEach((p, i) => {
      const [num, data, res] = (lns[i] || '').split('|').map(s => (s || '').trim());
      const N = num || '[[nº da certidão xxx]]', D = data || '[[data de emissão xxx]]', Rs = (res || '').toUpperCase();
      if (/POSITIV/.test(Rs) && !/EFEITO/.test(Rs)) positiva = true;
      const res2 = /POSITIV/.test(Rs) ? `, com resultado ${/EFEITO/.test(Rs) ? 'POSITIVO COM EFEITO DE NEGATIVA' : 'POSITIVO'}` : '';
      const fem = generoPessoa(p.nome, v('m_aQual'), GA.g) === 'F';
      const quemP = p.nome ? `“${p.nome.toUpperCase()}”` : '“[[nome do vendedor xxx]]”';
      blocos.push(`**${ct.tit}**, ${ct.pl ? 'emitidas' : 'emitida'} em ${D}, sob ${ct.pl ? 'os nºs' : 'o nº'} ${N}, em favor ${fem ? 'da' : 'do'} ${quemP}${res2}`);
    });
  });
  // Empresa alienante: CND conjunta RFB/PGFN, que abrange as contribuições previdenciárias (art. 262, I e II, do CNSNR),
  // no mesmo formato das demais certidões, como na 137 (aprovado pelo usuário em 27/10/2026). Campo: "código | data".
  if ((c.m === 'cv' || c.m === 'dacao') && temCNPJ('m_aQual')) {
    const [cod, dt] = v('m_cndPJ').split('|').map(s => (s || '').trim());
    const emp = pessoas[0].nome ? `“${pessoas[0].nome.toUpperCase()}”` : '“[[razão social xxx]]”';
    blocos.push(`**CERTIDÃO NEGATIVA DE DÉBITOS RELATIVOS AOS TRIBUTOS FEDERAIS E À DÍVIDA ATIVA DA UNIÃO – RFB/PGFN**, emitida em ${dt || '[[data de emissão xxx]]'}, sob o código de controle nº ${cod || '[[código de controle xxx]]'}, em favor da ${emp}, nos termos do art. 262, I e II, do CNSNR`);
  }
  const ciencia = positiva ? (trad
    ? `. O teor das certidões com resultado positivo foi lido e explicado às **PARTES**, declarando ${art.o(G)} ${R([G, base])} ter ciência dos riscos e prosseguir com a aquisição`
    : `. O teor das certidões positivas foi lido e explicado às partes, e ${art.o(G)} ${R([G, base])} ${vb(G, 'declara', 'declaram')} ciência dos riscos e ${vb(G, 'prossegue', 'prosseguem')} com a aquisição`) : '';
  // Dispensa: a certidão dispensada NÃO é nomeada (pedido do usuário, 24/10/2026); uma frase geral dispensa as demais,
  // com a ciência da possibilidade de obtê-las (exigida para a CNDT, art. 259, V) e a legislação da dispensa, em destaque.
  const demais = blocos.length ? 'das demais certidões' : 'das certidões de feitos ajuizados e de natureza fiscal';
  const lista = arr => arr.map((t, i) => `**${L(i)})** ${t}`).join('; ');
  const quem = `${art.do(GA)} ${R([GA, baseA])}`;
  const DISP = `**${vb(G, 'DISPENSA', 'DISPENSAM')} EXPRESSAMENTE**`;
  if (trad) {
    const apres = blocos.length ? ` e, para maior segurança jurídica do negócio, nos termos dos §§ 3º e 5º do art. 259 do CNSNR, foram apresentadas, em nome ${quem}, as seguintes certidões, arquivadas em classificador próprio desta Serventia: ${lista(blocos)}${ciencia}` : '';
    return { tt: 'CERTIDÕES E DOCUMENTOS', x: `Nos termos da Lei nº 7.433/85, do Decreto Regulamentador nº 93.240/86 e do Código de Normas dos Serviços Notariais e de Registro do Estado do Pará – CNSNR, as **PARTES** apresentaram as certidões e documentos necessários à lavratura do presente ato${apres}. ${cap(art.o(G))} ${R([G, base])}, ${vb(G, 'ciente', 'cientes')} da possibilidade de sua obtenção e dos riscos inerentes, ${DISP}, sob sua exclusiva responsabilidade, a apresentação ${demais}, nos termos dos incs. IV e V e do § 1º do art. 259 do CNSNR e do § 2º do art. 1º do Decreto Regulamentador nº 93.240/86, observado, ainda, o disposto no § 2º do art. 54 da Lei nº 13.097/2015, incluído pela Lei nº 14.382/2022, respondendo, nos termos da lei, pelo pagamento dos débitos fiscais existentes.` };
  }
  const apres = blocos.length ? ` Para maior segurança do negócio (art. 259, §§ 3º e 5º, do CNSNR), foram apresentadas, em nome ${quem}, e arquivadas nesta Serventia: ${lista(blocos)}${ciencia}.` : '';
  return { tr: 'DAS CERTIDÕES', x: `As partes apresentaram os documentos exigidos pela Lei nº 7.433/1985, pelo Decreto nº 93.240/1986 e pelo Código de Normas dos Serviços Notariais e de Registro do Estado do Pará – CNSNR.${apres} ${cap(art.o(G))} ${R([G, base])}, ${vb(G, 'ciente', 'cientes')} da possibilidade de sua obtenção e dos riscos, ${DISP}, sob sua exclusiva responsabilidade, a apresentação ${demais}, com fundamento no art. 259, IV, V e § 1º, do CNSNR e no art. 1º, § 2º, do Decreto nº 93.240/1986, observado o art. 54, § 2º, da Lei nº 13.097/2015, incluído pela Lei nº 14.382/2022, hipótese em que ${vb(G, 'responde', 'respondem')}, na forma da lei, pelos débitos fiscais porventura existentes.` };
}
function itLGPD(c) {
  return c.trad
    ? { tt: 'TRATAMENTO DE DADOS PESSOAIS', x: 'As **PARTES** declaram que foram cientificadas que os dados pessoais descritos neste ato são públicos, bem como concordam, expressamente, com a divulgação dos seus dados pessoais, com a finalidade de emissão de certidões, segundas vias, envio aos órgãos fiscalizadores e cumprimento das exigências legais e regimentais, nos termos do art. 7º, inc. II, e do art. 23, §4º, da Lei nº 13.709/2018 – Lei Geral de Proteção de Dados Pessoais, bem como dos arts. 79 e seguintes do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial (Provimento CNJ nº 149/2023).' }
    : { tr: 'DA PROTEÇÃO DE DADOS PESSOAIS', x: 'As partes foram cientificadas de que os dados pessoais constantes deste ato são públicos e autorizam o seu tratamento para a emissão de certidões e traslados, o envio de informações aos órgãos competentes e o cumprimento das obrigações legais e regulamentares, nos termos do art. 7º, II, e do art. 23, § 4º, da Lei nº 13.709/2018 – Lei Geral de Proteção de Dados Pessoais, e dos arts. 79 e seguintes do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial.' };
}
function itDeclaracoes(c, primeira) {
  const [G, base] = c.prop, temOnus = linhas('m_onus').length > 0;
  const lst = [];
  lst.push(primeira || (c.trad
    ? `${art.o(G)} ${R([G, base])} ${vb(G, 'declara', 'declaram')}, sob pena de responsabilidade civil e penal, que não existem outras ações reais, pessoais ou reipersecutórias, bem como não existem outros ônus reais que possam macular ou tornar ineficaz a presente escritura` + (temOnus ? ', exceto os ônus citados no Item {{titulo}}' : '')
    : `${art.o(G)} ${R([G, base])} ${vb(G, 'declara', 'declaram')} que não existem outras ações reais ou pessoais reipersecutórias relativas ${ip(c, 'ao imóvel', 'aos imóveis')} nem outros ônus reais que ${ip(c, 'o', 'os')} gravem` + (temOnus ? ', ressalvados os ônus citados no item {{titulo}}' : '')));
  lst.push(c.trad
    ? 'as **PARTES** declaram que não são pessoas expostas politicamente, atualmente ou nos últimos 05 (cinco) anos, não são familiares de pessoas expostas politicamente, bem como não são colaboradoras estreitas de pessoas expostas politicamente, declarando, ainda, para todos os fins de direito que, os dados constantes desta escritura são **VERDADEIROS**, ciente que quaisquer inconsistências podem trazer as sanções expostas na lei, nos termos do art. 145, §6º, do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial (Provimento CNJ nº 149/2023)'
    : 'as partes declaram que não são, nem foram nos últimos cinco anos, pessoas expostas politicamente, e que não são familiares nem estreitos colaboradores de pessoas nessa condição, nos termos do art. 145, § 6º, do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial (Provimento CNJ nº 149/2023)');
  if ($('m_cond').checked) lst.push(`${art.o(G)} ${R([G, base])} ${vb(G, 'declara', 'declaram')}, para fins de prova de quitação, que inexistem débitos condominiais ${c.trad ? `incidentes sobre ${ip(c, 'o referido imóvel', 'os referidos imóveis')}, nos termos do §2º, do art. 2º, da Lei 7.433/85` : `relativos ${ip(c, 'ao imóvel', 'aos imóveis')} (art. 2º, § 2º, da Lei nº 7.433/1985)`}`);
  // Aprovados em 24/10/2026: alienante pessoa física declara que não é empregador (art. 262, I, do CNSNR) e quem se
  // declarou casado ou divorciado confirma que a certidão (até 90 dias) segue inalterada (art. 261, parágrafo único).
  if ((c.m === 'cv' || c.m === 'dacao') && !temCNPJ('m_aQual'))
    lst.push(`${art.o(G)} ${R([G, base])} ${vb(G, 'declara', 'declaram')}, sob as penas da lei, que não ${vb(G, 'é', 'são')} ${w(G, 'empregador nem contribuinte individual empregador', 'empregadora nem contribuinte individual empregadora', 'empregadores nem contribuintes individuais empregadores', 'empregadoras nem contribuintes individuais empregadoras')}, ficando dispensada a apresentação de certidão negativa de débito para com o INSS, nos termos do art. 262, I, do CNSNR`);
  if (c.m !== 'divorcio' && /\b(casad[oa]s?|divorciad[oa]s?|separad[oa]s? judicialmente)\b/i.test((temCNPJ('m_aQual') ? '' : v('m_aQual')) + ' ' + (c.B ? v('m_bQual') : '')))
    lst.push(`as **PARTES** casadas, divorciadas ou separadas declaram, sob as penas da lei, que o conteúdo das certidões de casamento apresentadas, expedidas em ${F('m_casExp', 'data de expedição da certidão de casamento')}, há no máximo 90 (noventa) dias, permanece inalterado, nos termos do parágrafo único do art. 261 do CNSNR`);
  if (c.rural) lst.push('as **PARTES** declaram ciência de que o registro de imóvel rural pode depender de georreferenciamento certificado pelo INCRA, nos termos do art. 176, §§ 3º e 4º, da Lei nº 6.015/1973 e do Decreto nº 4.449/2002');
  lst.push(c.trad
    ? 'as **PARTES** afirmam sob responsabilidade civil e criminal que os fatos e declarações prestadas são a exata expressão da verdade e que aceitam esta escritura em todos os seus termos, por se acharem de inteiro e pleno acordo com o ajustado e contratado entre si, ressalvando eventuais erros, omissões ou direito de terceiros e, por conseguinte, eximindo esta serventia de quaisquer responsabilidades oriundas em razão dessas declarações'
    : 'as partes declaram que as informações prestadas neste ato são verdadeiras, assumem por elas a responsabilidade civil e criminal e isentam esta Serventia de responsabilidade por erros, omissões ou direitos de terceiros não declarados');
  const L = i => String.fromCharCode((c.trad ? 65 : 97) + i);
  const corpo = lst.map((t, i) => `**${L(i)})** ${c.trad ? cap(t) : t}`).join('; ') + '.';
  return c.trad ? { tt: 'DECLARAÇÕES', x: corpo } : { tr: 'DAS DECLARAÇÕES', x: 'Sob as penas da lei: ' + corpo };
}
function itConsultas(c) {
  const [G, base] = c.prop, hs = linhas('m_hash');
  const lista = (hs.length ? hs : ['[[código HASH xxx]]']).map((h, i) => `${i + 1}) ${h}`);
  if (c.trad) return { tt: 'CONSULTAS E COMUNICAÇÕES', x: `**A) CENTRAL NACIONAL DE INDISPONIBILIDADE DE BENS – CNIB:** Nos termos do art. 320-F do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial (Provimento CNJ nº 149/2023, com redação dada pelo Provimento CNJ nº 188/2024), foi devidamente consultada a Central Nacional de Indisponibilidade de Bens – CNIB, sendo expedido o relatório de consulta de indisponibilidade, em nome ${art.do(G)} ${R([G, base])}, com resultado NEGATIVO, sob o(s) Código(s) HASH: ${lista.join('; ')}. **B) DECLARAÇÃO DE OPERAÇÕES IMOBILIÁRIAS – DOI:** Conforme Instrução Normativa RFB nº 2.186, de 12 de abril de 2024, alterada pela Instrução Normativa RFB nº 2.202, de 16 de julho de 2024, será devidamente comunicado à Receita Federal do Brasil sobre os valores dos negócios jurídicos constantes desta Escritura, dentro do prazo legal. **C) CENTRAL NOTARIAL DE SERVIÇOS ELETRÔNICOS COMPARTILHADOS – CENSEC:** As informações constantes da presente Escritura serão devidamente informadas à Central Notarial de Serviços Eletrônicos Compartilhados – CENSEC, dentro do prazo legal, nos termos dos arts. 264 e seguintes do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial (Provimento CNJ nº 149/2023).` };
  return { tr: 'DAS CONSULTAS E COMUNICAÇÕES', x: `**a) CENTRAL NACIONAL DE INDISPONIBILIDADE DE BENS – CNIB:** consultei a CNIB em nome ${art.do(G)} ${R([G, base])}, nos termos do art. 320-F do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial (Provimento CNJ nº 149/2023, com a redação do Provimento CNJ nº 188/2024), com resultado NEGATIVO${G.pl ? ' para todos' : ''}, conforme ${lista.length > 1 ? 'os códigos hash nº' : 'o código hash nº'} ${lista.join(' e nº ')}; **b) DECLARAÇÃO SOBRE OPERAÇÕES IMOBILIÁRIAS – DOI:** emitirei a DOI à Receita Federal do Brasil no prazo legal, conforme a Instrução Normativa RFB nº 2.186/2024, alterada pela Instrução Normativa RFB nº 2.202/2024; **c) CENTRAL NOTARIAL DE SERVIÇOS ELETRÔNICOS COMPARTILHADOS – CENSEC:** comunicarei este ato à CENSEC no prazo legal, conforme os arts. 264 e seguintes do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial.` };
}
function itRegistro(c, extra) {
  const [G, base] = c.adq;
  // Venda ao cessionário: declarações para a qualificação registral (texto da minuta 137, aprovada em 27/10/2026).
  let qr = '';
  if (c.ces) {
    const d = dadosCessao(c), [GA] = c.prop, pela = w(GA, 'pelo titular', 'pela titular', 'pelos titulares', 'pelas titulares');
    qr = c.trad
      ? ` **D) QUALIFICAÇÃO REGISTRAL:** As **PARTES** declaram, para conhecimento do Ofício de Registro de Imóveis competente, que: **1)** o título objeto de registro é exclusivamente a presente compra e venda, outorgada ${pela} do domínio constante ${ip(c, 'da matrícula indicada', 'das matrículas indicadas')} no Item {{titulo}}, observado o princípio da continuidade, nos termos dos arts. 195 e 237 da Lei nº 6.015/73; **2)** ${d.negs} ${d.fem ? 'descritas' : 'descritos'} no Item {{cessao}} constituem negócios jurídicos de natureza obrigacional, jamais levados a registro, que não transferiram o domínio ${ip(c, 'do imóvel', 'dos imóveis')}, nos termos do art. 1.245 do Código Civil, sendo ${d.fem ? 'mencionadas' : 'mencionados'} neste ato exclusivamente como prova da origem dos direitos e da quitação, e não são objeto de registro; e **3)** o Imposto de Transmissão de Bens Imóveis – ITBI incide somente sobre a transmissão objeto desta escritura.`
      : ` Para a qualificação registral, as partes declaram que: **a)** o título a registrar é exclusivamente esta compra e venda, outorgada ${pela} do domínio constante ${ip(c, 'da matrícula', 'das matrículas')}, observada a continuidade (arts. 195 e 237 da Lei nº 6.015/1973); **b)** ${d.negs.replace(/ de direitos$/, '')} do item {{cessao}} são negócios obrigacionais nunca registrados, que não transferiram o domínio (art. 1.245 do Código Civil), mencionados apenas como prova da origem dos direitos e da quitação, e não são objeto de registro; **c)** o ITBI incide somente sobre a transmissão objeto desta escritura.`;
  }
  if (c.trad) return { tt: 'REGISTRO DE IMÓVEIS', x: `**A)** As **PARTES** autorizam ao Ofício de Registro de Imóveis competente a proceder todos os atos de registro e averbações necessários à perfeita caracterização objetiva e subjetiva ${ip(c, 'do imóvel', 'dos imóveis')} desta escritura, nos termos do art. 1.245 do Código Civil; **B)** As **PARTES** foram devidamente orientadas a protocolarem a presente Escritura Pública no Serviço do Registro de Imóveis competente, nos termos do art. 1.227, do Código Civil, para surtir seus devidos efeitos de publicidade; **C)** Nos termos do Provimento CNJ nº 61/2017, ${art.o(G)} ${R([G, base])}, já ${w(G, 'qualificado', 'qualificada', 'qualificados', 'qualificadas')}, na qualidade de parte interessada, desde já ${vb(G, 'requer', 'requerem')} ao Ofício de Registro de Imóveis competente que registre o presente instrumento ${ip(c, 'na matrícula do imóvel qualificado', 'nas matrículas dos imóveis qualificados')} nesta escritura${qr ? ';' : '.'}` + qr + (extra ? ` **D)** ${extra}` : '') };
  return { tr: 'DO REGISTRO IMOBILIÁRIO', x: `As partes autorizam o Ofício de Registro de Imóveis competente a praticar todos os registros e averbações necessários à perfeita caracterização objetiva e subjetiva ${ip(c, 'do imóvel', 'dos imóveis')}, nos termos do art. 1.245 do Código Civil, e foram orientadas de que a propriedade somente se transmite com o registro desta escritura, conforme o art. 1.227 do Código Civil. ${cap(art.o(G))} ${R([G, base])}, na qualidade de ${w(G, 'interessado', 'interessada', 'interessados', 'interessadas')}, ${vb(G, 'requer', 'requerem')} desde já o registro deste instrumento ${ip(c, 'na matrícula do imóvel', 'nas matrículas dos imóveis')}, nos termos do Provimento CNJ nº 61/2017.` + qr + (extra ? ' ' + extra : '') };
}
function itAdvogado(artigo) {
  return { tt: 'ADVOGADO', tr: 'DO ADVOGADO', x: `Assiste as **PARTES**, nos termos do ${artigo}, ${F('m_adv', 'nome e OAB do advogado')}.` };
}

/* Itens próprios de cada modalidade */
function itensCompraVenda(c) {
  const { A, B } = c, V = R([A, c.rA]), C = R([B, c.rB]);
  const valor = valorB('m_valor', 'preço'), pd = F('m_pagData', 'data do pagamento'), pf = F('m_pagForma', 'forma de pagamento');
  // Meio e forma de pagamento detalhados (art. 165-A do CNN, Prov. CNJ 161/2024) – aprovado em 24/10/2026.
  const recusa = $('m_pagRecusa').checked;
  const pdet = recusa ? '' : ', ' + (v('m_pagDetalhe') || '[[dados do pagamento: contas de origem e de destino, titulares, datas e valores; espécie: local e data; cheque: números e contas (art. 165-A do CNN) xxx]]');
  const txtRecusa = !recusa ? '' : c.trad
    ? ' As **PARTES** recusaram-se a fornecer os dados do meio de pagamento, recusa que consigno nos termos do § 3º do art. 165-A do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial (Provimento CNJ nº 149/2023).'
    : ' As partes recusaram-se a fornecer os dados do meio de pagamento, o que consigno nos termos do art. 165-A, § 3º, do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial.';
  const ces = c.ces, cess = w(B, 'cessionário', 'cessionária', 'cessionários', 'cessionárias'), d = ces ? dadosCessao(c) : null;
  const legit = ces ? w(A, 'legítimo titular', 'legítima titular', 'legítimos titulares', 'legítimas titulares') : w(A, 'legítimo proprietário', 'legítima proprietária', 'legítimos proprietários', 'legítimas proprietárias');
  const vontade = { tt: 'VONTADE DAS PARTES', x: `Então, pelas **PARTES**, no uso da prerrogativa de livre escolha do Tabelionato de Notas, nos termos do art. 8º, da Lei 8.935/94, bem como nos termos dos artigos 481, 1.228 e seguintes do Código Civil, formalizam juridicamente a sua vontade, nos seguintes termos: **A)** ${cap(art.pelo(A))} ${V}${c.pres} me foi dito que, por ${vb(A, 'ser', 'serem')} ${legit} ${ip(c, 'do imóvel a seguir descrito', 'dos imóveis a seguir descritos')}, a justo título, é de seu interesse a venda ${art.ao(B)} ${C}${ces ? `, ${cess} dos direitos aquisitivos sobre ${ip(c, 'o referido imóvel', 'os referidos imóveis')},` : ''} nos preços e condições estabelecidas nesta Escritura Pública. **B)** ${cap(art.pelo(B))} ${C} me foi dito que é de seu interesse a aquisição ${ip(c, 'do referido imóvel', 'dos referidos imóveis')}, nas mesmas condições estabelecidas nesta Escritura.` };
  // Venda ao cessionário: o preço foi pago aos cedentes; o vendedor dá quitação porque recebeu no negócio original.
  const preco = c.trad
    ? { tt: 'PREÇO E FORMA DE PAGAMENTO', x: ces
      ? `Foi declarado pelas **PARTES** que o valor da compra e venda relativa ${ip(c, 'ao imóvel', 'aos imóveis')} é de ${valor}, pago integralmente ${art.pelo(B)} ${C} ${d.pagoA}, em ${pd}, à vista, por intermédio de ${pf}${pdet}. ${cap(art.o(A))} ${V}, que ${vb(A, 'recebeu', 'receberam')} ${d.quit}, ${vb(A, 'dá', 'dão')} plena, geral e irrevogável quitação do preço ajustado.${txtRecusa}`
      : `Foi declarado pelas **PARTES** que o valor da compra e venda relativa ${ip(c, 'ao imóvel', 'aos imóveis')} é de ${valor}. O negócio jurídico, perfeito e realizado, foi pago integralmente ${art.pelo(B)} ${C}, em ${pd}, à vista, em moeda corrente do País, por intermédio de ${pf}${pdet}, quantia esta que ${art.o(A)} ${V} ${vb(A, 'declara', 'declaram')} receber integralmente, pelo que ${vb(A, 'dá', 'dão')} plena, geral e irrevogável quitação do preço ajustado para a presente negociação, considerando pago e satisfeito por si e seus sucessores a qualquer título.${txtRecusa}` }
    : { tr: 'DO PREÇO E DA QUITAÇÃO', x: ces
      ? `O preço da compra e venda é de ${valor}, pago integralmente ${art.pelo(B)} ${C} ${d.pagoA} em ${pd}, à vista, por meio de ${pf}${pdet}. ${cap(art.o(A))} ${V}, que ${vb(A, 'recebeu', 'receberam')} ${d.quit}, ${vb(A, 'dá', 'dão')} ${art.ao(B)} ${C} plena, geral e irrevogável quitação.${txtRecusa}`
      : `O preço da compra e venda é de ${valor}, pago integralmente ${art.pelo(B)} ${C} em ${pd}, à vista, em moeda corrente nacional, por meio de ${pf}${pdet}. ${cap(art.o(A))} ${V} ${vb(A, 'declara', 'declaram')} ter recebido a totalidade do preço e ${vb(A, 'dá', 'dão')} ${art.ao(B)} ${C} plena, geral e irrevogável quitação, por si e por seus sucessores.${txtRecusa}` };
  const venda = c.trad
    ? { tt: 'COMPRA E VENDA E DA GARANTIA PELOS RISCOS DE EVICÇÃO DE DIREITO', x: `**A)** E assim, ${art.o(A)} ${V}, por ${ces ? vb(A, 'ter recebido', 'terem recebido') : vb(A, 'receber', 'receberem')} integralmente o preço ajustado pela presente escritura e na melhor forma de direito, ${vb(A, 'vende e transfere', 'vendem e transferem')} ${art.ao(B)} ${C} ${ip(c, 'o imóvel acima descrito', 'os imóveis acima descritos')}, ao tempo em que ${vb(A, 'transfere', 'transferem')} todos os direitos de ações, jus, domínio e posse sobre ${ip(c, 'ele', 'eles')}, por intermédio da cláusula **CONSTITUTI**, garantindo a faculdade de usar, gozar, dispor e reaver ${ip(c, 'o imóvel', 'os imóveis')}, de forma incontestável e efetiva, como proprietário e legítimo possuidor, nos termos do art. 1.228 do Código Civil; **B)** ${cap(art.o(A))} ${V} se ${vb(A, 'compromete', 'comprometem')} a garantir como firme e boa a presente compra e venda, bem como a responder, a todo tempo e na forma da Lei, pelos riscos de evicção de direito.` }
    : { tr: 'DA COMPRA E VENDA', x: `No exercício da livre escolha do tabelião, assegurada pelo art. 8º da Lei nº 8.935/1994, e nos termos dos arts. 481 e seguintes do Código Civil, ${art.o(A)} ${V} ${vb(A, 'vende', 'vendem')} ${art.ao(B)} ${C}${ces ? `, na qualidade de ${cess},` : ''} ${ip(c, 'o imóvel descrito', 'os imóveis descritos')} no item {{objeto}} e ${vb(B, 'lhe', 'lhes')} ${vb(A, 'transmite', 'transmitem')}, desde já, por força desta escritura e da cláusula **CONSTITUTI**, o domínio, a posse, os direitos e as ações que sobre ${ip(c, 'ele', 'eles')} ${vb(A, 'exercia', 'exerciam')}, para que ${art.o(B)} ${C} ${ip(c, 'o', 'os')} ${vb(B, 'use, goze, disponha e reivindique', 'usem, gozem, disponham e reivindiquem')} como ${ip(c, 'seu', 'seus')}, na forma do art. 1.228 do Código Civil. ${cap(art.o(B))} ${C} ${vb(B, 'aceita', 'aceitam')} a venda nos termos aqui estabelecidos. ${cap(art.o(A))} ${V} ${vb(A, 'obriga-se', 'obrigam-se')} a fazer esta venda sempre boa, firme e valiosa e a responder pela evicção, na forma da lei.` };
  const partes = [itQualificacao(c, A, c.rA, 'A'), itQualificacao(c, B, c.rB, 'B'), itIdentidade(c)];
  // Venda ao cessionário: a origem dos direitos vem depois do título (revisada) ou do cadastro (tradicional), como na 137.
  const cesIt = ces ? [itCessao(c)] : [];
  return c.trad
    ? [...partes, vontade, itObjeto(c), itTitulo(c), itCadastro(c), ...cesIt, preco, itImposto(c), venda, itCertidoes(c), itLGPD(c), itDeclaracoes(c), itConsultas(c), itRegistro(c)]
    : [...partes, itObjeto(c), itTitulo(c), ...cesIt, itCadastro(c), preco, venda, itImposto(c), itCertidoes(c), itDeclaracoes(c), itConsultas(c), itLGPD(c), itRegistro(c)];
}

function itensDacao(c) {
  const { A, B } = c, D = R([A, c.rA]), Cr = R([B, c.rB]);
  const valor = valorB('m_valor', 'valor da dívida e do imóvel');
  const vontade = { tt: 'VONTADE DAS PARTES', x: `Então, pelas **PARTES**, no uso da prerrogativa de livre escolha do Tabelionato de Notas, nos termos do art. 8º, da Lei 8.935/94, bem como nos termos dos arts. 356 a 359 do Código Civil, formalizam juridicamente a sua vontade, nos seguintes termos: **A)** ${cap(art.pelo(A))} ${D} me foi dito que, por ${vb(A, 'ser', 'serem')} ${w(A, 'legítimo proprietário', 'legítima proprietária', 'legítimos proprietários', 'legítimas proprietárias')} do imóvel a seguir descrito e ${w(A, 'devedor', 'devedora', 'devedores', 'devedoras')} da obrigação indicada no item {{divida}}, é de seu interesse dar o referido imóvel em pagamento ${art.ao(B)} ${Cr}; **B)** ${cap(art.pelo(B))} ${Cr} me foi dito que ${vb(B, 'consente', 'consentem')} em receber o imóvel em substituição à prestação devida, nos termos do art. 356 do Código Civil.` };
  const divida = { k: 'divida', tt: 'DÍVIDA', tr: 'DA DÍVIDA', x: `${cap(art.o(A))} ${D} ${vb(A, 'é', 'são')} ${w(A, 'devedor', 'devedora', 'devedores', 'devedoras')} ${art.do(B)} ${Cr} da importância de ${valor}, ${F('m_divida', 'origem da dívida')}.` };
  const quitacao = { tt: 'VALOR ATRIBUÍDO E QUITAÇÃO', tr: 'DO VALOR ATRIBUÍDO E DA QUITAÇÃO', x: `As **PARTES** atribuem ao imóvel, para os fins desta dação em pagamento, o valor de ${valor}, correspondente ao valor da dívida descrita no item {{divida}}. Em razão desta dação, ${art.o(B)} ${Cr} ${vb(B, 'dá', 'dão')} ${art.ao(A)} ${D} plena, geral e irrevogável quitação da referida dívida, para nada mais reclamar a qualquer título.` };
  const evicto = `Se ${art.o(B)} ${Cr} ${vb(B, 'for', 'forem')} ${w(B, 'evicto', 'evicta', 'evictos', 'evictas')} da coisa recebida em pagamento`;
  const dacao = c.trad
    ? { tt: 'DAÇÃO EM PAGAMENTO E EVICÇÃO', x: `**A)** E assim, ${art.o(A)} ${D}, na melhor forma de direito, ${vb(A, 'dá', 'dão')} em pagamento e ${vb(A, 'transfere', 'transferem')} ${art.ao(B)} ${Cr} o imóvel acima descrito, ao tempo em que ${vb(A, 'transfere', 'transferem')} todos os direitos de ações, jus, domínio e posse sobre ele, por intermédio da cláusula **CONSTITUTI**, nos termos dos arts. 356 e 1.228 do Código Civil; **B)** ${evicto}, restabelecer-se-á a obrigação primitiva, e ficará sem efeito a quitação dada, ressalvados os direitos de terceiros, nos termos do art. 359 do Código Civil.` }
    : { tr: 'DA DAÇÃO EM PAGAMENTO', x: `No exercício da livre escolha do tabelião, assegurada pelo art. 8º da Lei nº 8.935/1994, e nos termos dos arts. 356 a 359 do Código Civil, ${art.o(A)} ${D} ${vb(A, 'dá', 'dão')} ${art.ao(B)} ${Cr}, em pagamento da dívida descrita no item {{divida}}, o imóvel descrito no item {{objeto}} e ${vb(B, 'lhe', 'lhes')} ${vb(A, 'transmite', 'transmitem')}, desde já, por força desta escritura e da cláusula **CONSTITUTI**, o domínio, a posse, os direitos e as ações que sobre ele ${vb(A, 'exercia', 'exerciam')}. ${cap(art.o(B))} ${Cr} ${vb(B, 'aceita', 'aceitam')} o imóvel em substituição à prestação devida. ${evicto}, restabelece-se a obrigação primitiva e fica sem efeito a quitação dada, ressalvados os direitos de terceiros (art. 359 do Código Civil).` };
  const partes = [itQualificacao(c, A, c.rA, 'A'), itQualificacao(c, B, c.rB, 'B'), itIdentidade(c)];
  return c.trad
    ? [...partes, vontade, divida, itObjeto(c), itTitulo(c), itCadastro(c), quitacao, itImposto(c), dacao, itCertidoes(c), itLGPD(c), itDeclaracoes(c), itConsultas(c), itRegistro(c)]
    : [...partes, divida, itObjeto(c), itTitulo(c), itCadastro(c), quitacao, dacao, itImposto(c), itCertidoes(c), itDeclaracoes(c), itConsultas(c), itLGPD(c), itRegistro(c)];
}

function itensInventario(c) {
  const { A, Fal } = c, H = R([A, c.rA]), AU = `**${c.rFal}**`;
  const falNome = v('m_falNome') ? `**${v('m_falNome').toUpperCase()}**` : '[[nome do autor da herança xxx]]';
  const autor = { tt: c.rFal, tr: (Fal.g === 'F' ? 'DA ' : 'DO ') + c.rFal, x: `${falNome}, ${F('m_falQual', 'qualificação do autor da herança')}, ${w(Fal, 'falecido', 'falecida')} em ${F('m_obitoData', 'data do óbito')}, conforme Certidão de Óbito ${F('m_obitoCert', 'matrícula e cartório da certidão de óbito')}, doravante ${w(Fal, 'denominado', 'denominada')} ${AU}.` };
  const herdeiros = { tt: 'OUTORGANTES / HERDEIROS', tr: 'DOS HERDEIROS', x: `${F('m_aQual', 'qualificação dos herdeiros e do cônjuge meeiro')}, doravante denominados ${H}.` + (c.trad ? ' Documentos arquivados em classificador próprio desta Serventia.' : '') };
  const vontade = { tt: 'VONTADE DAS PARTES', tr: 'DO INVENTÁRIO', x: `As **PARTES**, maiores, capazes e concordes, no exercício da livre escolha do Tabelionato de Notas assegurada pelo art. 8º da Lei nº 8.935/1994, e nos termos do art. 610, § 1º, do Código de Processo Civil e da Resolução CNJ nº 35/2007, requerem a lavratura desta escritura de inventário e partilha extrajudiciais dos bens deixados ${art.pelo(Fal)} ${AU}, nos termos a seguir.` };
  const invNome = v('m_invNome') ? `**${v('m_invNome').toUpperCase()}**` : '[[nome do inventariante xxx]]';
  const inventariante = { tt: 'NOMEAÇÃO DE INVENTARIANTE', tr: 'DA NOMEAÇÃO DE INVENTARIANTE', x: `As **PARTES** nomeiam como __INVENTARIANTE__ ${invNome}, pessoa já qualificada nesta escritura, que aceita o encargo e assume o compromisso de desempenhá-lo com fidelidade, com poderes de representação do espólio, nos termos do art. 11 da Resolução CNJ nº 35/2007 e do art. 618 do Código de Processo Civil.` };
  const testamento = { tt: 'INEXISTÊNCIA DE TESTAMENTO', tr: 'DA INEXISTÊNCIA DE TESTAMENTO', x: `Consultei o Registro Central de Testamentos On-Line – RCTO, mantido pela Central Notarial de Serviços Eletrônicos Compartilhados – CENSEC, com resultado NEGATIVO quanto à existência de testamento em nome ${art.do(Fal)} ${AU}${v('m_rcto') ? ', conforme certidão ' + v('m_rcto') : ''}.` };
  const monte = { tt: 'MONTE-MOR', tr: 'DO MONTE-MOR', x: `O valor total dos bens deixados ${art.pelo(Fal)} ${AU}, atribuído pelas **PARTES** para fins de partilha, é de ${valorB('m_valor', 'valor total dos bens')}.` };
  const partilha = { tt: 'PARTILHA', tr: 'DA PARTILHA', x: F('m_partilha', 'forma da partilha (quinhão de cada herdeiro e meação)') };
  const op = v('m_imp');
  const itcmd = { tt: 'IMPOSTO', tr: 'DO IMPOSTO DE TRANSMISSÃO', x: op === 'pago'
    ? `Foi recolhido o Imposto sobre a Transmissão Causa Mortis e Doação de Quaisquer Bens ou Direitos – ITCMD, no valor de ${valorB('m_impValor', 'valor do ITCMD')}, sobre a base de cálculo de ${valorB('m_impBase', 'base de cálculo')}, conforme ${F('m_impDocs', 'documentos do ITCMD (SEFA/PA)')}, nos termos da Lei Estadual nº 5.529/1989.`
    : op === 'nao_incide' ? '[[hipótese de isenção ou não incidência do ITCMD reconhecida pela SEFA/PA xxx]].'
    : '[[comprovante de recolhimento do ITCMD xxx – o recolhimento deve anteceder a lavratura (art. 15 da Resolução CNJ nº 35/2007)]].' };
  const certidoes = { tt: 'CERTIDÕES E DOCUMENTOS', tr: 'DAS CERTIDÕES', x: `Foram apresentados os documentos exigidos pelo art. 22 da Resolução CNJ nº 35/2007, em especial a certidão de óbito, os documentos de identidade das partes e ${art.do(Fal)} ${AU}, as certidões comprobatórias do vínculo de parentesco, as certidões de casamento do cônjuge sobrevivente e dos herdeiros casados, a certidão de propriedade do imóvel e a certidão negativa de tributos${c.rural ? ', além do Certificado de Cadastro de Imóvel Rural – CCIR' : ''}.` + (c.trad ? ' Documentos arquivados em classificador próprio desta Serventia.' : '') };
  const declA = `os ${H} declaram que não há outros herdeiros, cônjuge ou companheiro sobrevivente além dos indicados nesta escritura, nem outros bens a inventariar ou dívidas do espólio`;
  const partes = [autor, herdeiros, itAdvogado('art. 610, § 2º, do Código de Processo Civil'), itIdentidade(c)];
  const meio = [vontade, inventariante, testamento, itObjeto(c), itTitulo(c), itCadastro(c), monte, partilha, itcmd, certidoes];
  return c.trad
    ? [...partes, ...meio, itLGPD(c), itDeclaracoes(c, declA), itConsultas(c), itRegistro(c)]
    : [...partes, ...meio, itDeclaracoes(c, declA), itConsultas(c), itLGPD(c), itRegistro(c)];
}

function itensDivorcio(c) {
  const DV = R([c.A, c.rA]);
  const div = { tt: 'OUTORGANTES / DIVORCIANDOS', tr: 'DOS DIVORCIANDOS', x: `${F('m_aQual', 'qualificação dos divorciandos')}, doravante denominados ${DV}.` + (c.trad ? ' Documentos arquivados em classificador próprio desta Serventia.' : '') };
  const vontade = { tt: 'VONTADE DAS PARTES', tr: 'DA VONTADE DAS PARTES', x: `Os ${DV}, maiores, capazes e concordes, no exercício da livre escolha do Tabelionato de Notas assegurada pelo art. 8º da Lei nº 8.935/1994, e nos termos do art. 226, § 6º, da Constituição Federal, do art. 733 do Código de Processo Civil e da Resolução CNJ nº 35/2007, declaram a livre decisão de dissolver o vínculo matrimonial pelo divórcio consensual, nos termos a seguir.` };
  const casamento = { tt: 'CASAMENTO', tr: 'DO CASAMENTO', x: `Os ${DV} contraíram casamento em ${F('m_casData', 'data do casamento')}, sob o regime da ${v('m_regime')}, conforme Certidão de Casamento de matrícula nº ${F('m_casMat', 'matrícula da certidão de casamento')}, expedida pelo ${F('m_casCart', 'cartório expedidor')}.` };
  const gravidez = 'e a divorcianda declara que não se encontra em estado gravídico ou que desconhece essa circunstância';
  const filhos = { tt: 'FILHOS', tr: 'DOS FILHOS', x: {
    sem: `Os ${DV} declaram que não possuem filhos comuns, ${gravidez}.`,
    maiores: `Os ${DV} declaram que os filhos comuns são maiores e capazes, ${gravidez}.`,
    judicial: `Os ${DV} declaram que as questões relativas à guarda, à convivência e aos alimentos dos filhos menores foram previamente resolvidas no âmbito judicial, nos autos do processo nº ${F('m_proc', 'número do processo')}, nos termos da Resolução CNJ nº 35/2007, com a redação da Resolução CNJ nº 571/2024, ${gravidez}.`
  }[v('m_filhos')] };
  const nomeIt = { tt: 'NOME', tr: 'DO NOME', x: v('m_nomeOp') === 'volta'
    ? `A divorcianda voltará a usar o nome de solteira: ${v('m_nomeSolteira') ? '**' + v('m_nomeSolteira').toUpperCase() + '**' : '[[nome de solteira xxx]]'}.`
    : `Os ${DV} manterão os nomes atuais.` };
  const alim = { tt: 'ALIMENTOS', tr: 'DOS ALIMENTOS', x: v('m_alimOp') === 'fixa' ? F('m_alim', 'descrição dos alimentos') : `Os ${DV} dispensam reciprocamente o pagamento de alimentos, por possuírem meios próprios de subsistência.` };
  const partilha = { tt: 'PARTILHA', tr: 'DA PARTILHA', x: `O imóvel descrito no item {{objeto}}, ao qual as **PARTES** atribuem o valor de ${valorB('m_valor', 'valor do imóvel')}, fica partilhado da seguinte forma: ${F('m_partilha', 'forma da partilha')}.` };
  const divorcio = { tt: 'DIVÓRCIO', tr: 'DO DIVÓRCIO', x: `Por esta escritura, fica dissolvido o casamento dos ${DV} pelo divórcio consensual, que independe de homologação judicial e constitui título hábil para o registro civil e o registro de imóveis, nos termos do art. 733, § 1º, do Código de Processo Civil.` };
  const certidoes = { tt: 'CERTIDÕES E DOCUMENTOS', tr: 'DAS CERTIDÕES', x: `Foram apresentados os documentos exigidos pela Resolução CNJ nº 35/2007, em especial a certidão de casamento atualizada, o pacto antenupcial, se houver, os documentos de identidade dos ${DV}, as certidões de nascimento dos filhos, se houver, e os documentos que comprovam a titularidade dos bens partilhados.` + (c.trad ? ' Documentos arquivados em classificador próprio desta Serventia.' : '') };
  const averb = `Os ${DV} foram orientados a averbar esta escritura à margem do assento de casamento, no Registro Civil das Pessoas Naturais competente, nos termos do art. 10, I, do Código Civil.`;
  const partes = [div, itAdvogado('art. 733, § 2º, do Código de Processo Civil'), itIdentidade(c)];
  const meio = [vontade, casamento, filhos, nomeIt, alim, itObjeto(c), itTitulo(c), itCadastro(c), partilha, itImposto(c), divorcio, certidoes];
  return c.trad
    ? [...partes, ...meio, itLGPD(c), itDeclaracoes(c), itConsultas(c), itRegistro(c, averb)]
    : [...partes, ...meio, itDeclaracoes(c), itConsultas(c), itLGPD(c), itRegistro(c, averb)];
}

/* Procuração pública – modelo da serventia (procurações lavradas em 2026), com as citações atualizadas.
   Só o mandante assina com o tabelião; o procurador não comparece. */
const PODERES_PROC = {
  // {P} vira "PODENDO" na redação tradicional e "com poderes para" na revisada (sem gerúndio).
  imovel: (c, bem) => `para assuntos relacionados à administração, locação, regularização, alienação e transferência, para si ou para quem indicar, do seguinte bem: //“${bem}”//, com a finalidade de representação perante os órgãos públicos da situação do referido imóvel, especialmente a Prefeitura Municipal e suas Secretarias Municipais, {P} requerer, solicitar e protocolar quaisquer documentos, proceder a cadastros, recadastramentos e/ou alteração da inscrição do referido imóvel, solicitar alvarás de construção e de funcionamento, efetuar o pagamento de quaisquer tributos e taxas, em especial o Imposto Predial e Territorial Urbano – IPTU${c.rural ? ', o Imposto sobre a Propriedade Territorial Rural – ITR' : ''} e o Imposto de Transmissão de Bens Imóveis – ITBI; ` +
    (c.rural ? 'representar perante o Instituto Nacional de Colonização e Reforma Agrária – INCRA, a Receita Federal do Brasil, o Instituto de Terras do Pará – ITERPA e a Secretaria de Estado de Meio Ambiente e Sustentabilidade – SEMAS, {P} atualizar o Certificado de Cadastro de Imóvel Rural – CCIR, o Cadastro Imobiliário Brasileiro – CIB/NIRF e o Cadastro Ambiental Rural – CAR, e requerer georreferenciamento e certificação no SIGEF; ' : '') +
    'representar perante Cartórios de Notas em geral, bem como perante o Serviço de Registro de Imóveis competente, com poderes especiais e expressos, nos termos do §1º, do art. 661, do Código Civil, {P} juntar, apresentar, requerer e retirar documentos, prestar declarações e esclarecimentos, solicitar e assinar **ESCRITURAS PÚBLICAS** de qualquer natureza, inclusive de compra e venda, pelo preço e nas condições que ajustar, bem como solicitar aditamentos e assinar rerratificações, decidir sobre quaisquer cláusulas, efetuar pagamentos, quitar débitos em geral e receber quitações, pagar emolumentos e taxas, requerer e assinar recibos, transmitir definitivamente toda a posse, domínio, direito e ação sobre o imóvel descrito acima, responder pela evicção, receber quaisquer valores referentes à referida transmissão e dar quitação, solicitar, requerer e assinar pedidos de prenotação, registro, averbação e anotações, tomar ciência dos despachos, cumprir exigências, requerer eventual abertura de matrícula, desmembramento, unificação, qualificação objetiva e/ou subjetiva, bem como suscitar dúvidas registrais; representar perante a Equatorial Energia S/A e a Companhia de Saneamento do Pará – COSANPA, ou quem vier a substituí-las, bem como perante companhias telefônicas e de internet em geral, {P} requerer, protocolar, apresentar e assinar quaisquer documentos, solicitar novas ligações e religações, requerer e pagar taxas, dívidas e quaisquer outros valores, realizar renegociações, receber recibos de quitação, efetuar, atualizar, retificar e encerrar cadastros, prestar declarações e esclarecimentos, alterar cláusulas contratuais, encerrar contratos e requerer vistorias e visitas técnicas de qualquer natureza',
  previdenciaria: c => 'para resolver todos os assuntos de interesse ' + w(c.A, 'do outorgante', 'da outorgante', 'dos outorgantes', 'das outorgantes') + ' referentes aos seus benefícios e vencimentos mensais, perante o **INSTITUTO NACIONAL DO SEGURO SOCIAL – INSS**, instituições financeiras e cooperativas de crédito, casas bancárias, casas lotéricas, farmácias e drogarias, Correios ou qualquer repartição em que se faça necessário, {P} promover, requerer, reclamar, prestar esclarecimentos verbais ou por escrito, apresentar documentos, assinar e receber o cartão magnético ou carnê de pagamento, preencher formulários e guias, desbloquear cartão e senha, receber quantias e dar quitação, assinar contracheque, fazer prova de vida e recadastramento junto ao INSS, solicitar saldos e extratos bancários e receber medicamentos',
  ampla: c => 'para representação perante quaisquer órgãos e repartições públicas federais, estaduais e municipais, autarquias e concessionárias de serviço público, em especial Prefeituras Municipais e suas Secretarias, Receita Federal do Brasil, Secretaria de Estado da Fazenda – SEFA, Instituto Nacional do Seguro Social – INSS, Departamento de Trânsito – DETRAN e Juntas Comerciais, {P} requerer, juntar, apresentar, retirar e assinar papéis e documentos, prestar declarações e esclarecimentos, acompanhar processos, solicitar certidões, emitir guias e pagar tributos, taxas e quaisquer outros valores, realizar renegociações e parcelamentos e receber quitações; representar perante Cartórios de Notas e de Registro em geral, com poderes especiais e expressos, nos termos do §1º, do art. 661, do Código Civil, {P} assinar escrituras públicas e instrumentos particulares de qualquer natureza, prestar declarações, requerer registros e averbações e cumprir exigências; representar perante instituições financeiras e cooperativas de crédito em geral, {P} abrir, movimentar e encerrar contas correntes e de poupança, receber importâncias, efetuar saques, depósitos e transferências, solicitar saldos e extratos, solicitar e receber cartões, criar e alterar senhas, fazer cadastramento e recadastramento e dar e receber quitação; e constituir advogados, com os poderes das cláusulas //ad judicia et extra//, para representar ' + w(c.A, 'o outorgante', 'a outorgante', 'os outorgantes', 'as outorgantes') + ' em qualquer juízo, instância ou tribunal',
  outra: () => ''
};

function itensProcuracao(c) {
  const { A, B } = c;
  const MA = `**${w(A, 'MANDANTE', 'MANDANTE', 'MANDANTES', 'MANDANTES')}**`, MT = R([B, 'MANDATÁRIO']);
  const PR = w(B, 'PROCURADOR', 'PROCURADORA', 'PROCURADORES', 'PROCURADORAS'), seu = w(B, 'seu', 'sua', 'seus', 'suas');
  const tipo = v('m_procTipo'), extra = v('m_procPoderes');
  const bem = v('m_procBem') || '[[descrição do imóvel, com matrícula e cartório xxx]]';
  let poderes = PODERES_PROC[tipo](c, bem);
  if (tipo === 'outra') poderes = extra || '[[poderes conferidos xxx]]';
  else if (extra) poderes += '; ' + extra;
  poderes = poderes.replace(/\{P\}/g, c.trad ? 'PODENDO' : 'com poderes para');
  const irrev = $('m_procIrrev').checked;
  const prazo = v('m_procPrazo') || (tipo === 'previdenciaria' ? '12 (doze) meses' : '');
  const txtPrazo = prazo ? ` O presente mandato terá validade de ${prazo}, contados da data de sua lavratura${tipo === 'previdenciaria' ? ', nos termos do art. 109 da Lei nº 8.213/1991' : ''}.` : '';
  const subst = v('m_procSubst') === 'sim' ? 'PERMITIDO' : 'VEDADO';
  const rogo = v('m_procRogo');
  const qualA = F('m_aQual', 'qualificação completa do mandante'), qualB = F('m_bQual', 'qualificação completa do procurador');
  const den = (G, r) => `doravante ${w(G, 'denominado', 'denominada', 'denominados', 'denominadas')} ${r}`;
  const itens = [];
  if (c.trad) {
    itens.push({ tt: `${w(A, 'OUTORGANTE', 'OUTORGANTE', 'OUTORGANTES', 'OUTORGANTES')} / ${w(A, 'MANDANTE', 'MANDANTE', 'MANDANTES', 'MANDANTES')}`,
      x: `${qualA}, ${den(A, MA)}. Documentos arquivados em classificador próprio desta Serventia; que, por este público instrumento, ${vb(A, 'nomeia e constitui', 'nomeiam e constituem')} como ${seu} **${PR}**: ${qualB}, ${den(B, MT)}.` });
    itens.push({ tt: 'IDENTIDADE E CAPACIDADE', x: `Reconheço a identidade ${art.do(A)} ${MA}, perante os documentos, em originais, apresentados e arquivados em classificador próprio desta Serventia. Reconheço, ainda, a sua capacidade jurídica, mediante as perguntas feitas e as respostas obtidas, estando em perfeito juízo e claro entendimento, segundo o meu parecer, do que **DOU FÉ**.` });
    itens.push({ tt: 'VONTADE', x: `Então, ${art.pelo(A)} ${MA}, no uso da prerrogativa de livre escolha do Tabelionato de Notas, nos termos do art. 8º, da Lei 8.935/94, me foi dito que é de seu interesse constituir ${art.o(B)} ${MT} como ${seu} ${w(B, 'legítimo', 'legítima', 'legítimos', 'legítimas')} **${PR}**, para praticar e administrar atos de seu interesse, nos termos do art. 653, do Código Civil.` });
    itens.push({ tt: 'PODERES', x: `Neste ato ${art.o(A)} ${MA} ${vb(A, 'confere', 'conferem')} poderes Gerais, Especiais e Expressos ${art.ao(B)} ${MT}${irrev ? ', para representação em caráter **IRREVOGÁVEL E IRRETRATÁVEL**, nos termos do art. 684 do Código Civil' : ''}, ${poderes}. Enfim, praticar todos os atos necessários para o fiel cumprimento do presente mandato.${txtPrazo}` });
    itens.push({ tt: 'EFICÁCIA', x: `${cap(art.o(A))} ${MA} ${vb(A, 'presta', 'prestam')} as seguintes declarações: **A)** Que fica **${subst} O SUBSTABELECIMENTO**, parcial ou total, dos poderes constantes do presente mandato; **B)** Que se ${vb(A, 'responsabiliza', 'responsabilizam')} civil e criminalmente pelos dados constantes deste instrumento relativos à qualificação ${art.do(B)} ${MT} e aos poderes outorgados, por serem a exata expressão da verdade; **C)** Que ${vb(A, 'aceita', 'aceitam')} esta procuração em todos os seus termos, por se ${vb(A, 'achar', 'acharem')} de inteiro e pleno acordo, responsabilizando-se por eventuais erros ou omissões de direitos de terceiros, devendo a prova ser exigida diretamente pelos órgãos e pessoas a quem interessar, isentando esta Serventia de quaisquer responsabilidades cíveis, criminais e administrativas.` });
    itens.push({ tt: 'TRATAMENTO DE DADOS PESSOAIS', x: `${cap(art.o(A))} ${MA} ${vb(A, 'declara', 'declaram')} ciência sobre a publicidade dos dados pessoais descritos neste instrumento, bem como ${vb(A, 'concorda', 'concordam')}, expressamente, com a divulgação de seus dados pessoais, com a finalidade de emissão de certidões, segundas vias, envio aos órgãos fiscalizadores e cumprimento das exigências legais e regimentais, nos termos do art. 7º, inc. II, e do art. 23, §4º, da Lei nº 13.709/2018 – Lei Geral de Proteção de Dados Pessoais, bem como dos arts. 79 e seguintes do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial (Provimento CNJ nº 149/2023).` });
    itens.push({ tt: 'COMUNICAÇÃO', x: 'As informações referentes a esta procuração serão remetidas à Central Notarial de Serviços Eletrônicos Compartilhados – CENSEC, dentro do prazo legal, nos termos dos arts. 264 e seguintes do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial (Provimento CNJ nº 149/2023).' });
    if (rogo) itens.push({ tt: 'ASSINATURA A ROGO', x: `Por não ${vb(A, 'saber ou não poder', 'saberem ou não poderem')} assinar, ${art.o(A)} ${MA} ${vb(A, 'pede', 'pedem')} que assine a seu rogo ${rogo}, nos termos do art. 215, § 2º, do Código Civil.` });
  } else {
    itens.push({ tr: `${w(A, 'DO', 'DA', 'DOS', 'DAS')} ${w(A, 'OUTORGANTE MANDANTE', 'OUTORGANTE MANDANTE', 'OUTORGANTES MANDANTES', 'OUTORGANTES MANDANTES')}`, x: `${qualA}, ${den(A, MA)}.` });
    itens.push({ tr: `${w(B, 'DO', 'DA', 'DOS', 'DAS')} ${w(B, 'OUTORGADO PROCURADOR', 'OUTORGADA PROCURADORA', 'OUTORGADOS PROCURADORES', 'OUTORGADAS PROCURADORAS')}`, x: `${qualB}, ${den(B, MT)}.` });
    itens.push({ tr: 'DA IDENTIDADE E DA CAPACIDADE', x: `Reconheço a identidade ${art.do(A)} ${MA} pelos documentos originais que me foram apresentados e a sua capacidade jurídica pelas perguntas que ${vb(A, 'lhe', 'lhes')} fiz e pelas respostas que obtive, nos termos do art. 215, § 1º, II, do Código Civil. Os documentos apresentados ficam arquivados em classificador próprio desta Serventia. Dou fé.` });
    itens.push({ tr: 'DO MANDATO', x: `No exercício da livre escolha do tabelião, assegurada pelo art. 8º da Lei nº 8.935/1994, ${art.o(A)} ${MA} ${vb(A, 'nomeia e constitui', 'nomeiam e constituem')} ${art.o(B)} ${MT} ${seu} bastante ${PR.toLowerCase()}, nos termos dos arts. 653 e seguintes do Código Civil${irrev ? ', em caráter **irrevogável e irretratável**, conforme o art. 684 do Código Civil' : ''}.` });
    itens.push({ tr: 'DOS PODERES', x: `${cap(art.o(A))} ${MA} ${vb(A, 'confere', 'conferem')} ${art.ao(B)} ${MT} poderes gerais, especiais e expressos, nos termos do art. 661, § 1º, do Código Civil, ${poderes}, e para praticar todos os demais atos necessários ao fiel cumprimento deste mandato.${txtPrazo}` });
    itens.push({ tr: 'DO SUBSTABELECIMENTO E DA RESPONSABILIDADE', x: `**a)** fica ${subst.toLowerCase()} o substabelecimento, total ou parcial, dos poderes deste mandato; **b)** ${art.o(A)} ${MA} ${vb(A, 'responde', 'respondem')} civil e criminalmente pela exatidão da qualificação ${art.do(B)} ${MT} e pelos poderes outorgados; **c)** ${art.o(A)} ${MA} ${vb(A, 'aceita', 'aceitam')} este instrumento em todos os seus termos e ${vb(A, 'isenta', 'isentam')} esta Serventia de responsabilidade por erros, omissões ou direitos de terceiros não declarados.` });
    itens.push({ tr: 'DA PROTEÇÃO DE DADOS PESSOAIS', x: `${cap(art.o(A))} ${MA} ${vb(A, 'foi cientificado', 'foram cientificados')} de que os dados pessoais constantes deste ato são públicos e ${vb(A, 'autoriza', 'autorizam')} o seu tratamento para a emissão de certidões e traslados, o envio de informações aos órgãos competentes e o cumprimento das obrigações legais e regulamentares, nos termos do art. 7º, II, e do art. 23, § 4º, da Lei nº 13.709/2018 – Lei Geral de Proteção de Dados Pessoais, e dos arts. 79 e seguintes do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial.` });
    itens.push({ tr: 'DA COMUNICAÇÃO À CENSEC', x: 'Comunicarei este ato à Central Notarial de Serviços Eletrônicos Compartilhados – CENSEC no prazo legal, conforme os arts. 264 e seguintes do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial.' });
    if (rogo) itens.push({ tr: 'DA ASSINATURA A ROGO', x: `Como ${art.o(A)} ${MA} não ${vb(A, 'sabe ou não pode', 'sabem ou não podem')} assinar, assina a seu rogo ${rogo}, nos termos do art. 215, § 2º, do Código Civil.` });
  }
  return itens;
}

function gerarProcuracao(c) {
  const { A, B } = c, ct = C();
  const MA = w(A, 'MANDANTE', 'MANDANTE', 'MANDANTES', 'MANDANTES'), MT = nome('MANDATÁRIO', B);
  const titulo = c.trad
    ? `**PROCURAÇÃO PÚBLICA** QUE ${vb(A, 'FAZ', 'FAZEM')} COMO ${MA} ${nomesTitulo(A)}, E TEM COMO ${MT} ${nomesTitulo(B)}, NA FORMA ABAIXO:`
    : `**PROCURAÇÃO PÚBLICA** QUE ${vb(A, 'OUTORGA', 'OUTORGAM')}, COMO ${MA}, ${nomesTitulo(A)} ${w(B, 'AO', 'À', 'AOS', 'ÀS')} ${MT} ${nomesTitulo(B)}, NA FORMA ABAIXO:`;
  const data = dataExtenso(v('m_data')) || '[[data da lavratura por extenso xxx]]';
  const lav = ct.lavrador ? `**${ct.lavrador}**` : '[[nome de quem lavra xxx]]', cargo = ct.cargo || '[[cargo xxx]]';
  const lavCargo = ct.lavrador ? `**${ct.lavrador} – ${cargo}**` : `${lav} – ${cargo}`;
  const selo = F('m_selo', 'número do selo'), rogo = v('m_procRogo');
  const itens = itensProcuracao(c);
  const abertura = c.trad
    ? `Saibam quantos este público instrumento virem que, ${data}, ${ct.localTrad || '[[local da lavratura xxx]]'}, em Cartório, perante mim, ${lavCargo}, ${vb(A, 'compareceu', 'compareceram')}:`
    : `Saibam todos quantos virem este público instrumento que, ${data}, ${ct.localRev || ct.localTrad || '[[local da lavratura xxx]]'}, em Cartório, perante mim, ${ct.cargoCurto || cargo}, ${vb(A, 'compareceu a parte', 'compareceram as partes')} a seguir ${vb(A, 'qualificada', 'qualificadas')}.`;
  const testemunhas = rogo ? 'na presença das testemunhas acima qualificadas' : 'dispensada a presença das testemunhas instrumentárias';
  if (!c.trad) itens.push({ tr: 'DO ENCERRAMENTO', x: `Assim ${vb(A, 'o disse e me pediu', 'o disseram e me pediram')} que lavrasse este instrumento, o qual, lido em voz alta e achado conforme, ${vb(A, 'aceita, outorga e assina', 'aceitam, outorgam e assinam')}, ${testemunhas}. Eu, ${lav}, ${cargo}, o lavrei, conferi, li e subscrevo e encerro o ato. Dou fé. Selo: ${selo}.` });
  const fecho = c.trad ? `**ASSIM** o ${vb(A, 'disse', 'disseram')}, do que **DOU FÉ**, me ${vb(A, 'pediu', 'pediram')} este público instrumento que ${vb(A, 'lhe', 'lhes')} lavrei em minhas notas. Lido e achado conforme, ${vb(A, 'aceita, concorda, outorga e assina', 'aceitam, concordam, outorgam e assinam')}, ${testemunhas}, do que **DOU FÉ**. Eu, ${lavCargo}, que o digitei, conferi e li, subscrevo em público e raso, encerrando o presente ato, do que **DOU FÉ**. Selo: ${selo}. Assinam ${art.o(A)} **${MA}** e o **${(ct.cargoCurto || cargo).toUpperCase()}**.` : undefined;
  const aj = aplicarAjustes(c, itens, { ementa: titulo, fecho });
  let corpo = abertura + ' ' + aj.itens.map((it, i) => `__${romano(i + 1)} – ${c.trad ? (it.tt || it.tr) : (it.tr || it.tt)}:__ ${it.x}`).join(' ');
  if (c.trad) corpo += ' ' + aj.fecho;

  // Assinam só o mandante (ou quem assina a rogo, com as testemunhas) e o tabelião.
  const ass = rogo
    ? [['A ROGO DE ' + (A.pessoas.map(p => p.nome.toUpperCase()).join(', ') || 'MANDANTE'), 'Assinatura a rogo'], ['TESTEMUNHA', ''], ['TESTEMUNHA', '']]
    : A.pessoas.map(p => [p.nome.toUpperCase(), p.papel || 'Mandante']);
  ass.push([ct.lavrador || 'NOME DE QUEM LAVRA', cargo]);
  const p = (cls, s) => `<p class="${cls}">${marcacao(s)}</p>`;
  $('mDoc').innerHTML = timbreHTML('tela') + atoHTML() + p('ementa', aj.ementa) + fimMinuta(corpo, ct, ass);
  mostrarAvisos([]);
}

/* Aditamento (art. 385 do CNSNR: só o tabelião subscreve, erro evidente, sem mudar a vontade das partes) e
   rerratificação (art. 386: comparecem os mesmos comparecentes do ato corrigido). Textos aprovados pelo usuário em
   27/10/2026 (modelos em 00 - MODELOS; fonte: propostas/modelos/textos-aditamento.js). */
function gerarCorrecao(c) {
  const ct = C(), ad = c.m === 'aditamento', trad = c.trad;
  const lav = ct.lavrador || '[[nome de quem lavra xxx]]', cargo = ct.cargo || '[[cargo xxx]]';
  const lavCargo = `**${lav} – ${cargo}**`, selo = F('m_selo', 'número do selo');
  const data = dataExtenso(v('m_data')) || '[[data da lavratura por extenso xxx]]';
  const natT = v('m_adNat'), NAT = natT ? natT.toUpperCase() : '[[NATUREZA DO ATO CORRIGIDO xxx]]';
  const natFrase = natT ? natT.split(/\s+/).map(p => /^(e|de|da|do|das|dos|com|em)$/i.test(p) ? p.toLowerCase() : cap(p.toLowerCase())).join(' ') : '[[natureza do ato corrigido xxx]]';
  const orig = `Escritura Pública de ${natFrase}, lavrada em ${F('m_adData', 'data do ato corrigido')}, às fls. ${F('m_adFolhas', 'folhas')}, do Livro ${F('m_adLivro', 'livro')}`;
  const notas = v('m_adNotas') || 'desta Serventia', oque = F('m_adOque', 'o que será corrigido');
  const rA = nome(c.rA, c.A), rB = nome(c.rB, c.B);
  // Qualificação de cada grupo sem a frase dos documentos (o texto aprovado a põe no fim do item).
  const q = (G, base, lado) => itQualificacao({ ...c, trad: false }, G, base, lado);
  const qA = q(c.A, c.rA, 'A'), qB = q(c.B, c.rB, 'B'), semPonto = s => s.replace(/\.$/, '');
  const CNSNR = 'Código de Normas dos Serviços Notariais e de Registro do Estado do Pará – CNSNR (Provimento Conjunto nº 002/2019 – CJRMB/CJCI)';
  const CENSEC = '**CENTRAL NOTARIAL DE SERVIÇOS ELETRÔNICOS COMPARTILHADOS – CENSEC:** As informações constantes do presente instrumento serão devidamente informadas à Central Notarial de Serviços Eletrônicos Compartilhados – CENSEC, dentro do prazo legal, nos termos dos arts. 264 e seguintes do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial (Provimento CNJ nº 149/2023)';
  const CNN = 'Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial';
  const itens = [];
  let titulo, abertura, fecho;
  if (ad) {
    titulo = `**ESCRITURA PÚBLICA DE ADITAMENTO** À ESCRITURA PÚBLICA DE ${NAT} QUE TEM COMO ${rA} ${nomesTitulo(c.A)} E COMO ${rB} ${nomesTitulo(c.B)}, NA FORMA ABAIXO:`;
    const tit = v('m_adItemTit'), red = v('m_adItem') ? v('m_adItem').replace(/\s*\n\s*/g, ' ') : '';
    const item = tit || red ? `${tit ? tit + ': ' : '[[número e título do item corrigido xxx]]: '}${red || '[[redação completa e já corrigida do item xxx]]'}` : '[[número e título do item corrigido, com a redação completa e já corrigida xxx]]';
    if (trad) {
      abertura = `Saibam quantos este público instrumento virem que, ${data}, ${ct.localTrad || '[[local da lavratura xxx]]'}, em Cartório, eu, ${lavCargo}, a requerimento verbal da parte interessada, lavro o presente aditamento:`;
      itens.push({ tt: 'DISPOSITIVO LEGAL', x: `Faz-se o presente **ADITAMENTO**, subscrito apenas pelo Tabelionato, para suprir omissões e corrigir erros evidentes do ato originário, sem alteração da vontade das partes nem da substância do ato, nos termos do art. 385 do ${CNSNR}.` });
      itens.push({ tt: 'PARTES DO ATO ADITADO', x: `**A) ${qA.tt}:** ${semPonto(qA.x)}; **B) ${qB.tt}:** ${semPonto(qB.x)}. As partes não comparecem a este ato, que é subscrito apenas pelo Tabelionato, na forma do item I.` });
      itens.push({ tt: 'OBJETO', x: `Trata-se de Aditamento à ${orig}, das notas desta Serventia, para aditar ${oque}.` });
      itens.push({ tt: 'ADITAMENTO', x: `Fica **ADITADA** a Escritura Pública objeto do presente instrumento, para que passe a constar a seguinte redação: “{…} ${item} {…}”.` });
      itens.push({ tt: 'EFICÁCIA', x: '**A)** Os demais dados constantes da Escritura Pública, aditada neste ato, mantêm-se inalterados em todos os seus termos; **B)** A presente Escritura de Aditamento deve ser apresentada em conjunto com a Escritura Pública originária, para os devidos fins de publicidade.' });
      itens.push({ tt: 'COMUNICAÇÕES', x: `**A)** ${CENSEC}; **B) ANOTAÇÃO:** A circunstância deste aditamento será anotada à margem da Escritura Pública originária, nos termos do art. 385 e do art. 247, inc. X, do CNSNR.` });
      fecho = `**NADA MAIS**, do que **DOU FÉ**. Eu, ${lavCargo}, que o digitei, conferi e li, subscrevo em público e raso, encerrando o presente ato, do que **DOU FÉ**. Selo: ${selo}. Assina somente o **${(ct.cargoCurto || cargo).toUpperCase()}**.`;
    } else {
      abertura = `Saibam todos quantos virem este público instrumento que, ${data}, ${ct.localRev || ct.localTrad || '[[local da lavratura xxx]]'}, em Cartório, eu, ${ct.cargoCurto || cargo}, a requerimento verbal da parte interessada, lavro o presente aditamento.`;
      itens.push({ tr: 'DO FUNDAMENTO', x: 'Este aditamento, subscrito apenas por mim, supre omissão e corrige erro evidente do ato originário, sem alterar a vontade das partes nem a substância do ato, na forma do art. 385 do Código de Normas dos Serviços Notariais e de Registro do Estado do Pará – CNSNR.' });
      itens.push({ tr: 'DAS PARTES DO ATO ADITADO', x: `São partes do ato aditado: **a)** ${semPonto(qA.x)}; e **b)** ${semPonto(qB.x)}. As partes não comparecem a este aditamento, que subscrevo sozinho, na forma do item I.` });
      itens.push({ tr: 'DO ATO ADITADO', x: `O ato aditado é a ${orig}, das notas desta Serventia. O aditamento refere-se a ${oque}.` });
      itens.push({ tr: 'DO ADITAMENTO', x: `O item ${tit || '[[número e título do item corrigido xxx]]'} da escritura aditada passa a ter a seguinte redação: “${red || '[[redação completa e já corrigida do item xxx]]'}”.` });
      itens.push({ tr: 'DA EFICÁCIA', x: 'Permanecem inalterados todos os demais termos da escritura aditada. Este aditamento deve ser apresentado em conjunto com a escritura originária.' });
      itens.push({ tr: 'DAS ANOTAÇÕES E COMUNICAÇÕES', x: `Anotarei este aditamento à margem da escritura originária, conforme os arts. 247, X, e 385 do CNSNR, e comunicarei este ato à Central Notarial de Serviços Eletrônicos Compartilhados – CENSEC no prazo legal, conforme os arts. 264 e seguintes do ${CNN}.` });
      itens.push({ tr: 'DO ENCERRAMENTO', x: `Eu, **${lav}**, ${cargo}, o lavrei, conferi, li e subscrevo e encerro o ato. Dou fé. Selo: ${selo}.` });
    }
  } else {
    const todos = { pessoas: [...c.A.pessoas, ...c.B.pessoas], pl: true, g: 'M' };
    titulo = `**ESCRITURA PÚBLICA DE RERRATIFICAÇÃO** DA ESCRITURA PÚBLICA DE ${NAT}, QUE FAZEM ${nomesTitulo(todos)}, NA FORMA ABAIXO:`;
    const consta = F('m_adConsta', 'redação atual do trecho'), passa = F('m_adPassa', 'nova redação do trecho');
    const ri = $('m_adRI') ? $('m_adRI').checked : true;
    if (trad) {
      abertura = `Saibam quantos este público instrumento virem que, ${data}, ${ct.localTrad || '[[local da lavratura xxx]]'}, em Cartório, perante mim, ${lavCargo}, compareceram:`;
      itens.push({ tt: 'PARTES', x: `**A)** ${semPonto(qA.x)}; **B)** ${semPonto(qB.x)}. Documentos arquivados em classificador próprio desta Serventia.` });
      itens.push(itIdentidade(c));
      itens.push({ tt: 'VONTADE', x: `Então, pelas **PARTES**, que são os mesmos comparecentes da escritura pública objeto de correção, me foi dito que é de sua vontade a lavratura da presente Escritura Pública de Rerratificação, para corrigir ${oque}, nos termos do art. 386 do ${CNSNR}.` });
      itens.push({ tt: 'OBJETO', x: `Trata-se de Rerratificação da ${orig}, das notas ${notas}.` });
      itens.push({ tt: 'RERRATIFICAÇÃO', x: `Fica **RERRATIFICADA** a Escritura Pública objeto desta, para que, onde consta: “${consta}”, passe a constar: “${passa}”, ficando **RATIFICADOS** todos os seus demais termos, cláusulas e condições.` });
      itens.push({ tt: 'EFICÁCIA', x: '**A)** Os demais dados constantes da Escritura Pública, rerratificada neste ato, mantêm-se inalterados em todos os seus termos; **B)** A presente Escritura de Rerratificação deve ser apresentada em conjunto com a Escritura Pública originária, para os devidos fins de publicidade.' });
      itens.push(itLGPD(c));
      itens.push({ tt: 'DECLARAÇÕES', x: '**A)** As **PARTES** declaram que não são pessoas expostas politicamente, atualmente ou nos últimos 05 (cinco) anos, não são familiares de pessoas expostas politicamente, bem como não são colaboradoras estreitas de pessoas expostas politicamente, declarando, ainda, para todos os fins de direito que, os dados constantes desta escritura são **VERDADEIROS**, ciente que quaisquer inconsistências podem trazer as sanções expostas na lei, nos termos do art. 145, §6º, do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial (Provimento CNJ nº 149/2023); **B)** As **PARTES** afirmam sob responsabilidade civil e criminal que os fatos e declarações prestadas são a exata expressão da verdade e que aceitam esta escritura em todos os seus termos, por se acharem de inteiro e pleno acordo com o ajustado e contratado entre si, ressalvando eventuais erros, omissões ou direito de terceiros e, por conseguinte, eximindo esta serventia de quaisquer responsabilidades oriundas em razão dessas declarações.' });
      itens.push({ tt: 'COMUNICAÇÕES', x: `**A)** ${CENSEC}; **B) ANOTAÇÃO:** A presente **RERRATIFICAÇÃO** será anotada à margem da Escritura Pública originária ou, se esta tiver sido lavrada em outra Serventia, comunicada ao notário que a lavrou, para as anotações remissivas, nos termos do art. 386 e do art. 247, inc. X, do CNSNR e do art. 272, § 4º, do ${CNN}.` });
      if (ri) itens.push({ tt: 'REGISTRO DE IMÓVEIS', x: 'As **PARTES** autorizam o Ofício de Registro de Imóveis competente a proceder a todos os atos de registro e averbação decorrentes da presente rerratificação, e foram devidamente orientadas a protocolá-la juntamente com a Escritura Pública originária.' });
      fecho = `**ASSIM** o disseram, do que **DOU FÉ**, me pediram este público instrumento, que lhes lavrei nas minhas notas. **NADA MAIS ME FOI DITO**, lido e achado conforme, aceitam, concordam e outorgam, dispensada a presença das testemunhas instrumentárias, do que **DOU FÉ**. Eu, ${lavCargo}, que o digitei, conferi e li, subscrevo em público e raso, encerrando o presente ato, do que **DOU FÉ**. Selo: ${selo}. Assinam as **PARTES** qualificadas no item I e o **${(ct.cargoCurto || cargo).toUpperCase()}**.`;
    } else {
      abertura = `Saibam todos quantos virem este público instrumento que, ${data}, ${ct.localRev || ct.localTrad || '[[local da lavratura xxx]]'}, em Cartório, perante mim, ${ct.cargoCurto || cargo}, compareceram as partes a seguir qualificadas.`;
      itens.push({ tr: 'DAS PARTES', x: `**a)** ${semPonto(qA.x)}; e **b)** ${semPonto(qB.x)}.` });
      itens.push(itIdentidade(c));
      itens.push({ tr: 'DO FUNDAMENTO', x: 'As partes são os mesmos comparecentes da escritura objeto de correção e comparecem para corrigir incorreção ou omissão que não constitui mero erro evidente, na forma do art. 386 do Código de Normas dos Serviços Notariais e de Registro do Estado do Pará – CNSNR.' });
      itens.push({ tr: 'DO ATO RERRATIFICADO', x: `O ato rerratificado é a ${orig}, das notas ${notas}. A correção refere-se a ${oque}.` });
      itens.push({ tr: 'DA RERRATIFICAÇÃO', x: `As partes retificam a escritura para que, onde consta “${consta}”, passe a constar “${passa}”, e ratificam todos os seus demais termos, cláusulas e condições.` });
      itens.push({ tr: 'DA EFICÁCIA', x: 'Permanecem inalterados todos os demais termos da escritura rerratificada. Esta rerratificação deve ser apresentada em conjunto com a escritura originária.' });
      itens.push({ tr: 'DAS DECLARAÇÕES', x: 'Sob as penas da lei: **a)** as partes declaram que não são, nem foram nos últimos cinco anos, pessoas expostas politicamente, e que não são familiares nem estreitos colaboradores de pessoas nessa condição, nos termos do art. 145, § 6º, do Código Nacional de Normas da Corregedoria Nacional de Justiça – Foro Extrajudicial (Provimento CNJ nº 149/2023); **b)** as partes declaram que as informações prestadas neste ato são verdadeiras, assumem por elas a responsabilidade civil e criminal e isentam esta Serventia de responsabilidade por erros, omissões ou direitos de terceiros não declarados.' });
      itens.push(itLGPD(c));
      itens.push({ tr: 'DAS ANOTAÇÕES E COMUNICAÇÕES', x: `Anotarei esta rerratificação à margem da escritura originária ou, se esta tiver sido lavrada em outra serventia, comunicarei este ato ao notário que a lavrou, para as anotações remissivas, conforme o art. 386 do CNSNR e o art. 272, § 4º, do ${CNN}. Comunicarei também este ato à Central Notarial de Serviços Eletrônicos Compartilhados – CENSEC no prazo legal, conforme os arts. 264 e seguintes do mesmo Código.` });
      if (ri) itens.push({ tr: 'DO REGISTRO IMOBILIÁRIO', x: 'As partes autorizam o Ofício de Registro de Imóveis competente a praticar os atos de registro e averbação decorrentes desta rerratificação e foram orientadas a protocolá-la juntamente com a escritura originária.' });
      itens.push({ tr: 'DO ENCERRAMENTO', x: `Assim o disseram e me pediram que lavrasse este instrumento, o qual, lido em voz alta e achado conforme, aceitam, outorgam e assinam, dispensada a presença de testemunhas instrumentárias. Eu, **${lav}**, ${cargo}, o lavrei, conferi, li e subscrevo e encerro o ato. Dou fé. Selo: ${selo}.` });
    }
  }
  const aj = aplicarAjustes(c, itens, { ementa: titulo, fecho: trad ? fecho : undefined });
  let corpo = abertura + ' ' + aj.itens.map((it, i) => `__${romano(i + 1)} – ${trad ? (it.tt || it.tr) : (it.tr || it.tt)}:__ ${it.x}`).join(' ');
  if (trad) corpo += ' ' + aj.fecho;
  // Aditamento: só o tabelião assina. Rerratificação: as partes do ato corrigido e o tabelião.
  const ass = [];
  if (!ad) [[c.A, c.rA, 'm_aQual'], [c.B, c.rB, 'm_bQual']].forEach(([G, base, qual]) => G.pessoas.forEach(p =>
    ass.push([p.nome.toUpperCase(), p.papel || cap(nome(base, { pl: false, g: generoPessoa(p.nome, v(qual), G.g) }).toLowerCase())])));
  ass.push([ct.lavrador || 'NOME DE QUEM LAVRA', cargo]);
  const p = (cls, s) => `<p class="${cls}">${marcacao(s)}</p>`;
  $('mDoc').innerHTML = timbreHTML('tela') + atoHTML() + p('ementa', aj.ementa) + fimMinuta(corpo, ct, ass);
  mostrarAvisos(ad ? ['Aditamento: só para erro evidente, sem mudar a vontade das partes (art. 385 do CNSNR). Se o erro foi do cartório, o ato é gratuito e usa o selo Gratuito (art. 386, § 1º).'] : []);
}

// Corpo + local/data + assinaturas. Regras do usuário: assinaturas nunca sozinhas numa página (o fim do texto,
// a data e as assinaturas ficam presos uns aos outros) e nunca duas linhas em branco seguidas (segurança).
function fimMinuta(corpo, ct, ass) {
  return `<p class="corpo junto">${marcacao(negritarNomes(corpo))}</p>` +
    `<p class="c data junto">${marcacao(`${ct.cidadeData || '[[cidade/UF xxx]]'}, ${dataCurta(v('m_data')) || '[[data xxx]]'}.`)}</p>` +
    // nomes nas assinaturas sem negrito (regra do usuário; no texto, os nomes das partes ficam em negrito)
    ass.map(([n, r], i) => `<div class="ass${i < ass.length - 1 ? ' junto' : ''}">______________________________________________<br>${esc(n)}${r ? '<br>' + esc(r).replace(/\n/g, '<br>') : ''}</div>`).join('');
}

/* Ajustes por item: o que fazemos à mão nas minutas especiais, guardado junto com a escritura.
   Para cada item (por redação e tipo de ato): "proprio" substitui o texto gerado, "mais" é acrescentado ao fim e
   "novo" ("TÍTULO: texto") cria um item logo depois. Também a ementa e o fecho da redação tradicional. */
let AJ = {};
const ajChave = (c, tit) => `${c.trad ? 'trad' : 'rev'}|${c.m}|${tit}`;
const ajTexto = s => String(s || '').replace(/\s*\n\s*/g, ' ').trim();
function aplicarAjustes(c, itens, extras) {
  const out = [], lista = [];
  for (const it of itens) {
    const tit = c.trad ? (it.tt || it.tr) : (it.tr || it.tt), a = AJ[ajChave(c, tit)] || {};
    lista.push({ tit, gerado: it.x });
    const x = (ajTexto(a.proprio) || it.x) + (ajTexto(a.mais) ? ' ' + ajTexto(a.mais) : '');
    out.push({ ...it, x });
    const m = ajTexto(a.novo).match(/^([^:]{2,90}):\s*(.+)$/);
    if (m) out.push({ tt: m[1].trim().toUpperCase(), tr: m[1].trim().toUpperCase(), x: m[2].trim() });
  }
  // Ementa (no começo) e fecho da redação tradicional (no fim): só "texto próprio" e, no fecho, "acrescentar".
  const res = { itens: out, ementa: extras.ementa, fecho: extras.fecho };
  for (const k of ['ementa', 'fecho']) {
    if (extras[k] === undefined) continue;
    const tit = k.toUpperCase(), a = AJ[ajChave(c, tit)] || {};
    lista[k === 'ementa' ? 'unshift' : 'push']({ tit, gerado: extras[k], so: true });
    res[k] = (ajTexto(a.proprio) || extras[k]) + (k === 'fecho' && ajTexto(a.mais) ? ' ' + ajTexto(a.mais) : '');
  }
  montarPainelItens(c, lista);
  return res;
}
// Painel "Ajustar o texto de cada item": refeito só quando muda a lista de itens (para não perder o que se digita).
function montarPainelItens(c, todos) {
  const box = $('mItens');
  if (!box) return;
  montarPainelItens.gerados = Object.fromEntries(todos.map(i => [ajChave(c, i.tit), i.gerado]));
  const assin = todos.map(i => ajChave(c, i.tit)).join('¦');
  const marca = k => { const a = AJ[k] || {}; return a.proprio || a.mais || a.novo ? ' ✎' : ''; };
  if (box.dataset.assin === assin) { box.querySelectorAll('details[data-k]').forEach(d => { d.querySelector('summary .aj').textContent = marca(d.dataset.k); }); return; }
  box.dataset.assin = assin;
  box.innerHTML = todos.map(i => {
    const k = ajChave(c, i.tit), a = AJ[k] || {};
    return `<details data-k="${esc(k)}"><summary>${esc(i.tit)}<span class="aj">${marca(k)}</span></summary>` +
      `<label class="f">Texto próprio (substitui o gerado)</label><textarea data-campo="proprio">${esc(a.proprio || '')}</textarea>` +
      `<button type="button" data-copiar>Copiar o texto gerado para editar</button>` +
      (i.so && i.tit === 'EMENTA' ? '' : `<label class="f">Acrescentar ao fim</label><textarea class="curto" data-campo="mais">${esc(a.mais || '')}</textarea>`) +
      (i.so ? '' : `<label class="f">Novo item logo depois (TÍTULO: texto)</label><textarea class="curto" data-campo="novo">${esc(a.novo || '')}</textarea>`) +
      '</details>';
  }).join('');
}
function ligarPainelItens() {
  const box = $('mItens');
  if (!box) return;
  box.addEventListener('input', e => {
    const d = e.target.closest('details[data-k]'), campo = e.target.dataset.campo;
    if (!d || !campo) return;
    const k = d.dataset.k, a = AJ[k] = AJ[k] || {};
    if (e.target.value.trim()) a[campo] = e.target.value; else delete a[campo];
    if (!Object.keys(a).length) delete AJ[k];
    gerarMinuta(); agendarGuardarMinuta();
  });
  box.addEventListener('click', e => {
    if (!e.target.matches('[data-copiar]')) return;
    const d = e.target.closest('details[data-k]'), ta = d.querySelector('[data-campo="proprio"]');
    ta.value = (montarPainelItens.gerados || {})[d.dataset.k] || '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/* Dados da minuta guardados na escritura (gerar de novo nunca perde o que foi digitado). */
function dadosMinutaForm() {
  const campos = {};
  document.querySelectorAll('#mForm input, #mForm select, #mForm textarea').forEach(el => {
    if (!el.id || el.id === 'mEsc' || el.closest('#mItens')) return;
    campos[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return { v: 1, campos, ajustes: JSON.parse(JSON.stringify(AJ)), salvoEm: agora() };
}
function aplicarDadosMinuta(d) {
  for (const [id, val] of Object.entries(d.campos || {})) {
    const el = $(id);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!val; else el.value = val;
  }
  AJ = JSON.parse(JSON.stringify(d.ajustes || {}));
  if ($('mItens')) $('mItens').dataset.assin = '';
  aoMudarModal.ultimo = v('m_modal'); // não troca o imposto escolhido
}
async function guardarMinutaNaEscritura() {
  const id = $('mEsc').value;
  if (!id) return false;
  const e = await Reg.get('escrituras', id);
  if (!e) return false;
  e.minutaDados = dadosMinutaForm();
  await Reg.salvar('escrituras', e);
  return true;
}
function agendarGuardarMinuta() {
  if (!$('mEsc') || !$('mEsc').value) return;
  clearTimeout(agendarGuardarMinuta.t);
  agendarGuardarMinuta.t = setTimeout(() => guardarMinutaNaEscritura().catch(e => aviso('Não guardou a minuta: ' + e.message, 'erro')), 3000);
}

const TITULOS = {
  cv: 'ESCRITURA PÚBLICA DE COMPRA E VENDA', dacao: 'ESCRITURA PÚBLICA DE DAÇÃO EM PAGAMENTO',
  inventario: 'ESCRITURA PÚBLICA DE INVENTÁRIO E PARTILHA', divorcio: 'ESCRITURA PÚBLICA DE DIVÓRCIO CONSENSUAL COM PARTILHA DE BENS'
};

function gerarMinuta() {
  const c = contexto();
  if (c.m === 'procuracao') return gerarProcuracao(c);
  if (c.m === 'aditamento' || c.m === 'rerratificacao') return gerarCorrecao(c);
  const itens = { cv: itensCompraVenda, dacao: itensDacao, inventario: itensInventario, divorcio: itensDivorcio }[c.m](c);

  let titulo;
  if (c.m === 'inventario') titulo = `**${TITULOS.inventario}** DOS BENS DEIXADOS POR ${v('m_falNome') ? '**' + v('m_falNome').toUpperCase() + '**' : '[[nome do autor da herança xxx]]'}, NA FORMA ABAIXO:`;
  else if (c.m === 'divorcio') titulo = `**${TITULOS.divorcio}** QUE FAZEM ${nomesTitulo(c.A)}, NA FORMA ABAIXO:`;
  else {
    const rA = nome(c.rA, c.A), rB = nome(c.rB, c.B);
    titulo = c.trad
      ? `**${TITULOS[c.m]}** QUE TEM COMO ${rA} ${nomesTitulo(c.A)} E COMO ${rB} ${nomesTitulo(c.B)}, NA FORMA ABAIXO:`
      : `**${TITULOS[c.m]}** QUE FAZEM, COMO ${rA}, ${nomesTitulo(c.A)} E, COMO ${rB}, ${nomesTitulo(c.B)}, NA FORMA ABAIXO:`;
  }

  const data = dataExtenso(v('m_data')) || '[[data da lavratura por extenso xxx]]';
  // Quem lava e onde: vêm do cartório escolhido no topo.
  const ct = C(), lav = ct.lavrador ? `**${ct.lavrador}**` : '[[nome de quem lavra xxx]]', cargo = ct.cargo || '[[cargo xxx]]';
  const abertura = c.trad
    ? `Saibam quantos este público instrumento virem que, ${data}, ${ct.localTrad || '[[local da lavratura (distrito, comarca e município) xxx]]'}, em Cartório, perante mim, ${ct.lavrador ? `**${ct.lavrador} – ${cargo}**` : `${lav} – ${cargo}`}, compareceram:`
    : `Saibam todos quantos virem este público instrumento que, ${data}, ${ct.localRev || ct.localTrad || '[[local da lavratura xxx]]'}, em Cartório, perante mim, ${ct.cargoCurto || cargo}, compareceram as partes a seguir qualificadas.`;
  const selo = F('m_selo', 'número do selo');
  // Assinatura a rogo (art. 215, § 2º, do CC; art. 255, §§ 1º a 3º, do CNSNR) – aprovado em 24/10/2026.
  const rogoQuem = v('m_rogoQuem');
  if (rogoQuem) {
    const q = `**${rogoQuem.toUpperCase()}**`, motivo = F('m_rogoMotivo', 'motivo: não sabe ou não pode assinar'), por = F('m_rogoPor', 'nome e qualificação de quem assina a rogo');
    itens.push({ tt: 'ASSINATURA A ROGO', tr: 'DA ASSINATURA A ROGO', x: c.trad
      ? `Como ${q} ${motivo}, a seu pedido assina a seu rogo ${por}, pessoa de sua confiança e alheia à estrutura desta Serventia, nos termos do art. 215, § 2º, do Código Civil e do art. 255, §§ 1º a 3º, do CNSNR, sendo colhida a impressão digital do polegar direito de ${q}.`
      : `Como ${q} ${motivo}, assina a seu rogo, a seu pedido, ${por}, pessoa de sua confiança e alheia à estrutura desta Serventia (art. 215, § 2º, do Código Civil; art. 255, §§ 1º a 3º, do CNSNR), e foi colhida a impressão digital do polegar direito de ${q}.` });
  }
  const quemAssina = c.m === 'inventario' || c.m === 'divorcio'
    ? `os ${R([c.A, c.rA])}, o **ADVOGADO**`
    : `${art.o(c.A)} ${R([c.A, c.rA])}${c.pres.replace(/,$/, '')}, ${art.o(c.B)} ${R([c.B, c.rB])}`;
  if (!c.trad) itens.push({ tr: 'DO ENCERRAMENTO', x: `Assim o disseram e me pediram que lavrasse este instrumento, o qual, lido em voz alta e achado conforme, aceitam, outorgam e assinam, dispensada a presença de testemunhas instrumentárias. Eu, ${lav}, ${cargo}, o lavrei, conferi, li e subscrevo e encerro o ato. Dou fé. Selo: ${selo}.` });

  // Ajustes de cada item (texto próprio, acréscimo, item novo) – como fazemos à mão nas minutas especiais.
  const fecho = c.trad ? `**ASSIM** o disseram, do que **DOU FÉ**, me pediram este público instrumento, que lhes lavrei nas minhas notas. **NADA MAIS ME FOI DITO**, lido e achado conforme, aceitam, concordam e outorgam, dispensada a presença das testemunhas instrumentárias, do que **DOU FÉ**. Eu, ${ct.lavrador ? `**${ct.lavrador} – ${cargo}**` : `${lav} – ${cargo}`}, que o digitei, conferi e li, subscrevo em público e raso, encerrando o presente ato, do que **DOU FÉ**. Selo: ${selo}. Assinam ${quemAssina} e o **${(ct.cargoCurto || cargo).toUpperCase()}**.` : undefined;
  const aj = aplicarAjustes(c, itens, { ementa: titulo, fecho });
  titulo = aj.ementa;
  // Numeração romana e referências cruzadas entre itens ({{objeto}}, {{titulo}}, {{divida}}, {{cessao}}).
  const ref = {};
  aj.itens.forEach((it, i) => { if (it.k) ref[it.k] = romano(i + 1); });
  let corpo = abertura + ' ' + aj.itens.map((it, i) => `__${romano(i + 1)} – ${c.trad ? (it.tt || it.tr) : (it.tr || it.tt)}:__ ${it.x}`).join(' ');
  if (c.trad) corpo += ' ' + aj.fecho;
  corpo = corpo.replace(/\{\{(\w+)\}\}/g, (_, k) => ref[k] || `[[item ${k} xxx]]`);

  const ass = [];
  const papelDe = (p, base, qual, G) => p.papel || cap(nome(base, { pl: false, g: generoPessoa(p.nome, v(qual), G.g) }).toLowerCase());
  const aRogo = p => rogoQuem && p.nome.trim().toUpperCase() === rogoQuem.trim().toUpperCase();
  const addGrupo = (G, base, qual) => G.pessoas.forEach(p => ass.push(aRogo(p)
    ? [`A ROGO DE ${p.nome.toUpperCase()}`, (v('m_rogoPor').replace(/\*\*/g, '').split(',')[0].trim().toUpperCase() || 'QUEM ASSINA A ROGO') + ' – ' + papelDe(p, base, qual, G)]
    : [p.nome.toUpperCase(), papelDe(p, base, qual, G)]));
  addGrupo(c.A, c.rA, 'm_aQual');
  if (c.B) addGrupo(c.B, c.rB, 'm_bQual');
  if (c.m === 'inventario' || c.m === 'divorcio') ass.push([(v('m_adv').replace(/\*\*/g, '').split(',')[0].trim() || 'ADVOGADO').toUpperCase(), 'Advogado']);
  ass.push([ct.lavrador || 'NOME DE QUEM LAVRA', cargo]);

  const p = (cls, s) => `<p class="${cls}">${marcacao(s)}</p>`;
  $('mDoc').innerHTML = timbreHTML('tela') + atoHTML() + p('ementa', titulo) + fimMinuta(corpo, ct, ass);
  mostrarAvisos(avisosMinuta(c));
}

// Avisos para quem lavra (não entram no texto): outorga do cônjuge (art. 256 do CNSNR), prazos das certidões.
function avisosMinuta(c) {
  const av = [], qa = v('m_aQual');
  const iso = s => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
  const dias = de => { const d = iso(de), a = v('m_data') || hojeISO(); return d ? Math.round((new Date(a) - new Date(d)) / 864e5) : null; };
  if ((c.m === 'cv' || c.m === 'dacao') && /\bcasad[oa]\b/i.test(qa) && c.A.pessoas.length === 1)
    av.push('Alienante casado e o cônjuge não está entre os outorgantes: colher a outorga do cônjuge (art. 256 do CNSNR; CC, art. 1.647), salvo separação convencional de bens ou participação final com livre disposição.');
  if ((c.m === 'cv' || c.m === 'dacao') && /uni[aã]o est[aá]vel|convivente|companheir[oa]/i.test(qa) && !/n[aã]o (vive|viver|conviver|convive)/i.test(qa))
    av.push('Alienante em união estável: por cautela, colher a anuência do companheiro (comentário ao art. 256 do CNSNR).');
  const dRi = dias(v('m_riData'));
  if (dRi !== null && dRi > 30) av.push(`A certidão de inteiro teor tem ${dRi} dias: para a escritura, a eficácia é de 30 dias (art. 259, III, do CNSNR). Pedir certidão atualizada.`);
  const dCas = dias(v('m_casExp'));
  if (dCas !== null && dCas > 90) av.push(`A certidão de casamento tem ${dCas} dias: o limite é 90 dias (art. 261, parágrafo único, do CNSNR).`);
  return av;
}
function mostrarAvisos(av) {
  const box = $('mAvisos');
  if (box) box.innerHTML = av.map(a => `<div class="aviso">${esc(a)}</div>`).join('');
}

function aoMudarModal() {
  const m = v('m_modal'), imovel = v('m_imovel');
  document.querySelectorAll('#mForm fieldset[data-modal]').forEach(f => f.classList.toggle('hidden', !f.dataset.modal.split(' ').includes(m)));
  document.querySelectorAll('#mForm fieldset[data-imovel]').forEach(f => f.classList.toggle('hidden', f.dataset.imovel !== imovel));
  $('lblA').textContent = { cv: 'Vendedores', dacao: 'Devedores', inventario: 'Herdeiros e meeiro', divorcio: 'Divorciandos', procuracao: 'Mandantes (outorgantes)', aditamento: 'Partes do ato corrigido – outorgantes (vendedores)', rerratificacao: 'Partes do ato corrigido – outorgantes (vendedores)' }[m];
  $('lblB').textContent = { cv: 'Compradores', dacao: 'Credores', procuracao: 'Procuradores (mandatários)', aditamento: 'Partes do ato corrigido – outorgados (compradores)', rerratificacao: 'Partes do ato corrigido – outorgados (compradores)' }[m] || '';
  const tipoProc = v('m_procTipo');
  $('boxProcBem').classList.toggle('hidden', tipoProc !== 'imovel');
  $('lblProcPoderes').textContent = tipoProc === 'outra' ? 'Poderes conferidos' : 'Poderes adicionais (opcional)';
  $('boxAGen').classList.toggle('hidden', m === 'divorcio' || m === 'inventario');
  $('lblValor').textContent = { cv: 'Preço e pagamento', dacao: 'Valor da dívida', inventario: 'Valor dos bens e partilha', divorcio: 'Valor do imóvel e partilha' }[m];
  $('lblValorCampo').textContent = { cv: 'Preço (R$)', dacao: 'Valor da dívida / atribuído ao imóvel (R$)', inventario: 'Monte-mor (R$)', divorcio: 'Valor atribuído ao imóvel (R$)' }[m];
  $('lblImp').textContent = m === 'inventario' ? 'Imposto (ITCMD)' : 'Imposto (ITBI)';
  $('boxCessao').classList.toggle('hidden', !$('m_cessao').checked);
  $('boxAfor').classList.toggle('hidden', !$('m_afor').checked);
  if (aoMudarModal.ultimo !== m) {
    $('m_imp').value = { cv: 'pendente', dacao: 'pendente', inventario: 'pago', divorcio: 'nao_incide', procuracao: 'nao_incide', aditamento: 'nao_incide', rerratificacao: 'nao_incide' }[m];
    aoMudarModal.ultimo = m;
  }
  gerarMinuta();
}

function nomeArquivoMinuta() {
  const c = contexto(), prim = p => (p ? semAcento(p.nome.split(' ')[0]).toUpperCase() : 'xxx');
  if (c.m === 'procuracao') return nomePasta(`${v('m_num') || 'NNN'} - PROCURACAO ${prim(c.A.pessoas[0])} PARA ${prim(c.B.pessoas[0])} - LIVRO ${v('m_livro') || 'xxx'} FOLHAS ${formatarFolhas(v('m_folhas')) || 'xxx'} (${c.trad ? 'TRADICIONAL' : 'REVISADO'})`.replace(/\//g, '-'), 180);
  // Nome fixo da pasta 01 (regra do usuário, 27/10/2026): "NNN - ESCRITURA X PARA Y - MINUTA (TRADICIONAL|REVISADO)";
  // salvar de novo substitui o mesmo arquivo (nunca cópia).
  const tipo = { cv: '', dacao: 'DACAO EM PAGAMENTO ', inventario: 'INVENTARIO ', divorcio: 'DIVORCIO ', aditamento: 'ADITAMENTO ', rerratificacao: 'RERRATIFICACAO ' }[c.m];
  const partes = c.m === 'inventario' ? `DE ${semAcento(v('m_falNome').split(' ')[0] || 'xxx').toUpperCase()}`
    : c.m === 'divorcio' ? `${prim(c.A.pessoas[0])} E ${prim(c.A.pessoas[1])}` : `${prim(c.A.pessoas[0])} PARA ${prim(c.B.pessoas[0])}`;
  return nomePasta(`${v('m_num') || 'NNN'} - ESCRITURA ${tipo}${partes} - MINUTA (${c.trad ? 'TRADICIONAL' : 'REVISADO'})`, 180);
}

// Timbre da minuta: faixa azul com o selo e o texto do cartório (Ajustes → Cartório → Timbre da minuta).
// Sem rodapé: o fim da página fica livre para a assinatura eletrônica.
// No Word, a imagem vai pelo endereço completo do app (o Word baixa ao abrir) e o layout em tabela.
// Modelo 13 (aprovado): faixa azul com selo, nome e atribuições à esquerda; titular, cargo e endereço à direita.
function timbreHTML(modo) {
  const ct = C(), l = (ct.timbre || ct.cabecalho || ct.nome || '').split('\n').map(s => s.trim()).filter(Boolean);
  const src = ct.logo ? (modo === 'word' ? new URL(ct.logo, location.href).href : ct.logo) : '';
  const cor = ct.cor || '#14284b';
  const [l1 = '', l2 = '', l3 = '', ...resto] = l;
  // Coluna da direita: "NOME – Cargo" vira duas linhas; o endereço pode ter até duas linhas.
  const titular = resto.join(' · ').split(/\s+[–-]\s+/);
  const direita = [[titular[0] || '', true], [titular.slice(1).join(' – '), false],
    ...(ct.endereco ? ct.endereco.split('\n').map(x => [x.trim(), false]) : [['endereço do cartório – preencher em Ajustes', false]])].filter(([t]) => t);
  if (modo === 'word') {
    const linhaDir = direita.map(([t, forte]) => `<span style="font-size:${forte ? '9' : '8.5'}pt;color:${forte ? '#ffffff' : '#dfe5ef'}">${forte ? '<b>' + esc(t) + '</b>' : esc(t)}</span>`).join('<br>');
    // Faixa de borda a borda da folha (recuo negativo = margem esquerda); o conteúdo fica alinhado às margens do texto.
    return `<table width="794" style="width:${WORD_FOLHA.larg}pt;margin-left:-${WORD_FOLHA.esq}pt;border-collapse:collapse;margin-bottom:0" cellpadding="0" cellspacing="0"><tr>` +
      `<td bgcolor="${cor}" style="background:${cor};padding:10pt ${WORD_FOLHA.dir}pt 8pt ${WORD_FOLHA.esq}pt;border-bottom:3pt solid #c49a3a">` +
      `<table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr>` +
      (src ? `<td style="width:108pt;vertical-align:middle"><img src="${src}" width="115" height="115"></td>` : '') +
      `<td style="vertical-align:middle;font-family:'Arial Narrow',Arial;color:#ffffff">` +
      `<span style="font-family:Georgia,serif;font-size:15pt;font-weight:bold;color:#ffffff;letter-spacing:2pt">${esc(l1)}</span><br>` +
      `<span style="font-size:9.5pt;color:#dfe5ef">${esc(l2)}</span><br>` +
      `<span style="font-size:9pt;color:#e8d3a2;letter-spacing:.5pt">${esc(l3)}</span></td>` +
      `<td style="vertical-align:middle;text-align:right;border-left:1pt solid #c49a3a;padding-left:9pt;font-family:'Arial Narrow',Arial;white-space:nowrap">${linhaDir}</td>` +
      `</tr></table></td></tr></table>`;
  }
  return `<div class="timbre">${src ? `<img src="${src}" alt="">` : ''}<div class="esq"><div class="t1">${esc(l1)}</div><div class="t2">${esc(l2)}</div>` +
    `<div class="t3">${esc(l3)}</div></div><div class="dir">${direita.map(([t, forte]) => `<div${forte ? ' class="forte"' : ''}>${esc(t)}</div>`).join('')}</div></div>`;
}

// Folhas no padrão do livro: três dígitos, início/fim ("10 a 11" → "010/011"; "10v" mantém o verso).
function formatarFolhas(s) {
  const nums = String(s || '').match(/\d+\s*[vV]?/g);
  if (!nums) return String(s || '').trim();
  const f = n => n.replace(/\s+/g, '').replace(/^\d+/, d => d.padStart(3, '0')).toLowerCase();
  return nums.length > 1 ? f(nums[0]) + '/' + f(nums[nums.length - 1]) : f(nums[0]);
}

// Dados do ato logo abaixo do timbre (mudam a cada escritura; vazios saem em vermelho):
// Livro na margem esquerda, Data no centro e Folhas na margem direita. Tabela sem bordas para o Word manter as posições.
// Folha A4 do Word em pontos: largura e margens esquerda (3 cm) e direita (2 cm).
const WORD_FOLHA = { larg: 595.3, esq: 85.05, dir: 56.7 };

// Linha Livro/Data/Folhas logo abaixo da faixa, também de borda a borda (no Word por recuo negativo; na tela pelo CSS).
function atoHTML(modo) {
  const w = modo === 'word';
  const cel = (rot, val, faltando, alinh, pad) => `<td style="width:33.3%;text-align:${alinh};padding:3pt ${pad[1] || 0}pt 1pt ${pad[0] || 0}pt;vertical-align:bottom">` +
    `<span style="font-family:Arial,sans-serif;font-size:7pt;letter-spacing:1.2px;color:#888">${rot}</span> ` +
    (val ? `<b style="font-size:10pt;color:${C().cor || '#14284b'}">${esc(val)}</b>` : `<b style="font-size:10pt;color:#d00000">${faltando} xxx</b>`) + '</td>';
  const tab = w ? `width="794" style="width:${WORD_FOLHA.larg}pt;margin:0 0 10pt -${WORD_FOLHA.esq}pt;` : 'width="100%" style="width:100%;margin:0 0 10pt;';
  return `<table class="ato" ${tab}border-collapse:collapse;border-bottom:1px solid #c49a3a" cellpadding="0" cellspacing="0"><tr>` +
    cel('LIVRO', v('m_livro'), 'livro', 'left', w ? [WORD_FOLHA.esq] : []) + cel('DATA', v('m_data') ? dataBR(v('m_data')) : '', 'data', 'center', []) +
    cel('FOLHAS', formatarFolhas(v('m_folhas')), 'folhas', 'right', w ? [0, WORD_FOLHA.dir] : []) + '</tr></table>';
}

// Medidas do Word para a minuta (em pontos), conferidas no Word com documentos gerados por esta função: área útil da
// folha A4 (29,7 cm − 4,9 cm do cabeçalho com o timbre − 2 cm embaixo), linha do texto (1,5 em Arial Narrow 12),
// linha da assinatura (espaçamento simples) e o espaço para assinar (1 cm).
const WORD_MEDIDAS = { util: 646.3, linha: 20.7, linhaAss: 14.1, espacoAss: 28.35 };

// Fonte do Word disponível neste aparelho? (largura com a fonte pedida diferente da fonte de reserva = existe)
function temFonte(nome) {
  const c = document.createElement('canvas').getContext('2d'), t = 'mmmmmmmmmmlli JÁ 0123456789';
  return ['monospace', 'serif'].some(r => { c.font = `72px ${r}`; const a = c.measureText(t).width; c.font = `72px "${nome}", ${r}`; return c.measureText(t).width !== a; });
}

// Linhas da ementa e do texto no Word – contadas pela quebra de linhas do navegador com a mesma fonte e a mesma largura
// do texto (16 cm). Sem Arial Narrow no aparelho, usa Arial na largura equivalente (a Narrow é a Arial a 82%).
// Sem nenhuma das duas, devolve null (não dá para medir).
function linhasMinutaWord() {
  const doc = $('mDoc'), ementa = doc && doc.querySelector('p.ementa'), corpo = doc && doc.querySelector('p.corpo');
  if (!ementa || !corpo) return null;
  const narrow = temFonte('Arial Narrow');
  if (!narrow && !temFonte('Arial')) return null;
  const med = document.createElement('div');
  med.style.cssText = `position:absolute;left:-99999px;top:0;visibility:hidden;width:${narrow ? 16 : 16 / 0.82}cm;` +
    `font-family:${narrow ? '"Arial Narrow"' : 'Arial'},sans-serif;font-size:12pt;line-height:20px;text-align:justify`;
  document.body.appendChild(med);
  const linhas = (el, recuo) => {
    const p = document.createElement('p'); p.style.cssText = `margin:0;text-indent:${recuo}`; p.innerHTML = el.innerHTML;
    med.appendChild(p); return Math.round(p.getBoundingClientRect().height / 20);
  };
  const lE = linhas(ementa, '0'), lC = linhas(corpo, narrow ? '3.75cm' : 3.75 / 0.82 + 'cm');
  med.remove();
  // Conferido no Word (14 minutas de 104 a 173 linhas): o texto dá sempre 2 linhas a menos que no navegador.
  return { lE, lC: lC - 2 };
}

// Quanto sobra (em pontos) na última folha do Word depois do "Bujaru/PA, data.", com a entrelinha do texto "lt" (pt).
function sobraUltimaPagina(med, lt = WORD_MEDIDAS.linha) {
  if (!med) return null;
  const M = WORD_MEDIDAS, topo1 = med.lE * M.linha + 18, porFolha = Math.floor(M.util / lt);
  const naFolha1 = Math.max(0, Math.floor((M.util - topo1) / lt));
  // Linha sozinha no alto da folha: o Word leva mais uma junto (controle de linhas órfãs).
  const naUltima = (med.lC - naFolha1) % porFolha || porFolha;
  let usado = med.lC <= naFolha1 ? topo1 + med.lC * lt : Math.max(naUltima, 2) * lt;
  // Se nem o "Bujaru/PA, data." cabe, o Word o leva para a folha seguinte com 2 linhas do texto.
  if (usado + 12 + M.linha > M.util) usado = 2 * lt;
  return M.util - usado - 12 - M.linha; // espaço depois do texto + linha "Bujaru/PA, data."
}

// Como ficam as assinaturas (regra 3b do usuário, na ordem): 1) uma coluna, se couberem com o fim do texto;
// 2) duas colunas; 3) duas colunas com a entrelinha do texto um pouco menor (como no LIVRO: 17,75 a 17 pt para 18 pt,
// fonte igual); 4) duas colunas na entrelinha normal (último caso: o Word desce linhas do texto para não separar).
const ENTRELINHAS_MINUTA = [148, 146, 144, 142];
function planoAssinaturas(blocos, med) {
  const M = WORD_MEDIDAS, n = b => b.split('<br>').length, folga = 6; // erro medido no Word: até 1,2 pt
  const uma = blocos.reduce((s, b) => s + M.espacoAss + n(b) * M.linhaAss, 0);
  let duas = 0; for (let i = 0; i < blocos.length; i += 2) duas += M.espacoAss + Math.max(...blocos.slice(i, i + 2).map(n)) * M.linhaAss;
  const sobra = sobraUltimaPagina(med);
  if (sobra === null) return { colunas: blocos.length > 1, entrelinha: 150, sobra };
  if (sobra >= uma + folga || blocos.length < 2) return { colunas: false, entrelinha: 150, sobra };
  if (sobra >= duas + folga) return { colunas: true, entrelinha: 150, sobra };
  for (const pct of ENTRELINHAS_MINUTA) {
    const s = sobraUltimaPagina(med, M.linha * pct / 150);
    if (s >= duas + folga) return { colunas: true, entrelinha: pct, sobra: s };
  }
  return { colunas: true, entrelinha: 150, sobra, apertado: true };
}

// Último caso da regra: avisa quem gera a minuta (o Word vai descer linhas do texto para não separar as assinaturas).
function avisarPlanoAssinaturas() {
  if (blobMinutaWord.plano && blobMinutaWord.plano.apertado)
    aviso('Atenção: as assinaturas não cabem na última folha nem em 2 colunas com a entrelinha menor. O Word vai descer ' +
      'linhas do texto para a folha seguinte (fica um espaço no fim da folha anterior). Ajuste o texto se quiser evitar.', 'erro');
}

// Assinaturas no Word (regra do usuário: nunca sozinhas, nunca partidas, sem lacuna). Uma coluna quando cabem na
// última folha junto com o fim do texto; senão, grade em 2 colunas (quem lavra centralizado na última linha, se ímpar),
// com o mesmo 1 cm para assinar. Cada bloco fica inteiro ("manter linhas juntas") e preso ao seguinte.
// Sem medida possível no aparelho, usa as 2 colunas, que ocupam menos espaço.
function assinaturasWord(blocos, colunas) {
  const est = ultimo => 'text-align:center;margin:1cm 0 0;line-height:normal;page-break-inside:avoid;mso-pagination:widow-orphan lines-together' +
    (ultimo ? '' : ';page-break-after:avoid');
  if (!colunas) return blocos.map((b, i) => `<p class="ass" style="${est(i === blocos.length - 1)}">${b}</p>`).join('');
  const pares = []; for (let i = 0; i < blocos.length; i += 2) pares.push(blocos.slice(i, i + 2));
  const cel = (b, ultima, larga) => `<td${larga ? ' colspan="2"' : ''} style="width:${larga ? 100 : 50}%;vertical-align:top;padding:0 4pt">` +
    `<p class="ass" style="${est(ultima)}">${b.replace(/^_+/, '______________________________')}</p></td>`;
  return '<table class="ass2" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">' +
    pares.map((par, i) => { const ult = i === pares.length - 1;
      return `<tr style="page-break-inside:avoid">${par.length === 2 ? cel(par[0], ult) + cel(par[1], ult) : cel(par[0], ult, true)}</tr>`; }).join('') +
    '</table>';
}

function blobMinutaWord() {
  gerarMinuta();
  // Folha A4 (21 × 29,7 cm), margens 2 cm e 3 cm à esquerda. Timbre e Livro/Data/Folhas no CABEÇALHO de todas as
  // folhas (pedido do usuário, como na lavrada): faixa encostada no topo; o texto começa logo abaixo (4,9 cm).
  const estilo = `@page Folha{size:21cm 29.7cm;margin:4.9cm 2cm 2cm 3cm;mso-header-margin:0;mso-footer-margin:1cm;mso-header:h1;mso-paper-source:0}
    div.Folha{page:Folha}
    body{font-family:'Arial Narrow',Arial,sans-serif;font-size:12pt} p{text-align:justify;margin:0 0 12pt;line-height:150%}
    .dir{text-align:right} .c{text-align:center} .corpo{text-indent:3.75cm} .red{color:#FF0000;font-weight:bold}
    .ass{text-align:center;margin-top:1cm;page-break-inside:avoid} p.data{margin-bottom:0} p.ementa{margin-bottom:18pt} .junto{page-break-after:avoid}`;
  const word = '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->';
  // O Word só lê UMA classe por elemento ("corpo junto" vira só "corpo") e não leva "manter com o próximo" de <div>:
  // por isso o fim do texto, a data e as assinaturas vão como <p> com o estilo escrito no próprio elemento – assim as
  // assinaturas nunca ficam sozinhas na última página quando a minuta é aberta direto no Word (regra do usuário).
  // Assinaturas: uma coluna se couberem na última folha com o fim do texto; senão, 2 colunas (planoAssinaturas).
  const blocos = [], med = linhasMinutaWord();
  let plano = { colunas: false, entrelinha: 150 };
  let corpoWord = $('mDoc').innerHTML
    .replace(/^<div class="timbre">[\s\S]*?<\/div><\/div><\/div>/, '').replace(/<table class="ato"[\s\S]*?<\/table>/, '')
    .replace(/(?:<div class="ass(?: junto)?">[\s\S]*?<\/div>)+/, grupo => {
      grupo.replace(/<div class="ass(?: junto)?">([\s\S]*?)<\/div>/g, (_, x) => blocos.push(x));
      return '\u0000ASS\u0000'; })
    .replace(/<p class="([^"]*)\bjunto\b([^"]*)">/g, (_, a, b) => `<p class="${(a + b).trim()}" style="page-break-after:avoid${/\bdata\b/.test(a + b) ? ';margin-bottom:0' : ''}">`);
  if (blocos.length) plano = planoAssinaturas(blocos, med);
  corpoWord = corpoWord.replace('\u0000ASS\u0000', () => assinaturasWord(blocos, plano.colunas));
  if (plano.entrelinha !== 150) corpoWord = corpoWord.replace('<p class="corpo" style="page-break-after:avoid', `<p class="corpo" style="page-break-after:avoid;line-height:${plano.entrelinha}%`);
  blobMinutaWord.plano = plano; // para conferência (testes)
  // Definição do cabeçalho no fim do corpo, fora da folha (o Word a usa como cabeçalho e não a mostra no texto).
  const cab = timbreHTML('word') + atoHTML('word').replace(/margin:0 0 10pt /, 'margin:0 0 0 ');
  // A linha da tabela tem altura exata de 1 pt: a definição não ocupa espaço nem cria folha em branco no fim.
  const defCab = `<table style="margin-left:50in" cellpadding="0" cellspacing="0"><tr style="height:1pt;mso-height-rule:exactly"><td><div style="mso-element:header" id="h1">${cab}</div></td></tr></table>`;
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8">${word}<style>${estilo}</style></head><body><div class="Folha">${corpoWord}${defCab}</div></body></html>`;
  return new Blob(['﻿', doc], { type: 'application/msword' });
}

// Preenche a minuta a partir de uma escritura cadastrada.
const NATUREZA_MODAL = n => /ADITAMENTO/i.test(n) ? 'aditamento' : /RERRATIFICA/i.test(n) ? 'rerratificacao' : /PROCURA/i.test(n) ? 'procuracao' : /INVENT/i.test(n) ? 'inventario' : /DIV[OÓ]RCIO/i.test(n) ? 'divorcio' : /DA[CÇ][AÃ]O/i.test(n) ? 'dacao' : 'cv';
async function minutaDaEscritura(id) {
  const e = id && await Reg.get('escrituras', id);
  if (!e) return;
  $('mEsc').value = id;
  // Minuta já trabalhada nesta escritura: volta exatamente como estava (campos e ajustes por item).
  if (e.minutaDados) aplicarDadosMinuta(e.minutaDados);
  else { AJ = {}; $('m_modal').value = NATUREZA_MODAL(e.natureza || ''); }
  const limpar = s => String(s || '').replace(/^[A-ZÇÃÁÉÍÓÚ ]+:\s*/i, '').split(/\s+E\s+|,\s*/).map(x => x.trim()).filter(Boolean).join('\n');
  if (e.outorgantes && !v('m_aNomes')) $('m_aNomes').value = limpar(e.outorgantes);
  if (e.outorgados && !v('m_bNomes')) $('m_bNomes').value = limpar(e.outorgados);
  if (e.livro) $('m_livro').value = e.livro;
  if (e.folhas) $('m_folhas').value = e.folhas;
  if (e.selo) $('m_selo').value = e.selo;
  // Só o preço declarado vai para o preço da minuta; a base de cálculo pode ser o valor venal.
  if (e.preco) $('m_valor').value = brl(e.preco);
  if (e.venal && !v('m_venal')) $('m_venal').value = brl(e.venal);
  $('m_imovel').value = e.rural ? 'rural' : 'urbano';
  // Certidões anotadas na escritura vão para a minuta (sem apagar o que já foi digitado aqui).
  const ce = e.certidoes || {};
  Object.entries({ tj: 'm_certTJ', tst: 'm_certTST', trf: 'm_certTRF', sefa: 'm_certSEFA', cndPJ: 'm_cndPJ', casExp: 'm_casExp', riData: 'm_riData', hash: 'm_hash' })
    .forEach(([k, idc]) => { if (ce[k] && !v(idc)) $(idc).value = ce[k]; });
  Object.entries({ tj: 'm_dispTJ', tst: 'm_dispTST', trf: 'm_dispTRF', sefa: 'm_dispSEFA' }).forEach(([k, idc]) => { $(idc).checked = !!(ce.disp || {})[k]; });
  aoMudarModal();
}

// Ao trocar de cartório: tabela, atos adicionais e minuta passam a ser os dele.
function recarregarFerramentas() { montarTipos(); montarAvulsos(); montarItens(); calcular(); gerarMinuta(); }

/* --------------------------- Ligações --------------------------- */
function iniciarFerramentas() {
  montarTipos(); montarAvulsos(); montarItens(); calcular(); montarChecklist();
  formatarAoSair($('valor'));
  $('tipo').addEventListener('change', () => { montarItens(); calcular(); });
  $('item').addEventListener('change', () => { atualizarQtd(); calcular(); });
  ['valor', 'qtd'].forEach(id => $(id).addEventListener('input', calcular));
  ['nOnus', 'rural'].forEach(id => $(id).addEventListener('change', calcular));
  $('copiar').addEventListener('click', () => copiar(resumoTexto, $('copiar')));
  $('irChecklist').addEventListener('click', () => {
    $('cModal').value = tipoAtual().modal || 'cv';
    $('cImovel').value = $('rural').checked ? 'rural' : 'urbano';
    montarChecklist(); abrirSub('check');
  });
  $('irOrcamento').addEventListener('click', () => Orc.novo({ preco: lerValor($('valor').value), onus: +$('nOnus').value, rural: $('rural').checked }));

  ['cModal', 'cImovel', 'cCasados', 'cPJ', 'cProc', 'cCond', 'cMenor'].forEach(id => $(id).addEventListener('change', montarChecklist));
  $('cCopiar').addEventListener('click', () => copiarChecklist($('cCopiar')));
  $('cPDF').addEventListener('click', () => imprimirChecklist($('cPDF')));
  $('cMinuta').addEventListener('click', () => {
    $('m_modal').value = $('cModal').value; $('m_imovel').value = $('cImovel').value; $('m_cond').checked = $('cCond').checked;
    aoMudarModal(); abrirSub('minuta');
  });

  ['m_modal', 'm_imovel', 'm_procTipo', 'm_cessao', 'm_afor'].forEach(id => $(id).addEventListener('change', aoMudarModal));
  // Município: preenche os dados do cadastro fiscal (o usuário pode alterar depois).
  $('m_munPreset').addEventListener('change', () => {
    const p = MUNICIPIOS[v('m_munPreset')];
    if (p) { $('m_municipio').value = p.mun; $('m_cadSigla').value = p.sigla; $('m_cadNome').value = p.nome; $('m_cadOrgao').value = p.orgao; }
    gerarMinuta();
  });
  document.querySelectorAll('#mForm input, #mForm select, #mForm textarea').forEach(el => {
    if (el.closest('#mItens')) return;
    if (!['m_modal', 'm_imovel', 'mEsc', 'm_munPreset', 'm_cessao', 'm_afor'].includes(el.id))
      el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', gerarMinuta);
    if (el.id !== 'mEsc') el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', agendarGuardarMinuta);
  });
  ligarPainelItens();
  $('mGuardar').addEventListener('click', async () => {
    if (!$('mEsc').value) return aviso('Escolha a escritura (pasta) no topo do formulário.', 'erro');
    try { await guardarMinutaNaEscritura(); aviso('Dados da minuta guardados na escritura.'); } catch (e) { aviso(e.message, 'erro'); }
  });
  ['m_venal', 'm_valor', 'm_impValor', 'm_impBase'].forEach(id => formatarAoSair($(id)));
  $('m_folhas').addEventListener('blur', () => { $('m_folhas').value = formatarFolhas(v('m_folhas')); });
  $('m_data').value = hojeISO();
  $('mEsc').addEventListener('change', () => minutaDaEscritura($('mEsc').value));
  $('mWord').addEventListener('click', () => { baixarBlob(blobMinutaWord(), nomeArquivoMinuta() + '.doc'); avisarPlanoAssinaturas(); });
  $('mCopiar').addEventListener('click', () => copiar($('mDoc').innerText, $('mCopiar')));
  $('mSalvar').addEventListener('click', async () => {
    const id = $('mEsc').value;
    if (!id) return aviso('Escolha a escritura (pasta) no topo do formulário.', 'erro');
    const b = $('mSalvar'); b.disabled = true;
    try {
      await guardarMinutaNaEscritura();
      const nomeArq = await Esc.salvarNaSubpasta(id, '01 - MINUTA', nomeArquivoMinuta() + '.doc', blobMinutaWord());
      aviso('Minuta salva em 01 - MINUTA: ' + nomeArq);
      avisarPlanoAssinaturas();
    } catch (e) { aviso(e.message, 'erro'); } finally { b.disabled = false; }
  });
  aoMudarModal();
}
