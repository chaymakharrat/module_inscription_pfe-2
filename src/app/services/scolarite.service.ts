import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../envirements/enviremetns';

export interface DemandeDetailDTO {
    id: number;
    numeroDossier: string;
    etudiantId: number;
    nomDiplome: string;
    typeDiplome?: string;
    langueDiplome?: string;
    niveauChoisi?: string; // 🆕 Ajout du niveau
    statutActuel: string;
    dateCreation: string;
    processInstanceId: string;
    etudiant: EtudiantInfoDTO;
    documents: DocumentStatusDTO[];
    historique: HistoriqueStatusDTO[];
    enAttenteDepuis: number;
    priorite: string;
    taskId?: string; // ID de la tâche Camunda
    taskAssignee?: string; // 🆕 Assigné de la tâche
    tokenAcces?: string; // 🆕 UUID Token
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
    adresse?: string; // 🆕 Ajout
    dernierDiplome?: string; // 🆕 Ajout
    anneeDernierDiplome?: number; // 🆕 Ajout
    emailUniversitaire?: string; // 🆕 Ajout
    typeBac?: string; // 🆕 Ajout
    genre?: string; // 🆕 Ajout
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

@Injectable({
    providedIn: 'root'
})
export class ScolariteService {
    private enrollmentApiUrl = `${environment.apiUrl}/INSCRIPTION-SERVICE/api/scolarite`;
    private workflowApiUrl = `${environment.workflowServiceUrl}/api/workflow`;

    constructor(private http: HttpClient) { }

    /**
     * Récupérer les demandes en attente avec pagination
     */
    getDemandesEnAttente(page: number = 0, size: number = 10, sort: string = 'dateCreation,desc'): Observable<PageResponse<DemandeDetailDTO>> {
        const params = new HttpParams()
            .set('page', page.toString())
            .set('size', size.toString())
            .set('sort', sort);

        return this.http.get<PageResponse<DemandeDetailDTO>>(
            `${this.enrollmentApiUrl}/demandes/en-attente`,
            { params }
        );
    }

    /**
     * Récupérer les demandes validées
     */
    getDemandesValidees(page: number = 0, size: number = 10, login?: string): Observable<PageResponse<DemandeDetailDTO>> {
        let params = new HttpParams()
            .set('page', page.toString())
            .set('size', size.toString());

        if (login) {
            params = params.set('login', login);
        }

        return this.http.get<PageResponse<DemandeDetailDTO>>(
            `${this.enrollmentApiUrl}/demandes/validees`,
            { params }
        );
    }

    /**
     * Récupérer les demandes rejetées
     */
    getDemandesRejetees(page: number = 0, size: number = 10, login?: string): Observable<PageResponse<DemandeDetailDTO>> {
        let params = new HttpParams()
            .set('page', page.toString())
            .set('size', size.toString());

        if (login) {
            params = params.set('login', login);
        }

        return this.http.get<PageResponse<DemandeDetailDTO>>(
            `${this.enrollmentApiUrl}/demandes/rejetees`,
            { params }
        );
    }

    /**
     * Récupérer les demandes en attente de document
     */
    getDemandesEnAttenteDocument(page: number = 0, size: number = 10, login?: string): Observable<PageResponse<DemandeDetailDTO>> {
        let params = new HttpParams()
            .set('page', page.toString())
            .set('size', size.toString());

        if (login) {
            params = params.set('login', login);
        }

        return this.http.get<PageResponse<DemandeDetailDTO>>(
            `${this.enrollmentApiUrl}/demandes/en-attente-document`,
            { params }
        );
    }

    /**
     * Récupérer toutes les demandes
     */
    getAllDemandes(page: number = 0, size: number = 10): Observable<PageResponse<DemandeDetailDTO>> {
        const params = new HttpParams()
            .set('page', page.toString())
            .set('size', size.toString());

        return this.http.get<PageResponse<DemandeDetailDTO>>(
            `${this.enrollmentApiUrl}/demandes`,
            { params }
        );
    }

    /**
     * Rechercher par diplôme
     */
    searchByDiplome(nomDiplome: string, page: number = 0, size: number = 10): Observable<PageResponse<DemandeDetailDTO>> {
        const params = new HttpParams()
            .set('page', page.toString())
            .set('size', size.toString());

        return this.http.get<PageResponse<DemandeDetailDTO>>(
            `${this.enrollmentApiUrl}/demandes/diplome/${nomDiplome}`,
            { params }
        );
    }

    /**
     * Récupérer les dossiers incomplets
     */
    getDemandesIncompletes(page: number = 0, size: number = 10): Observable<PageResponse<DemandeDetailDTO>> {
        const params = new HttpParams()
            .set('page', page.toString())
            .set('size', size.toString());

        return this.http.get<PageResponse<DemandeDetailDTO>>(
            `${this.enrollmentApiUrl}/demandes/incomplets`,
            { params }
        );
    }

    /**
     * Récupérer les dossiers complets (prêts à valider)
     */
    getDemandesCompletes(page: number = 0, size: number = 10): Observable<PageResponse<DemandeDetailDTO>> {
        const params = new HttpParams()
            .set('page', page.toString())
            .set('size', size.toString());

        return this.http.get<PageResponse<DemandeDetailDTO>>(
            `${this.enrollmentApiUrl}/demandes/complets`,
            { params }
        );
    }

    /**
     * Récupérer les dossiers urgents (> 4 jours)
     */
    getDemandesUrgentes(page: number = 0, size: number = 10): Observable<PageResponse<DemandeDetailDTO>> {
        const params = new HttpParams()
            .set('page', page.toString())
            .set('size', size.toString());

        return this.http.get<PageResponse<DemandeDetailDTO>>(
            `${this.enrollmentApiUrl}/demandes/urgents`,
            { params }
        );
    }

    /**
     * Récupérer le détail d'une demande
     */
    getDemandeDetail(id: number): Observable<DemandeDetailDTO> {
        return this.http.get<DemandeDetailDTO>(
            `${this.enrollmentApiUrl}/demandes/${id}`
        );
    }

    /**
     * Récupérer les statistiques
     */
    getStatistiques(login?: string): Observable<any> {
        let params = new HttpParams();
        if (login) {
            params = params.set('login', login);
        }
        return this.http.get(`${this.enrollmentApiUrl}/statistiques`, { params });
    }

    /**
     * Récupérer les tâches Camunda pour une demande
     */
    getTasksForEnrollment(enrollmentId: number): Observable<CamundaTask[]> {
        return this.http.get<CamundaTask[]>(
            `${this.workflowApiUrl}/tasks/enrollment/${enrollmentId}`
        );
    }

    /**
     * Compléter une tâche Camunda (VALIDER ou REJETER)
     * C'est appelé quand on clique sur ✓ ou ✗
     */
    // completeTask(taskId: string, decision: 'ACCEPTE' | 'REJETE', commentaire: string, loginUtilisateur: string): Observable<any> {
    //     return this.http.post(
    //         `${this.workflowApiUrl}/tasks/${taskId}/complete`,
    //         {
    //             decision,
    //             commentaire,
    //             loginUtilisateur
    //         }
    //     );
    // }
    completeTask(
        taskId: string,
        decision: 'ACCEPTE' | 'REJETE' | 'DOCUMENT_ILLISIBLE' | 'LISTE_ATTENTE',
        commentaire: string,
        loginUtilisateur: string
    ): Observable<any> {
        return this.http.post(
            `${this.workflowApiUrl}/tasks/${taskId}/complete`,
            { decision, commentaire, loginUtilisateur }
        );
    }

    /**
     * Valider un dossier (méthode de compatibilité)
     */
    validerDossier(demandeId: number, taskId: string, commentaire: string): Observable<any> {
        return this.completeTask(taskId, 'ACCEPTE', commentaire, 'scolarite_admin');
    }

    /**
     * Rejeter un dossier (méthode de compatibilité)
     */
    rejeterDossier(demandeId: number, taskId: string, commentaire: string): Observable<any> {
        return this.completeTask(taskId, 'REJETE', commentaire, 'scolarite_admin');
    }

    /**
     * Récupérer un fichier en tant que Blob (pour l'affichage ou le téléchargement)
     * L'intercepteur HTTP se chargera d'ajouter le token Bearer
     */
    getFileBlob(url: string): Observable<Blob> {
        return this.http.get(url, { responseType: 'blob' });
    }
    getDemandesNouvelles(page: number = 0, size: number = 10): Observable<PageResponse<DemandeDetailDTO>> {
        const params = new HttpParams()
            .set('page', page.toString())
            .set('size', size.toString());

        return this.http.get<PageResponse<DemandeDetailDTO>>(
            `${this.enrollmentApiUrl}/demandes/nouveaux`,
            { params }
        );
    }

    /**
     * Mettre à jour le statut d'une demande (ex: COMMENCER TRAITEMENT)
     */
    updateStatus(id: number, status: string, commentaire: string, loginUtilisateur: string): Observable<void> {
        const body = {
            status,
            commentaire,
            loginUtilisateur
        };
        return this.http.put<void>(`${this.enrollmentApiUrl}/api/enrollments/${id}/status`, body);
    }

    /**
     * Récupérer les dossiers relancés (filtrés par l'agent qui a envoyé la demande EN_ATTENTE_DOCUMENT)
     */
    getDemandesRelancees(page: number = 0, size: number = 10, login?: string): Observable<PageResponse<DemandeDetailDTO>> {
        let params = new HttpParams()
            .set('page', page.toString())
            .set('size', size.toString());
        if (login) params = params.set('login', login);

        return this.http.get<PageResponse<DemandeDetailDTO>>(
            `${this.enrollmentApiUrl}/demandes/relancees`,
            { params }
        );
    }

    /**
     * Générer un token pour un dossier
     */
    generateToken(id: number): Observable<string> {
        const demandesUrl = `${environment.apiUrl}/INSCRIPTION-SERVICE/api/demandes`;
        return this.http.post(`${demandesUrl}/${id}/token`, {}, { responseType: 'text' });
    }

    /**
     * Recherche globale (nom, prénom, CIN, dossier)
     */
    searchGlobal(term: string, page: number = 0, size: number = 10): Observable<PageResponse<DemandeDetailDTO>> {
        const params = new HttpParams()
            .set('term', term)
            .set('page', page.toString())
            .set('size', size.toString());

        return this.http.get<PageResponse<DemandeDetailDTO>>(
            `${this.enrollmentApiUrl}/demandes/search`,
            { params }
        );
    }

    /**
     * Récupérer l'historique complet d'un étudiant
     */
    getStudentHistory(etudiantId: number): Observable<DemandeDetailDTO[]> {
        return this.http.get<DemandeDetailDTO[]>(
            `${this.enrollmentApiUrl}/demandes/etudiant/${etudiantId}/history`
        );
    }
}
