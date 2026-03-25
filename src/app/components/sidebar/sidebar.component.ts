import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { KeycloakService } from 'keycloak-angular';
import { KeycloakProfile } from 'keycloak-js';
import { NotificationService } from '../../services/notification.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent implements OnInit {
  isLoggedIn = false;
  userProfile: KeycloakProfile | null = null;

  constructor(
    private keycloak: KeycloakService,
    private router: Router,
    private notificationService: NotificationService
  ) { }

  unreadCount: number = 0;
  private unreadSubscription?: Subscription;

  async ngOnInit() {
    this.isLoggedIn = await this.keycloak.isLoggedIn();
    if (this.isLoggedIn) {
      try {
        this.userProfile = await this.keycloak.loadUserProfile();
        if (this.userProfile?.email) {
          this.notificationService.refreshUnreadCount(this.userProfile.email);
        }
      } catch (error) {
        console.error('Erreur chargement profil:', error);
      }
    }

    this.unreadSubscription = this.notificationService.unreadCount$.subscribe((count: number) => {
      this.unreadCount = count;
    });
  }

  ngOnDestroy(): void {
    if (this.unreadSubscription) {
      this.unreadSubscription.unsubscribe();
    }
  }

  hasRole(role: string): boolean {
    return this.keycloak.isUserInRole(role);
  }

  getDashboardUrl(): string {
    if (this.hasRole('ADMIN')) return '/dashboard-admin';
    if (this.hasRole('AGENT_SCOLARITE')) return '/dashboard-scolarite';
    if (this.hasRole('AGENT_FINANCE')) return '/dashboard-finance';
    if (this.hasRole('ENSEIGNANT_RESPONSABLE')) return '/dashboard-enseignant-responsable';
    if (this.hasRole('ETUDIANT')) return '/pre-inscription';
    return '/';
  }

  goToAccueil() {
    this.router.navigate([this.getDashboardUrl()]);
  }

  logout() {
    this.keycloak.logout(window.location.origin);
  }
}
