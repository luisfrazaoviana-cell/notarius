// Inicialização, navegação, tela inicial e ajustes.

const TITULOS_VIEW = { inicio: 'Início', escrituras: 'Escrituras', ferramentas: 'Calculadora e minutas', orcamentos: 'Orçamentos',
  controle: 'Controle financeiro', receitas: 'Receitas', comunicacoes: 'Comunicações', acervo: 'Acervo', ajustes: 'Ajustes', mais: 'Mais' };

const CAMPOS_CARTORIO = ['nome', 'cor', 'logo', 'uf', 'issPct', 'pasta', 'tabela', 'codCertidao', 'codDiligencia', 'lavrador', 'cargo', 'cargoCurto',
  'localTrad', 'localRev', 'cidadeData', 'siglaArquivo', 'timbre', 'endereco', 'cabecalho', 'banco', 'pix', 'descricaoGuia', 'repassePct', 'repasseDestino'];

// Tabela de emolumentos de outro estado: CSV com separador ";" e vírgula decimal.
const GRUPOS_TABELA = { escComValor: 'Escritura com valor declarado (faixas)', escInventario: 'Inventário/divórcio com bens (faixas)',
  escSemValor: 'Escritura sem valor declarado', procuracao: 'Procuração', regImovel: 'Registro com valor (faixas)',
  avbComValor: 'Averbação com valor (faixas)', avbSemValor: 'Averbação sem valor', avulsos: 'Atos adicionais (certidões, diligência)' };
const MODELO_TABELA = 'grupo;codigo;descricao;faixa_de;faixa_ate;emolumentos;selo\n' +
  'escComValor;001;0,00 a 15.000,00;0,00;15.000,00;441,40;14,25\n' +
  'escComValor;002;15.000,01 a 30.000,00;15.000,01;30.000,00;540,00;14,25\n' +
  'escComValor;003;A partir de 30.000,01;30.000,01;;835,70;14,25\n' +
  'escSemValor;010;Escritura declaratória;;;418,40;14,25\n' +
  'procuracao;020;Procuração genérica;;;148,60;7,15\n' +
  'avulsos;030;Certidão de inteiro teor da matrícula;;;63,30;1,45\n' +
  'avulsos;031;Diligência;;;120,80;0,85\n' +
  '# grupos aceitos: ' + Object.keys(GRUPOS_TABELA).join(', ') + '\n';

function lerTabelaCSV(texto, nome) {
  const linhasCsv = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
  const sep = linhasCsv[0].includes(';') ? ';' : ',';
  const cab = linhasCsv[0].split(sep).map(s => semAcento(s).trim().toLowerCase());
  const col = n => cab.indexOf(n);
  if (col('grupo') < 0 || col('codigo') < 0 || col('emolumentos') < 0) throw new Error('O CSV precisa das colunas grupo, codigo, descricao e emolumentos (baixe o modelo).');
  const tabela = { nome, linhas: 0 };
  for (const l of linhasCsv.slice(1)) {
    const c = l.split(sep), val = n => col(n) >= 0 ? (c[col(n)] || '').trim() : '';
    const g = val('grupo');
    if (!GRUPOS_TABELA[g]) throw new Error(`Grupo "${g}" desconhecido. Use: ${Object.keys(GRUPOS_TABELA).join(', ')}.`);
    const emol = lerValor(val('emolumentos')), selo = lerValor(val('selo')) || 0;
    if (emol === null) throw new Error(`Valor de emolumentos inválido no código ${val('codigo')}.`);
    const r = { cod: val('codigo'), desc: val('descricao') || val('codigo'), de: val('faixa_de') ? lerValor(val('faixa_de')) : null,
      ate: val('faixa_ate') ? lerValor(val('faixa_ate')) : null, emol, selo, frc: null, frj: null, obs: '' };
    r.iss = pct(emol, 5); r.total = lerValor(val('total')) || emol + selo + r.iss;
    (tabela[g] = tabela[g] || []).push(r);
    tabela.linhas++;
  }
  for (const g of Object.keys(GRUPOS_TABELA)) if (tabela[g]) tabela[g].sort((a, b) => (a.de ?? 0) - (b.de ?? 0));
  if (!tabela.linhas) throw new Error('O arquivo não tem linhas de tabela.');
  return tabela;
}

const App = {
  view: 'inicio', prontoNuvem: false,

  /* -------------------------- Cartórios -------------------------- */
  montarSeletor() {
    $('selCartorio').innerHTML = CFG.cartorios.map(c => `<button data-cart="${c.id}" class="${c.id === CFG.cartorioAtual ? 'ativo' : ''}">${esc(c.nome)}</button>`).join('');
    $('rodapeCartorio').textContent = 'Cartório: ' + C().nome;
    // Logo do cartório no menu (sem logo, fica o "N" do Notarius).
    const img = $('logoCartorio');
    img.classList.toggle('hidden', !C().logo);
    $('logoN').classList.toggle('hidden', !!C().logo);
    if (C().logo) { img.src = C().logo; img.onerror = () => { img.classList.add('hidden'); $('logoN').classList.remove('hidden'); }; }
    $('marcaSub').textContent = C().logo ? C().nome : 'Gestão Notarial e Financeira';
  },

  async trocarCartorio(id) {
    await salvarCfg({ cartorioAtual: id });
    aplicarCorCartorio();
    this.montarSeletor();
    Esc.parceiros = [];
    recarregarFerramentas();
    $('orcDesc').value = C().descricaoGuia || '';
    this.renderView(); this.chips();
    if (Nuvem.conectado()) Esc.escanear().then(n => { if (n) this.renderView(); }).catch(() => {});
  },

  async salvarCartorio(m) {
    await Reg.salvarCfg({ cartorios: CFG.cartorios.map(c => c.id === CFG.cartorioAtual ? { ...c, ...m } : c) });
  },

  preencherCartorio() {
    const c = C();
    $('ajcTitulo').textContent = c.nome;
    $('ajc_tabela').innerHTML = '<option value="PA2026">Pará 2026 (já no app)</option>' +
      Object.entries(CFG.tabelas || {}).map(([k, t]) => `<option value="${k}">${esc(t.nome)} (importada)</option>`).join('') +
      (c.tabela && c.tabela !== 'PA2026' && !(CFG.tabelas || {})[c.tabela] ? `<option value="${c.tabela}">tabela não encontrada</option>` : '');
    CAMPOS_CARTORIO.forEach(k => { const el = $('ajc_' + k); if (el) el.value = c[k] ?? ''; });
  },

  ir(v) {
    if (v === 'nova') { this.ir('escrituras'); return Esc.nova(); }
    this.view = v;
    document.querySelectorAll('.view').forEach(s => s.classList.toggle('ativa', s.id === 'view-' + v));
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('ativo', b.dataset.view === v ||
      (b.dataset.view === 'mais' && ['controle', 'receitas', 'comunicacoes', 'acervo', 'ajustes'].includes(v))));
    $('titulo').textContent = TITULOS_VIEW[v] || '';
    window.scrollTo(0, 0);
    this.renderView();
  },

  renderView() {
    const r = { inicio: () => this.renderInicio(), escrituras: () => Esc.render(), orcamentos: () => Orc.render(),
      controle: () => Ctl.render(), comunicacoes: () => Com.render(), receitas: () => Rec.render(), ajustes: () => this.statusAjustes(), ferramentas: () => this.listaMinutaEsc() }[this.view];
    if (r) r();
  },

  atualizarTudo() { this.renderView(); },

  async listaMinutaEsc() {
    const atual = $('mEsc').value;
    const lista = (await Reg.doCartorio('escrituras')).sort((a, b) => (a.situacao === 'MINUTA' ? 0 : 1) - (b.situacao === 'MINUTA' ? 0 : 1) || a.nome.localeCompare(b.nome));
    $('mEsc').innerHTML = '<option value="">— nenhuma —</option>' + lista.map(r => `<option value="${esc(r.id)}">${r.situacao === 'MINUTA' ? '✎ ' : ''}${esc(r.nome)} (${esc(r.parceiro)})</option>`).join('');
    $('mEsc').value = atual;
  },

  async renderInicio() {
    $('iniEntrar').classList.toggle('hidden', Nuvem !== Drive || Drive.conectado());
    const todas = await Reg.doCartorio('escrituras');
    const mes = hojeISO().slice(0, 7), mesAnt = (() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 7); })();
    const lav = todas.filter(e => e.situacao === 'LAVRADA' && e.dataLavratura && e.emolumentos);
    const doMes = lav.filter(e => mesDe(e.dataLavratura) === mes);
    const soma = (l, f) => l.reduce((s, e) => s + f(e), 0);
    const minutas = todas.filter(e => e.situacao === 'MINUTA');
    const aReceber = lav.filter(e => !e.recebido);
    // Próximo repasse: lavraturas do mês anterior vencem dia 5 deste mês (se ainda não pago).
    const dia = new Date().getDate();
    const compProx = dia <= 5 && !CFG.repassesPagos[chaveRepasse(mesAnt)] ? mesAnt : mes;
    const repProx = soma(lav.filter(e => mesDe(e.dataLavratura) === compProx), e => Ctl.repasse(e));
    const com = await Com.pendencias(), rec = await Rec.resumo();
    $('iniKpis').innerHTML = `
      <div class="kpi destaque"><small>Emolumentos de ${nomeMes(mes)}</small><b>R$ ${brl(soma(doMes, e => e.emolumentos))}</b><span>${doMes.length} lavrada(s)</span></div>
      <div class="kpi"><small>Próximo repasse (dia 5)</small><b>R$ ${brl(repProx)}</b><span>vence ${dataBR(mesSeguinte(compProx) + '-05')}</span></div>
      <div class="kpi"><small>A receber de clientes</small><b>R$ ${brl(soma(aReceber, e => e.emolumentos))}</b><span>${aReceber.length} escritura(s)</span></div>
      <div class="kpi"><small>Minutas em andamento</small><b>${minutas.length}</b><span>${todas.length} atos no total</span></div>
      <div class="kpi clic" data-ir="receitas"><small>Orçamentos feitos</small><b>R$ ${brl(rec.orcTotal)}</b><span>${rec.orcQtd} orçamento(s) · em aberto R$ ${brl(rec.orcAberto)} (${rec.orcAbertoQtd})</span></div>
      <div class="kpi clic" data-ir="receitas"><small>Meus honorários a receber</small><b>R$ ${brl(rec.honAberto)}</b><span>${rec.honAbertoQtd} ato(s) · recebidos R$ ${brl(rec.honRecebido)}</span></div>
      <div class="kpi clic" data-ir="comunicacoes"><small>Comunicações pendentes</small><b>${com.qtd}</b><span>${com.prazo ? 'próximo prazo ' + dataBR(com.prazo) : 'em dia'}</span></div>`;
    $('iniMinutas').innerHTML = minutas.length ? minutas.slice(0, 12).map(e => Esc.itemHTML(e)).join('') : '<div class="vazio">Nenhuma minuta em andamento.</div>';
  },

  /* ---------------------------- Status ---------------------------- */
  async chips() {
    const cn = $('chipNuvem');
    const ok = Nuvem.conectado();
    cn.className = 'chip ' + (Nuvem === Demo ? 'alerta' : ok ? 'ok' : 'erro');
    cn.lastElementChild.textContent = Nuvem === Demo ? 'Demonstração' : ok ? 'Google Drive' : 'Drive: entrar';
    if (!NO_CELULAR) {
      const ch = $('chipHD'); ch.classList.remove('hidden');
      const lib = await HD.liberada(HD.chave());
      ch.className = 'chip ' + (lib ? 'ok' : HD.raiz ? 'alerta' : '');
      ch.lastElementChild.textContent = lib ? 'HD conectado' : HD.raiz ? 'HD: liberar' : 'HD: escolher';
    }
  },

  async statusAjustes() {
    $('ajModo').value = CFG.modo || 'demo';
    $('ajDriveBox').classList.toggle('hidden', $('ajModo').value !== 'drive');
    $('ajClientId').value = CFG.clientId || window.NOTARIUS_CLIENT_ID || '';
    $('ajRaiz').value = C().raizId || '';
    $('ajNuvemStatus').textContent = Nuvem === Demo ? 'Modo demonstração: os dados ficam só neste aparelho.'
      : Drive.conectado() ? `Conectado ao Google Drive.${Reg.ultimaSinc ? ' Última sincronização: ' + new Date(Reg.ultimaSinc).toLocaleTimeString('pt-BR') : ''}` : 'Não conectado.';
    $('ajBackupStatus').textContent = CFG.ultimoBackup ? 'Último backup no Drive: ' + new Date(CFG.ultimoBackup).toLocaleString('pt-BR') : 'Nenhum backup feito ainda.';
    this.preencherCartorio();
    $('ajHDsem').classList.toggle('hidden', !NO_CELULAR); $('ajHDcom').classList.toggle('hidden', NO_CELULAR);
    if (!NO_CELULAR) {
      const r = HD.raiz, b = HD.pastas.backup;
      $('ajHDStatus').innerHTML = `Pasta do HD (${esc(C().nome)}): <b>${r ? esc(r.name) : 'não escolhida'}</b>${r && !await HD.liberada(HD.chave()) ? ' (clique em Sincronizar para liberar)' : ''}<br>
        Pasta de backup: <b>${b ? esc(b.name) : 'não escolhida'}</b><br>Última sincronia: ${CFG.ultimaSincHD ? new Date(CFG.ultimaSincHD).toLocaleString('pt-BR') : 'nunca'}`;
    }
    $('ajVersao').textContent = 'Notarius versão ' + window.NOTARIUS_VERSAO;
    this.chips();
  },

  /* ---------------------------- Nuvem ---------------------------- */
  async usarModo(modo) {
    Pastas.zerar();
    if (modo === 'drive') { Nuvem = Drive; }
    else { Nuvem = Demo; await Demo.carregar(); }
    await salvarCfg({ modo });
  },

  async entrar() {
    Drive.saiu = false;
    try {
      await Drive.entrar();
      aviso('Conectado ao Google Drive.');
      await this.aposConectar();
    } catch (e) { aviso(e.message, 'erro'); }
    this.statusAjustes(); this.renderView();
  },

  // Depois de conectar: sincroniza dados, lê as pastas e faz o backup do dia.
  async aposConectar() {
    try {
      await Reg.sincronizar();
      await Esc.escanear();
      if (new Date(CFG.ultimoBackup || 0).toDateString() !== new Date().toDateString()) await Reg.backupDrive();
      // No PC, com o HD já liberado: sincroniza sozinho se a última vez foi há mais de 6 horas.
      if (Nuvem === Drive && !NO_CELULAR && await HD.liberada(HD.chave()) && agora() - (CFG.ultimaSincHD || 0) > 6 * 3600e3) SincHD.rodar();
    } catch (e) { aviso(e.message, 'erro'); }
    this.renderView(); this.chips();
  },

  /* ---------------------------- Início ---------------------------- */
  async iniciar() {
    await DB.abrir();
    await carregarCfg();
    if (!CFG.modo) await salvarCfg({ modo: (CFG.clientId || window.NOTARIUS_CLIENT_ID) ? 'drive' : 'demo' });
    await HD.carregar();
    await this.usarModo(CFG.modo);
    aplicarCorCartorio();
    this.montarSeletor();
    $('selCartorio').addEventListener('click', ev => { const b = ev.target.closest('[data-cart]'); if (b && b.dataset.cart !== CFG.cartorioAtual) this.trocarCartorio(b.dataset.cart); });
    // Se outro aparelho mudou os cartórios, atualiza as abas.
    document.addEventListener('dados-atualizados', () => { this.montarSeletor(); aplicarCorCartorio(); });

    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => this.ir(b.dataset.view)));
    document.addEventListener('click', ev => { const t = ev.target.closest('[data-ir]'); if (t) this.ir(t.dataset.ir); });
    $('view-inicio').addEventListener('click', ev => { const it = ev.target.closest('[data-esc]'); if (it) Esc.detalhe(it.dataset.esc); });
    $('modal').addEventListener('click', ev => { if (ev.target.id === 'modal') fecharModal(); });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') fecharModal(); });
    document.addEventListener('dados-atualizados', () => this.renderView());

    iniciarFerramentas(); Esc.iniciar(); Orc.iniciar(); Ctl.iniciar(); Com.iniciar(); Rec.iniciar(); Acv.iniciar();
    this.iniciarAjustes();
    this.ir('inicio');

    if (Nuvem === Demo) await this.aposConectar();
    // Google Drive sem pedir login a cada abertura: usa a permissão guardada enquanto vale (≈1 hora);
    // depois disso, o primeiro toque em qualquer lugar reconecta, e perto de vencer o toque renova.
    else if (Drive.restaurar()) { this.aposConectar(); this.statusAjustes(); }
    document.addEventListener('click', ev => {
      if (Nuvem !== Drive || Drive.saiu || Drive.entrando || !Drive.venceLogo()) return;
      if (ev.target.closest('#btnEntrar, #ajEntrar, #ajSair, #ajModo')) return;
      const estava = Drive.conectado();
      Drive.entrar().then(() => {
        if (!estava) { aviso('Conectado ao Google Drive.'); this.aposConectar(); }
        this.statusAjustes();
      }).catch(e => aviso(e.message, 'erro'));
    }, true);
    // Sincroniza a cada 2 minutos e ao voltar para o app.
    setInterval(() => { if (Nuvem.conectado() && !document.hidden) Reg.sincronizar().catch(() => {}); }, 120000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Nuvem.conectado()) Reg.sincronizar().catch(() => {}); });

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
    window.addEventListener('beforeinstallprompt', ev => {
      ev.preventDefault(); $('ajInstalar').classList.remove('hidden');
      $('ajInstalar').onclick = () => ev.prompt();
    });
  },

  iniciarAjustes() {
    $('btnEntrar').onclick = () => this.entrar();
    $('ajEntrar').onclick = async () => {
      await salvarCfg({ clientId: $('ajClientId').value.trim() });
      const raizId = this.idDoLink($('ajRaiz').value);
      if (raizId !== (C().raizId || '')) await this.salvarCartorio({ raizId });
      Pastas.zerar();
      this.entrar();
    };
    $('ajSair').onclick = () => { Drive.sair(); this.statusAjustes(); this.renderView(); };
    $('ajModo').onchange = async () => {
      await this.usarModo($('ajModo').value);
      if (Nuvem === Demo) await this.aposConectar();
      this.statusAjustes();
    };
    $('ajcSalvar').onclick = async () => {
      const m = {};
      CAMPOS_CARTORIO.forEach(k => { const el = $('ajc_' + k); m[k] = el.type === 'number' ? Number(el.value) || 0 : el.value.trim(); });
      if (m.pasta) m.pasta = nomePasta(m.pasta);
      if (m.pasta !== C().pasta) { m.raizId = ''; Pastas.zerar(); }
      await this.salvarCartorio(m);
      aviso('Cartório salvo (vale para PC e celular).');
      this.trocarCartorio(CFG.cartorioAtual);
    };
    $('ajcNovo').onclick = async () => {
      const r = await pedir('Novo cartório', 'Os demais dados você preenche em Ajustes depois.', [
        { id: 'nome', rotulo: 'Nome do cartório (aparece na aba)', valor: '' },
        { id: 'pasta', rotulo: 'Pasta das escrituras no Drive/HD', valor: 'ESCRITURAS ' }], ['Criar', 'Cancelar']);
      if (!r || !r.nome) return;
      const id = 'c' + agora().toString(36);
      const novo = { ...CARTORIO_NOVO, id, nome: r.nome, pasta: nomePasta(r.pasta || 'ESCRITURAS ' + r.nome) };
      await Reg.salvarCfg({ cartorios: [...CFG.cartorios, novo] });
      this.trocarCartorio(id);
      aviso('Cartório criado. Complete os dados abaixo.');
    };
    $('ajcModelo').onclick = () => baixarBlob(new Blob(['﻿' + MODELO_TABELA], { type: 'text/csv;charset=utf-8' }), 'modelo_tabela_emolumentos.csv');
    $('ajcImportar').onchange = async ev => {
      try {
        const arq = ev.target.files[0];
        const tabela = lerTabelaCSV(await arq.text(), arq.name.replace(/\.[^.]+$/, ''));
        const chave = 'T' + agora().toString(36);
        await Reg.salvarCfg({ tabelas: { ...(CFG.tabelas || {}), [chave]: tabela } });
        await this.salvarCartorio({ tabela: chave });
        aviso(`Tabela "${tabela.nome}" importada (${tabela.linhas} linhas) e ligada a este cartório.`);
        this.trocarCartorio(CFG.cartorioAtual);
      } catch (e) { aviso(e.message, 'erro'); }
      ev.target.value = '';
    };
    $('ajBackupDrive').onclick = async () => {
      try { const n = await Reg.backupDrive(); aviso('Backup salvo em NOTARIUS/BACKUPS: ' + n); this.statusAjustes(); } catch (e) { aviso(e.message, 'erro'); }
    };
    $('ajExportar').onclick = () => Reg.exportarArquivo();
    $('ajImportar').onchange = async ev => {
      try { const n = await Reg.importarArquivo(ev.target.files[0]); aviso(`${n} registro(s) restaurado(s).`); this.renderView(); } catch (e) { aviso(e.message, 'erro'); }
      ev.target.value = '';
    };
    if (!NO_CELULAR) {
      $('ajHDescolher').onclick = async () => {
        try {
          const h = await HD.escolher(HD.chave());
          if (h.name !== C().pasta) aviso(`Atenção: a pasta escolhida se chama "${h.name}", não "${C().pasta}".`, 'erro');
          this.statusAjustes();
        } catch (e) { if (e.name !== 'AbortError') aviso(e.message, 'erro'); }
      };
      $('ajBkpEscolher').onclick = async () => {
        try { await HD.escolher('backup'); this.statusAjustes(); } catch (e) { if (e.name !== 'AbortError') aviso(e.message, 'erro'); }
      };
      $('ajSincHD').onclick = () => SincHD.rodar();
      $('chipHD').onclick = () => this.ir('ajustes');
    }
  },

  idDoLink(s) {
    s = String(s || '').trim();
    const m = s.match(/folders\/([\w-]+)/) || s.match(/id=([\w-]+)/);
    return m ? m[1] : s;
  }
};

App.iniciar().catch(e => { console.error(e); aviso('Erro ao iniciar: ' + e.message, 'erro'); });
