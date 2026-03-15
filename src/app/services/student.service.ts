import { Injectable } from '@angular/core';
import { HttpClient, HttpBackend } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';
import { Student } from '../models/student.model';
import { environment } from '../envirements/enviremetns';

@Injectable({
    providedIn: 'root'
})
export class StudentService {
    private apiUrl = `${environment.apiUrl}/ETUDIANT-SERVICE/api/etudiants`;
    private httpNoAuth: HttpClient; // ← bypass intercepteur Keycloak

    constructor(
        private http: HttpClient,
        private httpBackend: HttpBackend  // ← ajouter
    ) {
        this.httpNoAuth = new HttpClient(httpBackend);
    }

    // ✅ PUBLIC — appelé depuis mon-dossier sans login
    getStudentById(id: number): Observable<Student> {
        return this.httpNoAuth.get<Student>(`${this.apiUrl}/${id}`);
    }

    // ✅ PUBLIC — appelé depuis mon-dossier sans login
    getDocumentsStatus(etudiantId: number): Observable<any[]> {
        return this.httpNoAuth.get<any[]>(
            `${environment.apiUrl}/ETUDIANT-SERVICE/api/documents/etudiant/${etudiantId}/status`
        );
    }

    // ✅ PUBLIC — upload depuis mon-dossier sans login
    uploadDocumentRelance(studentId: number, type: string, file: File): Observable<any> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);
        formData.append('etudiantId', studentId.toString());
        return this.httpNoAuth.post(
            `${environment.apiUrl}/ETUDIANT-SERVICE/api/documents/upload-relance`,
            formData
        );
    }

    // ── Méthodes protégées (inchangées) ──────────────────

    getStudentByEmail(email: string): Observable<Student> {
        const encodedEmail = encodeURIComponent(email);
        return this.http.get<Student>(`${this.apiUrl}/email/${encodedEmail}`);
    }

    createStudent(student: Student): Observable<Student> {
        return this.http.post<Student>(this.apiUrl, student);
    }

    updateStudentActivationCompte(id: number, data: Partial<Student>): Observable<Student> {
        return this.http.put<Student>(`${this.apiUrl}/${id}`, data);
    }

    updateStudent(id: number, data: Partial<Student>): Observable<Student> {
        return this.http.patch<Student>(`${this.apiUrl}/${id}/contact`, data);
    }

    uploadDocument(studentId: number, type: string, file: File): Observable<any> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);
        formData.append('etudiantId', studentId.toString());
        return this.http.post(
            `${environment.apiUrl}/ETUDIANT-SERVICE/api/documents/upload`,
            formData
        );
    }

    getDocumentsByEtudiant(etudiantId: number): Observable<any[]> {
        return this.http.get<any[]>(
            `${environment.apiUrl}/ETUDIANT-SERVICE/api/documents/etudiant/${etudiantId}`
        );
    }

    checkEmailExists(email: string): Observable<boolean> {
        return this.http.get<any>(`${this.apiUrl}/email/${email}`).pipe(
            map(() => true),
            catchError(() => of(false))
        );
    }

    checkCinExists(cin: string): Observable<boolean> {
        return this.http.get<any>(`${this.apiUrl}/numCarteIdentite/${cin}`).pipe(
            map(() => true),
            catchError(() => of(false))
        );
    }

    checkPassportExists(numPassport: string, paysId: number): Observable<boolean> {
        return this.http.get<any>(`${this.apiUrl}/passportAndPays`, {
            params: { numPassport, paysId: paysId.toString() }
        }).pipe(
            map(() => true),
            catchError(() => of(false))
        );
    }

    rejectDocument(documentId: number, commentaire: string): Observable<any> {
        return this.http.put(
            `${environment.apiUrl}/ETUDIANT-SERVICE/api/documents/${documentId}/reject`,
            null,
            { params: { commentaire } }
        );
    }

    acceptDocument(documentId: number, commentaire?: string): Observable<any> {
        const params = commentaire ? { params: { commentaire } } : {};
        return this.http.put(
            `${environment.apiUrl}/ETUDIANT-SERVICE/api/documents/${documentId}/accept`,
            null,
            params
        );
    }

    getStudentByCin(cin: string): Observable<Student> {
        return this.http.get<Student>(`${this.apiUrl}/numCarteIdentite/${cin}`);
    }

    getStudentByPassport(numPassport: string, paysId: number): Observable<Student> {
        return this.http.get<Student>(`${this.apiUrl}/passportAndPays`, {
            params: { numPassport, paysId: paysId.toString() }
        });
    }

    validatePassport(numPassport: string, paysId: number): Observable<any> {
        return this.http.get<any>(
            `${this.apiUrl}/passport/validate`,
            { params: { numPassport, paysId: paysId.toString() } }
        );
    }
}