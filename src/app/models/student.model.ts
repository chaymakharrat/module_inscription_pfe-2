import { DiplomeEtudier, NiveauDiplomeSpecifique } from "./diploma.model";

export enum TypeDocument {
    CARTE_IDENTITE = 'CARTE_IDENTITE',
    DIPLOME_BAC = 'DIPLOME_BAC',
    DIPLOME_LICENCE = 'DIPLOME_LICENCE',
    DIPLOME_MASTER = 'DIPLOME_MASTER',
    RELEVE_NOTES = 'RELEVE_NOTES',
    AUTRE = 'AUTRE'
}

export interface Document {
    id?: number;
    nom: string;
    type: TypeDocument;
    fileUrl?: string;
}

export interface Student {
    id?: number;
    nom: string;
    prenom: string;
    email: string;
    phone: string;
    gendre: 'HOMME' | 'FEMME';
    dernierDiplome: string;
    anneeDernierDiplome: number;
    dateNaissance: string;
    numCarteIdentite?: string;
    numPassport?: string;
    paysId?: number;
    documents?: Document[];
    emailUniversitaire?: string;
    matricule?: string;
}

export interface DemandeInscription {
    id?: number;
    etudiantId: number;
    nomDiplome: string;
    typeDeDiplome?: string;
    langueDiplome?: string;
    niveauChoisi?: string;
    dateCreation?: string;
}

