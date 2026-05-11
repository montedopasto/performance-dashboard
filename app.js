const msalConfig = {
    auth: {
        clientId: CONFIG.clientId,
        authority: CONFIG.authority,
        redirectUri: CONFIG.redirectUri
    }
};

const msalInstance = new msal.PublicClientApplication(msalConfig);

const loginBtn = document.getElementById("loginBtn");
const statusDiv = document.getElementById("status");

loginBtn.addEventListener("click", loginMicrosoft);

async function loginMicrosoft(){

    try{

        statusDiv.innerHTML = "A iniciar sessão...";

        const loginResponse = await msalInstance.loginPopup({
            scopes: CONFIG.scopes
        });

        console.log(loginResponse);

        statusDiv.innerHTML = "Login efetuado com sucesso.";

        localStorage.setItem(
            "accessToken",
            loginResponse.accessToken
        );

        localStorage.setItem(
            "userName",
            loginResponse.account.name
        );

        localStorage.setItem(
            "userEmail",
            loginResponse.account.username
        );

        setTimeout(() => {

            window.location.href = "dashboard.html";

        },1000);

    }
    catch(error){

        console.error(error);

        statusDiv.innerHTML = "Erro no login.";

    }

}
