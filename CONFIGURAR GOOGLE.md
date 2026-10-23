# Notarius – configuração inicial (uma vez só)

O Notarius guarda tudo no seu Google Drive. Assim o PC e o celular veem as mesmas escrituras, documentos, orçamentos e controle. O HD externo continua sendo usado: o PC sincroniza o HD com o Drive e guarda os backups.

São três passos: liberar o acesso do app ao Drive, publicar o app num endereço https e fazer o primeiro uso no PC.

---

## 1. Publicar o app (GitHub Pages, gratuito)

1. Crie uma conta em https://github.com (se ainda não tiver).
2. Clique em **New repository**, dê o nome `notarius`, marque **Public** e clique em **Create repository**.
3. Na página do repositório, clique em **uploading an existing file**. Arraste **todo o conteúdo** da pasta `C:\Projetos\emolumentos\notarius` (index.html, css, js, icones, manifest.webmanifest, sw.js) e clique em **Commit changes**.
4. Vá em **Settings → Pages**. Em *Branch*, escolha `main` e `/ (root)` e clique em **Save**.
5. Em um ou dois minutos, o endereço aparece no topo da página, no formato `https://SEU-USUARIO.github.io/notarius/`.

> O código do app fica público, mas **nenhum dado de cliente** está nele: escrituras, documentos e valores ficam só no seu Google Drive. Os dados bancários e o Pix que aparecem na guia de orçamento ficam no código como padrão; são os mesmos impressos em toda guia que você manda ao cliente. Se preferir, apague esses dados em `js/base.js` e preencha só em **Ajustes**.

## 2. Liberar o acesso ao Google Drive (Google Cloud)

1. Abra https://console.cloud.google.com com a sua conta Gmail e crie um projeto chamado **Notarius**.
2. Menu **APIs e serviços → Biblioteca**: procure **Google Drive API** e clique em **Ativar**.
3. Menu **APIs e serviços → Tela de consentimento OAuth** (ou "Google Auth Platform"):
   - Tipo de usuário: **Externo**. Nome do app: **Notarius**. E-mail de suporte: o seu.
   - Em **Público/Usuários de teste**, adicione o seu e-mail do Gmail (e o de quem mais for usar).
   - Deixe o app em **Teste**. Não é preciso publicar.
4. Menu **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**. Nome: Notarius.
   - Em **Origens JavaScript autorizadas**, adicione o endereço do passo 1 **sem** o `/notarius/`, por exemplo `https://SEU-USUARIO.github.io`.
   - Clique em **Criar** e copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).
5. Cole o ID em `js/config.js`, na linha `window.NOTARIUS_CLIENT_ID = '...';`, e envie esse arquivo de novo ao GitHub. Assim PC e celular já abrem configurados. Se preferir, cole o ID em **Ajustes** em cada aparelho.

Na primeira entrada, o Google mostra "O Google não verificou este app". Isso é normal para um app seu em modo de teste: clique em **Avançado → Acessar Notarius**.

## 3. Primeiro uso no PC (Chrome ou Edge)

1. Abra o endereço do app e clique em **Entrar com Google**.
2. Em **Ajustes → HD externo**:
   - **Escolher pasta ESCRITURAS ORGANIZADAS no HD**: selecione `E:\ESCRITURAS ORGANIZADAS`.
   - **Escolher pasta de backup no HD**: crie e selecione, por exemplo, `E:\NOTARIUS BACKUP`.
3. Clique em **Sincronizar HD ⇄ Drive agora**. Na primeira vez são enviados cerca de 664 arquivos (313 MB); deixe o PC ligado até terminar.
4. Em **Escrituras**, clique em **Atualizar do Drive** e depois em **Importar índice**: os dados do `00 - INDICE DAS ESCRITURAS.xlsx` e da planilha de repasse entram no controle.
5. Para instalar no PC, clique no ícone de instalar da barra de endereço.

## 4. Celular

1. Abra o mesmo endereço no navegador do celular e entre com a mesma conta do Google.
2. Instale: no iPhone, **Compartilhar → Adicionar à Tela de Início**; no Android, **⋮ → Instalar app**.

## Como fica o dia a dia

- **Tudo o que você faz** (criar escritura, enviar documentos, orçamento, minuta, marcar como lavrada, receber pagamento) vale nos dois aparelhos.
- **HD externo:** no PC, o app sincroniza o HD com o Drive ao abrir (a cada 6 horas no máximo) e pelo botão em Ajustes.
  - Só copia o que falta de cada lado; nunca apaga nem sobrescreve.
  - As planilhas da raiz (índice e repasse) só vão do HD para o Drive, para não perder o que você edita nelas.
- **Backup:**
  - No Drive, pasta `NOTARIUS/BACKUPS`: um arquivo por dia, guardado para sempre. Nada vai para a lixeira.
  - No HD, na pasta de backup, também um arquivo por dia.
- **Conector Google Drive no Claude:** conecte-o no claude.ai para que o Claude leia os documentos da escritura quando você pedir uma minuta pelo celular.
