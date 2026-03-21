import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { KeycloakService } from 'keycloak-angular';
import { KeycloakProfile } from 'keycloak-js';
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

export interface DashboardDeptDTO {
  nomDepartement: string; nomEnseignant: string; emailEnseignant: string;
  nomDiplome: string; typeDiplome?: string; langue: string;
  enCours: number; valides: number; rejetes: number; listeAttente: number;
  capacites: CapaciteNiveauDTO[]; demandes: DemandeDeptDTO[];
}

// export interface CapaciteNiveauDTO {
//   niveau: number; nomDiplome: string; typeDiplome?: string; langue: string;
//   capaciteMax: number; inscritsConfirmes: number; enCoursTraitement: number;
//   enCoursDepartement: number; listeAttente: number; placesRestantes: number;
//   pourcentageRemplissage: number; prerequisNiveau: string[]; prerequisType: string[];
// }
export interface CapaciteNiveauDTO {
  niveau: number; nomDiplome: string; typeDiplome?: string; langue: string;
  capaciteMax: number; inscritsConfirmes: number; enCoursTraitement: number;
  enCoursDepartement: number; listeAttente: number; placesRestantes: number;
  pourcentageRemplissage: number; prerequisNiveau: string[]; prerequisType: string[];
  tailleGroupe?: number;   // ✅ ajouter
  scoreMinimum?: number;  // ✅ ajouter
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

  private apiUrl = `${environment.apiUrl}/DEPARTEMENT-SERVICE/api/dashboardDepartment`;

  // Table / filtres
  currentFilter = 'tous';
  searchTerm = '';
  filteredDemandes: DemandeDeptDTO[] = [];
  viewMode: 'list' | 'grid' = 'list';

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

  // Décision
  showDecisionForm = false;
  pendingDecision: 'ACCEPTE' | 'LISTE_ATTENTE' | 'REJETE' | null = null;
  commentaire = '';
  actionLoading = false;
  tokenFormulaire: string | null = null;
  loadingToken = false;

  // ── Score prérequis NIVEAU — slider inline, pas de dialog ────────────────
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

  // Rejet Document (gardé pour les documents)
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
    } catch { }
  }

  // ─── DATA ────────────────────────────────────────────────────────────────

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
      error: (err) => { console.error('❌ Erreur dashboard:', err); this.loading = false; }
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
          email, statut: this.getStatutFromFilter(this.currentFilter),
          search: this.searchTerm.trim(),
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
    const email = this.emailEnseignant.trim().toLowerCase();
    this.http.get<PageResponse<DemandeDeptDTO>>(`${this.apiUrl}/demandes`, {
      params: {
        email, statut: this.getStatutFromFilter(this.currentFilter),
        search: this.searchTerm.trim(),
        page: this.currentPage.toString(), size: this.pageSize.toString()
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

  // ─── FILTRES / PAGINATION ────────────────────────────────────────────────

  setFilter(filter: string): void { this.currentFilter = filter; this.currentPage = 0; this.loadDemandesFromBackend(); }
  onSearch(): void { this.currentPage = 0; this.loadDemandesFromBackend(); }

  private getStatutFromFilter(filter: string): string {
    const map: Record<string, string> = {
      'liste_attente': 'LISTE_ATTENTE', 'valides': 'DEPARTEMENT_VALIDE', 'rejetes': 'REJETE_DEPARTEMENT'
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
      this.loadDocumentsEtudiant(demande.etudiantId);
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
  // Plus de dialog séparé. L'agent note directement dans la carte prérequis.

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

  // confirmerDecision(): void {
  //   if (!this.selectedDemande || !this.pendingDecision) return;
  //   this.actionLoading = true;
  //   const login = this.userProfile?.email || 'enseignant_responsable';

  //   const prereqObservables = Array.from(this.pendingPrereqChanges.entries()).map(([pid, change]) =>
  //     this.http.post(`${this.apiUrl}/demandes/${this.selectedDemande!.id}/prerequis/confirm`, {
  //       prerequisId: pid,
  //       score: (change as any).score,
  //       motifRejet: (change as any).motifRejet || null,
  //       agentEmail: this.emailEnseignant
  //     })
  //   );

  //   const docObservables = Array.from(this.pendingDocChanges.entries()).map(([did, change]) =>
  //     this.http.put(`${this.ETUDIANT_SERVICE_URL}/api/documents/${did}/status`, {
  //       statut: change.statut, commentaireValidation: change.commentaireValidation,
  //       agentEmail: this.emailEnseignant
  //     })
  //   );

  //   forkJoin([...prereqObservables, ...docObservables]).subscribe({
  //     next: () => {
  //       const taskId = this.selectedDemande!.taskId;
  //       if (!taskId) { this.actionLoading = false; this.showToast('❌ Tâche introuvable', 'error'); return; }

  //       let payloadDecision = '';
  //       if (this.pendingDecision === 'REJETE') {
  //         const prereqsKo = this.selectedDemande!.prerequisDetails
  //           .filter(p => p.source === 'NIVEAU' && p.score !== null && p.score !== undefined && p.score < 50)
  //           .map(p => `${p.prerequisRequis}||${p.motifRejet || 'Score insuffisant'} (${p.score}/100)`)
  //           .join(';;');
  //         payloadDecision = prereqsKo.length > 0
  //           ? `MOTIF:${this.commentaire.trim()}__PREREQS:${prereqsKo}`
  //           : this.commentaire.trim();
  //       }

  //       const scoreTotalStr = `SCORE:${this.selectedDemande!.scoreTotal}`;
  //       payloadDecision = payloadDecision ? `${payloadDecision}__${scoreTotalStr}` : scoreTotalStr;

  //       this.scolariteService.completeTask(taskId, this.pendingDecision!, payloadDecision, login).subscribe({
  //         next: () => {
  //           this.actionLoading = false;
  //           this.sessionPrereqCache.delete(this.selectedDemande!.id);
  //           this.sessionDocCache.delete(this.selectedDemande!.id);
  //           this.showToast(
  //             this.pendingDecision === 'ACCEPTE'
  //               ? `✅ Dossier validé — Score : ${this.selectedDemande!.scoreTotal}/100`
  //               : this.pendingDecision === 'LISTE_ATTENTE'
  //                 ? `🕐 Liste d'attente — Score : ${this.selectedDemande!.scoreTotal}/100`
  //                 : '❌ Dossier rejeté',
  //             'success'
  //           );
  //           this.showModal = false;
  //           this.refreshAfterDecision();
  //         },
  //         error: () => { this.actionLoading = false; this.showToast('❌ Erreur décision finale', 'error'); }
  //       });
  //     },
  //     error: (err) => {
  //       console.error('Erreur Batch Save:', err);
  //       this.actionLoading = false;
  //       this.showToast('❌ Erreur enregistrement des scores', 'error');
  //     }
  //   });
  // }
  // ─── REMPLACER confirmerDecision() par soumettreEvaluation() ─────────────

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

        // 2. Construire le payload pour le delegate
        // Format : "SCORE:75__NIVEAU:1__LANGUE:FRANCAIS__AGENT:prof@itech.tn"
        const scoreTotal = this.selectedDemande!.scoreTotal;
        const niveau = this.selectedDemande!.niveauChoisi || '';
        const langue = this.selectedDemande!.langue || '';
        const payload = `SCORE:${scoreTotal}__NIVEAU:${niveau}__LANGUE:${langue}__AGENT:${login}`;

        // 3. completeTask → le delegate décide tout seul
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
  getTailleGroupeActuel(): number {
    if (!this.selectedDemande || !this.dashboard?.capacites?.length) return 20;
    const cap = this.dashboard.capacites.find(
      c => c.niveau.toString() === this.selectedDemande!.niveauChoisi
        && c.langue === this.selectedDemande!.langue
    );
    // tailleGroupe n'est pas dans CapaciteNiveauDTO pour l'instant → valeur par défaut 20
    return 20;
  }

  // ─── HELPERS DIVERS ──────────────────────────────────────────────────────

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
      return cap ? (cap.inscritsConfirmes + cap.enCoursTraitement) >= cap.capaciteMax : false;
    }
    return this.dashboard.capacites.some(c => (c.inscritsConfirmes + c.enCoursTraitement) >= c.capaciteMax);
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
    return (this.dashboard?.demandes?.filter(d => d.statut === 'LISTE_ATTENTE') || [])
      .sort((a, b) => b.scoreTotal - a.scoreTotal);
  }

  isActionnable(demande: DemandeDeptDTO): boolean { return demande.statut === 'EN_COURS_DEPARTEMENT'; }

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

  getDisplayRole(): string {
    return this.keycloak.isUserInRole('ENSEIGNANT_RESPONSABLE') ? 'Responsable de Diplôme' : 'Enseignant';
  }

  getProfileInitials(): string {
    if (!this.userProfile) return this.getInitiales();
    return ((this.userProfile.firstName?.charAt(0) || '') +
      (this.userProfile.lastName?.charAt(0) || '')).toUpperCase() || this.getInitiales();
  }

  getFilteredDocuments(): DocumentStatusDTO[] {
    return this.etudiantDocuments.filter(doc =>
      ['RELEVE_NOTES', 'RELEVE_NOTES_SUPERIEUR', 'RELEVE_NOTES_NIVEAU'].includes(doc.type)
    );
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

  getBacDistribution(): { label: string, pct: number, color: string }[] {
    if (!this.dashboard?.demandes?.length) return [];
    const inscrits = this.dashboard.demandes.filter(d => d.statut === 'INSCRIT');
    if (!inscrits.length) return [];
    const unique = new Map<number, DemandeDeptDTO>();
    inscrits.forEach(d => { if (!unique.has(d.etudiantId)) unique.set(d.etudiantId, d); });
    const counts: Record<string, number> = {};
    Array.from(unique.values()).forEach(d => {
      const b = d.diplomeObtenu?.toLowerCase() || '';
      const k = b.includes('math') ? 'Bac Math' : b.includes('info') ? 'Bac Info'
        : b.includes('science') ? 'Bac Sciences' : 'Autres';
      counts[k] = (counts[k] || 0) + 1;
    });
    const total = unique.size;
    const colors: Record<string, string> = {
      'Bac Math': '#2563eb', 'Bac Info': '#059669', 'Bac Sciences': '#d97706', 'Autres': '#8b92a9'
    };
    return Object.keys(counts).map(k => ({
      label: k, pct: Math.round((counts[k] / total) * 100), color: colors[k] || '#8b92a9'
    })).sort((a, b) => b.pct - a.pct);
  }

  openAddPrereq(): void { if (this.paramComponent) this.paramComponent.openAddModal(null); }

  getCommonPrerequisType(): string[] {
    return this.dashboard?.capacites?.length ? (this.dashboard.capacites[0].prerequisType || []) : [];
  }

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

  loadDocumentsEtudiant(etudiantId: number): void {
    this.loadingDocuments = true;
    this.etudiantDocuments = [];
    this.http.get<DocumentStatusDTO[]>(
      `${this.ETUDIANT_SERVICE_URL}/api/documents/etudiant/${etudiantId}/status`)
      .subscribe({
        next: (docs) => {
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
            telephone: student.phone, dateNaissance: student.dateNaissance,
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
      'BAC': 'Diplôme du Baccalauréat', 'RELEVE_NOTES_BAC': 'Relevé de notes Bac',
      'CERTIFICAT_RESIDENCE': 'Certificat de résidence', 'ACTE_NAISSANCE': 'Acte de naissance',
      'DIPLOME_SUPERIEUR': 'Dernier diplôme', 'RELEVE_NOTES_SUPERIEUR': 'Relevé de notes universitaire'
    };
    return labels[type] || type;
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
    const key = `${cap.niveau}-${cap.langue}`;
    this.selectedNiveau = this.selectedNiveau === key ? null : key;
    this.currentFilter = 'tous';
    this.currentPage = 0;
    this.loadDemandesParNiveau(cap);
  }

  loadDemandesParNiveau(cap: CapaciteNiveauDTO): void {
    if (!this.emailEnseignant || !this.dashboard) return;
    this.http.get<PageResponse<DemandeDeptDTO>>(`${this.apiUrl}/demandes`, {
      params: {
        email: this.emailEnseignant.trim().toLowerCase(),
        niveau: cap.niveau.toString(), langue: cap.langue,
        page: '0', size: this.pageSize.toString()
      }
    }).subscribe({
      next: (response) => {
        this.filteredDemandes = response.content;
        this.totalElements = response.totalElements;
        this.totalPages = response.totalPages;
        this.currentPage = 0;
        setTimeout(() => {
          document.querySelector('.section-card:last-of-type')?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      },
      error: (err) => console.error('❌ Erreur filtre niveau:', err)
    });
  }

  clearFiltreNiveau(): void { this.selectedNiveau = null; this.currentPage = 0; this.loadDemandesFromBackend(); }

  // ─── REJET MASSE ─────────────────────────────────────────────────────────

  rejetMasseLoading = false;
  rejetMasseNiveauKey: string | null = null;

  rejeterMasseListe(cap: CapaciteNiveauDTO): void {
    if (!this.emailEnseignant) return;
    if (!window.confirm(
      `⚠️ Confirmer le rejet de TOUTES les demandes en liste d'attente\n` +
      `Niveau ${cap.niveau} · ${cap.langue}\n\nCette action est irréversible.`
    )) return;

    this.rejetMasseLoading = true;
    this.rejetMasseNiveauKey = `${cap.niveau}-${cap.langue}`;
    this.http.post(`${environment.workflowServiceUrl}/api/process/rejet-masse`, null, {
      params: {
        emailEnseignant: this.emailEnseignant.trim().toLowerCase(),
        nomDiplome: this.dashboard?.nomDiplome || '',
        langue: cap.langue, niveau: cap.niveau.toString()
      }
    }).subscribe({
      next: () => {
        this.rejetMasseLoading = false; this.rejetMasseNiveauKey = null;
        this.showToast(`✅ Rejet en masse lancé — Niveau ${cap.niveau} (${cap.langue})`, 'success');
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
  // ═══════════════════════════════════════════════════════════════════════
  // AJOUTER ces propriétés dans la section "Score prérequis NIVEAU"
  // juste après : motifEnCours: Map<number, string> = new Map();
  // ═══════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════
  // AJOUTER ces méthodes à la fin de la classe,
  // juste avant la méthode private showToast(...)
  // ═══════════════════════════════════════════════════════════════════════

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

  /**
   * Confirme le score saisi dans le dialog et ferme.
   * Le score a déjà été mis à jour via setScorePrerequis() depuis le slider du dialog.
   * On enregistre juste le motif final si score < 50.
   */
  confirmerRejetPrerequis(): void {
    if (!this.selectedDemande || !this.selectedPrerequisToReject) return;

    const detail = this.selectedPrerequisToReject;
    const score = detail.score ?? 0;

    // Appliquer le motif final si score < 50
    if (score < 50 && this.motifRejetPrerequis.trim()) {
      this.setMotifPrerequis(detail, this.motifRejetPrerequis.trim());
    }

    // Si aucun score n'a été attribué via slider, appliquer 0 par défaut
    if (detail.score === null || detail.score === undefined) {
      this.setScorePrerequis(detail, 0);
    }

    this.fermerRejetPrerequis();
  }
}