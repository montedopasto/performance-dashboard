# Plano de implementação e ativação

## Inspeção da base

Repositório: montedopasto/performance-dashboard. Base: 82604c8859e66d8c19a079927ba473c7b82f9b47.

A aplicação anterior contém HTML, JavaScript, CSS, MSAL e acesso direto a listas SharePoint. O dashboard pessoal usa KPIs por função e histórico oficial. O perfil apresenta histórico e competências. A equipa distingue administrador e chefia.

O acesso local chama primeiro o login Microsoft, lê os utilizadores e compara o campo PIN no navegador. Não resolve o acesso de pessoas sem conta Microsoft. Os filtros do cliente também não constituem autorização no servidor. Os resultados antigos podem ser apresentados com as ponderações da configuração atual. A migração deve conservar os pesos de cada registo histórico.

## Implementação local

| Área | Solução |
| --- | --- |
| Interface | Novas páginas em public/, com a marca existente, navegação por perfil, dashboard, radar, histórico, equipa e impressão PDF |
| Autenticação | Sessões HttpOnly; Microsoft Authorization Code com PKCE e utilizador/PIN independente |
| Autorização | Verificada no servidor para cada colaborador, avaliação e indicador departamental |
| Estratégia | Objetivos corporativos, objetivos departamentais associados e indicadores versionados |
| Avaliação | Modelo por função, pesos, Lead/Lag ou pontuação direta, metas, evidências e plano de melhoria |
| Publicação | Estados sequenciais, aprovação administrativa, publicação e tomada de conhecimento |
| Histórico | Registos append-only, cópia das regras por avaliação, versões e deteção de edições concorrentes |
| Dados anteriores | Exportador paginado e importador transacional, idempotente, sem copiar PINs |

O catálogo estratégico e a extração dos documentos são privados e não entram no repositório público. Os scripts carregam o catálogo no servidor. O esquema serve todas as funções sem inventar indicadores para funções ainda por definir.

## Ativação pendente

1. Obter acesso de escrita ao repositório e abrir uma PR com o código preparado. A ligação disponível devolveu 403 ao criar a branch.
2. Definir o serviço que executará a aplicação. GitHub Pages não executa o servidor. O código pode continuar no GitHub, com testes automáticos.
3. Configurar HTTPS, origem da aplicação, armazenamento persistente e backups.
4. Configurar a plataforma Web do registo Microsoft existente e o segredo no servidor. Associar os Object IDs dos colaboradores.
5. Exportar todas as páginas das listas reais, testar a importação numa base de homologação e rever funções, departamentos e chefias.
6. Rever as propostas e definições pendentes. Validar os modelos antes de ativar os indicadores.
7. Criar uma avaliação de homologação com um colaborador de cada método de acesso. Validar permissões, publicação, radar, histórico e PDF.
8. Aprovar a migração para utilização e publicar apenas avaliações revistas. Conservar a aplicação anterior e a exportação como referência de recuperação.

## Limites verificados

A implementação não alterou a produção, o SharePoint ou o registo Microsoft. O login Microsoft foi verificado com tokens de teste assinados, não com uma sessão real do tenant. A importação foi testada com dados fictícios, não com os dados da empresa. Fotografias SharePoint mantêm referências nos registos importados, sem sincronização de imagens ativa. A impressão PDF utiliza o navegador. A implantação Docker/Actions está preparada, mas ainda não foi executada em alojamento externo.

## Evidência

Nove testes locais passaram: cálculos e pendências, PIN, validação Microsoft, permissões/publicação/snapshots, reposição de PIN, bloqueios, importação, BSC/ciclo de vida e correspondência do catálogo privado. A interface de login, o BSC, os quatro modelos e a criação de versão foram inspecionados no navegador. Os dados de verificação são fictícios e separados da base operacional.
