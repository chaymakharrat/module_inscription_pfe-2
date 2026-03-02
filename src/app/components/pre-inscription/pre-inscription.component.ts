import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
// import { of, map, catchError } from 'rxjs';
import { CountryService } from '../../services/country.service';
import { DiplomaService } from '../../services/diploma.service';
import { EnrollmentService } from '../../services/enrollment.service';
import { PhoneValidationService } from '../../services/phone-validation.service';
import { AlertService } from '../../services/alert.service';
import { Country } from '../../models/country.model';
import { DiplomeEtudier, DiplomeResponsable, Langue, NiveauDiplomeSpecifique, TypeDiplome } from '../../models/diploma.model';
import { TypeDocument, Student, DemandeInscription } from '../../models/student.model';
import { StudentService } from '../../services/student.service';
import { forkJoin, switchMap, map, of, catchError, Observable, debounceTime } from 'rxjs';
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
  inscriptionForm!: FormGroup;
  countries: Country[] = [];
  diplomas: DiplomeEtudier[] = [];
  levels: NiveauDiplomeSpecifique[] = [];
  currentStep = 1;
  isSubmitting = false;
  isSaving = false;
  selectedFiles: Map<string, File> = new Map();
  idType: 'cin' | 'passport' = 'cin';

  /** Langues disponibles pour le diplôme sélectionné */
  availableLangues: Langue[] = [];
  readonly langueLabels: Record<Langue, string> = {
    ARABE: 'Arabe عربي',
    FRANCAIS: 'Français',
    ANGLAIS: 'Anglais'
  };
  diplomesResponsables: DiplomeResponsable[] = [];
  /** Tous les types de diplôme récupérés depuis le backend */
  typesDiplome: TypeDiplome[] = [];
  /** Diplômes responsables filtrés selon le type sélectionné */
  filteredDiplomesResponsables: DiplomeResponsable[] = [];

  readonly bacTypes = [
    { value: 'SCIENCES_EXPERIMENTALES', label: 'Bac Sciences Expérimentales' },
    { value: 'MATHEMATIQUES', label: 'Bac Mathématiques' },
    { value: 'TECHNIQUE', label: 'Bac Technique' },
    { value: 'ECONOMIE_GESTION', label: 'Bac Économie et Gestion' },
    { value: 'SCIENCES_INFORMATIQUE', label: 'Bac Sciences de l\'Informatique' },
    { value: 'LETTRES', label: 'Bac Lettres' },
    { value: 'SPORT', label: 'Bac Sport' },
    { value: 'AUTRE', label: 'Autre' }
  ];

  get isTunisiaSelected(): boolean {
    const paysId = this.inscriptionForm.get('personalInfo.pays')?.value;
    return this.countries.find(c => c.id == paysId)?.nom === 'Tunisia';
  }


  // loadInitialData(): void {
  //     this.countryService.getCountriesWithIndicatifs().subscribe(data => {
  //         this.countries = data;
  //     });

  //     // ✅ Charger les diplômes responsables au lieu des diplômes directs
  //     this.diplomaService.getDiplomesResponsables().subscribe(data => {
  //         this.diplomesResponsables = data;
  //     });
  // }

  // ✅ Quand l'utilisateur sélectionne un diplôme responsable
  onDiplomeResponsableChange(nomDiplome: string): void {
    const selected = this.diplomesResponsables.find(d => d.nomDiplome === nomDiplome);
    if (selected) {
      this.availableLangues = selected.langues;
      this.levels = [];
      this.inscriptionForm.get('academicInfo.niveauVise')?.setValue('');

      if (this.availableLangues.length === 1) {
        const langue = this.availableLangues[0];
        this.inscriptionForm.get('academicInfo.langueVise')?.setValue(langue);
        // Le listener langueVise.valueChanges va automatiquement charger les niveaux
      } else {
        this.inscriptionForm.get('academicInfo.langueVise')?.setValue('');
      }
    }
  }

  /** Diplômes uniques par nom (pour le sélecteur) : on déduplique par nom † */
  get uniqueDiplomas(): DiplomeEtudier[] {
    const seen = new Set<string>();
    return this.diplomas.filter(d => {
      if (seen.has(d.nom)) return false;
      seen.add(d.nom);
      return true;
    });
  }

  private readonly DRAFT_KEY = 'pre_inscription_draft';
  private readonly DRAFT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
  private draftExpiryTimer: any = null;

  lastDiplomas = ['BACCALAUREAT', 'LICENCE', 'MASTERE', 'INGENIEUR'];

  requiredDocuments = [
    { type: TypeDocument.CARTE_IDENTITE, label: "Carte d'identité ou Passeport", required: true },
    { type: TypeDocument.DIPLOME_BAC, label: "Diplôme du Baccalauréat", required: true },
    { type: TypeDocument.RELEVE_NOTES, label: "Relevé de notes", required: true }
  ];

  extraDocuments: any[] = [];

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
    this.inscriptionForm.get('academicInfo.langueVise')?.valueChanges.subscribe(langue => {
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
    if (this.draftExpiryTimer) {
      clearTimeout(this.draftExpiryTimer);
    }
  }

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
        typeBac: ['']
      }),
      academicInfo: this.fb.group({
        dernierDiplome: ['', Validators.required],
        anneeDernierDiplome: [new Date().getFullYear(), [Validators.required, Validators.min(1900)]],
        typeVise: ['', Validators.required],
        diplomeVise: ['', Validators.required],
        langueVise: ['', Validators.required],
        niveauVise: ['', Validators.required],
        session: ['2024-2025', Validators.required]
      }),
      documents: this.fb.group({})
    });

    // Watch for changes in dernierDiplome to update extra documents
    this.inscriptionForm.get('academicInfo.dernierDiplome')?.valueChanges.subscribe(val => {
      this.updateExtraDocuments(val);
    });

    // Quand le type change → filtrer les diplômes et réinitialiser diplômeVise
    this.inscriptionForm.get('academicInfo.typeVise')?.valueChanges.subscribe(typeName => {
      this.onTypeChange(typeName);
    });

    // Watch for changes in indicatif to re-validate phone
    this.inscriptionForm.get('personalInfo.indicatif')?.valueChanges.subscribe(() => {
      this.inscriptionForm.get('personalInfo.phone')?.updateValueAndValidity();
    });

    // Watch for changes in pays to update indicatif
    this.inscriptionForm.get('personalInfo.pays')?.valueChanges.subscribe(paysId => {
      const country = this.countries.find(c => c.id == paysId);
      if (country) {
        this.inscriptionForm.get('personalInfo.indicatif')?.setValue(country.indicatif);
      }

      // Update typeBac validation
      const typeBacControl = this.inscriptionForm.get('personalInfo.typeBac');
      if (country?.nom === 'Tunisie') {
        typeBacControl?.setValidators([Validators.required]);
      } else {
        typeBacControl?.clearValidators();
        typeBacControl?.setValue('');
      }
      typeBacControl?.updateValueAndValidity();
    });

    // Watch for changes in indicatif to update pays
    this.inscriptionForm.get('personalInfo.indicatif')?.valueChanges.subscribe(indicatif => {
      const country = this.countries.find(c => c.indicatif === indicatif);
      if (country && this.inscriptionForm.get('personalInfo.pays')?.value != country.id) {
        this.inscriptionForm.get('personalInfo.pays')?.setValue(country.id, { emitEvent: false });
      }
    });

    // Auto-save logic
    this.inscriptionForm.valueChanges.pipe(
      debounceTime(2000)
    ).subscribe(val => {
      this.autoSave(val);
    });

    this.restoreForm();
    // Set initial validators for CIN/Passport
    this.setIdType('cin');
  }

  get isCurrentStepValid(): boolean {
    if (this.currentStep === 1) {
      return this.personalInfo.valid;
    } else if (this.currentStep === 2) {
      return this.academicInfo.valid;
    } else if (this.currentStep === 3) {
      // Vérifier si tous les documents obligatoires sont sélectionnés
      const allRequired = [...this.requiredDocuments, ...this.extraDocuments]
        .filter(doc => doc.required);

      return allRequired.every(doc => this.selectedFiles.has(doc.type));
    }
    return false;
  }

  private autoSave(data: any): void {
    if (this.inscriptionForm.pristine) return;
    this.isSaving = true;
    const draft = {
      data,
      savedAt: Date.now()
    };
    localStorage.setItem(this.DRAFT_KEY, JSON.stringify(draft));
    this.startDraftExpiryTimer();
    setTimeout(() => {
      this.isSaving = false;
    }, 1000);
  }

  private restoreForm(): void {
    const saved = localStorage.getItem(this.DRAFT_KEY);
    if (saved) {
      const draft = JSON.parse(saved);

      // Vérifier si le brouillon a expiré (30 min)
      if (draft.savedAt && (Date.now() - draft.savedAt) > this.DRAFT_MAX_AGE_MS) {
        localStorage.removeItem(this.DRAFT_KEY);
        console.log('Brouillon expiré, suppression automatique.');
        return;
      }

      const data = draft.data || draft; // compatibilité ancien format
      this.inscriptionForm.patchValue(data, { emitEvent: false });

      // Manually trigger updates for dependent fields if needed
      if (data.academicInfo?.diplomeVise) {
        this.onDiplomeResponsableChange(data.academicInfo.diplomeVise);
      }
      if (data.personalInfo?.pays) {
        const country = this.countries.find(c => c.id == data.personalInfo.pays);
        if (country) {
          this.inscriptionForm.get('personalInfo.indicatif')?.setValue(country.indicatif, { emitEvent: false });
        }
      }
    }
  }

  /** Démarre un timer pour supprimer le brouillon après 30 minutes */
  private startDraftExpiryTimer(): void {
    // Annuler le timer précédent
    if (this.draftExpiryTimer) {
      clearTimeout(this.draftExpiryTimer);
    }

    const saved = localStorage.getItem(this.DRAFT_KEY);
    if (!saved) return;

    const draft = JSON.parse(saved);
    const elapsed = Date.now() - (draft.savedAt || Date.now());
    const remaining = this.DRAFT_MAX_AGE_MS - elapsed;

    if (remaining <= 0) {
      // Déjà expiré
      localStorage.removeItem(this.DRAFT_KEY);
      console.log('Brouillon expiré, suppression automatique.');
      return;
    }

    // Programmer la suppression dans le temps restant
    this.draftExpiryTimer = setTimeout(() => {
      localStorage.removeItem(this.DRAFT_KEY);
      console.log('Brouillon supprimé automatiquement après 30 minutes.');
    }, remaining);
  }

  setIdType(type: 'cin' | 'passport'): void {
    this.idType = type;
    const cinControl = this.inscriptionForm.get('personalInfo.cin');
    const passportControl = this.inscriptionForm.get('personalInfo.numPassport');

    if (type === 'cin') {
      cinControl?.setValidators([Validators.required, Validators.pattern('^[0-9]{8}$')]);
      passportControl?.clearValidators();
      passportControl?.reset();
    } else {
      passportControl?.setValidators([Validators.required]);
      cinControl?.clearValidators();
      cinControl?.reset();
    }
    cinControl?.updateValueAndValidity();
    passportControl?.updateValueAndValidity();
  }

  setGender(gendre: 'HOMME' | 'FEMME'): void {
    this.inscriptionForm.get('personalInfo.gendre')?.setValue(gendre);
  }
  onCinScanned(result: OcrCinResult): void {
    if (!result.success) return;

    const personalInfo = this.inscriptionForm.get('personalInfo');
    if (!personalInfo) return;

    if (result.nom) {
      personalInfo.get('nom')?.setValue(result.nom);
      personalInfo.get('nom')?.markAsTouched();
    }

    if (result.prenom) {
      personalInfo.get('prenom')?.setValue(result.prenom);
      personalInfo.get('prenom')?.markAsTouched();
    }

    if (result.dateNaissance) {
      personalInfo.get('dateNaissance')?.setValue(result.dateNaissance);
      personalInfo.get('dateNaissance')?.markAsTouched();
    }

    if (result.genre) {
      this.setGender(result.genre);
    }

    if (result.numeroCin) {
      this.setIdType('cin');
      personalInfo.get('cin')?.setValue(result.numeroCin);
      personalInfo.get('cin')?.markAsTouched();
    }

    if (result.adresse) {
      personalInfo.get('adresse')?.setValue(result.adresse);
      personalInfo.get('adresse')?.markAsTouched();
    }

    // Auto-sélectionner la Tunisie si CIN tunisienne détectée
    const tunisia = this.countries.find(
      c => c.nom?.toLowerCase().includes('tunis')
    );
    if (tunisia) {
      personalInfo.get('pays')?.setValue(tunisia.id);
    }
  }

  onBacScanned(result: BacResult): void {
    if (!result.success) return;

    const personalInfo = this.inscriptionForm.get('personalInfo');
    if (!personalInfo) return;

    if (result.nom) {
      personalInfo.get('nom')?.setValue(result.nom);
      personalInfo.get('nom')?.markAsTouched();
    }

    if (result.prenom) {
      personalInfo.get('prenom')?.setValue(result.prenom);
      personalInfo.get('prenom')?.markAsTouched();
    }

    if (result.dateNaissance) {
      personalInfo.get('dateNaissance')?.setValue(result.dateNaissance);
      personalInfo.get('dateNaissance')?.markAsTouched();
    }

    if (result.lieuNaissance) {
      personalInfo.get('adresse')?.setValue(result.lieuNaissance);
      personalInfo.get('adresse')?.markAsTouched();
    }

    // Auto-sélectionner Tunisie si détecté via le QR bac tunisien
    const tunisia = this.countries.find(
      c => c.nom?.toLowerCase().includes('tunis')
    );
    if (tunisia) {
      personalInfo.get('pays')?.setValue(tunisia.id);
    }
  }

  // ─── Handler pour app-bac-scanner-service (Bilan complet avec notes) ───────
  onBacServiceScanned(result: BacServiceResult): void {
    if (!result.success) return;

    const personalInfo = this.inscriptionForm.get('personalInfo');
    if (!personalInfo) return;

    // nomComplet ex: "شيماء الخراط" → split : prénom = 1er mot, nom = reste
    if (result.nomComplet) {
      const parts = result.nomComplet.trim().split(/\s+/);
      if (parts.length >= 2) {
        personalInfo.get('prenom')?.setValue(parts[0]);
        personalInfo.get('prenom')?.markAsTouched();
        personalInfo.get('nom')?.setValue(parts.slice(1).join(' '));
        personalInfo.get('nom')?.markAsTouched();
      } else {
        personalInfo.get('nom')?.setValue(result.nomComplet);
        personalInfo.get('nom')?.markAsTouched();
      }
    }

    if (result.dateNaissance) {
      personalInfo.get('dateNaissance')?.setValue(result.dateNaissance);
      personalInfo.get('dateNaissance')?.markAsTouched();
    }

    if (result.lieuNaissance) {
      personalInfo.get('adresse')?.setValue(result.lieuNaissance);
      personalInfo.get('adresse')?.markAsTouched();
    }

    // Auto-sélectionner Tunisie
    const tunisia = this.countries.find(c => c.nom?.toLowerCase().includes('tunis'));
    if (tunisia) {
      personalInfo.get('pays')?.setValue(tunisia.id);
    }
  }
  // onBulletinScanned(result: BulletinResult): void {
  //   if (!result.success) return;
  //   const personalInfo = this.inscriptionForm.get('personalInfo');
  //   if (result.nomPrenom) {
  //     const parts = result.nomPrenom.trim().split(/\s+/);
  //     personalInfo?.get('nom')?.setValue(parts[0]);
  //     personalInfo?.get('prenom')?.setValue(parts.slice(1).join(' '));
  //   }
  //   if (result.dateNaissance) {
  //     personalInfo?.get('dateNaissance')?.setValue(result.dateNaissance);
  //   }
  //   if (result.numeroCin) {
  //     this.setIdType('cin');
  //     personalInfo?.get('cin')?.setValue(result.numeroCin);
  //   }
  // }
  onBulletinScanned(result: BulletinResult): void {
    if (result.errorMessage) return;

    const personalInfo = this.inscriptionForm.get("personalInfo");
    if (!personalInfo) return;

    if (result.nomPrenom) {
      const parts = result.nomPrenom.trim().split(/\s+/);
      if (parts.length >= 2) {
        personalInfo.get("nom")?.setValue(parts[0]);
        personalInfo.get("prenom")?.setValue(parts.slice(1).join(" "));
      } else {
        personalInfo.get("nom")?.setValue(result.nomPrenom);
      }
      personalInfo.get("nom")?.markAsTouched();
      personalInfo.get("prenom")?.markAsTouched();
    }

    if (result.dateNaissance) {
      personalInfo.get("dateNaissance")?.setValue(result.dateNaissance);
      personalInfo.get("dateNaissance")?.markAsTouched();
    }

    if (result.numeroCin) {
      this.setIdType("cin");
      personalInfo.get("cin")?.setValue(result.numeroCin);
      personalInfo.get("cin")?.markAsTouched();
    }

    const tunisia = this.countries.find(c => c.nom?.toLowerCase().includes("tunis"));
    if (tunisia) {
      personalInfo.get("pays")?.setValue(tunisia.id);
    }
  }

  get personalInfo() { return this.inscriptionForm.get('personalInfo') as FormGroup; }
  get academicInfo() { return this.inscriptionForm.get('academicInfo') as FormGroup; }

  getControl(group: string, name: string) {
    return this.inscriptionForm.get(`${group}.${name}`);
  }

  isFieldValid(group: string, name: string): boolean {
    const control = this.getControl(group, name);
    return !!(control && control.valid && control.value);
  }

  getFieldError(group: string, name: string): string | null {
    const control = this.getControl(group, name);
    if (!control || !control.touched || control.valid) return null;

    if (control.hasError('required')) return 'Ce champ est obligatoire';
    if (control.hasError('email')) return 'Email invalide';
    if (control.hasError('pattern')) return 'Format invalide';
    if (control.hasError('tooYoung')) return 'Age minimum 18 ans';
    if (control.hasError('invalidPhone')) return 'Numéro de téléphone invalide';
    if (control.hasError('countryMismatch')) return 'Le numéro ne correspond pas au pays';

    return 'Champ invalide';
  }

  private ageValidator(minAge: number) {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      const birthDate = new Date(control.value);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age >= minAge ? null : { tooYoung: true, requiredAge: minAge };
    };
  }

  loadInitialData(): void {
    this.countryService.getCountriesWithIndicatifs().subscribe(data => {
      this.countries = data;
    });

    this.diplomaService.getDiplomas().subscribe(data => {
      this.diplomas = data;
    });

    // Charger les types ET les diplômes responsables, puis filtrer les types vides (ex: Doctorat sans diplôme)
    forkJoin({
      types: this.diplomaService.getTypes(),
      responsables: this.diplomaService.getDiplomesResponsables()
    }).subscribe(({ types, responsables }) => {
      this.diplomesResponsables = responsables;
      const typesWithDiplomas = new Set(responsables.filter(r => r.typeNom).map(r => r.typeNom));
      this.typesDiplome = types.filter(t => typesWithDiplomas.has(t.nom));
    });
  }

  /** Quand le candidat sélectionne un type → filtrer les diplômes disponibles */
  onTypeChange(typeName: string): void {
    // Réinitialiser la sélection diplôme & langue
    this.inscriptionForm.get('academicInfo.diplomeVise')?.setValue('');
    this.inscriptionForm.get('academicInfo.langueVise')?.setValue('');
    this.inscriptionForm.get('academicInfo.niveauVise')?.setValue('');
    this.availableLangues = [];
    this.levels = [];

    if (!typeName) {
      this.filteredDiplomesResponsables = [];
      return;
    }

    // Filtrer les diplômes responsables par type via l'API (endpoint dédié)
    // Pour simplifier, on filtre côté client sur le champ `type` de DiplomeEtudier
    // On utilise l'API /api/diplomes?type=... si disponible, sinon on filtre via getDiplomas()
    this.diplomaService.getDiplomas().subscribe(diplomes => {
      const nomsDuType = new Set(
        diplomes
          .filter(d => d.type === typeName && d.actif !== false)
          .map(d => d.nom)
      );
      this.filteredDiplomesResponsables = this.diplomesResponsables.filter(
        dr => dr.typeNom === typeName
      );
    });
  }

  loadLevels(nomDiplome: string): void {
    this.diplomaService.getNiveauxByDiplomeName(nomDiplome).subscribe(data => {
      this.levels = data;
    });
  }

  phoneAsyncValidator(control: AbstractControl): any {
    const phone = control.value;
    const indicatif = this.inscriptionForm?.get('personalInfo.indicatif')?.value;

    if (!phone || !indicatif) return of(null);

    const fullNumber = indicatif + phone;

    return this.phoneValidationService.validatePhoneNumber(fullNumber).pipe(
      map((response: any) => {
        if (!response.is_valid) {
          return { invalidPhone: true };
        }

        // Optional: verify if it matches selected country
        // Indicatif is like +216, response.components.country_code is 216
        const countryCode = indicatif.replace('+', '');
        if (response.components.country_code.toString() !== countryCode) {
          return { countryMismatch: true };
        }

        return null;
      }),
      catchError((err: any) => {
        console.error('Phone validation API error:', err);
        return of({ validationError: true });
      })
    );
  }

  // Keeping the old one for reference or removing if not needed
  // phoneValidator(control: AbstractControl): ValidationErrors | null { ... }

  updateExtraDocuments(lastDiploma: string): void {
    this.extraDocuments = [];
    if (lastDiploma === 'LICENCE') {
      this.extraDocuments.push({ type: TypeDocument.DIPLOME_LICENCE, label: "Diplôme de Licence", required: true });
    } else if (lastDiploma === 'MASTERE') {
      this.extraDocuments.push({ type: TypeDocument.DIPLOME_MASTER, label: "Diplôme de Master", required: true });
    }
    // Update form group for documents dynamically if needed
  }

  nextStep(): void {
    if (this.currentStep < 3) {
      this.currentStep++;
    }
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  onFileChange(file: File | null, type: string): void {
    if (file) {
      this.selectedFiles.set(type, file);
      console.log(`File buffered for ${type}`, file.name);
    } else {
      this.selectedFiles.delete(type);
      console.log(`File removed for ${type}`);
    }
  }

  onSubmit(): void {
    if (this.inscriptionForm.valid) {
      const formValue = this.inscriptionForm.value;
      this.isSubmitting = true;

      const email = formValue.personalInfo.email;
      const cin = formValue.personalInfo.cin;
      const passport = formValue.personalInfo.numPassport;
      const paysId = formValue.personalInfo.pays;

      // 1. Prepare existence checks
      const checks: { [key: string]: Observable<boolean> } = {
        email: this.studentService.checkEmailExists(email)
      };

      if (cin) {
        checks['cin'] = this.studentService.checkCinExists(cin);
      }
      if (passport && paysId) {
        checks['passport'] = this.studentService.checkPassportExists(passport, paysId);
      }

      console.log('Performing duplication checks...', Object.keys(checks));

      forkJoin(checks).pipe(
        switchMap(results => {
          if (results['email']) {
            this.alertService.error('Oups ! Cet email est déjà associé à un compte.');
            return of(null);
          }
          if (results['cin']) {
            this.alertService.error('Oups ! Ce numéro de CIN est déjà enregistré.');
            return of(null);
          }
          if (results['passport']) {
            this.alertService.error('Oups ! Ce passeport est déjà utilisé pour ce pays.');
            return of(null);
          }

          // 2. Prepare Student Data if no duplicates
          const studentData: Student = {
            nom: formValue.personalInfo.nom,
            prenom: formValue.personalInfo.prenom,
            email: formValue.personalInfo.email,
            phone: formValue.personalInfo.indicatif + formValue.personalInfo.phone,
            gendre: formValue.personalInfo.gendre,
            dateNaissance: formValue.personalInfo.dateNaissance,
            dernierDiplome: formValue.academicInfo.dernierDiplome,
            anneeDernierDiplome: formValue.academicInfo.anneeDernierDiplome,
            paysId: formValue.personalInfo.pays,
            numCarteIdentite: formValue.personalInfo.cin || undefined,
            numPassport: formValue.personalInfo.numPassport || undefined,
            typeBac: formValue.personalInfo.typeBac || undefined
          };

          console.log('Creating Student...', studentData);
          return this.studentService.createStudent(studentData);
        }),
        // Only proceed if student was created (not null from duplicate checks)
        switchMap(savedStudent => {
          if (!savedStudent) return of(null);

          console.log('Student created with ID:', savedStudent.id);
          const studentId = savedStudent.id!;

          // 3. Prepare Document Uploads
          const uploadObservables = Array.from(this.selectedFiles.entries()).map(([type, file]) =>
            this.studentService.uploadDocument(studentId, type, file)
          );

          if (uploadObservables.length === 0) {
            return of(savedStudent);
          }

          console.log(`Uploading ${uploadObservables.length} documents...`);
          return forkJoin(uploadObservables).pipe(
            map(() => savedStudent)
          );
        }),
        switchMap(student => {
          if (!student) return of(null);

          // 4. Create Enrollment Request
          const diplomeName = formValue.academicInfo.diplomeVise;
          const langueVise = formValue.academicInfo.langueVise;
          const typeVise = formValue.academicInfo.typeVise;

          const demande: DemandeInscription = {
            etudiantId: student.id!,
            nomDiplome: diplomeName,
            typeDeDiplome: typeVise,
            langueDiplome: langueVise,
            niveauChoisi: formValue.academicInfo.niveauVise,
            dateCreation: new Date().toISOString(),
          };

          console.log('Creating Enrollment Request...', demande);
          return this.enrollmentService.postDemande(demande);
        })
      ).subscribe({
        next: (res) => {
          if (res) {
            this.isSubmitting = false;
            localStorage.removeItem(this.DRAFT_KEY);
            this.alertService.success('Inscription réussie ! Votre demande a été enregistrée.');
            this.resetForm();
          } else {
            this.isSubmitting = false;
          }
        },
        error: (err) => {
          this.isSubmitting = false;
          console.error('Submission failed:', err);
          this.alertService.error('Une erreur est survenue lors de l\'inscription. Veuillez réessayer.');
        }
      });
    } else {
      this.markFormGroupTouched(this.inscriptionForm);
      const invalidFields = this.getInvalidControls(this.inscriptionForm);
      console.error('Formulaire invalide. Champs concernés :', invalidFields);
      this.alertService.warning('Veuillez remplir correctement les champs obligatoires : ' + invalidFields.join(', '));
    }
  }

  private getInvalidControls(formGroup: FormGroup): string[] {
    const invalid = [];
    const controls = formGroup.controls;
    for (const name in controls) {
      if (controls[name].invalid) {
        if (controls[name] instanceof FormGroup) {
          invalid.push(...this.getInvalidControls(controls[name] as FormGroup).map(child => `${name}.${child}`));
        } else {
          invalid.push(name);
        }
      }
    }
    return invalid;
  }

  private resetForm(): void {
    this.filteredDiplomesResponsables = [];
    this.availableLangues = [];
    this.levels = [];
    this.inscriptionForm.reset({
      personalInfo: { gendre: 'HOMME', indicatif: '+216' },
      academicInfo: { anneeDernierDiplome: new Date().getFullYear(), session: '2024-2025' }
    });
    this.selectedFiles.clear();
    this.currentStep = 1;
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      } else {
        control.markAsTouched();
      }
    });
  }
}
