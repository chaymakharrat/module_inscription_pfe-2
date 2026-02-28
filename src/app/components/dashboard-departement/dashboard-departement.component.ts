import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { KeycloakService } from 'keycloak-angular';
import { KeycloakProfile } from 'keycloak-js';
import { environment } from '../../envirements/enviremetns';
import { ScolariteService, CamundaTask } from '../../services/scolarite.service';
import { forkJoin } from 'rxjs';
import { ParametragePrerequisComponent } from '../parametrage-prerequis/parametrage-prerequis.component';

// ─── MODELS ───────────────────────────────────────────────────────────────────

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
  taskId?: string;
}

export interface PrerequisDetailDTO {
  prerequisRequis: string;
  valeurCandidat: string;
  conforme: boolean;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-dashboard-departement',
  standalone: true,
  imports: [CommonModule, FormsModule, ParametragePrerequisComponent],
  templateUrl: './dashboard-departement.component.html',
  styleUrls: ['./dashboard-departement.component.css']
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
  activeTab: 'prerequis' | 'capacite' | 'decision' = 'prerequis';

  // Décision
  showDecisionForm = false;
  pendingDecision: 'ACCEPTE' | 'LISTE_ATTENTE' | 'REJETE' | null = null;
  commentaire = '';
  actionLoading = false;
  tokenFormulaire: string | null = null;
  loadingToken = false;

  // Toast
  toastVisible = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';

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

    // ✅ 2 appels en parallèle : infos de base + première page des demandes
    forkJoin({
      info: this.http.get<DashboardDeptDTO>(`${this.apiUrl}/dashboard`, { params: { email } }),
      demandes: this.http.get<PageResponse<DemandeDeptDTO>>(`${this.apiUrl}/demandes`, {
        params: { email, page: '0', size: this.pageSize.toString() }
      })
    }).subscribe({
      next: ({ info, demandes }) => {
        this.dashboard = {
          ...info,
          demandes: demandes.content   // remplace la liste complète par la page 0
        };
        // ✅ totalPages et totalElements sont maintenant remplis
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

  /**
   * Chargement paginé des demandes — navigation entre pages
   */
  loadDemandes(page = 0): void {
    if (!this.emailEnseignant || !this.dashboard) return;
    const email = this.emailEnseignant.trim().toLowerCase();
    this.currentPage = page;

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
        this.totalElements = response.totalElements;
        this.totalPages = response.totalPages;
        this.filteredDemandes = response.content;
      },
      error: (err) => console.error('❌ Erreur demandes:', err)
    });
  }

  // ─── FILTRES ──────────────────────────────────────────────────────────────

  setFilter(filter: string): void {
    this.currentFilter = filter;
    this.currentPage = 0;
    // Filtrage local sur les données déjà en mémoire — même comportement qu'avant
    // this.applyFilterLocal();
    this.loadDemandesFromBackend();
  }

  onSearch(): void {
    this.currentPage = 0;
    // this.applyFilterLocal();
    this.loadDemandesFromBackend();
  }
  // ✅ Remplace applyFilterLocal() — appelle le backend avec les filtres
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


  /**
   * Filtrage local — identique à l'ancien applyFilter()
   * Travaille sur dashboard.demandes déjà en mémoire
   */
  applyFilterLocal(): void {
    if (!this.dashboard) return;
    let result = [...this.dashboard.demandes];

    switch (this.currentFilter) {
      case 'prerequis_ok': result = result.filter(d => d.prerequisSatisfaits); break;
      case 'prerequis_ko': result = result.filter(d => !d.prerequisSatisfaits); break;
      case 'liste_attente': result = result.filter(d => d.statut === 'LISTE_ATTENTE'); break;
      case 'valides': result = result.filter(d => d.statut === 'DEPARTEMENT_VALIDE' || d.statut === 'INSCRIT'); break;
      case 'rejetes': result = result.filter(d => d.statut === 'REJETE_DEPARTEMENT'); break;
    }

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(d =>
        d.nomEtudiant.toLowerCase().includes(term) ||
        d.prenomEtudiant.toLowerCase().includes(term) ||
        d.emailEtudiant.toLowerCase().includes(term) ||
        d.nomDiplome.toLowerCase().includes(term) ||
        (d.niveauChoisi && d.niveauChoisi.toLowerCase().includes(term))
      );
    }

    this.filteredDemandes = result;
  }

  /** Convertit le filtre UI en paramètre statut pour l'endpoint /demandes */
  private getStatutFromFilter(filter: string): string {
    const map: Record<string, string> = {
      'liste_attente': 'LISTE_ATTENTE',
      'valides': 'DEPARTEMENT_VALIDE',
      'rejetes': 'REJETE_DEPARTEMENT'
    };
    return map[filter] || '';
  }

  // ─── PAGINATION ───────────────────────────────────────────────────────────

  // goToPage(page: number): void {
  //   if (page < 0 || page >= this.totalPages) return;
  //   this.loadDemandes(page);
  // }
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

    if (end - start < maxVisible) {
      start = Math.max(0, end - maxVisible);
    }

    for (let i = start; i < end; i++) pages.push(i);
    return pages;
  }

  // ─── MODAL ────────────────────────────────────────────────────────────────

  openDetail(demande: DemandeDeptDTO, tab: 'prerequis' | 'capacite' | 'decision' = 'prerequis'): void {
    this.selectedDemande = demande;
    this.activeTab = tab;
    this.showModal = true;
    this.showDecisionForm = false;
    this.pendingDecision = null;
    this.commentaire = '';

    // Récupérer le taskId Camunda
    this.scolariteService.getTasksForEnrollment(demande.id).subscribe({
      next: (tasks: CamundaTask[]) => {
        if (tasks && tasks.length > 0) {
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
    // Délai court pour laisser le taskId se charger avant prepareDecision
    setTimeout(() => this.prepareDecision(decision), 100);
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
          // ✅ Refresh léger au lieu du reload complet
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
Il vous permet de choisir :

  • Votre mode de paiement (en ligne ou en présentiel)
  • Votre type de paiement (total ou mensualités)
  • Les remises auxquelles vous êtes éligible(e)

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

Votre candidature pour le diplôme "${diplome}" a été évaluée favorablement par le Département pédagogique.

Cependant, la capacité maximale de la formation est actuellement atteinte.

Vous êtes inscrit(e) en liste d'attente.
Vous serez contacté(e) automatiquement dès qu'une place se libère.

Cordialement,
${this.dashboard?.nomEnseignant || 'Le Responsable'}
${this.dashboard?.nomDepartement || 'Le Département'} — ITECH University`;
  }

  private buildEmailRejet(): string {
    const nom = this.selectedDemande ? `${this.selectedDemande.prenomEtudiant} ${this.selectedDemande.nomEtudiant}` : 'Candidat(e)';
    const diplome = this.selectedDemande?.nomDiplome || 'votre diplôme';

    return `Bonjour ${nom},

Après évaluation pédagogique de votre dossier par le Département,
nous regrettons de vous informer que votre candidature pour le diplôme
"${diplome}" n'a pas été retenue.

Motif : [À préciser]

Pour toute information complémentaire, vous pouvez contacter le
secrétariat du département concerné.

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

  getCapacite(niveau?: string): CapaciteNiveauDTO | undefined {
    if (!this.dashboard?.capacites?.length) return undefined;
    if (niveau) return this.dashboard.capacites.find(c => c.niveau.toString() === niveau);
    return this.dashboard.capacites[0];
  }

  getDemandesListeAttente(): DemandeDeptDTO[] {
    return this.dashboard?.demandes?.filter(d => d.statut === 'LISTE_ATTENTE') || [];
  }

  isActionnable(demande: DemandeDeptDTO): boolean {
    return demande.statut === 'EN_COURS_DEPARTEMENT';
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

  getCountPrerequisOk(d: DemandeDeptDTO): number {
    return d.prerequisDetails?.filter(p => p.conforme).length || 0;
  }

  getCountPrerequisKo(d: DemandeDeptDTO): number {
    return d.prerequisDetails?.filter(p => !p.conforme).length || 0;
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
    if (this.paramComponent) {
      this.paramComponent.openAddModal(null);
    }
  }

  getCommonPrerequisType(): string[] {
    if (!this.dashboard?.capacites?.length) return [];
    // On prend les prérequis de type du premier niveau (ils devraient être identiques)
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

  getCompletionPercentage(): number {
    if (!this.selectedDemande) return 0;
    const statut = this.selectedDemande.statut || '';

    const order = [
      'SOUMIS', 'EN_COURS_SCOLARITE', 'SCOLARITE_VALIDEE',
      'EN_COURS_DEPARTEMENT', 'DEPARTEMENT_VALIDE',
      'EN_ATTENTE_PAIEMENT', 'PAIEMENT_VALIDE', 'INSCRIT'
    ];
    const index = order.indexOf(statut);
    if (index === -1) return 0;
    return Math.round(((index + 1) / order.length) * 100);
  }

}