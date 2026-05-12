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
