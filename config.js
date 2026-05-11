const CONFIG = {

    clientId: "247b5853-5e9d-4907-8955-a1fa67adb33a",

    tenantId: "COLOCA_AQUI_TENANT_ID",

    redirectUri: window.location.origin + "/performance-dashboard/",

    authority: "https://login.microsoftonline.com/COLOCA_AQUI_TENANT_ID",

    scopes: [
        "User.Read",
        "Sites.ReadWrite.All",
        "Files.ReadWrite.All"
    ],

    siteName: "App Performance Dashboard",

    lists: {
        utilizadores: "UtilizadoresDashboard",
        kpis: "KPIsDashboard",
        funcoes: "FuncoesDashboard",
        historico: "HistoricoKPIs",
        softskills: "SoftSkillsDashboard",
        configuracao: "ConfiguracaoFuncoes"
    }

};
