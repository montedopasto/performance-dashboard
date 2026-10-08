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

        localStorage.removeItem('tipoLogin');
        localStorage.removeItem('numeroLocal');
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
function loginLocal(){
    try {
        const url = new URL(CONFIG.localPortalUrl);
        if (url.origin !== 'https://script.google.com' || !url.pathname.endsWith('/exec')) throw Error('invalid');
        window.location.assign(url.href);
    } catch {
        document.getElementById('status').textContent = 'O acesso dos colaboradores ainda não está disponível. Contacte a administração.';
    }
}
