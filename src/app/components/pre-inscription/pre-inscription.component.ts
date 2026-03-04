import { Component, OnInit, OnDestroy } from '@angular/core';
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
import { Country } from '../../models/country.model';
import {
  DiplomeEtudier, DiplomeResponsable, Langue,
  NiveauDiplomeSpecifique, TypeDiplome
} from '../../models/diploma.model';
import { TypeDocument, Student, DemandeInscription } from '../../models/student.model';
import { StudentService } from '../../services/student.service';
import {
  forkJoin, switchMap, map, of, catchError,
  Observable, debounceTime, Subject, takeUntil
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
import { BulletinResult, BulletinScannerComponent } from '../bulletin-scanner/bulletin-scanner.component';

// ── Types ──────────────────────────────────────────────────────────────────
type StudentMode = 'unknown' | 'existing' | 'new';
type NationalityMode = 'tunisian' | 'foreign' | null;

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
    FooterComponent,
    CinScannerComponent,
    BacScannerComponent,
    BacScannerServiceComponent,
    BulletinScannerComponent
  ],
  templateUrl: './pre-inscription.component.html',
  styleUrl: './pre-inscription.component.css',
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(10px)' }),
        animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class PreInscriptionComponent implements OnInit, OnDestroy {

  // ── Form & Navigation ────────────────────────────────────────────────────
  inscriptionForm!: FormGroup;
  countries: Country[] = [];
  diplomas: DiplomeEtudier[] = [];
  levels: NiveauDiplomeSpecifique[] = [];
  currentStep = 1;
  isSubmitting = false;
  isSaving = false;
  selectedFiles: Map<string, File> = new Map();
  idType: 'cin' | 'passport' = 'cin';
  private destroy$ = new Subject<void>();

  // ── Smart Form State ──────────────────────────────────────────────────────
  /** null = pays non encore sélectionné */
  nationalityMode: NationalityMode = null;

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

  /** Dernière demande de l'étudiant existant */
  existingDemande: any | null = null;

  /**
   * true si la dernière demande date de < 1 an
   * → champ "dernier diplôme" désactivé
   */
  get isRecentDemande(): boolean {
    if (!this.existingDemande?.dateCreation) return false;
    const created = new Date(this.existingDemande.dateCreation);
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
  }

  // ── Vérification croisée (documents) ────────────────────────────────────
  cinData: OcrCinResult | null = null;
  bacDiplomeData: BacResult | null = null;
  bacReleveData: BacServiceResult | null = null;
  verifyMatch: boolean | null = null;
  verifyReason = '';

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
    { value: 'SCIENCES_INFORMATIQUE', label: "Bac Sciences de l'Informatique" },
    { value: 'LETTRES', label: 'Bac Lettres' },
    { value: 'SPORT', label: 'Bac Sport' },
    { value: 'AUTRE', label: 'Autre' }
  ];

  private readonly DRAFT_KEY = 'pre_inscription_draft';
  private readonly DRAFT_MAX_AGE_MS = 30 * 60 * 1000;
  private draftExpiryTimer: any = null;

  lastDiplomas = ['BACCALAUREAT', 'LICENCE', 'MASTERE', 'INGENIEUR'];

  // ── Documents requis (base) ───────────────────────────────────────────────
  get requiredDocuments() {
    const docs: { type: TypeDocument; label: string; required: boolean }[] = [];

    if (this.nationalityMode === 'tunisian') {
      docs.push({ type: TypeDocument.CARTE_IDENTITE, label: "Carte d'identité nationale", required: true });
    } else {
      docs.push({ type: TypeDocument.CARTE_IDENTITE, label: 'Passeport', required: true });
    }

    // Nouveaux étudiants → toujours BAC
    if (this.studentMode === 'new') {
      docs.push({ type: TypeDocument.DIPLOME_BAC, label: 'Diplôme du Baccalauréat', required: true });
      docs.push({ type: TypeDocument.RELEVE_NOTES, label: 'Relevé de notes BAC', required: true });
    }

    // Existants avec diplôme supérieur → relever supérieur
    if (this.studentMode === 'existing' && this.needsSuperieurDocs) {
      docs.push({ type: TypeDocument.RELEVE_NOTES_SUPERIEUR as any, label: 'Relevé de notes supérieur', required: true });
      const diplome = this.inscriptionForm?.get('personalInfo.dernierDiplome')?.value?.toUpperCase();
      if (diplome === 'LICENCE') docs.push({ type: TypeDocument.DIPLOME_LICENCE, label: 'Diplôme de Licence', required: true });
      if (diplome === 'MASTERE' || diplome === 'MASTER') docs.push({ type: TypeDocument.DIPLOME_MASTER, label: 'Diplôme de Master', required: true });
      if (diplome === 'INGENIEUR') docs.push({ type: TypeDocument.DIPLOME_INGENIEUR as any, label: "Diplôme d'Ingénieur", required: true });
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
      if (seen.has(d.nom)) return false;
      seen.add(d.nom); return true;
    });
  }

  /** Filtre les diplômes visés selon le dernier diplôme obtenu */
  get filteredDiplomesParNiveau(): DiplomeResponsable[] {
    const dernierDiplome = this.inscriptionForm?.get('personalInfo.dernierDiplome')?.value?.toUpperCase() ?? '';
    // Si BAC → seulement les licences
    if (dernierDiplome === 'BACCALAUREAT') {
      return this.filteredDiplomesResponsables.filter(d =>
        d.typeNom?.toUpperCase().includes('LICENCE') ||
        d.nomDiplome?.toUpperCase().includes('LICENCE')
      );
    }
    // Sinon tout est accessible
    return this.filteredDiplomesResponsables;
  }

  constructor(
    private fb: FormBuilder,
    private countryService: CountryService,
    private diplomaService: DiplomaService,
    private enrollmentService: EnrollmentService,
    private phoneValidationService: PhoneValidationService,
    private studentService: StudentService,
    private alertService: AlertService
  ) { }

  ngOnInit(): void {
    this.initForm();
    this.loadInitialData();
    this.startDraftExpiryTimer();

    this.inscriptionForm.get('academicInfo.langueVise')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(langue => {
        const nomDiplome = this.inscriptionForm.get('academicInfo.diplomeVise')?.value;
        if (nomDiplome && langue) {
          this.diplomaService.getNiveauxByDiplomeNameAndLangue(nomDiplome, langue)
            .subscribe(data => {
              this.levels = data;
              this.inscriptionForm.get('academicInfo.niveauVise')?.setValue('');
            });
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.draftExpiryTimer) clearTimeout(this.draftExpiryTimer);
  }

  // ════════════════════════════════════════════════════════════════════════
  // INIT FORM
  // ════════════════════════════════════════════════════════════════════════
  initForm(): void {
    this.inscriptionForm = this.fb.group({
      personalInfo: this.fb.group({
        nom: ['', Validators.required],
        prenom: ['', Validators.required],
        email: ['', [Validators.required, Validators.email]],
        phone: ['', {
          validators: [Validators.required],
          asyncValidators: [this.phoneAsyncValidator.bind(this)],
          updateOn: 'blur'
        }],
        indicatif: ['+216', Validators.required],
        gendre: ['HOMME', Validators.required],
        dateNaissance: ['', [Validators.required, this.ageValidator(18)]],
        pays: ['', Validators.required],
        adresse: ['', Validators.required],
        cin: ['', [Validators.pattern('^[0-9]{8}$')]],
        numPassport: [''],
        typeBac: [''],
        dernierDiplome: ['', Validators.required]
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
        // Si BAC → filtrer les diplômes visés
        this.inscriptionForm.get('academicInfo.diplomeVise')?.setValue('');
        this.inscriptionForm.get('academicInfo.typeVise')?.setValue('');
        this.filteredDiplomesResponsables = [];
        this.levels = [];
      });

    this.inscriptionForm.valueChanges
      .pipe(debounceTime(2000), takeUntil(this.destroy$))
      .subscribe(val => this.autoSave(val));

    this.restoreForm();
    this.setIdType('cin');
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
    this.cinExtractedValue = result.numeroCin;
    this.cinExtracted = true;
    this.inscriptionForm.get("personalInfo.cin")?.setValue(result.numeroCin);
    this.inscriptionForm.get("personalInfo.cin")?.markAsTouched();
    this.cinData = result;
  }

  /**
   * Appelé quand le candidat clique "Vérifier" après avoir saisi CIN ou passport.
   * Recherche l'étudiant dans le backend et charge ses données si trouvé.
   */
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
      this.studentService.getStudentByPassport(passport, Number(paysId)).pipe(
        catchError(() => of(null))
      ).subscribe(student => this.handleStudentLookup(student));
    }
  }

  private handleStudentLookup(student: Student | null): void {
    this.isCheckingId = false;
    this.idCheckDone = true;

    if (!student) {
      // Nouvel étudiant
      this.studentMode = 'new';
      return;
    }

    // Étudiant existant → pré-remplir le formulaire
    this.existingStudent = student;
    this.studentMode = 'existing';
    this.prefillFromStudent(student);

    // Charger sa dernière demande
    if (student.id) {
      this.enrollmentService.getDemandeByEtudiantId(student.id).pipe(
        catchError(() => of(null))
      ).subscribe(demande => {
        this.existingDemande = demande;

        // Si demande < 1 an → désactiver le champ dernierDiplome
        if (this.isRecentDemande) {
          this.inscriptionForm.get('personalInfo.dernierDiplome')?.disable();
        } else {
          this.inscriptionForm.get('personalInfo.dernierDiplome')?.enable();
        }
      });
    }
  }

  private prefillFromStudent(s: Student): void {
    const pi = this.inscriptionForm.get('personalInfo');
    if (!pi) return;
    if (s.nom) pi.get('nom')?.setValue(s.nom);
    if (s.prenom) pi.get('prenom')?.setValue(s.prenom);
    if (s.email) pi.get('email')?.setValue(s.email);
    if (s.phone) {
      // Tenter de séparer indicatif et numéro
      const match = s.phone.match(/^(\+\d{1,4})(.+)$/);
      if (match) {
        pi.get('indicatif')?.setValue(match[1]);
        pi.get('phone')?.setValue(match[2]);
      }
    }
    if (s.gendre) this.setGender(s.gendre as any);
    if (s.dateNaissance) pi.get('dateNaissance')?.setValue(s.dateNaissance);
    if (s.numCarteIdentite) pi.get('cin')?.setValue(s.numCarteIdentite);
    if (s.numPassport) pi.get('numPassport')?.setValue(s.numPassport);
    if ((s as any).adresse) pi.get('adresse')?.setValue((s as any).adresse);
    if ((s as any).dernierDiplome) pi.get('dernierDiplome')?.setValue((s as any).dernierDiplome);

    // Tous les champs identité sont en readonly pour l'étudiant existant
    ['nom', 'prenom', 'dateNaissance', 'cin', 'numPassport'].forEach(field => {
      pi.get(field)?.disable();
    });
  }

  resetStudentState(): void {
    this.studentMode = 'unknown';
    this.idCheckDone = false;
    this.existingStudent = null;
    this.existingDemande = null;
    this.cinData = null;
    this.bacDiplomeData = null;
    this.bacReleveData = null;
    this.verifyMatch = null;
    this.verifyReason = '';
    this.cinExtracted = false;
    this.cinExtractedValue = '';
    this.showCinManual = false;
    // Réactiver tous les champs
    ['nom', 'prenom', 'dateNaissance', 'cin', 'numPassport', 'dernierDiplome'].forEach(f =>
      this.inscriptionForm.get(`personalInfo.${f}`)?.enable()
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // HANDLERS OCR SCANNERS
  // ════════════════════════════════════════════════════════════════════════
  onCinScanned(result: OcrCinResult): void {
    if (!result.success) return;
    this.cinData = result;
    const pi = this.inscriptionForm.get('personalInfo');
    if (!pi) return;
    if (result.nom) { pi.get('nom')?.setValue(result.nom); pi.get('nom')?.markAsTouched(); }
    if (result.prenom) { pi.get('prenom')?.setValue(result.prenom); pi.get('prenom')?.markAsTouched(); }
    if (result.dateNaissance) { pi.get('dateNaissance')?.setValue(result.dateNaissance); pi.get('dateNaissance')?.markAsTouched(); }
    if (result.genre) this.setGender(result.genre as any);
    if (result.numeroCin) { pi.get('cin')?.setValue(result.numeroCin); pi.get('cin')?.markAsTouched(); }
    const tunisia = this.countries.find(c => c.nom?.toLowerCase().includes('tunis'));
    if (tunisia) pi.get('pays')?.setValue(tunisia.id);
    this.tryVerify();
  }

  onBacScanned(result: BacResult): void {
    if (!result.success) return;
    this.bacDiplomeData = result;
    const pi = this.inscriptionForm.get('personalInfo');
    if (!pi) return;
    if (result.nom) { pi.get('nom')?.setValue(result.nom); pi.get('nom')?.markAsTouched(); }
    if (result.prenom) { pi.get('prenom')?.setValue(result.prenom); pi.get('prenom')?.markAsTouched(); }
    if (result.dateNaissance) { pi.get('dateNaissance')?.setValue(result.dateNaissance); pi.get('dateNaissance')?.markAsTouched(); }
    if (result.lieuNaissance) { pi.get('adresse')?.setValue(result.lieuNaissance); pi.get('adresse')?.markAsTouched(); }
    const tunisia = this.countries.find(c => c.nom?.toLowerCase().includes('tunis'));
    if (tunisia) pi.get('pays')?.setValue(tunisia.id);
    this.tryVerify();
  }

  onBacServiceScanned(result: BacServiceResult): void {
    if (!result.success) return;
    this.bacReleveData = result;
    const pi = this.inscriptionForm.get('personalInfo');
    if (!pi) return;
    if (result.nomComplet) {
      const parts = result.nomComplet.trim().split(/\s+/);
      if (parts.length >= 2) {
        pi.get('prenom')?.setValue(parts[0]); pi.get('prenom')?.markAsTouched();
        pi.get('nom')?.setValue(parts.slice(1).join(' ')); pi.get('nom')?.markAsTouched();
      } else {
        pi.get('nom')?.setValue(result.nomComplet); pi.get('nom')?.markAsTouched();
      }
    }
    if (result.dateNaissance) { pi.get('dateNaissance')?.setValue(result.dateNaissance); pi.get('dateNaissance')?.markAsTouched(); }
    if (result.lieuNaissance) { pi.get('adresse')?.setValue(result.lieuNaissance); pi.get('adresse')?.markAsTouched(); }
    const tunisia = this.countries.find(c => c.nom?.toLowerCase().includes('tunis'));
    if (tunisia) pi.get('pays')?.setValue(tunisia.id);
    this.tryVerify();
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
    this.bacReleveData = { success: true, nomComplet: result.nomPrenom, dateNaissance: result.dateNaissance } as any;
    this.tryVerify();
  }

  // ════════════════════════════════════════════════════════════════════════
  // VÉRIFICATION CROISÉE DOCUMENTS
  // ════════════════════════════════════════════════════════════════════════
  private tryVerify(): void {
    try {
      const normalizeText = (text: any): string => {
        if (!text) return '';
        return String(text)
          .replace(/[\u064B-\u065F\u0670]/g, '')
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
        const t1 = new Set(n1.split(' ').filter(Boolean));
        const t2 = new Set(n2.split(' ').filter(Boolean));
        return [...t1].every(t => t2.has(t)) || [...t2].every(t => t1.has(t));
      };

      const sources: any[] = [];
      if (this.cinData) sources.push({ type: 'CIN', nomPrenom: `${this.cinData.prenom ?? ''} ${this.cinData.nom ?? ''}`, date: normalizeDate(this.cinData.dateNaissance) });
      if (this.bacDiplomeData) sources.push({ type: 'DIPLOME', nomPrenom: `${this.bacDiplomeData.prenom ?? ''} ${this.bacDiplomeData.nom ?? ''}`, date: normalizeDate(this.bacDiplomeData.dateNaissance), numDossier: String(this.bacDiplomeData.numDossier ?? '').trim() });
      if (this.bacReleveData) sources.push({ type: 'RELEVE', nomPrenom: (this.bacReleveData as any).nomPrenom ?? this.bacReleveData.nomComplet, date: normalizeDate(this.bacReleveData.dateNaissance), numDossier: String(this.bacReleveData.numDossier ?? '').trim() });

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
    if (this.currentStep === 1) {
      // Étudiant doit être identifié avant de passer
      if (this.nationalityMode !== null && !this.idCheckDone) return false;
      return this.personalInfo.valid;
    }
    if (this.currentStep === 2) return this.academicInfo.valid;
    if (this.currentStep === 3) {
      const allRequired = this.requiredDocuments.filter(d => d.required);
      return allRequired.every(doc => this.selectedFiles.has(doc.type));
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
    return !!(c && c.valid && c.value);
  }

  getFieldError(group: string, name: string): string | null {
    const c = this.getControl(group, name);
    if (!c || !c.touched || c.valid) return null;
    if (c.hasError('required')) return 'Ce champ est obligatoire';
    if (c.hasError('email')) return 'Email invalide';
    if (c.hasError('pattern')) return 'Format invalide';
    if (c.hasError('tooYoung')) return 'Age minimum 18 ans';
    if (c.hasError('invalidPhone')) return 'Numéro de téléphone invalide';
    if (c.hasError('countryMismatch')) return 'Le numéro ne correspond pas au pays';
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
  loadInitialData(): void {
    this.countryService.getCountriesWithIndicatifs().subscribe(data => { this.countries = data; });
    this.diplomaService.getDiplomas().subscribe(data => { this.diplomas = data; });
    forkJoin({
      types: this.diplomaService.getTypes(),
      responsables: this.diplomaService.getDiplomesResponsables()
    }).subscribe(({ types, responsables }) => {
      this.diplomesResponsables = responsables;
      const typesWithDiplomas = new Set(responsables.filter(r => r.typeNom).map(r => r.typeNom));
      this.typesDiplome = types.filter(t => typesWithDiplomas.has(t.nom));
    });
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
  nextStep(): void { if (this.currentStep < 3) this.currentStep++; }
  prevStep(): void { if (this.currentStep > 1) this.currentStep--; }
  onFileChange(file: File | null, type: string): void {
    if (file) this.selectedFiles.set(type, file);
    else this.selectedFiles.delete(type);
  }

  // ════════════════════════════════════════════════════════════════════════
  // SUBMIT
  // ════════════════════════════════════════════════════════════════════════
  onSubmit(): void {
    if (!this.inscriptionForm.valid) {
      this.markFormGroupTouched(this.inscriptionForm);
      this.alertService.warning('Veuillez remplir correctement tous les champs obligatoires.');
      return;
    }

    this.isSubmitting = true;
    const fv = this.inscriptionForm.getRawValue(); // getRawValue includes disabled fields

    // Si étudiant existant → on saute la création, on crée juste la demande
    if (this.studentMode === 'existing' && this.existingStudent?.id) {
      this.submitDemande(this.existingStudent.id, fv);
      return;
    }

    // Nouvel étudiant → vérifier unicité email puis créer
    const email = fv.personalInfo.email;
    const cin = fv.personalInfo.cin;
    const passport = fv.personalInfo.numPassport;
    const paysId = fv.personalInfo.pays;

    const checks: { [k: string]: Observable<boolean> } = {
      email: this.studentService.checkEmailExists(email)
    };

    this.studentService.checkEmailExists(email).pipe(
      switchMap(emailExists => {
        if (emailExists) { this.alertService.error('Cet email est déjà associé à un compte.'); this.isSubmitting = false; return of(null); }
        const studentData: Student = {
          nom: fv.personalInfo.nom, prenom: fv.personalInfo.prenom,
          email: fv.personalInfo.email,
          phone: fv.personalInfo.indicatif + fv.personalInfo.phone,
          gendre: fv.personalInfo.gendre, dateNaissance: fv.personalInfo.dateNaissance,
          dernierDiplome: fv.personalInfo.dernierDiplome,
          anneeDernierDiplome: new Date().getFullYear(),
          paysId: fv.personalInfo.pays,
          numCarteIdentite: fv.personalInfo.cin || undefined,
          numPassport: fv.personalInfo.numPassport || undefined,
          typeBac: fv.personalInfo.typeBac || undefined
        };
        return this.studentService.createStudent(studentData);
      }),
      switchMap(savedStudent => {
        if (!savedStudent) return of(null);
        // Upload documents
        const uploads = Array.from(this.selectedFiles.entries()).map(([type, file]) =>
          this.studentService.uploadDocument(savedStudent.id!, type, file)
        );
        if (uploads.length === 0) return of(savedStudent);
        return forkJoin(uploads).pipe(map(() => savedStudent));
      }),
      switchMap(student => {
        if (!student) return of(null);
        return of(student).pipe(
          switchMap(s => {
            this.submitDemande(s.id!, fv);
            return of(null);
          })
        );
      })
    ).subscribe({
      error: (err) => { this.isSubmitting = false; this.alertService.error('Une erreur est survenue. Veuillez réessayer.'); }
    });
  }

  private submitDemande(studentId: number, fv: any): void {
    // Upload des documents supplémentaires si étudiant existant
    const uploads = Array.from(this.selectedFiles.entries()).map(([type, file]) =>
      this.studentService.uploadDocument(studentId, type, file)
    );
    const uploadObs = uploads.length > 0 ? forkJoin(uploads) : of([]);

    uploadObs.pipe(
      switchMap(() => {
        const demande: DemandeInscription = {
          etudiantId: studentId,
          nomDiplome: fv.academicInfo.diplomeVise,
          typeDeDiplome: fv.academicInfo.typeVise,
          langueDiplome: fv.academicInfo.langueVise,
          niveauChoisi: fv.academicInfo.niveauVise,
          dateCreation: new Date().toISOString()
        };
        return this.enrollmentService.postDemande(demande);
      })
    ).subscribe({
      next: () => {
        this.isSubmitting = false;
        localStorage.removeItem(this.DRAFT_KEY);
        this.alertService.success('Inscription réussie !');
        this.resetForm();
      },
      error: () => { this.isSubmitting = false; this.alertService.error('Erreur lors de la soumission.'); }
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
      academicInfo: { session: '2024-2025' }
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
      catchError(() => of({ validationError: true }))
    );
  }
}