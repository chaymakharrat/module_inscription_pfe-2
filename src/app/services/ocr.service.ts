import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface OcrCinResult {
    success: boolean;
    numeroCin?: string;
    nom?: string;
    prenom?: string;
    dateNaissance?: string; // format: YYYY-MM-DD
    genre?: 'HOMME' | 'FEMME';
    adresse?: string;
    errorMessage?: string;
}

@Injectable({ providedIn: 'root' })
export class OcrService {
    private readonly OCR_URL = '/scan-cin';

    constructor(private http: HttpClient) { }

    scanCin(file: File): Observable<OcrCinResult> {
        const formData = new FormData();
        formData.append('file', file);
        return this.http.post<OcrCinResult>(this.OCR_URL, formData);
    }
}