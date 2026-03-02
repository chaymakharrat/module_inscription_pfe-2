import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// ─────────────────────────────────────────────────────────────────────────────
// MODÈLES — alignés sur la réponse Ollama LLM (ocr_bulletin.py v3)
// ─────────────────────────────────────────────────────────────────────────────

/** Élément d'enseignement (sous-module) */
export interface ElementEnseignement {
    nom: string | null;
    coefficient?: string | null;
    regime?: string | null;  // "CC" | "MX"
    moyenne?: string | null;
    creditAcquis?: string | null;
    // Présents seulement dans le Format 1 (CC/Exam/Final)
    cc?: string | null;
    exam?: string | null;
    noteFinal?: string | null;
}

/** Unité d'enseignement (module principal) */
export interface UniteEnseignement {
    nom: string | null;
    coefficient?: string | null;
    credit?: string | null;
    regime?: string | null;  // "CC" | "MX"
    moyenne?: string | null;
    creditAcquis?: string | null;
    elements: ElementEnseignement[];
}

/** Semestre */
export interface SemestreBulletin {
    nom: string;           // "Semestre 1" | "Semestre 2"
    unites: UniteEnseignement[];
}

/** Résultat complet retourné par /scan-bulletin */
export interface BulletinResult {
    success: boolean;
    errorMessage?: string;
    engine?: string;
    warning?: string;   // Si Ollama indisponible

    // ── Identité ──────────────────────────────────────────────────
    nomPrenom?: string | null;
    dateNaissance?: string | null;
    numeroCin?: string | null;
    matricule?: string | null;
    filiere?: string | null;
    niveauEtude?: string | null;
    anneeUniversitaire?: string | null;
    session?: string | null;

    // ── Semestres (format universel) ──────────────────────────────
    semestres?: SemestreBulletin[];

    // ── Résumé ────────────────────────────────────────────────────
    moyenneGenerale?: string | null;
    creditsAcquis?: string | null;
    creditsValides?: string | null;
    mention?: string | null;
    decision?: string | null;

    // ── Compatibilité ancien format (Format 1) ────────────────────
    // Ces champs sont gardés pour ne pas casser l'existant
    semestre1?: { modules: any[]; ues: any[] };
    semestre2?: { modules: any[]; ues: any[] };
    creditsCapitalises?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class OcrBulletinService {

    constructor(private http: HttpClient) { }

    /**
     * Scan un relevé de notes (n'importe quel format, n'importe quelle faculté).
     * Le proxy Angular redirige /scan-bulletin → http://localhost:5053
     */
    scanBulletin(file: File): Observable<BulletinResult> {
        const fd = new FormData();
        fd.append('file', file, file.name);
        return this.http.post<BulletinResult>('/scan-bulletin', fd);
    }

    /** Mode debug : retourne texte OCR brut + image préprocessée */
    debugBulletin(file: File): Observable<any> {
        const fd = new FormData();
        fd.append('file', file, file.name);
        return this.http.post<any>('/debug-bulletin', fd);
    }

    // ── Helpers utilitaires ─────────────────────────────────────────────────

    /** Retourne tous les modules à plat depuis les semestres (nouveau format) */
    getAllUnites(result: BulletinResult): UniteEnseignement[] {
        return (result.semestres ?? []).flatMap(s => s.unites ?? []);
    }

    /** Retourne les unités du semestre 1 */
    getSemestre1Unites(result: BulletinResult): UniteEnseignement[] {
        return result.semestres?.find(s =>
            s.nom?.toLowerCase().includes('1') ||
            s.nom?.toLowerCase().includes('premier')
        )?.unites ?? [];
    }

    /** Retourne les unités du semestre 2 */
    getSemestre2Unites(result: BulletinResult): UniteEnseignement[] {
        return result.semestres?.find(s =>
            s.nom?.toLowerCase().includes('2') ||
            s.nom?.toLowerCase().includes('deux')
        )?.unites ?? [];
    }

    /** Compte total des modules (unités) dans tous les semestres */
    countModules(result: BulletinResult): number {
        return this.getAllUnites(result).length;
    }
}