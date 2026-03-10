import { Component, OnInit, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { KeycloakService } from 'keycloak-angular';
import { KeycloakProfile } from 'keycloak-js';
import { environment } from '../../envirements/enviremetns';
import { trigger, style, animate, transition } from '@angular/animations';

// ─── MODELS ───────────────────────────────────────────────────────────────────
import { SafePipe } from '../../pipes/safe.pipe';

export type StatutFormulaire = 'EN_ATTENTE' | 'SOUMIS' | 'VALIDE' | 'REFUSE';
export type StatutEcheance = 'EN_ATTENTE' | 'PAYE' | 'IMPAYE';
export type StatutPaiement = 'EN_ATTENTE' | 'PARTIEL' | 'PAYE';
export type TypePaiement = 'TOTAL' | 'PARTIEL';
export type ModePaiement = 'EN_LIGNE' | 'EN_PRESENTIEL';

export interface DashboardFinanceDTO {
  nomAgent: string;
  emailAgent: string;
  formulairesEnAttente: number;
  formulairesValides: number;
  formulairesRefuses: number;
  facturesGenerees: number;
  echeancesEnRetard: number;
  montantTotalEncaisse: number;
  montantTotalRestant: number;
}

export interface RemiseDTO {
  id: number;
  remiseId: number;
  motif: string;
  pourcentage: number;
  statut: 'EN_ATTENTE' | 'ACCEPTEE' | 'REFUSEE';
  justificatifPath?: string;
  justificatifFileName?: string;
  justificatifFileSize?: number;
  justificatifContentType?: string;
  justificatifNote?: string;
  commentaireAgent?: string;
  dateDecision?: string;
  downloadUrl?: string;
}

export interface PaiementDTO {
  id: number;
  numeroPaiement: string;
  montantAPayer: number;
  datePaiement: string;
  modePaiement: ModePaiement;
}

export interface EcheanceDTO {
  id: number;
  numeroEcheance: string;
  numeroOrdre: number;
  montantAPayer: number;
  dateEcheance: string;
  statut: StatutEcheance;
  enRetard: boolean;
  paiement?: PaiementDTO;
}

export interface FactureSummaryDTO {
  id: number;
  numeroFacture: string;
  montantTotal: number;
  montantPaye: number;
  montantRestant: number;
  statusPaiement: StatutPaiement;
  typePaiement: TypePaiement;
  frequenceMois?: number;
  echeances: EcheanceDTO[];
  remises: RemiseDTO[];
}

export interface FormulaireDashboardDTO {
  formulaireId: number;
  enrollmentId: number;
  statut: StatutFormulaire;
  typePaiement?: TypePaiement;
  frequenceMois?: number;
  paiementEnLigne?: boolean;
  dateExpiration?: string;
  commentaireAgent?: string;
  remisesDemandees: RemiseDTO[];
  totalRemiseAcceptee: number;
  totalRemiseDemandee: number;
  etudiantId?: number;
  nomEtudiant?: string;
  prenomEtudiant?: string;
  emailEtudiant?: string;
  telephone?: string;
  nomDiplome?: string;
  langueDiplome?: string;
  niveauChoisi?: string;
  statutDemande?: string;
  facture?: FactureSummaryDTO;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}
export interface RemiseDecisionRequest {
  acceptee: boolean;
  commentaire: string;
  agentEmail: string;
}

export interface EnregistrerPaiementRequest {
  montant: number;
  modePaiement: ModePaiement;
  agentEmail: string;
}

export interface ValidationRequest {
  accepte: boolean;
  commentaire: string;
  agentEmail: string;
}
export interface RemiseAdminDTO {
  id: number;
  motif: string;
  pourcentage: number;
  actif: boolean;
  descriptionJustificatif: string;
  exempleJustificatif?: string;
}

export interface CreateUpdateRemiseDTO {
  motif: string;
  pourcentage: number;
  actif: boolean;
  descriptionJustificatif: string;
  exempleJustificatif?: string;
}
@Component({
  selector: 'app-dashboard-finance',
  standalone: true,
  imports: [CommonModule, FormsModule, SafePipe],
  templateUrl: './dashboard-finance.component.html',
  styleUrls: ['./dashboard-finance.component.css'],
  animations: [
    trigger('modalAnim', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.95) translateY(10px)' }),
        animate('300ms cubic-bezier(0.16, 1, 0.3, 1)',
          style({ opacity: 1, transform: 'scale(1) translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease', style({ opacity: 0, transform: 'scale(0.95)' }))
      ])
    ])
  ]
})
export class DashboardFinanceComponent implements OnInit {

  private apiUrl = `${environment.apiUrl}/FINANCE-SERVICE/api/dashboard-finance`;
  protected Math = Math;

  userProfile: KeycloakProfile | null = null;
  emailAgent = '';

  stats: DashboardFinanceDTO | null = null;
  loading = false;

  formulaires: FormulaireDashboardDTO[] = [];
  currentFilter: StatutFormulaire | 'tous' = 'tous';
  searchTerm = '';
  viewMode: 'list' | 'grid' = 'list';

  currentPage = 0;
  pageSize = 10;
  totalElements = 0;
  totalPages = 0;

  showModal = false;
  selectedFormulaire: FormulaireDashboardDTO | null = null;
  activeTab: 'preferences' | 'facture' | 'decision' = 'preferences';

  showDecisionForm = false;
  pendingDecision: 'VALIDER' | 'REFUSER' | null = null;
  commentaireDecision = '';
  actionLoading = false;

  showPaiementDialog = false;
  selectedEcheance: EcheanceDTO | null = null;
  montantPaiement = 0;
  modePaiementSelectionne: ModePaiement = 'EN_PRESENTIEL';
  paiementLoading = false;

  showRejetDialog = false;
  motifRejet = '';
  quickRejetMotifs = [
    'Remise non justifiée',
    'Documents manquants',
    'Informations incorrectes',
    'Remise non éligible',
    'Double demande de remise'
  ];

  toastVisible = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';

  showDocumentViewer = false;
  currentDocumentUrl: string | null = null;
  currentDocumentName: string | null = null;
  isImageDocument = false;

  private readonly avatarColors = [
    '#2563eb', '#059669', '#7c3aed', '#d97706',
    '#dc2626', '#0891b2', '#4f46e5', '#065f46'
  ];

  constructor(
    private http: HttpClient,
    private keycloak: KeycloakService
  ) { }

  async ngOnInit(): Promise<void> {
    try {
      if (!await this.keycloak.isLoggedIn()) return;
      this.userProfile = await this.keycloak.loadUserProfile();
      this.emailAgent = this.userProfile?.email || '';
      if (this.emailAgent) {
        this.loadStats();
        this.loadFormulaires();
      }
    } catch (e) {
      console.error('Keycloak error:', e);
    }
  }

  loadStats(): void {
    this.http.get<DashboardFinanceDTO>(`${this.apiUrl}/stats`, {
      params: { email: this.emailAgent }
    }).subscribe({
      next: s => this.stats = s,
      error: e => console.error('Stats error:', e)
    });
  }

  loadFormulaires(): void {
    this.loading = true;
    const params: any = {
      page: this.currentPage.toString(),
      size: this.pageSize.toString()
    };
    if (this.currentFilter !== 'tous') params['statut'] = this.currentFilter;
    if (this.searchTerm.trim()) params['search'] = this.searchTerm.trim();

    this.http.get<PageResponse<FormulaireDashboardDTO>>(`${this.apiUrl}/formulaires`, { params })
      .subscribe({
        next: res => {
          this.formulaires = res.content;
          this.totalElements = res.totalElements;
          this.totalPages = res.totalPages;
          this.loading = false;
        },
        error: e => {
          console.error('Formulaires error:', e);
          this.loading = false;
        }
      });
  }

  refreshAll(): void {
    this.loadStats();
    this.loadFormulaires();
  }

  setFilter(filter: StatutFormulaire | 'tous'): void {
    this.currentFilter = filter;
    this.currentPage = 0;
    this.loadFormulaires();
  }

  onSearch(): void {
    this.currentPage = 0;
    this.loadFormulaires();
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages) return;
    this.currentPage = page;
    this.loadFormulaires();
  }

  getPagesArray(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(0, this.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPages, start + maxVisible);
    if (end - start < maxVisible) start = Math.max(0, end - maxVisible);
    for (let i = start; i < end; i++) pages.push(i);
    return pages;
  }

  openDetail(f: FormulaireDashboardDTO, tab: 'preferences' | 'facture' | 'decision' = 'preferences'): void {
    this.selectedFormulaire = f;
    this.activeTab = tab;
    this.showModal = true;
    this.showDecisionForm = false;
    this.pendingDecision = null;
    this.commentaireDecision = '';

    this.http.get<FormulaireDashboardDTO>(`${this.apiUrl}/formulaires/${f.enrollmentId}`)
      .subscribe({
        next: detail => this.selectedFormulaire = detail,
        error: e => console.error('Detail error:', e)
      });
  }

  closeModal(): void {
    this.showModal = false;
    this.selectedFormulaire = null;
    this.showDecisionForm = false;
  }

  prepareDecision(decision: 'VALIDER' | 'REFUSER'): void {
    this.pendingDecision = decision;
    this.showDecisionForm = true;
    if (decision === 'VALIDER') {
      this.commentaireDecision = this.buildEmailValidation();
    } else {
      this.commentaireDecision = '';
    }
  }

  confirmerDecision(): void {
    if (!this.selectedFormulaire) return;
    this.actionLoading = true;

    const payload: ValidationRequest = {
      accepte: this.pendingDecision === 'VALIDER',
      commentaire: this.commentaireDecision,
      agentEmail: this.emailAgent
    };

    this.http.post(
      `${this.apiUrl}/formulaires/${this.selectedFormulaire.enrollmentId}/valider`,
      payload
    ).subscribe({
      next: () => {
        this.actionLoading = false;
        this.showToast(
          this.pendingDecision === 'VALIDER'
            ? '✅ Préférences validées — Facture générée'
            : '❌ Préférences refusées',
          'success'
        );
        this.closeModal();
        this.refreshAll();
      },
      error: e => {
        this.actionLoading = false;
        console.error('Decision error:', e);
        this.showToast('❌ Erreur lors de la décision', 'error');
      }
    });
  }

  confirmerRejet(): void {
    if (!this.motifRejet.trim()) return;
    this.commentaireDecision = this.motifRejet;
    this.showRejetDialog = false;
    this.showDecisionForm = true;
    this.commentaireDecision = this.buildEmailRejet();
  }

  fermerRejet(): void {
    this.showRejetDialog = false;
    this.motifRejet = '';
    this.pendingDecision = null;
  }

  selectQuickMotif(m: string): void {
    this.motifRejet = m;
  }

  ouvrirPaiement(echeance: EcheanceDTO): void {
    this.selectedEcheance = echeance;
    this.montantPaiement = echeance.montantAPayer;
    this.modePaiementSelectionne = 'EN_PRESENTIEL';
    this.showPaiementDialog = true;
  }

  fermerPaiement(): void {
    this.showPaiementDialog = false;
    this.selectedEcheance = null;
    this.montantPaiement = 0;
  }

  confirmerPaiement(): void {
    if (!this.selectedEcheance || !this.montantPaiement) return;
    this.paiementLoading = true;

    const payload: EnregistrerPaiementRequest = {
      montant: this.montantPaiement,
      modePaiement: this.modePaiementSelectionne,
      agentEmail: this.emailAgent
    };

    this.http.post(
      `${this.apiUrl}/paiements/echeance/${this.selectedEcheance.id}`,
      payload
    ).subscribe({
      next: () => {
        this.paiementLoading = false;
        this.showToast(`✅ Paiement de ${this.montantPaiement} TND enregistré`, 'success');
        this.fermerPaiement();
        if (this.selectedFormulaire) {
          this.openDetail(this.selectedFormulaire, 'facture');
        }
        this.refreshAll();
      },
      error: e => {
        this.paiementLoading = false;
        console.error('Paiement error:', e);
        this.showToast('❌ Erreur lors de l\'enregistrement du paiement', 'error');
      }
    });
  }

  private buildEmailValidation(): string {
    const f = this.selectedFormulaire!;
    const nom = `${f.prenomEtudiant || ''} ${f.nomEtudiant || ''}`.trim();
    return `Bonjour ${nom},

Votre dossier financier a été validé par le Service Finance.

Votre choix de paiement :
- Type : ${f.typePaiement === 'TOTAL' ? 'Paiement total' : 'Paiement partiel'}
${f.frequenceMois ? `- Fréquence : tous les ${f.frequenceMois} mois` : ''}
- Mode : ${f.paiementEnLigne ? 'En ligne' : 'En présentiel'}
${f.totalRemiseDemandee > 0 ? `- Remises demandées : ${f.totalRemiseDemandee}% (acceptées : ${f.totalRemiseAcceptee}%)` : ''}

Vous serez contacté(e) pour les modalités de paiement.

Cordialement,
Service Finance — ITECH University`;
  }

  private buildEmailRejet(): string {
    const f = this.selectedFormulaire!;
    const nom = `${f.prenomEtudiant || ''} ${f.nomEtudiant || ''}`.trim();
    return `Bonjour ${nom},

Après vérification de votre dossier, le Service Finance n'a pas pu valider vos préférences de paiement.

Motif : ${this.motifRejet}

Vous recevrez un nouveau formulaire pour soumettre des informations corrigées.

Cordialement,
Service Finance — ITECH University`;
  }

  isActionnable(f: FormulaireDashboardDTO): boolean {
    return f.statut === 'SOUMIS';
  }

  getInitiales(f: FormulaireDashboardDTO): string {
    return ((f.prenomEtudiant?.[0] || '') + (f.nomEtudiant?.[0] || '')).toUpperCase() || '??';
  }

  getAvatarColor(i = 0): string {
    return this.avatarColors[i % this.avatarColors.length];
  }

  getProfileInitials(): string {
    const first = this.userProfile?.firstName?.charAt(0) || '';
    const last = this.userProfile?.lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || 'AF';
  }

  getDisplayRole(): string {
    return 'Agent Finance';
  }

  getTempsEcoule(dateStr?: string): string {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr);
    const diffH = Math.floor((now.getTime() - date.getTime()) / 3600000);
    if (diffH < 24) return `Il y a ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    return diffD === 1 ? 'Hier' : `Il y a ${diffD}j`;
  }

  getStatutClass(statut: StatutFormulaire): string {
    const map: Record<string, string> = {
      EN_ATTENTE: 'chip-gray',
      SOUMIS: 'chip-blue',
      VALIDE: 'chip-green',
      REFUSE: 'chip-red'
    };
    return map[statut] || 'chip-gray';
  }

  getStatutLabel(statut: StatutFormulaire): string {
    const map: Record<string, string> = {
      EN_ATTENTE: 'En attente',
      SOUMIS: 'À traiter',
      VALIDE: 'Validé',
      REFUSE: 'Refusé'
    };
    return map[statut] || statut;
  }

  getStatutDemandeClass(statut?: string): string {
    if (!statut) return 'chip-gray';
    const map: Record<string, string> = {
      'EN_COURS_DEPARTEMENT': 'chip-blue',
      'DEPARTEMENT_VALIDE': 'chip-green',
      'REJETE_DEPARTEMENT': 'chip-red',
      'LISTE_ATTENTE': 'chip-amber',
      'INSCRIT': 'chip-green',
      'EN_ATTENTE_PAIEMENT': 'chip-purple',
      'EN_COURS_SCOLARITE': 'chip-blue',
      'SCOLARITE_VALIDEE': 'chip-green',
      'REJETE_SCOLARITE': 'chip-red',
      'SOUMIS': 'chip-blue'
    };
    return map[statut] || 'chip-gray';
  }

  getStatutDemandeLabel(statut?: string): string {
    if (!statut) return '—';
    const map: Record<string, string> = {
      'EN_COURS_DEPARTEMENT': 'En cours Dept.',
      'DEPARTEMENT_VALIDE': 'Validé Dept.',
      'REJETE_DEPARTEMENT': 'Rejeté Dept.',
      'LISTE_ATTENTE': 'Liste d\'attente',
      'INSCRIT': 'Inscrit',
      'EN_ATTENTE_PAIEMENT': 'Paiement att.',
      'EN_COURS_SCOLARITE': 'Scolarité',
      'SCOLARITE_VALIDEE': 'Validé Scol.',
      'REJETE_SCOLARITE': 'Rejeté Scol.',
      'SOUMIS': 'Soumis'
    };
    return map[statut] || statut;
  }

  getStatutPaiementClass(statut: StatutPaiement): string {
    const map: Record<string, string> = {
      EN_ATTENTE: 'chip-amber',
      PARTIEL: 'chip-blue',
      PAYE: 'chip-green'
    };
    return map[statut] || 'chip-gray';
  }

  getStatutPaiementLabel(statut: StatutPaiement): string {
    const map: Record<string, string> = {
      EN_ATTENTE: 'En attente',
      PARTIEL: 'Partiel',
      PAYE: 'Payé ✓'
    };
    return map[statut] || statut;
  }

  isStepDone(step: string): boolean {
    if (!this.selectedFormulaire) return false;
    const statut = this.selectedFormulaire.statutDemande || this.mapFinanceStatutToEnrollmentStatut();
    const order = [
      'SOUMIS',
      'EN_COURS_SCOLARITE',
      'EN_ATTENTE_DOCUMENT',
      'SCOLARITE_VALIDEE',
      'EN_COURS_DEPARTEMENT',
      'DEPARTEMENT_VALIDE',
      'EN_ATTENTE_PAIEMENT',
      'PAIEMENT_VALIDE',
      'INSCRIT'
    ];
    const stepMap: Record<string, string> = {
      'SCOLARITE': 'SCOLARITE_VALIDEE',
      'DEPARTEMENT': 'DEPARTEMENT_VALIDE',
      'PAIEMENT': 'PAIEMENT_VALIDE',
      'INSCRIT': 'INSCRIT'
    };
    const targetStatus = stepMap[step];
    if (!targetStatus) return false;
    const currentIndex = order.indexOf(statut);
    const targetIndex = order.indexOf(targetStatus);
    return currentIndex >= targetIndex && currentIndex !== -1;
  }

  isStepActive(step: string): boolean {
    if (!this.selectedFormulaire) return false;
    const statut = this.selectedFormulaire.statutDemande || this.mapFinanceStatutToEnrollmentStatut();
    const activeMap: Record<string, string[]> = {
      'SCOLARITE': ['SOUMIS', 'EN_COURS_SCOLARITE', 'EN_ATTENTE_DOCUMENT'],
      'DEPARTEMENT': ['EN_COURS_DEPARTEMENT', 'SCOLARITE_VALIDEE'],
      'PAIEMENT': ['EN_ATTENTE_PAIEMENT', 'DEPARTEMENT_VALIDE', 'SOUMIS'],
      'INSCRIT': ['PAIEMENT_VALIDE'],
    };
    if (step === 'PAIEMENT' && this.selectedFormulaire.statut === 'SOUMIS') return true;
    return activeMap[step]?.includes(statut) ?? false;
  }

  isStepFailed(step: string): boolean {
    if (!this.selectedFormulaire) return false;
    const statut = this.selectedFormulaire.statutDemande || '';
    const failureMap: Record<string, string[]> = {
      'SCOLARITE': ['REJETE_SCOLARITE'],
      'DEPARTEMENT': ['REJETE_DEPARTEMENT'],
      'PAIEMENT': ['REFUSE', 'REJETE_FINANCE'],
    };
    if (step === 'PAIEMENT' && this.selectedFormulaire.statut === 'REFUSE') return true;
    return failureMap[step]?.includes(statut) ?? false;
  }

  private mapFinanceStatutToEnrollmentStatut(): string {
    if (!this.selectedFormulaire) return '';
    switch (this.selectedFormulaire.statut) {
      case 'VALIDE': return 'PAIEMENT_VALIDE';
      case 'REFUSE': return 'REJETE_FINANCE';
      case 'SOUMIS': return 'EN_ATTENTE_PAIEMENT';
      default: return 'EN_ATTENTE_PAIEMENT';
    }
  }

  getEcheanceClass(e: EcheanceDTO): string {
    if (e.statut === 'PAYE') return 'chip-green';
    if (e.enRetard) return 'chip-red';
    return 'chip-blue';
  }

  getEcheanceLabel(e: EcheanceDTO): string {
    if (e.statut === 'PAYE') return '✓ Payée';
    if (e.enRetard) return '⚠ En retard';
    return '⏳ En attente';
  }

  getTauxRecouvrement(): number {
    if (!this.stats) return 0;
    const total = this.stats.montantTotalEncaisse + this.stats.montantTotalRestant;
    if (total === 0) return 0;
    return Math.round((this.stats.montantTotalEncaisse / total) * 100);
  }

  getNombreEcheancesImpayees(facture: FactureSummaryDTO): number {
    return facture.echeances.filter(e => e.statut === 'EN_ATTENTE').length;
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.toastVisible = true;
    setTimeout(() => this.toastVisible = false, 3500);
  }

  private remisesUrl = `${environment.apiUrl}/FINANCE-SERVICE/api/dashboard-finance/remises`;
  remises: RemiseAdminDTO[] = [];
  remisesLoading = false;

  showRemiseModal = false;
  remiseEditMode: 'create' | 'edit' = 'create';
  selectedRemise: RemiseAdminDTO | null = null;
  remiseForm: CreateUpdateRemiseDTO = this.emptyRemiseForm();
  remiseFormLoading = false;
  remiseFormError = '';

  showConfirmDelete = false;
  remiseToDelete: RemiseAdminDTO | null = null;

  private emptyRemiseForm(): CreateUpdateRemiseDTO {
    return {
      motif: '',
      pourcentage: 10,
      actif: true,
      descriptionJustificatif: '',
      exempleJustificatif: ''
    };
  }

  loadRemises(): void {
    this.remisesLoading = true;
    this.http.get<RemiseAdminDTO[]>(this.remisesUrl)
      .subscribe({
        next: (data) => {
          this.remises = data;
          this.remisesLoading = false;
        },
        error: (err) => {
          console.error('Erreur loadRemises:', err);
          this.remisesLoading = false;
        }
      });
  }

  ouvrirCreerRemise(): void {
    this.remiseEditMode = 'create';
    this.selectedRemise = null;
    this.remiseForm = this.emptyRemiseForm();
    this.remiseFormError = '';
    this.showRemiseModal = true;
  }

  ouvrirModifierRemise(r: RemiseAdminDTO): void {
    this.remiseEditMode = 'edit';
    this.selectedRemise = r;
    this.remiseForm = {
      motif: r.motif,
      pourcentage: r.pourcentage,
      actif: r.actif,
      descriptionJustificatif: r.descriptionJustificatif,
      exempleJustificatif: r.exempleJustificatif || ''
    };
    this.remiseFormError = '';
    this.showRemiseModal = true;
  }

  sauvegarderRemise(): void {
    if (!this.remiseForm.motif.trim() || !this.remiseForm.descriptionJustificatif.trim()) {
      this.remiseFormError = 'Le motif et la description du justificatif sont obligatoires.';
      return;
    }
    if (this.remiseForm.pourcentage < 1 || this.remiseForm.pourcentage > 100) {
      this.remiseFormError = 'Le pourcentage doit être entre 1 et 100.';
      return;
    }

    this.remiseFormLoading = true;
    this.remiseFormError = '';

    const request$ = this.remiseEditMode === 'create'
      ? this.http.post<RemiseAdminDTO>(this.remisesUrl, this.remiseForm)
      : this.http.put<RemiseAdminDTO>(
        `${this.remisesUrl}/${this.selectedRemise!.id}`, this.remiseForm);

    request$.subscribe({
      next: () => {
        this.remiseFormLoading = false;
        this.showRemiseModal = false;
        this.loadRemises();
        this.showToast(
          this.remiseEditMode === 'create'
            ? '✅ Remise créée avec succès'
            : '✅ Remise modifiée avec succès',
          'success'
        );
      },
      error: (e) => {
        this.remiseFormLoading = false;
        this.remiseFormError = e.error?.message || 'Une erreur est survenue.';
      }
    });
  }

  toggleRemiseActif(r: RemiseAdminDTO): void {
    this.http.patch<RemiseAdminDTO>(`${this.remisesUrl}/${r.id}/toggle`, {}).subscribe({
      next: () => {
        this.loadRemises();
        this.showToast(`🔄 Remise "${r.motif}" ${r.actif ? 'désactivée' : 'activée'}`, 'success');
      },
      error: () => this.showToast('❌ Erreur lors du changement de statut', 'error')
    });
  }

  demanderSuppressionRemise(r: RemiseAdminDTO): void {
    this.remiseToDelete = r;
    this.showConfirmDelete = true;
  }

  confirmerSuppressionRemise(): void {
    if (!this.remiseToDelete) return;
    this.http.patch<RemiseAdminDTO>(
      `${this.remisesUrl}/${this.remiseToDelete.id}/toggle`, {}
    ).subscribe({
      next: () => {
        this.showConfirmDelete = false;
        this.remiseToDelete = null;
        this.loadRemises();
        this.showToast('🔴 Remise désactivée avec succès', 'success');
      },
      error: () => this.showToast('❌ Erreur lors de la désactivation', 'error')
    });
  }

  fermerRemiseModal(): void {
    this.showRemiseModal = false;
    this.remiseFormError = '';
  }

  showRemisesDrawer = false;

  ouvrirRemisesDrawer(): void {
    this.showRemisesDrawer = true;
    this.loadRemises();
  }

  fermerRemisesDrawer(): void {
    this.showRemisesDrawer = false;
  }

  getTauxMoyenRemises(): number {
    const actives = this.remises.filter(r => r.actif);
    if (!actives.length) return 0;
    return Math.round(actives.reduce((s, r) => s + r.pourcentage, 0) / actives.length);
  }

  getRemisesActifCount(): number {
    return this.remises.filter(r => r.actif).length;
  }

  deciderRemise(remise: RemiseDTO, acceptee: boolean): void {
    if (!this.selectedFormulaire) return;
    const commentaire = acceptee
      ? `Remise "${remise.motif}" acceptée.`
      : prompt(`Motif de refus pour "${remise.motif}" :`) || '';
    if (!acceptee && !commentaire.trim()) return;
    const payload: RemiseDecisionRequest = {
      acceptee,
      commentaire,
      agentEmail: this.emailAgent
    };
    this.http.patch(
      `${this.apiUrl}/formulaires/${this.selectedFormulaire.enrollmentId}/remises/${remise.id}/decision`,
      payload
    ).subscribe({
      next: () => {
        remise.statut = acceptee ? 'ACCEPTEE' : 'REFUSEE';
        remise.commentaireAgent = commentaire;
        this.showToast(
          acceptee ? `✅ Remise "${remise.motif}" acceptée` : `❌ Remise "${remise.motif}" refusée`,
          'success'
        );
      },
      error: () => this.showToast('❌ Erreur lors de la décision', 'error')
    });
  }

  getJustificatifUrl(path: string): string {
    return `${environment.apiUrl}/FINANCE-SERVICE/api/finance/justificatifs/download?path=${encodeURIComponent(path)}`;
  }

  getRemiseStatutClass(statut: string): string {
    const map: Record<string, string> = {
      EN_ATTENTE: 'chip-amber',
      ACCEPTEE: 'chip-green',
      REFUSEE: 'chip-red'
    };
    return map[statut] || 'chip-gray';
  }

  getRemiseStatutLabel(statut: string): string {
    const map: Record<string, string> = {
      EN_ATTENTE: '⏳ En attente',
      ACCEPTEE: '✅ Acceptée',
      REFUSEE: '❌ Refusée'
    };
    return map[statut] || statut;
  }

  toutesRemisesDecidees(): boolean {
    return this.selectedFormulaire?.remisesDemandees
      ?.every(r => r.statut !== 'EN_ATTENTE') ?? true;
  }

  openDocumentViewer(remise: RemiseDTO): void {
    if (!remise.justificatifPath) return;
    this.currentDocumentName = remise.justificatifFileName || 'Document';
    this.currentDocumentUrl = this.getJustificatifUrl(remise.justificatifPath);
    const ext = remise.justificatifPath.split('.').pop()?.toLowerCase();
    const isImgExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
    const isImgType = remise.justificatifContentType?.startsWith('image/');
    this.isImageDocument = !!(isImgExt || isImgType);
    this.showDocumentViewer = true;
  }

  closeDocumentViewer(): void {
    this.showDocumentViewer = false;
    this.currentDocumentUrl = null;
    this.currentDocumentName = null;
  }
}