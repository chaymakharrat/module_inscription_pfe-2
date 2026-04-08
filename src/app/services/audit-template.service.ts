import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../envirements/enviremetns';
import { AuditTemplate } from '../models/audit-template.model';

export type AuditServiceContext = 'FINANCE-SERVICE' | 'DEPARTEMENT-SERVICE';

@Injectable({
  providedIn: 'root'
})
export class AuditTemplateService {

  constructor(private http: HttpClient) { }

  /**
   * ✅ Lister tous les templates pour un microservice donné
   */
  getAll(context: AuditServiceContext): Observable<AuditTemplate[]> {
    const url = `${environment.apiUrl}/${context}/api/audit-templates`;
    return this.http.get<AuditTemplate[]>(url);
  }

  /**
   * ✅ Mettre à jour un template
   */
  update(context: AuditServiceContext, id: number, template: AuditTemplate): Observable<AuditTemplate> {
    const url = `${environment.apiUrl}/${context}/api/audit-templates/${id}`;
    return this.http.put<AuditTemplate>(url, template);
  }
}
