// Comunicações obrigatórias dos atos lavrados (escrituras e procurações):
// CENSEC (quinzenal, inclusive negativa), DOI à Receita Federal (por ato, mês seguinte) e COAF (análise de cada ato
// e comunicação anual de não ocorrência). O app monta as listas sozinho a cada quinzena e confere a sequência de
// livro e folhas DUAS vezes; nada é dado como enviado sem a autorização do tabelião, com um clique, aqui no app.
// A transmissão em si é feita no site oficial (CENSEC e DOI-Web pedem login próprio).

// Feriados nacionais fixos (os municipais e móveis, como Carnaval e Sexta-feira Santa, não entram: confira o calendário).
const FERIADOS_FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const ehDiaUtil = iso => { const s = new Date(iso + 'T12:00:00').getDay(); return s !== 0 && s !== 6 && !FERIADOS_FIXOS.includes(iso.slice(5)); };
const proxDiaUtil = iso => { while (!ehDiaUtil(iso)) iso = somaDias(iso, 1); return iso; };
const ultimoDiaUtil = ym => { let iso = somaDias(mesSeguinte(ym) + '-01', -1); while (!ehDiaUtil(iso)) iso = somaDias(iso, -1); return iso; };

// Quinzena "AAAA-MM-1" (dias 1 a 15) ou "AAAA-MM-2" (16 ao fim do mês).
const quinzenaDe = iso => `${iso.slice(0, 7)}-${Number(iso.slice(8, 10)) <= 15 ? 1 : 2}`;
function infoQuinzena(q) {
  const ym = q.slice(0, 7), n = Number(q.slice(8));
  return {
    q, ym, n, ini: ym + (n === 1 ? '-01' : '-16'), fim: n === 1 ? ym + '-15' : somaDias(mesSeguinte(ym) + '-01', -1),
    // CENSEC: 1ª quinzena até o dia 20; 2ª quinzena até o dia 5 do mês seguinte (próximo dia útil).
    prazo: proxDiaUtil(n === 1 ? ym + '-20' : mesSeguinte(ym) + '-05'),
    nome: `${n}ª quinzena de ${nomeMes(ym)}`
  };
}
// Quinzenas já encerradas desde o início do controle (com ou sem atos: sem atos, a CENSEC é negativa).
function quinzenasEncerradas(inicio, hoje) {
  const r = [];
  for (let q = quinzenaAnterior(quinzenaDe(hoje)); infoQuinzena(q).fim >= inicio && r.length < 120; q = quinzenaAnterior(q)) r.push(q);
  return r.reverse();
}
const quinzenaAnterior = q => q.endsWith('-2') ? q.slice(0, 7) + '-1' : (() => { const [a, m] = q.split('-').map(Number); return m === 1 ? `${a - 1}-12-2` : `${a}-${String(m - 1).padStart(2, '0')}-2`; })();

// Livro e folhas: "24 - P" = "024-P"; folhas em meias-folhas (frente = 2n, verso = 2n+1).
const normLivro = l => semAcento(String(l || '')).toUpperCase().replace(/\s+/g, '').replace(/^(\d+)/, d => d.padStart(3, '0')).replace(/^(\d+)([A-Z])$/, '$1-$2');
function lerFolhas(txt) {
  const p = String(txt || '').match(/\d+\s*v?/gi);
  if (!p) return null;
  const u = s => parseInt(s, 10) * 2 + (/v/i.test(s) ? 1 : 0);
  // "254/255": o ato vai até o fim da folha 255 (o verso pode estar escrito ou em branco).
  const fim = parseInt(p[p.length - 1], 10) * 2 + 1;
  return { ini: u(p[0]), fim: Math.max(u(p[0]), fim) };
}
const rotFolha = u => String(Math.floor(u / 2)).padStart(3, '0') + (u % 2 ? 'v' : '');
const numFolha = u => String(Math.floor(u / 2)).padStart(3, '0');
// Meias-folhas faltantes -> "fls. 245 a 253" / "fl. 263".
function faixasFolhas(us) {
  const nums = [...new Set(us.map(u => Math.floor(u / 2)))].sort((a, b) => a - b), r = [];
  for (const n of nums) { const ult = r[r.length - 1]; if (ult && n === ult[1] + 1) ult[1] = n; else r.push([n, n]); }
  return r.map(([a, b]) => a === b ? `fl. ${String(a).padStart(3, '0')}` : `fls. ${String(a).padStart(3, '0')} a ${String(b).padStart(3, '0')}`).join(', ');
}
// "030, 031v, 040 a 042" -> conjunto de meias-folhas inutilizadas.
function lerInutilizadas(txt) {
  const s = new Set();
  String(txt || '').split(/[,;\n]+/).forEach(parte => {
    const f = lerFolhas(parte);
    if (!f) return;
    const fim = f.fim % 2 === 0 ? f.fim + 1 : f.fim; // folha sem "v" = frente e verso
    for (let u = f.ini; u <= fim; u++) s.add(u);
  });
  return s;
}

// Data a partir da qual o app controla as comunicações (antes disso, foram feitas fora do app).
const inicioCom = () => CFG.comInicio || '2026-10-01';
const noControle = e => !!e.dataLavratura && e.dataLavratura >= inicioCom();

const Com = {
  // Quais comunicações cada ato exige.
  tipos(e) {
    const n = semAcento(`${e.natureza || ''} ${e.nome || ''}`).toUpperCase(), proc = /PROCURA/.test(n);
    // Atos acessórios citam "compra e venda" no nome, mas não transmitem o imóvel: sem DOI e sem análise COAF.
    const acessorio = /ADITAMENTO|RERRATIF|RE-RATIF|RETIFICA|INSTITUICAO DE ONUS|ANUENCIA|CANCELAMENTO|DECLARAT|ATA NOTARIAL|SUBSTABELEC|REVOGA/.test(n);
    // Ato de outro escrevente: entra só na conferência do livro (sequência); as comunicações dele não são feitas aqui.
    const meu = !e.outroEscrevente;
    return {
      censec: /INVENT|DIVORC|SEPARA/.test(n) ? 'CESDI' : /TESTAMENT/.test(n) ? 'RCTO' : 'CEP',
      doi: meu && !proc && !acessorio && /COMPRA|VENDA|DACAO|DOACAO|CESSAO|INVENT|PARTILHA|DIVORC|PERMUTA|INTEGRALIZ/.test(n),
      coaf: meu && !proc && !acessorio
    };
  },
  chave: q => `${CFG.cartorioAtual}|${q}`,

  async lavradas() { return (await Reg.doCartorio('escrituras')).filter(e => e.situacao === 'LAVRADA' && !e.excluido); },

  // Conferência da sequência de livro e folhas. Erros bloqueiam o envio; avisos pedem atenção.
  conferir(lavradas, q) {
    const qi = infoQuinzena(q);
    const doPeriodo = lavradas.filter(e => e.dataLavratura && e.dataLavratura >= qi.ini && e.dataLavratura <= qi.fim);
    const prob = [];
    const nomeAto = e => `${e.nome}${e.livro ? ` (livro ${normLivro(e.livro)}, fls. ${formatarFolhas(e.folhas) || '?'})` : ''}`;
    // Lavradas sem data: um aviso só (a lista completa fica no próprio aviso).
    const semData = lavradas.filter(e => !e.dataLavratura);
    if (semData.length) prob.push({ g: 'aviso', id: semData[0].id, t: `${semData.length} ato(s) LAVRADO(S) sem data da lavratura (não entram em nenhuma quinzena; se algum for desta quinzena, informe a data): ${semData.map(e => e.nome).join('; ')}.` });
    doPeriodo.forEach(e => {
      if (!e.livro) prob.push({ g: 'erro', id: e.id, t: `Sem número do livro: ${e.nome}` });
      if (!lerFolhas(e.folhas)) prob.push({ g: 'erro', id: e.id, t: `Sem folhas: ${e.nome}` });
      if (!e.selo) prob.push({ g: 'aviso', id: e.id, t: `Sem selo digital: ${e.nome}` });
    });
    // Sequência de cada livro usado na quinzena (o livro inteiro, para ver a ligação com os atos anteriores e seguintes).
    const livros = [...new Set(doPeriodo.filter(e => e.livro).map(e => normLivro(e.livro)))].sort();
    const resumoLivros = [];
    for (const L of livros) {
      const inut = lerInutilizadas(CFG.folhasInutilizadas[`${CFG.cartorioAtual}|${L}`]);
      const atos = lavradas.filter(e => normLivro(e.livro) === L && lerFolhas(e.folhas))
        .map(e => ({ e, f: lerFolhas(e.folhas) })).sort((a, b) => a.f.ini - b.f.ini || (a.e.dataLavratura || '').localeCompare(b.e.dataLavratura || ''));
      const noPeriodo = x => doPeriodo.includes(x.e);
      const doLivro = atos.filter(noPeriodo);
      if (doLivro.length) resumoLivros.push(`Livro ${L}: ${doLivro.length} ato(s), fls. ${rotFolha(doLivro[0].f.ini)} a ${numFolha(doLivro[doLivro.length - 1].f.fim)}`);
      for (let i = 1; i < atos.length; i++) {
        const a = atos[i - 1], b = atos[i];
        if (!noPeriodo(a) && !noPeriodo(b)) continue;
        if (b.f.ini <= a.f.fim) {
          prob.push({ g: 'erro', id: b.e.id, t: `Livro ${L}: folha usada duas vezes – ${nomeAto(a.e)} vai até a fl. ${numFolha(a.f.fim)} e ${nomeAto(b.e)} começa na fl. ${rotFolha(b.f.ini)}.` });
          continue;
        }
        const faltam = [];
        for (let u = a.f.fim + 1; u < b.f.ini; u++) if (!inut.has(u)) faltam.push(u);
        if (faltam.some(u => u % 2 === 0)) prob.push({ g: 'erro', id: b.e.id, t: `Livro ${L}: ${faixasFolhas(faltam.filter(u => u % 2 === 0))} sem ato, entre ${nomeAto(a.e)} e ${nomeAto(b.e)}. Se o ato existe, registre-o (com pasta ou em "Registrar ato sem pasta"); se a folha foi inutilizada, registre em "Folhas inutilizadas".` });
        else if (faltam.length) prob.push({ g: 'aviso', id: b.e.id, t: `Livro ${L}: verso ${faltam.map(rotFolha).join(', ')} sem ato entre ${nomeAto(a.e)} e ${nomeAto(b.e)}. Confirme se ficou em branco (inutilizado).` });
        if (a.e.dataLavratura && b.e.dataLavratura && b.e.dataLavratura < a.e.dataLavratura)
          prob.push({ g: 'aviso', id: b.e.id, t: `Livro ${L}: a data de ${nomeAto(b.e)} (${dataBR(b.e.dataLavratura)}) é anterior à do ato da folha antes dele (${dataBR(a.e.dataLavratura)}).` });
      }
      // Primeiro ato do livro na quinzena sem nenhum ato antes: confirmar que o livro começa ali.
      const prim = atos.findIndex(noPeriodo);
      if (prim === 0 && atos[0].f.ini > 2 && ![...Array(atos[0].f.ini - 2).keys()].every(k => inut.has(k + 2)))
        prob.push({ g: 'aviso', id: atos[0].e.id, t: `Livro ${L}: não há ato cadastrado antes da fl. ${rotFolha(atos[0].f.ini)}. Confira se os atos anteriores do livro estão no app.` });
    }
    const assinatura = doPeriodo.map(e => [e.id, normLivro(e.livro), formatarFolhas(e.folhas), e.selo, e.dataLavratura].join('~')).sort().join('|') +
      '#' + livros.map(L => CFG.folhasInutilizadas[`${CFG.cartorioAtual}|${L}`] || '').join('|');
    // Para a CENSEC deste app: só os atos do Luís (os de outros escreventes servem só para fechar a sequência).
    const censecAtos = doPeriodo.filter(e => !e.outroEscrevente);
    return { qi, doPeriodo, censecAtos, prob, erros: prob.filter(p => p.g === 'erro').length, avisos: prob.filter(p => p.g === 'aviso').length, resumoLivros, assinatura };
  },

  // Situação das duas conferências da quinzena (valem só se nada mudou depois delas).
  estadoConf(q, assinatura) {
    const c = CFG.comConferencias[this.chave(q)] || {};
    const ok = n => c[n] && c[n].assinatura === assinatura;
    return { c1: ok('c1') ? c.c1 : null, c2: ok('c2') ? c.c2 : null, mudou: (c.c1 && !ok('c1')) || (c.c2 && !ok('c2')) };
  },
  envio: (q, tipo) => CFG.comEnvios[`${Com.chave(q)}|${tipo}`],

  /* ------------------------------ Tela ------------------------------ */
  async render() {
    const lav = await this.lavradas();
    $('comInicio').value = inicioCom();
    const hoje = hojeISO(), atual = quinzenaDe(hoje);
    const lista = [atual];
    for (let i = 0; i < 23; i++) lista.push(quinzenaAnterior(lista[lista.length - 1]));
    const sel = $('comQuinzena');
    if (!sel.value || !lista.includes(sel.value)) {
      // Abre na quinzena encerrada mais antiga ainda sem CENSEC autorizada (ou na anterior à atual).
      const pend = quinzenasEncerradas(inicioCom(), hoje).find(q => lista.includes(q) && !this.envio(q, 'censec'));
      sel.dataset.q = pend || lista[1];
    } else sel.dataset.q = sel.value;
    sel.innerHTML = lista.map(q => {
      const qi = infoQuinzena(q), env = this.envio(q, 'censec');
      const n = lav.filter(e => e.dataLavratura && quinzenaDe(e.dataLavratura) === q).length;
      const marca = env ? '✓' : qi.fim < inicioCom() ? '–' : q === atual ? '…' : qi.prazo < hoje ? '⚠' : '•';
      return `<option value="${q}">${marca} ${qi.nome} – ${n} ato(s)</option>`;
    }).join('');
    sel.value = sel.dataset.q;
    const q = sel.value, r = this.conferir(lav, q), qi = r.qi, st = this.estadoConf(q, r.assinatura);
    const liberado = !!(st.c1 && st.c2) && !r.erros;
    const envC = this.envio(q, 'censec');
    const emAndamento = qi.fim >= hoje;

    // Quadro de situação
    const doMes = lav.filter(e => mesDe(e.dataLavratura) === qi.ym);
    const doiPend = lav.filter(e => this.tipos(e).doi && !(e.comunicacoes || {}).doi && noControle(e));
    const coafPend = lav.filter(e => this.tipos(e).coaf && !(e.comunicacoes || {}).coaf && noControle(e));
    $('comKpis').innerHTML = `
      <div class="kpi ${envC ? '' : 'destaque'}"><small>CENSEC – ${qi.nome}</small><b>${envC ? 'Autorizada' : r.censecAtos.length ? r.censecAtos.length + ' ato(s)' : 'Negativa'}</b><span>${envC ? 'em ' + dataBR(envC.data) + (envC.protocolo ? ' · ' + esc(envC.protocolo) : '') : 'prazo ' + dataBR(qi.prazo)}</span></div>
      <div class="kpi"><small>Conferência das folhas</small><b>${st.c2 ? '2 de 2' : st.c1 ? '1 de 2' : '0 de 2'}</b><span>${r.erros} erro(s) · ${r.avisos} aviso(s)</span></div>
      <div class="kpi"><small>DOI pendentes (todas)</small><b>${doiPend.length}</b><span>${doiPend.length ? 'mais antiga vence ' + dataBR(ultimoDiaUtil(mesSeguinte(doiPend.map(e => mesDe(e.dataLavratura)).sort()[0]))) : 'em dia'}</span></div>
      <div class="kpi"><small>COAF – atos a analisar</small><b>${coafPend.length}</b><span>não ocorrência anual até 31/01</span></div>`;

    // 1) Conferência dupla
    const btnConf = !st.c1 ? '<button class="prim" id="comConf1">Fazer a 1ª conferência</button>'
      : !st.c2 ? '<button class="prim" id="comConf2">Fazer a 2ª conferência</button>' : '';
    $('comConf').innerHTML = `<h2>1. Conferência do livro e das folhas</h2>
      <div class="hint">Antes de qualquer comunicação, a sequência de folhas de cada livro usado na quinzena é conferida duas vezes, em momentos separados. A 2ª conferência relê as pastas do Drive. Se algo mudar depois, as conferências precisam ser refeitas.</div>
      ${qi.fim < inicioCom() ? '<div class="aviso">Quinzena anterior ao início do controle no app (' + dataBR(inicioCom()) + '): só para consulta ou conferência.</div>' : ''}
      ${emAndamento ? '<div class="aviso">Esta quinzena ainda não terminou. Faça as conferências depois do último dia (' + dataBR(qi.fim) + ').</div>' : ''}
      ${st.mudou ? '<div class="aviso">Os atos ou as folhas mudaram depois da conferência anterior. Refaça a conferência.</div>' : ''}
      <ul class="passos">
        <li class="${st.c1 ? 'ok' : ''}">1ª conferência: ${st.c1 ? 'feita em ' + new Date(st.c1.em).toLocaleString('pt-BR') : 'pendente'}</li>
        <li class="${st.c2 ? 'ok' : ''}">2ª conferência: ${st.c2 ? 'feita em ' + new Date(st.c2.em).toLocaleString('pt-BR') : 'pendente'}</li>
      </ul>
      <div class="hint">${r.resumoLivros.map(esc).join('<br>') || 'Nenhum ato lavrado nesta quinzena.'}</div>
      ${r.prob.length ? `<ul class="problemas">${r.prob.map(p => `<li class="${p.g}" data-esc="${esc(p.id)}">${p.g === 'erro' ? 'ERRO' : 'Atenção'}: ${esc(p.t)}</li>`).join('')}</ul>` : '<div class="okmsg">Sequência de folhas sem falhas.</div>'}
      <div class="hint">O livro só fecha se TODOS os atos estiverem no app. Ato lavrado fora das pastas dos parceiros (pela titular, por exemplo): use "Registrar ato sem pasta".</div>
      <div class="acoes">${btnConf}<button id="comExterno">Registrar ato sem pasta</button><button id="comInut">Folhas inutilizadas</button><button id="comAtualizar">Reler pastas e traslados do Drive</button></div>`;

    // 2) CENSEC
    const linhas = r.censecAtos.sort((a, b) => normLivro(a.livro).localeCompare(normLivro(b.livro)) || ((lerFolhas(a.folhas) || {}).ini || 0) - ((lerFolhas(b.folhas) || {}).ini || 0));
    $('comCensec').innerHTML = `<h2>2. CENSEC – ${qi.nome}</h2>
      <div class="hint">Escrituras e procurações (CEP); inventários e divórcios (CESDI). Prazo: ${dataBR(qi.prazo)}. Sem atos, a comunicação é NEGATIVA.</div>
      <div class="rolagem"><table class="tab"><thead><tr><th>Data</th><th>Módulo</th><th>Ato</th><th>Livro / folhas</th><th>Selo</th></tr></thead><tbody>
      ${linhas.map(e => `<tr class="clic" data-esc="${esc(e.id)}"><td>${dataBR(e.dataLavratura)}</td><td>${this.tipos(e).censec}</td><td>${esc(e.natureza || '')}<br><small>${esc(e.nome)}</small></td><td>${esc(normLivro(e.livro))} / ${esc(formatarFolhas(e.folhas))}</td><td>${esc(e.selo || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="vazio">Nenhum ato: comunicação NEGATIVA.</td></tr>'}
      </tbody></table></div>
      ${envC && envC.assinatura !== r.assinatura ? '<div class="aviso">Os atos desta quinzena mudaram DEPOIS da autorização. Confira se é preciso retificar a comunicação na CENSEC.</div>' : ''}
      ${envC ? `<div class="okmsg">Autorizada por você em ${new Date(envC.em).toLocaleString('pt-BR')}${envC.protocolo ? ' · protocolo ' + esc(envC.protocolo) : ''}.</div>` : ''}
      <div class="acoes">
        <button id="comCsv">Baixar relação (CSV)</button>
        <a class="btn" href="https://www.censec.org.br" target="_blank" rel="noopener">Abrir CENSEC</a>
        ${envC ? '' : `<button class="prim" id="comAutCensec" ${liberado ? '' : 'disabled'}>Autorizar envio à CENSEC</button>`}
      </div>
      ${envC || liberado ? '' : '<div class="hint">O botão de autorizar libera depois das duas conferências, sem nenhum erro.</div>'}`;

    // 3) DOI (por ato; prazo: último dia útil do mês seguinte ao da lavratura)
    const prazoDoi = ultimoDiaUtil(mesSeguinte(qi.ym));
    const atosDoi = doMes.filter(e => this.tipos(e).doi);
    $('comDoi').innerHTML = `<h2>3. DOI – Receita Federal (${nomeMes(qi.ym)})</h2>
      <div class="hint">Atos com transmissão de imóvel. Prazo: ${dataBR(prazoDoi)} (último dia útil do mês seguinte). A entrega é feita no DOI-Web, com a conta gov.br.</div>
      <div class="lista">${atosDoi.map(e => {
        const d = (e.comunicacoes || {}).doi, conf = this.estadoConf(quinzenaDe(e.dataLavratura), this.conferir(lav, quinzenaDe(e.dataLavratura)).assinatura);
        const pode = conf.c1 && conf.c2;
        return `<div class="item"><div><div class="t">${esc(e.nome)}</div><div class="s">${dataBR(e.dataLavratura)} · livro ${esc(normLivro(e.livro))} fls. ${esc(formatarFolhas(e.folhas))}${e.base ? ' · R$ ' + brl(e.base) : ''}</div></div>
          <div class="v">${d ? `<span class="selo pago">AUTORIZADA ${dataBR(d.data)}</span>` : `<button class="peq" data-ficha="${esc(e.id)}">Ficha</button> <button class="peq prim" data-doi="${esc(e.id)}" ${pode ? '' : 'disabled title="Faça as duas conferências da quinzena deste ato"'}>Autorizar</button>`}</div></div>`;
      }).join('') || '<div class="vazio">Nenhum ato com DOI neste mês.</div>'}</div>
      <div class="acoes"><a class="btn" href="https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/doi" target="_blank" rel="noopener">Abrir DOI-Web</a></div>`;

    // 4) COAF (Provimento CNJ 161/2024)
    const ano = qi.ym.slice(0, 4), envNeg = CFG.comEnvios[`${CFG.cartorioAtual}|coaf-negativa|${ano}`];
    const atosCoaf = r.doPeriodo.filter(e => this.tipos(e).coaf);
    const comunicouAno = lav.some(e => (e.dataLavratura || '').startsWith(ano) && ((e.comunicacoes || {}).coaf || {}).comunicado);
    $('comCoaf').innerHTML = `<h2>4. COAF – prevenção à lavagem de dinheiro</h2>
      <div class="hint">Cada ato com valor é analisado. Operação suspeita ou pagamento em espécie a partir de R$ 100 mil: comunicar no SISCOAF em até 24 horas. Sem nenhuma comunicação no ano: comunicação de não ocorrência à Corregedoria até 31/01/${Number(ano) + 1}.</div>
      <div class="lista">${atosCoaf.map(e => {
        const c = (e.comunicacoes || {}).coaf;
        return `<div class="item"><div><div class="t">${esc(e.nome)}</div><div class="s">${dataBR(e.dataLavratura)}${e.base ? ' · R$ ' + brl(e.base) : ''}</div></div>
          <div class="v">${c ? `<span class="selo ${c.comunicado ? 'pendente' : 'pago'}">${c.comunicado ? 'COMUNICADO' : 'NADA A COMUNICAR'} ${dataBR(c.data)}</span>`
            : `<button class="peq" data-coaf="${esc(e.id)}" data-tipo="nada">Nada a comunicar</button> <button class="peq" data-coaf="${esc(e.id)}" data-tipo="sim">Comunicado</button>`}</div></div>`;
      }).join('') || '<div class="vazio">Nenhum ato para analisar nesta quinzena.</div>'}</div>
      <div class="acoes">
        <a class="btn" href="https://siscoaf.fazenda.gov.br" target="_blank" rel="noopener">Abrir SISCOAF</a>
        ${envNeg ? `<span class="selo pago">Não ocorrência ${ano} autorizada em ${dataBR(envNeg.data)}</span>`
          : comunicouAno ? '' : `<button id="comCoafNeg" ${hoje >= `${ano}-12-31` || Number(ano) < Number(hoje.slice(0, 4)) ? '' : 'disabled title="Disponível depois do fim do ano"'}>Autorizar não ocorrência de ${ano}</button>`}
      </div>`;
    this.ultimo = { q, r, lav };
  },

  /* ----------------------------- Ações ----------------------------- */
  async conferencia(n) {
    let { q, lav } = this.ultimo;
    if (n === 2) {
      // A 2ª conferência relê as pastas do Drive antes de conferir de novo.
      if (Nuvem === Drive && Drive.venceLogo()) { try { await Drive.entrar(); } catch (e) { return aviso(e.message, 'erro'); } }
      if (Nuvem.conectado()) { try { await Esc.escanear(); await Esc.lerLivroFolhas(); } catch (e) { return aviso('Não consegui reler o Drive: ' + e.message, 'erro'); } }
      lav = await this.lavradas();
    }
    const r = this.conferir(lav, q);
    if (r.erros) { aviso(`Há ${r.erros} erro(s) na sequência. Corrija antes de conferir.`, 'erro'); return this.render(); }
    const st = this.estadoConf(q, r.assinatura);
    if (n === 2 && !st.c1) return this.render();
    const texto = `${r.qi.nome}: ${r.doPeriodo.length} ato(s). ${r.resumoLivros.join('; ')}${r.avisos ? `. Há ${r.avisos} aviso(s) na lista: confira cada um.` : '.'} ` +
      (n === 1 ? 'Confirmo que conferi, um por um, livro, folhas, data e selo de cada ato com o livro físico.' : 'Confirmo que fiz uma SEGUNDA conferência, separada da primeira, e que nenhuma folha foi pulada ou repetida.');
    if (!await confirmar(`${n}ª conferência`, texto, 'Confirmo a conferência', 'Voltar')) return;
    const atual = CFG.comConferencias[this.chave(q)] || {};
    const novo = n === 1 ? { c1: { em: agora(), assinatura: r.assinatura } } : { ...atual, c2: { em: agora(), assinatura: r.assinatura } };
    await Reg.salvarCfg({ comConferencias: { ...CFG.comConferencias, [this.chave(q)]: novo } });
    aviso(`${n}ª conferência registrada.`);
    this.render();
  },

  async autorizarCensec() {
    const { q } = this.ultimo, lav = await this.lavradas(), r = this.conferir(lav, q), st = this.estadoConf(q, r.assinatura);
    if (!st.c1 || !st.c2 || r.erros) return this.render();
    const resp = await pedir('Autorizar comunicação à CENSEC',
      `${r.qi.nome}: ${r.censecAtos.length ? r.censecAtos.length + ' ato(s)' : 'comunicação NEGATIVA (nenhum ato)'}. Autorizo a comunicação. Transmita no site da CENSEC e, se quiser, informe o protocolo.`,
      [{ id: 'protocolo', rotulo: 'Protocolo da CENSEC (opcional)', valor: '' }], ['Autorizo', 'Cancelar']);
    if (!resp) return;
    const reg = { em: agora(), data: hojeISO(), protocolo: resp.protocolo, qtd: r.censecAtos.length, assinatura: r.assinatura };
    await Reg.salvarCfg({ comEnvios: { ...CFG.comEnvios, [`${this.chave(q)}|censec`]: reg } });
    for (const e of r.censecAtos) { e.comunicacoes = { ...(e.comunicacoes || {}), censec: { data: reg.data, protocolo: reg.protocolo } }; await Reg.salvar('escrituras', e); }
    aviso('Comunicação à CENSEC autorizada e registrada.');
    this.render();
  },

  async autorizarDoi(id) {
    const e = await Reg.get('escrituras', id);
    const resp = await pedir('Autorizar DOI', `${e.nome} – lavrada em ${dataBR(e.dataLavratura)}. Autorizo a entrega da DOI. Depois de transmitir no DOI-Web, informe o número do recibo, se quiser.`,
      [{ id: 'recibo', rotulo: 'Recibo da DOI (opcional)', valor: '' }], ['Autorizo', 'Cancelar']);
    if (!resp) return;
    e.comunicacoes = { ...(e.comunicacoes || {}), doi: { data: hojeISO(), recibo: resp.recibo } };
    await Reg.salvar('escrituras', e);
    aviso('DOI autorizada e registrada.');
    this.render();
  },

  // Ficha com os dados que o app já tem para preencher a DOI (o restante sai dos documentos da pasta).
  async fichaDoi(id) {
    const e = await Reg.get('escrituras', id);
    const ficha = {
      ato: e.natureza, lavratura: dataBR(e.dataLavratura), livro: normLivro(e.livro), folhas: formatarFolhas(e.folhas), selo: e.selo,
      alienantes: e.outorgantes, adquirentes: e.outorgados, imovel: e.imovel, imovelRural: !!e.rural,
      valorDaOperacao: e.base != null ? brl(e.base) : '', pasta: `${e.parceiro}/${e.pasta}`,
      aPreencher: 'CPF/CNPJ das partes, matrícula e cartório de registro, endereço e área do imóvel, forma de pagamento e ITBI (ver 03 - DOCUMENTOS e o traslado em 02).'
    };
    baixarBlob(new Blob([JSON.stringify(ficha, null, 2)], { type: 'application/json' }), nomePasta(`FICHA DOI - ${e.nome}`) + '.json');
  },

  async coaf(id, tipo) {
    const e = await Reg.get('escrituras', id);
    const sim = tipo === 'sim';
    const resp = await pedir('COAF', sim ? `${e.nome}: registrar que a operação foi comunicada ao COAF (SISCOAF).` : `${e.nome}: registrar que o ato foi analisado e não há o que comunicar ao COAF.`,
      sim ? [{ id: 'protocolo', rotulo: 'Número da comunicação no SISCOAF (opcional)', valor: '' }] : [], ['Autorizo', 'Cancelar']);
    if (!resp) return;
    e.comunicacoes = { ...(e.comunicacoes || {}), coaf: { data: hojeISO(), comunicado: sim, protocolo: resp.protocolo || '' } };
    await Reg.salvar('escrituras', e);
    this.render();
  },

  async coafNegativa() {
    const ano = this.ultimo.q.slice(0, 4);
    if (!await confirmar('COAF – não ocorrência', `Autorizo a comunicação de não ocorrência de operações suspeitas no ano de ${ano} à Corregedoria-Geral de Justiça (prazo: 31/01/${Number(ano) + 1}).`, 'Autorizo', 'Cancelar')) return;
    await Reg.salvarCfg({ comEnvios: { ...CFG.comEnvios, [`${CFG.cartorioAtual}|coaf-negativa|${ano}`]: { em: agora(), data: hojeISO() } } });
    this.render();
  },

  // Ato lavrado no cartório que não tem pasta de parceiro: entra só para fechar a sequência do livro e as comunicações.
  async atoSemPasta() {
    const q = this.ultimo && this.ultimo.q;
    const resp = await pedir('Registrar ato sem pasta', 'Ato lavrado no livro que não tem pasta de parceiro. Se foi lavrado por OUTRO escrevente, informe quem: ele entra só na conferência das folhas e no "Próximo ato" (fora do repasse, das receitas e das suas comunicações). Se foi você, deixe "Lavrado por" em branco: entra também na CENSEC, DOI e COAF.', [
      { id: 'por', rotulo: 'Lavrado por (outro escrevente; em branco = você)', valor: '' },
      { id: 'num', rotulo: 'Nº do ato na sequência do cartório (ex.: 137)', valor: '' },
      { id: 'natureza', rotulo: 'Natureza (ex.: PROCURAÇÃO PÚBLICA, ESCRITURA PÚBLICA DE COMPRA E VENDA)', valor: 'ESCRITURA PÚBLICA DE COMPRA E VENDA' },
      { id: 'a', rotulo: 'Outorgante(s) / mandante(s)', valor: '' },
      { id: 'b', rotulo: 'Outorgado(s) / procurador(es)', valor: '' },
      { id: 'livro', rotulo: 'Livro (ex.: 024-E)', valor: '' },
      { id: 'folhas', rotulo: 'Folhas (ex.: 263/264)', valor: '' },
      { id: 'data', rotulo: 'Data da lavratura', tipo: 'date', valor: q ? infoQuinzena(q).ini : hojeISO() },
      { id: 'selo', rotulo: 'Selo digital', valor: '' }], ['Registrar', 'Cancelar']);
    if (!resp) return;
    if (!resp.livro || !lerFolhas(resp.folhas) || !resp.data) return aviso('Informe livro, folhas e data.', 'erro');
    const nat = resp.natureza.toUpperCase() || 'OUTRA';
    // Mesmo padrão das pastas: "... - OUTORGANTE x OUTORGADO" (o "x" fica minúsculo).
    const esq = nomePasta(`${/PROCURA/.test(nat) ? 'PROCURACAO' : 'ATO'} LIVRO ${normLivro(resp.livro)} FLS ${formatarFolhas(resp.folhas).replace(/\//g, '-')} - ${resp.a || 'xxx'}`, 110);
    const nome = esq + ' x ' + nomePasta(resp.b || 'xxx', 50);
    const outro = resp.por.trim().toUpperCase();
    const parceiro = outro ? 'OUTRO ESCREVENTE' : 'SEM PASTA (CARTORIO)';
    const id = Esc.idEsc(parceiro, nome);
    await Reg.salvar('escrituras', { id, cartorioId: CFG.cartorioAtual, parceiro, nome, externo: true, situacao: 'LAVRADA',
      natureza: nat, outorgantes: resp.a.toUpperCase(), outorgados: resp.b.toUpperCase(), livro: normLivro(resp.livro), folhas: formatarFolhas(resp.folhas),
      dataLavratura: resp.data, selo: resp.selo, numAto: parseInt(resp.num, 10) || null, outroEscrevente: outro || '', criadoEm: agora() });
    aviso(outro ? `Ato de ${outro} registrado (só para a sequência): ${nome}` : 'Ato registrado: ' + nome);
    this.render();
  },

  async inutilizadas() {
    const resp = await pedir('Folhas inutilizadas', 'Folhas que ficaram em branco ou foram inutilizadas no livro (não são falha na sequência). Ex.: "030, 031v, 040 a 042".',
      [{ id: 'livro', rotulo: 'Livro (ex.: 024-P)', valor: '' }, { id: 'folhas', rotulo: 'Folhas inutilizadas', valor: '' }], ['Salvar', 'Cancelar']);
    if (!resp || !resp.livro) return;
    const k = `${CFG.cartorioAtual}|${normLivro(resp.livro)}`;
    const atual = CFG.folhasInutilizadas[k];
    const valor = [atual, resp.folhas].filter(Boolean).join(', ');
    await Reg.salvarCfg({ folhasInutilizadas: { ...CFG.folhasInutilizadas, [k]: valor } });
    aviso(`Livro ${normLivro(resp.livro)}: folhas inutilizadas – ${valor || 'nenhuma'}.`);
    this.render();
  },

  csvCensec() {
    const { r } = this.ultimo;
    const cab = ['Módulo', 'Natureza', 'Data da lavratura', 'Livro', 'Folhas', 'Selo', 'Outorgante(s)', 'Outorgado(s)', 'Parceiro', 'Pasta'];
    const lin = r.censecAtos.map(e => [this.tipos(e).censec, e.natureza, dataBR(e.dataLavratura), normLivro(e.livro), formatarFolhas(e.folhas), e.selo, e.outorgantes, e.outorgados, e.parceiro, e.pasta]);
    const csv = [cab, ...lin].map(l => l.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    baixarBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), nomePasta(`CENSEC - ${r.qi.nome}`) + '.csv');
  },

  // Para a tela inicial: quantas comunicações estão pendentes e o prazo mais próximo.
  async pendencias() {
    const lav = await this.lavradas(), hoje = hojeISO();
    const quinz = quinzenasEncerradas(inicioCom(), hoje).filter(q => !this.envio(q, 'censec'));
    const prazos = quinz.map(q => infoQuinzena(q).prazo);
    lav.filter(e => this.tipos(e).doi && noControle(e) && !(e.comunicacoes || {}).doi).forEach(e => prazos.push(ultimoDiaUtil(mesSeguinte(mesDe(e.dataLavratura)))));
    const coaf = lav.filter(e => this.tipos(e).coaf && noControle(e) && !(e.comunicacoes || {}).coaf).length;
    return { qtd: prazos.length + coaf, prazo: prazos.sort()[0] || '' };
  },

  iniciar() {
    $('comQuinzena').addEventListener('change', () => this.render());
    $('comInicio').value = inicioCom();
    $('comInicio').addEventListener('change', async () => {
      if (!$('comInicio').value) return;
      await Reg.salvarCfg({ comInicio: $('comInicio').value });
      this.render();
    });
    $('view-comunicacoes').addEventListener('click', async ev => {
      const t = ev.target;
      if (t.closest('button[disabled]')) return;
      if (t.id === 'comConf1') return this.conferencia(1);
      if (t.id === 'comConf2') return this.conferencia(2);
      if (t.id === 'comAutCensec') return this.autorizarCensec();
      if (t.id === 'comCsv') return this.csvCensec();
      if (t.id === 'comInut') return this.inutilizadas();
      if (t.id === 'comExterno') return this.atoSemPasta();
      if (t.id === 'comCoafNeg') return this.coafNegativa();
      if (t.id === 'comAtualizar') {
        if (Nuvem === Drive && Drive.venceLogo()) { try { await Drive.entrar(); } catch (e) { return aviso(e.message, 'erro'); } }
        t.disabled = true;
        try {
          await Esc.escanear();
          const r = await Esc.lerLivroFolhas((i, n) => { t.textContent = `Lendo traslados ${i}/${n}…`; });
          aviso(`Pastas relidas. Livro e folhas encontrados em ${r.achados} de ${r.verificados} ato(s) lavrado(s) que estavam sem eles.`);
        } catch (e) { aviso(e.message, 'erro'); }
        return this.render();
      }
      if (t.dataset.doi) return this.autorizarDoi(t.dataset.doi);
      if (t.dataset.ficha) return this.fichaDoi(t.dataset.ficha);
      if (t.dataset.coaf) return this.coaf(t.dataset.coaf, t.dataset.tipo);
      const it = t.closest('[data-esc]');
      if (it) Esc.detalhe(it.dataset.esc);
    });
  }
};

/* --------------------------- Próximo ato --------------------------- */
// Próximo número, livro, folha e selo esperado de cada tipo de livro (E = escrituras, P = procurações).
// Parte da última consulta ao servidor/ACSIV (CFG.sequencia) e soma os atos lavrados no app depois dela, inclusive
// os de outros escreventes. O número do selo é só o esperado: quem dá o número é o ACSIV, na emissão.
// "000199491A", "199.491-A", "999002-A" -> { n: 199491, s: 'A' }
function lerSelo(txt) {
  const m = semAcento(String(txt || '')).toUpperCase().replace(/[^0-9A-Z]/g, '').match(/^0*(\d+)([A-Z])$/);
  return m ? { n: parseInt(m[1], 10), s: m[2] } : null;
}
const Seq = {
  ref: tipo => (CFG.sequencia || {})[`${CFG.cartorioAtual}|${tipo}`] || null,
  tipoDe: e => /-P$/.test(normLivro(e.livro)) || ehProcuracao(e) ? 'P' : 'E',

  async proximo(tipo) {
    const ref = this.ref(tipo);
    const lav = (await Reg.doCartorio('escrituras')).filter(e => e.situacao === 'LAVRADA' && !e.excluido && e.livro && this.tipoDe(e) === tipo);
    // Livro atual: o da referência, ou o mais recente lançado no app (pela data).
    const recentes = lav.filter(e => e.dataLavratura).sort((a, b) => b.dataLavratura.localeCompare(a.dataLavratura));
    const livro = ref ? normLivro(ref.livro) : recentes[0] ? normLivro(recentes[0].livro) : '';
    if (!livro) return null;
    const doLivro = lav.filter(e => normLivro(e.livro) === livro && lerFolhas(e.folhas));
    const fimRef = ref && lerFolhas(ref.folhas) ? lerFolhas(ref.folhas).fim : 0;
    const ultimo = doLivro.reduce((m, e) => lerFolhas(e.folhas).fim > m.fim ? { fim: lerFolhas(e.folhas).fim, e } : m, { fim: fimRef, e: null });
    const nums = lav.map(e => e.numAto).filter(Boolean);
    const num = Math.max(ref ? ref.num || 0 : 0, ...nums, 0);
    // Aditamentos ficam no mesmo livro, mas usam selo gratuito (outra numeração): só conta selo da mesma série e
    // perto da referência.
    const sRef = ref && lerSelo(ref.selo);
    const selos = [sRef, ...lav.filter(e => !ref || (e.dataLavratura || '') >= ref.data).map(e => lerSelo(e.selo))]
      .filter(s => s && (!sRef || (s.s === sRef.s && Math.abs(s.n - sRef.n) < 5000)));
    const selo = selos.sort((a, b) => b.n - a.n)[0];
    const ultData = ultimo.e ? ultimo.e.dataLavratura : ref ? ref.data : '';
    return {
      tipo, livro, folha: numFolha(Math.floor(ultimo.fim / 2) * 2 + 2), num: num ? num + 1 : null,
      selo: selo ? `${String(selo.n + 1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${selo.s}` : '',
      ultimo: ultimo.e ? `${ultimo.e.nome} – fls. ${formatarFolhas(ultimo.e.folhas)}` : ref ? `ato ${ref.num} – fls. ${ref.folhas} (${ref.fonte})` : '',
      ultData, ref
    };
  },

  async html() {
    const linha = (p, rot) => p ? `<div class="item"><div><div class="t">${rot}: ${p.num ? 'nº ' + p.num + ' · ' : ''}Livro ${esc(p.livro)} · a partir da fl. ${p.folha}${p.selo ? ' · selo esperado ' + esc(p.selo) : ''}</div>
      <div class="s">Último: ${esc(p.ultimo)}${p.ultData ? ' · ' + dataBR(p.ultData) : ''}</div></div></div>` : `<div class="item"><div><div class="t">${rot}: sem referência</div><div class="s">Use "Atualizar referência".</div></div></div>`;
    return linha(await this.proximo('E'), 'Escritura') + linha(await this.proximo('P'), 'Procuração');
  },

  // Depois de consultar o servidor/ACSIV: grava o último ato oficial de cada tipo (comum entre PC e celular).
  async atualizarRef() {
    const tipo = (await pedir('Atualizar referência', 'Qual livro? Digite E (escrituras) ou P (procurações).', [{ id: 't', rotulo: 'Tipo', valor: 'E' }], ['Continuar', 'Cancelar']) || {}).t;
    if (!tipo) return;
    const T = tipo.trim().toUpperCase().startsWith('P') ? 'P' : 'E', r = this.ref(T) || {};
    const resp = await pedir(`Último ato oficial – ${T === 'P' ? 'procurações' : 'escrituras'}`, 'Dados do último ato lavrado no cartório (pasta ATOS NOTARIAIS no servidor e ACSIV), de qualquer escrevente.', [
      { id: 'num', rotulo: 'Nº do ato', valor: r.num || '' }, { id: 'livro', rotulo: 'Livro', valor: r.livro || (T === 'P' ? '024-P' : '024-E') },
      { id: 'folhas', rotulo: 'Folhas', valor: r.folhas || '' }, { id: 'selo', rotulo: 'Selo', valor: r.selo || '' },
      { id: 'data', rotulo: 'Data da lavratura', tipo: 'date', valor: r.data || hojeISO() }], ['Salvar', 'Cancelar']);
    if (!resp) return;
    if (!lerFolhas(resp.folhas)) return aviso('Informe as folhas.', 'erro');
    const nova = { num: parseInt(resp.num, 10) || 0, livro: normLivro(resp.livro), folhas: formatarFolhas(resp.folhas), selo: resp.selo.trim().toUpperCase(), data: resp.data, fonte: 'informado em ' + dataBR(hojeISO()) };
    await Reg.salvarCfg({ sequencia: { ...(CFG.sequencia || {}), [`${CFG.cartorioAtual}|${T}`]: nova } });
    aviso('Referência atualizada.');
    App.renderInicio();
  }
};
