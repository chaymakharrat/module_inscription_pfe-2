import { ApplicationConfig, provideZoneChangeDetection, APP_INITIALIZER, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withFetch, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { KeycloakService, KeycloakBearerInterceptor } from 'keycloak-angular';
import { routes } from './app.routes';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { LOCALE_ID } from '@angular/core';

registerLocaleData(localeFr);

// ── URL dynamique selon l'appareil ──────────────────────────────
// function getBaseUrl(): string {
//   const hostname = window.location.hostname;
//   // PC → localhost | Mobile → 192.168.1.14
//   return `http://${hostname}`;
// }

// function initializeKeycloak(keycloak: KeycloakService) {
//   return () =>
//     keycloak.init({
//       config: {
//         url: `${getBaseUrl()}:8180`,   // localhost:8180 ou 192.168.1.14:8180
//         realm: 'bdcc-realm',
//         clientId: 'inscription-front-angular',
//       },
//       initOptions: {
//         onLoad: 'check-sso',
//         checkLoginIframe: false,
//       },
//       enableBearerInterceptor: true,
//       bearerExcludedUrls: ['/assets', '/clients/public']
//     });
// }
function getKeycloakUrl(): string {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8180';
  }
  if (hostname.includes('ngrok')) {
    return 'https://unlapped-nonpartially-shawanda.ngrok-free.dev';
  }
  return `http://${hostname}:8180`;
}
// function getKeycloakUrl(): string {
//   const hostname = window.location.hostname;

//   if (hostname === 'localhost' || hostname === '127.0.0.1') {
//     return 'http://localhost:8180';
//   }

//   if (hostname.includes('ngrok')) {
//     // Keycloak reste en IP locale — accès WiFi uniquement
//     return 'http://192.168.1.15:8180';
//   }

//   return `http://${hostname}:8180`;
// }

function initializeKeycloak(keycloak: KeycloakService) {
  return () =>
    keycloak.init({
      config: {
        url: getKeycloakUrl(),  // ← remplace getBaseUrl():8180
        realm: 'bdcc-realm',
        clientId: 'inscription-front-angular',
      },
      initOptions: {
        onLoad: 'check-sso',
        checkLoginIframe: false,
      },
      enableBearerInterceptor: true,
      bearerExcludedUrls: ['/assets', '/clients/public']
    });
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: KeycloakBearerInterceptor,
      multi: true
    },
    KeycloakService,
    {
      provide: APP_INITIALIZER,
      useFactory: initializeKeycloak,
      multi: true,
      deps: [KeycloakService],
    },
    { provide: LOCALE_ID, useValue: 'fr' }
  ]
};