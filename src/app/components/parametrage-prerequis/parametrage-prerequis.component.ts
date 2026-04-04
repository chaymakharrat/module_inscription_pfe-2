import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { KeycloakService } from 'keycloak-angular';
import { KeycloakProfile } from 'keycloak-js';
import { environment } from '../../envirements/enviremetns';
import { ScolariteService } from '../../services/scolarite.service';
import { AnneeUniversitaire } from '../../models/academic-year.model';

// ─── MODELS ───────────────────────────────────────────────────────────────────

export interface PrerequisItemDTO {
  id: number;
  nom: string;
  createdBy?: string;
  createdAt?: string;
  actif?: boolean;
  isDeletable?: boolean;
  usages?: string[];
  isTypeLinked?: boolean;
}

export interface PrerequisConfigDTO {
  niveauSpecifiqueId: number;
  niveau: number;
  nomDiplome: string;
  langue: string;
  capaciteMax: number;
  scoreMinimum: number;
  tailleGroupe: number;
  prerequis: PrerequisItemDTO[];
  isCurrentYear: boolean;
}

export interface PrerequisFormData {
  nom: string;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-parametrage-prerequis',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './parametrage-prerequis.component.html',
  styleUrls: ['./parametrage-prerequis.component.css']
})
export class ParametragePrerequisComponent implements OnInit {

  niveauxConfig: PrerequisConfigDTO[] = [];
  loading = false;
  emailEnseignant = '';

  // Gestion Année Académique
  anneesUniversitaires: AnneeUniversitaire[] = [];
  selectedAnnee: string = '';
  isCurrentYear: boolean = true;

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }

  private apiUrl = `${environment.apiUrl}/DEPARTEMENT-SERVICE/api/prerequis-config`;

  // Édition capacité
  editingCapacite: Record<number, boolean> = {};
  newCapacite: Record<number, number> = {};
  savingCapacite: Record<number, boolean> = {};

  // Édition score minimum
  editingScore: Record<number, boolean> = {};
  newScore: Record<number, number> = {};
  savingScore: Record<number, boolean> = {};

  // Édition taille groupe
  editingTaille: Record<number, boolean> = {};
  newTaille: Record<number, number> = {};
  savingTaille: Record<number, boolean> = {};

  // Modal formulaire
  showFormModal = false;
  isEditMode = false;
  formLoading = false;
  selectedNiveau: PrerequisConfigDTO | null = null;
  editingPrerequisId: number | null = null;
  availableItems: PrerequisItemDTO[] = [];
  filteredAvailableItems: PrerequisItemDTO[] = [];
  selectedNames: Set<string> = new Set<string>();

  formData: PrerequisFormData = this.emptyForm();
  formErrors: Record<string, string> = {};

  // Actions en cours
  actionLoading: Record<number, boolean> = {};

  // Chargement par item dans la modal (pour éviter double-clic)
  modalItemLoading: Record<string, boolean> = {};

  // ✅ NOUVEAU — Gestion de ses propres prérequis
  myPrerequis: PrerequisItemDTO[] = [];
  showMyPrerequisModal = false;
  loadingMyPrerequis = false;

  // Confirmation Modal
  showConfirmModal = false;
  confirmConfig = {
    title: '',
    message: '',
    confirmText: 'Confirmer',
    cancelText: 'Annuler',
    isAlert: false,
    resolve: (val: boolean) => { }
  };

  // Toast
  toastVisible = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';

  constructor(
    private http: HttpClient,
    private keycloak: KeycloakService,
    private router: Router,
    private scolariteService: ScolariteService
  ) { }

  async ngOnInit(): Promise<void> {
    try {
      const profile: KeycloakProfile = await this.keycloak.loadUserProfile();
      this.emailEnseignant =
        (profile.email || '') ||
        (this.keycloak.getKeycloakInstance().tokenParsed as any)?.email || '';

      if (this.emailEnseignant) {
        await this.loadAcademicYears();
      }
    } catch (e) {
      console.error('Erreur Keycloak:', e);
    }
  }

  // ─── TRACKBY ─────────────────────────────────────────────────────────────

  trackByNiveau(index: number, config: PrerequisConfigDTO): number {
    return config.niveauSpecifiqueId;
  }

  trackByPrereq(index: number, p: PrerequisItemDTO): number {
    return p.id;
  }

  // ─── UTILITARE CAPACITÉ ──────────────────────────────────────────────────

  getCapacityPercent(config: PrerequisConfigDTO): number {
    return 0;
  }

  // ─── CHARGEMENT ──────────────────────────────────────────────────────────

  loadAcademicYears(): Promise<void> {
    return new Promise((resolve) => {
      this.scolariteService.getAnneesUniversitairesList().subscribe({
        next: (years) => {
          this.anneesUniversitaires = years;
          const current = years.find(y => y.courante);
          this.isCurrentYear = true; // Toujours vrai pour cet écran
          if (current) {
            this.selectedAnnee = current.annee;
          } else if (years.length > 0) {
            // Fallback: prendre la plus récente si aucune n'est marquée "courante"
            this.selectedAnnee = years[0].annee;
          }
          this.loadConfig();
          resolve();
        },
        error: (err) => {
          console.error('Erreur années:', err);
          this.loadConfig();
          resolve();
        }
      });
    });
  }

  onAnneeChange(): void {
    const yearObj = this.anneesUniversitaires.find(y => y.annee === this.selectedAnnee);
    this.isCurrentYear = yearObj ? yearObj.courante : false;
    this.loadConfig();
  }

  loadConfig(): void {
    this.loading = true;
    this.http.get<PrerequisConfigDTO[]>(this.apiUrl, {
      params: {
        email: this.emailEnseignant,
        annee: this.selectedAnnee
      }
    }).subscribe({
      next: (data) => {
        this.niveauxConfig = data;
        this.isCurrentYear = true; // Forcé en frontend pour garantir l'édition
        this.loading = false;
      },
      error: (err) => {
        console.error('Erreur chargement config:', err);
        this.loading = false;
        this.showToast('❌ Erreur lors du chargement', 'error');
      }
    });
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.toastVisible = true;
    setTimeout(() => this.toastVisible = false, 3500);
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
    }

    // Filtrer les messages techniques d'Angular
    if (err?.message && !err.message.includes('Http failure response')) return err.message;
    if (err?.statusText && err.statusText !== 'OK') return `Erreur ${err.status}: ${err.statusText}`;

    return 'Une erreur inattendue est survenue';
  }

  // ─── CAPACITÉ ────────────────────────────────────────────────────────────

  startEditCapacite(config: PrerequisConfigDTO): void {
    this.editingCapacite[config.niveauSpecifiqueId] = true;
    this.newCapacite[config.niveauSpecifiqueId] = config.capaciteMax;
  }

  cancelEditCapacite(config: PrerequisConfigDTO): void {
    this.editingCapacite[config.niveauSpecifiqueId] = false;
  }

  saveCapacite(config: PrerequisConfigDTO): void {
    const nouvelleCapacite = this.newCapacite[config.niveauSpecifiqueId];
    if (!nouvelleCapacite || nouvelleCapacite < 1) {
      this.showToast('⚠️ Capacité invalide (minimum 1)', 'error');
      return;
    }

    // ✅ Règle de divisibilité frontend
    if (nouvelleCapacite % config.tailleGroupe !== 0) {
      this.showToast(`⚠️ La capacité (${nouvelleCapacite}) doit être un multiple de la taille du groupe (${config.tailleGroupe})`, 'error');
      return;
    }
    this.savingCapacite[config.niveauSpecifiqueId] = true;
    this.http.put<PrerequisConfigDTO>(
      `${this.apiUrl}/niveaux/${config.niveauSpecifiqueId}/capacite`,
      {},
      { params: { email: this.emailEnseignant, capacite: nouvelleCapacite.toString() } }
    ).subscribe({
      next: (updated) => {
        const idx = this.niveauxConfig.findIndex(
          n => n.niveauSpecifiqueId === config.niveauSpecifiqueId);
        if (idx !== -1) {
          this.niveauxConfig[idx] = { ...updated };
          this.niveauxConfig = [...this.niveauxConfig];
        }
        this.editingCapacite[config.niveauSpecifiqueId] = false;
        this.savingCapacite[config.niveauSpecifiqueId] = false;
        this.showToast('✅ Capacité mise à jour', 'success');
      },
      error: (err) => {
        console.error('Erreur capacité:', err);
        this.savingCapacite[config.niveauSpecifiqueId] = false;
        const msg = this.extractErrorMessage(err);
        if (err.status === 409) {
          this.askConfirmation('Action Bloquée', msg, 'J\'ai compris', true);
        } else {
          this.showToast(msg, 'error');
        }
      }
    });
  }

  // ─── SCORE MINIMUM ───────────────────────────────────────────────────────

  startEditScore(config: PrerequisConfigDTO): void {
    this.editingScore[config.niveauSpecifiqueId] = true;
    this.newScore[config.niveauSpecifiqueId] = config.scoreMinimum;
  }

  cancelEditScore(config: PrerequisConfigDTO): void {
    this.editingScore[config.niveauSpecifiqueId] = false;
  }

  saveScore(config: PrerequisConfigDTO): void {
    const s = this.newScore[config.niveauSpecifiqueId];
    if (s === undefined || s === null || s < 0 || s > 100) {
      this.showToast('⚠️ Score invalide (0-100)', 'error');
      return;
    }
    this.savingScore[config.niveauSpecifiqueId] = true;
    this.http.put<PrerequisConfigDTO>(
      `${this.apiUrl}/niveaux/${config.niveauSpecifiqueId}/score-minimum`,
      {},
      { params: { email: this.emailEnseignant, score: s.toString() } }
    ).subscribe({
      next: (updated) => {
        const idx = this.niveauxConfig.findIndex(
          n => n.niveauSpecifiqueId === config.niveauSpecifiqueId);
        if (idx !== -1) {
          this.niveauxConfig[idx] = { ...updated };
          this.niveauxConfig = [...this.niveauxConfig];
        }
        this.editingScore[config.niveauSpecifiqueId] = false;
        this.savingScore[config.niveauSpecifiqueId] = false;
        this.showToast('✅ Score minimum mis à jour', 'success');
      },
      error: (err) => {
        this.savingScore[config.niveauSpecifiqueId] = false;
        const msg = this.extractErrorMessage(err);
        if (err.status === 409) {
          this.askConfirmation('Action Bloquée', msg, 'J\'ai compris', true);
        } else {
          this.showToast(msg, 'error');
        }
      }
    });
  }

  // ─── TAILLE GROUPE ───────────────────────────────────────────────────────

  startEditTaille(config: PrerequisConfigDTO): void {
    this.editingTaille[config.niveauSpecifiqueId] = true;
    this.newTaille[config.niveauSpecifiqueId] = config.tailleGroupe;
  }

  cancelEditTaille(config: PrerequisConfigDTO): void {
    this.editingTaille[config.niveauSpecifiqueId] = false;
  }

  saveTaille(config: PrerequisConfigDTO): void {
    const t = this.newTaille[config.niveauSpecifiqueId];
    if (!t || t < 1) {
      this.showToast('⚠️ Taille invalide (min 1)', 'error');
      return;
    }

    // ✅ Règle de divisibilité frontend
    if (config.capaciteMax % t !== 0) {
      this.showToast(`⚠️ La capacité actuelle (${config.capaciteMax}) doit être divisible par la nouvelle taille (${t})`, 'error');
      return;
    }
    this.savingTaille[config.niveauSpecifiqueId] = true;
    this.http.put<PrerequisConfigDTO>(
      `${this.apiUrl}/niveaux/${config.niveauSpecifiqueId}/taille-groupe`,
      {},
      { params: { email: this.emailEnseignant, taille: t.toString() } }
    ).subscribe({
      next: (updated) => {
        const idx = this.niveauxConfig.findIndex(
          n => n.niveauSpecifiqueId === config.niveauSpecifiqueId);
        if (idx !== -1) {
          this.niveauxConfig[idx] = { ...updated };
          this.niveauxConfig = [...this.niveauxConfig];
        }
        this.editingTaille[config.niveauSpecifiqueId] = false;
        this.savingTaille[config.niveauSpecifiqueId] = false;
        this.showToast('✅ Taille groupe mise à jour', 'success');
      },
      error: (err) => {
        this.savingTaille[config.niveauSpecifiqueId] = false;
        const msg = this.extractErrorMessage(err);
        if (err.status === 409) {
          this.askConfirmation('Action Bloquée', msg, 'J\'ai compris', true);
        } else {
          this.showToast(msg, 'error');
        }
      }
    });
  }

  // ─── MODAL FORMULAIRE ────────────────────────────────────────────────────

  openAddModal(config: PrerequisConfigDTO | null): void {
    this.selectedNiveau = config ?? (this.niveauxConfig.length > 0 ? this.niveauxConfig[0] : null);
    if (!this.selectedNiveau) {
      this.showToast('⚠️ Aucun niveau disponible pour cette formation', 'error');
      return;
    }
    this.isEditMode = false;
    this.formData = this.emptyForm();
    this.formErrors = {};
    this.editingPrerequisId = null;
    this.showFormModal = true;

    // Initialiser avec les prérequis ACTIFS du niveau (pas les inactifs)
    this.syncSelectedNamesFromNiveau();
    this.modalItemLoading = {};

    this.loadAvailablePrerequis();
  }

  loadAvailablePrerequis(): void {
    this.http.get<PrerequisItemDTO[]>(`${this.apiUrl}/available`).subscribe({
      next: (data) => {
        this.availableItems = data;
        this.onSearchChange(); // Call onSearchChange to properly filter out linked ones
      },
      error: (err) => console.error('Erreur chargement suggestions', err)
    });
  }

  onSearchChange(): void {
    const val = this.formData.nom.toLowerCase();

    // Filter out prerequisites that are already linked to the selected niveau
    // AND filter out "prerequis type" (isTypeLinked === true)
    const linkedIds = this.selectedNiveau?.prerequis
      ? new Set(this.selectedNiveau.prerequis.map(p => p.id))
      : new Set<number>();

    const unlinkedItems = this.availableItems.filter(item => 
       !linkedIds.has(item.id) && !item.isTypeLinked
    );

    if (!val) {
      this.filteredAvailableItems = [...unlinkedItems];
    } else {
      this.filteredAvailableItems = unlinkedItems.filter(item =>
        item.nom.toLowerCase().includes(val)
      );
    }
  }

  openEditModal(config: PrerequisConfigDTO, prereq: PrerequisItemDTO): void {
    this.isEditMode = true;
    this.selectedNiveau = config;
    this.editingPrerequisId = prereq.id;
    this.formData = { nom: prereq.nom };
    this.formErrors = {};
    this.showFormModal = true;
  }

  closeFormModal(): void {
    this.showFormModal = false;
    this.formData = this.emptyForm();
    this.formErrors = {};
  }

  // ─── TOGGLE INSTANTANÉ DANS LA MODAL ───────────────────────────────────
  // Cocher → ajoute ou réactive le prérequis sur ce niveau
  // Décocher → désactive le prérequis sur ce niveau

  toggleSelection(item: PrerequisItemDTO): void {
    if (!this.selectedNiveau || this.modalItemLoading[item.nom]) return;

    const niveauId = this.selectedNiveau.niveauSpecifiqueId;
    const isSelected = this.selectedNames.has(item.nom);

    // Trouver si ce prérequis est déjà lié à ce niveau
    const existingLink = this.selectedNiveau.prerequis.find(
      p => p.nom.toLowerCase() === item.nom.toLowerCase()
    );

    this.modalItemLoading[item.nom] = true;

    if (isSelected) {
      // ─ DÉCOCHER → désactiver sur ce niveau
      if (!existingLink) { this.modalItemLoading[item.nom] = false; return; }
      this.selectedNames.delete(item.nom); // optimistic

      this.http.put<PrerequisConfigDTO>(
        `${this.apiUrl}/niveaux/${niveauId}/prerequis/${existingLink.id}/toggle`,
        {},
        { params: { email: this.emailEnseignant, active: 'false' } }
      ).subscribe({
        next: (updated) => {
          this.updateNiveauConfigFromServer(updated);
          this.modalItemLoading[item.nom] = false;
          this.showToast(`✅ "${item.nom}" désactivé`, 'success');
        },
        error: (err) => {
          this.selectedNames.add(item.nom); // rollback
          this.modalItemLoading[item.nom] = false;
          this.showToast(this.extractErrorMessage(err), 'error');
        }
      });

    } else {
      // ─ COCHER → ajouter ou réactiver
      this.selectedNames.add(item.nom); // optimistic

      if (existingLink && existingLink.actif === false) {
        // Déjà lié mais inactif → réactiver
        this.http.put<PrerequisConfigDTO>(
          `${this.apiUrl}/niveaux/${niveauId}/prerequis/${existingLink.id}/toggle`,
          {},
          { params: { email: this.emailEnseignant, active: 'true' } }
        ).subscribe({
          next: (updated) => {
            this.updateNiveauConfigFromServer(updated);
            this.modalItemLoading[item.nom] = false;
            this.showToast(`✅ "${item.nom}" réactivé`, 'success');
          },
          error: (err) => {
            this.selectedNames.delete(item.nom);
            this.modalItemLoading[item.nom] = false;
            this.showToast(this.extractErrorMessage(err), 'error');
          }
        });
      } else if (!existingLink) {
        // Pas encore lié → ajouter
        this.http.post<PrerequisConfigDTO>(
          `${this.apiUrl}/niveaux/${niveauId}/prerequis`,
          { nom: item.nom },
          { params: { email: this.emailEnseignant } }
        ).subscribe({
          next: (updated) => {
            this.updateNiveauConfigFromServer(updated);
            this.modalItemLoading[item.nom] = false;
            this.showToast(`✅ "${item.nom}" ajouté`, 'success');
          },
          error: (err) => {
            this.selectedNames.delete(item.nom);
            this.modalItemLoading[item.nom] = false;
            this.showToast(this.extractErrorMessage(err), 'error');
          }
        });
      } else {
        // Déjà lié et actif – rien à faire
        this.modalItemLoading[item.nom] = false;
      }
    }
  }

  /** Synchronise selectedNames avec les prérequis ACTIFS du niveau sélectionné */
  private syncSelectedNamesFromNiveau(): void {
    this.selectedNames.clear();
    if (this.selectedNiveau?.prerequis) {
      this.selectedNiveau.prerequis
        .filter(p => p.actif !== false)
        .forEach(p => this.selectedNames.add(p.nom));
    }
  }

  /** Met à jour niveauxConfig et selectedNiveau après réponse serveur */
  private updateNiveauConfigFromServer(updatedConfig: PrerequisConfigDTO): void {
    const idx = this.niveauxConfig.findIndex(n => n.niveauSpecifiqueId === updatedConfig.niveauSpecifiqueId);
    if (idx !== -1) {
      this.niveauxConfig[idx] = { ...updatedConfig };
      this.niveauxConfig = [...this.niveauxConfig];
      if (this.selectedNiveau?.niveauSpecifiqueId === updatedConfig.niveauSpecifiqueId) {
        this.selectedNiveau = this.niveauxConfig[idx];
        this.syncSelectedNamesFromNiveau();
      }
    }
  }

  // ─── GESTION SES PROPRES PRÉREQUIS ──────────────────────────────────────

  openMyPrerequisModal(): void {
    this.showMyPrerequisModal = true;
    this.loadMyPrerequis();
  }

  loadMyPrerequis(): void {
    if (!this.emailEnseignant) return;
    this.loadingMyPrerequis = true;
    this.http.get<PrerequisItemDTO[]>(`${this.apiUrl}/my-prerequis`, {
      params: { email: this.emailEnseignant }
    }).subscribe({
      next: (res) => {
        this.myPrerequis = res.filter(p => p.createdBy === this.emailEnseignant);
        this.loadingMyPrerequis = false;
      },
      error: (err) => {
        this.loadingMyPrerequis = false;
        this.showToast(this.extractErrorMessage(err), 'error');
      }
    });
  }

  toggleMyPrerequisStatus(p: PrerequisItemDTO): void {
    if (!this.emailEnseignant) return;
    const newStatus = !p.actif;

    this.http.put(`${this.apiUrl}/available/${p.id}/toggle-status`, {}, {
      params: {
        email: this.emailEnseignant,
        active: newStatus.toString()
      }
    }).subscribe({
      next: () => {
        p.actif = newStatus;
        this.showToast(`Prérequis "${p.nom}" ${newStatus ? 'activé' : 'désactivé'}`, 'success');
        this.loadMyPrerequis();
        this.loadAvailablePrerequis(); // Refresh available list for current session
      },
      error: (err) => {
        this.showToast(this.extractErrorMessage(err), 'error');
      }
    });
  }

  isPrereqSelected(name: string): boolean {
    return this.selectedNames.has(name);
  }

  submitForm(): void {
    if (!this.selectedNiveau) return;

    if (this.isEditMode && this.editingPrerequisId) {
      // 📝 MODE ÉDITION (Update simple)
      const body = { nom: this.formData.nom.trim() };
      this.formLoading = true;
      this.http.put<PrerequisItemDTO>(
        `${this.apiUrl}/prerequis/${this.editingPrerequisId}`,
        body,
        { params: { email: this.emailEnseignant } }
      ).subscribe({
        next: (updated) => {
          this.updatePrereqInList(updated);
          this.formLoading = false;
          this.closeFormModal();
          this.showToast('✅ Prérequis modifié avec succès', 'success');
        },
        error: (err) => {
          this.formLoading = false;
          this.showToast(this.extractErrorMessage(err), 'error');
        }
      });
      return;
    }

    // ➕ MODE TEXTE LIBRE — ajouter un tout nouveau prérequis saisi manuellement
    const newPrereq = this.formData.nom.trim();

    if (!newPrereq) {
      // Rien à soumettre — les checkboxes ont déjà tout fait en temps réel
      this.closeFormModal();
      return;
    }

    // Si le nom correspond à un item existant → le toggle instantané l'a géré
    const alreadyHandled = this.availableItems.find(
      i => i.nom.toLowerCase() === newPrereq.toLowerCase()
    );
    if (alreadyHandled) {
      this.toggleSelection(alreadyHandled);
      this.formData = this.emptyForm();
      return;
    }

    // Nouveau prérequis qui n'existe pas encore du tout
    this.formLoading = true;
    this.http.post<PrerequisConfigDTO>(
      `${this.apiUrl}/niveaux/${this.selectedNiveau.niveauSpecifiqueId}/prerequis`,
      { nom: newPrereq },
      { params: { email: this.emailEnseignant } }
    ).subscribe({
      next: (updatedConfig) => {
        this.updateNiveauConfigFromServer(updatedConfig);
        this.formLoading = false;
        this.formData = this.emptyForm();
        this.showToast(`✅ Prérequis "${newPrereq}" ajouté`, 'success');
        this.loadAvailablePrerequis();
      },
      error: (err) => {
        this.formLoading = false;
        this.showToast(this.extractErrorMessage(err), 'error');
      }
    });
  }

  // ─── TOGGLE PRÉREQUIS SUR NIVEAU (Activer / Désactiver) ─────────────────
  // Note: ngModel a déjà mis à jour p.actif avant cet appel.
  // La nouvelle valeur est donc directement p.actif.

  togglePrerequisStatus(config: PrerequisConfigDTO, prereq: PrerequisItemDTO): void {
    const niveauId = config.niveauSpecifiqueId;
    const newStatus = !!prereq.actif; // ← ngModel a déjà inversé la valeur (!! pour éviter undefined)

    this.http.put<PrerequisConfigDTO>(
      `${this.apiUrl}/niveaux/${niveauId}/prerequis/${prereq.id}/toggle`,
      {},
      {
        params: {
          email: this.emailEnseignant,
          active: newStatus.toString()
        }
      }
    ).subscribe({
      next: (updatedConfig) => {
        // Remplacer avec les données réelles du serveur
        const idx = this.niveauxConfig.findIndex(n => n.niveauSpecifiqueId === updatedConfig.niveauSpecifiqueId);
        if (idx !== -1) {
          this.niveauxConfig[idx] = { ...updatedConfig };
          this.niveauxConfig = [...this.niveauxConfig];
        }
        const label = newStatus ? '✅ Prérequis activé' : '✅ Prérequis désactivé';
        this.showToast(label, 'success');
      },
      error: (err) => {
        // Rollback : remettre l'ancien état (inverser ce que ngModel a fait)
        prereq.actif = !newStatus;
        const msg = this.extractErrorMessage(err);
        this.showToast('❌ ' + msg, 'error');
      }
    });
  }

  // ─── POOL GLOBAL ───────────────────────────────────────────────────────

  deleteGlobalPrerequis(prereq: PrerequisItemDTO): void {
    this.askConfirmation(
      'Suppression Définitive',
      `Voulez-vous supprimer le prérequis "${prereq.nom}" du catalogue global ? Cette action est possible uniquement car il n'est lié à aucun diplôme.`,
      'Supprimer du catalogue'
    ).then(confirm => {
      if (confirm) {
        this.http.delete(`${environment.apiUrl}/DEPARTEMENT-SERVICE/api/prerequis-config/available/${prereq.id}`, {
          params: { email: this.emailEnseignant }
        }).subscribe({
          next: () => {
            this.showToast('✅ Prérequis supprimé du catalogue global', 'success');
            this.loadAvailablePrerequis();
          },
          error: (err) => {
            this.showToast(this.extractErrorMessage(err), 'error');
          }
        });
      }
    });
  }

  // ─── VALIDATION ──────────────────────────────────────────────────────────

  private validateForm(): boolean {
    this.formErrors = {};
    if (!this.formData.nom?.trim()) {
      this.formErrors['nom'] = 'Le nom est obligatoire';
      return false;
    }
    if (this.formData.nom.trim().length < 3) {
      this.formErrors['nom'] = 'Minimum 3 caractères';
      return false;
    }
    return true;
  }

  // ─── UTILITAIRES ─────────────────────────────────────────────────────────

  private emptyForm(): PrerequisFormData {
    return { nom: '' };
  }

  private updatePrereqInList(updated: PrerequisItemDTO): void {
    this.niveauxConfig = this.niveauxConfig.map(config => ({
      ...config,
      prerequis: config.prerequis.map(p =>
        p.id === updated.id ? { ...updated } : p
      )
    }));
  }
}