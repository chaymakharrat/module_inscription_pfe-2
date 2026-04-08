import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { environment } from '../envirements/enviremetns';

export interface Notification {
  id: number;
  loginEnvoyeur: string;
  loginDestinataire: string;
  message: string;
  type: string;
  dateEnvoie: string;
  statut?: string;
}

export interface NotificationInterne {
  id: number;
  loginEnvoyeur: string;
  loginDestinataire: string;
  message: string;
  lu: boolean;
  dateEnvoie: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private baseUrl = `${environment.apiUrl}/NOTIFICATION-SERVICE/api/notifications`;

  private unreadCountSubject = new BehaviorSubject<number>(0);
  unreadCount$ = this.unreadCountSubject.asObservable();

  constructor(private http: HttpClient) { }

  // ── EMAIL ──────────────────────────────────────────
  getReceivedNotifications(login: string): Observable<Notification[]> {
    return this.http.get<Notification[]>(`${this.baseUrl}/received/${login}`);
  }



  markAsRead(id: number, email: string): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${id}/mark-as-read`, {}).pipe(
      tap(() => this.refreshUnreadCount(email))
    );
  }

  // ── INTERNE ────────────────────────────────────────
  getReceivedInternalNotifications(login: string): Observable<NotificationInterne[]> {
    return this.http.get<NotificationInterne[]>(`${this.baseUrl}/internal/received/${login}`);
  }

  getSentInternalNotifications(login: string): Observable<NotificationInterne[]> {
    return this.http.get<NotificationInterne[]>(`${this.baseUrl}/internal/sent/${login}`);
  }

  markInternalAsRead(id: number, email: string): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/internal/${id}/mark-as-read`, {}).pipe(
      tap(() => this.refreshUnreadCount(email))
    );
  }

  sendInternalNotification(senderEmail: string, receiverEmail: string, message: string, subject: string): Observable<void> {
    const payload = {
      senderEmail,
      receiverEmail,
      message,
      subject,
      statut: 'NON_LUE'
    };
    return this.http.post<void>(`${this.baseUrl}/send-internal`, payload);
  }

  // ── GLOBAL ─────────────────────────────────────────
  markAllAsRead(email: string): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/mark-all-as-read/${email}`, {}).pipe(
      tap(() => this.refreshUnreadCount(email))
    );
  }

  getUnreadCount(email: string): Observable<number> {
    return this.http.get<number>(`${this.baseUrl}/unread-count/${email}`);
  }

  refreshUnreadCount(email: string): void {
    if (!email) return;
    this.getUnreadCount(email).subscribe((count: number) => {
      this.unreadCountSubject.next(count);
    });
  }
}