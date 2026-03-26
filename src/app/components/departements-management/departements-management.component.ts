import { Component, OnInit } from '@angular/core';
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
  diplomes: DiplomeVariante[];
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
  niveaux?: {
    id: number;
    niveau: number;
    capaciteMax?: number;
    scoreMinimum?: number;
    tailleGroupe?: number;
    actif?: boolean;
  }[];
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

export interface EnseignantDTO {
  id: number;
  emailUniversitaire: string;
  diplomeResponsableId?: number | null;
  departementId?: number | null;
  typeId?: number | null;
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

  loading = false;
  expandedDeptId: number | null = null;
  viewMode: 'grid' | 'list' = 'grid';
  adminEmail = '';
  originalVariante: any = null;

  // ─── Modals ────────────────────────────────────────────────────────────────
  showCreateDeptModal = false;
  showCreateDiplomeModal = false;
  showCreateVarianteModal = false;
  showEditVarianteModal = false;
  showAdminConfigModal = false;
  formLoading = false;

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

  toastVisible = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';

  // ─── URLs ──────────────────────────────────────────────────────────────────
  private baseUrl = `${environment.apiUrl}/DEPARTEMENT-SERVICE`;
  private deptUrl = `${this.baseUrl}/api/departements`;
  private diplomeUrl = `${this.baseUrl}/api/diplomes`;
  private typesUrl = `${this.baseUrl}/api/types`;
  private niveauxUrl = `${this.baseUrl}/api/niveaux`;
  private adminConfigUrl = `${this.baseUrl}/api/admin/config`;
  private enseignantUrl = `${this.baseUrl}/api/enseignants`;
  private authUrl = `${environment.apiUrl}/AUTHENTIFICATION-SERVICE/authentifier/utilisateurs`;

  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private notificationService: NotificationService,
    private keycloak: KeycloakService
  ) { }

  async ngOnInit() {
    this.loadDepartements();
    this.loadTypes();
    this.loadNiveaux();

    // Charger l'email de l'admin
    if (await this.keycloak.isLoggedIn()) {
      const profile = await this.keycloak.loadUserProfile();
      this.adminEmail = profile.email || '';
    }
  }

  // ─── Chargement ────────────────────────────────────────────────────────────

  loadDepartements(): void {
    this.loading = true;
    this.http.get<Departement[]>(this.deptUrl).subscribe({
      next: (res) => {
        this.departements = res;
        this.loading = false;
        res.forEach(d => {
          if (d.diplomes && d.diplomes.length > 0) {
            const grouped = this.groupVariantesByResponsable(d.diplomes, d.id);
            this.diplomesByDept.set(d.id, grouped);
          }
        });
      },
      error: () => {
        this.loading = false;
        this.showToast('Erreur lors du chargement des départements', 'error');
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
      error: () => this.showToast('Erreur lors du chargement de la configuration admin', 'error')
    });
  }

  openAdminConfigModal(): void {
    this.loadAdminConfig();
    this.newTypeForm = { nom: '' };
    this.newNiveauForm = { niveau: 1 };
    this.showAdminConfigModal = true;
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
        this.showToast(err.error || 'Erreur lors de l\'ajout', 'error');
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
        this.showToast(err.error || 'Erreur lors de l\'ajout', 'error');
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
      error: (err) => this.showToast(err.error || 'Erreur lors de la mise à jour', 'error')
    });
  }

  toggleNiveauActif(n: NiveauDiplome): void {
    this.http.put<NiveauDiplome>(`${this.adminConfigUrl}/niveaux/${n.id}/toggle-actif`, {}).subscribe({
      next: (updated) => {
        n.actif = updated.actif;
        this.loadNiveaux();
        this.showToast('Statut mis à jour', 'success');
      },
      error: (err) => this.showToast(err.error || 'Erreur lors de la mise à jour', 'error')
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
    this.http.get<any[]>(`${this.diplomeUrl}/departement/${deptId}`).subscribe({
      next: (res) => {
        const grouped = this.groupVariantesByResponsable(res, deptId);
        this.diplomesByDept.set(deptId, grouped);
        this.loadingDiplomes[deptId] = false;
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
          nomDiplome: dto.nomDiplome ?? dto.nom,
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
        nom: dto.nom,
        langue: dto.langue,
        fraisInscription: dto.fraisInscription,
        actif: dto.actif,
        diplomeResponsableId: respId,
        typeNom: dto.typeNom,
        departementNom: dto.departementNom,
        niveaux: dto.niveaux?.sort((a: any, b: any) => a.niveau - b.niveau)
      });
    }
    return Array.from(map.values());
  }

  getTotalVariantesForDept(deptId: number): number {
    return this.diplomesByDept.get(deptId)
      ?.reduce((sum, dr) => sum + dr.variantes.length, 0) ?? 0;
  }

  toggleDept(deptId: number): void {
    if (this.expandedDeptId === deptId) {
      this.expandedDeptId = null;
    } else {
      this.expandedDeptId = deptId;
      if (!this.diplomesByDept.has(deptId)) {
        this.loadDiplomesForDept(deptId);
      }
    }
  }

  getDiplomesForDept(deptId: number): DiplomeResponsableDetail[] {
    return this.diplomesByDept.get(deptId) ?? [];
  }

  getDiplomesCountForDept(deptId: number): number {
    return this.diplomesByDept.get(deptId)?.length ?? 0;
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
    this.http.post<Departement>(this.deptUrl, { nom: this.deptForm.nom }).subscribe({
      next: (dept) => {
        this.departements.push(dept);
        this.formLoading = false;
        this.closeModals();
        this.showToast(`Département « ${dept.nom} » créé`, 'success');
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
      variantes: selectedLangs.map(l => ({
        langue: l.langue,
        fraisInscription: l.fraisInscription,
        actif: true,
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
        this.showToast(err.error?.message ?? 'Erreur lors de la création', 'error');
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
                error: () => {
                  this.rollbackCreation(diplomeId, deptId, `Impossible de mettre à jour le rôle pour ${enseignant.emailUniversitaire}. Création annulée.`);
                }
              });
            } else {
              this.rollbackCreation(diplomeId, deptId, `Utilisateur ${enseignant.emailUniversitaire} introuvable dans le module d'authentification. Création annulée.`);
            }
          },
          error: () => {
            this.rollbackCreation(diplomeId, deptId, 'Erreur lors de la vérification de l\'utilisateur. Création annulée.');
          }
        });
      },
      error: () => {
        this.rollbackCreation(diplomeId, deptId, 'Erreur lors de l\'assignation de l\'enseignant. Création annulée.');
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
    this.diplomesByDept.delete(deptId);
    if (this.expandedDeptId === deptId) {
      this.loadDiplomesForDept(deptId);
    }
    this.showToast(`Diplôme « ${this.diplomeForm.nomDiplome} » créé avec succès`, 'success');
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
        const deptId = this.selectedDiplomeResponsable!.departementId;
        this.closeModals();
        this.diplomesByDept.delete(deptId);
        if (this.expandedDeptId === deptId) {
          this.loadDiplomesForDept(deptId);
        }
        this.showToast(`Variante ${this.varianteForm.langue} ajoutée`, 'success');
      },
      error: (err) => {
        this.formLoading = false;
        this.showToast(err.error?.message ?? 'Erreur lors de l\'ajout', 'error');
      }
    });
  }

  toggleVarianteStatus(variante: DiplomeVariante, deptId?: number): void {
    const oldStatus = variante.actif;
    variante.actif = !variante.actif;
    this.http.patch(`${this.diplomeUrl}/${variante.id}/toggle`, {}).subscribe({
      next: () => {
        this.showToast(`Statut mis à jour pour ${variante.langue}`, 'success');
        
        if (deptId) {
          this.diplomesByDept.delete(deptId);
          this.loadDiplomesForDept(deptId);
        }
      },
      error: () => {
        variante.actif = oldStatus;
        this.showToast('Erreur lors de la mise à jour du statut', 'error');
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
      },
      error: () => {
        dept.actif = oldStatus;
        this.showToast('Erreur lors de la mise à jour du statut', 'error');
      }
    });
  }

  toggleDiplomeStatus(dr: DiplomeResponsableDetail): void {
    const oldStatus = dr.actif;
    dr.actif = !dr.actif;
    this.http.patch(`${this.deptUrl}/diplomes-responsables/${dr.id}/toggle`, {}).subscribe({
      next: () => {
        this.showToast(`${dr.nomDiplome} est désormais ${dr.actif ? 'actif' : 'inactif'}`, 'success');

        this.diplomesByDept.delete(dr.departementId);
        this.loadDiplomesForDept(dr.departementId);
      },
      error: () => {
        dr.actif = oldStatus;
        this.showToast('Erreur lors de la mise à jour du statut', 'error');
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
          this.diplomesByDept.delete(deptId);
          this.loadDiplomesForDept(deptId);
        } else {
          this.loadDepartements();
        }
      },
      error: (err) => {
        this.formLoading = false;
        this.showToast(err.error?.message ?? 'Erreur lors de la mise à jour', 'error');
      }
    });
  }

  closeModals(): void {
    this.showCreateDeptModal = false;
    this.showCreateDiplomeModal = false;
    this.showCreateVarianteModal = false;
    this.showEditVarianteModal = false;
    this.showAdminConfigModal = false;
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
}