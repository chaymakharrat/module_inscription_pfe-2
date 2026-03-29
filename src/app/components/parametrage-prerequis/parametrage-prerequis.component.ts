import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { KeycloakService } from 'keycloak-angular';
import { KeycloakProfile } from 'keycloak-js';
import { environment } from '../../envirements/enviremetns';

// ─── MODELS ───────────────────────────────────────────────────────────────────

export interface PrerequisItemDTO {
  id: number;
  nom: string;
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
    private router: Router
  ) { }

  async ngOnInit(): Promise<void> {
    try {
      const profile: KeycloakProfile = await this.keycloak.loadUserProfile();
      this.emailEnseignant =
        (profile.email || '') ||
        (this.keycloak.getKeycloakInstance().tokenParsed as any)?.email || '';

      if (this.emailEnseignant) {
        this.loadConfig();
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

  loadConfig(): void {
    this.loading = true;
    this.http.get<PrerequisConfigDTO[]>(this.apiUrl, {
      params: { email: this.emailEnseignant }
    }).subscribe({
      next: (data) => {
        this.niveauxConfig = data;
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

    // Initialiser les noms sélectionnés avec ceux déjà présents pour ce niveau
    this.selectedNames.clear();
    if (this.selectedNiveau && this.selectedNiveau.prerequis) {
      this.selectedNiveau.prerequis.forEach(p => this.selectedNames.add(p.nom));
    }

    this.loadAvailablePrerequis();
  }

  loadAvailablePrerequis(): void {
    this.http.get<PrerequisItemDTO[]>(`${this.apiUrl}/available`).subscribe({
      next: (data) => {
        this.availableItems = data;
        this.filteredAvailableItems = [...data];
      },
      error: (err) => console.error('Erreur chargement suggestions', err)
    });
  }

  onSearchChange(): void {
    const val = this.formData.nom.toLowerCase();
    if (!val) {
      this.filteredAvailableItems = [...this.availableItems];
    } else {
      this.filteredAvailableItems = this.availableItems.filter(item =>
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

  toggleSelection(name: string): void {
    if (this.selectedNames.has(name)) {
      this.selectedNames.delete(name);
    } else {
      this.selectedNames.add(name);
    }
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

    // ➕ MODE AJOUT GROUPÉ (Bulk)
    const listToSubmit = Array.from(this.selectedNames);
    const newPrereq = this.formData.nom.trim();
    if (newPrereq && !this.selectedNames.has(newPrereq)) {
      listToSubmit.push(newPrereq);
    }

    if (listToSubmit.length === 0) {
      this.showToast('⚠️ Sélectionnez des prérequis ou saisissez-en un nouveau', 'error');
      return;
    }

    this.formLoading = true;
    const body = { noms: listToSubmit };

    this.http.post<PrerequisConfigDTO>(
      `${this.apiUrl}/niveaux/${this.selectedNiveau.niveauSpecifiqueId}/prerequis/bulk`,
      body,
      { params: { email: this.emailEnseignant } }
    ).subscribe({
      next: (updatedConfig) => {
        const idx = this.niveauxConfig.findIndex(
          n => n.niveauSpecifiqueId === updatedConfig.niveauSpecifiqueId);

        if (idx !== -1) {
          // Reactivité Angular par remplacement de référence
          this.niveauxConfig[idx] = { ...updatedConfig };
          this.niveauxConfig = [...this.niveauxConfig];
          this.selectedNiveau = this.niveauxConfig[idx];

          // Re-synchroniser les noms sélectionnés pour que les checkboxes reflètent l'état actuel
          this.selectedNames.clear();
          if (this.selectedNiveau.prerequis) {
            this.selectedNiveau.prerequis.forEach(p => this.selectedNames.add(p.nom));
          }
        }

        this.formLoading = false;
        this.formData = this.emptyForm();
        this.showToast('✅ Configuration synchronisée avec succès', 'success');
        this.loadAvailablePrerequis();
      },
      error: (err) => {
        this.formLoading = false;
        this.showToast(this.extractErrorMessage(err), 'error');
      }
    });
  }

  // ─── DÉSACTIVATION (Instant Toggle) ──────────────────────────────────────

  togglePrerequisStatus(config: PrerequisConfigDTO, prereq: PrerequisItemDTO): void {
    const niveauId = config.niveauSpecifiqueId;
    
    // On pourrait ajouter un état "loading" par ligne si nécessaire
    this.http.delete<PrerequisConfigDTO>(
      `${this.apiUrl}/niveaux/${niveauId}/prerequis/${prereq.id}`,
      { params: { email: this.emailEnseignant } }
    ).subscribe({
      next: (updatedConfig) => {
        const idx = this.niveauxConfig.findIndex(n => n.niveauSpecifiqueId === updatedConfig.niveauSpecifiqueId);
        if (idx !== -1) {
          this.niveauxConfig[idx] = { ...updatedConfig };
          this.niveauxConfig = [...this.niveauxConfig];
        }
        this.showToast('✅ Prérequis désactivé', 'success');
        this.loadAvailablePrerequis();
      },
      error: (err) => {
        this.showToast('❌ Erreur lors de la désactivation', 'error');
        // On pourrait recharger la config ici pour remettre le toggle à ON si l'API échoue
        this.loadConfig();
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