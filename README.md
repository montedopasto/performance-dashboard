# MDP Performance 360

Evolução do Performance Dashboard da Monte do Pasto. O servidor mantém o dashboard pessoal, radar de competências, histórico, perfis e equipa, e acrescenta BSC corporativo/departamental, modelos configuráveis por função, versões das regras, autoavaliação, validação, publicação e tomada de conhecimento.

A aplicação Microsoft existente permanece na raiz, servida pelo GitHub Pages. O acesso sem Microsoft usa o portal Google Apps Script em `google-local/`. A implementação Node em `server/` e `public/` contém a evolução BSC e necessita de execução própria antes de ficar disponível em produção. O servidor só disponibiliza os novos ficheiros de `public/`. Não disponibiliza as páginas antigas que acedem diretamente ao Graph. Não foi feita nenhuma alteração às listas ou à aplicação em produção.

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

O GitHub guarda o código e pode executar testes/builds. [GitHub Pages é um serviço de alojamento estático](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). O servidor de autenticação, permissões e base de dados precisa de um alojamento que execute Node.js ou Docker.

A implementação atual serve interface e API na mesma origem, para proteger a sessão com cookies HttpOnly e CSRF. A publicação da interface separadamente no GitHub Pages exige uma adaptação explícita do domínio, caminho, sessão e política entre origens. Não publique `public/` isoladamente como se fosse uma aplicação funcional.

O Dockerfile prepara a aplicação para um serviço com HTTPS e volume persistente. Configure `PUBLIC_ORIGIN=https://dominio-da-aplicacao`, os valores Microsoft e uma base persistente. Use uma única instância por base SQLite. O armazenamento não pode ser efémero. Faça backups com a API de backup SQLite ou com o serviço parado; não copie apenas o ficheiro principal enquanto o WAL estiver ativo.

## Validação

```sh
npm test
```

Os testes cobrem autenticação, validação Microsoft com tokens assinados de teste, PIN, bloqueios, revogação de sessões, CSRF, isolamento de colaboradores, publicação, snapshots, metas BSC, ciclo de vida, importação e auditoria. O teste do catálogo privado só corre quando `docs/private-catalog.json` está disponível. O login Microsoft real e a migração dos dados da empresa requerem configuração e acesso ao ambiente da empresa.

## Acesso sem Microsoft no Google Sheets

O portal Apps Script em `google-local/` usa uma folha privada exclusivamente para contas sem Microsoft, hashes bcrypt, sessões, publicações e auditoria. As contas serão criadas posteriormente pelo administrador; não se incluem utilizadores de exemplo nem palavras-passe no repositório. O acesso administrativo é validado no servidor via Microsoft Graph e `UtilizadoresDashboard`, exigindo ADMIN. Cada publicação guarda uma cópia imutável dos resultados históricos e uma nova publicação cria outra versão. A informação estratégica dos PowerPoints continua privada e os indicadores não definidos não são inventados.

A implantação Google precisa de executar `setup_` no editor e autorizar Sheets e pedidos externos. A configuração do portal na app só deve ser ativada depois de publicar e verificar o URL `/exec`. O código Google local não substitui a aplicação BSC Node: nesta fase serve consulta e publicação de avaliações SharePoint para colaboradores sem Microsoft.
