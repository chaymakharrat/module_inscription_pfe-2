import { Student } from "./student.model";

export interface HistoriqueStatus {
    id: number;
    statut: string;
    dateStatus: string;
    commentaire?: string;
    loginUtilisateur: string;
}

export interface Enrollment {
    id: number;
    numeroDossier?: string;
    studentId: number;
    etudiantId?: number; // Backend field name
    student?: Student;
    nomDiplome?: string; // Backend field name
    diplomeDemande: string;
    dateCreation: string;
    dateSoumission: string;
    statut?: string;
    statutActuel?: string; // Backend field name
    priorite?: 'HAUTE' | 'MOYENNE' | 'BASSE' | 'NOUVEAU';
    documentsValides: number;
    totalDocuments: number;
    commentaireScolarite?: string;
    tokenAcces?: string;
    historique?: HistoriqueStatus[];
}

export interface EnrollmentAction {
    enrollmentId: number;
    studentId: number;
    decision: 'ACCEPTE' | 'REJETE';
    commentaire: string;
}


export interface DashboardStats {
    enAttente: number;
    valides: number;
    rejetes: number;
    tauxValidation: number;
    delaiMoyen: string;
}
