import { Component, OnInit, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { KeycloakService } from 'keycloak-angular';
import { KeycloakProfile } from 'keycloak-js';
import { AnneeUniversitaire } from '../../models/academic-year.model';
import { environment } from '../../envirements/enviremetns';
import { ScolariteService, CamundaTask, DocumentStatusDTO, EtudiantInfoDTO } from '../../services/scolarite.service';
import { forkJoin, of } from 'rxjs';
import { ParametragePrerequisComponent } from '../parametrage-prerequis/parametrage-prerequis.component';
import { SafePipe } from '../../pipes/safe.pipe';
import { trigger, style, animate, transition } from '@angular/animations';
import { StudentService } from '../../services/student.service';


// ─── MODELS ───────────────────────────────────────────────────────────────────

export type StatutScore = 'EN_ATTENTE' | 'REJETE' | 'INSUFFISANT' | 'PARTIEL' | 'CONFIRME';

export interface StatsRapideDTO {
  enCours: number; valides: number; rejetes: number; listeAttente: number;
}

export interface AcceptanceSegment {
  label: string;
  count: number;
  pct: number;
  color: string;
}

export interface DashboardDeptDTO {
  nomDepartement: string; nomEnseignant: string; emailEnseignant: string;
  nomDiplome: string; typeDiplome?: string; langue: string;
  enCours: number; valides: number; rejetes: number; listeAttente: number;
  capacites: CapaciteNiveauDTO[]; demandes: DemandeDeptDTO[];
}

export interface CapaciteNiveauDTO {
  id: number;
  niveau: number; nomDiplome: string; nomDiplomeResponsable: string; typeDiplome?: string; langue: string;
  capaciteMax: number; inscritsConfirmes: number; enCoursTraitement: number;
  enCoursDepartement: number; listeAttente: number; placesRestantes: number;
  pourcentageRemplissage: number; prerequisNiveau: string[]; prerequisType: string[];
  nbGroupes?: number;
  tailleGroupe?: number;
  scoreMinimum?: number;
  // UI states
  groups?: EnrollmentGroup[];
  loadingGroups?: boolean;
  showGroups?: boolean;
}

export interface EnrollmentGroup {
  id: number;
  nom: string;
  statut: 'EN_FORMATION' | 'COMPLET' | 'EN_PROMOTION' | 'ANNULE';
  niveauSpecifiqueId: number;
  demandes?: DemandeGroupDTO[];
  loadingDemandes?: boolean;
}

export interface DemandeGroupDTO {
  id: number;
  numeroDossier: string;
  etudiantNom: string;
  etudiantPrenom: string;
  statutActuel: string;
  dateStatus?: string;
}

export interface DemandeDeptDTO {
  id: number; etudiantId: number; nomEtudiant: string; prenomEtudiant: string;
  emailEtudiant: string; nomDiplome: string; langue: string; niveauChoisi: string;
  dateCreation: string; statut: string; prerequisSatisfaits: boolean;
  prerequisDetails: PrerequisDetailDTO[]; diplomeObtenu: string;
  etudiantInfo?: EtudiantInfoDTO; taskId?: string; tokenAcces?: string;
  scoreTotal: number; prerequisTraites: number; prerequisTotal: number;
}

export interface PrerequisDetailDTO {
  prerequisId: number; prerequisRequis: string;
  source: 'TYPE' | 'NIVEAU' | 'ANNEE' | string;
  valeurCandidat?: string; conforme?: boolean;
  score?: number | null;
  motifRejet?: string; confirmedBy?: string;
  statutConfirmation?: StatutScore;
}

export interface PageResponse<T> {
  content: T[]; totalElements: number; totalPages: number; number: number; size: number;
}

export interface ConfirmPrerequisRequest {
  prerequisId: number; score: number; motifRejet?: string | null; agentEmail: string;
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

  dashboard: DashboardDeptDTO | null = null;
  loading = false;
  userProfile: KeycloakProfile | null = null;
  emailEnseignant = '';
  protected Math = Math;

  // ── Année Universitaire ──────────────────────────────────────────────────
  anneesUniversitaires: AnneeUniversitaire[] = [];
  selectedAnnee: string = '';
  isCurrentYear: boolean = true;
  isAnneeSelectOpen: boolean = false;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.annee-select-wrapper')) {
      this.isAnneeSelectOpen = false;
    }
  }

  toggleAnneeSelect(): void {
    this.isAnneeSelectOpen = !this.isAnneeSelectOpen;
  }

  selectCustomAnnee(annee: string): void {
    if (this.selectedAnnee !== annee) {
      this.selectedAnnee = annee;
      this.onAnneeChange();
    }
    this.isAnneeSelectOpen = false;
  }

  private apiUrl = `${environment.apiUrl}/DEPARTEMENT-SERVICE/api/dashboardDepartment`;

  // Table / filtres UNIFIÉS
  currentFilter = 'tous';
  searchTerm = '';
  currentDiplome = '';
  currentNiveau = '';
  currentLangue = '';
  currentPrerequisFilter: 'OK' | 'KO' | '' = '';
  filteredDemandes: DemandeDeptDTO[] = [];
  selectedGroup: EnrollmentGroup | null = null;
  viewMode: 'list' | 'grid' = 'list';

  // Accordion PAR_TYPE — collapsed diplomes
  collapsedDiplomes: Set<string> = new Set();

  // Pagination
  currentPage = 0;
  pageSize = 10;
  totalElements = 0;
  totalPages = 0;

  // Modal
  showModal = false;
  selectedDemande: DemandeDeptDTO | null = null;
  activeTab: 'prerequis' | 'decision' = 'prerequis';

  // Documents
  loadingDocuments = false;
  etudiantDocuments: DocumentStatusDTO[] = [];
  readonly ETUDIANT_SERVICE_URL = 'http://localhost:8888/ETUDIANT-SERVICE';
  currentDocumentBlobUrl: string | null = null;
  currentDocumentUrl: string | null = null;
  currentDocumentName: string | null = null;
  showDocumentViewer = false;
  isImageDocument = false;
  showPreview = false;
  activeDocumentId: number | null = null;

  // 🆕 Historique des documents
  showDocHistory: { [key: number]: boolean } = {};
  toggleDocHistory(docId: number) {
    this.showDocHistory[docId] = !this.showDocHistory[docId];
  }

  // Décision
  showDecisionForm = false;
  pendingDecision: 'ACCEPTE' | 'LISTE_ATTENTE' | 'REJETE' | null = null;
  commentaire = '';
  actionLoading = false;
  tokenFormulaire: string | null = null;
  loadingToken = false;

  // ── Score prérequis NIVEAU — slider inline ───────────────────────────────
  prerequisActionLoading = false;
  motifEnCours: Map<number, string> = new Map();

  // ── Session Cache ────────────────────────────────────────────────────────
  private sessionPrereqCache: Map<number, Map<number, Partial<PrerequisDetailDTO>>> = new Map();
  private sessionDocCache: Map<number, Map<number, Partial<DocumentStatusDTO>>> = new Map();

  showUnsavedChangesDialog = false;

  get pendingPrereqChanges(): Map<number, Partial<PrerequisDetailDTO>> {
    if (!this.selectedDemande) return new Map();
    if (!this.sessionPrereqCache.has(this.selectedDemande.id))
      this.sessionPrereqCache.set(this.selectedDemande.id, new Map());
    return this.sessionPrereqCache.get(this.selectedDemande.id)!;
  }

  get pendingDocChanges(): Map<number, Partial<DocumentStatusDTO>> {
    if (!this.selectedDemande) return new Map();
    if (!this.sessionDocCache.has(this.selectedDemande.id))
      this.sessionDocCache.set(this.selectedDemande.id, new Map());
    return this.sessionDocCache.get(this.selectedDemande.id)!;
  }

  hasUnsavedChanges(): boolean {
    return this.pendingPrereqChanges.size > 0 || this.pendingDocChanges.size > 0;
  }

  // Toast
  toastVisible = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';

  // Rejet Document
  showRejectDocDialog = false;
  selectedDocToReject: DocumentStatusDTO | null = null;
  rejectionDocComment = '';
  quickRejectReasons: string[] = [
    'Copie illisible', 'Document expiré', 'Mauvais format',
    'Informations incorrectes', 'Sceau manquant'
  ];

  private readonly avatarColors = [
    '#2563eb', '#059669', '#7c3aed', '#d97706',
    '#dc2626', '#0891b2', '#4f46e5', '#065f46'
  ];
  showParametrage = false;

  constructor(
    private http: HttpClient,
    private keycloak: KeycloakService,
    private scolariteService: ScolariteService,
    private studentService: StudentService
  ) { }

  // ─── HIERARCHICAL GROUPS ──────────────────────────────────────────────────

  toggleGroups(cap: CapaciteNiveauDTO): void {
    cap.showGroups = !cap.showGroups;
    if (cap.showGroups && !cap.groups) {
      this.loadGroupsForNiveau(cap);
    }
  }

  loadGroupsForNiveau(cap: CapaciteNiveauDTO): void {
    if (!cap.id) return;
    cap.loadingGroups = true;
    this.scolariteService.getGroupsByNiveauSpecifique(cap.id).subscribe({
      next: (groups: any[]) => {
        cap.groups = groups;
        cap.loadingGroups = false;
      },
      error: (err) => {
        console.error('Erreur chargement groupes:', err);
        cap.loadingGroups = false;
        this.showToast('Erreur lors du chargement des groupes', 'error');
      }
    });
  }

  loadDemandesForGroup(group: EnrollmentGroup): void {
    if (!group.id) return;
    group.loadingDemandes = true;
    this.scolariteService.getDemandesByGroupId(group.id).subscribe({
      next: (demandes: DemandeGroupDTO[]) => {
        // Sécurité : on filtre aussi côté front
        group.demandes = demandes.filter(d => !d.statutActuel?.includes('REJETE'));
        group.loadingDemandes = false;
      },
      error: (err) => {
        console.error('Erreur chargement étudiants:', err);
        group.loadingDemandes = false;
      }
    });
  }

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

      this.loadAcademicYears();
    } catch { }
  }

  loadAcademicYears(): void {
    this.scolariteService.getAnneesUniversitairesList().subscribe({
      next: (years) => {
        this.anneesUniversitaires = years;
        const current = years.find(y => y.courante);
        if (current) {
          this.selectedAnnee = current.annee;
          this.isCurrentYear = true;
        } else if (years.length > 0) {
          this.selectedAnnee = years[0].annee;
          this.isCurrentYear = years[0].courante;
        }
        this.loadDashboard();
      },
      error: (err) => {
        console.error('❌ Erreur chargement années:', err);
        this.loadDashboard();
      }
    });
  }

  onAnneeChange(): void {
    const year = this.anneesUniversitaires.find(y => y.annee === this.selectedAnnee);
    this.isCurrentYear = year ? year.courante : true;
    this.currentPage = 0;
    this.loadDashboard();
  }

  // ─── DATA ────────────────────────────────────────────────────────────────

  loadDashboard(): void {
    if (!this.emailEnseignant) return;
    this.loading = true;
    const email = this.emailEnseignant.trim().toLowerCase();
    const annee = this.selectedAnnee;
    forkJoin({
      info: this.http.get<DashboardDeptDTO>(`${this.apiUrl}/dashboard`, { params: { email, annee } }),
      demandes: this.http.get<PageResponse<DemandeDeptDTO>>(`${this.apiUrl}/demandes`, {
        params: { email, annee, page: '0', size: this.pageSize.toString() }
      })
    }).subscribe({
      next: ({ info, demandes }) => {
        this.dashboard = { ...info, demandes: demandes.content };
        this.totalElements = demandes.totalElements;
        this.totalPages = demandes.totalPages;
        this.filteredDemandes = demandes.content;
        this.loading = false;
      },
      error: (err) => { console.error('❌ Erreur dashboard:', err); this.loading = false; }
    });
  }

  refreshAfterDecision(): void {
    if (!this.emailEnseignant || !this.dashboard) return;
    const email = this.emailEnseignant.trim().toLowerCase();
    const annee = this.selectedAnnee;
    forkJoin({
      stats: this.http.get<StatsRapideDTO>(`${this.apiUrl}/stats`, { params: { email, annee } }),
      capacites: this.http.get<CapaciteNiveauDTO[]>(`${this.apiUrl}/capacites`, { params: { email, annee } }),
      demandes: this.http.get<PageResponse<DemandeDeptDTO>>(`${this.apiUrl}/demandes`, {
        params: {
          email, annee, statut: this.getStatutFromFilter(this.currentFilter),
          search: this.searchTerm.trim(),
          nomDiplome: this.currentDiplome,
          page: this.currentPage.toString(), size: this.pageSize.toString()
        }
      })
    }).subscribe({
      next: ({ stats, capacites, demandes }) => {
        this.dashboard = {
          ...this.dashboard!, enCours: stats.enCours, valides: stats.valides,
          rejetes: stats.rejetes, listeAttente: stats.listeAttente,
          capacites, demandes: demandes.content
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
    this.loading = true;
    const email = this.emailEnseignant.trim().toLowerCase();
    const annee = this.selectedAnnee;

    const params: any = {
      email,
      annee,
      statut: this.getStatutFromFilter(this.currentFilter),
      search: this.searchTerm.trim(),
      niveau: this.currentNiveau,
      langue: this.currentLangue,
      nomDiplome: this.currentDiplome,
      page: this.currentPage.toString(),
      size: this.pageSize.toString()
    };

    if (this.selectedGroup) params.groupId = this.selectedGroup.id.toString();

    if (this.currentPrerequisFilter === 'OK') params.prerequisSatisfaits = 'true';
    if (this.currentPrerequisFilter === 'KO') params.prerequisSatisfaits = 'false';

    this.http.get<PageResponse<DemandeDeptDTO>>(`${this.apiUrl}/demandes`, { params }).subscribe({
      next: (response) => {
        this.dashboard!.demandes = response.content;
        this.filteredDemandes = response.content;
        this.totalElements = response.totalElements;
        this.totalPages = response.totalPages;
        this.loading = false;
      },
      error: (err) => {
        console.error('❌ Erreur demandes:', err);
        this.loading = false;
      }
    });
  }

  // ─── FILTRES / PAGINATION ────────────────────────────────────────────────

  setFilter(filter: string): void {
    if (filter === 'prerequis_ok') {
      this.currentPrerequisFilter = 'OK';
      this.currentFilter = 'prerequis_ok';
    } else if (filter === 'prerequis_ko') {
      this.currentPrerequisFilter = 'KO';
      this.currentFilter = 'prerequis_ko';
    } else if (filter === 'tous') {
      this.currentPrerequisFilter = '';
      this.currentFilter = 'tous';
      this.currentDiplome = '';
      this.currentNiveau = '';
      this.currentLangue = '';
      this.searchTerm = '';
      this.selectedNiveau = null;
    } else {
      this.currentFilter = filter;
      this.currentPrerequisFilter = ''; // Reset prereq filter when switching major status
    }
    this.currentPage = 0;
    this.loadDemandesFromBackend();
  }

  resetFilters(): void {
    this.currentFilter = 'tous';
    this.currentPrerequisFilter = '';
    this.currentDiplome = '';
    this.currentNiveau = '';
    this.currentLangue = '';
    this.searchTerm = '';
    this.selectedNiveau = null;
    this.selectedGroup = null;
    this.currentPage = 0;
    this.loadDemandesFromBackend();
  }

  onSearch(): void {
    this.currentPage = 0;
    this.loadDemandesFromBackend();
  }

  getFilterLabel(): string {
    const map: Record<string, string> = {
      'tous': 'Toutes les demandes',
      'en_cours': 'En cours département',
      'liste_attente': 'Liste d\'attente',
      'valides': 'Validées / Inscrites',
      'rejetes': 'Rejetées',
      'prerequis_ok': 'Prérequis OK',
      'prerequis_ko': 'Prérequis KO'
    };
    return map[this.currentFilter] || this.currentFilter;
  }

  private getStatutFromFilter(filter: string): string {
    const map: Record<string, string> = {
      'liste_attente': 'ATTENTE',
      'valides': 'VALIDE',
      'rejetes': 'REJETE',
      'en_cours': 'EN_COURS'
    };
    return map[filter] || '';
  }

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

  // ─── MODAL ───────────────────────────────────────────────────────────────

  openDetail(demande: DemandeDeptDTO, tab: 'prerequis' | 'decision' = 'prerequis'): void {
    this.selectedDemande = {
      ...demande,
      prerequisDetails: demande.prerequisDetails ? demande.prerequisDetails.map(p => ({ ...p })) : []
    };
    this.activeTab = tab;
    this.showModal = true;
    this.showDecisionForm = false;
    this.pendingDecision = null;
    this.commentaire = '';
    this.etudiantDocuments = [];
    this.motifEnCours = new Map();

    if (demande.etudiantId) {
      this.loadDocumentsEtudiant(demande.etudiantId, demande.id);
      this.loadEtudiantInfo(demande.etudiantId);
    }

    if (this.pendingPrereqChanges.size > 0) {
      this.pendingPrereqChanges.forEach((change, pid) => {
        const p = this.selectedDemande?.prerequisDetails.find(pr => pr.prerequisId === pid);
        if (p) Object.assign(p, change);
      });
      this.recalculerPrerequisGlobal();
    }

    this.scolariteService.getTasksForEnrollment(demande.id).subscribe({
      next: (tasks: CamundaTask[]) => { if (tasks?.length > 0) this.selectedDemande!.taskId = tasks[0].id; },
      error: (err) => console.error('Erreur taskId:', err)
    });
  }

  closeModal(): void {
    if (this.hasUnsavedChanges()) this.showUnsavedChangesDialog = true;
    else this.forceCloseModal();
  }

  forceCloseModal(): void {
    this.showModal = false;
    this.selectedDemande = null;
    this.showDecisionForm = false;
    this.showUnsavedChangesDialog = false;
  }

  discardAndClose(): void {
    if (this.selectedDemande) {
      this.sessionPrereqCache.delete(this.selectedDemande.id);
      this.sessionDocCache.delete(this.selectedDemande.id);
    }
    this.forceCloseModal();
  }

  openDecision(demande: DemandeDeptDTO, decision: 'ACCEPTE' | 'LISTE_ATTENTE' | 'REJETE'): void {
    this.openDetail(demande, 'decision');
    setTimeout(() => this.prepareDecision(decision), 100);
  }

  // ─── SCORE PRÉREQUIS — SLIDER INLINE ────────────────────────────────────

  setScorePrerequis(detail: PrerequisDetailDTO, score: number): void {
    if (!this.selectedDemande) return;
    detail.score = score;
    detail.statutConfirmation = this.getStatutFromScore(score);
    if (score >= 50) {
      detail.motifRejet = undefined;
      this.motifEnCours.delete(detail.prerequisId);
    }
    this.pendingPrereqChanges.set(detail.prerequisId, {
      score,
      motifRejet: score >= 50 ? undefined : (this.motifEnCours.get(detail.prerequisId) || undefined),
      confirmedBy: this.emailEnseignant
    });
    this.recalculerPrerequisGlobal();
  }

  setMotifPrerequis(detail: PrerequisDetailDTO, motif: string): void {
    this.motifEnCours.set(detail.prerequisId, motif);
    detail.motifRejet = motif;
    const change = this.pendingPrereqChanges.get(detail.prerequisId);
    if (change) change.motifRejet = motif;
  }

  // ─── HELPERS SCORE ───────────────────────────────────────────────────────

  getStatutFromScore(score: number | null | undefined): StatutScore {
    if (score === null || score === undefined) return 'EN_ATTENTE';
    if (score === 0) return 'REJETE';
    if (score < 50) return 'INSUFFISANT';
    if (score < 100) return 'PARTIEL';
    return 'CONFIRME';
  }

  getScoreColor(score: number | null | undefined): string {
    if (score === null || score === undefined) return '#94a3b8';
    if (score < 50) return '#ef4444';
    if (score < 75) return '#f59e0b';
    return '#10b981';
  }

  getScoreTotalColor(score: number): string {
    if (score < 50) return '#ef4444';
    if (score < 75) return '#f59e0b';
    return '#10b981';
  }

  getScoreTotalLabel(score: number): string {
    if (score === 0) return 'Non évalué';
    if (score < 50) return 'Insuffisant';
    if (score < 75) return 'Partiel';
    if (score < 100) return 'Bon';
    return 'Excellent';
  }

  getScoreMoyenEnCours(): number {
    if (!this.filteredDemandes.length) return 0;
    const sum = this.filteredDemandes.reduce((acc, d) => acc + (d.scoreTotal || 0), 0);
    return Math.round(sum / this.filteredDemandes.length);
  }

  getStatutScoreClass(score: number | null | undefined): string {
    if (score === null || score === undefined) return 'badge-pending';
    if (score === 0) return 'badge-nonconform';
    if (score < 50) return 'badge-insuffisant';
    if (score < 100) return 'badge-partiel';
    return 'badge-conform';
  }

  getStatutScoreLabel(score: number | null | undefined): string {
    if (score === null || score === undefined) return '⏳ En attente';
    if (score === 0) return '✗ Rejeté (0)';
    if (score < 50) return `⚠ Insuffisant (${score})`;
    if (score < 100) return `↗ Partiel (${score})`;
    return '✓ Conforme (100)';
  }

  // ─── PRÉREQUIS — RECALCUL ET HELPERS ────────────────────────────────────

  recalculerPrerequisGlobal(): void {
    if (!this.selectedDemande) return;
    const details = this.selectedDemande.prerequisDetails;
    const typeOk = details.filter(d => d.source === 'TYPE').every(d => d.conforme === true);
    const niveauOk = details.filter(d => d.source === 'NIVEAU')
      .every(d => d.score !== null && d.score !== undefined && d.score >= 50);
    this.selectedDemande.prerequisSatisfaits = typeOk && niveauOk;

    const somme = details.reduce((acc, d) => {
      if (d.source === 'TYPE' || d.source === 'ANNEE') return acc + (d.conforme ? 100 : 0);
      return acc + (d.score ?? 0);
    }, 0);
    this.selectedDemande.scoreTotal = details.length > 0
      ? Math.round(somme / details.length) : 100;
  }

  getPrerequisStatutGlobal(demande: DemandeDeptDTO): 'OK' | 'REJETE' | 'A_VERIFIER' {
    if (!demande?.prerequisDetails?.length) return 'OK';
    let hasRejete = false;
    let hasEnAttente = false;
    for (const p of demande.prerequisDetails) {
      if (p.source === 'NIVEAU') {
        if (p.score === null || p.score === undefined) hasEnAttente = true;
        else if (p.score < 50) hasRejete = true;
      } else {
        if (p.conforme === false) hasRejete = true;
        else if (p.conforme === undefined || p.conforme === null) hasEnAttente = true;
      }
    }
    if (hasRejete) return 'REJETE';
    if (hasEnAttente) return 'A_VERIFIER';
    return 'OK';
  }

  tousPrerequisNiveauTraites(): boolean {
    if (!this.selectedDemande) return true;
    const niveauPrerequis = this.selectedDemande.prerequisDetails.filter(d => d.source === 'NIVEAU');
    if (niveauPrerequis.length === 0) return true;
    return niveauPrerequis.every(d => d.score !== null && d.score !== undefined);
  }

  getNombrePrerequisEnAttente(): number {
    if (!this.selectedDemande) return 0;
    return this.selectedDemande.prerequisDetails
      .filter(d => d.source === 'NIVEAU' && (d.score === null || d.score === undefined)).length;
  }

  motifManquant(): boolean {
    if (!this.selectedDemande) return false;
    return this.selectedDemande.prerequisDetails
      .filter(d => d.source === 'NIVEAU' && d.score !== null && d.score !== undefined && d.score < 50)
      .some(d => {
        const motif = this.motifEnCours.get(d.prerequisId) || d.motifRejet || '';
        return !motif.trim();
      });
  }

  getPrerequisBySource(demande: DemandeDeptDTO, source: 'TYPE' | 'NIVEAU' | 'ANNEE'): PrerequisDetailDTO[] {
    return demande.prerequisDetails?.filter(p => p.source === source) || [];
  }

  allConform(list: PrerequisDetailDTO[]): boolean {
    if (!list || list.length === 0) return true;
    return list.every(p =>
      p.source === 'TYPE' ? p.conforme === true
        : (p.score !== null && p.score !== undefined && p.score >= 50)
    );
  }

  conformCount(list: PrerequisDetailDTO[]): number {
    if (!list) return 0;
    return list.filter(p =>
      p.source === 'TYPE' ? p.conforme === true
        : (p.score !== null && p.score !== undefined && p.score >= 50)
    ).length;
  }

  getCountPrerequisOk(demande: DemandeDeptDTO): number {
    if (!demande?.prerequisDetails) return 0;
    return demande.prerequisDetails.filter(p =>
      p.source === 'TYPE' ? p.conforme === true
        : (p.score !== null && p.score !== undefined && p.score >= 50)
    ).length;
  }

  getCountPrerequisTraites(demande: DemandeDeptDTO): number {
    if (!demande?.prerequisDetails) return 0;
    return demande.prerequisDetails.filter(p =>
      p.source === 'TYPE' ? (p.conforme !== undefined && p.conforme !== null)
        : (p.score !== null && p.score !== undefined)
    ).length;
  }

  getCountPrerequisKo(demande: DemandeDeptDTO): number {
    if (!demande?.prerequisDetails) return 0;
    return demande.prerequisDetails.filter(p =>
      p.source === 'TYPE' ? p.conforme === false
        : (p.score !== null && p.score !== undefined && p.score < 50)
    ).length;
  }

  getPrerequisRejetes(): PrerequisDetailDTO[] {
    if (!this.selectedDemande) return [];
    return this.selectedDemande.prerequisDetails
      .filter(p => p.source === 'NIVEAU' && p.score !== null && p.score !== undefined && p.score < 50);
  }

  // ─── DÉCISION ────────────────────────────────────────────────────────────

  prepareDecision(decision: 'ACCEPTE' | 'LISTE_ATTENTE' | 'REJETE'): void {
    this.pendingDecision = decision;
    this.showDecisionForm = true;
    this.commentaire = '';
    if (decision === 'ACCEPTE') {
      this.loadingToken = true;
      this.http.post(
        `${environment.apiUrl}/FINANCE-SERVICE/api/formulaire/token/generate/${this.selectedDemande!.id}`,
        {}, { responseType: 'text' }
      ).subscribe({
        next: (token) => { this.tokenFormulaire = token; this.loadingToken = false; },
        error: () => { this.loadingToken = false; }
      });
    }
  }

  soumettreEvaluation(): void {
    if (!this.selectedDemande) return;
    this.actionLoading = true;
    const login = this.userProfile?.email || 'enseignant_responsable';

    // 1. Sauvegarder les scores des prérequis en batch
    const prereqObservables = Array.from(this.pendingPrereqChanges.entries()).map(([pid, change]) =>
      this.http.post(`${this.apiUrl}/demandes/${this.selectedDemande!.id}/prerequis/confirm`, {
        prerequisId: pid,
        score: (change as any).score,
        motifRejet: (change as any).motifRejet || null,
        agentEmail: this.emailEnseignant
      })
    );

    const save$ = prereqObservables.length > 0
      ? forkJoin(prereqObservables)
      : of([] as any[]);

    save$.subscribe({
      next: () => {
        const taskId = this.selectedDemande!.taskId;
        if (!taskId) {
          this.actionLoading = false;
          this.showToast('❌ Tâche Camunda introuvable', 'error');
          return;
        }

        const scoreTotal = this.selectedDemande!.scoreTotal;
        const niveau = this.selectedDemande!.niveauChoisi || '';
        const langue = this.selectedDemande!.langue || '';
        const nomDiplome = this.selectedDemande!.nomDiplome || '';
        // ✅ Ajout de nomDiplome dans le payload pour supporter le mode PAR_TYPE
        const payload = `SCORE:${scoreTotal}__NIVEAU:${niveau}__LANGUE:${langue}__DIPLOME:${nomDiplome}__AGENT:${login}`;

        this.scolariteService.completeTask(
          taskId,
          'ACCEPTE',
          payload,
          login
        ).subscribe({
          next: () => {
            this.actionLoading = false;
            this.sessionPrereqCache.delete(this.selectedDemande!.id);
            this.sessionDocCache.delete(this.selectedDemande!.id);
            this.showToast(
              `✅ Évaluation soumise — Score : ${scoreTotal}/100 — Décision automatique en cours`,
              'success'
            );
            this.showModal = false;
            this.refreshAfterDecision();
          },
          error: () => {
            this.actionLoading = false;
            this.showToast('❌ Erreur lors de la soumission', 'error');
          }
        });
      },
      error: () => {
        this.actionLoading = false;
        this.showToast('❌ Erreur sauvegarde des scores', 'error');
      }
    });
  }

  // ─── getTailleGroupeActuel() — CORRIGÉ ───────────────────────────────────
  // ✅ Filtre sur nomDiplome + langue + niveau pour éviter les ambiguïtés en mode PAR_TYPE

  getTailleGroupeActuel(): number {
    if (!this.selectedDemande || !this.dashboard?.capacites?.length) return 20;
    const cap = this.dashboard.capacites.find(c =>
      c.niveau.toString() === this.selectedDemande!.niveauChoisi
      && c.langue === this.selectedDemande!.langue
      && c.nomDiplome === this.selectedDemande!.nomDiplome
    );
    return cap?.tailleGroupe ?? 20;
  }

  // ─── HELPERS DIVERS ──────────────────────────────────────────────────────

  getCapaciteGlobale(): { inscrits: number; max: number; pct: number } | null {
    if (!this.dashboard?.capacites?.length) return null;
    const totMax = this.dashboard.capacites.reduce((s, c) => s + c.capaciteMax, 0);
    const totInscrits = this.dashboard.capacites.reduce((s, c) => s + c.inscritsConfirmes + c.enCoursTraitement, 0);
    return { inscrits: totInscrits, max: totMax, pct: Math.min(100, (totInscrits / totMax) * 100) };
  }

  // ─── isCapaciteAtteinte() — CORRIGÉ ──────────────────────────────────────
  // ✅ Filtre maintenant par nomDiplome + langue pour éviter les faux positifs en mode PAR_TYPE

  isCapaciteAtteinte(niveau?: string, nomDiplome?: string, langue?: string): boolean {
    if (!this.dashboard?.capacites?.length) return false;
    if (niveau) {
      const cap = this.dashboard.capacites.find(c =>
        c.niveau.toString() === niveau
        && (!nomDiplome || c.nomDiplome === nomDiplome)
        && (!langue || c.langue === langue)
      );
      return cap ? (cap.inscritsConfirmes + cap.enCoursTraitement) >= cap.capaciteMax : false;
    }
    return this.dashboard.capacites.some(c =>
      (c.inscritsConfirmes + c.enCoursTraitement) >= c.capaciteMax
    );
  }

  // ─── getCapaciteText() — CORRIGÉ ─────────────────────────────────────────
  // ✅ Filtre maintenant par nomDiplome + langue pour afficher la bonne capacité
  //    en mode PAR_TYPE (plusieurs diplômes avec le même niveau mais différents)

  getCapaciteText(niveau?: string, nomDiplome?: string, langue?: string): string {
    if (!this.dashboard?.capacites?.length) return '—';
    if (niveau) {
      const cap = this.dashboard.capacites.find(c =>
        c.niveau.toString() === niveau
        && (!nomDiplome || c.nomDiplome === nomDiplome)
        && (!langue || c.langue === langue)
      );
      if (cap) return `${cap.inscritsConfirmes + cap.enCoursTraitement}/${cap.capaciteMax}`;
    }
    const cap = this.dashboard.capacites[0];
    return `${cap.inscritsConfirmes + cap.enCoursTraitement}/${cap.capaciteMax}`;
  }

  // ─── getDemandesListeAttente() — CORRIGÉ ─────────────────────────────────
  // ✅ En mode PAR_TYPE : regroupement par diplôme, puis tri par score décroissant
  // ✅ En mode PAR_DIPLOME : tri simple par score décroissant (comportement précédent)

  getDemandesListeAttente(): DemandeDeptDTO[] {
    return (this.dashboard?.demandes?.filter(d => d.statut === 'LISTE_ATTENTE') || [])
      .sort((a, b) => {
        // Grouper par diplôme d'abord (utile en mode PAR_TYPE)
        if (a.nomDiplome !== b.nomDiplome)
          return a.nomDiplome.localeCompare(b.nomDiplome);
        // Puis trier par score décroissant dans chaque groupe
        return b.scoreTotal - a.scoreTotal;
      });
  }

  // ─── getCommonPrerequisType() — CORRIGÉ ──────────────────────────────────
  // ✅ MODE PAR_TYPE  : retourne l'intersection des prérequis communs à tous les diplômes
  // ✅ MODE PAR_DIPLOME : retourne les prérequis du seul diplôme (comportement précédent)
  // ✅ Paramètre optionnel nomDiplome pour filtrer sur un diplôme spécifique

  getCommonPrerequisType(nomDiplome?: string): string[] {
    if (!this.dashboard?.capacites?.length) return [];

    // Si un diplôme spécifique est demandé, retourner ses prérequis directement
    if (nomDiplome) {
      const cap = this.dashboard.capacites.find(c => c.nomDiplome === nomDiplome);
      return cap?.prerequisType || [];
    }

    // Calculer l'intersection de tous les prérequis communs (mode PAR_TYPE)
    const allPrereqs = this.dashboard.capacites.map(c => c.prerequisType || []);
    if (!allPrereqs.length) return [];

    // Si un seul diplôme, retourner directement ses prérequis
    if (allPrereqs.length === 1) return allPrereqs[0];

    // Intersection : prérequis présents dans TOUS les diplômes
    return allPrereqs.reduce((common, prereqs) =>
      common.filter(p => prereqs.includes(p))
    );
  }

  // ─── isModeParType() — NOUVEAU ───────────────────────────────────────────
  // ✅ Détecte si l'enseignant est en mode PAR_TYPE (plusieurs diplômes différents)
  //    ou PAR_DIPLOME (un seul diplôme responsable)

  isModeParType(): boolean {
    if (!this.dashboard?.capacites?.length) return false;
    const nomsUniques = new Set(this.dashboard.capacites.map(c => c.nomDiplome));
    return nomsUniques.size > 1;
  }

  // ─── getNomsDiplomesDistincts() — NOUVEAU ────────────────────────────────
  // ✅ Retourne les noms de diplômes distincts gérés par l'enseignant
  //    Utile pour les filtres ou les regroupements visuels en mode PAR_TYPE

  getNomsDiplomesDistincts(): string[] {
    if (!this.dashboard?.capacites?.length) return [];
    return [...new Set(this.dashboard.capacites.map(c => c.nomDiplome))];
  }

  // ─── getCapacitesParDiplome() — NOUVEAU ──────────────────────────────────
  // ✅ Regroupe les capacités par nom de diplôme
  //    Pratique pour afficher un header par diplôme en mode PAR_TYPE

  getCapacitesParDiplome(): Map<string, CapaciteNiveauDTO[]> {
    const map = new Map<string, CapaciteNiveauDTO[]>();
    if (!this.dashboard?.capacites?.length) return map;
    this.dashboard.capacites.forEach(cap => {
      const existing = map.get(cap.nomDiplome) || [];
      existing.push(cap);
      map.set(cap.nomDiplome, existing);
    });
    return map;
  }

  isActionnable(demande: DemandeDeptDTO): boolean { return demande.statut === 'EN_COURS_DEPARTEMENT'; }

  // ─── ACCORDION PAR_TYPE ───────────────────────────────────────────────────

  toggleDiplome(nomDiplome: string): void {
    if (this.collapsedDiplomes.has(nomDiplome)) {
      this.collapsedDiplomes.delete(nomDiplome);
    } else {
      this.collapsedDiplomes.add(nomDiplome);
    }
  }

  isDiplomeCollapsed(nomDiplome: string): boolean {
    return this.collapsedDiplomes.has(nomDiplome);
  }

  getCapaciteSummaryForDiplome(nomDiplome: string): { inscrits: number; max: number; pct: number; status: string; nbNiveaux: number } {
    const caps = (this.dashboard?.capacites || []).filter(c => c.nomDiplome === nomDiplome);
    const max = caps.reduce((s, c) => s + c.capaciteMax, 0);
    const inscrits = caps.reduce((s, c) => s + c.inscritsConfirmes + c.enCoursTraitement, 0);
    const pct = max > 0 ? Math.round((inscrits / max) * 100) : 0;
    const status = pct >= 100 ? '🔴 Complet' : pct >= 90 ? '🟠 Quasi-complet' : pct >= 70 ? '🟡 Quasi-plein' : '🟢 Disponible';
    return { inscrits, max, pct, status, nbNiveaux: caps.length };
  }



  getStatutClass(statut: string): string {
    const map: Record<string, string> = {
      'EN_COURS_DEPARTEMENT': 'chip-blue', 'DEPARTEMENT_VALIDE': 'chip-green',
      'REJETE_DEPARTEMENT': 'chip-red', 'LISTE_ATTENTE': 'chip-amber',
      'INSCRIT': 'chip-green', 'EN_ATTENTE_PAIEMENT': 'chip-purple'
    };
    return map[statut] || 'chip-gray';
  }

  getStatutLabel(statut: string): string {
    const map: Record<string, string> = {
      'EN_COURS_DEPARTEMENT': 'En cours', 'DEPARTEMENT_VALIDE': 'Validé',
      'REJETE_DEPARTEMENT': 'Rejeté', 'LISTE_ATTENTE': 'Liste d\'attente',
      'INSCRIT': 'Inscrit', 'EN_ATTENTE_PAIEMENT': 'Paiement att.'
    };
    return map[statut] || statut;
  }

  getInitiales(): string {
    if (!this.dashboard?.nomEnseignant) return 'E';
    return this.dashboard.nomEnseignant.replace('Dr. ', '').split(' ')
      .map(p => p[0]).join('').substring(0, 2).toUpperCase() || 'EN';
  }

  formatPhone(phone: string | null | undefined): string {
    if (!phone) return 'Non renseigné';
    const cleaned = phone.replace(/\s+/g, '');
    const match = cleaned.match(/^(\+\d{1,3})(\d+)$/);
    if (match) {
      const [_, prefix, rest] = match;
      const formattedRest = rest.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
      return `(${prefix}) ${formattedRest}`;
    }
    return phone;
  }

  getDisplayRole(): string {
    return this.keycloak.isUserInRole('ENSEIGNANT_RESPONSABLE') ? 'Responsable de Diplôme' : 'Enseignant';
  }

  getProfileInitials(): string {
    if (!this.userProfile) return this.getInitiales();
    return ((this.userProfile.firstName?.charAt(0) || '') +
      (this.userProfile.lastName?.charAt(0) || '')).toUpperCase() || this.getInitiales();
  }

  /** Retourne le statut effectif d'un document (typeEnvoie > statut) */
  getEffectiveStatus(doc: any): string {
    return (doc?.typeEnvoie || doc?.statut || 'MANQUANTE').toUpperCase();
  }

  getFilteredDocuments(): any[] {
    if (!this.etudiantDocuments) return [];

    // On ne garde que les relevés de notes pour le département
    const relevés = this.etudiantDocuments.filter(doc =>
      doc.type.startsWith('RELEVE_NOTES_')
    );

    // L'API renvoie UNE entrée par type avec le doc principal et ses archives.
    // Si le doc principal est REJETE mais possède une archive RELANCE (nouvelle soumission),
    // on promeut la version RELANCE comme document principal visible pour validation.
    return relevés.map(doc => {
      const archives: any[] = doc.archives || [];
      const relanceArchive = archives.find((a: any) => a.statut === 'RELANCE');

      if (doc.statut === 'REJETE' && relanceArchive) {
        const historyEntry = {
          documentId: doc.documentId,
          type: doc.type,
          nomFichier: doc.nomFichier,
          statut: 'REJETE',
          commentaireValidation: doc.commentaireValidation,
        };
        const otherArchives = archives
          .filter((a: any) => a.statut !== 'RELANCE')
          .map((a: any) => ({ documentId: a.id, type: doc.type, nomFichier: a.nomFichier, statut: a.statut, commentaireValidation: a.commentaireValidation }));

        return {
          ...doc,
          documentId: relanceArchive.id,
          nomFichier: relanceArchive.nomFichier,
          statut: 'RELANCE',
          commentaireValidation: null,
          archives: [historyEntry, ...otherArchives],
        };
      }

      return doc;
    });
  }

  /** Récupère les archives du document actuellement affiché/actif */
  getActiveDocumentArchives(): any[] {
    if (!this.activeDocumentId || !this.etudiantDocuments) return [];
    const doc = this.etudiantDocuments.find(d => d.documentId === this.activeDocumentId);
    return doc?.archives || [];
  }

  /** Vérifie si le document actuellement actif est en état RELANCE */
  isActiveDocRelance(): boolean {
    if (!this.activeDocumentId) return false;
    const filtered = this.getFilteredDocuments();
    const active = filtered.find(d => d.documentId === this.activeDocumentId);
    return active ? this.getEffectiveStatus(active) === 'RELANCE' : false;
  }

  /** Helper pour convertir un DocumentStatusDTO en archive lors de la déduplication */
  private mapToArchive(doc: DocumentStatusDTO): any {
    return {
      documentId: doc.documentId,
      nomFichier: doc.nomFichier,
      statut: doc.statut,
      commentaireValidation: doc.commentaireValidation,
      type: doc.type
    };
  }

  getInitialesEtudiant(d: DemandeDeptDTO): string {
    return ((d.prenomEtudiant?.[0] || '') + (d.nomEtudiant?.[0] || '')).toUpperCase();
  }

  getAvatarColor(index = 0): string {
    return this.avatarColors[index % this.avatarColors.length];
  }

  getTempsEcoule(dateStr: string): string {
    if (!dateStr) return '';
    const diffH = Math.floor((Date.now() - new Date(dateStr).getTime()) / 3600000);
    if (diffH < 24) return `Il y a ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    return diffD === 1 ? 'Hier' : `Il y a ${diffD}j`;
  }

  getTauxAcceptation(): number {
    if (!this.dashboard) return 0;
    const total = this.dashboard.valides + this.dashboard.rejetes;
    return total === 0 ? 0 : Math.round((this.dashboard.valides / total) * 100);
  }

  getDonutDash(part: number, total: number): number {
    return (!total || total === 0) ? 0 : Math.round((part / total) * 302);
  }

  getDonutOffset(validPart: number, total: number): number {
    if (!total || total === 0) return 76;
    return 76 - Math.round(((total - validPart) / total) * 302);
  }

  getBacDistribution(): { label: string, pct: number, color: string, count: number, tooltip?: string }[] {
    if (!this.dashboard?.demandes) return [];

    // 1. Liste FIXE de toutes les séries de Bac (Ordre Enum)
    const series = [
      { id: 'MATHS', label: 'Maths', color: '#2563eb' },
      { id: 'INFO', label: 'Info', color: '#059669' },
      { id: 'SCIENCES', label: 'Sciences', color: '#d97706' },
      { id: 'TECHNIQUE', label: 'Technique', color: '#7c3aed' },
      { id: 'ECO', label: 'Éco-Gestion', color: '#db2777' },
      { id: 'AUTRES', label: 'Autres', color: '#8b92a9' }
    ];

    // 2. Filtrer les rejets ENTIÈREMENT — On ne veut que les profils ACTIFS (En cours/Validés d'après votre demande)
    const activeDemandes = this.dashboard.demandes.filter(d =>
      !d.statut?.toUpperCase().includes('REJETE')
    );

    if (activeDemandes.length === 0) {
      return series.map(s => ({ ...s, pct: 0, count: 0 }));
    }

    // 3. Compter par série (Unicité par étudiant)
    const unique = new Map<number, DemandeDeptDTO>();
    activeDemandes.forEach(d => { if (!unique.has(d.etudiantId)) unique.set(d.etudiantId, d); });

    const counts: Record<string, number> = {};
    const autresCountries = new Set<string>();

    Array.from(unique.values()).forEach(d => {
      // ✅ Priorité 1 : Le type de Bac de l'infomation étudiant
      // ✅ Priorité 2 : Le dernier diplôme obtenu (Bac ou Licence selon dossier)
      // ❌ On EXCLUT d.nomDiplome (Target) car il fausse les stats
      const backgroundToScan = (" " + [
        d.etudiantInfo?.typeBac,
        d.diplomeObtenu
      ].filter(v => !!v).join(' ') + " ").toUpperCase();

      let key = 'AUTRES';
      if (backgroundToScan.includes('MATH') || backgroundToScan.includes(' MP') || backgroundToScan.includes('MPC')) key = 'MATHS';
      else if (backgroundToScan.includes('INFO') || backgroundToScan.includes('MULTIMEDIA') || backgroundToScan.includes('NUMERIQUE')) key = 'INFO';
      else if (backgroundToScan.includes('SCIENCE') || backgroundToScan.includes('EXPERIMENTALE') || backgroundToScan.includes('CHIMIE') || backgroundToScan.includes('BIO') || backgroundToScan.includes(' S ') || backgroundToScan.includes(' PC') || backgroundToScan.includes(' SVT')) key = 'SCIENCES';
      else if (backgroundToScan.includes('TECHNIQUE') || backgroundToScan.includes('GENIE') || backgroundToScan.includes('ELECTRIQUE') || backgroundToScan.includes('MECANIQUE') || backgroundToScan.includes(' STI')) key = 'TECHNIQUE';
      else if (backgroundToScan.includes('ECONOMIE') || backgroundToScan.includes('GESTION') || backgroundToScan.includes('ECO') || backgroundToScan.includes(' ES ') || backgroundToScan.includes(' STMG')) key = 'ECO';
      else if (backgroundToScan.includes('LETTRES') || backgroundToScan.includes('DROIT') || backgroundToScan.includes('HUMAIN') || backgroundToScan.includes(' L ')) key = 'LETTRES';
      else if (backgroundToScan.includes('SPORT')) key = 'SPORT';

      counts[key] = (counts[key] || 0) + 1;
      if (key === 'AUTRES') {
        autresCountries.add(d.etudiantInfo?.paysNom || (d as any).paysNom || 'Étranger');
      }
    });

    const total = unique.size;
    return series.map(s => ({
      ...s,
      count: counts[s.id] || 0,
      pct: total > 0 ? Math.round(((counts[s.id] || 0) / total) * 100) : 0,
      tooltip: s.id === 'AUTRES' ? Array.from(autresCountries).join(', ') : undefined
    }));
  }

  getAcceptationSegments(): AcceptanceSegment[] {
    if (!this.dashboard?.demandes) return [];

    const demands = this.dashboard.demandes;
    const total = demands.length;
    if (total === 0) return [];

    // 1. Compter les dossiers par statut exact
    const statusCounts: Record<string, number> = {};
    demands.forEach(d => {
      const s = d.statut || 'INCONNU';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    // 2. Définir l'ordre logique et le style de chaque statut
    const statusConfigs: Record<string, { label: string, color: string, order: number }> = {
      'FORMULAIRE_ENVOYE': { label: '📝 Formulaire', color: '#94a3b8', order: 1 },
      'EN_COURS_FINANCE': { label: '⏳ Finance en cours', color: '#3b82f6', order: 2 },
      'EN_ATTENTE_PAIEMENT': { label: '💳 Attente paiement', color: '#8b5cf6', order: 3 },
      'REJETE_FINANCE': { label: '❌ Refus Finance', color: '#ef4444', order: 10 },
      'EN_COURS_SCOLARITE': { label: '🔗 Scolarité', color: '#06b6d4', order: 4 },
      'SCOLARITE_VALIDEE': { label: '🎓 Scolarité validée', color: '#0ea5e9', order: 5 },
      'EN_COURS_DEPARTEMENT': { label: '🏛️ Département', color: '#6366f1', order: 6 },
      'DEPARTEMENT_VALIDE': { label: '✅ Admis', color: '#10b981', order: 7 },
      'INSCRIT': { label: '🎯 Inscrit', color: '#059669', order: 8 },
      'REJETE_DEPARTEMENT': { label: '❌ Refus Dépt.', color: '#be123c', order: 11 },
      'REJETE_SCOLARITE': { label: '❌ Refus Scol.', color: '#f43f5e', order: 12 },
    };

    // 3. Transformer en segments triés
    return Object.keys(statusCounts).map(statusKey => {
      const config = statusConfigs[statusKey] || { label: statusKey, color: '#e2e8f0', order: 99 };
      const count = statusCounts[statusKey];
      return {
        label: config.label,
        color: config.color,
        count: count,
        pct: Math.round((count / total) * 100),
        order: config.order
      };
    }).sort((a, b) => (a as any).order - (b as any).order);
  }

  // ✅ Getters pour les cartes de statistiques (Vision Pipeline Global)
  getGlobalEnCours(): number {
    if (!this.dashboard?.demandes) return 0;
    return this.dashboard.demandes.filter(d => !d.statut.includes('VALIDE') && !d.statut.includes('REJETE') && d.statut !== 'INSCRIT').length;
  }

  getGlobalValides(): number {
    if (!this.dashboard?.demandes) return 0;
    return this.dashboard.demandes.filter(d => d.statut === 'DEPARTEMENT_VALIDE' || d.statut === 'INSCRIT').length;
  }

  getGlobalRejetes(): number {
    if (!this.dashboard?.demandes) return 0;
    return this.dashboard.demandes.filter(d => d.statut.includes('REJETE')).length;
  }

  openAddPrereq(): void { if (this.paramComponent) this.paramComponent.openAddModal(null); }

  // ─── WORKFLOW STEPPER ────────────────────────────────────────────────────

  isStepDone(step: string): boolean {
    if (!this.selectedDemande) return false;
    const order = [
      'SOUMIS', 'EN_COURS_SCOLARITE', 'EN_ATTENTE_DOCUMENT', 'SCOLARITE_VALIDEE',
      'EN_COURS_DEPARTEMENT', 'DEPARTEMENT_VALIDE', 'FORMULAIRE_ENVOYE',
      'EN_ATTENTE_PAIEMENT', 'PAIEMENT_VALIDE', 'INSCRIT'
    ];
    const stepMap: Record<string, string> = {
      'SCOLARITE': 'SCOLARITE_VALIDEE', 'DEPARTEMENT': 'DEPARTEMENT_VALIDE',
      'PAIEMENT': 'PAIEMENT_VALIDE', 'INSCRIT': 'INSCRIT'
    };
    const target = stepMap[step];
    if (!target) return false;
    const ci = order.indexOf(this.selectedDemande.statut);
    return ci !== -1 && ci >= order.indexOf(target);
  }

  isStepActive(step: string): boolean {
    if (!this.selectedDemande) return false;
    const stepMap: Record<string, string[]> = {
      'SCOLARITE': ['SOUMIS', 'EN_COURS_SCOLARITE', 'EN_ATTENTE_DOCUMENT'],
      'DEPARTEMENT': ['EN_COURS_DEPARTEMENT', 'SCOLARITE_VALIDEE'],
      'PAIEMENT': ['EN_ATTENTE_PAIEMENT', 'FORMULAIRE_ENVOYE', 'DEPARTEMENT_VALIDE'],
      'INSCRIT': ['PAIEMENT_VALIDE'],
    };
    return stepMap[step]?.includes(this.selectedDemande.statut) ?? false;
  }

  isStepFailed(step: string): boolean {
    if (!this.selectedDemande) return false;
    const failureMap: Record<string, string[]> = {
      'SCOLARITE': ['REJETE_SCOLARITE'], 'DEPARTEMENT': ['REJETE_DEPARTEMENT'], 'PAIEMENT': ['REJETE_FINANCE']
    };
    return failureMap[step]?.includes(this.selectedDemande.statut) ?? false;
  }

  // ─── DOCUMENTS ───────────────────────────────────────────────────────────

  loadDocumentsEtudiant(etudiantId: number, enrollmentId?: number): void {
    this.loadingDocuments = true;
    this.etudiantDocuments = [];
    const params = enrollmentId ? `?enrollmentId=${enrollmentId}` : '';
    this.http.get<DocumentStatusDTO[]>(
      `${this.ETUDIANT_SERVICE_URL}/api/documents/etudiant/${etudiantId}/status${params}`)
      .subscribe({
        next: (docs) => {
          console.log('📦 API /status response (dept):', JSON.stringify(docs));
          this.etudiantDocuments = docs;
          this.loadingDocuments = false;
          if (this.pendingDocChanges.size > 0) {
            this.pendingDocChanges.forEach((change, did) => {
              const d = this.etudiantDocuments.find(doc => doc.documentId === did);
              if (d) Object.assign(d, change);
            });
          }
        },
        error: (err) => { console.error('❌ Erreur documents:', err); this.loadingDocuments = false; }
      });
  }

  loadEtudiantInfo(etudiantId: number): void {
    this.studentService.getStudentById(etudiantId).subscribe({
      next: (student) => {
        if (this.selectedDemande) {
          this.selectedDemande.etudiantInfo = {
            id: student.id || 0, nom: student.nom, prenom: student.prenom,
            matricule: student.matricule || '', email: student.email,
            phone: student.phone, dateNaissance: student.dateNaissance,
            numCarteIdentite: student.numCarteIdentite || '',
            numPassport: student.numPassport || '', paysNom: '',
            adresse: (student as any).adresse || '',
            dernierDiplome: student.dernierDiplome,
            anneeDernierDiplome: student.anneeDernierDiplome,
            typeBac: student.typeBac,
            genre: (student as any).gendre || (student as any).genre
          };
        }
      },
      error: (err) => console.error('❌ Erreur infos étudiant:', err)
    });
  }

  viewDocument(documentId: number, documentName: string | null): void {
    this.http.get(`${this.ETUDIANT_SERVICE_URL}/api/documents/view/${documentId}`,
      { responseType: 'blob' }).subscribe({
        next: (blob) => {
          if (this.currentDocumentBlobUrl) URL.revokeObjectURL(this.currentDocumentBlobUrl);
          this.isImageDocument = blob.type.startsWith('image/');
          this.currentDocumentBlobUrl = URL.createObjectURL(blob);
          this.currentDocumentUrl = this.currentDocumentBlobUrl;
          this.currentDocumentName = documentName || 'Document';
          this.showPreview = true;
          this.activeDocumentId = documentId;
        },
        error: () => this.showToast('Impossible de charger le document', 'error')
      });
  }

  openDocumentInNewTab(): void { if (this.currentDocumentUrl) window.open(this.currentDocumentUrl, '_blank'); }

  closeDocumentViewer(): void {
    this.showDocumentViewer = false;
    this.showPreview = false;
    if (this.currentDocumentBlobUrl) { URL.revokeObjectURL(this.currentDocumentBlobUrl); this.currentDocumentBlobUrl = null; }
    this.currentDocumentUrl = null;
    this.currentDocumentName = null;
  }

  openRejectDocDialog(doc: DocumentStatusDTO): void { this.selectedDocToReject = doc; this.rejectionDocComment = ''; this.showRejectDocDialog = true; }
  closeRejectDocDialog(): void { this.showRejectDocDialog = false; this.selectedDocToReject = null; this.rejectionDocComment = ''; }
  selectQuickReason(reason: string): void { this.rejectionDocComment = reason; }

  confirmRejectDocument(): void {
    if (!this.selectedDocToReject || !this.rejectionDocComment.trim()) return;
    this.selectedDocToReject.statut = 'REJETE';
    this.selectedDocToReject.isValidated = false;
    this.selectedDocToReject.commentaireValidation = this.rejectionDocComment;
    this.pendingDocChanges.set(this.selectedDocToReject.documentId, {
      statut: 'REJETE', isValidated: false, commentaireValidation: this.rejectionDocComment
    });
    this.showToast('Document marqué comme rejeté (non enregistré)', 'success');
    this.closeRejectDocDialog();
  }

  getDocumentsValides(): number { return this.etudiantDocuments.filter(d => d.statut === 'VALIDE').length; }
  getDocumentsManquants(): number { return this.etudiantDocuments.filter(d => d.statut === 'MANQUANTE' || d.statut === 'REJETE').length; }

  documentTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'CARTE_IDENTITE': 'Carte d\'identité', 'PASSPORT': 'Passeport',
      'BAC': 'Diplôme du Baccalauréat', 'DIPLOME_BAC': 'Diplôme du Baccalauréat',
      'RELEVE_NOTES_BAC': 'Relevé de notes Bac',
      'CERTIFICAT_RESIDENCE': 'Certificat de résidence', 'ACTE_NAISSANCE': 'Acte de naissance',
      'DIPLOME_LICENCE': 'Diplôme de Licence', 'RELEVE_NOTES_LICENCE': 'Relevé de notes Licence',
      'DIPLOME_MASTER': 'Diplôme de Master', 'RELEVE_NOTES_MASTER': 'Relevé de notes Master',
      'DIPLOME_INGENIEUR': 'Diplôme d\'Ingénieur', 'RELEVE_NOTES_INGENIEUR': 'Relevé de notes Ingénieur',
      'DIPLOME_PREPARATOIRE': 'Attestation de Préparatoire', 'RELEVE_NOTES_PREPARATOIRE': 'Relevé de notes Préparatoire',
      'RELEVE_NOTES_NIVEAU': 'Relevé de notes (Niveau)'
    };
    return labels[type] || type;
  }

  // ─── FILTRAGE PAR GROUPE ─────────────────────────────────────────────────

  filtrerParGroupe(group: EnrollmentGroup): void {
    if (this.selectedGroup?.id === group.id) {
      this.clearFiltreGroupe();
      return;
    }
    this.selectedGroup = group;
    // On synchronise les autres filtres pour que l'UI soit cohérente
    this.currentDiplome = '';
    this.currentNiveau = '';
    this.currentLangue = '';
    this.selectedNiveau = null;

    this.currentPage = 0;
    this.loadDemandesFromBackend();

    // Smooth scroll vers le tableau
    const el = document.querySelector('.section-card:last-of-type');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  clearFiltreGroupe(): void {
    this.selectedGroup = null;
    this.currentPage = 0;
    this.loadDemandesFromBackend();
  }

  getDocumentStatutLabel(statut: string): string {
    return ({ SOUMIS: 'Soumis', VALIDE: 'Validé ✓', REJETE: 'Rejeté', MANQUANTE: 'Manquant', RELANCE: 'Relancé' } as any)[statut] || statut;
  }

  getDocumentStatutClass(statut: string): string {
    return ({ SOUMIS: 'pill-soumis', VALIDE: 'pill-valide', REJETE: 'pill-rejete', MANQUANTE: 'pill-manquant', RELANCE: 'pill-soumis' } as any)[statut] || '';
  }

  // ─── FILTRE NIVEAU ───────────────────────────────────────────────────────

  selectedNiveau: string | null = null;

  filtrerParNiveau(cap: CapaciteNiveauDTO): void {
    const key = `${cap.niveau}-${cap.langue}-${cap.nomDiplome}`;
    if (this.selectedNiveau === key) {
      this.selectedNiveau = null;
      this.currentNiveau = '';
      this.currentLangue = '';
      this.currentDiplome = '';
    } else {
      this.selectedNiveau = key;
      this.currentNiveau = cap.niveau.toString();
      this.currentLangue = cap.langue;
      this.currentDiplome = cap.nomDiplome;
    }
    this.currentPage = 0;
    this.loadDemandesFromBackend();
  }

  clearFiltreNiveau(): void {
    this.selectedNiveau = null;
    this.currentNiveau = '';
    this.currentLangue = '';
    this.currentDiplome = '';
    this.currentPage = 0;
    this.loadDemandesFromBackend();
  }

  // ─── REJET MASSE ─────────────────────────────────────────────────────────

  rejetMasseLoading = false;
  rejetMasseNiveauKey: string | null = null;

  rejeterMasseListe(cap: CapaciteNiveauDTO): void {
    if (!this.emailEnseignant) return;
    if (!window.confirm(
      `⚠️ Confirmer le rejet de TOUTES les demandes en liste d'attente\n` +
      `Niveau ${cap.niveau} · ${cap.langue} · ${cap.nomDiplome}\n\nCette action est irréversible.`
    )) return;

    // ✅ La clé intègre nomDiplome pour le mode PAR_TYPE
    this.rejetMasseLoading = true;
    this.rejetMasseNiveauKey = `${cap.niveau}-${cap.langue}-${cap.nomDiplome}`;
    this.http.post(`${environment.workflowServiceUrl}/api/process/rejet-masse`, null, {
      params: {
        emailEnseignant: this.emailEnseignant.trim().toLowerCase(),
        // ✅ Utilise le nomDiplomeResponsable (root) pour le filtrage exact dans inscription-service
        nomDiplome: cap.nomDiplomeResponsable || cap.nomDiplome,
        langue: cap.langue, niveau: cap.niveau.toString()
      }
    }).subscribe({
      next: () => {
        this.rejetMasseLoading = false; this.rejetMasseNiveauKey = null;
        this.showToast(`✅ Rejet en masse lancé — ${cap.nomDiplome} · Niveau ${cap.niveau} (${cap.langue})`, 'success');
        setTimeout(() => this.refreshAfterDecision(), 2000);
      },
      error: (err) => {
        this.rejetMasseLoading = false; this.rejetMasseNiveauKey = null;
        console.error('❌ Erreur rejet masse:', err);
        this.showToast('❌ Erreur lors du rejet en masse', 'error');
      }
    });
  }

  // ─── TOAST ───────────────────────────────────────────────────────────────

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toastMessage = message; this.toastType = type; this.toastVisible = true;
    setTimeout(() => this.toastVisible = false, 3500);
  }

  // ─── DIALOG REJET PRÉREQUIS ──────────────────────────────────────────────

  showRejetPrerequisDialog = false;
  selectedPrerequisToReject: PrerequisDetailDTO | null = null;
  motifRejetPrerequis = '';
  quickRejetPrerequis: string[] = [
    'Moyenne insuffisante',
    'Diplôme non reconnu',
    'Niveau requis non atteint',
    'Certificat manquant',
    'Expérience insuffisante'
  ];

  ouvrirRejetPrerequis(detail: PrerequisDetailDTO): void {
    this.selectedPrerequisToReject = detail;
    this.motifRejetPrerequis = detail.motifRejet || '';
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

  confirmerRejetPrerequis(): void {
    if (!this.selectedDemande || !this.selectedPrerequisToReject) return;

    const detail = this.selectedPrerequisToReject;
    const score = detail.score ?? 0;

    if (score < 50 && this.motifRejetPrerequis.trim()) {
      this.setMotifPrerequis(detail, this.motifRejetPrerequis.trim());
    }

    if (detail.score === null || detail.score === undefined) {
      this.setScorePrerequis(detail, 0);
    }

    this.fermerRejetPrerequis();
  }
}
