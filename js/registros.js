// Registros do app (escrituras e orçamentos): ficam no banco local para abrir rápido
// e são sincronizados com o arquivo NOTARIUS/NOTARIUS-DADOS.json do Drive.
// Quando o mesmo registro muda nos dois aparelhos, vale a alteração mais recente.

const ARQ_DADOS = 'NOTARIUS-DADOS.json';
const CFG_COMPARTILHADA = ['repassesPagos', 'cartorios', 'tabelas', 'comConferencias', 'comEnvios', 'folhasInutilizadas', 'comInicio', 'pastasProprias', 'sequencia'];

const Reg = {
  timer: null, sincronizando: null, ultimaSinc: 0,

  async todos(loja) { return (await DB.todos(loja)).filter(r => !r.excluido); },
  // Só os registros do cartório escolhido no topo.
  async doCartorio(loja) { return (await this.todos(loja)).filter(doCartorio); },
  get: (loja, id) => DB.get(loja, id),

  async salvar(loja, rec) {
    rec.atualizadoEm = agora();
    await DB.put(loja, rec);
    this.agendar();
    return rec;
  },
  async excluir(loja, id) {
    const r = await DB.get(loja, id);
    if (r) { r.excluido = true; await this.salvar(loja, r); }
  },
  async salvarCfg(m) { await salvarCfg({ ...m, compartilhadoEm: agora() }); this.agendar(); },

  agendar() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sincronizar().catch(e => aviso('Não sincronizou: ' + e.message, 'erro')), 2000);
  },

  async pacote() {
    const p = { app: 'notarius', versao: 1, geradoEm: agora(), escrituras: await DB.todos('escrituras'), orcamentos: await DB.todos('orcamentos'),
      cfg: Object.fromEntries(CFG_COMPARTILHADA.map(k => [k, CFG[k]])) };
    p.cfg.atualizadoEm = CFG.compartilhadoEm || 0;
    p.atualizadoEm = Math.max(p.cfg.atualizadoEm, ...p.escrituras.map(r => r.atualizadoEm || 0), ...p.orcamentos.map(r => r.atualizadoEm || 0));
    return p;
  },

  async mesclar(d) {
    let n = 0;
    for (const loja of ['escrituras', 'orcamentos']) {
      const novos = [];
      for (const rec of d[loja] || []) {
        const loc = await DB.get(loja, rec.id);
        if (!loc || (rec.atualizadoEm || 0) > (loc.atualizadoEm || 0)) novos.push(rec);
      }
      if (novos.length) { await DB.putVarios(loja, novos); n += novos.length; }
    }
    if (d.cfg) {
      // Ajustes comuns: as listas por chave (repasses pagos, conferências, envios, folhas inutilizadas, tabelas)
      // são unidas, para que um aparelho não apague o que o outro gravou; no mesmo item vale o lado mais recente.
      const remNovo = (d.cfg.atualizadoEm || 0) > (CFG.compartilhadoEm || 0);
      const m = {};
      for (const k of CFG_COMPARTILHADA) {
        const rem = d.cfg[k], loc = CFG[k];
        if (rem === undefined) continue;
        const mapa = v => v && typeof v === 'object' && !Array.isArray(v);
        m[k] = mapa(rem) && mapa(loc) ? (remNovo ? { ...loc, ...rem } : { ...rem, ...loc }) : (remNovo ? rem : loc);
      }
      if (CFG_COMPARTILHADA.some(k => k in m && JSON.stringify(m[k]) !== JSON.stringify(CFG[k]))) {
        await salvarCfg({ ...m, compartilhadoEm: Math.max(d.cfg.atualizadoEm || 0, CFG.compartilhadoEm || 0) });
        n++;
      }
    }
    return n;
  },

  // O Drive precisa receber o que este aparelho tem de novo (registro mais novo ou que lá não existe, ou ajustes diferentes).
  precisaEnviar(local, remoto) {
    if (!remoto) return true;
    for (const loja of ['escrituras', 'orcamentos']) {
      const rem = new Map((remoto[loja] || []).map(r => [r.id, r.atualizadoEm || 0]));
      if (local[loja].some(r => !rem.has(r.id) || (r.atualizadoEm || 0) > rem.get(r.id))) return true;
    }
    return CFG_COMPARTILHADA.some(k => JSON.stringify(local.cfg[k] ?? null) !== JSON.stringify((remoto.cfg || {})[k] ?? null));
  },

  // Lê o arquivo do Drive, mescla, e grava de volta se este aparelho tiver novidades.
  sincronizar() {
    if (this.sincronizando) return this.sincronizando;
    this.sincronizando = (async () => {
      await Pastas.preparar();
      const arq = (await Nuvem.buscarNome(ARQ_DADOS, Pastas.app))[0];
      let remoto = null;
      if (arq) remoto = JSON.parse(await (await Nuvem.baixar(arq.id)).text());
      const recebidos = remoto ? await this.mesclar(remoto) : 0;
      const local = await this.pacote();
      if (this.precisaEnviar(local, remoto)) {
        const blob = new Blob([JSON.stringify(local)], { type: 'application/json' });
        if (arq) await Nuvem.atualizar(arq.id, blob); else await Nuvem.enviar(Pastas.app, ARQ_DADOS, blob);
      }
      this.ultimaSinc = agora();
      if (recebidos) document.dispatchEvent(new CustomEvent('dados-atualizados'));
      return recebidos;
    })().finally(() => { this.sincronizando = null; });
    return this.sincronizando;
  },

  // Backup diário no Drive: um arquivo por dia, guardado para sempre (nada é apagado).
  // No mesmo dia o arquivo do dia é atualizado; o Drive mantém as versões anteriores no histórico.
  async backupDrive() {
    await Pastas.preparar();
    const pasta = await Nuvem.acharOuCriarPasta('BACKUPS', Pastas.app);
    const nome = `NOTARIUS-DADOS-${hojeISO()}.json`;
    const blob = new Blob([JSON.stringify(await this.pacote())], { type: 'application/json' });
    const hoje = (await Nuvem.buscarNome(nome, pasta.id))[0];
    if (hoje) await Nuvem.atualizar(hoje.id, blob); else await Nuvem.enviar(pasta.id, nome, blob);
    await salvarCfg({ ultimoBackup: agora() });
    return nome;
  },

  async exportarArquivo() {
    const blob = new Blob([JSON.stringify(await this.pacote(), null, 1)], { type: 'application/json' });
    baixarBlob(blob, `NOTARIUS-DADOS-${hojeISO()}.json`);
  },
  async importarArquivo(file) {
    const d = JSON.parse(await file.text());
    if (d.app !== 'notarius') throw new Error('Este arquivo não é um backup do Notarius.');
    const n = await this.mesclar(d);
    this.agendar();
    return n;
  }
};

function baixarBlob(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
