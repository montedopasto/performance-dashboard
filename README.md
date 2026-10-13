# MDP Performance 360

Evolução do Performance Dashboard da Monte do Pasto. O servidor mantém o dashboard pessoal, radar de competências, histórico, perfis e equipa, e acrescenta BSC corporativo/departamental, modelos configuráveis por função, versões das regras, autoavaliação, validação, publicação e tomada de conhecimento.

A interface principal é uma aplicação única no GitHub Pages: `index.html`, `app.js`, `style.css`. Os antigos endereços `dashboard.html`, `equipa.html`, `avaliacao.html` e `colaborador.html` encaminham para esta nova interface. A entrada apresenta a visão geral, BSC corporativo e departamental, avaliações, modelos e administração; o histórico de origem é consultado dentro do novo espaço, sem recuperar o ecrã antigo.

A API existente em Apps Script executa as regras, conserva os dados corporativos no SharePoint e usa uma folha privada apenas para contas sem Microsoft, sessões, autoavaliações e cópias publicadas para esses colaboradores. `acesso.html` oferece esse acesso no mesmo endereço e identidade visual da aplicação. A implementação Node em `server/` e `public/` continua disponível como alternativa de alojamento.

`google-local/ApiRelay.html` liga a interface do GitHub à API através de mensagens entre origens. Não contém formulários nem dados de avaliação. Apenas esta página sem interface permite incorporação; os portais completos mantêm a proteção padrão do Apps Script. O relay aceita apenas a origem exata da empresa, a janela superior, um identificador aleatório por carregamento e pedidos com identificador próprio. O cliente verifica também a origem e janela do relay em todas as respostas. Cada operação continua a validar autenticação e permissões no servidor. Tokens Microsoft, palavras-passe e resultados não são colocados no URL ou no código público. O cliente conserva os seus tokens de acesso apenas em memória; a biblioteca Microsoft mantém a sua cache de sessão.

## Executar

Node.js 24 recomendado. Mínimo 22.14 (SQLite experimental nessa versão).

```sh
npm ci
```

Configure `ADMIN_USERNAME`, `ADMIN_NAME` e `ADMIN_PIN` no ambiente, e execute `npm run bootstrap`. A palavra-passe inicial requer 8 a 128 caracteres e mudança no primeiro acesso. As credenciais não devem ser guardadas no Git ou no histórico de comandos.

O catálogo extraído dos PowerPoints é privado. Coloque-o no servidor em `data/source-catalog.json` ou configure `SOURCE_CATALOG_PATH` antes do bootstrap. Não se inclui no Git, na imagem Docker ou no cliente. Sem catálogo, a base começa vazia e o administrador cria os modelos na interface.

```sh
npm start
```

Abra `http://localhost:3000`. Para carregar variáveis de um ficheiro `.env`, utilize `node --env-file=.env server/index.js`. O comando `npm start` usa as variáveis já presentes no ambiente.

## Microsoft 365

O tenant e client ID existentes podem ser mantidos. Configure os valores de `.env.example` no servidor. No registo Entra ID, acrescente uma plataforma **Web** com o redirect URI `PUBLIC_ORIGIN/auth/microsoft/callback` e um segredo de aplicação. Mantenha a configuração SPA existente durante a transição. O segredo só existe no servidor.

O login usa Authorization Code com PKCE, estado de uso único e nonce. O servidor valida assinatura, emissor, audiência, validade temporal, tenant e identidade. O Object ID Microsoft (`oid`) tem de estar associado previamente a um colaborador ativo. O email recebido do navegador não concede acesso nem atribui perfis.

Referências: [fluxo Microsoft Authorization Code](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [validação de tokens](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens).

## Permissões

| Perfil | Acesso |
| --- | --- |
| Administrador | Estrutura, modelos, PINs, auditoria, avaliações, aprovação e publicação |
| Direção | BSC corporativo e departamental. As avaliações individuais de terceiros não estão disponíveis por defeito |
| Chefia | Avaliações da equipa direta e resultados BSC do próprio departamento |
| Colaborador | Próprias avaliações publicadas, autoavaliação dos objetivos atribuídos e tomada de conhecimento |

As regras são verificadas em todos os pedidos ao servidor. Antes da publicação, a autoavaliação mostra apenas o modelo atribuído e a resposta do próprio colaborador. Nunca mostra resultados provisórios da chefia.

## Modelos e avaliações

O administrador configura objetivos, pesos, critérios, unidades, metas, definições, regras e associação a objetivos estratégicos sem editar código. Os pesos dos objetivos totalizam 100%. O modelo permite Lead/Lag e média ponderada de pontuações. As competências aparecem no radar e são guardadas separadamente da pontuação global.

Indicadores/modelos seguem Em definição, Em validação, Aprovado, Ativo e Arquivado. Alterações às regras aprovadas requerem uma nova versão em definição. Arquivar um modelo não modifica as avaliações existentes.

Períodos suportados: `AAAA-M01` a `AAAA-M12`, `AAAA-Q1` a `AAAA-Q4` e `AAAA-A`. Cada nova avaliação guarda o modelo completo, metas, pesos, nomes e função vigentes. A edição posterior do catálogo não altera essa cópia. Os resultados BSC também guardam a versão do indicador e a meta do período.

Avaliações seguem Rascunho, Em avaliação, Em validação, Aprovada e Publicada. Chefias preenchem e submetem. Administradores aprovam e publicam. Antes da publicação, o administrador pode devolver para correção, com motivo. Avaliações publicadas não permitem alterar resultados. A tomada de conhecimento fica datada e pode incluir discordância.

Critérios pendentes, resultados em falta e N/A mantêm a avaliação incompleta. Não se redistribuem pesos nem se atribui sucesso a metas desconhecidas. Aprovação e publicação exigem cálculo completo. Incidentes graves assinalados exigem revisão explícita. N/A exige justificação.

## Migrar SharePoint

1. Faça uma exportação completa, paginada, com acesso de leitura autorizado. O script `server/export-sharepoint.js` aceita um token Graph autorizado em `GRAPH_EXPORT_TOKEN` e um caminho de saída como argumento. Remove o campo PIN da exportação.
2. Guarde a exportação num local privado. Não a envie para o GitHub.
3. Faça uma cópia de segurança da base de destino e execute `npm run import:legacy -- /caminho/privado/export.json`.
4. Reveja colaboradores, funções e chefias. Associe os Object IDs Microsoft. Atribua novos PINs aos utilizadores locais pela administração.
5. Reveja e valide os modelos importados. O histórico entra em rascunho e precisa de revisão, aprovação e publicação explícitas. `SnapshotOficial` anterior não é tratado como publicação no novo sistema.

O importador conserva resultados, pesos e metas históricos, competências, datas e referências. Nunca usa a configuração atual para recalcular o passado. Recusa pesos históricos ausentes e exportações incompletas. A importação é atómica e não duplica avaliações numa segunda execução. Não copia PINs em texto simples. Os registos de origem ficam guardados no servidor após remoção de credenciais.

As listas reais ainda não foram exportadas nesta implementação. As fotografias SharePoint permanecem referenciadas nos registos antigos; a sincronização de imagens não está ligada. O acesso a relatórios oferece impressão e guardar PDF pelo navegador.

## GitHub e alojamento

O GitHub guarda o código e pode executar testes/builds. [GitHub Pages é um serviço de alojamento estático](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). A publicação atual usa Apps Script para executar as regras e SharePoint para os dados corporativos. A alternativa Node necessita de alojamento Node.js ou Docker.

A alternativa Node serve interface e API na mesma origem, com cookies HttpOnly e CSRF. A versão GitHub Pages utiliza o transporte autenticado descrito acima. Não publique `public/` isoladamente: os ficheiros dessa alternativa dependem das rotas do servidor Node.

O Dockerfile prepara a aplicação para um serviço com HTTPS e volume persistente. Configure `PUBLIC_ORIGIN=https://dominio-da-aplicacao`, os valores Microsoft e uma base persistente. Use uma única instância por base SQLite. O armazenamento não pode ser efémero. Faça backups com a API de backup SQLite ou com o serviço parado; não copie apenas o ficheiro principal enquanto o WAL estiver ativo.

## Validação

```sh
npm test
```

Os testes cobrem autenticação, validação Microsoft com tokens assinados de teste, PIN, bloqueios, revogação de sessões, CSRF, isolamento de colaboradores, publicação, snapshots, metas BSC, ciclo de vida, importação e auditoria. O teste do catálogo privado só corre quando `docs/private-catalog.json` está disponível. O login Microsoft real e a migração dos dados da empresa requerem configuração e acesso ao ambiente da empresa.

## Acesso sem Microsoft no Google Sheets

O portal Apps Script em `google-local/` usa uma folha privada exclusivamente para contas sem Microsoft, hashes bcrypt, sessões, publicações e auditoria. As contas serão criadas posteriormente pelo administrador; não se incluem utilizadores de exemplo nem palavras-passe no repositório. O acesso administrativo é validado no servidor via Microsoft Graph e `UtilizadoresDashboard`, exigindo ADMIN. Cada publicação guarda uma cópia imutável dos resultados históricos e uma nova publicação cria outra versão. A informação estratégica dos PowerPoints continua privada e os indicadores não definidos não são inventados.

O portal Google foi inicializado e publicado. O endereço `/exec` está configurado em `CONFIG.localPortalUrl`. A página de entrada é acessível sem conta Google; todos os pedidos de dados exigem uma sessão local ou validação Microsoft ADMIN no servidor. A folha de dados não é pública. A função temporária de inicialização foi retirada antes da publicação. Os módulos BSC usam o mesmo portal, através de `?mode=performance`, e validam cada sessão Microsoft com os perfis existentes. O Google Sheets guarda apenas as contas, sessões e cópias de avaliações dos colaboradores sem Microsoft.

## Módulos corporativos no Apps Script

O projeto privado inclui `Código.gs` (Code, PerformanceDomain, PerformanceApi, PerformanceStore, PerformancePrivate, PerformanceCrypto e PerformanceLocal), `Bcrypt.gs`, `Portal.html` e `Performance.html`. Configure `LOCAL_DB_ID` e `COMPANY_SITE_ID` nas propriedades privadas do projeto (ou injete os valores apenas no bundle privado de publicação). Esses identificadores não constam no código público. A função privada `performanceProposals_` é incluída apenas no projeto Google, a partir de `docs/private-proposals.gs`, ignorado pelo Git. Nunca copie o catálogo estratégico para o repositório público.

A preparação, reservada a ADMIN Microsoft, cria `MDP360Entities` no SharePoint e importa os objetivos, indicadores e quatro modelos dos PowerPoints em definição. Importa os colaboradores reais existentes sem criar credenciais. Não ativa indicadores, não publica avaliações e não preenche funções ainda em desenho.

O catálogo e as versões BSC ficam nessa lista. Os resultados individuais nunca entram na lista partilhada: cada avaliação usa ficheiros privados separados para histórico da chefia, modelo de autoavaliação, respostas do próprio e publicação. Os ficheiros começam vazios; o acesso herdado é removido e verificado antes de escrever informação individual. A partilha exige início de sessão e não envia convites por email. A avaliação em preparação pertence à administração e à chefia atribuída; o colaborador recebe apenas o modelo e a publicação. Respostas Microsoft são assinadas no servidor e são congeladas ao submeter a avaliação para validação.

A chefia é atribuída antes de criar avaliações. A atribuição fica bloqueada quando existem avaliações, para conservar o acesso e a responsabilidade históricos. Reatribuição de avaliações existentes requer uma operação futura de transferência e revisão das permissões.

As avaliações antigas são consultadas nas listas originais com os valores históricos, sem recalcular com os modelos atuais. A aplicação anterior, o radar e os relatórios permanecem disponíveis no GitHub Pages.


As avaliações individuais são guardadas no SharePoint como envelopes AES-256-CBC com HMAC-SHA-256 (encrypt-then-MAC), ligados ao ID do ficheiro. As chaves são derivadas com separação de domínio do segredo privado PEPPER existente no Apps Script; nunca são enviadas ao browser ou ao SharePoint. A propriedade PEPPER tem de ser preservada e incluída nas cópias de segurança privadas do serviço. O IV é novo em cada gravação. A leitura valida o MAC antes de desencriptar. O único grupo implícito aceite é o grupo exato de proprietários deste site, apenas com a função owner, porque a Microsoft o devolve mesmo para itens com ACL exclusiva. Outros grupos, links, herança e identidades desconhecidas continuam bloqueados. Os controlos de acesso da API, publicação e histórico mantêm-se. Ficheiros vazios de tentativas anteriores continuam válidos; conteúdo privado sem envelope exige migração explícita e não é aceite silenciosamente.

`google-local/PerformanceCrypto.gs` contém os módulos AES necessários do CryptoJS 4.2.0, com licença MIT em `google-local/CRYPTOJS-LICENSE.txt`. O runtime Apps Script não dispõe de WebCrypto; todos os IVs e chaves são fornecidos explicitamente, sem usar o gerador aleatório do CryptoJS.


### Ficheiro-base Excel no SharePoint

A administração liga um `.xlsx` do mesmo site em Administração → Ficheiro-base de resultados. A tabela `Resultados` tem os cabeçalhos `Período`, `N.º colaborador`, `Código indicador`, `Indicador`, `Unidade`, `Valor realizado`, `Evidência`, `Observação`, `Estado`. Só as linhas com `Estado = Pronto` e valores numéricos são importadas. Percentagens usam a unidade da app: 1,5 representa 1,5%, sem somar ou agregar períodos. Uma linha da empresa deixa o colaborador vazio; uma linha individual usa o seu número exato.

Os códigos são gerados dos registos da app: `EMP/<kpiId>` e `IND/<templateId>/<criterionId>`. O botão Atualizar lista de indicadores no Excel atualiza a tabela `Indicadores`, acrescenta novos códigos e preserva os antigos. Funções, modelos, critérios e competências adicionais não exigem alterar o importador. As fórmulas de seleção do ficheiro-base leem até 5000 indicadores; para mais linhas de resultados, copie a última linha da tabela para preservar fórmulas e validação.

A origem está restrita aos administradores Microsoft ativos e aos administradores implícitos do site. Os resultados entram nos rascunhos ou avaliações Em avaliação, com a versão do modelo já guardada. Alterações manuais, submissão, aprovação e publicação são preservadas; a importação nunca publica nem cria avaliações automaticamente. As avaliações individuais continuam cifradas no SharePoint. Cada atualização guarda a proveniência e uma nova versão. Linhas duplicadas, desconhecidas, com unidades incorretas ou sem rascunho são reportadas sem inventar valores. Os dados em preparação e indicadores inativos ficam pendentes.

A app verifica automaticamente a origem na sessão de administração, no máximo uma vez a cada cinco minutos de navegação, e ao utilizar Atualizar dados. Atualizar resultados agora força a verificação. Não há um serviço em segundo plano quando a app está fechada. O ETag do ficheiro e as versões dos modelos/avaliações evitam reimportações desnecessárias. Cada pedido guarda até três avaliações/resultados para permitir retomar importações interrompidas; a interface continua os lotes. `PerformanceExcel.gs` deve ser incluído no bundle privado Apps Script. O ficheiro-base, catálogo estratégico e dados reais não são publicados no GitHub.

### Excel central da empresa

`Administração → Excel central da empresa` lê a tabela de receções reais identificada pelos cabeçalhos, mesmo que o nome da tabela mude. `PerformanceCentral.gs` precisa de estar incluído no projeto Apps Script, e a rota `/central-source/preview` deve preceder o encaminhamento genérico da API. A leitura está reservada à administração e não escreve avaliações.

Esta primeira integração calcula resumos semanais de conformidade, documentação e transporte. Cabeçalhos, datas, duplicados, quantidades e correspondência da população são validados. Pesos provenientes de fórmulas ficam assinalados para confirmação; a tarifa €/kg não altera a unidade €/animal do modelo. As outras áreas e a distribuição dos resultados por modelos/períodos ainda exigem regras de ligação; não são consideradas implementadas por esta leitura. O Excel central e os seus dados reais permanecem no SharePoint privado, fora do repositório público.
