// Inicialização, navegação, tela inicial e ajustes.

const TITULOS_VIEW = { inicio: 'Início', escrituras: 'Escrituras', ferramentas: 'Calculadora e minutas', orcamentos: 'Orçamentos',
  controle: 'Controle financeiro', acervo: 'Acervo', ajustes: 'Ajustes', mais: 'Mais' };

const App = {
  view: 'inicio', prontoNuvem: false,

  ir(v) {
    if (v === 'nova') { this.ir('escrituras'); return Esc.nova(); }
    this.view = v;
    document.querySelectorAll('.view').forEach(s => s.classList.toggle('ativa', s.id === 'view-' + v));
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('ativo', b.dataset.view === v ||
      (b.dataset.view === 'mais' && ['controle', 'acervo', 'ajustes'].includes(v))));
    $('titulo').textContent = TITULOS_VIEW[v] || '';
    window.scrollTo(0, 0);
    this.renderView();
  },

  renderView() {
    const r = { inicio: () => this.renderInicio(), escrituras: () => Esc.render(), orcamentos: () => Orc.render(),
      controle: () => Ctl.render(), ajustes: () => this.statusAjustes(), ferramentas: () => this.listaMinutaEsc() }[this.view];
    if (r) r();
  },

  atualizarTudo() { this.renderView(); },

  async listaMinutaEsc() {
    const atual = $('mEsc').value;
    const lista = (await Reg.todos('escrituras')).sort((a, b) => (a.situacao === 'MINUTA' ? 0 : 1) - (b.situacao === 'MINUTA' ? 0 : 1) || a.nome.localeCompare(b.nome));
    $('mEsc').innerHTML = '<option value="">— nenhuma —</option>' + lista.map(r => `<option value="${esc(r.id)}">${r.situacao === 'MINUTA' ? '✎ ' : ''}${esc(r.nome)} (${esc(r.parceiro)})</option>`).join('');
    $('mEsc').value = atual;
  },

  async renderInicio() {
    $('iniEntrar').classList.toggle('hidden', Nuvem !== Drive || Drive.conectado());
    const todas = await Reg.todos('escrituras');
    const mes = hojeISO().slice(0, 7), mesAnt = (() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 7); })();
    const lav = todas.filter(e => e.situacao === 'LAVRADA' && e.dataLavratura && e.emolumentos);
    const doMes = lav.filter(e => mesDe(e.dataLavratura) === mes);
    const soma = (l, f) => l.reduce((s, e) => s + f(e), 0);
    const minutas = todas.filter(e => e.situacao === 'MINUTA');
    const aReceber = lav.filter(e => !e.recebido);
    // Próximo repasse: lavraturas do mês anterior vencem dia 5 deste mês (se ainda não pago).
    const dia = new Date().getDate();
    const compProx = dia <= 5 && !CFG.repassesPagos[mesAnt] ? mesAnt : mes;
    const repProx = soma(lav.filter(e => mesDe(e.dataLavratura) === compProx), e => Ctl.repasse(e));
    $('iniKpis').innerHTML = `
      <div class="kpi destaque"><small>Emolumentos de ${nomeMes(mes)}</small><b>R$ ${brl(soma(doMes, e => e.emolumentos))}</b><span>${doMes.length} lavrada(s)</span></div>
      <div class="kpi"><small>Próximo repasse (dia 5)</small><b>R$ ${brl(repProx)}</b><span>vence ${dataBR(mesSeguinte(compProx) + '-05')}</span></div>
      <div class="kpi"><small>A receber de clientes</small><b>R$ ${brl(soma(aReceber, e => e.emolumentos))}</b><span>${aReceber.length} escritura(s)</span></div>
      <div class="kpi"><small>Minutas em andamento</small><b>${minutas.length}</b><span>${todas.length} escrituras no total</span></div>`;
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
      const lib = await HD.liberada('raiz');
      ch.className = 'chip ' + (lib ? 'ok' : HD.pastas.raiz ? 'alerta' : '');
      ch.lastElementChild.textContent = lib ? 'HD conectado' : HD.pastas.raiz ? 'HD: liberar' : 'HD: escolher';
    }
  },

  async statusAjustes() {
    $('ajModo').value = CFG.modo || 'demo';
    $('ajDriveBox').classList.toggle('hidden', $('ajModo').value !== 'drive');
    $('ajClientId').value = CFG.clientId || window.NOTARIUS_CLIENT_ID || '';
    $('ajRaiz').value = CFG.raizId || '';
    $('ajNuvemStatus').textContent = Nuvem === Demo ? 'Modo demonstração: os dados ficam só neste aparelho.'
      : Drive.conectado() ? `Conectado ao Google Drive.${Reg.ultimaSinc ? ' Última sincronização: ' + new Date(Reg.ultimaSinc).toLocaleTimeString('pt-BR') : ''}` : 'Não conectado.';
    $('ajBackupStatus').textContent = CFG.ultimoBackup ? 'Último backup no Drive: ' + new Date(CFG.ultimoBackup).toLocaleString('pt-BR') : 'Nenhum backup feito ainda.';
    $('ajRepasse').value = CFG.repassePct; $('ajCabecalho').value = CFG.cabecalho; $('ajBanco').value = CFG.banco;
    $('ajPix').value = CFG.pix; $('ajDescricao').value = CFG.descricaoGuia; $('ajCidade').value = CFG.cidade;
    $('ajHDsem').classList.toggle('hidden', !NO_CELULAR); $('ajHDcom').classList.toggle('hidden', NO_CELULAR);
    if (!NO_CELULAR) {
      const r = HD.pastas.raiz, b = HD.pastas.backup;
      $('ajHDStatus').innerHTML = `Pasta do HD: <b>${r ? esc(r.name) : 'não escolhida'}</b>${r && !await HD.liberada('raiz') ? ' (clique em Sincronizar para liberar)' : ''}<br>
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
      if (Nuvem === Drive && !NO_CELULAR && await HD.liberada('raiz') && agora() - (CFG.ultimaSincHD || 0) > 6 * 3600e3) SincHD.rodar();
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

    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => this.ir(b.dataset.view)));
    document.addEventListener('click', ev => { const t = ev.target.closest('[data-ir]'); if (t) this.ir(t.dataset.ir); });
    $('view-inicio').addEventListener('click', ev => { const it = ev.target.closest('[data-esc]'); if (it) Esc.detalhe(it.dataset.esc); });
    $('modal').addEventListener('click', ev => { if (ev.target.id === 'modal') fecharModal(); });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') fecharModal(); });
    document.addEventListener('dados-atualizados', () => this.renderView());

    iniciarFerramentas(); Esc.iniciar(); Orc.iniciar(); Ctl.iniciar(); Acv.iniciar();
    this.iniciarAjustes();
    this.ir('inicio');

    if (Nuvem === Demo) await this.aposConectar();
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
      await salvarCfg({ clientId: $('ajClientId').value.trim(), raizId: this.idDoLink($('ajRaiz').value) });
      Pastas.zerar();
      this.entrar();
    };
    $('ajSair').onclick = () => { Drive.sair(); this.statusAjustes(); this.renderView(); };
    $('ajModo').onchange = async () => {
      await this.usarModo($('ajModo').value);
      if (Nuvem === Demo) await this.aposConectar();
      this.statusAjustes();
    };
    $('ajSalvarCfg').onclick = async () => {
      await Reg.salvarCfg({ repassePct: Number($('ajRepasse').value) || 0, cabecalho: $('ajCabecalho').value.trim(), banco: $('ajBanco').value.trim(),
        pix: $('ajPix').value.trim(), descricaoGuia: $('ajDescricao').value.trim(), cidade: $('ajCidade').value.trim() });
      aviso('Ajustes salvos (valem para PC e celular).');
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
          const h = await HD.escolher('raiz');
          if (h.name !== 'ESCRITURAS ORGANIZADAS') aviso(`Atenção: a pasta escolhida se chama "${h.name}", não "ESCRITURAS ORGANIZADAS".`, 'erro');
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
