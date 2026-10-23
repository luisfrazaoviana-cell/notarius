// Sincronia HD ⇄ Drive (só no PC, pelo Chrome ou Edge).
// Regras: copia o que falta de cada lado, sem apagar e sem sobrescrever; acompanha a troca
// de MINUTA - para LAVRADA -; as planilhas da raiz só vão do HD para o Drive.

const SincHD = {
  rodando: false, parar: false,

  log(msg) { const el = $('ajSincLog'); el.textContent = msg + '\n' + el.textContent.slice(0, 4000); },
  barra(f) { $('ajSincBarra').classList.remove('hidden'); $('ajSincBarra').firstElementChild.style.width = Math.round(f * 100) + '%'; },

  async arvoreDrive(id, caminho, mapa) {
    for (const f of await Nuvem.listar(id)) {
      if (IGNORAR.test(f.nome)) continue;
      const c = caminho ? caminho + '/' + f.nome : f.nome;
      mapa.set(c, f);
      if (f.pasta) await this.arvoreDrive(f.id, c, mapa);
    }
    return mapa;
  },

  async arvoreHD(dir, caminho, mapa) {
    for await (const h of dir.values()) {
      if (IGNORAR.test(h.name)) continue;
      const c = caminho ? caminho + '/' + h.name : h.name;
      if (h.kind === 'file') { const f = await h.getFile(); mapa.set(c, { handle: h, pai: dir, tamanho: f.size, modificado: f.lastModified }); }
      else { mapa.set(c, { handle: h, pai: dir, pasta: true }); await this.arvoreHD(h, c, mapa); }
    }
    return mapa;
  },

  // Acompanha MINUTA -> LAVRADA nos dois sentidos antes de comparar arquivos.
  async acertarLavradas() {
    for (const parcHD of await HD.subpastas(HD.raiz)) {
      const parcDrive = (await Nuvem.buscarNome(parcHD.name, Pastas.raiz, true))[0];
      if (!parcDrive) continue;
      const hd = new Map((await HD.subpastas(parcHD)).map(h => [h.name, h]));
      const dr = new Map((await Nuvem.listar(parcDrive.id)).filter(f => f.pasta).map(f => [f.nome, f]));
      for (const [nome] of hd) {
        const m = nome.match(/^LAVRADA - (.+)$/);
        if (m && !dr.has(nome) && dr.has('MINUTA - ' + m[1])) {
          await Nuvem.renomear(dr.get('MINUTA - ' + m[1]).id, nome);
          this.log(`Drive: ${parcHD.name}/MINUTA - ${m[1]} → LAVRADA`);
        }
      }
      for (const [nome] of dr) {
        const m = nome.match(/^LAVRADA - (.+)$/);
        const minutaHD = m && !hd.has(nome) && hd.get('MINUTA - ' + m[1]);
        if (!minutaHD) continue;
        try {
          await minutaHD.move(nome);   // Chrome/Edge recentes renomeiam direto
          this.log(`HD: ${parcHD.name}/MINUTA - ${m[1]} → LAVRADA`);
        } catch {
          // Sem renomear: cria a pasta LAVRADA com o conteúdo e deixa a MINUTA para você apagar.
          await HD.copiarPasta(minutaHD, await parcHD.getDirectoryHandle(nome, { create: true }));
          this.log(`HD: criada ${parcHD.name}/${nome} (apague a pasta MINUTA - ${m[1]} antiga)`);
        }
      }
    }
  },

  async rodar() {
    if (this.rodando) return;
    if (!await HD.liberada(HD.chave(), true)) return aviso(`Escolha a pasta ${C().pasta} do HD em Ajustes.`, 'erro');
    this.rodando = true; this.parar = false;
    const b = $('ajSincHD'); b.textContent = 'Parar'; b.onclick = () => { this.parar = true; };
    let enviados = 0, baixados = 0, diferentes = 0, erros = 0;
    try {
      await Pastas.preparar();
      this.log('Conferindo pastas MINUTA/LAVRADA…');
      await this.acertarLavradas();
      this.log('Lendo o HD…');
      const hd = await this.arvoreHD(HD.raiz, '', new Map());
      this.log(`HD: ${hd.size} itens. Lendo o Drive…`);
      const dr = await this.arvoreDrive(Pastas.raiz, '', new Map());
      this.log(`Drive: ${dr.size} itens. Comparando…`);

      const idPasta = new Map([['', Pastas.raiz]]);
      for (const [c, f] of dr) if (f.pasta) idPasta.set(c, f.id);
      const pastaDrive = async caminho => {
        if (idPasta.has(caminho)) return idPasta.get(caminho);
        const i = caminho.lastIndexOf('/'), pai = await pastaDrive(i < 0 ? '' : caminho.slice(0, i));
        const nova = await Nuvem.acharOuCriarPasta(caminho.slice(i + 1), pai);
        idPasta.set(caminho, nova.id); return nova.id;
      };
      const pastaHD = async caminho => {
        let d = HD.raiz;
        for (const p of caminho.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p, { create: true });
        return d;
      };

      const tarefas = [];
      for (const [c, h] of hd) {
        if (h.pasta) { if (!dr.has(c)) tarefas.push(['pastaDrive', c]); continue; }
        const d = dr.get(c);
        const raizPlanilha = !c.includes('/');
        if (!d) tarefas.push(['enviar', c, h]);
        else if (raizPlanilha && h.modificado > d.modificado + 2000) tarefas.push(['atualizar', c, h, d]);
        else if (d.tamanho && h.tamanho !== d.tamanho && !raizPlanilha) diferentes++;
      }
      for (const [c, d] of dr) {
        if (hd.has(c)) continue;
        if (d.pasta) tarefas.push(['pastaHD', c]);
        else if (!d.mime.startsWith('application/vnd.google-apps')) tarefas.push(['baixar', c, d]);
      }
      this.log(`${tarefas.filter(t => t[0] === 'enviar').length} para enviar ao Drive, ${tarefas.filter(t => t[0] === 'baixar').length} para baixar ao HD.`);

      for (let i = 0; i < tarefas.length && !this.parar; i++) {
        const [tipo, c, a, b2] = tarefas[i];
        this.barra((i + 1) / tarefas.length);
        try {
          const j = c.lastIndexOf('/'), dirC = j < 0 ? '' : c.slice(0, j), nomeArq = c.slice(j + 1);
          if (tipo === 'pastaDrive') await pastaDrive(c);
          else if (tipo === 'pastaHD') await pastaHD(c);
          else if (tipo === 'enviar') { await Nuvem.enviar(await pastaDrive(dirC), nomeArq, await a.handle.getFile()); enviados++; this.log('↑ ' + c); }
          else if (tipo === 'atualizar') { await Nuvem.atualizar(b2.id, await a.handle.getFile()); enviados++; this.log('↑ (atualizada) ' + c); }
          else if (tipo === 'baixar') { await HD.gravar(await pastaHD(dirC), nomeArq, await Nuvem.baixar(a.id), true); baixados++; this.log('↓ ' + c); }
        } catch (e) { erros++; this.log(`ERRO em ${c}: ${e.message}`); }
      }

      // Cópia dos dados do app no HD (um arquivo por dia, substituído no mesmo dia).
      if (await HD.liberada('backup')) {
        const blob = new Blob([JSON.stringify(await Reg.pacote())], { type: 'application/json' });
        await HD.gravar(HD.pastas.backup, `NOTARIUS-DADOS-${hojeISO()}.json`, blob, true);
        this.log('Backup dos dados do app gravado na pasta de backup do HD.');
      }
      await salvarCfg({ ultimaSincHD: agora() });
      const msg = `${this.parar ? 'Interrompida' : 'Sincronia concluída'}: ${enviados} enviado(s) ao Drive, ${baixados} baixado(s) ao HD` +
        (diferentes ? `, ${diferentes} arquivo(s) diferentes nos dois lados (não mexi)` : '') + (erros ? `, ${erros} erro(s)` : '') + '.';
      this.log(msg); aviso(msg, erros ? 'erro' : 'ok');
    } catch (e) { this.log('ERRO: ' + e.message); aviso(e.message, 'erro'); }
    finally {
      this.rodando = false;
      b.textContent = 'Sincronizar HD ⇄ Drive agora'; b.onclick = () => this.rodar();
      App.statusAjustes();
    }
  }
};
