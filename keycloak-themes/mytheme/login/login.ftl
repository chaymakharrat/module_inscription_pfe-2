<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connexion - iTech University</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #f8fafc;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
        }

        /* FOND ANIMÉ */
        body::before {
            content: '';
            position: absolute;
            inset: 0;
            background: 
                radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.9) 0%, transparent 70%),
                linear-gradient(135deg, #ffffff 0%, #a5c2e1 100%);
            z-index: 0;
        }

        .sun-rays {
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: repeating-conic-gradient(
                from 0deg,
                transparent 0deg 15deg,
                rgba(255, 255, 255, 0.15) 20deg 25deg
            );
            animation: rotateRays 120s linear infinite;
            pointer-events: none;
            z-index: 1;
        }

        .network-bg {
            position: absolute;
            inset: 0;
            z-index: 2;
            perspective: 1000px;
        }

        .network-bg::before {
            content: '';
            position: absolute;
            top: 0;
            left: -50%;
            width: 200%;
            height: 200%;
            background-image: 
                linear-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.4) 1px, transparent 1px);
            background-size: 60px 60px;
            transform: rotateX(60deg);
            transform-origin: top;
            animation: meshFlow 20s linear infinite;
            mask-image: radial-gradient(ellipse at center, black, transparent 80%);
        }

        /* CONTENEUR AGRANDI */
        .login-wrapper {
            width: 100%;
            max-width: 480px; /* Augmenté de 420px à 480px */
            padding: 25px;
            position: relative;
            z-index: 10;
        }

        .login-container {
            background: rgba(255, 255, 255, 0.75);
            backdrop-filter: blur(25px);
            -webkit-backdrop-filter: blur(25px);
            border-radius: 32px;
            border: 1px solid rgba(255, 255, 255, 0.8);
            padding: 50px 45px; /* Padding interne augmenté */
            box-shadow: 
                0 10px 25px -5px rgba(0, 0, 0, 0.05),
                0 25px 50px -12px rgba(37, 99, 235, 0.15);
            animation: slideIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .login-header {
            text-align: center;
            margin-bottom: 40px;
        }

        /* LOGO MIEUX CADRÉ */
        .logo-container {
            margin-bottom: 20px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 120px; /* Taille plus imposante */
            height: 120px;
            position: relative;
        }

        .logo-img {
            width: 100%; /* Plus de débordement à 150% */
            height: 100%;
            object-fit: contain;
            filter: drop-shadow(0 8px 15px rgba(0, 0, 0, 0.1));
        }

        .subtitle {
            color: #1e293b;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 3px;
            font-weight: 700;
            margin-top: 10px;
        }

        /* FORMULAIRE PLUS ESPACÉ */
        .form-group { 
            margin-bottom: 25px; 
        }

        .form-group label {
            display: block;
            margin-bottom: 10px;
            color: #475569;
            font-weight: 600;
            font-size: 14px;
            padding-left: 5px;
        }

        .form-group input {
            width: 100%;
            padding: 16px 20px; /* Inputs plus grands */
            border: 2px solid rgba(226, 232, 240, 0.8);
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.8);
            font-size: 16px;
            transition: all 0.3s ease;
        }

        .form-group input:focus {
            outline: none;
            border-color: #3b82f6;
            background: #ffffff;
            box-shadow: 0 0 0 5px rgba(59, 130, 246, 0.1);
            transform: translateY(-1px);
        }

        .btn-login {
            width: 100%;
            padding: 18px;
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            color: white;
            border: none;
            border-radius: 16px;
            font-size: 16px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 12px 24px -6px rgba(37, 99, 235, 0.4);
            margin-top: 10px;
        }

        .btn-login:hover {
            transform: translateY(-3px);
            box-shadow: 0 15px 30px -8px rgba(37, 99, 235, 0.5);
            filter: brightness(1.1);
        }

        .login-footer {
            margin-top: 35px;
            text-align: center;
            font-size: 15px;
        }

        .login-footer a {
            color: #2563eb;
            text-decoration: none;
            font-weight: 600;
            padding: 10px;
            transition: color 0.3s;
        }

        .login-footer a:hover {
            color: #1d4ed8;
            text-decoration: underline;
        }

        /* ANIMATIONS */
        @keyframes rotateRays {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        @keyframes meshFlow {
            from { background-position: 0 0; }
            to { background-position: 0 60px; }
        }
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Mobile */
        @media (max-width: 480px) {
            .login-container {
                padding: 40px 25px;
            }
            .logo-container {
                width: 100px;
                height: 100px;
            }
        }
    </style>
</head>
<body>
    <div class="sun-rays"></div>
    <div class="network-bg"></div>

    <div class="login-wrapper">
        <div class="login-container">
            <div class="login-header">
                <div class="logo-container">
                    <img src="${url.resourcesPath}/img/logo-itech.png" alt="Logo iTech" class="logo-img">
                </div>
                <p class="subtitle">iTech University</p>
            </div>

            <#if message?has_content>
                <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #dc2626; padding: 12px 16px; border-radius: 12px; margin-bottom: 25px; font-size: 14px; text-align: center; font-weight: 500;">
                    ${message.summary?no_esc}
                </div>
            </#if>

            <form action="${url.loginAction}" method="post">
                <div class="form-group">
                    <label for="username">Nom d'utilisateur</label>
                    <input type="text" id="username" name="username" placeholder="votre.nom" required autofocus>
                </div>

                <div class="form-group">
                    <label for="password">Mot de passe</label>
                    <input type="password" id="password" name="password" placeholder="••••••••" required>
                </div>

                <button type="submit" class="btn-login">Se connecter au portail</button>
            </form>

            <div class="login-footer">
                <#if realm.resetPasswordAllowed>
                    <a href="${url.loginResetCredentialsUrl}">Mot de passe oublié ?</a>
                </#if>
            </div>
        </div>
    </div>
</body>
</html>