// Funções comuns do Notarius: formatação, banco local (IndexedDB), avisos e janela modal.

const $ = id => document.getElementById(id);
const brl = c => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Percentual sobre centavos, arredondando meio centavo para cima (igual à tabela).
const pct = (c, p) => Math.floor((c * p + 50) / 100);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const agora = () => Date.now();
const NO_CELULAR = !('showDirectoryPicker' in window);

function lerValor(txt) {
  txt = String(txt ?? '').replace(/[^\d,.]/g, '');
  if (!txt) return null;
  if (txt.includes(',')) txt = txt.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}(\.|$)/.test(txt)) txt = txt.replace(/\./g, '');
  const n = Number(txt);
  return isFinite(n) ? Math.round(n * 100) : null;
}
function formatarAoSair(el) {
  el.addEventListener('blur', () => { const c = lerValor(el.value); if (c !== null) el.value = brl(c); });
}
function copiar(texto, botao) {
  if (!texto) return;
  const rotulo = botao.textContent;
  navigator.clipboard.writeText(texto).then(
    () => { botao.textContent = 'Copiado!'; setTimeout(() => botao.textContent = rotulo, 1500); },
    () => alert(texto));
}

const MESES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const hojeISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const dataBR = iso => iso ? iso.split('-').reverse().join('/') : '';
function isoDeBR(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}
const mesDe = iso => iso ? iso.slice(0, 7) : '';
function nomeMes(ym) { const [a, m] = ym.split('-').map(Number); return `${MESES_NOME[m - 1]}/${a}`; }
function mesSeguinte(ym) { let [a, m] = ym.split('-').map(Number); m++; if (m > 12) { m = 1; a++; } return `${a}-${String(m).padStart(2, '0')}`; }

// Nome válido para pasta do Windows: maiúsculas, sem acento e sem caracteres proibidos.
function nomePasta(s, max = 150) {
  return semAcento(s).toUpperCase().replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, max);
}

/* --------------------------- Banco local --------------------------- */
const DB = (() => {
  let db;
  const LOJAS = ['escrituras', 'orcamentos', 'acervo'];
  function abrir() {
    return new Promise((ok, err) => {
      const r = indexedDB.open('notarius', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('kv');
        LOJAS.forEach(n => d.createObjectStore(n, { keyPath: 'id' }));
      };
      r.onsuccess = () => { db = r.result; ok(); };
      r.onerror = () => err(r.error);
    });
  }
  function tx(loja, modo, fn) {
    return new Promise((ok, err) => {
      const t = db.transaction(loja, modo);
      const req = fn(t.objectStore(loja));
      t.oncomplete = () => ok(req ? req.result : undefined);
      t.onerror = () => err(t.error);
    });
  }
  return {
    abrir, LOJAS,
    get: (loja, k) => tx(loja, 'readonly', s => s.get(k)),
    put: (loja, v, k) => tx(loja, 'readwrite', s => k === undefined ? s.put(v) : s.put(v, k)),
    del: (loja, k) => tx(loja, 'readwrite', s => s.delete(k)),
    todos: loja => tx(loja, 'readonly', s => s.getAll()),
    putVarios: (loja, lista) => tx(loja, 'readwrite', s => { lista.forEach(v => s.put(v)); return null; })
  };
})();

// Configurações do usuário (guardadas no banco local).
const CFG_PADRAO = {
  repassePct: 45,
  cidade: 'Bujaru/PA',
  cabecalho: 'CARTÓRIO DE SANTANA DE BUJARU\nMARIA ELISA CORDEIRO DE SANTANA – Registradora e Tabeliã',
  banco: 'Banco Santander – Agência 1577 – Conta Corrente 1036907-4\nFavorecido: LUIS ALBERTO FRAZÃO MODESTO\nChave Pix: luis.frazaoviana@gmail.com',
  pix: '00020126480014br.gov.bcb.pix0126luis.frazaoviana@gmail.com5204000053039865802BR5925LUIS ALBERTO FRAZAO MODES6010ANANINDEUA62580520SAN2026090817300175750300017br.gov.bcb.brcode01051.0.06304864D',
  descricaoGuia: 'Escritura Pública de Compra e Venda, Certidão e Diligências',
  repassesPagos: {},
  // Comunicações: conferências das folhas, envios autorizados e folhas inutilizadas (comuns entre aparelhos).
  comConferencias: {}, comEnvios: {}, folhasInutilizadas: {}, comInicio: '2026-10-01',
  pastasProprias: [],   // pastas de parceiro que, na verdade, são captação própria do Luis
  // Última referência da sequência oficial do cartório (servidor + ACSIV), por cartório e tipo de livro (E = escrituras,
  // P = procurações). O "Próximo ato" soma a ela os atos lançados no app depois. Consulta de 24/10/2026.
  sequencia: {
    'bujaru|E': { num: 137, livro: '024-E', folhas: '273/274', selo: '199491-A', data: '2026-10-19', fonte: 'servidor e ACSIV, 24/10/2026' },
    'bujaru|P': { num: 36, livro: '024-P', folhas: '046', selo: '336177-A', data: '2026-10-20', fonte: 'servidor e ACSIV, 24/10/2026' }
  },
  ultimoBackup: 0, syncLido: 0, syncEscrito: 0
};
let CFG = { ...CFG_PADRAO };
async function carregarCfg() {
  CFG = { ...CFG_PADRAO, ...(await DB.get('kv', 'cfg') || {}) };
  // Primeira vez com vários cartórios: o cartório de Bujaru herda os ajustes que já existiam.
  if (!CFG.cartorios) {
    CFG.cartorios = [
      { ...CARTORIO_BUJARU, banco: CFG.banco, pix: CFG.pix, descricaoGuia: CFG.descricaoGuia,
        repassePct: CFG.repassePct, raizId: CFG.raizId || '' },
      { ...CARTORIO_NOVO, id: 'c2' }
    ];
    await DB.put('kv', CFG, 'cfg');
  }
  if (!CFG.cartorioAtual || !CFG.cartorios.find(c => c.id === CFG.cartorioAtual)) CFG.cartorioAtual = CFG.cartorios[0].id;
  // Identidade visual aprovada (out/2026): azul-marinho, logo e timbre com o nome completo.
  // Só troca o que ainda estiver no padrão antigo; o que você já editou em Ajustes fica como está.
  let mudou = false;
  CFG.cartorios = CFG.cartorios.map(c => {
    const n = { ...c };
    if (c.id === 'bujaru') {
      if (c.cor === '#1d5c4d') { n.cor = CARTORIO_BUJARU.cor; mudou = true; }
      if (!c.logo) { n.logo = CARTORIO_BUJARU.logo; mudou = true; }
      if (!c.cabecalho || c.cabecalho === CABECALHO_ANTIGO) { n.cabecalho = CARTORIO_BUJARU.cabecalho; mudou = true; }
      if (!c.timbre) { n.timbre = CARTORIO_BUJARU.timbre; mudou = true; }
      if (c.contato === undefined) { n.contato = CARTORIO_BUJARU.contato; mudou = true; }
      if (!c.endereco || c.endereco === 'Rodovia PA-140, Km 29, Vila Santana, Centro, Bujaru/PA – CEP 68.670-000') { n.endereco = CARTORIO_BUJARU.endereco; mudou = true; }
    } else if (c.cor === '#1f4e79') { n.cor = CARTORIO_NOVO.cor; mudou = true; }
    return n;
  });
  if (mudou) { CFG.compartilhadoEm = Date.now(); await DB.put('kv', CFG, 'cfg'); }
}
async function salvarCfg(mudancas) { Object.assign(CFG, mudancas); await DB.put('kv', CFG, 'cfg'); }

/* ----------------------------- Cartórios ----------------------------- */
// Cada cartório tem pasta, tabela, quem lavra, dados da guia e repasse próprios.
const CABECALHO_ANTIGO = 'CARTÓRIO DE SANTANA DE BUJARU\nMARIA ELISA CORDEIRO DE SANTANA – Registradora e Tabeliã';
const CARTORIO_BUJARU = {
  id: 'bujaru', nome: 'Santana de Bujaru', uf: 'PA', cor: '#14284b', logo: 'marca/logo-selo.png',
  cabecalho: 'CARTÓRIO DE NOTAS E REGISTRO CIVIL DE PESSOAS NATURAIS\nCOMARCA DE BUJARU · ESTADO DO PARÁ\nMARIA ELISA CORDEIRO DE SANTANA – Registradora e Tabeliã',
  // Timbre da minuta (faixa azul, sem rodapé por causa da assinatura eletrônica).
  timbre: 'CARTÓRIO SANTANA\nCartório de Notas e Registro Civil de Pessoas Naturais\nComarca de Bujaru\nMARIA ELISA CORDEIRO DE SANTANA – Tabeliã e Registradora',
  endereco: 'Rodovia PA-140, Km 29, Vila Santana\nCentro, Bujaru/PA – CEP 68.670-000',
  // Contato de quem atende (vai no fim do checklist impresso e copiado).
  contato: '(91) 98115-8167 · luis.frazaoviana@gmail.com',
  pasta: 'ESCRITURAS ORGANIZADAS', tabela: 'PA2026', issPct: 5,
  lavrador: 'LUÍS ALBERTO FRAZÃO MODESTO', cargo: 'Tabelião e Registrador Substituto', cargoCurto: 'Tabelião Substituto',
  localTrad: 'neste Distrito, Comarca e Município de Bujaru – PA', localRev: 'neste Distrito, Município e Comarca de Bujaru, Estado do Pará',
  cidadeData: 'Bujaru/PA', siglaArquivo: 'BUJARU', repasseDestino: 'Cartório de Santana', repassePct: 45, codCertidao: '453', codDiligencia: '695'
};
const CARTORIO_NOVO = {
  id: '', nome: 'Outro cartório', uf: 'PA', cor: '#6b2737', logo: '', pasta: 'ESCRITURAS OUTRO CARTORIO', tabela: 'PA2026', issPct: 5,
  lavrador: '', cargo: 'Tabelião', cargoCurto: 'Tabelião', localTrad: '', localRev: '', cidadeData: '', siglaArquivo: '',
  cabecalho: '', banco: '', pix: '', descricaoGuia: 'Escritura Pública de Compra e Venda, Certidão e Diligências',
  repasseDestino: '', repassePct: 0, codCertidao: '453', codDiligencia: '695', raizId: ''
};
const C = () => CFG.cartorios.find(c => c.id === CFG.cartorioAtual) || CFG.cartorios[0];
const doCartorio = r => (r.cartorioId || 'bujaru') === CFG.cartorioAtual;
// Tabela de emolumentos do cartório atual (a do Pará já vem no app; as outras são importadas).
const TAB = () => C().tabela === 'PA2026' ? DADOS : ((CFG.tabelas || {})[C().tabela] || null);
const issDe = c => pct(c, Number(C().issPct ?? 5));
// Chave do repasse pago: Bujaru continua com o mês puro (compatível com o que já foi marcado).
const chaveRepasse = m => CFG.cartorioAtual === 'bujaru' ? m : `${CFG.cartorioAtual}:${m}`;

function aplicarCorCartorio() {
  document.documentElement.style.setProperty('--accent', C().cor || '#14284b');
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', C().cor || '#14284b');
}

// Logo do cartório em data URL (para o PDF da guia), guardada depois da primeira leitura.
const _logos = {};
async function logoDataURL() {
  const src = C().logo;
  if (!src) return null;
  if (!_logos[src]) _logos[src] = fetch(src).then(r => r.ok ? r.blob() : null).then(b => b && new Promise(ok => {
    const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b);
  })).catch(() => null);
  return _logos[src];
}

/* ------------------------- Avisos e modal ------------------------- */
function aviso(texto, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + tipo;
  el.textContent = texto;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 7000 : 3500);
}
function abrirModal(titulo, html, aoAbrir) {
  $('modal-titulo').textContent = titulo;
  $('modal-corpo').innerHTML = html;
  $('modal').classList.add('aberto');
  if (aoAbrir) aoAbrir($('modal-corpo'));
}
function fecharModal() { $('modal').classList.remove('aberto'); $('modal-corpo').innerHTML = ''; }

// Caixa de pergunta do próprio app (no lugar de prompt/confirm, que falham em app instalado).
// campos: [{id, rotulo, valor, tipo}] -> devolve {id: valor} ao confirmar, ou null ao cancelar.
function pedir(titulo, texto, campos = [], botoes = ['OK', 'Cancelar']) {
  return new Promise(ok => {
    const d = $('dialogo');
    d.querySelector('h2').textContent = titulo;
    d.querySelector('.corpo').innerHTML = (texto ? `<p style="margin:0 0 8px">${esc(texto)}</p>` : '') +
      campos.map(c => `<label class="f">${esc(c.rotulo)}</label><input id="dlg_${c.id}" type="${c.tipo || 'text'}" value="${esc(c.valor ?? '')}">`).join('') +
      `<div class="acoes"><button class="prim" data-r="1">${esc(botoes[0])}</button>${botoes[1] ? `<button data-r="0">${esc(botoes[1])}</button>` : ''}</div>`;
    d.classList.add('aberto');
    const primeiro = d.querySelector('input'); if (primeiro) { primeiro.focus(); primeiro.select(); }
    const fim = sim => {
      const r = sim ? Object.fromEntries(campos.map(c => [c.id, $('dlg_' + c.id).value.trim()])) : null;
      d.classList.remove('aberto'); d.onclick = null; d.onkeydown = null; ok(r);
    };
    d.onclick = ev => { const b = ev.target.closest('[data-r]'); if (b) fim(b.dataset.r === '1'); else if (ev.target === d) fim(false); };
    d.onkeydown = ev => { if (ev.key === 'Enter') fim(true); if (ev.key === 'Escape') fim(false); };
  });
}
const confirmar = async (titulo, texto, sim = 'Sim', nao = 'Não') => !!(await pedir(titulo, texto, [], [sim, nao]));

// Carrega uma biblioteca da internet só quando for usada.
const _scripts = {};
function carregarScript(url) {
  return _scripts[url] || (_scripts[url] = new Promise((ok, err) => {
    const s = document.createElement('script');
    s.src = url; s.onload = ok; s.onerror = () => { delete _scripts[url]; err(new Error('Sem internet para carregar ' + url)); };
    document.head.appendChild(s);
  }));
}
const LIB = {
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  pdflib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfjsWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  qr: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
  tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js'
};
async function pdfjs() {
  await carregarScript(LIB.pdfjs);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIB.pdfjsWorker;
  return window.pdfjsLib;
}

// Cálculo de um ato com faixa de valor (usado no orçamento e no controle).
function calcularAto(lista, valor, perc = 0) {
  const linha = (lista || []).find(r => r.de !== null && valor >= r.de && (r.ate === null || valor <= r.ate));
  if (!linha) return null;
  const acresc = Math.min(pct(linha.emol, Math.min(perc, 90)), linha.emol);
  const emol = linha.emol + acresc;
  const iss = issDe(emol);
  return { linha, emolBase: linha.emol, acresc, emol, selo: linha.selo || 0, iss, total: emol + (linha.frc || 0) + (linha.frj || 0) + (linha.selo || 0) + iss };
}
const avulsoDe = cod => cod && TAB() && (TAB().avulsos || []).find(a => a.cod === cod);
const totalAvulso = (cod, q = 1) => { const r = avulsoDe(cod); return r ? (r.emol + (r.selo || 0) + issDe(r.emol)) * q : 0; };
