<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Erreur - iTech University</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        html, body {
            height: 100%;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
        }

        /* FOND ANIMÉ */
        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: 
                radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.9) 0%, transparent 70%),
                linear-gradient(135deg, #ffffff 0%, #a5c2e1 100%);
            z-index: 0;
        }

        .sun-rays {
            position: fixed;
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
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
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

        .error-wrapper {
            width: 100%;
            max-width: 480px;
            padding: 25px;
            position: relative;
            z-index: 10;
        }

        .error-container {
            background: rgba(255, 255, 255, 0.75);
            backdrop-filter: blur(25px);
            -webkit-backdrop-filter: blur(25px);
            border-radius: 32px;
            border: 1px solid rgba(255, 255, 255, 0.8);
            padding: 50px 45px;
            text-align: center;
            box-shadow: 
                0 10px 25px -5px rgba(0, 0, 0, 0.05),
                0 25px 50px -12px rgba(37, 99, 235, 0.15);
            animation: slideIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .logo-container {
            margin-bottom: 20px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 120px;
            height: 120px;
        }

        .logo-img {
            width: 100%;
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

        .error-icon {
            font-size: 48px;
            margin: 20px 0;
        }

        h1 {
            color: #1e293b;
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 15px;
        }

        .error-message {
            background: rgba(239, 68, 68, 0.1);
            border: 2px solid rgba(239, 68, 68, 0.3);
            color: #991b1b;
            padding: 16px 20px;
            border-radius: 12px;
            font-size: 14px;
            margin: 20px 0;
        }

        .btn {
            display: inline-block;
            margin-top: 25px;
            padding: 16px 32px;
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            color: white;
            border-radius: 16px;
            text-decoration: none;
            font-weight: 700;
            font-size: 15px;
            transition: all 0.3s;
            box-shadow: 0 12px 24px -6px rgba(37, 99, 235, 0.4);
        }

        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 30px -8px rgba(37, 99, 235, 0.5);
            filter: brightness(1.1);
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
            .error-container {
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

    <div class="error-wrapper">
        <div class="error-container">
            <div class="logo-container">
                <img src="${url.resourcesPath}/img/logo-itech.png" alt="Logo iTech" class="logo-img">
            </div>
            <p class="subtitle">iTech University</p>

            <div class="error-icon">⚠️</div>
            <h1>Une erreur est survenue</h1>

            <#if message?has_content>
                <div class="error-message">
                    ${kcSanitize(message.summary)?no_esc}
                </div>
            </#if>

            <#if skipLink??>
            <#else>
                <#if client?? && client.baseUrl?has_content>
                    <a href="${client.baseUrl}" class="btn">← Retour à l'application</a>
                <#else>
                    <a href="${url.loginUrl}" class="btn">← Retour à la connexion</a>
                </#if>
            </#if>
        </div>
    </div>
</body>
</html>
