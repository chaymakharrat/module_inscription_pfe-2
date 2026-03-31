export type Langue = 'ARABE' | 'FRANCAIS' | 'ANGLAIS';

export interface TypeDiplome {
    id: number;
    nom: string;
    prerequis?: string[];
}

export interface DiplomeEtudier {
    id: number;
    nomDiplome: string;   // ← anciennement 'nom', remplacé par nomDiplome (depuis DiplomeResponsable)
    langue: Langue;
    fraisInscription?: number;
    actif?: boolean;
    type: string;
    prerequis: string[];
}

// export interface NiveauDiplomeSpecifique {
//     id: number;
//     niveau: number;
//     diplome?: string;
//     capaciteMax?: number;  // ← utile pour afficher
// }
export interface NiveauDiplomeSpecifique {
    id: number;
    niveau: number;
    capaciteMax?: number;
    // ✅ Nouveaux champs correspondant au DTO backend
    nomDiplomeResponsable?: string;
    langue?: string;
    fraisInscription?: number;
    niveauId?: number;
    // ❌ Supprimer : diplome?: string;  — remplacé par nomDiplomeResponsable
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


