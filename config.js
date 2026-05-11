const CONFIG = {

    clientId: "247b5853-5e9d-4907-8955-a1fa67adb33a",

    tenantId: "ee417351-ea90-41e0-9147-5ea6ab38ea49",

    siteId: "montedopastopt.sharepoint.com,8c2379e3-75a3-4dc7-a6d1-2e1ba1d18db9,6673446f-32ef-467c-8bfc-0c8177bdb154",

    redirectUri: window.location.origin + "/performance-dashboard/",

    authority: "https://login.microsoftonline.com/ee417351-ea90-41e0-9147-5ea6ab38ea49",

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
