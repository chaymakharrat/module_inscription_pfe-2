import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService, Notification, NotificationInterne } from '../../services/notification.service';
import { KeycloakService } from 'keycloak-angular';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.css'
})
export class NotificationsComponent implements OnInit {
  notifications: Notification[] = [];       // reçues (EMAIL + INTERNE fusionnés)
  sentNotifications: Notification[] = [];   // envoyées (EMAIL + INTERNE fusionnés)
  unreadCount = 0;
  loading = false;
  activeTab: 'received' | 'sent' = 'received';
  userEmail = '';
  private unreadSubscription?: Subscription;

  constructor(
    private notificationService: NotificationService,
    private keycloak: KeycloakService
  ) { }

  async ngOnInit() {
    const tokenParsed = this.keycloak.getKeycloakInstance().tokenParsed as any;
    this.userEmail = tokenParsed?.email || tokenParsed?.preferred_username || '';
    this.loadNotifications();
    this.loadUnreadCount();

    this.unreadSubscription = this.notificationService.unreadCount$.subscribe(count => {
      this.unreadCount = count;
    });
  }

  loadNotifications() {
    if (!this.userEmail) return;
    this.loading = true;
    this.notifications = [];
    this.sentNotifications = [];
    let completed = 0;

    const checkComplete = () => {
      completed++;
      if (completed === 3) {
        this.loading = false;
        this.notifications.sort((a, b) =>
          new Date(b.dateEnvoie).getTime() - new Date(a.dateEnvoie).getTime()
        );
        this.sentNotifications.sort((a, b) =>
          new Date(b.dateEnvoie).getTime() - new Date(a.dateEnvoie).getTime()
        );
      }
    };

    // EMAIL reçus
    this.notificationService.getReceivedNotifications(this.userEmail).subscribe({
      next: (res) => { this.notifications.push(...res); checkComplete(); },
      error: () => checkComplete()
    });

    // INTERNE reçus
    this.notificationService.getReceivedInternalNotifications(this.userEmail).subscribe({
      next: (res) => {
        this.notifications.push(...res.map(ni => this.mapInternalToRegular(ni)));
        checkComplete();
      },
      error: () => checkComplete()
    });


    // INTERNE envoyés
    this.notificationService.getSentInternalNotifications(this.userEmail).subscribe({
      next: (res) => {
        this.sentNotifications.push(...res.map(ni => this.mapInternalToRegular(ni)));
        checkComplete();
      },
      error: () => checkComplete()
    });
  }

  loadUnreadCount() {
    if (!this.userEmail) return;
    this.notificationService.refreshUnreadCount(this.userEmail);
  }

  onNotificationClick(notif: Notification) {
    if (this.activeTab !== 'received' || notif.statut !== 'NON_LUE') return;

    if (notif.type === 'INTERNE') {
      this.notificationService.markInternalAsRead(notif.id, this.userEmail).subscribe(() => {
        notif.statut = 'LUE';
      });
    } else {
      this.notificationService.markAsRead(notif.id, this.userEmail).subscribe(() => {
        notif.statut = 'LUE';
      });
    }
  }

  markAllAsRead() {
    if (!this.userEmail) return;
    this.notificationService.markAllAsRead(this.userEmail).subscribe(() => {
      this.notifications.forEach(n => n.statut = 'LUE');
    });
  }

  private mapInternalToRegular(ni: NotificationInterne): Notification {
    return {
      id: ni.id,
      loginEnvoyeur: ni.loginEnvoyeur,
      loginDestinataire: ni.loginDestinataire,
      message: ni.message,
      type: 'INTERNE',
      dateEnvoie: ni.dateEnvoie,
      statut: ni.lu ? 'LUE' : 'NON_LUE'
    };
  }

  setTab(tab: 'received' | 'sent') {
    this.activeTab = tab;
  }

  ngOnDestroy() {
    if (this.unreadSubscription) {
      this.unreadSubscription.unsubscribe();
    }
  }
}