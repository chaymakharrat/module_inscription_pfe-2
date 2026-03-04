import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface OcrCinResult {
    success: boolean;
    errorMessage?: string;
    numeroCin?: string;
    nom?: string;
    prenom?: string;
    genre?: 'HOMME' | 'FEMME';
    dateNaissance?: string;
    adresse?: string;
}

export interface OcrZoneResult {
    success: boolean;
    zone: string;
    errorMessage?: string;
    numeroCin?: string;
    nom?: string;
    prenom?: string;
    genre?: 'HOMME' | 'FEMME';
    dateNaissance?: string;
    adresse?: string;
}

// ── NOUVEAU ──────────────────────────────────────────────────────────────────
export interface OcrRawResult {
    success: boolean;
    text?: string;                                    // texte brut concaténé
    blocks?: { text: string; conf: number }[];        // détail par bloc
    errorMessage?: string;
}
// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class OcrService {

    private readonly BASE_URL = 'http://localhost:5050';

    constructor(private http: HttpClient) { }

    /** Niveau 1 — Scan global */
    scanCin(file: File): Observable<OcrCinResult> {
        const fd = new FormData();
        fd.append('file', file);
        return this.http.post<OcrCinResult>(`${this.BASE_URL}/scan-cin`, fd);
    }

    /** Niveau 2 — Zone fixe (zones % calibrées) */
    scanCinZone(file: File, zone: string): Observable<OcrZoneResult> {
        const fd = new FormData();
        fd.append('file', file);
        return this.http.post<OcrZoneResult>(
            `${this.BASE_URL}/scan-cin?zone=${zone}`, fd
        );
    }

    /** Niveau 3 — Crop libre dessiné par le candidat → texte brut */
    scanRawZone(file: File): Observable<OcrRawResult> {
        const fd = new FormData();
        fd.append('file', file);
        return this.http.post<OcrRawResult>(`${this.BASE_URL}/ocr-raw`, fd);
    }
}