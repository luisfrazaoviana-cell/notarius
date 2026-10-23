// Armazenamento comum entre PC e celular.
// Drive: Google Drive de verdade (pasta ESCRITURAS ORGANIZADAS + pasta NOTARIUS com os dados do app).
// Demo: a mesma interface, guardada só neste aparelho, para testar sem conta do Google.

const PASTA_MIME = 'application/vnd.google-apps.folder';
const IGNORAR = /^(desktop\.ini|thumbs\.db)$|^~\$|\.tmp$/i;
const MIME_EXT = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', json: 'application/json', txt: 'text/plain' };
const mimeDe = nome => MIME_EXT[(nome.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
const aspas = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function nomeLivre(nome, existentes) {
  const p = nome.lastIndexOf('.'), base = p > 0 ? nome.slice(0, p) : nome, ext = p > 0 ? nome.slice(p) : '';
  let final = nome;
  for (let i = 2; existentes.has(final); i++) final = `${base} (${i})${ext}`;
  return final;
}

/* ----------------------------- Google Drive ----------------------------- */
const Drive = {
  nome: 'Google Drive',
  token: null, expira: 0, cliente: null,
  API: 'https://www.googleapis.com/drive/v3',
  UP: 'https://www.googleapis.com/upload/drive/v3',

  conectado() { return !!this.token && Date.now() < this.expira; },

  async entrar() {
    const clientId = CFG.clientId || window.NOTARIUS_CLIENT_ID;
    if (!clientId) throw new Error('Falta o ID de cliente do Google (veja Ajustes).');
    await carregarScript('https://accounts.google.com/gsi/client');
    await new Promise((ok, err) => {
      this.cliente = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive',
        callback: r => {
          if (r.error) return err(new Error(r.error_description || r.error));
          this.token = r.access_token;
          this.expira = Date.now() + (Number(r.expires_in) - 60) * 1000;
          ok();
        },
        error_callback: e => err(new Error(e.type === 'popup_closed' ? 'Janela do Google fechada.' : (e.message || e.type)))
      });
      this.cliente.requestAccessToken({ prompt: '' });
    });
  },

  sair() {
    if (this.token && window.google) google.accounts.oauth2.revoke(this.token, () => {});
    this.token = null; this.expira = 0;
  },

  async api(url, opts = {}, tentou = false) {
    if (!this.conectado()) await this.entrar();
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + this.token } });
    if (r.status === 401 && !tentou) { this.token = null; return this.api(url, opts, true); }
    if (!r.ok) throw new Error(`Google Drive ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r;
  },

  conv(f) {
    return { id: f.id, nome: f.name, pasta: f.mimeType === PASTA_MIME, mime: f.mimeType, pais: f.parents || [],
      modificado: Date.parse(f.modifiedTime || 0) || 0, tamanho: Number(f.size || 0) };
  },
  CAMPOS: 'id,name,mimeType,modifiedTime,size,parents',

  async consulta(q, max = 5000) {
    const r = []; let pagina = '';
    do {
      const u = `${this.API}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(${this.CAMPOS})&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true` + (pagina ? '&pageToken=' + pagina : '');
      const d = await (await this.api(u)).json();
      r.push(...d.files.map(f => this.conv(f)));
      pagina = d.nextPageToken;
    } while (pagina && r.length < max);
    return r;
  },

  listar(paiId) { return this.consulta(`'${paiId}' in parents and trashed=false`); },

  async buscarNome(nome, paiId, soPasta) {
    let q = `name='${aspas(nome)}' and trashed=false`;
    if (paiId) q += ` and '${paiId}' in parents`;
    if (soPasta) q += ` and mimeType='${PASTA_MIME}'`;
    return this.consulta(q, 50);
  },

  async criarPasta(nome, paiId) {
    const r = await this.api(`${this.API}/files?fields=${this.CAMPOS}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nome, mimeType: PASTA_MIME, parents: [paiId] })
    });
    return this.conv(await r.json());
  },

  async acharOuCriarPasta(nome, paiId) {
    return (await this.buscarNome(nome, paiId, true))[0] || this.criarPasta(nome, paiId);
  },

  async enviar(paiId, nome, blob, existentes) {
    if (existentes) nome = nomeLivre(nome, existentes);
    const mime = blob.type || mimeDe(nome);
    const meta = { name: nome, parents: [paiId] };
    if (blob.size <= 5 * 1024 * 1024) {
      const b = 'notarius' + Date.now();
      const corpo = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`, blob, `\r\n--${b}--`]);
      const r = await this.api(`${this.UP}/files?uploadType=multipart&fields=${this.CAMPOS}`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body: corpo });
      return this.conv(await r.json());
    }
    // Arquivos grandes: envio em duas etapas (resumable).
    const ini = await this.api(`${this.UP}/files?uploadType=resumable&fields=${this.CAMPOS}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime }, body: JSON.stringify(meta)
    });
    const destino = ini.headers.get('Location');
    const r = await fetch(destino, { method: 'PUT', headers: { 'Content-Type': mime }, body: blob });
    if (!r.ok) throw new Error('Falha ao enviar ' + nome);
    return this.conv(await r.json());
  },

  async atualizar(id, blob) {
    const r = await this.api(`${this.UP}/files/${id}?uploadType=media&fields=${this.CAMPOS}`, { method: 'PATCH', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
    return this.conv(await r.json());
  },

  async baixar(id) { return (await this.api(`${this.API}/files/${id}?alt=media`)).blob(); },

  async info(id) { return this.conv(await (await this.api(`${this.API}/files/${id}?fields=${this.CAMPOS}&supportsAllDrives=true`)).json()); },

  async renomear(id, nome) {
    await this.api(`${this.API}/files/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nome }) });
  },
  // Busca no conteúdo dos arquivos (o Google lê o texto dos PDFs, inclusive escaneados).
  buscarTexto(termo) {
    return this.consulta(`fullText contains '${aspas(termo)}' and trashed=false and mimeType != '${PASTA_MIME}'`, 200);
  },

  link(id) { return `https://drive.google.com/file/d/${id}/view`; },
  linkPasta(id) { return `https://drive.google.com/drive/folders/${id}`; }
};

/* --------------------------- Modo demonstração --------------------------- */
const Demo = {
  nome: 'Demonstração (só neste aparelho)',
  arv: null,
  conectado() { return true; },
  async entrar() {},
  sair() {},

  async carregar() {
    this.arv = await DB.get('kv', 'demoArvore');
    if (!this.arv) { this.arv = { root: { id: 'root', nome: 'Meu Drive', pai: null, pasta: true, modificado: agora() } }; await this.exemplo(); }
  },
  salvar() { return DB.put('kv', this.arv, 'demoArvore'); },
  novoId() { return 'd' + Math.random().toString(36).slice(2, 10); },
  conv(n) { return { id: n.id, nome: n.nome, pasta: n.pasta, mime: n.pasta ? PASTA_MIME : mimeDe(n.nome), pais: [n.pai], modificado: n.modificado, tamanho: n.blob ? n.blob.size : 0 }; },

  async listar(paiId) { return Object.values(this.arv).filter(n => n.pai === paiId).map(n => this.conv(n)); },
  async buscarNome(nome, paiId, soPasta) {
    return Object.values(this.arv).filter(n => n.nome === nome && (!paiId || n.pai === paiId) && (!soPasta || n.pasta)).map(n => this.conv(n));
  },
  async criarPasta(nome, paiId) {
    const n = { id: this.novoId(), nome, pai: paiId, pasta: true, modificado: agora() };
    this.arv[n.id] = n; await this.salvar(); return this.conv(n);
  },
  async acharOuCriarPasta(nome, paiId) { return (await this.buscarNome(nome, paiId, true))[0] || this.criarPasta(nome, paiId); },
  async enviar(paiId, nome, blob, existentes) {
    if (existentes) nome = nomeLivre(nome, existentes);
    const n = { id: this.novoId(), nome, pai: paiId, pasta: false, blob, modificado: agora() };
    this.arv[n.id] = n; await this.salvar(); return this.conv(n);
  },
  async atualizar(id, blob) { const n = this.arv[id]; n.blob = blob; n.modificado = agora(); await this.salvar(); return this.conv(n); },
  async baixar(id) { return this.arv[id].blob; },
  async info(id) { return this.conv(this.arv[id]); },
  async renomear(id, nome) { this.arv[id].nome = nome; this.arv[id].modificado = agora(); await this.salvar(); },  async buscarTexto(termo) {
    const t = semAcento(termo).toLowerCase();
    return Object.values(this.arv).filter(n => !n.pasta && semAcento(n.nome + ' ' + (n.texto || '')).toLowerCase().includes(t)).map(n => this.conv(n));
  },
  link(id) { const n = this.arv[id]; return n && n.blob ? URL.createObjectURL(n.blob) : '#'; },
  linkPasta() { return '#'; },

  // Estrutura de exemplo igual à do HD, com dados fictícios.
  async exemplo() {
    const raiz = await this.criarPasta('ESCRITURAS ORGANIZADAS', 'root');
    const pdf = texto => new Blob(['%PDF-1.4\n% ' + texto], { type: 'application/pdf' });
    const atos = [
      ['FULANO CORRETOR', 'LAVRADA - LOTE 01 RESIDENCIAL EXEMPLO - JOSE EXEMPLO x ANA EXEMPLO', 'Escritura de exemplo lavrada. Selo 000001-A. CPF 111.222.333-44'],
      ['FULANO CORRETOR', 'MINUTA - CASA RUA DAS FLORES - PEDRO TESTE x MARIA TESTE', 'Matrícula 1.234 de exemplo'],
      ['LUIS VIANA (CAPTACAO PROPRIA)', 'MINUTA - SITIO BOA VISTA - CARLOS MODELO x JOANA MODELO', 'CCIR de exemplo']
    ];
    for (const [parc, nome, texto] of atos) {
      const p = await this.acharOuCriarPasta(parc, raiz.id);
      const e = await this.criarPasta(nome, p.id);
      for (const s of SUBPASTAS) {
        const sp = await this.criarPasta(s, e.id);
        if (s.startsWith('03')) { const f = await this.enviar(sp.id, 'MATRICULA.pdf', pdf(texto)); this.arv[f.id].texto = texto; }
      }
    }
    await this.salvar();
  }
};

let Nuvem = Demo;

const SUBPASTAS = ['01 - MINUTA', '02 - ESCRITURA LAVRADA (COM SELO)', '03 - DOCUMENTOS', '04 - ORCAMENTOS'];
const RE_ESCRITURA = /^(MINUTA|LAVRADA) - (.+)$/i;

// Pasta raiz das escrituras e pasta de dados do app.
const Pastas = {
  raiz: null, app: null,
  async preparar() {
    if (!this.raiz) {
      if (CFG.raizId && Nuvem === Drive) this.raiz = CFG.raizId;
      else {
        const achadas = await Nuvem.buscarNome('ESCRITURAS ORGANIZADAS', null, true);
        this.raiz = achadas[0] ? achadas[0].id : (await Nuvem.criarPasta('ESCRITURAS ORGANIZADAS', 'root')).id;
      }
    }
    if (!this.app) this.app = (await Nuvem.acharOuCriarPasta('NOTARIUS', 'root')).id;
  },
  zerar() { this.raiz = null; this.app = null; }
};
