const msalConfig = {

    auth:{

        clientId: CONFIG.clientId,

        authority:
            `https://login.microsoftonline.com/${CONFIG.tenantId}`,

        redirectUri:
            CONFIG.redirectUri

    }

};

const msalInstance =
    new msal.PublicClientApplication(msalConfig);

document.getElementById("loginBtn")
.addEventListener("click", login);
document.getElementById("localLoginBtn")
.addEventListener("click", loginLocal);
async function login(){

    try{

        const loginResponse =
            await msalInstance.loginPopup({

                scopes: CONFIG.scopes

            });

        const tokenResponse =
            await msalInstance.acquireTokenSilent({

                scopes: CONFIG.scopes,

                account:
                    loginResponse.account

            });

        localStorage.setItem(
            "userEmail",
            loginResponse.account.username
        );

        localStorage.setItem(
            "account",
            JSON.stringify(loginResponse.account)
        );

        localStorage.setItem(
            "accessToken",
            tokenResponse.accessToken
        );

        window.location.href =
            "dashboard.html";

    }
    catch(error){

        console.error(error);

    }

}
async function loginLocal(){

    try{

        const numero =
            document.getElementById(
                "numeroColaborador"
            ).value;

        const pin =
            document.getElementById(
                "pinColaborador"
            ).value;

        const response = await fetch(

`https://graph.microsoft.com/v1.0/sites/${CONFIG.siteId}/lists/UtilizadoresDashboard/items?$expand=fields`,

            {
                headers:{
                    Authorization:
                        `Bearer ${
                            localStorage.getItem("accessToken")
                        }`
                }
            }

        );

        const data =
            await response.json();

        const utilizador =
            data.value.find(item => {

                return Number(
                    item.fields.NumeroColaborador
                ) === Number(numero)

                &&

                item.fields.PIN === pin

                &&

                item.fields.TipoLogin ===
                    "LOCAL";

            });

        if(!utilizador){

            alert("Credenciais inválidas");

            return;

        }

        localStorage.setItem(
            "userEmail",
            "LOCAL_LOGIN"
        );

        localStorage.setItem(
            "numeroLocal",
            numero
        );

        window.location.href =
            "dashboard.html";

    }
    catch(error){

        console.error(error);

    }

}
