import { Injectable } from '@angular/core';
import { HttpClient, HttpBackend } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DemandeInscription } from '../models/student.model';
import { environment } from '../envirements/enviremetns';
import { Enrollment, EnrollmentAction, DashboardStats } from '../models/enrollment.model';

@Injectable({
    providedIn: 'root'
})
export class EnrollmentService {
    private apiUrl = `${environment.apiUrl}/INSCRIPTION-SERVICE/api/demandes`;
    private httpNoAuth: HttpClient; // ← bypass intercepteur Keycloak

    constructor(
        private http: HttpClient,
        private httpBackend: HttpBackend  // ← ajouter
    ) {
        this.httpNoAuth = new HttpClient(httpBackend); // ← sans intercepteur
    }

    submitDemande(demande: DemandeInscription): Observable<DemandeInscription> {
        return this.http.post<DemandeInscription>(this.apiUrl, demande);
    }

    postDemande(demande: DemandeInscription): Observable<DemandeInscription> {
        return this.submitDemande(demande);
    }

    startWorkflow(demandeId: number): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/${demandeId}/start-workflow`, {});
    }

    getPendingEnrollments(): Observable<Enrollment[]> {
        return this.http.get<Enrollment[]>(`${this.apiUrl}`);
    }

    getStats(): Observable<DashboardStats> {
        return new Observable(observer => {
            observer.next({ enAttente: 0, valides: 0, rejetes: 0, tauxValidation: 0, delaiMoyen: '-' });
            observer.complete();
        });
    }

    processEnrollment(action: EnrollmentAction): Observable<void> {
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

    getDemandesByEtudiantId(etudiantId: number): Observable<Enrollment[]> {
        return this.http.get<Enrollment[]>(`${this.apiUrl}/etudiant/${etudiantId}/all`);
    }

    resubmitDemande(demandeId: number): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/${demandeId}/resubmit`, {});
    }

    // ✅ ACCÈS PUBLIC via TOKEN — sans intercepteur Keycloak
    getDemandeByToken(token: string): Observable<Enrollment> {
        return this.httpNoAuth.get<Enrollment>(
            `${this.apiUrl}/public/token/${token}`
        );
    }

    resubmitByToken(token: string): Observable<void> {
        return this.httpNoAuth.post<void>(
            `${this.apiUrl}/public/token/${token}/resubmit`, {}
        );
    }
}