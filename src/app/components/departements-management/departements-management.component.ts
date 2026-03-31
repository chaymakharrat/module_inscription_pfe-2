import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { environment } from '../../envirements/enviremetns';
import { NotificationService } from '../../services/notification.service';
import { KeycloakService } from 'keycloak-angular';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface Departement {
  id: number;
  nom: string;
  actif: boolean;
  createdAt?: string;
  diplomes: DiplomeVariante[];
  diplomesCount?: number;
}

export interface PredictionDTO {
  departementNom: string;
  diplomeNom: string;
  langue: string;
  niveauCible: number;
  fluxEstime: number;
}

export interface DiplomeVariante {
  id: number;
  nom: string;
  langue: string;
  fraisInscription: number;
  actif: boolean;
  diplomeResponsableId: number;
  typeNom: string;
  departementNom: string;
  prerequis?: string[];              // Prérequis du TYPE (toujours présents)
  variantPrerequis?: {
    id: number;
    nom: string;
    actif: boolean;
    createdBy?: string;
    createdAt?: string;
    desactivatedBy?: string;
    desactivatedAt?: string;
  }[];
  niveaux?: {
    id: number;
    niveau: number;
    capaciteMax: number;
    tailleGroupe: number;
    scoreMinimum: number;
    actif: boolean;
  }[];
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  enseignantResponsable?: string;
}

export interface DiplomeResponsableDetail {
  id: number;
  nomDiplome: string;
  typeNom: string;
  departementId: number;
  actif: boolean;
  variantes: DiplomeVariante[];
  enseignantResponsable?: string;
  enseignantId?: number;
}

export interface TypeDTO {
  id: number;
  nom: string;
  actif: boolean;
}

export interface NiveauDiplome {
  id: number;
  niveau: number;
  actif: boolean;
}

export interface SelectedNiveau {
  niveauId: number;
  niveauInt: number;
  capaciteMax: number;
  tailleGroupe: number;
  scoreMinimum: number;
  selected: boolean;
}

export interface SelectedLangue {
  langue: string;
  selected: boolean;
  fraisInscription: number;
  niveaux: SelectedNiveau[];
}

export interface PrerequisItemDTO {
  id: number;
  nom: string;
  createdBy?: string;
  createdAt?: string;
  desactivatedBy?: string;
  desactivatedAt?: string;
  actif?: boolean;
  isDeletable?: boolean;
  isTypeLinked?: boolean;
  usages?: string[];
}

export interface EnseignantDTO {
  id: number;
  emailUniversitaire: string;
  diplomeResponsableId?: number | null;
  departementId?: number | null;
  typeId?: number | null;
}

export interface AnneeUniversitaire {
  id: number;
  annee: string;
  courante: boolean;
  verrouillee: boolean;
  dateOuverture?: string;
  dateFermeture?: string;
  scellee: boolean;
}

@Component({
  selector: 'app-departements-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './departements-management.component.html',
  styleUrl: './departements-management.component.css',
  providers: [NotificationService]
})
export class DepartementsManagementComponent implements OnInit {

  // ─── State ─────────────────────────────────────────────────────────────────
  departements: Departement[] = [];
  diplomesByDept: Map<number, DiplomeResponsableDetail[]> = new Map();
  loadingDiplomes: Record<number, boolean> = {};
  types: TypeDTO[] = [];
  niveauxList: NiveauDiplome[] = [];
  languesDisponibles = ['FRANCAIS', 'ANGLAIS', 'ARABE'];

  // ✅ NOUVEAU — enseignants libres
  enseignantsLibres: EnseignantDTO[] = [];
  enseignantAutoAssigne: EnseignantDTO | null = null;
  loadingEnseignants = false;

  // ✅ NOUVEAU — Année Universitaire
  anneeUniversitaire: string = '';
  anneesDisponibles: AnneeUniversitaire[] = [];

  loading = false;
  expandedDeptId: number | null = null;
  expandedDepts: Set<number> = new Set(); // Multi-expand support
  viewMode: 'grid' | 'list' = 'grid';
  adminEmail = '';
  originalVariante: any = null;

  // ─── Modals ────────────────────────────────────────────────────────────────
  showCreateDeptModal = false;
  showCreateDiplomeModal = false;
  showCreateVarianteModal = false;
  showEditVarianteModal = false;
  showAdminConfigModal = false;
  showYearSettingsModal = false;
  showUnlockConfirmationModal = false; // ✅ Security
  showCloneErrorModal = false;         // ✅ Clone Error Popup
  showConfirmModal = false;            // ✅ Professional Confirm Modal
  confirmConfig = {
    title: '',
    message: '',
    confirmText: 'Confirmer',
    cancelText: 'Annuler',
    isAlert: false,
    resolve: (val: boolean) => { }
  };
  cloneErrorMessage = '';              // ✅ Error message from backend
  cloneConditionDate = false;          // ✅ Track if date condition reached
  cloneConditionDossiers = false;      // ✅ Track if dossiers condition reached
  formLoading = false;

  yearToUnlock: AnneeUniversitaire | null = null; // ✅ Security

  selectedDept: Departement | null = null;
  selectedDiplomeResponsable: DiplomeResponsableDetail | null = null;

  deptForm = { nom: '' };

  diplomeForm = {
    nomDiplome: '',
    typeId: 0,
    enseignantId: 0
  };

  languesSelection: SelectedLangue[] = [];

  varianteForm = {
    diplomeResponsableId: 0,
    langue: '',
    fraisInscription: 0,
    niveaux: [] as SelectedNiveau[]
  };

  editVarianteForm = {
    id: 0,
    langue: '',
    fraisInscription: 0,
    actif: true,
    deptId: undefined as number | undefined,
    niveaux: [] as SelectedNiveau[]
  };

  adminConfig = {
    types: [] as TypeDTO[],
    niveaux: [] as NiveauDiplome[]
  };

  newTypeForm = { nom: '' };
  newNiveauForm = { niveau: 1 };
  formErrors: Record<string, boolean> = {};

  // ✅ NOUVEAU — Gestion Admin Prérequis
  adminPrerequis: any[] = [];
  loadingAdminPrerequis = false;
  activeAdminTab: 'types' | 'niveaux' | 'prerequis' = 'types';

  toastVisible = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';

  predictions: PredictionDTO[] = [];
  predictionsLoading = false;

  // ─── URLs ──────────────────────────────────────────────────────────────────
  private baseUrl = `${environment.apiUrl}/DEPARTEMENT-SERVICE`;
  private deptUrl = `${this.baseUrl}/api/departements`;
  private diplomeUrl = `${this.baseUrl}/api/diplomes`;
  private typesUrl = `${this.baseUrl}/api/types`;
  private niveauxUrl = `${this.baseUrl}/api/niveaux`;
  private adminConfigUrl = `${this.baseUrl}/api/admin/config`;
  private prerequisAdminUrl = `${this.baseUrl}/api/prerequis-config`;
  private enseignantUrl = `${this.baseUrl}/api/enseignants`;
  private authUrl = `${environment.apiUrl}/AUTHENTIFICATION-SERVICE/authentifier/utilisateurs`;

  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private notificationService: NotificationService,
    private keycloak: KeycloakService,
    private cdr: ChangeDetectorRef
  ) { }

  async ngOnInit() {
    this.loadAnneesUniversitaires();
    this.loadTypes();
    this.loadNiveaux();

    // Charger l'email de l'admin
    if (await this.keycloak.isLoggedIn()) {
      const profile = await this.keycloak.loadUserProfile();
      this.adminEmail = profile.email || '';
    }
  }

  // ─── Chargement ────────────────────────────────────────────────────────────

  // ✅ NOUVEAU — Gérer changement année
  loadAnneesUniversitaires(): void {
    this.http.get<AnneeUniversitaire[]>(`${this.deptUrl}/annees-universitaires`).subscribe({
      next: (res) => {
        this.anneesDisponibles = res.sort((a, b) => b.annee.localeCompare(a.annee));
        this.http.get(`${this.deptUrl}/annee-courante`, { responseType: 'text' }).subscribe({
          next: (courante) => {
            this.anneeUniversitaire = courante;
            this.loadDepartements();
            this.loadPredictions();
          },
          error: () => {
            if (this.anneesDisponibles.length > 0) {
              this.anneeUniversitaire = this.anneesDisponibles[0].annee;
            }
            this.loadDepartements();
          }
        });
      },
      error: (err) => {
        this.showToast(this.extractErrorMessage(err), 'error');
        this.loadDepartements();
      }
    });
  }

  get isReadOnly(): boolean {
    const selected = this.anneesDisponibles.find(a => a.annee === this.anneeUniversitaire);
    return selected ? selected.verrouillee : false;
  }

  // ✅ Getter pour la bannière de sécurité
  get isPastYearUnlocked(): boolean {
    if (this.anneesDisponibles.length === 0) return false;
    return !this.isLatestYear && !this.isReadOnly;
  }

  get isLatestYear(): boolean {
    if (this.anneesDisponibles.length === 0) return false;
    return this.anneeUniversitaire === this.anneesDisponibles[0].annee;
  }

  openYearSettingsModal(): void {
    this.showYearSettingsModal = true;
  }

  toggleYearLock(annee: AnneeUniversitaire): void {
    if (annee.verrouillee) {
      // Tentative de déverrouillage -> Sécurité
      this.yearToUnlock = annee;
      this.showUnlockConfirmationModal = true;
    } else {
      // Verrouillage immédiat
      this.executeToggleLock(annee);
    }
  }

  confirmUnlock(): void {
    if (this.yearToUnlock) {
      this.executeToggleLock(this.yearToUnlock);
      this.showUnlockConfirmationModal = false;
      this.yearToUnlock = null;
    }
  }

  relockCurrentYear(): void {
    const selected = this.anneesDisponibles.find(a => a.annee === this.anneeUniversitaire);
    if (selected) {
      this.executeToggleLock(selected);
    }
  }

  private executeToggleLock(annee: AnneeUniversitaire): void {
    const newStatus = !annee.verrouillee;

    this.http.patch<AnneeUniversitaire>(`${this.deptUrl}/annees-universitaires/${annee.id}`, {
      verrouillee: newStatus,
      courante: annee.courante,
      dateOuverture: annee.dateOuverture,
      dateFermeture: annee.dateFermeture
    }).subscribe({
      next: (res) => {
        annee.verrouillee = res.verrouillee;
        annee.scellee = res.scellee;
        this.showToast(`Année ${annee.annee} ${res.verrouillee ? 'verrouillée' : 'déverrouillée'}`, 'success');
        this.loadAnneesUniversitaires(); // Refresh for scellee status
      },
      error: (err) => {
        this.showToast(this.extractErrorMessage(err), 'error');
      }
    });
  }

  canCloneYear(annee: AnneeUniversitaire): boolean {
    if (!annee.courante || annee.scellee) return false;
    if (!annee.dateFermeture) return false;
    const now = new Date();
    const closeDate = new Date(annee.dateFermeture);
    return now > closeDate;
  }

  async cloneYear(annee: AnneeUniversitaire): Promise<void> {
    if (!this.canCloneYear(annee)) return;

    const confirmed = await this.askConfirmation(
      `Clôture de l'Année Académique`,
      `Voulez-vous clôturer l'année ${annee.annee} et cloner vers l'année suivante ? Cette action est irréversible.`,
      `Confirmer le Clonage`
    );

    if (!confirmed) return;

    this.formLoading = true;
    this.http.post<AnneeUniversitaire>(`${this.deptUrl}/annees-universitaires/${annee.id}/cloner`, {}).subscribe({
      next: (res) => {
        this.formLoading = false;
        this.showToast(`Clonage réussi ! L'année ${res.annee} est maintenant l'année courante.`, 'success');
        this.loadAnneesUniversitaires();
      },
      error: (err) => {
        this.formLoading = false;
        const msg = this.extractErrorMessage(err);

        // Si c'est un message de validation métier, on montre le modal avec les détails
        if (msg.includes('dossiers') || msg.includes('campagne') || msg.includes('clôture') || msg.includes('expirée')) {
          this.cloneErrorMessage = msg;
          // On déduit les conditions de l'erreur (simplifié)
          this.cloneConditionDate = !msg.includes('expirée') && !msg.includes('fermeture');
          this.cloneConditionDossiers = !msg.includes('dossiers');
          this.showCloneErrorModal = true;
        } else {
          // Sinon c'est une erreur technique (ex: SQL), on montre un toast standard
          this.showToast(msg, 'error');
        }
      }
    });
  }

  saveCampaignDates(annee: AnneeUniversitaire): void {
    this.http.patch<AnneeUniversitaire>(`${this.deptUrl}/annees-universitaires/${annee.id}`, {
      courante: annee.courante,
      verrouillee: annee.verrouillee,
      dateOuverture: annee.dateOuverture,
      dateFermeture: annee.dateFermeture
    }).subscribe({
      next: (res) => {
        annee.scellee = res.scellee;
        annee.verrouillee = res.verrouillee;
        this.showToast(`Dates de campagne mises à jour pour ${annee.annee}`, 'success');
      },
      error: (err) => this.showToast(this.extractErrorMessage(err), 'error')
    });
  }

  onAnneeChange(): void {
    this.expandedDeptId = null;
    this.diplomesByDept.clear();
    this.loadDepartements();
    this.loadPredictions();
  }

  loadPredictions(): void {
    if (!this.anneesDisponibles || this.anneesDisponibles.length < 2) {
      this.predictions = [];
      return;
    }

    const isCouranteNew = this.anneeUniversitaire === this.anneesDisponibles[0].annee;
    if (!isCouranteNew) {
      this.predictions = [];
      return;
    }

    // Si l'année sélectionnée est la plus récente, on compare avec l'année N-1
    const anneeCible = this.anneesDisponibles[0].annee;
    const anneeSource = this.anneesDisponibles[1].annee;

    this.predictionsLoading = true;
    this.http.get<PredictionDTO[]>(`${this.deptUrl}/predictions-ouvertures?ancienneAnnee=${anneeSource}&nouvelleAnnee=${anneeCible}`).subscribe({
      next: (res) => {
        this.predictions = res;
        this.predictionsLoading = false;
      },
      error: () => {
        this.predictionsLoading = false;
      }
    });
  }



  askConfirmation(title: string, message: string, confirmText: string = 'Confirmer', isAlert: boolean = false): Promise<boolean> {
    this.showConfirmModal = true;
    this.confirmConfig = {
      ...this.confirmConfig,
      title,
      message,
      confirmText,
      cancelText: isAlert ? '' : 'Annuler',
      isAlert
    };
    return new Promise((res) => {
      this.confirmConfig.resolve = (val: boolean) => {
        this.showConfirmModal = false;
        res(val);
      };
    });
  }

  extractErrorMessage(err: any): string {
    if (typeof err === 'string') return err;
    if (err?.error?.message) return err.error.message;
    if (err?.error && typeof err.error === 'string') return err.error;

    // Si c'est un code 409 (Conflict) mais sans message clair
    if (err?.status === 409) return 'Cette action est impossible car des contraintes d\'intégrité ne sont pas respectées.';

    // Au cas où Angular renvoie une erreur de parsing (Unexpected token), on vérifie le contenu brut
    const technicalMsg = err?.message || '';
    if (technicalMsg.includes('Unexpected token') || technicalMsg.includes('is not valid JSON')) {
      if (err.error && typeof err.error === 'string') return err.error;
      // Si on ne trouve rien dans .error, on peut essayer d'extraire entre les guillemets dans le message technique
    }

    // Filtrer les messages techniques d'Angular
    if (err?.message && !err.message.includes('Http failure response')) return err.message;
    if (err?.statusText && err.statusText !== 'OK') return `Erreur ${err.status}: ${err.statusText}`;

    return 'Une erreur inattendue est survenue';
  }

  loadDepartements(): void {
    this.loading = true;
    this.http.get<Departement[]>(`${this.deptUrl}?annee=${this.anneeUniversitaire}`).subscribe({
      next: (res) => {
        this.departements = [...res];
        this.loading = false;

        // Créer une nouvelle Map pour forcer la détection de changements
        const newMap = new Map<number, DiplomeResponsableDetail[]>();
        this.departements.forEach(d => {
          if (d.diplomes && d.diplomes.length > 0) {
            const grouped = this.groupVariantesByResponsable(d.diplomes, d.id);
            newMap.set(d.id, grouped);
          }
        });
        this.diplomesByDept = newMap;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.showToast(this.extractErrorMessage(err), 'error');
      }
    });
  }

  loadTypes(): void {
    this.http.get<TypeDTO[]>(this.typesUrl).subscribe({
      next: (res) => this.types = res,
      error: () => console.warn('Types non chargés')
    });
  }

  loadNiveaux(): void {
    this.http.get<NiveauDiplome[]>(this.niveauxUrl).subscribe({
      next: (res) => {
        this.niveauxList = res.sort((a, b) => a.niveau - b.niveau);
      },
      error: () => console.warn('Niveaux non chargés')
    });
  }

  // ✅ NOUVEAU — Charger enseignants libres (sans aucune responsabilité)
  loadEnseignantsLibres(): void {
    this.loadingEnseignants = true;
    this.http.get<EnseignantDTO[]>(`${this.enseignantUrl}/libres`).subscribe({
      next: (res) => {
        this.enseignantsLibres = res;
        this.loadingEnseignants = false;
      },
      error: () => {
        this.loadingEnseignants = false;
        this.showToast('Erreur lors du chargement des enseignants', 'error');
      }
    });
  }

  // ✅ NOUVEAU — Vérifier si le dept a déjà une licence et retourner son enseignant
  getEnseignantExistantPourLicence(deptId: number): DiplomeResponsableDetail | null {
    const diplomes = this.getDiplomesForDept(deptId);
    return diplomes.find(dr =>
      dr.typeNom?.toUpperCase().includes('LICENCE') && dr.enseignantId
    ) ?? null;
  }

  // ✅ NOUVEAU — Logique enseignant selon le type sélectionné
  onTypeChange(): void {
    this.diplomeForm.enseignantId = 0;
    this.enseignantAutoAssigne = null;

    const typeNom = this.types.find(t => t.id === this.diplomeForm.typeId)?.nom?.toUpperCase() ?? '';

    if (typeNom.includes('LICENCE') && this.selectedDept) {
      // Chercher si une licence existe déjà dans ce département
      const licenceExistante = this.getEnseignantExistantPourLicence(this.selectedDept.id);
      if (licenceExistante && licenceExistante.enseignantId) {
        // Auto-assigner le même enseignant
        this.diplomeForm.enseignantId = licenceExistante.enseignantId;
        this.enseignantAutoAssigne = {
          id: licenceExistante.enseignantId,
          emailUniversitaire: licenceExistante.enseignantResponsable ?? ''
        };
        return; // Pas besoin de charger les libres
      }
    }

    // MASTER ou première LICENCE → charger les enseignants libres
    this.loadEnseignantsLibres();
  }

  // ✅ NOUVEAU — Getter pour savoir si on doit afficher le dropdown enseignant
  get showEnseignantDropdown(): boolean {
    return this.diplomeForm.typeId > 0 && this.enseignantAutoAssigne === null;
  }

  get isEnseignantAutoAssigned(): boolean {
    return this.enseignantAutoAssigne !== null;
  }

  // ─── Admin Config ─────────────────────────────────────────────────────────

  loadAdminConfig(): void {
    this.http.get<{ types: TypeDTO[], niveaux: NiveauDiplome[] }>(`${this.adminConfigUrl}/all`).subscribe({
      next: (res) => {
        this.adminConfig.types = res.types;
        this.adminConfig.niveaux = res.niveaux.sort((a, b) => a.niveau - b.niveau);
      },
      error: (err) => this.showToast(this.extractErrorMessage(err), 'error')
    });
  }

  openAdminConfigModal(): void {
    this.activeAdminTab = 'types';
    this.loadAdminConfig();
    this.loadAdminPrerequis();
    this.newTypeForm = { nom: '' };
    this.newNiveauForm = { niveau: 1 };
    this.showAdminConfigModal = true;
  }

  loadAdminPrerequis(): void {
    this.loadingAdminPrerequis = true;
    this.http.get<any[]>(`${this.prerequisAdminUrl}/admin/all`).subscribe({
      next: (res) => {
        this.adminPrerequis = res;
        this.loadingAdminPrerequis = false;
      },
      error: (err) => {
        this.loadingAdminPrerequis = false;
        this.showToast(this.extractErrorMessage(err), 'error');
      }
    });
  }

  togglePrerequisStatusGlobal(p: any): void {
    const newStatus = !p.actif;
    this.http.put(`${this.prerequisAdminUrl}/available/${p.id}/toggle-status`, {}, {
      params: {
        email: this.adminEmail,
        active: newStatus.toString()
      }
    }).subscribe({
      next: () => {
        p.actif = newStatus;
        this.showToast(`Prérequis "${p.nom}" ${newStatus ? 'activé' : 'désactivé'}`, 'success');
        this.loadAdminPrerequis(); // Refresh for audit fields
      },
      error: (err) => {
        this.showToast(this.extractErrorMessage(err), 'error');
      }
    });
  }

  addType(): void {
    if (!this.newTypeForm.nom.trim()) return;
    this.formLoading = true;
    this.http.post<TypeDTO>(`${this.adminConfigUrl}/types`, this.newTypeForm).subscribe({
      next: (t) => {
        this.adminConfig.types.push(t);
        this.loadTypes();
        this.newTypeForm.nom = '';
        this.formLoading = false;
        this.showToast('Nouveau type ajouté', 'success');
      },
      error: (err) => {
        this.formLoading = false;
        this.showToast(this.extractErrorMessage(err), 'error');
      }
    });
  }

  addNiveau(): void {
    if (this.newNiveauForm.niveau < 1) return;
    this.formLoading = true;
    this.http.post<NiveauDiplome>(`${this.adminConfigUrl}/niveaux`, this.newNiveauForm).subscribe({
      next: (n) => {
        this.adminConfig.niveaux.push(n);
        this.adminConfig.niveaux.sort((a, b) => a.niveau - b.niveau);
        this.loadNiveaux();
        this.formLoading = false;
        this.showToast('Nouveau niveau ajouté', 'success');
      },
      error: (err) => {
        this.formLoading = false;
        this.showToast(this.extractErrorMessage(err), 'error');
      }
    });
  }

  toggleTypeActif(type: TypeDTO): void {
    this.http.put<TypeDTO>(`${this.adminConfigUrl}/types/${type.id}/toggle-actif`, {}).subscribe({
      next: (updated) => {
        type.actif = updated.actif;
        this.loadTypes();
        this.showToast('Statut mis à jour', 'success');
      },
      error: (err) => {
        const msg = this.extractErrorMessage(err);
        if (msg.includes('demandes d\'inscription')) {
          this.askConfirmation('Action Bloquée', msg, 'J\'ai compris', true);
        } else {
          this.showToast(msg, 'error');
        }
      }
    });
  }

  toggleNiveauActif(n: NiveauDiplome): void {
    this.http.put<NiveauDiplome>(`${this.adminConfigUrl}/niveaux/${n.id}/toggle-actif`, {}).subscribe({
      next: (updated) => {
        n.actif = updated.actif;
        this.loadNiveaux();
        this.showToast('Statut mis à jour', 'success');
      },
      error: (err) => {
        const msg = this.extractErrorMessage(err);
        if (msg.includes('demandes d\'inscription')) {
          this.askConfirmation('Action Bloquée', msg, 'J\'ai compris', true);
        } else {
          this.showToast(msg, 'error');
        }
      }
    });
  }

  initLangueSelection(): void {
    this.languesSelection = this.languesDisponibles.map(lang => ({
      langue: lang,
      selected: false,
      fraisInscription: 0,
      niveaux: this.niveauxList.map(n => ({
        niveauId: n.id,
        niveauInt: n.niveau,
        capaciteMax: 30,
        tailleGroupe: 15,
        scoreMinimum: 10,
        selected: false
      }))
    }));
  }

  isLevelEnabled(langOrVar: { niveaux: SelectedNiveau[] }, niveauInt: number): boolean {
    if (niveauInt === 1) return true;
    const prevLevel = langOrVar.niveaux.find(n => n.niveauInt === niveauInt - 1);
    return !!prevLevel?.selected;
  }

  onLevelToggle(langOrVar: { niveaux: SelectedNiveau[] }, nivel: SelectedNiveau): void {
    if (!nivel.selected) {
      langOrVar.niveaux.forEach(n => {
        if (n.niveauInt > nivel.niveauInt) n.selected = false;
      });
    }
  }

  loadDiplomesForDept(deptId: number): void {
    this.loadingDiplomes[deptId] = true;
    this.http.get<any[]>(`${this.diplomeUrl}/departement/${deptId}?annee=${this.anneeUniversitaire}`).subscribe({
      next: (res) => {
        const grouped = this.groupVariantesByResponsable(res, deptId);
        // Mise à jour immuable de la Map
        const newMap = new Map(this.diplomesByDept);
        newMap.set(deptId, grouped);
        this.diplomesByDept = newMap;

        this.loadingDiplomes[deptId] = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadingDiplomes[deptId] = false;
        this.showToast('Erreur lors du chargement des diplômes', 'error');
      }
    });
  }

  private groupVariantesByResponsable(dtos: any[], deptId: number): DiplomeResponsableDetail[] {
    const map = new Map<number, DiplomeResponsableDetail>();
    for (const dto of dtos) {
      const respId = dto.diplomeResponsableId;
      if (!respId) continue;
      if (!map.has(respId)) {
        map.set(respId, {
          id: respId,
          nomDiplome: dto.nomDiplome,
          typeNom: dto.typeNom ?? dto.type ?? '',
          departementId: deptId,
          actif: dto.diplomeResponsableActif ?? true,
          variantes: [],
          enseignantResponsable: dto.enseignantResponsable,
          enseignantId: dto.enseignantId // ← NOUVEAU
        });
      }
      map.get(respId)!.variantes.push({
        id: dto.id,
        nom: dto.nomDiplome,
        langue: dto.langue,
        fraisInscription: dto.fraisInscription,
        actif: dto.actif,
        diplomeResponsableId: respId,
        typeNom: dto.typeNom,
        departementNom: dto.departementNom,
        niveaux: dto.niveaux?.sort((a: any, b: any) => a.niveau - b.niveau),
        prerequis: dto.prerequis ? Array.from(dto.prerequis) : [],
        variantPrerequis: dto.variantPrerequis ?? [],
        createdBy: dto.createdBy,
        createdAt: dto.createdAt,
        updatedBy: dto.updatedBy,
        updatedAt: dto.updatedAt,
        enseignantResponsable: dto.enseignantResponsable
      });
    }
    return Array.from(map.values());
  }

  getTotalVariantesForDept(deptId: any): number {
    const id = Number(deptId);
    return this.diplomesByDept.get(id)
      ?.reduce((sum, dr) => sum + dr.variantes.length, 0) ?? 0;
  }

  toggleDept(deptId: any): void {
    const id = Number(deptId);
    if (this.expandedDeptId === id) {
      this.expandedDeptId = null;
    } else {
      this.expandedDeptId = id;
      if (!this.diplomesByDept.has(id)) {
        this.loadDiplomesForDept(id);
      }
    }
  }

  getDiplomesForDept(deptId: any): DiplomeResponsableDetail[] {
    return this.diplomesByDept.get(Number(deptId)) ?? [];
  }

  getDiplomesCountForDept(deptId: any): number {
    return this.diplomesByDept.get(Number(deptId))?.length ?? 0;
  }

  getTotalDiplomesResponsables(): number {
    let total = 0;
    this.diplomesByDept.forEach(v => total += v.length);
    return total;
  }

  getTotalVariantes(): number {
    let total = 0;
    this.diplomesByDept.forEach(v => v.forEach(dr => total += dr.variantes.length));
    return total;
  }

  getDeptGradient(index: number): string {
    const g = [
      'linear-gradient(135deg, #3b82f6, #1d4ed8)',
      'linear-gradient(135deg, #8b5cf6, #6d28d9)',
      'linear-gradient(135deg, #10b981, #047857)',
      'linear-gradient(135deg, #f59e0b, #b45309)',
      'linear-gradient(135deg, #ef4444, #b91c1c)',
      'linear-gradient(135deg, #06b6d4, #0e7490)',
    ];
    return g[index % g.length];
  }

  getTypeIconSVG(type: string): SafeHtml {
    const t = type?.toUpperCase() || '';
    let svg = '';
    if (t.includes('LICENCE')) {
      svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
    } else if (t.includes('MASTER')) {
      svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a4 4 0 0 0-4-4H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a4 4 0 0 1 4-4h6z"/></svg>`;
    } else if (t.includes('DOCTORAT')) {
      svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>`;
    } else if (t.includes('BTS')) {
      svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
    } else if (t.includes('INGENIEUR')) {
      svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
    } else {
      svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
    }
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  getTypeClass(type: string): string {
    const c: Record<string, string> = {
      'LICENCE': 'type-licence', 'MASTER': 'type-master',
      'DOCTORAT': 'type-doctorat', 'BTS': 'type-bts', 'INGENIEUR': 'type-ing'
    };
    return c[type?.toUpperCase()] ?? 'type-default';
  }

  getLangueFlag(langue: string): string {
    const f: Record<string, string> = {
      'FRANCAIS': '🇫🇷', 'ARABE': '🇹🇳', 'ANGLAIS': '🇬🇧'
    };
    return f[langue] ?? '🌐';
  }

  // ─── CRUD Département ──────────────────────────────────────────────────────

  openCreateDeptModal(): void {
    this.deptForm = { nom: '' };
    this.formErrors = {};
    this.showCreateDeptModal = true;
  }

  createDepartement(): void {
    this.formErrors = {};
    if (!this.deptForm.nom.trim()) {
      this.formErrors['nom'] = true;
      return;
    }
    if (this.departements.some(d => d.nom.toLowerCase() === this.deptForm.nom.trim().toLowerCase())) {
      this.showToast(`Le département « ${this.deptForm.nom} » existe déjà`, 'error');
      return;
    }
    this.formLoading = true;
    this.http.post<Departement>(`${this.deptUrl}?annee=${this.anneeUniversitaire}`, { nom: this.deptForm.nom }).subscribe({
      next: (dept) => {
        this.departements = [...this.departements, dept];
        this.formLoading = false;
        this.closeModals();
        this.showToast(`Département « ${dept.nom} » créé`, 'success');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.formLoading = false;
        this.showToast(err.error?.message ?? 'Erreur lors de la création', 'error');
      }
    });
  }

  // ─── CRUD DiplomeResponsable ───────────────────────────────────────────────

  openCreateDiplomeModal(dept: Departement): void {
    this.selectedDept = dept;
    this.diplomeForm = { nomDiplome: '', typeId: 0, enseignantId: 0 };
    this.enseignantsLibres = [];
    this.enseignantAutoAssigne = null;
    this.initLangueSelection();
    this.formErrors = {};
    this.showCreateDiplomeModal = true;
  }

  createDiplomeResponsable(): void {
    this.formErrors = {};
    if (!this.diplomeForm.nomDiplome.trim()) { this.formErrors['nomDiplome'] = true; }
    if (!this.diplomeForm.typeId) { this.formErrors['typeId'] = true; }

    // ✅ Valider enseignant obligatoire
    if (!this.diplomeForm.enseignantId) {
      this.formErrors['enseignantId'] = true;
      this.showToast('Veuillez sélectionner un enseignant responsable', 'error');
      return;
    }

    const selectedLangs = this.languesSelection.filter(l => l.selected);
    if (selectedLangs.length === 0) {
      this.showToast('Veuillez sélectionner au moins une langue', 'error');
      return;
    }

    for (const lang of selectedLangs) {
      if (lang.fraisInscription <= 0) {
        this.showToast(`Veuillez saisir les frais pour ${lang.langue}`, 'error');
        return;
      }
      if (!lang.niveaux.some(n => n.selected)) {
        this.showToast(`Veuillez sélectionner au moins un niveau pour ${lang.langue}`, 'error');
        return;
      }
    }

    if (Object.values(this.formErrors).some(Boolean)) return;

    this.formLoading = true;

    const payload = {
      nomDiplome: this.diplomeForm.nomDiplome,
      typeId: this.diplomeForm.typeId,
      departementId: this.selectedDept!.id,
      anneeUniversitaire: this.anneeUniversitaire, // ✅ Ajouté pour le DiplomeResponsable
      variantes: selectedLangs.map(l => ({
        langue: l.langue,
        fraisInscription: l.fraisInscription,
        actif: true,
        anneeUniversitaire: this.anneeUniversitaire,
        niveaux: l.niveaux.filter(n => n.selected).map(n => ({
          niveauId: n.niveauId,
          capaciteMax: n.capaciteMax,
          tailleGroupe: n.tailleGroupe,
          scoreMinimum: n.scoreMinimum ?? 10,
          actif: true
        }))
      }))
    };

    // ✅ ÉTAPE 1 — Créer le diplôme
    this.http.post<any>(`${this.deptUrl}/diplomes-responsables`, payload).subscribe({
      next: (diplomeCreated) => {
        const diplomeId = diplomeCreated.id ?? diplomeCreated.diplomeResponsableId;
        const enseignantId = this.diplomeForm.enseignantId;

        // ✅ ÉTAPE 2 — Assigner l'enseignant au diplôme (toujours appelé pour déclencher la notification backend)
        this.assignerEnseignantAuDiplome(enseignantId, diplomeId, this.selectedDept!.id);
      },
      error: (err) => {
        this.formLoading = false;
        this.showToast(this.extractErrorMessage(err), 'error');
      }
    });
  }

  // ✅ NOUVEAU — Assigner l'enseignant + mettre à jour son rôle
  private assignerEnseignantAuDiplome(enseignantId: number, diplomeId: number, deptId: number): void {
    const typeNom = this.types.find(t => t.id === this.diplomeForm.typeId)?.nom?.toUpperCase() ?? '';
    const isLicence = typeNom.includes('LICENCE');

    const updatePayload: any = {
      nomDiplome: this.diplomeForm.nomDiplome
    };
    if (isLicence) {
      updatePayload.departementId = deptId;
      updatePayload.typeId = this.diplomeForm.typeId;
      updatePayload.diplomeResponsableId = null;
    } else {
      updatePayload.diplomeResponsableId = diplomeId;
      updatePayload.departementId = null;
      updatePayload.typeId = null;
    }

    // ÉTAPE 2a — PUT enseignant : remplir la responsabilité (Mode 1 ou Mode 2)
    this.http.put<EnseignantDTO>(`${this.enseignantUrl}/${enseignantId}`, updatePayload).subscribe({
      next: (enseignant) => {

        // ÉTAPE 2b — Chercher l'utilisateur par email pour mettre à jour son rôle (sans filtrer par rôle pour trouver les auto-assignés)
        this.http.get<any[]>(this.authUrl).subscribe({
          next: (users) => {
            const utilisateur = users?.find(
              (u: any) => u.login === enseignant.emailUniversitaire
            );

            if (utilisateur) {
              // ÉTAPE 2c — Changer le rôle → ENSEIGNANT_RESPONSABLE
              this.http.put(`${this.authUrl}/${utilisateur.id}/role`, {
                role: 'ENSEIGNANT_RESPONSABLE'
              }).subscribe({
                next: () => {
                  this.finalizeDiplomeCreation(deptId, enseignant.emailUniversitaire);
                },
                error: (err) => {
                  this.rollbackCreation(diplomeId, deptId, `Erreur rôle: ${this.extractErrorMessage(err)}`);
                }
              });
            } else {
              this.rollbackCreation(diplomeId, deptId, `Utilisateur ${enseignant.emailUniversitaire} introuvable dans le module d'authentification. Création annulée.`);
            }
          },
          error: (err) => {
            this.rollbackCreation(diplomeId, deptId, `Erreur vérification: ${this.extractErrorMessage(err)}`);
          }
        });
      },
      error: (err) => {
        this.rollbackCreation(diplomeId, deptId, this.extractErrorMessage(err));
      }
    });
  }

  // ✅ NOUVEAU — Annuler la création si une étape échoue (All or Nothing)
  private rollbackCreation(diplomeId: number, deptId: number, errorMessage: string): void {
    this.http.delete(`${this.deptUrl}/diplomes-responsables/${diplomeId}`).subscribe({
      next: () => {
        this.formLoading = false;
        this.showToast(errorMessage, 'error');
      },
      error: () => {
        this.formLoading = false;
        this.showToast(errorMessage + ' (⚠️ Échec de l\'annulation)', 'error');
      }
    });
  }

  // ✅ NOUVEAU — Finaliser après création
  private finalizeDiplomeCreation(deptId: number, enseignantEmail?: string): void {
    this.formLoading = false;
    this.closeModals();
    // Mise à jour immuable de la Map pour forcer le rafraîchissement
    const id = Number(deptId);
    const newMap = new Map(this.diplomesByDept);
    newMap.delete(id);
    this.diplomesByDept = newMap;

    // Charger systématiquement avec un léger délai pour la persistence backend
    setTimeout(() => {
      this.loadDiplomesForDept(id);
      this.loadDepartements();
    }, 400);

    this.showToast(`Diplôme « ${this.diplomeForm.nomDiplome} » créé avec succès`, 'success');
    this.cdr.detectChanges();
  }

  // ─── CRUD Variante ─────────────────────────────────────────────────────────

  openCreateVarianteModal(dr: DiplomeResponsableDetail): void {
    this.selectedDiplomeResponsable = dr;
    this.varianteForm = {
      diplomeResponsableId: dr.id,
      langue: '',
      fraisInscription: 0,
      niveaux: this.niveauxList.map(n => ({
        niveauId: n.id,
        niveauInt: n.niveau,
        capaciteMax: 30,
        tailleGroupe: 15,
        scoreMinimum: 10,
        selected: false
      }))
    };
    this.formErrors = {};
    this.showCreateVarianteModal = true;
  }

  createVariante(): void {
    this.formErrors = {};
    if (!this.varianteForm.langue) { this.formErrors['varLangue'] = true; }
    if (this.varianteForm.fraisInscription <= 0) { this.formErrors['varFrais'] = true; }

    const selectedNiveaux = this.varianteForm.niveaux.filter(n => n.selected);
    if (selectedNiveaux.length === 0) {
      this.showToast('Veuillez sélectionner au moins un niveau', 'error');
      return;
    }
    if (Object.values(this.formErrors).some(Boolean)) return;
    if (this.selectedDiplomeResponsable?.variantes.some(v => v.langue === this.varianteForm.langue)) {
      this.showToast(`La langue « ${this.varianteForm.langue} » existe déjà pour ce diplôme`, 'error');
      return;
    }

    this.formLoading = true;
    const payload = {
      diplomeResponsableId: this.selectedDiplomeResponsable!.id,
      langue: this.varianteForm.langue,
      fraisInscription: this.varianteForm.fraisInscription,
      actif: true,
      anneeUniversitaire: this.anneeUniversitaire,
      niveaux: selectedNiveaux.map(n => ({
        niveauId: n.niveauId,
        capaciteMax: n.capaciteMax,
        tailleGroupe: n.tailleGroupe,
        scoreMinimum: n.scoreMinimum,
        actif: true
      }))
    };

    this.http.post<any>(`${this.diplomeUrl}`, payload).subscribe({
      next: () => {
        this.formLoading = false;
        const id = Number(this.selectedDiplomeResponsable!.departementId);
        this.closeModals();

        // Mise à jour immuable de la Map
        const newMap = new Map(this.diplomesByDept);
        newMap.delete(id);
        this.diplomesByDept = newMap;

        setTimeout(() => {
          this.loadDiplomesForDept(id);
          this.loadDepartements();
        }, 400);

        this.showToast(`Variante ${this.varianteForm.langue} ajoutée`, 'success');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.formLoading = false;
        this.showToast(this.extractErrorMessage(err), 'error');
      }
    });
  }

  toggleVarianteStatus(variante: DiplomeVariante, deptId?: any): void {
    const id = deptId ? Number(deptId) : undefined;
    const oldStatus = variante.actif;
    variante.actif = !variante.actif;
    this.http.patch(`${this.diplomeUrl}/${variante.id}/toggle`, {}).subscribe({
      next: () => {
        this.showToast(`Statut mis à jour pour ${variante.langue}`, 'success');

        if (id) {
          const newMap = new Map(this.diplomesByDept);
          newMap.delete(id);
          this.diplomesByDept = newMap;
          this.loadDiplomesForDept(id);
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        variante.actif = oldStatus;
        this.showToast(this.extractErrorMessage(err), 'error');
      }
    });
  }

  toggleDeptStatus(dept: Departement): void {
    const oldStatus = dept.actif;
    dept.actif = !dept.actif;
    this.http.patch(`${this.deptUrl}/${dept.id}/toggle`, {}).subscribe({
      next: () => {
        this.showToast(`Département ${dept.nom} est désormais ${dept.actif ? 'actif' : 'inactif'}`, 'success');
        this.loadDepartements();
        this.cdr.detectChanges();
      },
      error: (err) => {
        dept.actif = oldStatus;
        this.showToast(this.extractErrorMessage(err), 'error');
      }
    });
  }

  toggleDiplomeStatus(dr: DiplomeResponsableDetail): void {
    const deptId = Number(dr.departementId);
    const oldStatus = dr.actif;
    dr.actif = !dr.actif;
    this.http.patch(`${this.deptUrl}/diplomes-responsables/${dr.id}/toggle`, {}).subscribe({
      next: () => {
        this.showToast(`${dr.nomDiplome} est désormais ${dr.actif ? 'actif' : 'inactif'}`, 'success');

        const newMap = new Map(this.diplomesByDept);
        newMap.delete(deptId);
        this.diplomesByDept = newMap;
        
        setTimeout(() => {
          this.loadDiplomesForDept(deptId);
          this.loadDepartements();
        }, 300);
        this.cdr.detectChanges();
      },
      error: (err) => {
        dr.actif = oldStatus;
        this.showToast(this.extractErrorMessage(err), 'error');
      }
    });
  }

  openEditVarianteModal(v: DiplomeVariante, deptId?: number): void {
    this.editVarianteForm = {
      id: v.id,
      langue: v.langue,
      fraisInscription: v.fraisInscription,
      actif: v.actif,
      deptId: deptId,
      niveaux: this.niveauxList.map(n => {
        const existing = v.niveaux?.find(vn => vn.id === n.id);
        return {
          niveauId: n.id,
          niveauInt: n.niveau,
          capaciteMax: existing?.capaciteMax ?? 30,
          tailleGroupe: existing?.tailleGroupe ?? 15,
          scoreMinimum: existing?.scoreMinimum ?? 10,
          selected: existing ? (existing.actif !== false) : false
        };
      })
    };
    this.formErrors = {};
    this.showEditVarianteModal = true;

    // ✅ Sauvegarder l'état original pour la comparaison
    this.originalVariante = JSON.parse(JSON.stringify(this.editVarianteForm));
  }

  updateVariante(): void {
    this.formLoading = true;
    const payload = {
      fraisInscription: this.editVarianteForm.fraisInscription,
      actif: this.editVarianteForm.actif,
      niveaux: this.editVarianteForm.niveaux.map((n: any) => ({
        niveauId: n.niveauId,
        capaciteMax: n.capaciteMax,
        tailleGroupe: n.tailleGroupe,
        scoreMinimum: n.scoreMinimum,
        actif: n.selected
      }))
    };
    this.http.put(`${this.diplomeUrl}/${this.editVarianteForm.id}`, payload).subscribe({
      next: () => {
        this.formLoading = false;
        this.showToast('Variante mise à jour', 'success');

        this.closeModals();
        const deptId = this.editVarianteForm.deptId;
        if (deptId) {
          const id = Number(deptId);
          const newMap = new Map(this.diplomesByDept);
          newMap.delete(id);
          this.diplomesByDept = newMap;
          
          setTimeout(() => {
            this.loadDiplomesForDept(id);
            this.loadDepartements();
          }, 400);
        } else {
          this.loadDepartements();
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.formLoading = false;
        this.showToast(this.extractErrorMessage(err), 'error');
      }
    });
  }

  closeModals(): void {
    this.showCreateDeptModal = false;
    this.showCreateDiplomeModal = false;
    this.showCreateVarianteModal = false;
    this.showEditVarianteModal = false;
    this.showAdminConfigModal = false;
    this.showYearSettingsModal = false;
    this.showUnlockConfirmationModal = false;
    this.showCloneErrorModal = false;
    this.cloneErrorMessage = '';
    this.selectedDept = null;
    this.selectedDiplomeResponsable = null;
    this.enseignantsLibres = [];
    this.enseignantAutoAssigne = null;
    this.formErrors = {};
  }

  showToast(message: string, type: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.toastVisible = true;
    setTimeout(() => this.toastVisible = false, 3500);
  }

  // ─── UI Helpers ────────────────────────────────────────────────────────────

  formatResponsableName(email: string | undefined): string {
    if (!email) return 'Non assigné';
    const parts = email.split('@')[0].split('.');
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }

  toggleDiplomeResponsable(id: number): void {
    const dr = Array.from(this.diplomesByDept.values())
      .flat()
      .find(d => d.id === id);
    if (dr) this.toggleDiplomeStatus(dr);
  }

  toggleVariante(v: DiplomeVariante): void {
    let targetDeptId: number | null = null;
    this.diplomesByDept.forEach((diplomes, deptId) => {
      if (diplomes.some(dr => dr.variantes.some(varItem => varItem.id === v.id))) {
        targetDeptId = deptId;
      }
    });

    if (targetDeptId !== null) {
      this.toggleVarianteStatus(v, targetDeptId);
    }
  }

  editVariante(v: DiplomeVariante): void {
    let targetDeptId: number | null = null;
    this.diplomesByDept.forEach((diplomes, deptId) => {
      if (diplomes.some(dr => dr.variantes.some(varItem => varItem.id === v.id))) {
        targetDeptId = deptId;
      }
    });

    if (targetDeptId !== null) {
      this.openEditVarianteModal(v, targetDeptId);
    }
  }
}