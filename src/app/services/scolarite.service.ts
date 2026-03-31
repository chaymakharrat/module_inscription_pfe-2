import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../envirements/enviremetns';
import { AnneeUniversitaire } from '../models/academic-year.model';

export interface DemandeDetailDTO {
    id: number;
    numeroDossier: string;
    etudiantId: number;
    nomDiplome: string;
    typeDiplome?: string;
    langueDiplome?: string;
    niveauChoisi?: string;
    statutActuel: string;
    dateCreation: string;
    processInstanceId: string;
    etudiant: EtudiantInfoDTO;
    documents: DocumentStatusDTO[];
    historique: HistoriqueStatusDTO[];
    enAttenteDepuis: number;
    priorite: string;
    taskId?: string;
    taskAssignee?: string;
    tokenAcces?: string;
}

export interface EtudiantInfoDTO {
    id: number;
    nom: string;
    prenom: string;
    matricule: string;
    email: string;
    telephone: string;
    dateNaissance: string;
    numCarteIdentite: string;
    numPassport: string;
    paysNom: string;
    adresse?: string;
    dernierDiplome?: string;
    anneeDernierDiplome?: number;
    emailUniversitaire?: string;
    typeBac?: string;
    genre?: string;
}

export interface DocumentStatusDTO {
    documentId: number;
    type: string;
    nomFichier: string;
    statut: 'SOUMIS' | 'MANQUANTE' | 'VALIDE' | 'REJETE' | string;
    isValidated: boolean;
    commentaireValidation: string;
}

export interface HistoriqueStatusDTO {
    id: number;
    statut: string;
    commentaire: string;
    loginUtilisateur: string;
    dateStatus: string;
}

export interface PageResponse<T> {
    content: T[];
    totalElements: number;
    totalPages: number;
    size: number;
    number: number;
    first: boolean;
    last: boolean;
    numberOfElements: number;
}

export interface CamundaTask {
    id: string;
    name: string;
    assignee: string;
    created: string;
    processInstanceId: string;
}

/** Année universitaire courante — Plus de constante hardcodée */
// export const ANNEE_COURANTE = '2025-2026';
// export const ANNEES_DISPONIBLES = ['2025-2026', '2024-2025', '2023-2024'];

@Injectable({
    providedIn: 'root'
})
export class ScolariteService {
    private enrollmentApiUrl = `${environment.apiUrl}/INSCRIPTION-SERVICE/api/scolarite`;
    private workflowApiUrl = `${environment.workflowServiceUrl}/api/workflow`;
    private departementApiUrl = `${environment.apiUrl}/DEPARTEMENT-SERVICE/api/departements`;

    constructor(private http: HttpClient) { }

    getAnneesUniversitairesList(): Observable<AnneeUniversitaire[]> {
        return this.http.get<AnneeUniversitaire[]>(`${this.departementApiUrl}/annees-universitaires`)
            .pipe(map(list => list.sort((a, b) => b.annee.localeCompare(a.annee))));
    }

    getAnneeCourante(): Observable<string> {
        return this.http.get(`${this.departementApiUrl}/annee-courante`, { responseType: 'text' });
    }

    getAnneeCouranteDetails(): Observable<AnneeUniversitaire | undefined> {
        return this.getAnneesUniversitairesList().pipe(
            map(list => list.find(a => a.courante))
        );
    }

    getAllDemandes(page = 0, size = 10, annee?: string): Observable<PageResponse<DemandeDetailDTO>> {
        let params = new HttpParams().set('page', page).set('size', size);
        if (annee) params = params.set('annee', annee);
        return this.http.get<PageResponse<DemandeDetailDTO>>(`${this.enrollmentApiUrl}/demandes`, { params });
    }

    getDemandesEnAttente(page = 0, size = 10, annee?: string): Observable<PageResponse<DemandeDetailDTO>> {
        let params = new HttpParams().set('page', page).set('size', size);
        if (annee) params = params.set('annee', annee);
        return this.http.get<PageResponse<DemandeDetailDTO>>(`${this.enrollmentApiUrl}/demandes/en-attente`, { params });
    }

    getDemandesNouvelles(page = 0, size = 10, annee?: string): Observable<PageResponse<DemandeDetailDTO>> {
        let params = new HttpParams().set('page', page).set('size', size);
        if (annee) params = params.set('annee', annee);
        return this.http.get<PageResponse<DemandeDetailDTO>>(`${this.enrollmentApiUrl}/demandes/nouveaux`, { params });
    }

    getDemandesUrgentes(page = 0, size = 10, annee?: string): Observable<PageResponse<DemandeDetailDTO>> {
        let params = new HttpParams().set('page', page).set('size', size);
        if (annee) params = params.set('annee', annee);
        return this.http.get<PageResponse<DemandeDetailDTO>>(`${this.enrollmentApiUrl}/demandes/urgents`, { params });
    }

    getDemandesValidees(page = 0, size = 10, login?: string, annee?: string): Observable<PageResponse<DemandeDetailDTO>> {
        let params = new HttpParams().set('page', page).set('size', size);
        if (login) params = params.set('login', login);
        if (annee) params = params.set('annee', annee);
        return this.http.get<PageResponse<DemandeDetailDTO>>(`${this.enrollmentApiUrl}/demandes/validees`, { params });
    }

    getDemandesRejetees(page = 0, size = 10, login?: string, annee?: string): Observable<PageResponse<DemandeDetailDTO>> {
        let params = new HttpParams().set('page', page).set('size', size);
        if (login) params = params.set('login', login);
        if (annee) params = params.set('annee', annee);
        return this.http.get<PageResponse<DemandeDetailDTO>>(`${this.enrollmentApiUrl}/demandes/rejetees`, { params });
    }

    getDemandesEnAttenteDocument(page = 0, size = 10, login?: string, annee?: string): Observable<PageResponse<DemandeDetailDTO>> {
        let params = new HttpParams().set('page', page).set('size', size);
        if (login) params = params.set('login', login);
        if (annee) params = params.set('annee', annee);
        return this.http.get<PageResponse<DemandeDetailDTO>>(`${this.enrollmentApiUrl}/demandes/en-attente-document`, { params });
    }

    getDemandesRelancees(page = 0, size = 10, login?: string, annee?: string): Observable<PageResponse<DemandeDetailDTO>> {
        let params = new HttpParams().set('page', page).set('size', size);
        if (login) params = params.set('login', login);
        if (annee) params = params.set('annee', annee);
        return this.http.get<PageResponse<DemandeDetailDTO>>(`${this.enrollmentApiUrl}/demandes/relancees`, { params });
    }

    getStatistiques(login?: string, annee?: string): Observable<any> {
        let params = new HttpParams();
        if (login) params = params.set('login', login);
        if (annee) params = params.set('annee', annee);
        return this.http.get(`${this.enrollmentApiUrl}/statistiques`, { params });
    }

    searchGlobal(term: string, page = 0, size = 10, annee?: string): Observable<PageResponse<DemandeDetailDTO>> {
        let params = new HttpParams().set('term', term).set('page', page).set('size', size);
        if (annee) params = params.set('annee', annee);
        return this.http.get<PageResponse<DemandeDetailDTO>>(`${this.enrollmentApiUrl}/demandes/search`, { params });
    }

    searchByDiplome(nomDiplome: string, page = 0, size = 10, annee?: string): Observable<PageResponse<DemandeDetailDTO>> {
        let params = new HttpParams().set('page', page).set('size', size);
        if (annee) params = params.set('annee', annee);
        return this.http.get<PageResponse<DemandeDetailDTO>>(`${this.enrollmentApiUrl}/demandes/diplome/${nomDiplome}`, { params });
    }

    getDemandeDetail(id: number): Observable<DemandeDetailDTO> {
        return this.http.get<DemandeDetailDTO>(`${this.enrollmentApiUrl}/demandes/${id}`);
    }

    getStudentHistory(etudiantId: number): Observable<DemandeDetailDTO[]> {
        return this.http.get<DemandeDetailDTO[]>(`${this.enrollmentApiUrl}/demandes/etudiant/${etudiantId}/history`);
    }

    getTasksForEnrollment(enrollmentId: number): Observable<CamundaTask[]> {
        return this.http.get<CamundaTask[]>(`${this.workflowApiUrl}/tasks/enrollment/${enrollmentId}`);
    }

    completeTask(
        taskId: string,
        decision: 'ACCEPTE' | 'REJETE' | 'DOCUMENT_ILLISIBLE' | 'LISTE_ATTENTE',
        commentaire: string,
        loginUtilisateur: string
    ): Observable<any> {
        return this.http.post(`${this.workflowApiUrl}/tasks/${taskId}/complete`, { decision, commentaire, loginUtilisateur });
    }

    validerDossier(demandeId: number, taskId: string, commentaire: string): Observable<any> {
        return this.completeTask(taskId, 'ACCEPTE', commentaire, 'scolarite_admin');
    }

    rejeterDossier(demandeId: number, taskId: string, commentaire: string): Observable<any> {
        return this.completeTask(taskId, 'REJETE', commentaire, 'scolarite_admin');
    }

    updateStatus(id: number, status: string, commentaire: string, loginUtilisateur: string): Observable<void> {
        return this.http.put<void>(`${this.enrollmentApiUrl}/api/enrollments/${id}/status`, { status, commentaire, loginUtilisateur });
    }

    generateToken(id: number): Observable<string> {
        const demandesUrl = `${environment.apiUrl}/INSCRIPTION-SERVICE/api/demandes`;
        return this.http.post(`${demandesUrl}/${id}/token`, {}, { responseType: 'text' });
    }

    getFileBlob(url: string): Observable<Blob> {
        return this.http.get(url, { responseType: 'blob' });
    }

    getDemandesIncompletes(page = 0, size = 10): Observable<PageResponse<DemandeDetailDTO>> {
        const params = new HttpParams().set('page', page).set('size', size);
        return this.http.get<PageResponse<DemandeDetailDTO>>(`${this.enrollmentApiUrl}/demandes/incomplets`, { params });
    }

    getDemandesCompletes(page = 0, size = 10): Observable<PageResponse<DemandeDetailDTO>> {
        const params = new HttpParams().set('page', page).set('size', size);
        return this.http.get<PageResponse<DemandeDetailDTO>>(`${this.enrollmentApiUrl}/demandes/complets`, { params });
    }
}
