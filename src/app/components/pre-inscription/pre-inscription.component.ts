import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule, FormBuilder, FormGroup,
  Validators, AbstractControl, ValidationErrors
} from '@angular/forms';
import { CountryService } from '../../services/country.service';
import { DiplomaService } from '../../services/diploma.service';
import { EnrollmentService } from '../../services/enrollment.service';
import { PhoneValidationService } from '../../services/phone-validation.service';
import { AlertService } from '../../services/alert.service';
import { ScolariteService } from '../../services/scolarite.service';
import { EmailVerificationService } from '../../services/email-verification.service';
import { AnneeUniversitaire } from '../../models/academic-year.model';
import { Country } from '../../models/country.model';
import {
  DiplomeEtudier, DiplomeResponsable, Langue,
  NiveauDiplomeSpecifique, TypeDiplome
} from '../../models/diploma.model';
import { TypeDocument, Student, DemandeInscription } from '../../models/student.model';
import { StudentService } from '../../services/student.service';
import {
  forkJoin, switchMap, map, of, catchError,
  Observable, debounceTime, Subject, takeUntil, interval, merge, distinctUntilChanged
} from 'rxjs';
import { StepperComponent } from '../shared/stepper/stepper.component';
import { InputComponent } from '../shared/input/input.component';
import { FileUploadComponent } from '../shared/file-upload/file-upload.component';
import { AutoSaveIndicatorComponent } from '../shared/auto-save-indicator/auto-save-indicator.component';
import { ActionButtonsComponent } from '../shared/action-buttons/action-buttons.component';
import { animate, style, transition, trigger } from '@angular/animations';
import { FooterComponent } from '../footer/footer.component';
import { CinScannerComponent } from '../cin-scanner/cin-scanner.component';
import { OcrCinResult } from '../../services/ocr.service';
import { BacScannerComponent, BacResult } from '../bac-scanner/bac-scanner.component';
import { BacScannerServiceComponent, BacResult as BacServiceResult } from '../bac-scanner-service/bac-scanner-service.component';
import { BulletinResult } from '../bulletin-scanner/bulletin-scanner.component';

// ── Types ──────────────────────────────────────────────────────────────────
type StudentMode = 'unknown' | 'existing' | 'new';
type NationalityMode = 'tunisian' | 'foreign' | null;
interface Stamped<T> {
  data: T;
  scannedAt: number;
}

@Component({
  selector: 'app-pre-inscription',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    StepperComponent,
    FileUploadComponent,
    AutoSaveIndicatorComponent,
    ActionButtonsComponent,
    InputComponent,
    //FooterComponent,
    CinScannerComponent,
    BacScannerComponent,
    BacScannerServiceComponent,
    //BulletinScannerComponent
  ],
  templateUrl: './pre-inscription.component.html',
  styleUrl: './pre-inscription.component.css',
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate('600ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('staggeredFade', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate('600ms {{delay}}ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ], { params: { delay: 0 } })
    ])
  ]
})
export class PreInscriptionComponent implements OnInit, OnDestroy {

  // ── Form & Navigation ────────────────────────────────────────────────────
  inscriptionForm!: FormGroup;
  countries: Country[] = [];
  filteredCountries: Country[] = [];
  countrySearch: string = '';
  showCountryDropdown = false;
  diplomas: DiplomeEtudier[] = [];
  levels: NiveauDiplomeSpecifique[] = [];
  currentStep = 1;
  isSubmitting = false;
  isSaving = false;
  selectedFiles: Map<string, File> = new Map();
  idType: 'cin' | 'passport' = 'cin';
  private destroy$ = new Subject<void>();
  editMode = false;
  coherenceChecked = false;   // true après vérification réussie
  coordonneesValidated = false;
  etatCivilValidated = false;
  cursusValidated = false;

  // 📧 Email Verification (OTP) State
  emailVerified = false;
  otpSent = false;
  otpLoading = false;
  otpError: string | null = null;
  otpResendTimer = 0;
  private timerInterval: any;




  // ── Smart Form State ──────────────────────────────────────────────────────
  /** null = pays non encore sélectionné */
  nationalityMode: NationalityMode = null;
  isPersonalLocked = false;

  /**
   * unknown  = identifiant pas encore vérifié
   * existing = étudiant trouvé en base
   * new      = nouvel étudiant
   */
  studentMode: StudentMode = 'unknown';

  isCheckingId = false;        // spinner pendant la vérification
  idCheckDone = false;         // true après la 1ère vérification

  // ── CIN scanner pour identification initiale ──────────────────────
  cinExtracted = false;       // true dès que le scanner a lu un CIN
  cinExtractedValue = '';     // valeur CIN extraite par OCR
  showCinManual = false;      // bascule saisie manuelle

  /** Étudiant récupéré du backend (si existing) */
  existingStudent: Student | null = null;
  /** Email initial de l'étudiant existant (pour détecter les changements) */
  initialExistingEmail: string | null = null;

  /** Dernière demande de l'étudiant existant */
  existingDemande: any | null = null;

  /** Toutes les demandes de l'étudiant existant */
  existingDemandes: any[] = [];

  /** Statut des documents de l'étudiant existant */
  existingDocStatuses: any[] = [];

  /** Si true, le diplôme visé est déjà dans une demande active */
  duplicateDiplomeBlocked = false;
  duplicateDiplomeMessage = '';

  // 🆕 Campagne dates & status
  currentYearObj?: AnneeUniversitaire;
  isRegistrationClosed = false;
  registrationClosedMessage = '';

  /**
   * true si la dernière demande date de < 1 an
   * → champ "dernier diplôme" désactivé
   */
  get isRecentDemande(): boolean {
    if (!this.existingDemande?.dateCreation) return false;

    const created = new Date(this.existingDemande.dateCreation);

    // 🌟 Nouvelle règle : Si la demande a été créée *avant* l'ouverture de la campagne d'inscription actuelle,
    // elle appartient à l'année dernière. On autorise donc la modification du diplôme (isRecentDemande = false).
    if (this.currentYearObj?.dateOuverture) {
      const ouvertureCampagne = new Date(this.currentYearObj.dateOuverture);
      return created >= ouvertureCampagne;
    }

    // Fallback de sécurité : 365 jours
    const diffMs = Date.now() - created.getTime();
    return diffMs < 365 * 24 * 60 * 60 * 1000;
  }

  /**
   * true si on doit afficher le scanner de relevé supérieur
   * (étudiant existant avec dernier diplôme ≥ licence)
   */
  get needsSuperieurDocs(): boolean {
    const diplome = this.inscriptionForm?.get('personalInfo.dernierDiplome')?.value;
    return ['LICENCE', 'MASTER', 'MASTERE', 'INGENIEUR'].includes(diplome?.toUpperCase() ?? '');
    // PREPARATOIRE intentionnellement absent → mêmes docs que BAC
  }

  // ── Session BAC + logique diplôme ─────────────────────────────────────────
  /** Année de session extraite du scan BAC (QR ou bilan) */
  sessionBac: number | null = null;

  /**
   * Règle :
   *  - session >= 2023 → LIBRE : BAC / Licence / Mastère / Ingénieur
   *  - session <  2023 → FORCÉ : BACCALAUREAT uniquement
   *  - null            → session pas encore connue → toutes options disponibles
   */
  get isBacForced(): boolean {
    if (this.sessionBac === null) return false;
    // Si l'année d'obtention de bac + 2 > 2026 alors rempli automatiquement les champs
    return (this.sessionBac + 2) > 2026;
  }

  /** Options du select "Dernier Diplôme" selon session */
  get lastDiplomasFiltered(): string[] {
    if (this.isBacForced) return ['BACCALAUREAT'];
    return this.getAvailableDiplomes();
  }

  get isPersonalInfoFilled(): boolean {
    const pi = this.inscriptionForm?.get('personalInfo');
    if (!pi) return false;

    const champsRemplis = ['nom', 'prenom', 'email', 'dateNaissance', 'gendre']
      .every(f => {
        const c = pi.get(f);
        return c && c.value && (c.valid || c.disabled);
      });

    // ✅ Afficher aussi si les fichiers BAC sont uploadés (même QR illisible)
    const filesOk = this.selectedFiles.has(TypeDocument.DIPLOME_BAC)
      || this.selectedFiles.has(TypeDocument.RELEVE_NOTES_BAC)
      || (this.bacDiplomeData !== null)
      || (this.bacReleveData !== null);

    return champsRemplis || filesOk;
  }

  // ── Intelligent Progressive Disclosure Getters ──────────────────────────
  get isEtatCivilReady(): boolean {
    const pi = this.personalInfo;
    if (!pi) return false;
    const champs = ['nom', 'prenom', 'gendre', 'dateNaissance'];
    if (this.isTunisiaSelected) champs.push('typeBac');
    const allFilled = champs.every(f => {
      const c = pi.get(f);
      return c && c.value && (c.valid || c.disabled);
    });
    return allFilled && this.etatCivilValidated;  // ← ajout du flag
  }


  get isCoordonneesReady(): boolean {
    const pi = this.personalInfo;
    if (!pi) return false;
    
    // Vérifier si l'email a été changé par rapport à l'original (pour un étudiant existant)
    const emailChanged = this.studentMode === 'existing' && this.existingStudent && pi.get('email')?.value !== this.initialExistingEmail;
    
    // Un étudiant existant est "prêt" si son email est identique à l'original OU s'il a vérifié le nouvel email via OTP
    const emailOk = this.emailVerified || (this.studentMode === 'existing' && !emailChanged);

    return ['email', 'phone'].every(f => {
      const c = pi.get(f);
      return c && c.value && (c.valid || c.disabled);
    }) && this.coordonneesValidated && emailOk;
  }
  // ── Nouvelle méthode appelée au blur de l'email ───────────
  onEmailBlur(): void {
    const email = this.personalInfo?.get('email');
    const phone = this.personalInfo?.get('phone');
    if (email?.valid && phone?.valid && email.value && phone.value) {
      this.coordonneesValidated = true;
      this.cdr.detectChanges();
    }
  }

  // ── OTP Methods ────────────────────────────────────────────────────────
  sendOtp(): void {
    const email = this.personalInfo?.get('email')?.value;
    if (!email) return;

    this.otpLoading = true;
    this.otpError = null;

    this.emailVerificationService.sendOtp(email).subscribe({
      next: () => {
        setTimeout(() => {
          this.otpSent = true;
          this.otpLoading = false;
          this.startResendTimer();
          this.alertService.success('Un code de vérification a été envoyé à votre email.');
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        this.otpLoading = false;
        this.otpError = "Erreur lors de l'envoi du code. Veuillez réessayer.";
        this.alertService.error(this.otpError);
        this.cdr.detectChanges();
      }
    });
  }

  verifyOtp(code: string): void {
    if (code.length !== 6) return;

    const email = this.personalInfo?.get('email')?.value;
    this.otpLoading = true;
    this.otpError = null;

    this.emailVerificationService.verifyOtp(email, code).subscribe({
      next: (res: { valid: boolean; message: string }) => {
        setTimeout(() => {
          this.otpLoading = false;
          if (res.valid) {
            this.emailVerified = true;
            this.otpSent = false; // Fermer le panneau OTP
            this.alertService.success('Email vérifié avec succès !');
          } else {
            this.otpError = res.message || 'Code incorrect.';
          }
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.otpLoading = false;
        this.otpError = 'Erreur technique. Veuillez réessayer.';
        this.cdr.detectChanges();
      }
    });
  }

  private startResendTimer(): void {
    this.otpResendTimer = 60;
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.otpResendTimer > 0) {
        this.otpResendTimer--;
      } else {
        clearInterval(this.timerInterval);
      }
      this.cdr.detectChanges();
    }, 1000);
  }

  onOtpChange(value: string): void {
    if (value.length === 6) {
      this.verifyOtp(value);
    }
  }

  resetOtp(): void {
    this.otpSent = false;
    this.emailVerified = false;
    this.otpError = null;
    this.cdr.detectChanges();
  }
  // ── Blur sur dateNaissance (dernier champ état civil étranger) ──
  onDateNaissanceBlur(): void {
    const pi = this.personalInfo;
    const champs = ['nom', 'prenom', 'gendre', 'dateNaissance'];
    if (this.isTunisiaSelected) champs.push('typeBac');
    const allFilled = champs.every(f => {
      const c = pi?.get(f);
      return c && c.value && (c.valid || c.disabled);
    });
    // Ne pas auto-valider pour les étrangers — laisser le bouton
    // Pour les tunisiens avec données pré-remplies, auto-valider
    if (allFilled && this.studentMode === 'existing') {
      this.etatCivilValidated = true;
      this.cdr.detectChanges();
    }
  }

  get isCursusReady(): boolean {
    const pi = this.personalInfo;
    if (!pi) return false;
    const basic = ['dernierDiplome', 'anneeDernierDiplome'].every(f => {
      const c = pi.get(f);
      return c && c.value && (c.valid || c.disabled);
    });
    let docsOk = true;
    if (this.nationalityMode === 'tunisian' && this.studentMode === 'new') {
      // ✅ selectedFiles suffit — le fichier est toujours stocké scan réussi ou non
      docsOk = this.selectedFiles.has(TypeDocument.DIPLOME_BAC)
        && this.selectedFiles.has(TypeDocument.RELEVE_NOTES_BAC);
    }
    if (this.nationalityMode === 'foreign' && this.studentMode === 'new') {
      docsOk = this.selectedFiles.has(TypeDocument.DIPLOME_BAC)
        && this.selectedFiles.has(TypeDocument.RELEVE_NOTES_BAC)
        && this.selectedFiles.has(TypeDocument.CARTE_IDENTITE);
      const diplome = pi.get('dernierDiplome')?.value?.toUpperCase();
      if (diplome && diplome !== 'BACCALAUREAT') {
        docsOk = docsOk
          && this.selectedFiles.has(this.getDiplomeTypeFor(diplome) as any)
          && this.selectedFiles.has(this.getReleveTypeFor(diplome) as any);
      }
    }
    return basic && docsOk && this.cursusValidated;
  }

  // get isAllStep1Ready(): boolean {
  //   return this.idCheckDone && this.isEtatCivilReady && this.isCoordonneesReady && this.isCursusReady;
  // }
  get isAllStep1Ready(): boolean {
    return this.idCheckDone
      && this.isEtatCivilReady
      && this.isCoordonneesReady
      && this.isCursusReady
      && this.etatCivilValidated
      && this.coordonneesValidated
      && this.cursusValidated;   // ← ajout
  }
  get isForeignDocsComplete(): boolean {
    if (this.nationalityMode !== 'foreign' || this.studentMode !== 'new') return true;
    const pi = this.personalInfo;
    const diplome = pi?.get('dernierDiplome')?.value?.toUpperCase();
    if (!diplome) return false;
    const base = this.selectedFiles.has(TypeDocument.DIPLOME_BAC)
      && this.selectedFiles.has(TypeDocument.RELEVE_NOTES_BAC);
    if (diplome === 'BACCALAUREAT') return base;
    return base
      && this.selectedFiles.has(this.getDiplomeTypeFor(diplome) as any)
      && this.selectedFiles.has(this.getReleveTypeFor(diplome) as any);
  }
  // ── Getter helper : docs tunisien complets ───────────────────────
  get isTunisianDocsComplete(): boolean {
    if (this.nationalityMode !== 'tunisian' || this.studentMode !== 'new') return true;
    const diplome = this.personalInfo?.get('dernierDiplome')?.value?.toUpperCase();
    const base = this.selectedFiles.has(TypeDocument.DIPLOME_BAC)
      && this.selectedFiles.has(TypeDocument.RELEVE_NOTES_BAC);
    if (diplome === 'PREPARATOIRE') {
      return base
        && this.selectedFiles.has(TypeDocument.DIPLOME_PREPARATOIRE as any)
        && this.selectedFiles.has(TypeDocument.RELEVE_NOTES_PREPARATOIRE as any);
    }
    return base;
  }

  get isExistingDocsComplete(): boolean {
    if (this.studentMode !== 'existing') return true;
    
    // Pour BACCALAUREAT, il faut vérifier le relevé et diplôme bac
    if (this.shouldUploadDocument('DIPLOME_BAC') && !this.selectedFiles.has(TypeDocument.DIPLOME_BAC)) return false;
    if (this.shouldUploadDocument('RELEVE_NOTES_BAC') && !this.selectedFiles.has(TypeDocument.RELEVE_NOTES_BAC)) return false;

    const diplome = this.personalInfo?.get('dernierDiplome')?.value?.toUpperCase();
    if (diplome && diplome !== 'BACCALAUREAT') {
      const typeDip = this.getDiplomeTypeFor(diplome);
      const typeRel = this.getReleveTypeFor(diplome);
      if (this.shouldUploadDocument(typeDip) && !this.selectedFiles.has(typeDip)) return false;
      if (this.shouldUploadDocument(typeRel) && !this.selectedFiles.has(typeRel)) return false;
    }

    return true;
  }

  // ── Getter : bouton "Valider cursus" visible ? ────────────────────
  get canValidateCursus(): boolean {
    const pi = this.personalInfo;
    if (!pi) return false;
    const anneeCtrl = pi.get('anneeDernierDiplome');
    const diplomeOk = pi.get('dernierDiplome')?.valid && pi.get('dernierDiplome')?.value;
    const anneeOk = anneeCtrl?.disabled
      ? !!anneeCtrl.value
      : (anneeCtrl?.valid && !!anneeCtrl?.value);
    const docsOk = this.isForeignDocsComplete && this.isTunisianDocsComplete && this.isExistingDocsComplete;
    return !!(diplomeOk && anneeOk && docsOk && !this.cursusValidated);
  }

  toggleEditMode(): void {
    this.editMode = !this.editMode;
    if (this.editMode) {
      // Optionnel : scroller vers le haut ou focus le 1er champ
    }
  }
  get anneeMinDiplome(): number {
    const diplome = this.inscriptionForm?.get('personalInfo.dernierDiplome')?.value;
    const dateNaissance = this.inscriptionForm?.get('personalInfo.dateNaissance')?.value;
    const anneeNaissance = dateNaissance ? new Date(dateNaissance).getFullYear() : null;

    if (this.nationalityMode === 'tunisian') {
      if (this.sessionBac) {
        if (diplome === 'BACCALAUREAT') return this.sessionBac;
        // preparatoir alors il ne doit pas inferieur au date d'otention du bac+2
        if (diplome === 'PREPARATOIRE') return this.sessionBac + 2;
        // licence alors il ne doit pas inferieur au date d'otention du bac+3
        if (diplome === 'LICENCE') return this.sessionBac + 3;
        // mater ou cycle ingenieur alors il ne doit pas inferieur au date d'otention du bac+5
        return this.sessionBac + 5;
      }
      // ✅ Sans session → MIN = annéeNaissance + offset exact
      if (!anneeNaissance) return 1950;
      if (diplome === 'BACCALAUREAT') return anneeNaissance + 18;
      if (diplome === 'PREPARATOIRE') return anneeNaissance + 20;
      if (diplome === 'LICENCE') return anneeNaissance + 21;
      if (diplome === 'MASTERE' || diplome === 'MASTER') return anneeNaissance + 23;
      if (diplome === 'INGENIEUR') return anneeNaissance + 23;
      return 1950;
    }

    if (!anneeNaissance) return 1950;
    const paysId = this.inscriptionForm?.get('personalInfo.pays')?.value;
    const country = this.countries.find(c => c.id == paysId);
    const minAge = this.getMinAge(country?.nom);
    if (diplome === 'BACCALAUREAT') return anneeNaissance + minAge;
    if (diplome === 'LICENCE') return anneeNaissance + minAge + 3;
    return anneeNaissance + minAge + 5;
  }
  // REMPLACER le getter anneeMaxDiplome existant par :
  get anneeMaxDiplome(): number {
    return this.effectiveCurrentYear; // ✅ juillet check appliqué partout
  }
  // ── Helper : année courante effective (dynamique depuis le backend) ──────────
  private get effectiveCurrentYear(): number {
    if (this.currentYearObj?.annee) {
      // Si l'année est "2025-2026", on extrait 2026 comme année max
      const parts = this.currentYearObj.annee.split('-');
      return parts.length === 2 ? parseInt(parts[1]) : new Date().getFullYear();
    }
    const now = new Date();
    return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  }

  // Message d'aide affiché sous le champ
  // ── anneeHint : remplacer "=" par ">=" ───────────────────────────────────
  get anneeHint(): string {
    const diplome = this.inscriptionForm?.get('personalInfo.dernierDiplome')?.value;
    if (!diplome) return '';

    if (this.nationalityMode === 'tunisian') {
      if (this.sessionBac) {
        if (diplome === 'BACCALAUREAT') return `Session ${this.sessionBac} (automatique)`;
        if (diplome === 'PREPARATOIRE') return `≥ ${this.sessionBac + 2}`;
        if (diplome === 'LICENCE') return `≥ ${this.sessionBac + 3}`;
        return `≥ ${this.sessionBac + 5}`;
      }

      // ── Sans session → afficher ≥ MIN ────────────────────────────────
      const dateNaissance = this.inscriptionForm?.get('personalInfo.dateNaissance')?.value;
      const anneeNaissance = dateNaissance ? new Date(dateNaissance).getFullYear() : null;
      if (!anneeNaissance) return '';

      if (diplome === 'BACCALAUREAT') return `≥ ${anneeNaissance + 18}`;
      if (diplome === 'PREPARATOIRE') return `≥ ${anneeNaissance + 20}`;
      if (diplome === 'LICENCE') return `≥ ${anneeNaissance + 21}`;
      if (diplome === 'MASTERE' || diplome === 'MASTER') return `≥ ${anneeNaissance + 23}`;
      if (diplome === 'INGENIEUR') return `≥ ${anneeNaissance + 23}`;
      return '';
    }

    const min = this.anneeMinDiplome;
    return min > 1950 ? `≥ ${min}` : '';
  }

  // APRÈS
  private readonly SCAN_TTL_MS = 15 * 60 * 1000;
  private cinStamped: Stamped<OcrCinResult> | null = null;
  private bacDiplomeStamped: Stamped<BacResult> | null = null;
  private bacReleveStamped: Stamped<BacServiceResult> | null = null;

  get cinData(): OcrCinResult | null {
    return this.isFresh(this.cinStamped) ? this.cinStamped!.data : null;
  }
  get bacDiplomeData(): BacResult | null {
    return this.isFresh(this.bacDiplomeStamped) ? this.bacDiplomeStamped!.data : null;
  }
  get bacReleveData(): BacServiceResult | null {
    return this.isFresh(this.bacReleveStamped) ? this.bacReleveStamped!.data : null;
  }
  private isFresh<T>(stamped: Stamped<T> | null): boolean {
    if (!stamped) return false;
    return (Date.now() - stamped.scannedAt) < this.SCAN_TTL_MS;
  }
  verifyMatch: boolean | null = null;
  verifyReason = '';
  /** true si le type de bac a été verrouillé après un scan réussi */
  scanTypeBacLocked = false;

  // ── Diplômes ─────────────────────────────────────────────────────────────
  availableLangues: Langue[] = [];
  readonly langueLabels: Record<Langue, string> = {
    ARABE: 'Arabe عربي',
    FRANCAIS: 'Français',
    ANGLAIS: 'Anglais'
  };
  diplomesResponsables: DiplomeResponsable[] = [];
  typesDiplome: TypeDiplome[] = [];
  filteredDiplomesResponsables: DiplomeResponsable[] = [];

  readonly bacTypes = [
    { value: 'SCIENCES_EXPERIMENTALES', label: 'Bac Sciences Expérimentales' },
    { value: 'MATHEMATIQUES', label: 'Bac Mathématiques' },
    { value: 'TECHNIQUE', label: 'Bac Technique' },
    { value: 'ECONOMIE_GESTION', label: 'Bac Économie et Gestion' },
    { value: 'SCIENCES_INFORMATIQUE', label: "Bac Sciences de l'Informatique" }
  ];

  private readonly DRAFT_KEY = 'pre_inscription_draft';
  private readonly DRAFT_MAX_AGE_MS = 5 * 60 * 1000;
  private draftExpiryTimer: any = null;
  private lastSelectedCountryId: any = null;

  lastDiplomas = ['BACCALAUREAT', 'PREPARATOIRE', 'LICENCE', 'MASTERE', 'INGENIEUR'];

  // ── Documents requis (base) ───────────────────────────────────────────────
  get requiredDocuments() {
    const docs: { type: TypeDocument; label: string; required: boolean }[] = [];

    if (this.nationalityMode === 'tunisian') {
      // ── LOGIQUE TUNISIEN ──
      docs.push({ type: TypeDocument.CARTE_IDENTITE, label: "Carte d'identité nationale", required: true });

      if (this.studentMode === 'new') {
        docs.push({ type: TypeDocument.DIPLOME_BAC, label: 'Diplôme du Baccalauréat', required: true });
        docs.push({ type: TypeDocument.RELEVE_NOTES_BAC, label: 'Relevé de notes BAC', required: true });
      }
      if (this.studentMode === 'existing' && this.needsSuperieurDocs) {
        const diplome = this.inscriptionForm?.get('personalInfo.dernierDiplome')?.value?.toUpperCase();

        if (diplome === 'LICENCE') {
          docs.push({ type: TypeDocument.DIPLOME_LICENCE, label: 'Diplôme de Licence', required: true });
          docs.push({ type: TypeDocument.RELEVE_NOTES_LICENCE, label: 'Relevé de notes de la Licence', required: true });
        }
        else if (diplome === 'MASTERE' || diplome === 'MASTER') {
          docs.push({ type: TypeDocument.DIPLOME_MASTER, label: 'Diplôme de Master', required: true });
          docs.push({ type: TypeDocument.RELEVE_NOTES_MASTER, label: 'Relevé de notes du Master', required: true });
        }
        else if (diplome === 'INGENIEUR') {
          docs.push({ type: TypeDocument.DIPLOME_INGENIEUR as any, label: "Diplôme d'Ingénieur", required: true });
          docs.push({ type: TypeDocument.RELEVE_NOTES_INGENIEUR as any, label: "Relevé de notes d'Ingénieur", required: true });
        }
        else if (diplome === 'PREPARATOIRE') {
          docs.push({ type: TypeDocument.DIPLOME_PREPARATOIRE as any, label: "Diplôme / Attestation Préparatoire", required: true });
          docs.push({ type: TypeDocument.RELEVE_NOTES_PREPARATOIRE as any, label: "Relevé de notes Préparatoire", required: true });
        }
      }
    } else {
      // ── LOGIQUE ÉTRANGER ──
      const diplome = this.inscriptionForm?.get('personalInfo.dernierDiplome')?.value?.toUpperCase();

      docs.push({ type: TypeDocument.CARTE_IDENTITE, label: 'Passeport', required: true });

      // Documents BAC (Requis pour TOUS les diplômes étrangers, car c'est la base)
      docs.push({ type: TypeDocument.DIPLOME_BAC, label: 'Diplôme du Baccalauréat', required: true });
      docs.push({ type: TypeDocument.RELEVE_NOTES_BAC, label: 'Relevé de notes BAC', required: true });

      // Documents du diplôme supérieur (Si le dernier diplôme n'est pas le BACCALAUREAT)
      if (diplome && diplome !== 'BACCALAUREAT') {
        if (diplome === 'LICENCE') {
          docs.push({ type: TypeDocument.DIPLOME_LICENCE, label: 'Diplôme de Licence', required: true });
          docs.push({ type: TypeDocument.RELEVE_NOTES_LICENCE, label: 'Relevé de notes de la Licence', required: true });
        } else if (diplome === 'MASTERE' || diplome === 'MASTER') {
          docs.push({ type: TypeDocument.DIPLOME_MASTER, label: 'Diplôme de Master', required: true });
          docs.push({ type: TypeDocument.RELEVE_NOTES_MASTER, label: 'Relevé de notes du Master', required: true });
        } else if (diplome === 'INGENIEUR') {
          docs.push({ type: TypeDocument.DIPLOME_INGENIEUR as any, label: "Diplôme d'Ingénieur", required: true });
          docs.push({ type: TypeDocument.RELEVE_NOTES_INGENIEUR as any, label: "Relevé de notes d'Ingénieur", required: true });
        } else if (diplome === 'PREPARATOIRE') {
          docs.push({ type: TypeDocument.DIPLOME_PREPARATOIRE as any, label: "Diplôme / Attestation Préparatoire", required: true });
          docs.push({ type: TypeDocument.RELEVE_NOTES_PREPARATOIRE as any, label: "Relevé de notes Préparatoire", required: true });
        }
      }
    }

    return docs;
  }

  extraDocuments: any[] = [];

  // ── Getters form ──────────────────────────────────────────────────────────
  get personalInfo() { return this.inscriptionForm.get('personalInfo') as FormGroup; }
  get academicInfo() { return this.inscriptionForm.get('academicInfo') as FormGroup; }

  get isTunisiaSelected(): boolean {
    const paysId = this.inscriptionForm.get('personalInfo.pays')?.value;
    return this.countries.find(c => c.id == paysId)?.nom?.toLowerCase().includes('tunis') ?? false;
  }

  get uniqueDiplomas(): DiplomeEtudier[] {
    const seen = new Set<string>();
    return this.diplomas.filter(d => {
      if (seen.has(d.nomDiplome)) return false;
      seen.add(d.nomDiplome); return true;
    });
  }

  /** Filtre les diplômes visés selon le dernier diplôme obtenu */
  get filteredDiplomesParNiveau(): DiplomeResponsable[] {
    const dernierDiplome = this.inscriptionForm?.get('personalInfo.dernierDiplome')?.value?.toUpperCase() ?? '';

    if (this.nationalityMode === 'tunisian' && dernierDiplome === 'BACCALAUREAT') {
      return this.filteredDiplomesResponsables.filter(d =>
        d.nomDiplome?.toUpperCase().includes('LICENCE') ||
        d.typeNom?.toUpperCase().includes('LICENCE')
      );
    }

    return this.filteredDiplomesResponsables;
  }
  get filteredTypesDiplome(): TypeDiplome[] {
    const dernierDiplome = this.inscriptionForm?.get('personalInfo.dernierDiplome')?.value?.toUpperCase() ?? '';

    if (this.nationalityMode === 'tunisian' && dernierDiplome === 'BACCALAUREAT') {
      return this.typesDiplome.filter(t => t.nom?.toUpperCase().includes('LICENCE'));
    }

    return this.typesDiplome;
  }

  constructor(
    private fb: FormBuilder,
    private countryService: CountryService,
    private diplomaService: DiplomaService,
    private enrollmentService: EnrollmentService,
    private phoneValidationService: PhoneValidationService,
    private studentService: StudentService,
    private scolariteService: ScolariteService,
    private emailVerificationService: EmailVerificationService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.initForm();
    this.loadAcademicYearSettings();
    // loadInitialData() sera appelé à l'intérieur de loadAcademicYearSettings() une fois l'année récupérée.
    this.startDraftExpiryTimer();
    interval(60_000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.checkScanExpiry();
    });

    // Fix: Re-fetch levels when diploma OR language OR session changes
    merge(
      this.inscriptionForm.get('academicInfo.diplomeVise')!.valueChanges,
      this.inscriptionForm.get('academicInfo.langueVise')!.valueChanges,
      this.inscriptionForm.get('academicInfo.session')!.valueChanges
    ).pipe(
      takeUntil(this.destroy$),
      debounceTime(50), 
      distinctUntilChanged()
    ).subscribe(() => {
      const langue = this.inscriptionForm.get('academicInfo.langueVise')?.value;
      const nomDiplome = this.inscriptionForm.get('academicInfo.diplomeVise')?.value;
      const annee = this.inscriptionForm.get('academicInfo.session')?.value;

      if (nomDiplome && langue && annee) {
        this.diplomaService.getNiveauxByDiplomeNameAndLangue(nomDiplome, langue, annee)
          .subscribe(data => {
            this.levels = data.sort((a, b) => {
              const nA = parseInt(String(a.niveau), 10);
              const nB = parseInt(String(b.niveau), 10);
              return nA - nB;
            });
            // Reset entry level if previous selection is no longer valid
            const currentNiveau = this.inscriptionForm.get('academicInfo.niveauVise')?.value;
            if (currentNiveau && !this.levels.find(l => String(l.niveau) === String(currentNiveau))) {
              this.inscriptionForm.get('academicInfo.niveauVise')?.setValue('');
            }
          });
      } else {
        this.levels = [];
      }
    });

    // 📧 Surveillance changement email pour étudiant existant
    this.inscriptionForm.get('personalInfo.email')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(email => {
        if (this.studentMode === 'existing' && this.initialExistingEmail) {
          if (email === this.initialExistingEmail) {
            this.emailVerified = true;
          } else {
            // Si l'email change, réinitialiser la vérification sauf si déjà vérifié manuellement (OTP)
            // Mais dans le doute, si on tape au clavier, on invalide
            this.emailVerified = false;
          }
          this.cdr.detectChanges();
        }
      });

    // Vérification diplôme en double quand le candidat change le diplôme visé
    this.inscriptionForm.get('academicInfo.diplomeVise')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.checkDuplicateDiplome());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.draftExpiryTimer) clearTimeout(this.draftExpiryTimer);
  }

  loadAcademicYearSettings() {
    this.scolariteService.getAnneeCouranteDetails().subscribe({
      next: (year) => {
        if (year) {
          this.currentYearObj = year;
          this.checkRegistrationInterval(year);
          this.inscriptionForm.get('academicInfo.session')?.setValue(year.annee);

          // 🚀 Une fois l'année chargée, on charge les diplômes filtrés par cette année
          this.loadInitialData(year.annee);
        } else {
          // Fallback si aucune année n'est définie
          this.loadInitialData();
        }
      },
      error: (err) => console.error('Erreur chargement config année:', err)
    });
  }

  checkRegistrationInterval(year: AnneeUniversitaire) {
    const now = new Date();
    const open = year.dateOuverture ? new Date(year.dateOuverture) : null;
    const close = year.dateFermeture ? new Date(year.dateFermeture) : null;

    if (open && now < open) {
      this.isRegistrationClosed = true;
      this.registrationClosedMessage = `Les inscriptions pour l'année ${year.annee} ne sont pas encore ouvertes. Elles débuteront le ${open.toLocaleDateString()}.`;
    } else if (close && now > close) {
      this.isRegistrationClosed = true;
      this.registrationClosedMessage = `Les inscriptions pour l'année ${year.annee} sont désormais clôturées depuis le ${close.toLocaleDateString()}.`;
    } else if (year.verrouillee) {
      this.isRegistrationClosed = true;
      this.registrationClosedMessage = `La campagne de pré-inscription ${year.annee} est temporairement suspendue.`;
    } else {
      this.isRegistrationClosed = false;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // INIT FORM
  // ════════════════════════════════════════════════════════════════════════
  initForm(): void {
    this.inscriptionForm = this.fb.group({
      personalInfo: this.fb.group({
        nom: ['', [Validators.required, Validators.pattern(/^[a-zA-ZÀ-ÿ\u0600-\u06FF '-]*$/)]],
        prenom: ['', [Validators.required, Validators.pattern(/^[a-zA-ZÀ-ÿ\u0600-\u06FF '-]*$/)]],
        email: ['', [Validators.required, Validators.email]],
        phone: ['', {
          validators: [Validators.required],
          asyncValidators: [this.phoneAsyncValidator.bind(this)]
        }],
        indicatif: [{ value: '+216', disabled: true }, Validators.required],
        gendre: ['HOMME', Validators.required],
        dateNaissance: ['', [Validators.required, this.ageValidator(18)]],
        pays: ['', Validators.required],
        adresse: [''],
        cin: ['', [Validators.pattern('^[0-9]{8}$')]],
        numPassport: [''],
        typeBac: [''],
        dernierDiplome: ['', Validators.required],
        anneeDernierDiplome: [{ value: '', disabled: false }, Validators.required]
      }),
      academicInfo: this.fb.group({
        typeVise: ['', Validators.required],
        diplomeVise: ['', Validators.required],
        langueVise: ['', Validators.required],
        niveauVise: ['', Validators.required],
        session: ['2024-2025', Validators.required]
      }),
      documents: this.fb.group({})
    });

    // Pays change → détecter tunisien/étranger
    this.inscriptionForm.get('personalInfo.pays')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(paysId => {
        if (this.lastSelectedCountryId === paysId) return;
        this.lastSelectedCountryId = paysId;

        const country = this.countries.find(c => c.id == paysId);
        if (country) {
          this.inscriptionForm.get('personalInfo.indicatif')?.setValue(country.indicatif);
          const isTunisian = country.nom?.toLowerCase().includes('tunis') ?? false;
          this.nationalityMode = isTunisian ? 'tunisian' : 'foreign';
          // Reset studentMode & scanned data when country changes
          this.resetStudentState();
          this.setIdType(isTunisian ? 'cin' : 'passport');
        }

        const typeBacControl = this.inscriptionForm.get('personalInfo.typeBac');
        if (this.isTunisiaSelected) {
          typeBacControl?.setValidators([Validators.required]);
        } else {
          typeBacControl?.clearValidators();
          typeBacControl?.setValue('');
        }
        const minAge = this.getMinAge(country?.nom);
        const dateCtrl = this.inscriptionForm.get('personalInfo.dateNaissance');
        dateCtrl?.setValidators([Validators.required, this.ageValidator(minAge)]);
        dateCtrl?.updateValueAndValidity();
        typeBacControl?.updateValueAndValidity();
      });

    this.inscriptionForm.get('personalInfo.indicatif')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(indicatif => {
        const country = this.countries.find(c => c.indicatif === indicatif);
        if (country && this.inscriptionForm.get('personalInfo.pays')?.value != country.id) {
          this.inscriptionForm.get('personalInfo.pays')?.setValue(country.id, { emitEvent: false });
        }
      });

    this.inscriptionForm.get('academicInfo.typeVise')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(typeName => this.onTypeChange(typeName));

    this.inscriptionForm.get('personalInfo.dernierDiplome')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(val => {
        // 1. Reset tout
        this.inscriptionForm.get('academicInfo.diplomeVise')?.setValue('');
        const typeViseCtrl = this.inscriptionForm.get('academicInfo.typeVise');
        this.filteredDiplomesResponsables = [];
        this.levels = [];

        // 2. Logique forcée sur le typeVise
        if (val === 'BACCALAUREAT') {
          const licenceType = this.typesDiplome.find(t => t.nom?.toUpperCase().includes('LICENCE'));
          if (licenceType) {
            typeViseCtrl?.setValue(licenceType.nom);
            typeViseCtrl?.disable();
          }
        } else {
          typeViseCtrl?.setValue('');
          typeViseCtrl?.enable();
        }

        // 3. Règles métier sur l'année d'obtention
        const anneeCtrl = this.inscriptionForm.get('personalInfo.anneeDernierDiplome');
        if (!val) {
          anneeCtrl?.setValue('', { emitEvent: false });
          anneeCtrl?.clearValidators();
          anneeCtrl?.updateValueAndValidity({ emitEvent: false });
          return;
        }

        if (this.nationalityMode === 'tunisian' && val === 'BACCALAUREAT' && this.sessionBac) {
          // Auto-rempli = sessionBac, champ désactivé
          anneeCtrl?.setValue(this.sessionBac, { emitEvent: false });
          anneeCtrl?.disable({ emitEvent: false });
          anneeCtrl?.clearValidators();
        } else {
          anneeCtrl?.enable({ emitEvent: false });
          // ✅ Pas de Validators.min/max ici — on utilise un validator dynamique custom
          anneeCtrl?.setValidators([
            Validators.required,
            this.anneeRangeValidator()   // ← validator qui lit les getters à chaque validation
          ]);
        }
        anneeCtrl?.updateValueAndValidity({ emitEvent: false });
        this.cdr.detectChanges();
      });

    this.inscriptionForm.valueChanges
      .pipe(debounceTime(2000), takeUntil(this.destroy$))
      .subscribe(val => this.autoSave(val));
    // this.inscriptionForm.get('personalInfo.dateNaissance')?.valueChanges
    //   .pipe(takeUntil(this.destroy$))
    //   .subscribe(() => {
    //     const current = this.inscriptionForm.get('personalInfo.dernierDiplome')?.value;
    //     const available = this.getAvailableDiplomes();
    //     if (current && !available.includes(current)) {
    //       this.inscriptionForm.get('personalInfo.dernierDiplome')?.setValue('');
    //     }
    //   });
    this.inscriptionForm.get('personalInfo.dateNaissance')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const current = this.inscriptionForm.get('personalInfo.dernierDiplome')?.value;
        const available = this.getAvailableDiplomes();
        if (current && !available.includes(current)) {
          this.inscriptionForm.get('personalInfo.dernierDiplome')?.setValue('');
        }
        // ✅ AJOUTER : revalider l'année quand la date de naissance change
        this.inscriptionForm.get('personalInfo.anneeDernierDiplome')
          ?.updateValueAndValidity({ emitEvent: false });
        this.cdr.detectChanges();
      });

    this.restoreForm();
    this.setIdType('cin');
  }
  // ── Ajouter ce validator custom dans la classe ────────────────────────────
  private anneeRangeValidator() {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      const val = Number(control.value);
      const min = this.anneeMinDiplome;
      const max = this.anneeMaxDiplome;
      if (val < min) return { min: { min, actual: val } };
      if (val > max) return { max: { max, actual: val } };
      return null;
    };
  }
  // Ajouter dans la classe PreInscriptionComponent
  // ✅ APRÈS
  private isDocumentAutoValidable(type: string): boolean {
    switch (type) {
      case TypeDocument.DIPLOME_BAC:
        return this.bacDiplomeData !== null && this.bacDiplomeData.success === true;
      case TypeDocument.RELEVE_NOTES_BAC:
        return this.bacReleveData !== null && this.bacReleveData.success === true;
      default:
        return false;
    }
  }
  private uploadWithAutoValidation(studentId: number, type: string, file: File, enrollmentId?: number): Observable<any> {
    return this.studentService.uploadDocument(studentId, type, file, enrollmentId).pipe(
      switchMap((uploadedDoc) => {
        const docId = uploadedDoc?.document?.id ?? uploadedDoc?.id;

        if (docId && this.isDocumentAutoValidable(type)) {
          const commentaire = `Validé automatiquement — scan QR/OCR réussi le ${new Date().toLocaleDateString('fr-TN')}`;
          return this.studentService.acceptDocument(docId, commentaire).pipe(
            catchError(() => of(uploadedDoc)),
            map(() => uploadedDoc)
          );
        }
        return of(uploadedDoc);
      })
    );
  }
  private getMinAge(nomPays: string | undefined): number {
    if (!nomPays) return 17;

    const pays18ans = [
      // Pays arabes et Afrique du Nord
      'Tunisia', 'Tunisie', 'Algérie', 'Maroc', 'Libye',
      'Egypt', 'Syria', 'Liban', 'Irak', 'Iran', 'Jordanie',
      'Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Koweït',
      'Bahreïn', 'Oman', 'Yemen',
      // Afrique subsaharienne
      'Sénégal', 'Cameroun', 'Côte d\'Ivoire', 'Mali', 'Niger',
      'Burkina Faso', 'Togo', 'Bénin', 'Gabon', 'Congo',
      'République démocratique du Congo', 'Madagascar', 'Rwanda',
      'Éthiopie', 'Kenya', 'Tanzanie', 'Ouganda', 'Ghana',
      'Nigéria', 'Soudan', 'Djibouti', 'Mauritanie', 'Tchad',
      // Asie centrale
      'Pakistan', 'Bangladesh', 'Afghanistan'
    ];

    if (pays18ans.includes(nomPays)) return 18;
    return 17; // Europe, Amérique, Asie de l'Est → 17 ans
  }
  private calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  }
  getAvailableDiplomes(): string[] {
    const dateNaissance = this.inscriptionForm.get('personalInfo.dateNaissance')?.value;
    if (!dateNaissance) return this.lastDiplomas;

    const age = this.calculateAge(new Date(dateNaissance));
    const isTunisian = this.nationalityMode === 'tunisian';

    if (isTunisian) {
      if (this.sessionBac !== null) {
        const available = ['BACCALAUREAT'];
        // si l'année d'obtention de bac +2 <= 2026 alors je me permet de choisir soit son dernier diplome bac ou preparatoire
        if ((this.sessionBac + 2) <= 2026) available.push('PREPARATOIRE');
        // si l'année d'obtention de bac +3 <= 2026 alors son dernier diplome peut etre licence
        if ((this.sessionBac + 3) <= 2026) available.push('LICENCE');
        // si l'année d'obtention de bac +5 <= 2026 alors son dernier diplome peut etre tout les diplomes
        if ((this.sessionBac + 5) <= 2026) {
          if (!available.includes('LICENCE')) available.push('LICENCE');
          available.push('MASTERE', 'INGENIEUR');
        }
        return available;
      }
      // Logique par défaut par âge si session inconnue
      if (age < 21) return ['BACCALAUREAT', 'PREPARATOIRE'];
      if (age <= 22) return ['BACCALAUREAT', 'PREPARATOIRE', 'LICENCE'];
      return ['BACCALAUREAT', 'PREPARATOIRE', 'LICENCE', 'MASTERE', 'INGENIEUR'];
    }

    // Étranger — logique inchangée par âge
    const paysId = this.inscriptionForm.get('personalInfo.pays')?.value;
    const country = this.countries.find(c => c.id == paysId);
    const minAge = this.getMinAge(country?.nom);

    if (age < minAge + 2) return ['BACCALAUREAT'];
    if (age < minAge + 5) return ['BACCALAUREAT', 'LICENCE'];
    return ['BACCALAUREAT', 'LICENCE', 'MASTERE', 'INGENIEUR'];
  }

  // ════════════════════════════════════════════════════════════════════════
  // VÉRIFICATION IDENTIFIANT (CIN ou PASSPORT)
  // ════════════════════════════════════════════════════════════════════════

  /**
  /**
   * Handler scanner CIN pour identification initiale.
   */
  onCinScannedForVerify(result: OcrCinResult): void {
    if (!result.success || !result.numeroCin) return;
    this.cinStamped = { data: result, scannedAt: Date.now() };
    this.cinExtractedValue = result.numeroCin;
    this.cinExtracted = true;
    this.inscriptionForm.get('personalInfo.cin')?.setValue(result.numeroCin);
    this.inscriptionForm.get('personalInfo.cin')?.markAsTouched();
    //this.cinData = result;
    //this.tryVerify(); // ← AJOUTER CETTE LIGNE
    if ((result as any).file) {
      this.selectedFiles.set(TypeDocument.CARTE_IDENTITE, (result as any).file);
    }
    this.verifyIdentifiant();
  }
  verifyIdentifiant(): void {
    const paysId = this.inscriptionForm.get('personalInfo.pays')?.value;
    if (!paysId) { this.alertService.error('Veuillez sélectionner votre pays.'); return; }

    this.isCheckingId = true;
    this.idCheckDone = false;
    this.existingStudent = null;
    this.existingDemande = null;
    this.studentMode = 'unknown';

    if (this.nationalityMode === 'tunisian') {
      const cin = this.inscriptionForm.get('personalInfo.cin')?.value;
      if (!cin || cin.length !== 8) {
        this.alertService.error('Veuillez saisir un numéro CIN valide (8 chiffres).');
        this.isCheckingId = false; return;
      }
      this.studentService.getStudentByCin(cin).pipe(
        catchError(() => of(null))
      ).subscribe(student => this.handleStudentLookup(student));

    } else {
      const passport = this.inscriptionForm.get('personalInfo.numPassport')?.value;
      if (!passport) {
        this.alertService.error('Veuillez saisir votre numéro de passeport.');
        this.isCheckingId = false; return;
      }

      // ✅ ÉTAPE 1 : chercher le candidat en base
      this.studentService.getStudentByPassport(passport, Number(paysId)).pipe(
        catchError(() => of(null))
      ).subscribe(student => {

        // ✅ Candidat existant → on charge ses infos directement
        if (student) {
          this.handleStudentLookup(student);
          return;
        }

        // ✅ APRÈS — le 400 est bien récupéré
        this.studentService.validatePassport(passport, Number(paysId)).pipe(
          catchError((err) => {
            if (err.status === 400 && err.error) {
              return of(err.error); // ← body du 400 contient { valide, formatAttendu, message }
            }
            return of({ valide: true }); // autre erreur réseau → on laisse passer
          })
        ).subscribe(validation => {
          if (!validation.valide) {
            this.isCheckingId = false;
            this.idCheckDone = false;
            this.alertService.error(
              `Format de passeport invalide.\nFormat attendu : ${validation.formatAttendu ?? 'inconnu'}`
            );
            this.inscriptionForm.get('personalInfo.numPassport')?.setErrors({ passportFormat: true });
            this.inscriptionForm.get('personalInfo.numPassport')?.markAsTouched();
            return;
          }
          this.handleStudentLookup(null);
        });
      });
    }
  }

  private handleStudentLookup(student: Student | null): void {
    // setTimeout(0) : sort du cycle CD courant pour éviter NG0100
    setTimeout(() => {
      this.isCheckingId = false;
      this.idCheckDone = true;

      if (!student) {
        this.studentMode = 'new';
        this.isIdentificationConfirmed = false;
        this.cdr.detectChanges();
        return;
      }

      this.existingStudent = student;
      this.initialExistingEmail = student.email || null;
      this.studentMode = 'existing';
      this.isIdentificationConfirmed = true;
      this.prefillFromStudent(student);
      // Auto-valider état civil et coordonnées
      this.etatCivilValidated = true;
      this.coordonneesValidated = true;
      this.cursusValidated = true;
      this.emailVerified = true; // Vérifié par défaut puisque c'est son email en base
      this.cdr.detectChanges();

      if (student.id) {
        forkJoin({
          demande: this.enrollmentService.getDemandeByEtudiantId(student.id).pipe(catchError(() => of(null))),
          demandes: this.enrollmentService.getDemandesByEtudiantId(student.id).pipe(catchError(() => of([]))),
          docs: this.studentService.getDocumentsStatus(student.id).pipe(catchError(() => of([])))
        }).subscribe(({ demande, demandes, docs }) => {
          setTimeout(() => {
            this.existingDemande = demande;
            this.existingDemandes = demandes ?? [];
            this.existingDocStatuses = docs ?? [];

            // On n'active les champs diplôme QUE si la demande n'est pas récente (isRecentDemande)
            if (!this.isRecentDemande) {
              this.inscriptionForm.get('personalInfo.dernierDiplome')?.enable({ emitEvent: false });
              this.inscriptionForm.get('personalInfo.anneeDernierDiplome')?.enable({ emitEvent: false });
            } else {
              this.inscriptionForm.get('personalInfo.dernierDiplome')?.disable({ emitEvent: false });
              this.inscriptionForm.get('personalInfo.anneeDernierDiplome')?.disable({ emitEvent: false });
            }

            // GESTION DU VERROUILLAGE DE L'IDENTITÉ (Nom, Prénom, DateNaissance, Gendre)
            // L'étudiant existant ne peut modifier son identité QUE SI :
            // 1. Sa dernière demande a été rejetée par la scolarité (correction de fautes de frappe autorisée)
            let canEditIdentity = false;
            
            if (demande && (demande.statut === 'REJETE_SCOLARITE' || demande.statut === 'REJET_SCOLARITE')) {
               canEditIdentity = true;
            }

            const personalGroup = this.inscriptionForm.get('personalInfo');
            if (personalGroup) {
              ['nom', 'prenom', 'dateNaissance', 'gendre'].forEach(field => {
                if (canEditIdentity) {
                  personalGroup.get(field)?.enable({ emitEvent: false });
                } else {
                  personalGroup.get(field)?.disable({ emitEvent: false });
                }
              });
            }

            this.cdr.detectChanges();
          }, 0);
        });
      }
    }, 0);
  }

  private prefillFromStudent(s: Student): void {
    const pi = this.inscriptionForm.get('personalInfo');
    if (!pi) return;
    const opts = { emitEvent: false };
    if (s.nom) pi.get('nom')?.setValue(s.nom, opts);
    if (s.prenom) pi.get('prenom')?.setValue(s.prenom, opts);
    if (s.email) pi.get('email')?.setValue(s.email, opts);
    if (s.phone) {
      // Récupérer l'indicatif exact du pays sélectionné
      const paysId = pi.get('pays')?.value;
      const country = this.countries.find(c => c.id == paysId);
      const countryIndicatif = country?.indicatif ?? '';

      if (countryIndicatif && s.phone.startsWith(countryIndicatif)) {
        pi.get('indicatif')?.setValue(countryIndicatif, opts);
        pi.get('phone')?.setValue(s.phone.slice(countryIndicatif.length), opts);
      } else {
        const match = s.phone.match(/^(\+\d{1,4})(.+)$/);
        if (match) {
          pi.get('indicatif')?.setValue(match[1], opts);
          pi.get('phone')?.setValue(match[2], opts);
        } else {
          if (countryIndicatif) pi.get('indicatif')?.setValue(countryIndicatif, opts);
          pi.get('phone')?.setValue(s.phone, opts);
        }
      }
    }
    if (s.gendre) pi.get('gendre')?.setValue(s.gendre, opts);
    if (s.dateNaissance) pi.get('dateNaissance')?.setValue(s.dateNaissance, opts);
    if (s.numCarteIdentite) pi.get('cin')?.setValue(s.numCarteIdentite, opts);
    if (s.numPassport) pi.get('numPassport')?.setValue(s.numPassport, opts);
    if ((s as any).dernierDiplome) pi.get('dernierDiplome')?.setValue((s as any).dernierDiplome, opts);
    if ((s as any).anneeDernierDiplome) pi.get('anneeDernierDiplome')?.setValue((s as any).anneeDernierDiplome, opts);
    if (s.typeBac) pi.get('typeBac')?.setValue(s.typeBac, opts);

    // ✅ Si c'est un BAC, on garde la session pour la validation de l'année
    if ((s as any).dernierDiplome === 'BACCALAUREAT') {
      this.sessionBac = (s as any).anneeDernierDiplome;
    }

    // ✅ Candidat existant : Verrouiller l'identité, mais laisser le diplôme modifiable si session ancienne
    const fieldsToLockAlways = ['nom', 'prenom', 'dateNaissance', 'gendre', 'cin', 'numPassport', 'typeBac'];
    fieldsToLockAlways.forEach(field => {
      pi.get(field)?.disable({ emitEvent: false });
      pi.get(field)?.markAsUntouched();
      pi.get(field)?.markAsPristine();
    });

    // 🎓 Gestion intelligente du cursus
    const diplomeFields = ['dernierDiplome', 'anneeDernierDiplome'];
    if (this.isRecentDemande) {
      diplomeFields.forEach(f => pi.get(f)?.disable({ emitEvent: false }));
    } else {
      diplomeFields.forEach(f => pi.get(f)?.enable({ emitEvent: false }));
    }
  }
  private checkScanExpiry(): void {
    let expired = false;
    if (this.cinStamped && !this.isFresh(this.cinStamped)) {
      this.cinStamped = null;
      this.idCheckDone = false;
      expired = true;
    }
    if (this.bacDiplomeStamped && !this.isFresh(this.bacDiplomeStamped)) {
      this.bacDiplomeStamped = null;
      this.verifyMatch = null;
      expired = true;
    }
    if (this.bacReleveStamped && !this.isFresh(this.bacReleveStamped)) {
      this.bacReleveStamped = null;
      this.verifyMatch = null;
      expired = true;
    }
    if (expired) {
      this.alertService.warning('Vos scans ont expiré (15 min). Veuillez rescanner vos documents.');
      this.cdr.detectChanges();
    }
  }
  resetStudentState(): void {
    this.studentMode = 'unknown';
    this.idCheckDone = false;
    this.existingStudent = null;
    this.initialExistingEmail = null;
    this.existingDemande = null;
    this.existingDemandes = [];
    this.existingDocStatuses = [];
    this.duplicateDiplomeBlocked = false;
    this.duplicateDiplomeMessage = '';
    this.cinStamped = null;
    this.bacDiplomeStamped = null;
    this.bacReleveStamped = null;
    this.verifyMatch = null;
    this.verifyReason = '';
    this.cinExtracted = false;
    this.cinExtractedValue = '';
    this.showCinManual = false;
    if (this.nationalityMode === 'foreign') {
      this.selectedFiles.delete(TypeDocument.CARTE_IDENTITE);
      this.selectedFiles.delete(TypeDocument.DIPLOME_BAC);
      this.selectedFiles.delete(TypeDocument.RELEVE_NOTES_BAC);
      this.selectedFiles.delete(TypeDocument.DIPLOME_MASTER);
      this.selectedFiles.delete(TypeDocument.DIPLOME_INGENIEUR as any);
      this.selectedFiles.delete(TypeDocument.DIPLOME_PREPARATOIRE as any);
      this.selectedFiles.delete(TypeDocument.RELEVE_NOTES_LICENCE as any);
      this.selectedFiles.delete(TypeDocument.RELEVE_NOTES_MASTER as any);
      this.selectedFiles.delete(TypeDocument.RELEVE_NOTES_INGENIEUR as any);
      this.selectedFiles.delete(TypeDocument.RELEVE_NOTES_PREPARATOIRE as any);
    }
    this.sessionBac = null;
    // Réactiver tous les champs
    ['nom', 'prenom', 'dateNaissance', 'gendre', 'cin', 'numPassport', 'typeBac', 'dernierDiplome', 'anneeDernierDiplome'].forEach(f =>
      this.inscriptionForm.get(`personalInfo.${f}`)?.enable()
    );
    this.editMode = false;
    this.coherenceChecked = false;
    this.coordonneesValidated = false;
    this.cursusValidated = false;
    this.isPersonalLocked = false;
  }

  unlockPersonalInfo(): void {
    this.isPersonalLocked = false;
    const pi = this.inscriptionForm.get('personalInfo');
    if (!pi) return;

    ['nom', 'prenom', 'dateNaissance', 'gendre'].forEach(field => {
      pi.get(field)?.enable();
    });
    this.cdr.detectChanges();
  }

  // ════════════════════════════════════════════════════════════════════════
  // HANDLERS OCR SCANNERS
  // ════════════════════════════════════════════════════════════════════════
  // ── Propriété ──────────────────────────────────────
  isVerifying = false;
  showSkeleton = false;
  isIdentificationConfirmed = false;

  // ── Méthodes Intelligence ──────────────────────────
  autoFormatName(field: string): void {
    const control = this.personalInfo.get(field);
    if (!control || !control.value) return;

    let value = control.value.trim();
    if (field === 'nom') {
      value = value.toUpperCase();
    } else if (field === 'prenom') {
      value = value.split(' ').map((word: string) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    }
    control.setValue(value, { emitEvent: false });
  }

  triggerConfetti(): void {
    if ((window as any).confetti) {
      (window as any).confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#2563eb', '#3b82f6', '#10b981', '#ffffff']
      });
    }
  }

  // ── Méthode principale ─────────────────────────────
  verifyAndFillForm(): void {
    // Il faut le CIN pour vérifier
    if (!this.cinData) return;

    // Si aucun OCR BAC n'a réussi mais que l'utilisateur clique, on ne peut pas "vérifier" au sens strict
    // Mais ce bouton ne devrait être cliquable que si au moins un des deux OCR a réussi.
    if (!this.bacDiplomeData && !this.bacReleveData) return;

    this.isVerifying = true;
    this.showSkeleton = true;
    this.verifyMatch = null;
    this.verifyReason = '';

    // Simuler délai de vérification "intelligent"
    setTimeout(() => {
      this.tryVerify(); // lance la vérification croisée partielle ou totale

      if (this.verifyMatch === true) {
        this.fillFormFromDocs(); // remplit le formulaire
        this.isIdentificationConfirmed = true;
      }

      this.showSkeleton = false;
      this.isVerifying = false;
      this.cdr.detectChanges();
    }, 1800);
  }

  // ── Handler pour remplissage manuel forcé depuis CIN ──
  fillFromCinOnlyIfScansFailed(): void {
    if (!this.cinData) {
      this.alertService.warning("Données CIN non disponibles.");
      return;
    }
    if (this.bacDiplomeData || this.bacReleveData) {
      this.alertService.info("Les scans BAC ont réussi, utilisez le bouton de vérification classique.");
      return;
    }
    if (!this.selectedFiles.has(TypeDocument.DIPLOME_BAC) || !this.selectedFiles.has(TypeDocument.RELEVE_NOTES_BAC)) {
      this.alertService.error('Veuillez uploader votre Diplôme et Relevé de notes BAC avant de continuer.');
      return;
    }

    // ✅ verifyMatch reste null → les documents seront uploadés mais PAS auto-validés
    // car bacDiplomeData et bacReleveData sont null (scans échoués)
    this.verifyReason = 'Identité remplie via CIN (scans BAC illisibles — validation manuelle requise)';
    this.fillFormFromDocs();
    this.isIdentificationConfirmed = true;
    this.alertService.success('Formulaire rempli depuis la CIN. Les documents BAC seront vérifiés manuellement.');
  }

  // ── Mappage Spécialité → Valeur Formulaire ────────
  private mapSpecialtyToBacType(spec: string): string {
    if (!spec) return '';
    const s = spec.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    if (s.includes('math')) return 'MATHEMATIQUES';           // ✅ "Mathématiques" → "MATHEMATIQUES"
    if (s.includes('experiment')) return 'SCIENCES_EXPERIMENTALES';
    if (s.includes('technique')) return 'TECHNIQUE';
    if (s.includes('econo') || s.includes('gest')) return 'ECONOMIE_GESTION';
    if (s.includes('informatique')) return 'SCIENCES_INFORMATIQUE';
    if (s.includes('lettre')) return 'LETTRES';
    if (s.includes('sport')) return 'SPORT';
    return 'AUTRE';
  }

  // ── Remplissage formulaire depuis les 3 docs ───────
  private fillFormFromDocs(): void {
    const pi = this.inscriptionForm.get('personalInfo');
    if (!pi) return;

    // Priorité : CIN pour identité (le plus fiable)
    if (this.cinData) {
      if (this.cinData.nom) pi.get('nom')?.setValue(this.cinData.nom);
      if (this.cinData.prenom) pi.get('prenom')?.setValue(this.cinData.prenom);
      if (this.cinData.dateNaissance) pi.get('dateNaissance')?.setValue(this.cinData.dateNaissance);
      if (this.cinData.genre) this.setGender(this.cinData.genre as 'HOMME' | 'FEMME');
      if (this.cinData.adresse) pi.get('adresse')?.setValue(this.cinData.adresse);
      if (this.cinData.numeroCin) pi.get('cin')?.setValue(this.cinData.numeroCin);
    }

    // BAC diplôme → session + spécialité
    if (this.bacDiplomeData) {
      if (this.bacDiplomeData.lieuNaissance && !pi.get('adresse')?.value)
        pi.get('adresse')?.setValue(this.bacDiplomeData.lieuNaissance);
      this.applySessionBac(
        (this.bacDiplomeData as any).session ?? (this.bacDiplomeData as any).annee,
        pi
      );
      if (this.bacDiplomeData.specialite) {
        const mapped = this.mapSpecialtyToBacType(this.bacDiplomeData.specialite);
        pi.get('typeBac')?.setValue(mapped);
        if (mapped) {
          pi.get('typeBac')?.disable({ emitEvent: false });
          this.scanTypeBacLocked = true;
        }
      }
    }

    // BAC service → mention si disponible
    if (this.bacReleveData) {
      if (this.sessionBac === null) {
        this.applySessionBac(
          (this.bacReleveData as any).session ?? (this.bacReleveData as any).annee,
          pi
        );
      }
      const spec = this.bacReleveData.specialiteFr || (this.bacReleveData as any).specialite;
      if (spec) {
        const mapped = this.mapSpecialtyToBacType(spec);
        if (mapped && !this.scanTypeBacLocked) {
          pi.get('typeBac')?.setValue(mapped);
          pi.get('typeBac')?.disable({ emitEvent: false });
          this.scanTypeBacLocked = true;
        }
      }
    }

    // Marquer tous les champs comme touchés pour déclencher la validation
    ['nom', 'prenom', 'dateNaissance', 'cin', 'adresse'].forEach(field => {
      pi.get(field)?.markAsTouched();
      pi.get(field)?.updateValueAndValidity();
    });

    // ✅ Désactiver les champs provenant du CIN (pour éviter modification manuelle)
    // même pour les nouveaux étudiants pour garantir la fiabilité de la CIN
    ['nom', 'prenom', 'dateNaissance', 'gendre'].forEach(field => {
      pi.get(field)?.disable();
    });
    this.isPersonalLocked = true;

    this.cdr.detectChanges();
  }
  onCinScanned(result: OcrCinResult): void {
    if (!result.success) return;
    //this.cinData = result;
    this.cinStamped = { data: result, scannedAt: Date.now() };
    const pi = this.inscriptionForm.get('personalInfo');
    if (!pi) return;
    if (result.nom) { pi.get('nom')?.setValue(result.nom); pi.get('nom')?.markAsTouched(); }
    if (result.prenom) { pi.get('prenom')?.setValue(result.prenom); pi.get('prenom')?.markAsTouched(); }
    if (result.dateNaissance) { pi.get('dateNaissance')?.setValue(result.dateNaissance); pi.get('dateNaissance')?.markAsTouched(); }
    if (result.genre) this.setGender(result.genre as any);
    if (result.numeroCin) { pi.get('cin')?.setValue(result.numeroCin); pi.get('cin')?.markAsTouched(); }
    const tunisia = this.countries.find(c => c.nom?.toLowerCase().includes('tunis'));
    if (tunisia) pi.get('pays')?.setValue(tunisia.id);
    //this.tryVerify();
  }
  onBacScanned(result: BacResult): void {
    // Réinitialiser le verrou typeBac à chaque nouveau scan
    this.scanTypeBacLocked = false;
    const pi = this.inscriptionForm.get('personalInfo');
    pi?.get('typeBac')?.enable({ emitEvent: false });

    // ✅ TOUJOURS stocker le fichier (scan réussi ou non)
    if ((result as any).file) {
      this.selectedFiles.set(TypeDocument.DIPLOME_BAC, (result as any).file);
    }

    // Effacer les anciennes données si scan échoue
    if (!result.success) {
      this.bacDiplomeStamped = null; // ✅ reset ancien scan
      this.verifyMatch = null;
      this.verifyReason = '';
      return; // pas d'OCR data → upload SOUMIS
    }

    this.bacDiplomeStamped = { data: result, scannedAt: Date.now() };
    this.verifyMatch = null;
    this.verifyReason = '';
  }

  // onBacServiceScanned(result: BacServiceResult): void {
  onBacServiceScanned(result: BacServiceResult): void {
    // Réinitialiser le verrou typeBac à chaque nouveau scan (si pas déjà verrouillé par le scan du diplôme)
    if (!this.scanTypeBacLocked) {
      const pi = this.inscriptionForm.get('personalInfo');
      pi?.get('typeBac')?.enable({ emitEvent: false });
    }

    // ✅ TOUJOURS stocker le fichier
    if ((result as any).file) {
      this.selectedFiles.set(TypeDocument.RELEVE_NOTES_BAC, (result as any).file);
    }

    if (!result.success) {
      this.bacReleveStamped = null; // ✅ reset ancien scan
      this.verifyMatch = null;
      this.verifyReason = '';
      return; // pas d'OCR data → upload SOUMIS
    }

    this.bacReleveStamped = { data: result, scannedAt: Date.now() };
    this.verifyMatch = null;
    this.verifyReason = '';
  }

  /**
   * Applique la session BAC et force BACCALAUREAT si session < 2023.
   * Si session >= 2023 le candidat choisit librement.
   */
  private applySessionBac(rawSession: any, pi: any): void {
    if (!rawSession) return;
    const year = parseInt(String(rawSession), 10);
    if (isNaN(year)) return;
    this.sessionBac = year;

    const diplomeCtrl = pi.get('dernierDiplome');
    const anneeCtrl = pi.get('anneeDernierDiplome');

    if (this.isBacForced) {
      // Cas où on force BACCALAUREAT (Bac très récent)
      diplomeCtrl?.setValue('BACCALAUREAT', { emitEvent: false });
      diplomeCtrl?.disable({ emitEvent: false });

      anneeCtrl?.setValue(year, { emitEvent: false });
      anneeCtrl?.disable({ emitEvent: false });
      anneeCtrl?.clearValidators();
    } else {
      // Cas où le candidat peut choisir (Bac ancien)
      // On ne désactive QUE si on est en mode "RecentDemande" (déjà géré par prefill)
      if (!this.isRecentDemande) {
        diplomeCtrl?.enable({ emitEvent: false });
        anneeCtrl?.enable({ emitEvent: false });
      }

      if (diplomeCtrl?.value === 'BACCALAUREAT') {
        anneeCtrl?.setValue(year, { emitEvent: false });
      }
    }
    anneeCtrl?.updateValueAndValidity({ emitEvent: false });
    this.cdr.detectChanges();
  }

  onBulletinScanned(result: BulletinResult): void {
    if (result.errorMessage) return;
    const pi = this.inscriptionForm.get('personalInfo');
    if (!pi) return;
    if (result.nomPrenom) {
      const parts = result.nomPrenom.trim().split(/\s+/);
      if (parts.length >= 2) {
        pi.get('nom')?.setValue(parts[0]);
        pi.get('prenom')?.setValue(parts.slice(1).join(' '));
      } else {
        pi.get('nom')?.setValue(result.nomPrenom);
      }
      pi.get('nom')?.markAsTouched(); pi.get('prenom')?.markAsTouched();
    }
    if (result.dateNaissance) { pi.get('dateNaissance')?.setValue(result.dateNaissance); pi.get('dateNaissance')?.markAsTouched(); }
    if (result.numeroCin) { this.setIdType('cin'); pi.get('cin')?.setValue(result.numeroCin); pi.get('cin')?.markAsTouched(); }
    const tunisia = this.countries.find(c => c.nom?.toLowerCase().includes('tunis'));
    if (tunisia) pi.get('pays')?.setValue(tunisia.id);
    //this.bacReleveData = { success: true, nomComplet: result.nomPrenom, dateNaissance: result.dateNaissance } as any;
    this.bacReleveStamped = {
      data: { success: true, nomComplet: result.nomPrenom, dateNaissance: result.dateNaissance } as any,
      scannedAt: Date.now()
    };
    this.tryVerify();
  }

  onSuperiorBulletinScanned(result: BulletinResult): void {
    if (result.errorMessage) return;
    const pi = this.inscriptionForm.get('personalInfo');
    if (!pi) return;
    if (!pi.get('nom')?.value && result.nomPrenom) {
      const parts = result.nomPrenom.trim().split(/\s+/);
      if (parts.length >= 2) {
        pi.get('nom')?.setValue(parts[0], { emitEvent: false });
        pi.get('prenom')?.setValue(parts.slice(1).join(' '), { emitEvent: false });
      } else {
        pi.get('nom')?.setValue(result.nomPrenom, { emitEvent: false });
      }
    }
    this.cdr.detectChanges();
  }

  // ════════════════════════════════════════════════════════════════════════
  // VÉRIFICATION CROISÉE DOCUMENTS
  // ════════════════════════════════════════════════════════════════════════
  private tryVerify(): void {
    try {
      const normalizeText = (text: any): string => {
        if (!text) return '';
        return String(text)
          .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // Suppression des accents + Kashida (ـ)
          .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
          .replace(/\s+/g, ' ').trim();
      };
      const normalizeDate = (d: any): string => {
        const s = String(d ?? '').replace(/\D/g, '');
        if (s.length !== 8) return s;
        if (s.startsWith('19') || s.startsWith('20')) return s;
        return s.substring(4, 8) + s.substring(2, 4) + s.substring(0, 2);
      };
      const compareNames = (n1Raw: string, n2Raw: string): boolean => {
        const n1 = normalizeText(n1Raw); const n2 = normalizeText(n2Raw);
        if (!n1 || !n2) return true;
        if (n1 === n2) return true;

        // ignorance des espaces pour les hallucinations OCR (ex: "الخر اط" vs "الخراط")
        if (n1.replace(/\s+/g, '') === n2.replace(/\s+/g, '')) return true;

        const t1 = new Set(n1.split(' ').filter(Boolean));
        const t2 = new Set(n2.split(' ').filter(Boolean));
        return [...t1].every(t => t2.has(t)) || [...t2].every(t => t1.has(t));
      };

      const sources: any[] = [];
      if (this.cinData) sources.push({ type: 'CIN', nomPrenom: `${this.cinData.prenom ?? ''} ${this.cinData.nom ?? ''}`, date: normalizeDate(this.cinData.dateNaissance) });
      if (this.bacDiplomeData) sources.push({ type: 'Bac Scanner', nomPrenom: `${this.bacDiplomeData.prenom ?? ''} ${this.bacDiplomeData.nom ?? ''}`, date: normalizeDate(this.bacDiplomeData.dateNaissance), numDossier: String(this.bacDiplomeData.numDossier ?? '').trim() });
      if (this.bacReleveData) sources.push({ type: 'Bac Scanner Service', nomPrenom: (this.bacReleveData as any).nomPrenom ?? this.bacReleveData.nomComplet, date: normalizeDate(this.bacReleveData.dateNaissance), numDossier: String(this.bacReleveData.numDossier ?? '').trim() });

      // Il faut au moins la CIN + 1 des deux (Diplôme ou Relevé)
      if (sources.length < 2) return;

      let allMatch = true; let reason = 'Tous les documents correspondent parfaitement';
      outer: for (let i = 0; i < sources.length; i++) {
        for (let j = i + 1; j < sources.length; j++) {
          const s1 = sources[i]; const s2 = sources[j];
          if (!compareNames(s1.nomPrenom, s2.nomPrenom)) { allMatch = false; reason = `Noms discordants entre ${s1.type} et ${s2.type}`; break outer; }
          if (s1.date && s2.date && s1.date !== s2.date) { allMatch = false; reason = `Dates de naissance discordantes entre ${s1.type} et ${s2.type}`; break outer; }
          if (s1.numDossier && s2.numDossier && s1.numDossier !== s2.numDossier) { allMatch = false; reason = `N° de dossier discordants entre ${s1.type} et ${s2.type}`; break outer; }
        }
      }
      this.verifyMatch = allMatch; this.verifyReason = reason;
    } catch (err) {
      this.verifyMatch = false; this.verifyReason = 'Erreur technique lors de la vérification';
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // FORM HELPERS
  // ════════════════════════════════════════════════════════════════════════
  get isCurrentStepValid(): boolean {
    const pi = this.personalInfo;
    const ai = this.academicInfo;

    // ── STEP 1 : IDENTIFICATION ──────────────────────────────────────────
    if (this.currentStep === 1) {
      // Pays sélectionné
      if (this.nationalityMode === null) return false;
      // Le candidat DOIT avoir terminé l'étape d'identification (scan ou vérification)
      if (this.studentMode === 'unknown') return false;
      
      // Pour les nouveaux, le scanner est obligatoire pour passer à l'étape suivante
      if (this.studentMode === 'new' && !this.idCheckDone) return false;
      // Il faut avoir terminé la vérification croisée (uniquement tunisiens)
      if (this.studentMode === 'new' && this.nationalityMode === 'tunisian' && !this.isIdentificationConfirmed) return false;
      
      // Pour les Tunisiens, le type de pièce d'identité doit être choisi
      if (this.nationalityMode === 'tunisian' && !this.idType) return false;
      // Pour les étrangers, le numéro de passeport est requis dès l'étape 1
      if (this.nationalityMode === 'foreign') {
        const ppCtrl = pi.get('numPassport');
        if (!ppCtrl?.disabled && !ppCtrl?.value) return false;
        // La photo du passeport est requise pour les nouveaux ou si le document a été rejeté précédemment
        if (this.shouldUploadDocument('CARTE_IDENTITE') && !this.selectedFiles.has(TypeDocument.CARTE_IDENTITE)) return false;
      }
      return true;
    }

    // ── STEP 2 : PROFIL & CONTACT ────────────────────────────────────────
    if (this.currentStep === 2) {
      if (pi.status === 'PENDING') return false;
      
      // Champs identité de base
      const champsProfil = ['nom', 'prenom', 'dateNaissance', 'gendre'];
      const profilFilled = champsProfil.every(f => {
        const c = pi.get(f);
        return c && c.value && (c.valid || c.disabled);
      });
      if (!profilFilled) return false;

      // Contact (Phone & Email)
      if (!pi.get('phone')?.value || pi.get('phone')?.invalid) return false;
      if (!pi.get('email')?.value || pi.get('email')?.invalid) return false;

      // OTP Verification
      const emailChanged = this.studentMode === 'existing' && this.existingStudent && pi.get('email')?.value !== this.initialExistingEmail;
      if (!this.emailVerified && (this.studentMode === 'new' || emailChanged)) return false;
      
      return true;
    }

    // ── STEP 3 : DOSSIER SCOLAIRE ────────────────────────────────────────
    if (this.currentStep === 3) {
      // Dernier diplôme et année
      const diplome = pi.get('dernierDiplome')?.value;
      if (!diplome) return false;
      const anneeCtrl = pi.get('anneeDernierDiplome');
      if (anneeCtrl && !anneeCtrl.disabled && (!anneeCtrl.value || anneeCtrl.invalid)) return false;

      // Fichiers BAC requis pour les nouveaux
      if (this.studentMode === 'new') {
        if (!this.selectedFiles.has(TypeDocument.DIPLOME_BAC)) return false;
        if (!this.selectedFiles.has(TypeDocument.RELEVE_NOTES_BAC)) return false;
      }

      // Fichiers supérieurs si applicable (nouveaux)
      if (this.studentMode === 'new' && this.needsSuperieurDocs) {
        const dipType = this.getDiplomeTypeFor(diplome);
        const relType = this.getReleveTypeFor(diplome);
        if (!this.selectedFiles.has(dipType as any)) return false;
        if (!this.selectedFiles.has(relType as any)) return false;
      }

      // Vérification des fichiers manquants/rejetés pour candidats existants
      if (this.studentMode === 'existing') {
        if (!this.isExistingDocsComplete) return false;
      }

      return true;
    }

    // ── STEP 4 : CHOIX DE FORMATION ──────────────────────────────────────
    if (this.currentStep === 4) {
      if (!ai.valid) return false;
      // Relevé de niveau précédent si niveau > 1
      if (this.needsNiveauReleve && !this.selectedFiles.has(TypeDocument.RELEVE_NOTES_NIVEAU)) return false;
      return true;
    }

    return false;
  }

  setIdType(type: 'cin' | 'passport'): void {
    this.idType = type;
    const cinCtrl = this.inscriptionForm.get('personalInfo.cin');
    const ppCtrl = this.inscriptionForm.get('personalInfo.numPassport');
    if (type === 'cin') {
      cinCtrl?.setValidators([Validators.required, Validators.pattern('^[0-9]{8}$')]);
      ppCtrl?.clearValidators(); ppCtrl?.reset();
    } else {
      ppCtrl?.setValidators([Validators.required]);
      cinCtrl?.clearValidators(); cinCtrl?.reset();
    }
    cinCtrl?.updateValueAndValidity(); ppCtrl?.updateValueAndValidity();
  }

  setGender(gendre: 'HOMME' | 'FEMME'): void {
    this.inscriptionForm.get('personalInfo.gendre')?.setValue(gendre);
  }

  getControl(group: string, name: string) { return this.inscriptionForm.get(`${group}.${name}`); }

  isFieldValid(group: string, name: string): boolean {
    const c = this.getControl(group, name);
    if (!c) return false;
    // Un champ désactivé et rempli est considéré comme "valide" visuellement
    if (c.disabled) return !!c.value;
    return !!(c.valid && c.value);
  }

  getFieldError(group: string, name: string): string | null {
    const c = this.getControl(group, name);
    if (!c || !c.touched || c.valid || c.disabled) return null;
    if (c.hasError('required')) return 'Ce champ est obligatoire';
    if (c.hasError('email')) return 'Email invalide';
    if (c.hasError('pattern')) return 'Format invalide';
    if (c.hasError('min')) {
      const min = c.getError('min')?.min;
      return `L'année doit être ≥ ${min}`;
    }
    if (c.hasError('max')) {
      const max = c.getError('max')?.max;
      return `L'année ne peut pas dépasser ${max}`;
    }
    if (c.hasError('tooYoung')) {
      const paysId = this.inscriptionForm.get('personalInfo.pays')?.value;
      const country = this.countries.find(c => c.id == paysId);
      const minAge = this.getMinAge(country?.nom);
      return `Âge minimum requis : ${minAge} ans`;
    }
    if (c.hasError('invalidPhone')) return 'Numéro de téléphone invalide';
    if (c.hasError('countryMismatch')) return 'Le numéro ne correspond pas au pays';
    if (c.hasError('passportFormat')) return 'Format de passeport invalide pour ce pays';
    return 'Champ invalide';
  }
  onDiplomeResponsableChange(nomDiplome: string): void {
    const selected = this.diplomesResponsables.find(d => d.nomDiplome === nomDiplome);
    if (selected) {
      this.availableLangues = selected.langues;
      this.levels = [];
      this.inscriptionForm.get('academicInfo.niveauVise')?.setValue('');
      if (this.availableLangues.length === 1) {
        this.inscriptionForm.get('academicInfo.langueVise')?.setValue(this.availableLangues[0]);
      } else {
        this.inscriptionForm.get('academicInfo.langueVise')?.setValue('');
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // DATA LOADING
  // ════════════════════════════════════════════════════════════════════════
  loadInitialData(annee?: string): void {
    this.countryService.getCountriesWithIndicatifs().subscribe(data => {
      this.countries = data;
      this.filteredCountries = data; // Initialisation
    });

    // On passe l'année au service pour n'avoir que les formations de la session en cours
    this.diplomaService.getDiplomas().subscribe(data => { this.diplomas = data; });

    forkJoin({
      types: this.diplomaService.getTypes(),
      responsables: this.diplomaService.getDiplomesResponsables(annee)
    }).subscribe(({ types, responsables }) => {
      this.diplomesResponsables = responsables;
      // On filtre les types pour ne garder que ceux qui ont des diplômes ouverts cette année
      const typesWithDiplomas = new Set(responsables.filter(r => r.typeNom).map(r => r.typeNom));
      this.typesDiplome = types.filter(t => typesWithDiplomas.has(t.nom));
    });
  }

  // ── Searchable Country Dropdown logic ──────────────────────────────────────
  toggleCountryDropdown(): void {
    this.showCountryDropdown = !this.showCountryDropdown;
    if (this.showCountryDropdown) {
      this.countrySearch = '';
      this.filteredCountries = [...this.countries];
    }
  }

  filterCountries(query: string): void {
    this.countrySearch = query;
    if (!query) {
      this.filteredCountries = [...this.countries];
      return;
    }
    const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    this.filteredCountries = this.countries.filter(c =>
      c.nom?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q) ||
      c.indicatif?.includes(q)
    );
  }

  selectCountry(country: Country): void {
    this.inscriptionForm.get('personalInfo.pays')?.setValue(country.id);
    this.showCountryDropdown = false;
    this.countrySearch = country.nom || '';
  }

  getSelectedCountryName(): string {
    const id = this.inscriptionForm.get('personalInfo.pays')?.value;
    const country = this.countries.find(c => c.id == id);
    return country?.nom || '';
  }

  getSelectedCountryIndicatif(): string {
    const id = this.inscriptionForm.get('personalInfo.pays')?.value;
    const country = this.countries.find(c => c.id == id);
    return country?.indicatif || '';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.premium-select-wrap')) {
      this.showCountryDropdown = false;
    }
  }

  getCountryFlag(nom: string, indicatif?: string): string {
    const nameMap: Record<string, string> = {
      // Europe
      'Andorre': 'ad', 'Andorra': 'ad', 'Albanie': 'al', 'Autriche': 'at', 'Belgique': 'be', 'Belgium': 'be',
      'Bulgarie': 'bg', 'Biélorussie': 'by', 'Suisse': 'ch', 'Switzerland': 'ch', 'Chypre': 'cy',
      'République Tchèque': 'cz', 'Allemagne': 'de', 'Germany': 'de', 'Danemark': 'dk', 'Estonie': 'ee',
      'Espagne': 'es', 'Spain': 'es', 'Finlande': 'fi', 'France': 'fr', 'Royaume-Uni': 'gb', 'UK': 'gb',
      'Grèce': 'gr', 'Croatie': 'hr', 'Hongrie': 'hu', 'Irlande': 'ie', 'Islande': 'is', 'Italie': 'it',
      'Italy': 'it', 'Liechtenstein': 'li', 'Lituanie': 'lt', 'Luxembourg': 'lu', 'Lettonie': 'lv',
      'Monaco': 'mc', 'Moldavie': 'md', 'Monténégro': 'me', 'Macédoine': 'mk', 'Malte': 'mt',
      'Pays-Bas': 'nl', 'Netherlands': 'nl', 'Norvège': 'no', 'Pologne': 'pl', 'Portugal': 'pt',
      'Roumanie': 'ro', 'Serbie': 'rs', 'Russie': 'ru', 'Russia': 'ru', 'Suède': 'se', 'Slovénie': 'si',
      'Slovaquie': 'sk', 'Saint-Marin': 'sm', 'Turquie': 'tr', 'Ukraine': 'ua', 'Vatican': 'va',

      // Afrique (Expanded)
      'Tunisie': 'tn', 'Tunisia': 'tn', 'Maroc': 'ma', 'Morocco': 'ma', 'Algérie': 'dz', 'Algeria': 'dz',
      'Libye': 'ly', 'Égypte': 'eg', 'Sénégal': 'sn', 'Senegal': 'sn', 'Mali': 'ml', 'Niger': 'ne',
      'Tchad': 'td', 'Soudan': 'sd', 'Éthiopie': 'et', 'Somalie': 'so', 'Djibouti': 'dj', 'Kenya': 'ke',
      'Ouganda': 'ug', 'Rwanda': 'rw', 'Burundi': 'bi', 'Tanzanie': 'tz', 'Malawi': 'mw', 'Zambie': 'zm',
      'Zimbabwe': 'zw', 'Mozambique': 'mz', 'Afrique du Sud': 'za', 'Namibie': 'na', 'Botswana': 'bw',
      'Angola': 'ao', 'Gabon': 'ga', 'Congo': 'cg', 'Cameroun': 'cm', 'Nigéria': 'ng', 'Bénin': 'bj',
      'Togo': 'tg', 'Ghana': 'gh', 'Côte d\'Ivoire': 'ci', 'Libéria': 'lr', 'Sierra Leone': 'sl',
      'Guinée': 'gn', 'Guinée-Bissau': 'gw', 'Gambie': 'gm', 'Mauritanie': 'mr', 'Érythrée': 'er',

      // Moyen-Orient & Asie
      'Émirats Arabes Unis': 'ae', 'United Arab Emirates': 'ae', 'Afghanistan': 'af', 'Arménie': 'am',
      'Azerbaïdjan': 'az', 'Bahreïn': 'bh', 'Bangladesh': 'bd', 'Bhoutan': 'bt', 'Brunei': 'bn',
      'Cambodge': 'kh', 'Chine': 'cn', 'China': 'cn', 'Géorgie': 'ge', 'Inde': 'in', 'India': 'in',
      'Indonésie': 'id', 'Iran': 'ir', 'Iraq': 'iq', 'Israël': 'il', 'Japon': 'jp', 'Japan': 'jp',
      'Jordanie': 'jo', 'Kazakhstan': 'kz', 'Koweït': 'kw', 'Kirghizistan': 'kg', 'Laos': 'la',
      'Liban': 'lb', 'Malaisie': 'my', 'Maldives': 'mv', 'Mongolie': 'mn', 'Népal': 'np', 'Oman': 'om',
      'Pakistan': 'pk', 'Palestine': 'ps', 'Philippines': 'ph', 'Qatar': 'qa', 'Arabie Saoudite': 'sa',
      'Singapour': 'sg', 'Corée du Sud': 'kr', 'Sri Lanka': 'lk', 'Syrie': 'sy', 'Taïwan': 'tw',
      'Thaïlande': 'th', 'Turkménistan': 'tm', 'Ouzbékistan': 'uz', 'Viêt Nam': 'vn', 'Yémen': 'ye',

      // Amériques
      'Canada': 'ca', 'États-Unis': 'us', 'USA': 'us', 'Mexique': 'mx', 'Mexicio': 'mx',
      'Argentine': 'ar', 'Bolivie': 'bo', 'Brésil': 'br', 'Chili': 'cl', 'Colombie': 'co',
      'Costa Rica': 'cr', 'Cuba': 'cu', 'Équateur': 'ec', 'Guatemala': 'gt', 'Haïti': 'ht',
      'Honduras': 'hn', 'Jamaïque': 'jm', 'Nicaragua': 'ni', 'Panama': 'pa', 'Paraguay': 'py',
      'Pérou': 'pe', 'Porto Rico': 'pr', 'Uruguay': 'uy', 'Venezuela': 've',
      'Antigua-et-Barbuda': 'ag', 'Bahamas': 'bs', 'Barbade': 'bb', 'Belize': 'bz',

      // Océanie
      'Australie': 'au', 'Australia': 'au', 'Nouvelle-Zélande': 'nz', 'Fidji': 'fj'
    };

    // Fallback via indicatif pour les cas non mappés par nom
    const indicatifMap: Record<string, string> = {
      '+376': 'ad', '+971': 'ae', '+93': 'af', '+1-268': 'ag', '+1268': 'ag',
      '+216': 'tn', '+33': 'fr', '+212': 'ma', '+213': 'dz', '+221': 'sn',
      '+237': 'cm', '+225': 'ci', '+223': 'ml', '+241': 'ga', '+242': 'cg',
      '+224': 'gn', '+222': 'mr', '+229': 'bj', '+228': 'tg', '+226': 'bf',
      '+227': 'ne', '+235': 'td', '+236': 'cf', '+253': 'dj', '+269': 'km',
      '+261': 'mg', '+1': 'us', '+44': '+gb', '+39': 'it', '+34': 'es',
      '+49': 'de', '+41': 'ch', '+32': 'be', '+43': 'at', '+352': 'lu'
    };

    const cleanName = nom?.trim();
    let code = nameMap[cleanName];

    if (!code && indicatif) {
      const cleanInd = indicatif.replace(/\s/g, '');
      code = indicatifMap[cleanInd] || indicatifMap[cleanInd.split('-')[0]];
    }

    if (!code) {
      // Tentative de recherche partielle si le nom exact échoue
      const entry = Object.entries(nameMap).find(([k]) => cleanName?.includes(k) || k.includes(cleanName));
      code = entry ? entry[1] : 'un';
    }

    return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
  }

  onTypeChange(typeName: string): void {
    this.inscriptionForm.get('academicInfo.diplomeVise')?.setValue('');
    this.inscriptionForm.get('academicInfo.langueVise')?.setValue('');
    this.inscriptionForm.get('academicInfo.niveauVise')?.setValue('');
    this.availableLangues = []; this.levels = [];
    if (!typeName) { this.filteredDiplomesResponsables = []; return; }
    this.filteredDiplomesResponsables = this.diplomesResponsables.filter(dr => dr.typeNom === typeName);
  }

  // ════════════════════════════════════════════════════════════════════════
  // NAVIGATION
  // ════════════════════════════════════════════════════════════════════════

  onFileChange(file: File | null, type: string): void {
    if (file) this.selectedFiles.set(type, file);
    else this.selectedFiles.delete(type);
  }

  // ════════════════════════════════════════════════════════════════════════
  // SUBMIT
  // ════════════════════════════════════════════════════════════════════════
  onSubmit(): void {
    if (this.currentStep === 4) {
      if (this.isCurrentStepValid) {
        this.submitAll();
      } else {
        this.markFormGroupTouched(this.academicInfo);
        this.alertService.warning('Veuillez remplir correctement tous les champs obligatoires.');
      }
    } else {
      if (this.isCurrentStepValid) {
        this.nextStep();
      } else {
        this.alertService.warning('Veuillez vérifier les informations saisies avant de continuer.');
      }
    }
  }

  private submitAll(): void {
    if (this.duplicateDiplomeBlocked) {
      this.alertService.error(this.duplicateDiplomeMessage);
      return;
    }

    this.isSubmitting = true;
    this.triggerConfetti();
    const fv = this.inscriptionForm.getRawValue();

    // Étudiant existant → Mise à jour Email/Phone/Diplôme puis soumission
    if (this.studentMode === 'existing' && this.existingStudent?.id) {
      const updateData: Partial<Student> = {
        nom: fv.personalInfo.nom,
        prenom: fv.personalInfo.prenom,
        gendre: fv.personalInfo.gendre,
        dateNaissance: fv.personalInfo.dateNaissance,
        email: fv.personalInfo.email,
        phone: fv.personalInfo.indicatif + fv.personalInfo.phone,
        dernierDiplome: fv.personalInfo.dernierDiplome,
        anneeDernierDiplome: Number(fv.personalInfo.anneeDernierDiplome)
      };

      this.studentService.updateStudentProfile(this.existingStudent.id, updateData).pipe(
        catchError((err) => {
          console.error('Erreur lors de la mise à jour du profil:', err);
          return of(this.existingStudent);
        })
      ).subscribe(() => {
        this.submitDemande(this.existingStudent!.id!, fv);
      });
      return;
    }

    // Nouvel étudiant → créer directement
    const studentData: Student = {
      nom: fv.personalInfo.nom,
      prenom: fv.personalInfo.prenom,
      email: fv.personalInfo.email,
      phone: fv.personalInfo.indicatif + fv.personalInfo.phone,
      gendre: fv.personalInfo.gendre,
      dateNaissance: fv.personalInfo.dateNaissance,
      dernierDiplome: fv.personalInfo.dernierDiplome,
      anneeDernierDiplome: fv.personalInfo.anneeDernierDiplome ? Number(fv.personalInfo.anneeDernierDiplome) : new Date().getFullYear(),
      paysId: Number(fv.personalInfo.pays),
      numCarteIdentite: fv.personalInfo.cin || this.cinData?.numeroCin || undefined,
      numPassport: fv.personalInfo.numPassport || undefined,
      typeBac: fv.personalInfo.typeBac || undefined,
    };

    this.studentService.createStudent(studentData).pipe(
      catchError(() => {
        this.isSubmitting = false;
        this.alertService.error('Erreur lors de la création du compte.');
        return of(null);
      })
    ).subscribe(savedStudent => {
      if (!savedStudent) return;
      this.submitDemande(savedStudent.id!, fv);
    });
  }

  private submitDemande(studentId: number, fv: any, filesToUpload?: Map<string, File>): void {
    let files = filesToUpload ?? this.selectedFiles;

    if (this.studentMode === 'existing') {
      const filteredFiles = new Map<string, File>();
      for (const [type, file] of files.entries()) {
        if (this.shouldUploadDocument(type)) filteredFiles.set(type, file);
      }
      files = filteredFiles;
    }

    const niveauChoisiVal = fv.academicInfo.niveauVise;
    const niveauObj = this.levels.find(n => String(n.niveau) === String(niveauChoisiVal));

    const demande: any = {
      etudiantId: studentId,
      niveauSpecifiqueId: niveauObj?.id ?? null,
      typeDeDiplome: fv.academicInfo.typeVise,
      dateCreation: new Date().toISOString(),
      dernierDiplomeSnapshot: fv.personalInfo.dernierDiplome,
      anneeDernierDiplomeSnapshot: fv.personalInfo.anneeDernierDiplome ? Number(fv.personalInfo.anneeDernierDiplome) : null
    };

    this.enrollmentService.postDemande(demande).pipe(
      switchMap((demandeSaved) => {
        const enrollmentId = demandeSaved.id;
        const uploads = Array.from(files.entries()).map(([type, file]) =>
          this.uploadWithAutoValidation(studentId, type, file, enrollmentId)
        );
        return uploads.length > 0 ? forkJoin(uploads).pipe(switchMap(() => of(enrollmentId))) : of(enrollmentId);
      }),
      switchMap((enrollmentId) => {
        return this.enrollmentService.startWorkflow(enrollmentId as number);
      })
    ).subscribe({
      next: () => {
        this.isSubmitting = false;
        localStorage.removeItem(this.DRAFT_KEY);
        this.alertService.success('Inscription réussie !');
        this.resetForm();
      },
      error: (err) => {
        this.isSubmitting = false;
        console.error('Erreur soumission:', err);
        this.alertService.error('Erreur lors de la soumission.');
      }
    });
  }


  // ════════════════════════════════════════════════════════════════════════
  // DRAFT / SAVE
  // ════════════════════════════════════════════════════════════════════════
  private autoSave(data: any): void {
    if (this.inscriptionForm.pristine) return;
    this.isSaving = true;
    localStorage.setItem(this.DRAFT_KEY, JSON.stringify({ data, savedAt: Date.now() }));
    this.startDraftExpiryTimer();
    setTimeout(() => { this.isSaving = false; }, 1000);
  }

  private restoreForm(): void {
    const saved = localStorage.getItem(this.DRAFT_KEY);
    if (!saved) return;
    const draft = JSON.parse(saved);
    if (draft.savedAt && (Date.now() - draft.savedAt) > this.DRAFT_MAX_AGE_MS) { localStorage.removeItem(this.DRAFT_KEY); return; }
    const data = draft.data || draft;
    this.inscriptionForm.patchValue(data, { emitEvent: false });
    if (data.academicInfo?.diplomeVise) this.onDiplomeResponsableChange(data.academicInfo.diplomeVise);
    if (data.personalInfo?.pays) {
      const country = this.countries.find(c => c.id == data.personalInfo.pays);
      if (country) this.inscriptionForm.get('personalInfo.indicatif')?.setValue(country.indicatif, { emitEvent: false });
    }
  }

  private startDraftExpiryTimer(): void {
    if (this.draftExpiryTimer) clearTimeout(this.draftExpiryTimer);
    const saved = localStorage.getItem(this.DRAFT_KEY);
    if (!saved) return;
    const draft = JSON.parse(saved);
    const elapsed = Date.now() - (draft.savedAt || Date.now());
    const remaining = this.DRAFT_MAX_AGE_MS - elapsed;
    if (remaining <= 0) { localStorage.removeItem(this.DRAFT_KEY); return; }
    this.draftExpiryTimer = setTimeout(() => { localStorage.removeItem(this.DRAFT_KEY); }, remaining);
  }

  private resetForm(): void {
    this.filteredDiplomesResponsables = []; this.availableLangues = []; this.levels = [];
    this.resetStudentState();
    this.nationalityMode = null;
    this.inscriptionForm.reset({
      personalInfo: { gendre: 'HOMME', indicatif: '+216' },
      academicInfo: { session: this.currentYearObj?.annee || '' }
    });
    this.selectedFiles.clear();
    this.currentStep = 1;
  }

  private markFormGroupTouched(fg: FormGroup) {
    Object.values(fg.controls).forEach(c => {
      if (c instanceof FormGroup) this.markFormGroupTouched(c);
      else c.markAsTouched();
    });
  }

  private ageValidator(minAge: number) {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      const birthDate = new Date(control.value);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const md = today.getMonth() - birthDate.getMonth();
      if (md < 0 || (md === 0 && today.getDate() < birthDate.getDate())) age--;
      return age >= minAge ? null : { tooYoung: true };
    };
  }
  phoneAsyncValidator(control: AbstractControl): any {
    const phone = control.value;
    const indicatif = this.inscriptionForm?.get('personalInfo.indicatif')?.value;
    if (!phone || !indicatif) return of(null);

    return this.phoneValidationService.validatePhoneNumber(indicatif + phone).pipe(
      map((r: any) => {
        if (!r.is_valid) return { invalidPhone: true };
        const cc = indicatif.replace('+', '');
        if (r.components.country_code.toString() !== cc) return { countryMismatch: true };
        return null;
      }),
      catchError(() => of(null)) // erreur réseau → on laisse passer
    );
  }

  getDiplomeTypeFor(diplome: string | null | undefined): TypeDocument {
    if (!diplome) return TypeDocument.DIPLOME_BAC;
    const d = diplome.toUpperCase();
    if (d === 'BACCALAUREAT') return TypeDocument.DIPLOME_BAC;
    if (d === 'MASTERE' || d === 'MASTER') return TypeDocument.DIPLOME_MASTER;
    if (d === 'INGENIEUR') return TypeDocument.DIPLOME_INGENIEUR;
    if (d === 'LICENCE') return TypeDocument.DIPLOME_LICENCE;
    if (d === 'PREPARATOIRE') return TypeDocument.DIPLOME_PREPARATOIRE;
    return TypeDocument.AUTRE;
  }

  getReleveTypeFor(diplome: string | null | undefined): TypeDocument {
    if (!diplome) return TypeDocument.RELEVE_NOTES_BAC;
    const d = diplome.toUpperCase();
    if (d === 'BACCALAUREAT') return TypeDocument.RELEVE_NOTES_BAC;
    if (d === 'LICENCE') return TypeDocument.RELEVE_NOTES_LICENCE;
    if (d === 'MASTERE' || d === 'MASTER') return TypeDocument.RELEVE_NOTES_MASTER;
    if (d === 'INGENIEUR') return TypeDocument.RELEVE_NOTES_INGENIEUR;
    if (d === 'PREPARATOIRE') return TypeDocument.RELEVE_NOTES_PREPARATOIRE;
    return TypeDocument.RELEVE_NOTES_BAC; // fallback
  }

  /**
   * Pour les candidats existants :
   * Détermine si un document doit être uploadé.
   * On upload SEULEMENT si :
   * - Le document n'existe pas encore (MANQUANTE)
   * - Le document a été rejeté (REJETE)
   */
  shouldUploadDocument(type: string): boolean {
    if (this.studentMode !== 'existing') return true;

    const docStatus = this.existingDocStatuses.find(d =>
      (d.type || d.typeDocument) === type
    );

    if (!docStatus) return true; // Pas trouvé → à uploader

    const statut = (docStatus.statut || docStatus.typeEnvoie || '').toUpperCase();
    // On n'upload que si c'est rejeté ou manquant
    return statut === 'REJETE' || statut === 'MANQUANTE';
  }

  getDocStatus(type: string): string | null {
    if (this.studentMode !== 'existing') return null;
    const doc = this.existingDocStatuses.find(d => (d.type || d.typeDocument) === type);
    return doc ? (doc.statut || doc.typeEnvoie || '').toUpperCase() : null;
  }

  get needsPreparatoireDocs(): boolean {
    const diplome = this.inscriptionForm?.get('personalInfo.dernierDiplome')?.value;
    return diplome?.toUpperCase() === 'PREPARATOIRE';
  }
  // ── Getter : niveau nécessite un relevé antérieur ──────────────────────
  get needsNiveauReleve(): boolean {
    const niveau = this.inscriptionForm?.get('academicInfo.niveauVise')?.value;
    if (!niveau) return false;
    // Normalise : "L1", "1", "Niveau 1", "1ère année" → extraire le chiffre
    const match = String(niveau).match(/\d+/);
    if (!match) return false;
    return parseInt(match[0], 10) > 1;
  }

  get niveauPrecedent(): string {
    const niveau = this.inscriptionForm?.get('academicInfo.niveauVise')?.value;
    if (!niveau) return '';
    const match = String(niveau).match(/\d+/);
    if (!match) return '';
    const n = parseInt(match[0], 10);
    return String(niveau).replace(String(n), String(n - 1));
  }

  // ════════════════════════════════════════════════════════════════════════
  // VÉRIFICATION DIPLÔME EN DOUBLE
  // ════════════════════════════════════════════════════════════════════════
  /**
   * Vérifie si le diplôme visé choisi correspond déjà à une demande
   * active (= pas rejetée par finance/département/scolarité et sans année).
   */
  checkDuplicateDiplome(): void {
    this.duplicateDiplomeBlocked = false;
    this.duplicateDiplomeMessage = '';

    if (this.studentMode !== 'existing' || this.existingDemandes.length === 0) return;

    const diplomeVise = this.inscriptionForm.get('academicInfo.diplomeVise')?.value;
    if (!diplomeVise) return;

    const rejectedStatuses = ['REJETE_FINANCE', 'REJET_FINANCE', 'REJETE_DEPARTEMENT', 'REJET_DEPARTEMENT', 'REJETE_SCOLARITE', 'REJET_SCOLARITE'];

    const activeDuplicate = this.existingDemandes.find(d => {
      // Même diplôme visé
      const sameDiplome = (d.nomDiplome ?? d.diplomeDemande ?? '').toLowerCase() === diplomeVise.toLowerCase();
      if (!sameDiplome) return false;

      // 🌟 Vérifier si la demande appartient à la même année universitaire 
      if (this.currentYearObj?.dateOuverture) {
        const ouvertureCampagne = new Date(this.currentYearObj.dateOuverture);
        const creationDemande = new Date(d.dateCreation);
        if (creationDemande < ouvertureCampagne) {
          // Demande de l'année précédente : On ignore le fait que le diplôme soit en double
          // L'étudiant a le droit de repostuler à la même formation !
          return false;
        }
      }

      // Vérifier si la demande est "active" (pas de rejet) dans l'année courante
      const statut = (d.statutActuel ?? d.statut ?? '').toUpperCase();
      const isRejected = rejectedStatuses.some(rs => statut.includes(rs));
      return !isRejected;
    });

    if (activeDuplicate) {
      this.duplicateDiplomeBlocked = true;
      this.duplicateDiplomeMessage =
        `Vous avez déjà une demande active pour le diplôme « ${diplomeVise} » (dossier du ${new Date(activeDuplicate.dateCreation).toLocaleDateString('fr-TN')}). ` +
        `Vous ne pouvez pas soumettre une nouvelle demande pour le même diplôme tant que la précédente n'a pas été rejetée.`;
    }
  }

  nextStep(): void {
    if (this.currentStep < 4 && this.isCurrentStepValid) {
      this.currentStep++;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

}
