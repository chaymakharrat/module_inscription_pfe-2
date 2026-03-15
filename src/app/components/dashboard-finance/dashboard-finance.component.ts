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
import { ScolariteService } from '../../services/scolarite.service';

export type StatutFormulaire = 'EN_ATTENTE' | 'SOUMIS' | 'VALIDE' | 'REFUSE';
export type StatutEcheance = 'EN_ATTENTE' | 'PAYE' | 'IMPAYE';
export type StatutPaiement = 'EN_ATTENTE' | 'PARTIEL' | 'PAYE';
export type TypePaiement = 'TOTAL' | 'PARTIEL';
export type ModePaiement = 'ESPECES' | 'CARTE_BANCAIRE' | 'VIREMENT' | 'CHEQUE' | 'EN_LIGNE';

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
  montantBrut: number;
  montantTotal: number;
  montantPaye: number;
  montantRestant: number;
  statusPaiement: StatutPaiement;
  typePaiement: TypePaiement;
  frequenceMois?: number;
  echeances: EcheanceDTO[];
  remises: RemiseDTO[];   // ← ce champ
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
  today: Date = new Date();

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
  activeTab: 'preferences' | 'facture' = 'preferences';

  showDecisionForm = false;
  pendingDecision: 'VALIDER' | 'REFUSER' | null = null;
  commentaireDecision = '';
  actionLoading = false;

  showPaiementDialog = false;
  selectedEcheance: EcheanceDTO | null = null;
  montantPaiement = 0;
  modePaiementSelectionne: ModePaiement = 'ESPECES';
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

  // --- Nouveaux états flux rejet & modification locales ---
  showUnsavedChangesDialog = false;
  showRejetRemiseModal = false;
  selectedRemiseForRejet: RemiseDTO | null = null;
  rejetRemiseMotif = 'Document illisible ou non conforme';
  rejetRemiseQuickMotifs = [
    'Document illisible',
    'Document expiré',
    'Mauvais document',
    'Document incomplet'
  ];
  // Stockage local des décisions (remiseId -> décision)
  pendingRemiseDecisions = new Map<number, { acceptee: boolean, commentaire: string }>();

  private readonly avatarColors = [
    '#2563eb', '#059669', '#7c3aed', '#d97706',
    '#dc2626', '#0891b2', '#4f46e5', '#065f46'
  ];

  constructor(
    private http: HttpClient,
    private keycloak: KeycloakService,
    private scolariteService: ScolariteService
  ) { }

  async ngOnInit(): Promise<void> {
    try {
      if (!await this.keycloak.isLoggedIn()) return;
      this.userProfile = await this.keycloak.loadUserProfile();
      this.emailAgent = this.userProfile?.email || '';
      if (this.emailAgent) {
        this.loadStats();
        this.loadFormulaires();
        this.loadRemises();
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

  openDetail(f: FormulaireDashboardDTO, tab: 'preferences' | 'facture' = 'preferences'): void {
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
    if (this.pendingRemiseDecisions.size > 0 && !this.showUnsavedChangesDialog) {
      this.showUnsavedChangesDialog = true;
      return;
    }
    this.showModal = false;
    this.selectedFormulaire = null;
    this.showDecisionForm = false;
    this.showUnsavedChangesDialog = false;
    // On ne clear pas forcément pendingRemiseDecisions ici si on veut "garder en mémoire"
    // Mais on le fera lors d'un "Tout annuler" ou d'une validation finale
  }

  discardAndClose(): void {
    this.pendingRemiseDecisions.clear();
    this.showUnsavedChangesDialog = false;
    this.showModal = false;
    this.selectedFormulaire = null;
  }

  forceCloseModal(): void {
    // "Quitter et garder mes notes" -> On ferme mais on laisse les décisions dans Map
    this.showUnsavedChangesDialog = false;
    this.showModal = false;
    this.selectedFormulaire = null;
  }

  prepareDecision(decision: 'VALIDER' | 'REFUSER'): void {
    if (!this.toutesRemisesDecidees()) {
      this.showToast('⚠️ Vous devez accepter ou refuser chaque document (remise) soumis avant de prendre une décision finale.', 'error');
      return;
    }

    this.pendingDecision = decision;
    this.showDecisionForm = true;
    if (decision === 'VALIDER') {
      this.commentaireDecision = 'Dossier validé. Les préférences financières ont été confirmées.';
    } else {
      this.commentaireDecision = '';
    }
  }

  async confirmerDecision(): Promise<void> {
    if (!this.selectedFormulaire || this.actionLoading) return;
    this.actionLoading = true;

    const accepte = this.pendingDecision === 'VALIDER';

    try {
      // 1. Persister les décisions sur les remises si nécessaire
      if (this.pendingRemiseDecisions.size > 0) {
        for (const [remiseId, decision] of this.pendingRemiseDecisions.entries()) {
          const payload = {
            acceptee: decision.acceptee,
            commentaire: decision.commentaire,
            agentEmail: this.emailAgent
          };
          await this.http.patch(
            `${this.apiUrl}/formulaires/${this.selectedFormulaire.enrollmentId}/remises/${remiseId}/decision`,
            payload
          ).toPromise();
        }
      }

      // 2. Récupérer le taskId Camunda
      const env = (window as any).environment || { workflowServiceUrl: 'http://localhost:8080' }; // Fallback simple si import manquant
      const tasks = await this.scolariteService.getTasksForEnrollment(this.selectedFormulaire.enrollmentId).toPromise();

      if (!tasks || tasks.length === 0) {
        this.actionLoading = false;
        this.showToast('❌ Aucune tâche Camunda trouvée pour ce dossier', 'error');
        return;
      }

      const taskId = tasks[0].id;

      // 3. Compléter la tâche
      // Note: On utilise direct HTTP car scolariteService.completeTask peut ne pas correspondre au format attendu en Finance
      await this.http.post(
        `${environment.workflowServiceUrl}/api/workflow/tasks/${taskId}/complete`,
        {
          decision: accepte ? 'ACCEPTE' : 'REJETE',
          commentaire: this.commentaireDecision,
          loginUtilisateur: this.emailAgent
        }
      ).toPromise();

      this.actionLoading = false;
      this.showToast(
        accepte ? '✅ Préférences validées' : '❌ Préférences refusées',
        'success'
      );
      this.pendingRemiseDecisions.clear();
      this.closeModal();
      this.refreshAll();

    } catch (error) {
      this.actionLoading = false;
      console.error('Validation error:', error);
      this.showToast('❌ Erreur lors de la validation', 'error');
    }
  }

  confirmerRejet(): void {
    if (!this.motifRejet.trim()) return;
    this.commentaireDecision = this.motifRejet;
    this.showRejetDialog = false;
    this.showDecisionForm = true;
    this.commentaireDecision = '';
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

    // Le backend a déjà déduit la remise du `montantAPayer` de l'échéance.
    // On ne doit donc PAS réappliquer la remise ici sous peine d'un double discount.
    this.montantPaiement = echeance.montantAPayer;

    this.modePaiementSelectionne = 'ESPECES';
    this.showPaiementDialog = true;
  }

  fermerPaiement(): void {
    this.showPaiementDialog = false;
    this.selectedEcheance = null;
    this.montantPaiement = 0;
  }

  recalculerTotauxRemises(): void {
    if (!this.selectedFormulaire) return;

    // Somme des pourcentages des remises qui sont soit déjà ACCEPTEE en base
    // SOIT ont une décision locale "acceptee" en cours dans pendingRemiseDecisions
    const total = this.selectedFormulaire.remisesDemandees.reduce((sum, r) => {
      const pending = this.pendingRemiseDecisions.get(r.id);
      const isAccepted = pending ? pending.acceptee : (r.statut === 'ACCEPTEE');
      return isAccepted ? sum + r.pourcentage : sum;
    }, 0);

    this.selectedFormulaire.totalRemiseAcceptee = total;
  }

  // confirmerPaiement(): void {
  //   if (!this.selectedEcheance || !this.montantPaiement) return;
  //   this.paiementLoading = true;

  //   const payload: EnregistrerPaiementRequest = {
  //     montant: this.montantPaiement,
  //     modePaiement: this.modePaiementSelectionne,
  //     agentEmail: this.emailAgent
  //   };

  //   this.http.post(
  //     `${this.apiUrl}/paiements/echeance/${this.selectedEcheance.id}`,
  //     payload
  //   ).subscribe({
  //     next: () => {
  //       this.paiementLoading = false;
  //       this.showToast(`✅ Paiement de ${this.montantPaiement} TND enregistré`, 'success');
  //       this.fermerPaiement();
  //       if (this.selectedFormulaire) {
  //         this.openDetail(this.selectedFormulaire, 'facture');
  //       }
  //       this.refreshAll();
  //     },
  //     error: e => {
  //       this.paiementLoading = false;
  //       console.error('Paiement error:', e);
  //       this.showToast('❌ Erreur lors de l\'enregistrement du paiement', 'error');
  //     }
  //   });
  // }
  confirmerPaiement(): void {
    if (!this.selectedEcheance || !this.montantPaiement || !this.selectedFormulaire) return;
    this.paiementLoading = true;

    this.scolariteService.getTasksForEnrollment(this.selectedFormulaire.enrollmentId)
      .subscribe({
        next: (tasks) => {
          console.log('🔍 Toutes les tâches:', JSON.stringify(tasks)); // ← DEBUG

          const task = tasks?.find(t =>
            t.name?.toLowerCase().includes('paiement') ||
            t.name?.toLowerCase().includes('configurer')
          ) || tasks?.[0];

          console.log('✅ Tâche sélectionnée:', task); // ← DEBUG

          if (!task) {
            this.paiementLoading = false;
            this.showToast('❌ Aucune tâche active trouvée', 'error');
            return;
          }

          this.http.post(
            `${environment.workflowServiceUrl}/api/workflow/tasks/${task.id}/complete/paiement`,
            {
              echeanceId: this.selectedEcheance!.id,
              montantRecu: this.montantPaiement,
              modePaiementRecu: this.modePaiementSelectionne,
              agentEmail: this.emailAgent
            }
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
            error: (e) => {
              this.paiementLoading = false;
              console.error('❌ Erreur paiement:', e); // ← DEBUG
              this.showToast('❌ Erreur lors du paiement', 'error');
            }
          });
        },
        error: (e) => {
          this.paiementLoading = false;
          console.error('❌ Erreur tâches:', e); // ← DEBUG
          this.showToast('❌ Erreur récupération tâche', 'error');
        }
      });
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
      'FORMULAIRE_ENVOYE',
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
      'PAIEMENT': ['EN_ATTENTE_PAIEMENT', 'FORMULAIRE_ENVOYE', 'DEPARTEMENT_VALIDE', 'SOUMIS'],
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

  getNombreEcheancesImpayees(facture?: FactureSummaryDTO): number {
    if (!facture || !facture.echeances) return 0;
    return facture.echeances.filter(e => e.statut === 'EN_ATTENTE' || e.statut === 'IMPAYE').length;
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

    if (acceptee) {
      const commentaire = `Remise "${remise.motif}" acceptée.`;
      // Mise à jour locale immédiate pour le feedback visuel
      remise.statut = 'ACCEPTEE';
      remise.commentaireAgent = commentaire;
      this.pendingRemiseDecisions.set(remise.id, { acceptee: true, commentaire });
      this.recalculerTotauxRemises(); // Mise à jour globale immédiate
      this.showToast(`✓ Remise "${remise.motif}" acceptée localement`, 'success');
    } else {
      this.ouvrirRejetRemise(remise);
    }
  }

  // --- Logique Rejet Remise (Nouveau Modal) ---
  ouvrirRejetRemise(remise: RemiseDTO): void {
    this.selectedRemiseForRejet = remise;
    this.rejetRemiseMotif = 'Document illisible ou non conforme';
    this.showRejetRemiseModal = true;
  }

  selectQuickMotifRemise(motif: string): void {
    this.rejetRemiseMotif = motif;
  }

  annulerRejetRemise(): void {
    this.showRejetRemiseModal = false;
    this.selectedRemiseForRejet = null;
  }

  confirmerRejetRemise(): void {
    if (!this.selectedRemiseForRejet || !this.rejetRemiseMotif.trim()) return;

    const remise = this.selectedRemiseForRejet;
    const commentaire = this.rejetRemiseMotif;

    // Mise à jour locale
    remise.statut = 'REFUSEE';
    remise.commentaireAgent = commentaire;
    this.pendingRemiseDecisions.set(remise.id, { acceptee: false, commentaire });
    this.recalculerTotauxRemises(); // Mise à jour globale immédiate

    this.showToast(`✕ Remise "${remise.motif}" refusée localement`, 'success');
    this.annulerRejetRemise();
  }

  // NOTE: La persistence réelle en base se fait lors de confirmerDecision() 
  // en itérant sur pendingRemiseDecisions si on choisit de regrouper, 
  // OU on peut aussi envoyer les requêtes une par une dès que confirmerRejetRemise() est cliqué.
  // L'utilisateur dit: "si il clique rejet ou accepte on n'envoie la requête vers la base de données seulement si il prend une décision accepte ou refuse"
  // Cela signifie probablement que l'envoi vers la DB doit être fait IMMÉDIATEMENT quand l'agent clique sur "Confirmer le rejet" dans le nouveau modal.
  // Rectifions confirmerRejetRemise() pour envoyer la requête si c'est ce qui est voulu.
  // "on n'envoie la requête [...] seulement si il prend une décision" -> décision individuelle remise.

  confirmerRejetRemiseBase(): void {
    if (!this.selectedRemiseForRejet || !this.selectedFormulaire) return;

    const remise = this.selectedRemiseForRejet;
    const commentaire = this.rejetRemiseMotif;
    const payload: RemiseDecisionRequest = {
      acceptee: false,
      commentaire,
      agentEmail: this.emailAgent
    };

    this.actionLoading = true;
    this.http.patch(
      `${this.apiUrl}/formulaires/${this.selectedFormulaire.enrollmentId}/remises/${remise.id}/decision`,
      payload
    ).subscribe({
      next: () => {
        remise.statut = 'REFUSEE';
        remise.commentaireAgent = commentaire;
        this.actionLoading = false;
        this.showToast(`❌ Remise "${remise.motif}" refusée`, 'success');
        this.annulerRejetRemise();
        // On retire de pending si c'était là (car c'est maintenant en DB)
        this.pendingRemiseDecisions.delete(remise.id);
      },
      error: () => {
        this.actionLoading = false;
        this.showToast('❌ Erreur lors du refus de la remise', 'error');
      }
    });
  }

  accepterRemiseBase(remise: RemiseDTO): void {
    if (!this.selectedFormulaire) return;
    const commentaire = `Remise "${remise.motif}" acceptée.`;
    const payload: RemiseDecisionRequest = {
      acceptee: true,
      commentaire,
      agentEmail: this.emailAgent
    };

    this.http.patch(
      `${this.apiUrl}/formulaires/${this.selectedFormulaire.enrollmentId}/remises/${remise.id}/decision`,
      payload
    ).subscribe({
      next: () => {
        remise.statut = 'ACCEPTEE';
        remise.commentaireAgent = commentaire;
        this.showToast(`✅ Remise "${remise.motif}" acceptée`, 'success');
        this.pendingRemiseDecisions.delete(remise.id);
      },
      error: () => this.showToast('❌ Erreur lors de l\'acceptation', 'error')
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
    if (!this.selectedFormulaire?.remisesDemandees) return true;
    return this.selectedFormulaire.remisesDemandees.every(r =>
      r.statut !== 'EN_ATTENTE' || this.pendingRemiseDecisions.has(r.id)
    );
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
  pdfLoading = false;
  recuPdfLoadingMap: { [key: number]: boolean } = {};

  downloadFacturePdf(factureId: number): void {
    this.pdfLoading = true;
    const url = `${environment.apiUrl}/FINANCE-SERVICE/api/finance/factures/${factureId}/pdf`;
    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `facture-${factureId}.pdf`;
        link.click();
        URL.revokeObjectURL(link.href);
        this.pdfLoading = false;
        this.showToast('✅ Facture téléchargée', 'success');
      },
      error: () => {
        this.pdfLoading = false;
        this.showToast('❌ Erreur téléchargement PDF', 'error');
      }
    });
  }

  downloadRecuPaiement(echeanceId: number): void {
    this.recuPdfLoadingMap[echeanceId] = true;
    const url = `${environment.apiUrl}/FINANCE-SERVICE/api/finance/paiements/echeance/${echeanceId}/recu`;
    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `recu-paiement-${echeanceId}.pdf`;
        link.click();
        URL.revokeObjectURL(link.href);
        this.recuPdfLoadingMap[echeanceId] = false;
        this.showToast('✅ Reçu téléchargé', 'success');
      },
      error: () => {
        this.recuPdfLoadingMap[echeanceId] = false;
        this.showToast('❌ Erreur téléchargement PDF', 'error');
      }
    });
  }
}