// Acesso às pastas do PC (HD externo, backup e sincronização) pelo navegador.
// No celular essas funções ficam indisponíveis e o app trabalha só com os dados locais.

const HD = {
  pastas: { raiz: null, backup: null, sync: null },

  // Pasta de escrituras do cartório atual no HD (Bujaru continua usando a chave "raiz").
  chave() { return CFG.cartorioAtual === 'bujaru' ? 'raiz' : 'raiz_' + CFG.cartorioAtual; },
  get raiz() { return this.pastas[this.chave()] || null; },

  async carregar() {
    if (NO_CELULAR) return;
    const chaves = ['raiz', 'backup', 'sync', ...CFG.cartorios.filter(c => c.id !== 'bujaru').map(c => 'raiz_' + c.id)];
    for (const k of chaves) this.pastas[k] = await DB.get('kv', 'hd_' + k) || null;
  },

  // Pede permissão de leitura e escrita; só pode pedir em resposta a um clique.
  async liberada(k, pedir = false) {
    const h = this.pastas[k];
    if (!h) return false;
    const o = { mode: 'readwrite' };
    if (await h.queryPermission(o) === 'granted') return true;
    if (pedir && await h.requestPermission(o) === 'granted') return true;
    return false;
  },

  async escolher(k) {
    const h = await window.showDirectoryPicker({ id: 'notarius-' + k, mode: 'readwrite' });
    this.pastas[k] = h;
    await DB.put('kv', h, 'hd_' + k);
    return h;
  },

  async subpastas(dir) {
    const r = [];
    for await (const h of dir.values()) if (h.kind === 'directory') r.push(h);
    return r.sort((a, b) => a.name.localeCompare(b.name));
  },

  async arquivos(dir) {
    const r = [];
    for await (const h of dir.values()) if (h.kind === 'file') r.push(h);
    return r.sort((a, b) => a.name.localeCompare(b.name));
  },

  // Percorre todos os arquivos de uma pasta e subpastas.
  async *percorrer(dir, caminho = '') {
    for await (const h of dir.values()) {
      const c = caminho ? caminho + '/' + h.name : h.name;
      if (h.kind === 'file') yield { handle: h, caminho: c, pasta: dir };
      else yield* this.percorrer(h, c);
    }
  },

  async abrir(partes, criar = false) {
    let d = this.raiz;
    for (const p of partes) d = await d.getDirectoryHandle(p, { create: criar });
    return d;
  },

  async existe(dir, nome) {
    try { await dir.getFileHandle(nome); return true; } catch { return false; }
  },

  // Grava o arquivo sem sobrescrever outro de mesmo nome: acrescenta " (2)", " (3)"...
  async gravar(dir, nome, blob, sobrescrever = false) {
    let final = nome;
    if (!sobrescrever) {
      const p = nome.lastIndexOf('.'), base = p > 0 ? nome.slice(0, p) : nome, ext = p > 0 ? nome.slice(p) : '';
      for (let i = 2; await this.existe(dir, final); i++) final = `${base} (${i})${ext}`;
    }
    const fh = await dir.getFileHandle(final, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return final;
  },

  async copiarPasta(origem, destino) {
    for await (const h of origem.values()) {
      if (h.kind === 'file') await this.gravar(destino, h.name, await h.getFile(), true);
      else await this.copiarPasta(h, await destino.getDirectoryHandle(h.name, { create: true }));
    }
  }
};
