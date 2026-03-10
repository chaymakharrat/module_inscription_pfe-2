import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { KeycloakService } from 'keycloak-angular';
import { KeycloakProfile } from 'keycloak-js';
import { environment } from '../../envirements/enviremetns';
import { ScolariteService, CamundaTask, DocumentStatusDTO, EtudiantInfoDTO } from '../../services/scolarite.service';
import { forkJoin } from 'rxjs';
import { ParametragePrerequisComponent } from '../parametrage-prerequis/parametrage-prerequis.component';
import { SafePipe } from '../../pipes/safe.pipe';
import { trigger, style, animate, transition } from '@angular/animations';

// ─── MODELS ───────────────────────────────────────────────────────────────────

export type StatutConfirmation = 'EN_ATTENTE' | 'CONFIRME' | 'REJETE';

export interface StatsRapideDTO {
  enCours: number;
  valides: number;
  rejetes: number;
  listeAttente: number;
}

export interface DashboardDeptDTO {
  nomDepartement: string;
  nomEnseignant: string;
  emailEnseignant: string;
  nomDiplome: string;
  typeDiplome?: string;
  langue: string;
  enCours: number;
  valides: number;
  rejetes: number;
  listeAttente: number;
  capacites: CapaciteNiveauDTO[];
  demandes: DemandeDeptDTO[];
}

export interface CapaciteNiveauDTO {
  niveau: number;
  nomDiplome: string;
  typeDiplome?: string;
  langue: string;
  capaciteMax: number;
  inscritsConfirmes: number;
  enCoursTraitement: number;
  listeAttente: number;
  placesRestantes: number;
  pourcentageRemplissage: number;
  prerequisNiveau: string[];
  prerequisType: string[];
}

export interface DemandeDeptDTO {
  id: number;
  etudiantId: number;
  nomEtudiant: string;
  prenomEtudiant: string;
  emailEtudiant: string;
  nomDiplome: string;
  langue: string;
  niveauChoisi: string;
  dateCreation: string;
  statut: string;
  prerequisSatisfaits: boolean;
  prerequisDetails: PrerequisDetailDTO[];
  diplomeObtenu: string;
  etudiantInfo?: EtudiantInfoDTO;
  taskId?: string;
  tokenAcces?: string;
}

export interface PrerequisDetailDTO {
  prerequisId: number;
  prerequisRequis: string;
  obligatoire: boolean;
  source: 'TYPE' | 'NIVEAU' | 'ANNEE' | string;

  // TYPE → vérification automatique
  valeurCandidat?: string;
  conforme?: boolean;

  // NIVEAU → confirmation manuelle
  statutConfirmation?: StatutConfirmation;
  motifRejet?: string;
  confirmedBy?: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface ConfirmPrerequisRequest {
  prerequisId: number;
  statut: 'CONFIRME' | 'REJETE';
  motifRejet?: string | null;
  agentEmail: string;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-dashboard-departement',
  standalone: true,
  imports: [CommonModule, FormsModule, ParametragePrerequisComponent, SafePipe],
  templateUrl: './dashboard-departement.component.html',
  styleUrls: ['./dashboard-departement.component.css'],
  animations: [
    trigger('modalAnim', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.95) translateY(10px)' }),
        animate('300ms cubic-bezier(0.16, 1, 0.3, 1)',
          style({ opacity: 1, transform: 'scale(1) translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms cubic-bezier(0.7, 0, 0.84, 0)',
          style({ opacity: 0, transform: 'scale(0.95) translateY(10px)' }))
      ])
    ])
  ]
})
export class DashboardDepartementComponent implements OnInit {

  @ViewChild(ParametragePrerequisComponent) paramComponent!: ParametragePrerequisComponent;

  // State principal
  dashboard: DashboardDeptDTO | null = null;
  loading = false;
  userProfile: KeycloakProfile | null = null;
  emailEnseignant = '';
  protected Math = Math;

  private apiUrl = `${environment.apiUrl}/DEPARTEMENT-SERVICE/api/dashboardDepartment`;

  // Table / filtres
  currentFilter = 'tous';
  searchTerm = '';
  filteredDemandes: DemandeDeptDTO[] = [];
  viewMode: 'list' | 'grid' = 'list';

  // Pagination
  currentPage = 0;
  pageSize = 4;
  totalElements = 0;
  totalPages = 0;

  // Modal détail
  showModal = false;
  selectedDemande: DemandeDeptDTO | null = null;
  activeTab: 'prerequis' | 'etudiant' | 'decision' = 'prerequis';

  // Documents
  loadingDocuments = false;
  etudiantDocuments: DocumentStatusDTO[] = [];
  readonly ETUDIANT_SERVICE_URL = 'http://localhost:8888/ETUDIANT-SERVICE';
  currentDocumentBlobUrl: string | null = null;
  currentDocumentUrl: string | null = null;
  currentDocumentName: string | null = null;
  showDocumentViewer = false;
  isImageDocument = false;

  // Décision
  showDecisionForm = false;
  pendingDecision: 'ACCEPTE' | 'LISTE_ATTENTE' | 'REJETE' | null = null;
  commentaire = '';
  actionLoading = false;
  tokenFormulaire: string | null = null;
  loadingToken = false;

  // ── Confirmation prérequis NIVEAU ─────────────────────────────────────────
  showRejetPrerequisDialog = false;
  selectedPrerequisToReject: PrerequisDetailDTO | null = null;
  motifRejetPrerequis = '';
  prerequisActionLoading = false;
  quickRejetPrerequis: string[] = [
    'Moyenne insuffisante',
    'Diplôme non reconnu',
    'Niveau requis non atteint',
    'Certificat manquant',
    'Expérience insuffisante'
  ];

  // Toast
  toastVisible = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';

  // Rejet Document
  showRejectDocDialog = false;
  selectedDocToReject: DocumentStatusDTO | null = null;
  rejectionDocComment = '';
  quickRejectReasons: string[] = [
    'Copie illisible',
    'Document expiré',
    'Mauvais format',
    'Informations incorrectes',
    'Sceau manquant'
  ];

  // Analytics
  bacDistribution = [
    { label: 'Bac Math', pct: 45, color: '#2563eb' },
    { label: 'Bac Info', pct: 30, color: '#059669' },
    { label: 'Bac Sciences', pct: 15, color: '#d97706' },
    { label: 'Autres', pct: 10, color: '#8b92a9' }
  ];

  private readonly avatarColors = [
    '#2563eb', '#059669', '#7c3aed', '#d97706',
    '#dc2626', '#0891b2', '#4f46e5', '#065f46'
  ];
  showParametrage = false;

  constructor(
    private http: HttpClient,
    private keycloak: KeycloakService,
    private scolariteService: ScolariteService
  ) { }

  async ngOnInit(): Promise<void> {
    try {
      const isLoggedIn = await this.keycloak.isLoggedIn();
      if (!isLoggedIn) return;

      const profile = await this.keycloak.loadUserProfile();
      this.userProfile = profile;

      this.emailEnseignant =
        (profile.email || '') ||
        (this.keycloak.getKeycloakInstance().tokenParsed as any)?.email || '';

      if (!this.emailEnseignant) return;

      this.loadDashboard();
    } catch {
      // Erreur Keycloak silencieuse
    }
  }

  // ─── DATA ─────────────────────────────────────────────────────────────────

  loadDashboard(): void {
    if (!this.emailEnseignant) return;
    this.loading = true;
    const email = this.emailEnseignant.trim().toLowerCase();

    forkJoin({
      info: this.http.get<DashboardDeptDTO>(`${this.apiUrl}/dashboard`, { params: { email } }),
      demandes: this.http.get<PageResponse<DemandeDeptDTO>>(`${this.apiUrl}/demandes`, {
        params: { email, page: '0', size: this.pageSize.toString() }
      })
    }).subscribe({
      next: ({ info, demandes }) => {
        this.dashboard = { ...info, demandes: demandes.content };
        this.totalElements = demandes.totalElements;
        this.totalPages = demandes.totalPages;
        this.filteredDemandes = demandes.content;
        this.loading = false;
      },
      error: (err) => {
        console.error('❌ Erreur dashboard:', err);
        this.loading = false;
      }
    });
  }

  refreshAfterDecision(): void {
    if (!this.emailEnseignant || !this.dashboard) return;
    const email = this.emailEnseignant.trim().toLowerCase();

    forkJoin({
      stats: this.http.get<StatsRapideDTO>(`${this.apiUrl}/stats`, { params: { email } }),
      capacites: this.http.get<CapaciteNiveauDTO[]>(`${this.apiUrl}/capacites`, { params: { email } }),
      demandes: this.http.get<PageResponse<DemandeDeptDTO>>(`${this.apiUrl}/demandes`, {
        params: {
          email,
          statut: this.getStatutFromFilter(this.currentFilter),
          search: this.searchTerm.trim(),
          page: this.currentPage.toString(),
          size: this.pageSize.toString()
        }
      })
    }).subscribe({
      next: ({ stats, capacites, demandes }) => {
        this.dashboard = {
          ...this.dashboard!,
          enCours: stats.enCours,
          valides: stats.valides,
          rejetes: stats.rejetes,
          listeAttente: stats.listeAttente,
          capacites,
          demandes: demandes.content
        };
        this.filteredDemandes = demandes.content;
        this.totalElements = demandes.totalElements;
        this.totalPages = demandes.totalPages;
      },
      error: (err) => console.error('❌ Erreur refresh:', err)
    });
  }

  loadDemandesFromBackend(): void {
    if (!this.emailEnseignant || !this.dashboard) return;
    const email = this.emailEnseignant.trim().toLowerCase();

    this.http.get<PageResponse<DemandeDeptDTO>>(`${this.apiUrl}/demandes`, {
      params: {
        email,
        statut: this.getStatutFromFilter(this.currentFilter),
        search: this.searchTerm.trim(),
        page: this.currentPage.toString(),
        size: this.pageSize.toString()
      }
    }).subscribe({
      next: (response) => {
        this.dashboard!.demandes = response.content;
        this.filteredDemandes = response.content;
        this.totalElements = response.totalElements;
        this.totalPages = response.totalPages;
      },
      error: (err) => console.error('❌ Erreur demandes:', err)
    });
  }

  // ─── FILTRES ──────────────────────────────────────────────────────────────

  setFilter(filter: string): void {
    this.currentFilter = filter;
    this.currentPage = 0;
    this.loadDemandesFromBackend();
  }

  onSearch(): void {
    this.currentPage = 0;
    this.loadDemandesFromBackend();
  }

  private getStatutFromFilter(filter: string): string {
    const map: Record<string, string> = {
      'liste_attente': 'LISTE_ATTENTE',
      'valides': 'DEPARTEMENT_VALIDE',
      'rejetes': 'REJETE_DEPARTEMENT'
    };
    return map[filter] || '';
  }

  // ─── PAGINATION ───────────────────────────────────────────────────────────

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages) return;
    this.currentPage = page;
    this.loadDemandesFromBackend();
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

  // ─── MODAL ────────────────────────────────────────────────────────────────

  openDetail(
    demande: DemandeDeptDTO,
    tab: 'prerequis' | 'etudiant' | 'decision' = 'prerequis'
  ): void {
    this.selectedDemande = demande;
    this.activeTab = tab;
    this.showModal = true;
    this.showDecisionForm = false;
    this.pendingDecision = null;
    this.commentaire = '';
    this.etudiantDocuments = [];

    if (demande.etudiantId) {
      this.loadDocumentsEtudiant(demande.etudiantId);
    }

    this.scolariteService.getTasksForEnrollment(demande.id).subscribe({
      next: (tasks: CamundaTask[]) => {
        if (tasks?.length > 0) {
          this.selectedDemande!.taskId = tasks[0].id;
        }
      },
      error: (err) => console.error('Erreur taskId:', err)
    });
  }

  closeModal(): void {
    this.showModal = false;
    this.selectedDemande = null;
    this.showDecisionForm = false;
  }

  openDecision(demande: DemandeDeptDTO, decision: 'ACCEPTE' | 'LISTE_ATTENTE' | 'REJETE'): void {
    this.openDetail(demande, 'decision');
    setTimeout(() => this.prepareDecision(decision), 100);
  }

  // ─── CONFIRMATION PRÉREQUIS NIVEAU ────────────────────────────────────────

  /**
   * Confirme directement (✓) un prérequis de niveau
   */
  confirmerPrerequisOk(detail: PrerequisDetailDTO): void {
    if (!this.selectedDemande) return;
    this.prerequisActionLoading = true;

    const payload: ConfirmPrerequisRequest = {
      prerequisId: detail.prerequisId,
      statut: 'CONFIRME',
      motifRejet: null,
      agentEmail: this.emailEnseignant
    };
    console.log('📤 Payload envoyé:', JSON.stringify(payload));
    console.log('📧 agentEmail:', this.emailEnseignant);

    this.http.post(
      `${this.apiUrl}/demandes/${this.selectedDemande.id}/prerequis/confirm`,
      payload
    ).subscribe({
      next: () => {
        detail.statutConfirmation = 'CONFIRME';
        detail.motifRejet = undefined;
        detail.confirmedBy = this.emailEnseignant;
        this.prerequisActionLoading = false;
        this.recalculerPrerequisGlobal();
        this.showToast('✅ Prérequis confirmé', 'success');
      },
      error: (err) => {
        console.error('Erreur confirmation prérequis:', err);
        console.error('❌ Status:', err.status);
        console.error('❌ Error body:', err.error);
        this.prerequisActionLoading = false;
        this.showToast('❌ Erreur lors de la confirmation', 'error');
      }
    });
  }

  /**
   * Ouvre le dialog de rejet pour un prérequis de niveau
   */
  ouvrirRejetPrerequis(detail: PrerequisDetailDTO): void {
    this.selectedPrerequisToReject = detail;
    this.motifRejetPrerequis = '';
    this.showRejetPrerequisDialog = true;
  }

  fermerRejetPrerequis(): void {
    this.showRejetPrerequisDialog = false;
    this.selectedPrerequisToReject = null;
    this.motifRejetPrerequis = '';
  }

  selectQuickRejetPrerequis(motif: string): void {
    this.motifRejetPrerequis = motif;
  }

  /**
   * Confirme le rejet d'un prérequis avec motif
   */
  confirmerRejetPrerequis(): void {
    if (!this.selectedDemande || !this.selectedPrerequisToReject || !this.motifRejetPrerequis.trim()) return;
    this.prerequisActionLoading = true;

    const payload: ConfirmPrerequisRequest = {
      prerequisId: this.selectedPrerequisToReject.prerequisId,
      statut: 'REJETE',
      motifRejet: this.motifRejetPrerequis.trim(),
      agentEmail: this.emailEnseignant
    };

    this.http.post(
      `${this.apiUrl}/demandes/${this.selectedDemande.id}/prerequis/confirm`,
      payload
    ).subscribe({
      next: () => {
        this.selectedPrerequisToReject!.statutConfirmation = 'REJETE';
        this.selectedPrerequisToReject!.motifRejet = this.motifRejetPrerequis.trim();
        this.selectedPrerequisToReject!.confirmedBy = this.emailEnseignant;
        this.prerequisActionLoading = false;
        this.recalculerPrerequisGlobal();
        this.fermerRejetPrerequis();
        this.showToast('❌ Prérequis rejeté', 'success');
      },
      error: (err) => {
        console.error('Erreur rejet prérequis:', err);
        this.prerequisActionLoading = false;
        this.showToast('❌ Erreur lors du rejet', 'error');
      }
    });
  }
  /**
   * Recalcule prerequisSatisfaits global en temps réel
   * TYPE → conforme automatique
   * NIVEAU → statutConfirmation === CONFIRME
   * Un prérequis obligatoire REJETE ou EN_ATTENTE = non satisfait
   */
  recalculerPrerequisGlobal(): void {
    if (!this.selectedDemande) return;
    const details = this.selectedDemande.prerequisDetails;

    const typeOk = details
      .filter(d => d.source === 'TYPE' && d.obligatoire)
      .every(d => d.conforme === true);

    const niveauOk = details
      .filter(d => d.source === 'NIVEAU' && d.obligatoire)
      .every(d => d.statutConfirmation === 'CONFIRME');

    this.selectedDemande.prerequisSatisfaits = typeOk && niveauOk;

    // Mettre à jour aussi dans la liste principale
    const idx = this.filteredDemandes.findIndex(d => d.id === this.selectedDemande!.id);
    if (idx !== -1) {
      this.filteredDemandes[idx].prerequisSatisfaits = this.selectedDemande.prerequisSatisfaits;
    }
  }

  /**
   * Vérifie si tous les prérequis obligatoires de niveau ont été traités
   * (CONFIRME ou REJETE — pas EN_ATTENTE)
   */
  tousPrerequisNiveauTraites(): boolean {
    if (!this.selectedDemande) return true;
    const niveauObligatoires = this.selectedDemande.prerequisDetails
      .filter(d => d.source === 'NIVEAU' && d.obligatoire);

    if (niveauObligatoires.length === 0) return true;

    return niveauObligatoires.every(
      d => d.statutConfirmation === 'CONFIRME' || d.statutConfirmation === 'REJETE'
    );
  }

  /**
   * Retourne le nombre de prérequis NIVEAU en attente de traitement
   */
  getNombrePrerequisEnAttente(): number {
    if (!this.selectedDemande) return 0;
    return this.selectedDemande.prerequisDetails
      .filter(d => d.source === 'NIVEAU' && d.obligatoire && (!d.statutConfirmation || d.statutConfirmation === 'EN_ATTENTE'))
      .length;
  }

  // ─── DÉCISION ─────────────────────────────────────────────────────────────

  prepareDecision(decision: 'ACCEPTE' | 'LISTE_ATTENTE' | 'REJETE'): void {
    this.pendingDecision = decision;
    this.showDecisionForm = true;

    if (decision === 'ACCEPTE') {
      this.loadingToken = true;
      this.commentaire = '';

      this.http.post(
        `${environment.apiUrl}/FINANCE-SERVICE/api/formulaire/token/generate/${this.selectedDemande!.id}`,
        {},
        { responseType: 'text' }
      ).subscribe({
        next: (token) => {
          this.tokenFormulaire = token;
          this.loadingToken = false;
          this.commentaire = this.buildEmailValidation(token);
        },
        error: (err) => {
          console.error('Erreur génération token:', err);
          this.loadingToken = false;
          this.commentaire = this.buildEmailValidation(null);
        }
      });

    } else if (decision === 'LISTE_ATTENTE') {
      this.commentaire = this.buildEmailListeAttente();
    } else {
      this.commentaire = this.buildEmailRejet();
    }
  }

  confirmerDecision(): void {
    if (!this.selectedDemande || !this.pendingDecision || !this.commentaire.trim()) return;

    const taskId = this.selectedDemande.taskId;
    if (!taskId) {
      this.showToast('❌ Tâche introuvable dans le workflow', 'error');
      return;
    }

    this.actionLoading = true;
    const login = this.userProfile?.email || this.userProfile?.username || 'enseignant_responsable';

    this.scolariteService.completeTask(taskId, this.pendingDecision, this.commentaire, login)
      .subscribe({
        next: () => {
          this.actionLoading = false;
          this.showToast(
            this.pendingDecision === 'ACCEPTE' ? '✅ Dossier validé avec succès' :
              this.pendingDecision === 'LISTE_ATTENTE' ? '🕐 Candidat mis en liste d\'attente' :
                '❌ Dossier rejeté avec succès',
            'success'
          );
          this.showModal = false;
          this.refreshAfterDecision();
        },
        error: (err) => {
          this.actionLoading = false;
          console.error('Erreur décision:', err);
          this.showToast('❌ Erreur lors du traitement de la décision', 'error');
        }
      });
  }

  // ─── BUILDERS EMAIL ───────────────────────────────────────────────────────

  private buildEmailValidation(token: string | null): string {
    const diplome = this.selectedDemande?.nomDiplome || 'votre diplôme';
    const dept = this.dashboard?.nomDepartement || 'le Département';
    const enseignant = this.dashboard?.nomEnseignant || 'Le Responsable';
    const frontendBaseUrl = 'http://localhost:4200';
    const lienFormulaire = token
      ? `${frontendBaseUrl}/paiement/formulaire?token=${token}`
      : '[LIEN FORMULAIRE - SERA GÉNÉRÉ AUTOMATIQUEMENT]';

    return `Aperçu de l'email
-----------------------------------------
À : ${this.selectedDemande?.emailEtudiant || ''}
Objet : ✅ Candidature validée — Prochaine étape : Paiement

Bonjour ${this.selectedDemande?.prenomEtudiant || 'Candidat(e)'},

Nous avons le plaisir de vous informer que votre candidature pour le diplôme
"${diplome}" a été validée par ${dept}.

─────────────────────────────────────────
📋 ÉTAPE SUIVANTE : Préférences de paiement
─────────────────────────────────────────

Veuillez remplir le formulaire via le lien sécurisé ci-dessous.

🔗 Lien sécurisé (valable 3 jours) :
${lienFormulaire}

⚠️  Vous avez 3 jours pour remplir ce formulaire.
Sans réponse dans ce délai, votre dossier sera automatiquement annulé.

Cordialement,
${enseignant}
${dept} — ITECH University`;
  }

  private buildEmailListeAttente(): string {
    const nom = this.selectedDemande ? `${this.selectedDemande.prenomEtudiant} ${this.selectedDemande.nomEtudiant}` : 'Candidat(e)';
    const diplome = this.selectedDemande?.nomDiplome || 'votre diplôme';

    return `Bonjour ${nom},

Votre candidature pour le diplôme "${diplome}" a été évaluée favorablement.

Cependant, la capacité maximale de la formation est actuellement atteinte.
Vous êtes inscrit(e) en liste d'attente et serez contacté(e) dès qu'une place se libère.

Cordialement,
${this.dashboard?.nomEnseignant || 'Le Responsable'}
${this.dashboard?.nomDepartement || 'Le Département'} — ITECH University`;
  }

  private buildEmailRejet(): string {
    const nom = this.selectedDemande ? `${this.selectedDemande.prenomEtudiant} ${this.selectedDemande.nomEtudiant}` : 'Candidat(e)';
    const diplome = this.selectedDemande?.nomDiplome || 'votre diplôme';

    return `Bonjour ${nom},

Après évaluation pédagogique, nous regrettons de vous informer que votre
candidature pour le diplôme "${diplome}" n'a pas été retenue.

Motif : [À préciser]

Cordialement,
${this.dashboard?.nomEnseignant || 'Le Responsable'}
${this.dashboard?.nomDepartement || 'Le Département'} — ITECH University`;
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  getCapaciteGlobale(): { inscrits: number; max: number; pct: number } | null {
    if (!this.dashboard?.capacites?.length) return null;
    const totMax = this.dashboard.capacites.reduce((s, c) => s + c.capaciteMax, 0);
    const totInscrits = this.dashboard.capacites.reduce((s, c) => s + c.inscritsConfirmes + c.enCoursTraitement, 0);
    return { inscrits: totInscrits, max: totMax, pct: Math.min(100, (totInscrits / totMax) * 100) };
  }

  isCapaciteAtteinte(niveau?: string): boolean {
    if (!this.dashboard?.capacites?.length) return false;
    if (niveau) {
      const cap = this.dashboard.capacites.find(c => c.niveau.toString() === niveau);
      return cap ? cap.inscritsConfirmes >= cap.capaciteMax : false;
    }
    return this.dashboard.capacites.some(c => c.inscritsConfirmes >= c.capaciteMax);
  }

  getCapaciteText(niveau?: string): string {
    if (!this.dashboard?.capacites?.length) return '—';
    if (niveau) {
      const cap = this.dashboard.capacites.find(c => c.niveau.toString() === niveau);
      if (cap) return `${cap.inscritsConfirmes + cap.enCoursTraitement}/${cap.capaciteMax}`;
    }
    const cap = this.dashboard.capacites[0];
    return `${cap.inscritsConfirmes + cap.enCoursTraitement}/${cap.capaciteMax}`;
  }

  getDemandesListeAttente(): DemandeDeptDTO[] {
    return this.dashboard?.demandes?.filter(d => d.statut === 'LISTE_ATTENTE') || [];
  }

  isActionnable(demande: DemandeDeptDTO): boolean {
    return demande.statut === 'EN_COURS_DEPARTEMENT';
  }

  /**
   * La décision VALIDER est disponible seulement si :
   * - Pas de prérequis obligatoires REJETES
   * - Tous les prérequis de niveau obligatoires sont traités
   */
  canValider(): boolean {
    if (!this.selectedDemande) return false;
    if (isCapaciteAtteinte_local(this.selectedDemande, this.dashboard)) return false;

    const hasRejete = this.selectedDemande.prerequisDetails
      .some(d => d.obligatoire && d.statutConfirmation === 'REJETE');
    if (hasRejete) return false;

    return this.tousPrerequisNiveauTraites();
  }

  getStatutClass(statut: string): string {
    const map: Record<string, string> = {
      'EN_COURS_DEPARTEMENT': 'chip-blue',
      'DEPARTEMENT_VALIDE': 'chip-green',
      'REJETE_DEPARTEMENT': 'chip-red',
      'LISTE_ATTENTE': 'chip-amber',
      'INSCRIT': 'chip-green',
      'EN_ATTENTE_PAIEMENT': 'chip-purple'
    };
    return map[statut] || 'chip-gray';
  }

  getStatutLabel(statut: string): string {
    const map: Record<string, string> = {
      'EN_COURS_DEPARTEMENT': 'En cours',
      'DEPARTEMENT_VALIDE': 'Validé',
      'REJETE_DEPARTEMENT': 'Rejeté',
      'LISTE_ATTENTE': 'Liste d\'attente',
      'INSCRIT': 'Inscrit',
      'EN_ATTENTE_PAIEMENT': 'Paiement att.'
    };
    return map[statut] || statut;
  }

  getInitiales(): string {
    if (!this.dashboard?.nomEnseignant) return 'E';
    const parts = this.dashboard.nomEnseignant.replace('Dr. ', '').split(' ');
    return parts.map(p => p[0]).join('').substring(0, 2).toUpperCase() || 'EN';
  }

  getDisplayRole(): string {
    if (this.keycloak.isUserInRole('ENSEIGNANT_RESPONSABLE')) return 'Responsable de Diplôme';
    return 'Enseignant';
  }

  getProfileInitials(): string {
    if (!this.userProfile) return this.getInitiales();
    const first = this.userProfile.firstName?.charAt(0) || '';
    const last = this.userProfile.lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || this.getInitiales();
  }

  getInitialesEtudiant(d: DemandeDeptDTO): string {
    return ((d.prenomEtudiant?.[0] || '') + (d.nomEtudiant?.[0] || '')).toUpperCase();
  }

  getAvatarColor(index = 0): string {
    return this.avatarColors[index % this.avatarColors.length];
  }

  getTempsEcoule(dateStr: string): string {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr);
    const diffH = Math.floor((now.getTime() - date.getTime()) / 3600000);
    if (diffH < 24) return `Il y a ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return 'Hier';
    return `Il y a ${diffD}j`;
  }

  getTauxAcceptation(): number {
    if (!this.dashboard) return 0;
    const total = this.dashboard.valides + this.dashboard.rejetes;
    if (total === 0) return 0;
    return Math.round((this.dashboard.valides / total) * 100);
  }

  // ─── PARAMÉTRAGE ──────────────────────────────────────────────────────────

  openAddPrereq(): void {
    if (this.paramComponent) this.paramComponent.openAddModal(null);
  }

  getCommonPrerequisType(): string[] {
    if (!this.dashboard?.capacites?.length) return [];
    return this.dashboard.capacites[0].prerequisType || [];
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.toastVisible = true;
    setTimeout(() => this.toastVisible = false, 3500);
  }

  // ─── WORKFLOW STEPPER ─────────────────────────────────────────────────────

  isStepDone(step: string): boolean {
    if (!this.selectedDemande) return false;
    const statut = this.selectedDemande.statut || '';
    const order = [
      'SOUMIS', 'EN_COURS_SCOLARITE', 'EN_ATTENTE_DOCUMENT',
      'SCOLARITE_VALIDEE', 'EN_COURS_DEPARTEMENT', 'DEPARTEMENT_VALIDE',
      'EN_ATTENTE_PAIEMENT', 'PAIEMENT_VALIDE', 'INSCRIT'
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
    if (!this.selectedDemande) return false;
    const statut = this.selectedDemande.statut || '';
    const stepMap: Record<string, string[]> = {
      'SCOLARITE': ['SOUMIS', 'EN_COURS_SCOLARITE', 'EN_ATTENTE_DOCUMENT'],
      'DEPARTEMENT': ['EN_COURS_DEPARTEMENT', 'SCOLARITE_VALIDEE'],
      'PAIEMENT': ['EN_ATTENTE_PAIEMENT', 'DEPARTEMENT_VALIDE'],
      'INSCRIT': ['PAIEMENT_VALIDE'],
    };
    return stepMap[step]?.includes(statut) ?? false;
  }

  isStepFailed(step: string): boolean {
    if (!this.selectedDemande) return false;
    const statut = this.selectedDemande.statut || '';
    const failureMap: Record<string, string[]> = {
      'SCOLARITE': ['REJETE_SCOLARITE'],
      'DEPARTEMENT': ['REJETE_DEPARTEMENT'],
      'PAIEMENT': ['REJETE_FINANCE'],
    };
    return failureMap[step]?.includes(statut) ?? false;
  }

  // ─── UI HELPERS ───────────────────────────────────────────────────────────

  getPrerequisBySource(
    demande: DemandeDeptDTO,
    source: 'TYPE' | 'NIVEAU' | 'ANNEE'
  ): PrerequisDetailDTO[] {
    return demande.prerequisDetails?.filter(p => p.source === source) || [];
  }

  allConform(list: PrerequisDetailDTO[]): boolean {
    if (!list || list.length === 0) return true;
    return list.every(p => p.source === 'TYPE' ? p.conforme === true : p.statutConfirmation === 'CONFIRME');
  }

  conformCount(list: PrerequisDetailDTO[]): number {
    if (!list) return 0;
    return list.filter(p =>
      p.source === 'TYPE' ? p.conforme === true : p.statutConfirmation === 'CONFIRME'
    ).length;
  }

  getCountPrerequisOk(demande: DemandeDeptDTO): number {
    if (!demande?.prerequisDetails) return 0;
    return demande.prerequisDetails.filter(p =>
      p.source === 'TYPE' ? p.conforme === true : p.statutConfirmation === 'CONFIRME'
    ).length;
  }

  getCountPrerequisKo(demande: DemandeDeptDTO): number {
    if (!demande?.prerequisDetails) return 0;
    return demande.prerequisDetails.filter(p =>
      p.source === 'TYPE' ? p.conforme === false : p.statutConfirmation === 'REJETE'
    ).length;
  }

  getStatutConfirmationClass(statut?: StatutConfirmation): string {
    switch (statut) {
      case 'CONFIRME': return 'badge-conform';
      case 'REJETE': return 'badge-nonconform';
      default: return 'badge-pending';
    }
  }

  getStatutConfirmationLabel(statut?: StatutConfirmation): string {
    switch (statut) {
      case 'CONFIRME': return '✓ Confirmé';
      case 'REJETE': return '✗ Rejeté';
      default: return '⏳ En attente';
    }
  }

  // ─── DOCUMENTS ────────────────────────────────────────────────────────────

  loadDocumentsEtudiant(etudiantId: number): void {
    this.loadingDocuments = true;
    this.etudiantDocuments = [];

    this.http
      .get<DocumentStatusDTO[]>(`${this.ETUDIANT_SERVICE_URL}/api/documents/etudiant/${etudiantId}/status`)
      .subscribe({
        next: (docs) => {
          this.etudiantDocuments = docs;
          this.loadingDocuments = false;
        },
        error: (err) => {
          console.error('❌ Erreur chargement documents:', err);
          this.loadingDocuments = false;
        }
      });
  }

  viewDocument(documentId: number, documentName: string | null): void {
    const url = `${this.ETUDIANT_SERVICE_URL}/api/documents/view/${documentId}`;

    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        if (this.currentDocumentBlobUrl) URL.revokeObjectURL(this.currentDocumentBlobUrl);
        this.isImageDocument = blob.type.startsWith('image/');
        this.currentDocumentBlobUrl = URL.createObjectURL(blob);
        this.currentDocumentUrl = this.currentDocumentBlobUrl;
        this.currentDocumentName = documentName || 'Document';
        this.showDocumentViewer = true;
      },
      error: () => this.showToast('Impossible de charger le document', 'error')
    });
  }

  closeDocumentViewer(): void {
    this.showDocumentViewer = false;
    if (this.currentDocumentBlobUrl) {
      URL.revokeObjectURL(this.currentDocumentBlobUrl);
      this.currentDocumentBlobUrl = null;
    }
    this.currentDocumentUrl = null;
    this.currentDocumentName = null;
  }

  openRejectDocDialog(doc: DocumentStatusDTO): void {
    this.selectedDocToReject = doc;
    this.rejectionDocComment = '';
    this.showRejectDocDialog = true;
  }

  closeRejectDocDialog(): void {
    this.showRejectDocDialog = false;
    this.selectedDocToReject = null;
    this.rejectionDocComment = '';
  }

  selectQuickReason(reason: string): void {
    this.rejectionDocComment = reason;
  }

  confirmRejectDocument(): void {
    if (!this.selectedDocToReject || !this.rejectionDocComment.trim()) return;
    this.selectedDocToReject.statut = 'REJETE';
    this.selectedDocToReject.isValidated = false;
    this.selectedDocToReject.commentaireValidation = this.rejectionDocComment;
    this.showToast('Document marqué comme rejeté', 'success');
    this.closeRejectDocDialog();
  }

  getDocumentsValides(): number {
    return this.etudiantDocuments.filter(d => d.statut === 'VALIDE').length;
  }

  getDocumentsManquants(): number {
    return this.etudiantDocuments.filter(d => d.statut === 'MANQUANTE' || d.statut === 'REJETE').length;
  }

  documentTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'CARTE_IDENTITE': 'Carte d\'identité',
      'PASSPORT': 'Passeport',
      'BAC': 'Diplôme du Baccalauréat',
      'RELEVE_NOTES_BAC': 'Relevé de notes Bac',
      'CERTIFICAT_RESIDENCE': 'Certificat de résidence',
      'ACTE_NAISSANCE': 'Acte de naissance',
      'DIPLOME_SUPERIEUR': 'Dernier diplôme',
      'RELEVE_NOTES_SUPERIEUR': 'Relevé de notes universitaire'
    };
    return labels[type] || type;
  }

  getDocumentStatutLabel(statut: string): string {
    const map: Record<string, string> = {
      SOUMIS: 'Soumis', VALIDE: 'Validé ✓', REJETE: 'Rejeté',
      MANQUANTE: 'Manquant', RELANCE: 'Relancé'
    };
    return map[statut] || statut;
  }

  getDocumentStatutClass(statut: string): string {
    const map: Record<string, string> = {
      SOUMIS: 'pill-soumis', VALIDE: 'pill-valide', REJETE: 'pill-rejete',
      MANQUANTE: 'pill-manquant', RELANCE: 'pill-soumis'
    };
    return map[statut] || '';
  }
  // Variable pour le filtre niveau actif
  selectedNiveau: string | null = null;

  // Méthode appelée au clic sur une carte niveau
  filtrerParNiveau(cap: CapaciteNiveauDTO): void {
    // Si on reclique la même carte → désélectionner
    const niveauKey = `${cap.niveau}-${cap.langue}`;
    if (this.selectedNiveau === niveauKey) {
      this.selectedNiveau = null;
      this.currentFilter = 'tous';
    } else {
      this.selectedNiveau = niveauKey;
      this.currentFilter = 'tous';
    }
    this.currentPage = 0;
    this.loadDemandesParNiveau(cap);
  }

  // loadDemandesParNiveau(cap: CapaciteNiveauDTO): void {
  //   if (!this.emailEnseignant || !this.dashboard) return;
  //   const email = this.emailEnseignant.trim().toLowerCase();

  //   this.http.get<PageResponse<DemandeDeptDTO>>(`${this.apiUrl}/demandes`, {
  //     params: {
  //       email,
  //       niveau: cap.niveau.toString(),
  //       langue: cap.langue,
  //       page: '0',
  //       size: this.pageSize.toString()
  //     }
  //   }).subscribe({
  //     next: (response) => {
  //       this.filteredDemandes = response.content;
  //       this.totalElements = response.totalElements;
  //       this.totalPages = response.totalPages;
  //       this.currentPage = 0;
  //       // Scroll vers le tableau
  //       setTimeout(() => {
  //         document.querySelector('.dept-table')?.scrollIntoView({ behavior: 'smooth' });
  //       }, 100);
  //     },
  //     error: (err) => console.error('❌ Erreur filtre niveau:', err)
  //   });
  // }
  loadDemandesParNiveau(cap: CapaciteNiveauDTO): void {
    if (!this.emailEnseignant || !this.dashboard) return;
    const email = this.emailEnseignant.trim().toLowerCase();

    this.http.get<PageResponse<DemandeDeptDTO>>(`${this.apiUrl}/demandes`, {
      params: {
        email,
        niveau: cap.niveau.toString(),
        langue: cap.langue,          // ← correspond exactement au champ langue de DemandeInscriptionDTO
        page: '0',
        size: this.pageSize.toString()
      }
    }).subscribe({
      next: (response) => {
        this.filteredDemandes = response.content;
        this.totalElements = response.totalElements;
        this.totalPages = response.totalPages;
        this.currentPage = 0;
        setTimeout(() => {
          document.querySelector('.section-card:last-of-type')
            ?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      },
      error: (err) => console.error('❌ Erreur filtre niveau:', err)
    });
  }

  clearFiltreNiveau(): void {
    this.selectedNiveau = null;
    this.currentPage = 0;
    this.loadDemandesFromBackend();
  }
}

// Helper externe (évite erreur "this" dans arrow function)
function isCapaciteAtteinte_local(demande: DemandeDeptDTO, dashboard: DashboardDeptDTO | null): boolean {
  if (!dashboard?.capacites?.length) return false;
  const cap = dashboard.capacites.find(c => c.niveau.toString() === demande.niveauChoisi);
  return cap ? cap.inscritsConfirmes >= cap.capaciteMax : false;
}
