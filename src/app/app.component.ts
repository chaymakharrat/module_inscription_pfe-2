import { Component, OnInit } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { AlertComponent } from './components/shared/alert/alert.component';
import { CommonModule } from '@angular/common';
import { KeycloakService } from 'keycloak-angular';
import { filter } from 'rxjs/operators';

import { ScrollService } from './services/scroll.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, SidebarComponent, AlertComponent, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'inscription-front';
  showNavbar = true; // Par défaut vrai pour Home
  showSidebar = false;
  isLoggedIn = false;

  constructor(
    private keycloak: KeycloakService,
    private router: Router,
    private scrollService: ScrollService
  ) { }

  onScroll(event: Event) {
    const target = event.target as HTMLElement;
    this.scrollService.notifyScroll(target.scrollTop);
  }

  async ngOnInit() {
    this.isLoggedIn = await this.keycloak.isLoggedIn();

    // Initial check
    this.updateLayout(this.router.url);

    // Watch route changes
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.updateLayout(event.urlAfterRedirects);
    });

    // Auto-redirect if logged in on Home page
    if (this.isLoggedIn && (this.router.url === '/' || this.router.url === '/home')) {
      this.redirectByRole();
    }
  }

  private updateLayout(url: string) {
    const isHome = url === '/' || url === '/home';
    const isDossier = url.includes('/mon-dossier');

    // On n'affiche la sidebar QUE si on n'est pas sur Home ET qu'on est connecté ET qu'on n'est pas ETUDIANT
    // (L'étudiant n'a pas besoin de la sidebar interne)
    this.showSidebar = !isHome && !isDossier && this.isLoggedIn && !this.keycloak.isUserInRole('ETUDIANT');

    // Le navbar est affiché sur Home, ou si non connecté, ou pour les étudiants
    // SAUF pour la page dossier (mon-dossier) qui a sa propre topnav
    this.showNavbar = (isHome || !this.isLoggedIn || this.keycloak.isUserInRole('ETUDIANT')) && !isDossier;
  }

  private redirectByRole() {
    if (this.keycloak.isUserInRole('ADMIN')) {
      this.router.navigate(['/dashboard-admin']);
    } else if (this.keycloak.isUserInRole('AGENT_SCOLARITE')) {
      this.router.navigate(['/dashboard-scolarite']);
    } else if (this.keycloak.isUserInRole('AGENT_FINANCE')) {
      this.router.navigate(['/dashboard-finance']);
    } else if (this.keycloak.isUserInRole('ENSEIGNANT_RESPONSABLE')) {
      this.router.navigate(['/dashboard-departement']);
    }
    // Pour l'ETUDIANT, on peut le laisser sur Home pour qu'il voie le bouton Pré-inscription
  }
}

