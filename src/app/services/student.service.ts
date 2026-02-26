import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';
import { Student } from '../models/student.model';
import { environment } from '../envirements/enviremetns';

@Injectable({
    providedIn: 'root'
})
export class StudentService {
    private apiUrl = `${environment.apiUrl}/ETUDIANT-SERVICE/api/etudiants`;


    constructor(private http: HttpClient) { }

    getStudentById(id: number): Observable<Student> {
        return this.http.get<Student>(`${this.apiUrl}/${id}`);
    }

    /**
     * Récupérer un étudiant par email (utilisé après connexion pour charger le profil étudiant).
     */
    getStudentByEmail(email: string): Observable<Student> {
        const encodedEmail = encodeURIComponent(email);
        return this.http.get<Student>(`${this.apiUrl}/email/${encodedEmail}`);
    }

    createStudent(student: Student): Observable<Student> {
        return this.http.post<Student>(this.apiUrl, student);
    }

    uploadDocument(studentId: number, type: string, file: File): Observable<any> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);
        formData.append('etudiantId', studentId.toString());
        return this.http.post(`${environment.apiUrl}/ETUDIANT-SERVICE/api/documents/upload`, formData);
    }
    uploadDocumentRelance(studentId: number, type: string, file: File): Observable<any> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);
        formData.append('etudiantId', studentId.toString());
        return this.http.post(`${environment.apiUrl}/ETUDIANT-SERVICE/api/documents/upload-relance`, formData);
    }

    getDocumentsByEtudiant(etudiantId: number): Observable<any[]> {
        return this.http.get<any[]>(`${environment.apiUrl}/ETUDIANT-SERVICE/api/documents/etudiant/${etudiantId}`);
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

    acceptDocument(documentId: number): Observable<any> {
        return this.http.put(
            `${environment.apiUrl}/ETUDIANT-SERVICE/api/documents/${documentId}/accept`,
            null
        );
    }
    getDocumentsStatus(etudiantId: number): Observable<any[]> {
        return this.http.get<any[]>(
            `${environment.apiUrl}/ETUDIANT-SERVICE/api/documents/etudiant/${etudiantId}/status`
        );
    }
}
