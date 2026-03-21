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
  // ✅ obligatoire supprimé — tous les prérequis sont obligatoires
}

export interface PrerequisConfigDTO {
  niveauSpecifiqueId: number;
  niveau: number;
  nomDiplome: string;
  langue: string;
  capaciteMax: number;
  prerequis: PrerequisItemDTO[];
}

export interface PrerequisFormData {
  nom: string;
  // ✅ obligatoire supprimé
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

  private apiUrl = `${environment.apiUrl}/DEPARTEMENT-SERVICE/api/prerequis-config`;

  // Édition capacité
  editingCapacite: Record<number, boolean> = {};
  newCapacite: Record<number, number> = {};
  savingCapacite: Record<number, boolean> = {};

  // Modal formulaire
  showFormModal = false;
  isEditMode = false;
  formLoading = false;
  selectedNiveau: PrerequisConfigDTO | null = null;
  editingPrerequisId: number | null = null;

  formData: PrerequisFormData = this.emptyForm();
  formErrors: Record<string, string> = {};

  // Suppression
  showDeleteConfirm = false;
  deleteLoading = false;
  prereqToDelete: PrerequisItemDTO | null = null;
  niveauPourSuppression: PrerequisConfigDTO | null = null;

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
      null,
      { params: { email: this.emailEnseignant, capacite: nouvelleCapacite.toString() } }
    ).subscribe({
      next: (updated) => {
        const idx = this.niveauxConfig.findIndex(
          n => n.niveauSpecifiqueId === config.niveauSpecifiqueId);
        if (idx !== -1) this.niveauxConfig[idx] = updated;
        this.editingCapacite[config.niveauSpecifiqueId] = false;
        this.savingCapacite[config.niveauSpecifiqueId] = false;
        this.showToast('✅ Capacité mise à jour', 'success');
      },
      error: (err) => {
        console.error('Erreur capacité:', err);
        this.savingCapacite[config.niveauSpecifiqueId] = false;
        this.showToast('❌ Erreur lors de la mise à jour', 'error');
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
  }

  openEditModal(config: PrerequisConfigDTO, prereq: PrerequisItemDTO): void {
    this.isEditMode = true;
    this.selectedNiveau = config;
    this.editingPrerequisId = prereq.id;
    // ✅ Plus d'obligatoire dans le formData
    this.formData = { nom: prereq.nom };
    this.formErrors = {};
    this.showFormModal = true;
  }

  closeFormModal(): void {
    this.showFormModal = false;
    this.formData = this.emptyForm();
    this.formErrors = {};
  }

  submitForm(): void {
    if (!this.validateForm()) return;
    if (!this.selectedNiveau && !this.isEditMode) {
      this.showToast('❌ Aucun niveau sélectionné', 'error');
      return;
    }

    this.formLoading = true;

    // ✅ Body sans obligatoire
    const body = { nom: this.formData.nom.trim() };

    if (this.isEditMode && this.editingPrerequisId) {
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
          this.showToast(`❌ ${err?.error?.message || 'Erreur serveur'}`, 'error');
        }
      });

    } else {
      const niveauId = this.selectedNiveau!.niveauSpecifiqueId;

      this.http.post<PrerequisConfigDTO>(
        `${this.apiUrl}/niveaux/${niveauId}/prerequis`,
        body,
        { params: { email: this.emailEnseignant } }
      ).subscribe({
        next: (updatedConfig) => {
          const idx = this.niveauxConfig.findIndex(
            n => n.niveauSpecifiqueId === updatedConfig.niveauSpecifiqueId);
          if (idx !== -1) this.niveauxConfig[idx] = updatedConfig;
          this.formLoading = false;
          this.closeFormModal();
          this.showToast('✅ Prérequis ajouté avec succès', 'success');
        },
        error: (err) => {
          this.formLoading = false;
          let msg = "Erreur lors de l'ajout";
          if (err?.status === 409) msg = 'Ce prérequis existe déjà sur ce niveau';
          else if (err?.status === 404) msg = 'Niveau non trouvé';
          else if (err?.error?.message) msg = err.error.message;
          this.showToast(`❌ ${msg}`, 'error');
        }
      });
    }
  }

  // ─── SUPPRESSION ─────────────────────────────────────────────────────────

  confirmerSuppression(config: PrerequisConfigDTO, prereq: PrerequisItemDTO): void {
    this.prereqToDelete = prereq;
    this.niveauPourSuppression = config;
    this.showDeleteConfirm = true;
  }

  executerSuppression(): void {
    if (!this.prereqToDelete || !this.niveauPourSuppression) return;

    this.deleteLoading = true;

    this.http.delete<PrerequisConfigDTO>(
      `${this.apiUrl}/niveaux/${this.niveauPourSuppression.niveauSpecifiqueId}/prerequis/${this.prereqToDelete.id}`,
      { params: { email: this.emailEnseignant } }
    ).subscribe({
      next: (updatedConfig) => {
        const idx = this.niveauxConfig.findIndex(
          n => n.niveauSpecifiqueId === updatedConfig.niveauSpecifiqueId);
        if (idx !== -1) this.niveauxConfig[idx] = updatedConfig;
        this.deleteLoading = false;
        this.showDeleteConfirm = false;
        this.prereqToDelete = null;
        this.showToast('✅ Prérequis retiré du niveau', 'success');
      },
      error: () => {
        this.deleteLoading = false;
        this.showToast('❌ Erreur lors de la suppression', 'error');
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
    // ✅ Plus d'obligatoire
    return { nom: '' };
  }

  private updatePrereqInList(updated: PrerequisItemDTO): void {
    this.niveauxConfig = this.niveauxConfig.map(config => ({
      ...config,
      prerequis: config.prerequis.map(p => p.id === updated.id ? updated : p)
    }));
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.toastVisible = true;
    setTimeout(() => this.toastVisible = false, 3500);
  }
}