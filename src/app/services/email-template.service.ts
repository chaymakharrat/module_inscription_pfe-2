import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../envirements/enviremetns';
import { EmailTemplate } from '../models/email-template.model';
import { NotificationTemplate } from '../models/notification-template.model';

@Injectable({
  providedIn: 'root'
})
export class EmailTemplateService {
  private baseUrl = `${environment.apiUrl}/NOTIFICATION-SERVICE/api/email-templates`;
  private notificationTemplateUrl = `${environment.apiUrl}/NOTIFICATION-SERVICE/api/notification-templates`;

  constructor(private http: HttpClient) { }

  getAll(): Observable<EmailTemplate[]> {
    return this.http.get<EmailTemplate[]>(this.baseUrl);
  }

  getById(id: number): Observable<EmailTemplate> {
    return this.http.get<EmailTemplate>(`${this.baseUrl}/${id}`);
  }

  update(id: number, template: EmailTemplate): Observable<EmailTemplate> {
    return this.http.put<EmailTemplate>(`${this.baseUrl}/${id}`, template);
  }

  getPreview(content: string, variables: any): Observable<string> {
    return this.http.post(`${this.baseUrl}/preview`, { content, variables }, { responseType: 'text' });
  }

  // --- Notification Templates ---

  getAllNotificationTemplates(): Observable<NotificationTemplate[]> {
    return this.http.get<NotificationTemplate[]>(this.notificationTemplateUrl);
  }

  updateNotificationTemplate(id: number, template: NotificationTemplate): Observable<NotificationTemplate> {
    return this.http.put<NotificationTemplate>(`${this.notificationTemplateUrl}/${id}`, template);
  }
}
