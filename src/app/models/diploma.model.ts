export type Langue = 'ARABE' | 'FRANCAIS' | 'ANGLAIS';

export interface TypeDiplome {
    id: number;
    nom: string;
    prerequis?: string[];
}

export interface DiplomeEtudier {
    id: number;
    nom: string;
    langue: Langue;
    fraisInscription?: number;
    actif?: boolean;
    type: string;
    prerequis: string[];
}

export interface NiveauDiplomeSpecifique {
    id: number;
    niveau: number;
    diplome?: string;
    capaciteMax?: number;  // ← utile pour afficher
}
export interface NiveauDiplome {
    id: number;
    niveau: number

}
export interface DiplomeResponsable {
    id: number;
    nomDiplome: string;
    langues: Langue[];
    typeNom?: string;
}


