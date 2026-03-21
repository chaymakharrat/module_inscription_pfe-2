import { DiplomeEtudier, NiveauDiplomeSpecifique } from "./diploma.model";

export enum TypeDocument {
    CARTE_IDENTITE = 'CARTE_IDENTITE',
    DIPLOME_BAC = 'DIPLOME_BAC',
    DIPLOME_LICENCE = 'DIPLOME_LICENCE',
    DIPLOME_MASTER = 'DIPLOME_MASTER',
    RELEVE_NOTES = 'RELEVE_NOTES',
    DIPLOME_INGENIEUR = 'DIPLOME_INGENIEUR',
    RELEVE_NOTES_SUPERIEUR = 'RELEVE_NOTES_SUPERIEUR',
    DIPLOME_PREPARATOIRE = 'DIPLOME_PREPARATOIRE',

    AUTRE = 'AUTRE'
}

export interface Document {
    id?: number;
    nom: string;
    type: TypeDocument;
    fileUrl?: string;
}

export enum TypeBac {
    SCIENCES_EXPERIMENTALES = 'SCIENCES_EXPERIMENTALES',
    MATHEMATIQUES = 'MATHEMATIQUES',
    TECHNIQUE = 'TECHNIQUE',
    ECONOMIE_GESTION = 'ECONOMIE_GESTION',
    SCIENCES_INFORMATIQUE = 'SCIENCES_INFORMATIQUE',
    LETTRES = 'LETTRES',
    SPORT = 'SPORT',
    AUTRE = 'AUTRE'
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
    typeBac?: TypeBac;
    paysId?: number;
    documents?: Document[];
    emailUniversitaire?: string;
    matricule?: string;
}

// export interface DemandeInscription {
//     id?: number;
//     etudiantId: number;
//     nomDiplome: string;
//     typeDeDiplome?: string;
//     langueDiplome?: string;
//     niveauChoisi?: string;
//     dateCreation?: string;
// }
export interface DemandeInscription {
    id?: number;
    etudiantId: number;

    // ✅ NOUVEAU — remplace nomDiplome + langueDiplome + niveauChoisi
    niveauSpecifiqueId?: number | null;

    // ✅ Conservé — info propre à la demande
    typeDeDiplome?: string;

    // ❌ Ces champs ne sont plus envoyés au backend
    // nomDiplome?: string;
    // langueDiplome?: string;
    // niveauChoisi?: string;

    dateCreation?: string;
    statutActuel?: string;
    processInstanceId?: string;
    tokenAcces?: string;
    tokenExpiration?: string;
}

