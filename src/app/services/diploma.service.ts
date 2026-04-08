import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { DiplomeEtudier, DiplomeResponsable, NiveauDiplomeSpecifique, TypeDiplome } from '../models/diploma.model';
import { environment } from '../envirements/enviremetns';

@Injectable({
    providedIn: 'root'
})
export class DiplomaService {
    private apiUrl = `${environment.apiUrl}/DEPARTEMENT-SERVICE/api/diplomes`;
    private typesUrl = `${environment.apiUrl}/DEPARTEMENT-SERVICE/api/types`;

    constructor(private http: HttpClient) { }

    getDiplomas(): Observable<DiplomeEtudier[]> {
        return this.http.get<DiplomeEtudier[]>(`${this.apiUrl}`);
    }

    getNiveauxByDiploma(diplomaId: number): Observable<NiveauDiplomeSpecifique[]> {
        return this.http.get<NiveauDiplomeSpecifique[]>(`${this.apiUrl}/${diplomaId}/niveaux`);
    }

    getNiveauxByDiplomeName(nomDiplome: string): Observable<NiveauDiplomeSpecifique[]> {
        return this.http.get<NiveauDiplomeSpecifique[]>(`${this.apiUrl}/nom/${nomDiplome}/niveaux`);
    }

    getDiplomesResponsables(annee?: string): Observable<DiplomeResponsable[]> {
        const params = annee ? `?annee=${annee}` : '';
        return this.http.get<DiplomeResponsable[]>(
            `${environment.apiUrl}/DEPARTEMENT-SERVICE/api/departements/diplomes-responsables${params}`
        );
    }

    getLanguesByDiplomeName(nomDiplome: string): Observable<string[]> {
        return this.getDiplomesResponsables().pipe(
            map((diplomes: DiplomeResponsable[]) => {
                const found = diplomes.find(d => d.nomDiplome === nomDiplome);
                return found ? found.langues : [];
            })
        );
    }

    /** Récupère tous les types de diplôme (ex: Licence, Master, Ingénieur…) */
    getTypes(): Observable<TypeDiplome[]> {
        return this.http.get<TypeDiplome[]>(this.typesUrl);
    }
    getNiveauxByDiplomeNameAndLangue(nomDiplome: string, langue: string, annee?: string): Observable<NiveauDiplomeSpecifique[]> {
        const params = annee ? `?annee=${annee}` : '';
        return this.http.get<NiveauDiplomeSpecifique[]>(
            `${this.apiUrl}/nom/${encodeURIComponent(nomDiplome)}/langue/${langue}/niveaux${params}`
        );
    }
}
