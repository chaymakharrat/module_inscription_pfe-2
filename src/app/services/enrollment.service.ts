import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DemandeInscription } from '../models/student.model';
import { environment } from '../envirements/enviremetns';
import { Enrollment, EnrollmentAction, DashboardStats } from '../models/enrollment.model';

@Injectable({
    providedIn: 'root'
})
export class EnrollmentService {
    private apiUrl = `${environment.apiUrl}/INSCRIPTION-SERVICE/api/demandes`;

    constructor(private http: HttpClient) { }

    submitDemande(demande: DemandeInscription): Observable<DemandeInscription> {
        return this.http.post<DemandeInscription>(this.apiUrl, demande);
    }

    // Alias for submitDemande to avoid breaking other components
    postDemande(demande: DemandeInscription): Observable<DemandeInscription> {
        return this.submitDemande(demande);
    }

    // Updated to match backend (no pagination in backend yet)
    getPendingEnrollments(): Observable<Enrollment[]> {
        return this.http.get<Enrollment[]>(`${this.apiUrl}`);
    }

    // Backend doesn't have a stats endpoint, we'll calculate on frontend or use this for later
    getStats(): Observable<DashboardStats> {
        return new Observable(observer => {
            observer.next({
                enAttente: 0,
                valides: 0,
                rejetes: 0,
                tauxValidation: 0,
                delaiMoyen: '-'
            });
            observer.complete();
        });
    }

    processEnrollment(action: EnrollmentAction): Observable<void> {
        // Corrected URL based on backend controller mapping: 
        // /api/demandes + /api/enrollments/{id}/status
        const url = `${this.apiUrl}/${action.enrollmentId}/status`;

        const body = {
            status: action.decision === 'ACCEPTE' ? 'SCOLARITE_VALIDEE' : 'REJETE_SCOLARITE',
            commentaire: action.commentaire,
            loginUtilisateur: 'SCOLARITE'
        };

        return this.http.put<void>(url, body);
    }

    getDemandeByEtudiantId(etudiantId: number): Observable<Enrollment> {
        return this.http.get<Enrollment>(`${this.apiUrl}/etudiant/${etudiantId}`);
    }

    resubmitDemande(demandeId: number): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/${demandeId}/resubmit`, {});
    }

    // 🆕 ACCÈS PUBLIC via TOKEN
    getDemandeByToken(token: string): Observable<Enrollment> {
        return this.http.get<Enrollment>(`${this.apiUrl}/public/token/${token}`);
    }

    resubmitByToken(token: string): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/public/token/${token}/resubmit`, {});
    }
}
