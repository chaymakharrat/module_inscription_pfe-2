import { Injectable } from '@angular/core';
import { HttpClient, HttpBackend } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../envirements/enviremetns';

@Injectable({
  providedIn: 'root'
})
export class EmailVerificationService {
  private apiUrl = `${environment.apiUrl}/INSCRIPTION-SERVICE/api/email-otp`;
  private httpNoAuth: HttpClient;

  constructor(private http: HttpClient, private httpBackend: HttpBackend) {
    // On utilise HttpBackend pour éviter les intercepteurs Keycloak (accès public)
    this.httpNoAuth = new HttpClient(httpBackend);
  }

  /**
   * Demande l'envoi d'un code OTP à l'adresse email fournie.
   */
  sendOtp(email: string): Observable<any> {
    return this.httpNoAuth.post(`${this.apiUrl}/send`, { email });
  }

  /**
   * Vérifie le code OTP saisi par le candidat.
   */
  verifyOtp(email: string, code: string): Observable<{ valid: boolean; message: string }> {
    return this.httpNoAuth.post<{ valid: boolean; message: string }>(`${this.apiUrl}/verify`, { email, code });
  }
}
