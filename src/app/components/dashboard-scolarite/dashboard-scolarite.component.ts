import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, Observable, of } from 'rxjs';
import { CamundaTask, DemandeDetailDTO, PageResponse, ScolariteService } from '../../services/scolarite.service';
import { AnneeUniversitaire } from '../../models/academic-year.model';
import { SafePipe } from '../../pipes/safe.pipe';
import { HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { KeycloakService } from 'keycloak-angular';
import { KeycloakProfile } from 'keycloak-js';
import { trigger, style, animate, transition, query, stagger } from '@angular/animations';
import { StudentService } from '../../services/student.service';
import { TypeDocument } from '../../models/student.model';



@Component({
  selector: 'app-scolarite-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, SafePipe],
  templateUrl: './dashboard-scolarite.component.html',
  styleUrl: './dashboard-scolarite.component.css',
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
    ]),
    trigger('formAnim', [
      transition(':enter', [
        style({ opacity: 0, height: 0, overflow: 'hidden' }),
        animate('300ms ease-out', style({ opacity: 1, height: '*' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, height: 0, overflow: 'hidden' }))
      ])
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(10px)' }),
        animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class ScolariteDashboardComponent implements OnInit {

  showExportMenu = false;
  selectedDemandes: DemandeDetailDTO[] = [];
  selectAll = false;
  isLoggedIn = false;
  userProfile: KeycloakProfile | null = null;
  Math = Math;
  // Tri du tableau
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  // Recherche avancée
  searchHistory: string[] = [];

  // Système & Notifications
  systemStatus = {
    operational: true,
    lastUpdate: new Date(),
    message: 'Système opérationnel'
  };
  notificationCount = 4;
  // Statistiques
  stats = {
    total: 0,
    enAttente: 0,
    urgents: 0,
    validees: 0,
    rejetees: 0,
    relances: 0,
    dossiersIncomplets: 0,
    delaiMoyenTraitement: '0h'
  };

  get tauxValidation(): number {
    if (this.stats.total === 0) return 0;
    return Math.round((this.stats.validees / this.stats.total) * 100);
  }

  get tauxRejet(): number {
    if (this.stats.total === 0) return 0;
    return Math.round((this.stats.rejetees / this.stats.total) * 100);
  }

  get tauxEnCours(): number {
    if (this.stats.total === 0) return 0;
    return Math.round((this.stats.enAttente / this.stats.total) * 100);
  }

  get validationCircleDashoffset(): number {
    const circumference = 175.93; // 2 * PI * 28
    return circumference - (circumference * this.tauxValidation) / 100;
  }

  // Liste des dossiers
  demandes: DemandeDetailDTO[] = [];
  currentPage = 0;
  pageSize = 6;
  totalPages = 0;
  totalElements = 0;
  viewMode: 'list' | 'grid' = 'list';
  // Variables pour le visualiseur de documents
  showDocumentViewer = false;
  currentDocumentUrl: string | null = null;
  currentDocumentName: string | null = null;
  isImage = false;

  // Loading states
  loading = false;
  actionLoading = false;
  private readonly ETUDIANT_SERVICE_URL = 'http://localhost:8888/ETUDIANT-SERVICE';
  private currentDocumentBlobUrl: string | null = null;

  // Filtres
  currentFilter: 'tous' | 'nouveaux' | 'urgents' | 'valides' | 'rejetes' | 'enAttente' | 'relances' = 'tous';
  searchTerm = '';
  // Changer le type de activeTab
  activeTab: 'documents' | 'etudiant' | 'action' = 'documents';

  // Dossier sélectionné pour le modal
  selectedDemande: DemandeDetailDTO | null = null;
  showModal = false;
  taskId: string = '';
  taskAssignee?: string;

  // Commentaire pour validation/rejet
  commentaire = '';
  loadingDocs = false;
  showValidationDialog = false;
  showRejetDialog = false;
  showDemanderPiecesDialog = false;

  // Rejet spécifique de document
  showRejectDocDialog = false;
  selectedDocToReject: any = null;
  rejectionDocComment = '';

  // 🆕 Historique des documents
  showDocHistory: { [key: number]: boolean } = {};
  toggleDocHistory(docId: number) {
    this.showDocHistory[docId] = !this.showDocHistory[docId];
  }


  // Cache de session : survive la fermeture du modal (vidé seulement après décision finale ou discard explicite)
  // clé = dossierId, valeur = Map<documentId, {statut, commentaire?}>
  private sessionDocCache: Map<number, Map<number, { statut: 'VALIDE' | 'REJETE'; commentaire?: string }>> = new Map();
  pendingDossierId: number | null = null;

  // Raccourci vers le cache du dossier courant
  get pendingDocChanges(): Map<number, { statut: 'VALIDE' | 'REJETE'; commentaire?: string }> {
    if (!this.pendingDossierId) return new Map();
    if (!this.sessionDocCache.has(this.pendingDossierId)) {
      this.sessionDocCache.set(this.pendingDossierId, new Map());
    }
    return this.sessionDocCache.get(this.pendingDossierId)!;
  }

  showUnsavedChangesDialog = false;

  get isCurrentDemandeReadOnly(): boolean {
    if (!this.selectedDemande) return true;
    const s = this.selectedDemande.statutActuel;
    return s === 'SCOLARITE_VALIDEE' ||
      s === 'EN_COURS_DEPARTEMENT' ||
      s === 'DEPARTEMENT_VALIDE' ||
      s === 'EN_ATTENTE_PAIEMENT' ||
      s === 'PAIEMENT_VALIDE' ||
      s === 'INSCRIT' ||
      s === 'REJETE_SCOLARITE' ||
      s === 'REJETE_DEPARTEMENT' ||
      s === 'REJETE_FINANCE' ||
      s === 'ARCHIVE' ||
      s === 'EN_ATTENTE_DOCUMENT';
  }

  // Toast notifications
  toastVisible = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';

  // 🆕 Nouveaux états pour les améliorations
  filterMode: 'all' | 'mine' = 'all';
  studentHistory: DemandeDetailDTO[] = [];
  hoveredDemandeId: number | null = null;
  reliabilityScore: number = 100;
  studentHistoryStats = { total: 0, valides: 0, rejetes: 0, enCours: 0 };
  studentHistoryGrouped: { annee: string; demandes: DemandeDetailDTO[] }[] = [];

  // 🆕 Filtre année universitaire
  selectedAnnee: string = '';
  anneesDisponibles: AnneeUniversitaire[] = [];
  currentYearObj?: AnneeUniversitaire;

  /** true si l'année sélectionnée est une année passée → mode lecture seule */
  get isReadOnlyYear(): boolean {
    const selected = this.anneesDisponibles.find(a => a.annee === this.selectedAnnee);
    return selected ? selected.verrouillee : false;
  }

  onAnneeChange() {
    this.currentPage = 0;
    this.loadStatistiques();
    this.loadDemandes();
  }


  constructor(
    private scolariteService: ScolariteService,
    private studentService: StudentService,
    private router: Router,
    private keycloak: KeycloakService
  ) { }

  async ngOnInit() {
    this.isLoggedIn = await this.keycloak.isLoggedIn();
    if (this.isLoggedIn) {
      try {
        this.userProfile = await this.keycloak.loadUserProfile();
      } catch (error) {
        console.error('Erreur chargement profil:', error);
      }
    }
    this.loadAcademicYears();
  }

  loadAcademicYears() {
    this.scolariteService.getAnneesUniversitairesList().subscribe({
      next: (years) => {
        this.anneesDisponibles = years;
        const current = years.find(y => y.courante);
        if (current) {
          this.currentYearObj = current;
          this.selectedAnnee = current.annee;
        } else if (years.length > 0) {
          this.selectedAnnee = years[0].annee;
        }
        this.loadStatistiques();
        this.loadDemandes();
      },
      error: (err) => {
        console.error('Erreur chargement années:', err);
        this.loadStatistiques();
        this.loadDemandes();
      }
    });
  }


  loadStatistiques() {
    const login = this.userProfile?.username || this.userProfile?.email || '';
    this.scolariteService.getStatistiques(login, this.selectedAnnee).subscribe({
      next: (stats) => {
        this.stats = stats;
      },
      error: (error) => {
        console.error('Erreur lors du chargement des statistiques:', error);
      }
    });
  }

  loadDemandes() {
    this.loading = true;
    let observable: Observable<PageResponse<DemandeDetailDTO>>;
    const login = this.userProfile?.username || this.userProfile?.email || '';
    console.log('🔍 login utilisé pour le filtre:', login); // ← AJOUTE ÇA

    switch (this.currentFilter) {
      case 'nouveaux':
        observable = this.scolariteService.getDemandesNouvelles(this.currentPage, this.pageSize, this.selectedAnnee);
        break;
      case 'urgents':
        observable = this.scolariteService.getDemandesUrgentes(this.currentPage, this.pageSize, this.selectedAnnee);
        break;
      case 'valides':
        observable = this.scolariteService.getDemandesValidees(this.currentPage, this.pageSize, login, this.selectedAnnee);
        break;
      case 'rejetes':
        observable = this.scolariteService.getDemandesRejetees(this.currentPage, this.pageSize, login, this.selectedAnnee);
        break;
      case 'enAttente':
        observable = this.scolariteService.getDemandesEnAttenteDocument(this.currentPage, this.pageSize, login, this.selectedAnnee);
        break;
      case 'relances':
        observable = this.scolariteService.getDemandesRelancees(this.currentPage, this.pageSize, login, this.selectedAnnee);
        break;
      default:
        observable = this.scolariteService.getAllDemandes(this.currentPage, this.pageSize, this.selectedAnnee);
    }

    observable.subscribe({
      next: (response: PageResponse<DemandeDetailDTO>) => {
        this.demandes = response.content;
        this.totalElements = response.totalElements;
        this.totalPages = response.totalPages;
        this.loading = false;
      },
      error: (error) => {
        console.error('Erreur lors du chargement des demandes:', error);
        this.loading = false;
      }
    });
  }

  // Export simple de la liste affichée en CSV
  exportCsv() {
    if (!this.demandes || this.demandes.length === 0) {
      alert('Aucun dossier à exporter.');
      return;
    }

    const header = [
      'NumeroDossier',
      'Nom',
      'Prenom',
      'Email',
      'Diplome',
      'Statut',
      'Priorite',
      'DocumentsValides',
      'DocumentsTotal'
    ];

    const rows = this.demandes.map(d => {
      const docsValides = d.documents.filter(doc => doc.statut === 'SOUMIS').length;
      return [
        d.numeroDossier,
        d.etudiant.nom,
        d.etudiant.prenom,
        d.etudiant.email,
        d.nomDiplome,
        d.statutActuel,
        d.priorite,
        docsValides,
        d.documents.length
      ].join(';');
    });


    const csvContent = [header.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dossiers-scolarite.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  setFilter(filter: 'tous' | 'nouveaux' | 'urgents' | 'valides' | 'rejetes' | 'enAttente' | 'relances') {
    this.currentFilter = filter;
    this.currentPage = 0;
    this.loadDemandes();
  }

  getStatutBadge(demande: DemandeDetailDTO): { label: string; css: string } {
    const s = demande.statutActuel;

    // Dossiers en cours de traitement scolarité
    if (s === 'SOUMIS' || s === 'EN_COURS_SCOLARITE') {
      const isUrgent = demande.enAttenteDepuis >= 24; // enAttenteDepuis est en heures
      return isUrgent
        ? { label: 'Urgent', css: 'badge-urgent' }
        : { label: 'Nouveau', css: 'badge-nouveau' };
    }

    if (s === 'RELANCE') return { label: '🔄 Relancé', css: 'badge-nouveau' }; // ← NOUVEAU
    if (s === 'REJETE_SCOLARITE') return { label: 'Rejeté', css: 'badge-rejete' };
    if (s === 'SCOLARITE_VALIDEE') return { label: 'Validé', css: 'badge-valide' };
    if (s === 'EN_ATTENTE_DOCUMENT') return { label: 'En attente doc.', css: 'badge-attente' };

    // fallback
    return { label: s, css: 'badge-default' };
  }

  onSearch() {
    this.currentPage = 0;
    if (this.searchTerm.trim()) {
      this.scolariteService.searchGlobal(this.searchTerm, this.currentPage, this.pageSize).subscribe({
        next: (response) => {
          this.demandes = response.content;
          this.totalElements = response.totalElements;
          this.totalPages = response.totalPages;
        },
        error: (error) => console.error('Erreur recherche globale:', error)
      });
    } else {
      this.loadDemandes();
    }
  }

  // 🆕 Indicateur de risque IA
  // calculateAIRisk(demande: DemandeDetailDTO): { label: string; level: 'low' | 'medium' | 'high'; score: number; color: string } {
  //   let score = 0;
  //   const missingDocs = this.getDocsManquantsOuRejetes(demande.documents).length;
  //   score += missingDocs * 25;

  //   if (demande.enAttenteDepuis > 72) score += 30;
  //   else if (demande.enAttenteDepuis > 48) score += 15;

  //   score = Math.min(score, 100);

  //   if (score > 70) return { label: 'Risque Élevé', level: 'high', score, color: '#ef4444' };
  //   if (score > 35) return { label: 'Risque Modéré', level: 'medium', score, color: '#f59e0b' };
  //   return { label: 'Profil Clean', level: 'low', score, color: '#10b981' };
  // }

  // 🆕 SLA Timer
  getSLAPercentage(demande: DemandeDetailDTO): number {
    const maxHours = 72; // 3 jours
    return Math.min((demande.enAttenteDepuis / maxHours) * 100, 100);
  }

  getSLAColor(demande: DemandeDetailDTO): string {
    const p = this.getSLAPercentage(demande);
    if (p > 85) return '#ef4444';
    if (p > 50) return '#f59e0b';
    return '#10b981';
  }


  get filteredDemandesList(): DemandeDetailDTO[] {
    if (this.filterMode === 'all') return this.demandes;
    const currentUser = this.userProfile?.email || this.userProfile?.username;
    return this.demandes.filter(d => d.taskAssignee === currentUser);
  }


  // 🆕 Charger l'historique de l'étudiant
  loadStudentHistory(etudiantId: number) {
    this.scolariteService.getStudentHistory(etudiantId).subscribe({
      next: (history) => {
        // Trier par date décroissante (plus récent en haut)
        this.studentHistory = history.sort((a, b) =>
          new Date(b.dateCreation).getTime() - new Date(a.dateCreation).getTime()
        );
        this.groupHistoryByYear();
        this.reliabilityScore = this.calculateReliabilityScore();
        this.studentHistoryStats = this.getStudentHistoryStats();
      }
    });
  }

  groupHistoryByYear() {
    const groupedMap = new Map<string, DemandeDetailDTO[]>();
    for (const demande of this.studentHistory) {
      if (this.selectedDemande && demande.id === this.selectedDemande.id) continue;

      const annee = this.findAnneeForDate(demande.dateCreation);
      if (!groupedMap.has(annee)) {
        groupedMap.set(annee, []);
      }
      groupedMap.get(annee)!.push(demande);
    }
    this.studentHistoryGrouped = Array.from(groupedMap.entries())
      .map(([annee, demandes]) => ({ annee, demandes }))
      .sort((a, b) => b.annee.localeCompare(a.annee));
  }

  findAnneeForDate(dateStr: string): string {
    const d = new Date(dateStr);
    for (const anneeObj of this.anneesDisponibles) {
      if (anneeObj.dateOuverture && anneeObj.dateFermeture) {
        const debut = new Date(anneeObj.dateOuverture);
        const fin = new Date(anneeObj.dateFermeture);
        fin.setHours(23, 59, 59);
        if (d >= debut && d <= fin) {
          return anneeObj.annee;
        }
      }
    }
    return 'Inconnue (' + d.getFullYear() + ')';
  }

  hasDifferentHistoricalDiploma(demande: DemandeDetailDTO): boolean {
    if (!this.selectedDemande) return false;
    const oldDernierDiplome = demande.dernierDiplomeSnapshot;
    const currentDernierDiplome = this.selectedDemande.etudiant?.dernierDiplome;
    if (!oldDernierDiplome) return false;
    return oldDernierDiplome !== currentDernierDiplome;
  }

  getRejectedDocs(demande: DemandeDetailDTO): any[] {
    if (!demande || !demande.documents) return [];
    return demande.documents.filter(d => d.statut === 'REJETE');
  }

  getPastDiplomaDocs(demande: DemandeDetailDTO): any[] {
    if (!demande || !demande.documents) return [];

    // On extrait les docs de diplôme ou relevé de notes passés (ex: DIPLOME_LICENCE, RELEVE_NOTES_LICENCE)
    // EXCLUSION du Baccalauréat car il est toujours nécessaire et ne change jamais
    return demande.documents.filter(d =>
      (d.type.startsWith('DIPLOME_') && d.type !== 'DIPLOME_BAC') ||
      (d.type.startsWith('RELEVE_NOTES_') && d.type !== 'RELEVE_NOTES_NIVEAU' && d.type !== 'RELEVE_NOTES_BAC')
    );
  }

  getDocumentLabel(type: string): string {
    const labels: Record<string, string> = {
      'DIPLOME_LICENCE': 'Diplôme de Licence',
      'CARTE_IDENTITE': "Carte d'Identité",
      'RELEVE_NOTES_NIVEAU': 'Relevé de Notes (Niveau)',
      'DIPLOME_BAC': 'Diplôme du Baccalauréat',
      'RELEVE_NOTES_BAC': 'Relevé de Notes du Baccalauréat',
      'DIPLOME_MASTER': 'Diplôme de Master',
      'DIPLOME_INGENIEUR': "Diplôme d'Ingénieur",
      'RELEVE_NOTES_MASTER': 'Relevé de Notes de Master',
      'RELEVE_NOTES_INGENIEUR': "Relevé de Notes d'Ingénieur",
      'RELEVE_NOTES_PREPARATOIRE': 'Relevé de Notes de Préparatoire',
      'RELEVE_NOTES_LICENCE': 'Relevé de Notes de Licence',
      'PHOTO_IDENTITE': "Photo d'Identité",
      'ACTE_NAISSANCE': 'Acte de Naissance'
    };
    return labels[type] || type;
  }

  // 🆕 Score de fiabilité (basé sur l'historique)
  calculateReliabilityScore(): number {
    if (!this.studentHistory || this.studentHistory.length === 0) return 100;
    const total = this.studentHistory.length;
    const rejections = this.studentHistory.filter(d =>
      d.statutActuel.startsWith('REJETE') || d.statutActuel === 'ARCHIVE'
    ).length;
    return Math.round(((total - rejections) / total) * 100);
  }

  /** Retourne les stats globales des demandes de l'étudiant (incluant la courante) */
  getStudentHistoryStats() {
    // Inclure studentHistory + selectedDemande s'il existe
    const allDemandes = [...this.studentHistory];
    if (this.selectedDemande) {
      // Éviter les doublons si selectedDemande est déjà dans studentHistory (normalement filtré à line 381)
      if (!allDemandes.find(d => d.id === this.selectedDemande?.id)) {
        allDemandes.push(this.selectedDemande);
      }
    }

    const total = allDemandes.length;
    const valides = allDemandes.filter(h =>
      h.statutActuel === 'SCOLARITE_VALIDEE' ||
      h.statutActuel === 'EN_COURS_DEPARTEMENT' ||
      h.statutActuel === 'DEPARTEMENT_VALIDE' ||
      h.statutActuel === 'EN_ATTENTE_PAIEMENT' ||
      h.statutActuel === 'PAIEMENT_VALIDE' ||
      h.statutActuel === 'INSCRIT'
    ).length;

    const rejetes = allDemandes.filter(h =>
      h.statutActuel.startsWith('REJETE') ||
      h.statutActuel === 'ARCHIVE'
    ).length;

    const enCours = total - valides - rejetes;

    return { total, valides, rejetes, enCours };
  }

  /** Retourne les initiales (Prénom + Nom) en évitant les préfixes "Al-" ou "ال" */
  getAvatarInitials(prenom?: string, nom?: string): string {
    if (!prenom && !nom) return '??';

    const getCleanInitial = (name: string) => {
      if (!name) return '';
      let clean = name.trim();

      // Fix pour noms arabes commençant par ال (Alif + Lam)
      if (clean.startsWith('\u0627\u0644')) {
        clean = clean.substring(2);
      }

      // Fix pour préfixes latins (Al , Al-, El , El-)
      const prefixes = ['Al ', 'Al-', 'El ', 'El-'];
      for (const p of prefixes) {
        if (clean.toLowerCase().startsWith(p.toLowerCase())) {
          clean = clean.substring(p.length).trim();
          break;
        }
      }

      return clean.length > 0 ? clean.charAt(0).toUpperCase() : '';
    };

    const pInit = getCleanInitial(prenom || '');
    const nInit = getCleanInitial(nom || '');

    return (pInit + nInit) || '??';
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
  /**
   * Retourne le statut effectif d'un document.
   * typeEnvoie = colonne backend réelle (RELANCE, SOUMIS, REJETE…)
   * On le priorise par rapport au champ statut qui peut être stale.
   */
  getEffectiveStatus(doc: any): string {
    if (!doc) return 'MANQUANTE';
    // Priorité au champ statut s'il a été modifié localement (VALIDE/REJETE)
    if (doc.statut === 'VALIDE' || doc.statut === 'REJETE') return doc.statut;
    return (doc.typeEnvoie || doc.statut || 'MANQUANTE').toUpperCase();
  }

  getFilteredDocuments(demande: DemandeDetailDTO | null): any[] {
    if (!demande || !demande.documents) return [];

    // 1. Filtrer par niveau académique (Snapshot)
    const snapshot = demande.dernierDiplomeSnapshot || demande.etudiant?.dernierDiplome;
    const typeFiltered = demande.documents.filter(doc => {
      const type = doc.type;
      if (['CARTE_IDENTITE', 'DIPLOME_BAC', 'RELEVE_NOTES_BAC', 'PHOTO_IDENTITE', 'ACTE_NAISSANCE'].includes(type)) return true;
      if (type.startsWith('DIPLOME_') && type !== 'DIPLOME_BAC') {
        if (snapshot === 'BACCALAUREAT') return false;
        if (snapshot === 'PREPARATOIRE' && type !== 'DIPLOME_PREPARATOIRE') return false;
        if (snapshot === 'LICENCE' && type !== 'DIPLOME_LICENCE') return false;
        if (snapshot === 'INGENIEUR' && type !== 'DIPLOME_INGENIEUR') return false;
        if (snapshot === 'MASTERE' || snapshot === 'MASTER') {
          if (type !== 'DIPLOME_MASTER' && type !== 'DIPLOME_LICENCE') return false;
        }
      }
      if (type.startsWith('RELEVE_NOTES_') && type !== 'RELEVE_NOTES_NIVEAU' && type !== 'RELEVE_NOTES_BAC') {
        if (snapshot === 'BACCALAUREAT') return false;
        if (snapshot === 'PREPARATOIRE' && type !== 'RELEVE_NOTES_PREPARATOIRE') return false;
        if (snapshot === 'LICENCE' && type !== 'RELEVE_NOTES_LICENCE') return false;
        if (snapshot === 'INGENIEUR' && type !== 'RELEVE_NOTES_INGENIEUR') return false;
        if (snapshot === 'MASTERE' || snapshot === 'MASTER') {
          if (type !== 'RELEVE_NOTES_MASTER' && type !== 'RELEVE_NOTES_LICENCE') return false;
        }
      }
      return true;
    });

    // 2. L'API renvoie UNE entrée par type avec le doc principal et ses archives.
    //    Si le doc principal est REJETE mais possède une archive RELANCE (nouvelle soumission),
    //    on promeut la version RELANCE comme document principal visible.
    return typeFiltered.map(doc => {
      const archives: any[] = doc.archives || [];
      const relanceArchive = archives.find((a: any) => a.statut === 'RELANCE');

      if (doc.statut === 'REJETE' && relanceArchive) {
        // Promouvoir la version RELANCE comme doc actif
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
          documentId: relanceArchive.id,   // ID de la version RELANCE
          nomFichier: relanceArchive.nomFichier,
          statut: 'RELANCE',
          commentaireValidation: null,
          archives: [historyEntry, ...otherArchives],
        };
      }

      return doc;
    });
  }

  /** Formate les statuts techniques en libellés lisibles */
  formatStatus(status: string): string {
    if (!status) return 'Inconnu';

    // Remplacements spécifiques
    const mapping: { [key: string]: string } = {
      'SCOLARITE_VALIDEE': 'Validé par Scolarité',
      'EN_COURS_SCOLARITE': 'En cours (Scolarité)',
      'EN_COURS_DEPARTEMENT': 'En cours (Département)',
      'DEPARTEMENT_VALIDE': 'Validé par Département',
      'EN_ATTENTE_DOCUMENT': 'Pièces manquantes',
      'EN_ATTENTE_PAIEMENT': 'En attente paiement',
      'PAIEMENT_VALIDE': 'Paiement effectué',
      'INSCRIT': 'Étudiant Inscrit',
      'REJETE_SCOLARITE': 'Refusé (Scolarité)',
      'REJETE_DEPARTEMENT': 'Refusé (Département)',
      'REJETE_FINANCE': 'Refusé (Finance)',
      'ARCHIVE': 'Dossier Archivé',
      'SOUMIS': 'Dossier Soumis'
    };

    if (mapping[status]) return mapping[status];

    // Fallback : remplacer underscores par espaces et capitaliser
    return status.split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  goToPage(page: number) {
    if (page >= 0 && page < this.totalPages) {
      this.currentPage = page;
      this.loadDemandes();
    }
  }
  // Dans dashboard-scolarite.component.ts
  getDocsManquantsOuRejetes(documents: any[]): any[] {
    if (!documents) return [];
    return documents.filter(d => d.statut === 'REJETE' || d.statut === 'MANQUANTE');
  }


  /** Réapplique les modifications en attente du cache de session sur l'objet selectedDemande */
  private reapplyPendingChanges() {
    if (!this.selectedDemande || !this.selectedDemande.documents) return;

    if (this.pendingDocChanges.size > 0) {
      this.pendingDocChanges.forEach((change, docId) => {
        const doc = this.selectedDemande!.documents.find(d => d.documentId === docId);
        if (doc) {
          doc.statut = change.statut;
          doc.typeEnvoie = change.statut;
          if (change.commentaire) doc.commentaireValidation = change.commentaire;
        }
      });
    }
  }

  openDemandeDetail(demande: DemandeDetailDTO, initialTab: 'documents' | 'etudiant' | 'action' = 'documents', actionType?: 'validation' | 'rejet' | 'pieces') {
    this.pendingDossierId = demande.id;

    // Cloner la demande pour affichage immédiat
    this.selectedDemande = { ...demande, documents: demande.documents.map(d => ({ ...d })) };
    this.showModal = true;
    this.activeTab = initialTab;
    this.commentaire = '';
    this.loadingDocs = true;

    // 🆕 Forcer un rafraîchissement des statuts de documents avec l'ID d'inscription
    console.log(`🔎 [Scolarité] Fetch documents pour etudiantId=${demande.etudiantId}, enrollmentId=${demande.id}`);
    this.studentService.getDocumentsStatus(demande.etudiantId, demande.id).subscribe({
      next: (docs) => {
        console.log('📦 API /status response (scolarite):', JSON.stringify(docs));
        if (this.selectedDemande && this.selectedDemande.id === demande.id) {
          this.selectedDemande.documents = docs;
          this.reapplyPendingChanges();
        }
        this.loadingDocs = false;
      },
      error: (err) => {
        console.error('Erreur rafraîchissement documents:', err);
        this.loadingDocs = false;
      }
    });

    // Appliquer les changements locaux en attente
    this.reapplyPendingChanges();

    // Configurer l'état initial selon l'action demandée
    this.showValidationDialog = actionType === 'validation';
    this.showRejetDialog = actionType === 'rejet';
    this.showDemanderPiecesDialog = actionType === 'pieces';

    // Récupérer le taskId de Camunda et l'assigné
    this.scolariteService.getTasksForEnrollment(demande.id).subscribe({
      next: (tasks: CamundaTask[]) => {
        if (tasks && tasks.length > 0) {
          this.taskId = tasks[0].id;
          this.taskAssignee = tasks[0].assignee;
        }
      },
      error: (error) => console.error('Erreur récupération task:', error)
    });

    if (actionType === 'pieces') {
      this.preparePieceRequestComment();
    }
    this.loadStudentHistory(demande.etudiant.id);
  }

  preparePieceRequestComment() {
    if (!this.selectedDemande) return;

    // ✅ Récupérer/Générer le token avant d'afficher le lien
    this.scolariteService.generateToken(this.selectedDemande.id).subscribe({
      next: (token) => {
        if (this.selectedDemande) this.selectedDemande.tokenAcces = token;
        this.updateEmailItemsPreview(token);
      },
      error: (err) => {
        console.error('Erreur génération token:', err);
        this.updateEmailItemsPreview(); // Fallback sans token
      }
    });
  }
  updateEmailItemsPreview(token?: string) {
    if (!this.selectedDemande) return;

    // Récupérer les docs manquants/rejetés
    const docsToRequest = this.selectedDemande.documents.filter(d =>
      d.statut === 'REJETE' || d.statut === 'MANQUANTE'
    );

    const docsNames = docsToRequest.map(d => `- ${d.type}`).join('\n');

    // Aperçu simple — le vrai HTML sera construit par le backend
    this.commentaire = docsNames.length > 0
      ? docsNames
      : "- (Aucun document rejeté détecté)";
  }
  prepareRejetComment() {
    // Plus utilisé — l'email est construit par le backend
    this.commentaire = '';
  }

  closeModal() {
    if (this.pendingDocChanges.size > 0) {
      // Avertir l'agent qu'il y a des changements non sauvegardés
      this.showUnsavedChangesDialog = true;
      return;
    }
    this.forceCloseModal();
  }

  forceCloseModal() {
    // NE PAS effacer le cache de session ici : les changements sont conservés
    // pour être restitués à la prochaine ouverture du même dossier
    this.showModal = false;
    this.selectedDemande = null;
    this.commentaire = '';
    this.showValidationDialog = false;
    this.showRejetDialog = false;
    this.showDemanderPiecesDialog = false;
    this.showUnsavedChangesDialog = false;
    this.activeTab = 'documents';
  }

  /** Discard explicite : efface le cache de session ET ferme */
  discardAndClose() {
    if (this.pendingDossierId) {
      this.sessionDocCache.delete(this.pendingDossierId);
    }
    this.pendingDossierId = null;
    this.forceCloseModal();
  }


  openRejetDialog() {
    this.showRejetDialog = true;
    this.showValidationDialog = false;
    // Juste un champ motif vide, pas de construction d'email
    this.commentaire = '';
  }
  demanderPiecesDirectement() {
    if (!this.selectedDemande || !this.taskId || this.actionLoading) return;

    const docsManquants = this.selectedDemande.documents
      .filter(d => d.statut === 'REJETE' || d.statut === 'MANQUANTE')
      .map(d => d.type)
      .join(',');

    if (!docsManquants) {
      this.showNotification('Aucun document rejeté ou manquant détecté', 'error');
      return;
    }

    this.actionLoading = true;
    this.commitPendingChanges().subscribe({
      next: () => {
        this.scolariteService.completeTask(
          this.taskId!,
          'DOCUMENT_ILLISIBLE',
          docsManquants,
          this.userProfile?.email || 'scolarite_admin'
        ).subscribe({
          next: () => {
            this.actionLoading = false;
            if (this.pendingDossierId) this.sessionDocCache.delete(this.pendingDossierId);
            this.forceCloseModal();
            this.loadDemandes();
            this.showNotification('Demande de pièces envoyée', 'success');
          },
          error: () => {
            this.actionLoading = false;
            this.showNotification('Erreur lors de la demande', 'error');
          }
        });
      },
      error: () => {
        this.actionLoading = false;
        this.showNotification('Erreur sauvegarde documents', 'error');
      }
    });
  }

  validerDossier() {
    if (!this.selectedDemande || !this.taskId) return;

    // ✅ Commentaire par défaut si l'agent ne saisit rien
    const commentaireFinal = this.commentaire.trim() ||
      `Dossier validé après vérification de l'ensemble des documents soumis.`;

    this.actionLoading = true;
    this.commitPendingChanges().subscribe({
      next: () => {
        this.scolariteService.completeTask(
          this.taskId!,
          'ACCEPTE',
          commentaireFinal,
          this.userProfile?.email || this.userProfile?.username || 'scolarite_admin'
        ).subscribe({
          next: () => {
            this.actionLoading = false;
            if (this.pendingDossierId) this.sessionDocCache.delete(this.pendingDossierId);
            this.forceCloseModal();
            this.loadDemandes();
            this.loadStatistiques();
            this.showNotification('Dossier validé avec succès ✅', 'success');
          },
          error: (error) => {
            this.actionLoading = false;
            console.error('Erreur validation:', error);
            this.showNotification('Erreur lors de la validation', 'error');
          }
        });
      },
      error: () => {
        this.actionLoading = false;
        this.showNotification('Erreur sauvegarde documents', 'error');
      }
    });
  }
  // ── NOTIFICATION TOAST (remplace alert) ─────────────────────

  // toastVisible = false;
  // toastMessage = '';
  // toastType: 'success' | 'error' = 'success';

  showNotification(message: string, type: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.toastVisible = true;
    setTimeout(() => this.toastVisible = false, 3500);
  }
  // ── MODIFIER rejeterDossier() — plus de alert() ──────────────
  rejeterDossier() {
    if (!this.selectedDemande || !this.taskId) return;

    // ✅ Construire la liste des documents rejetés avec motifs
    const docsRejetes = this.selectedDemande.documents
      .filter(d => d.statut === 'REJETE')
      .map(d => `${d.type}||${d.commentaireValidation || 'Non conforme'}`)
      .join(';;');

    // ✅ Fusionner motif + docs rejetés dans le commentaire
    const commentaireComplet = `MOTIF:${this.commentaire.trim()}__DOCS:${docsRejetes}`;

    this.actionLoading = true;
    this.commitPendingChanges().subscribe({
      next: () => {
        this.scolariteService.completeTask(
          this.taskId!,
          'REJETE',
          commentaireComplet,  // ← commentaire enrichi
          'scolarite_admin'
        ).subscribe({
          next: () => {
            this.actionLoading = false;
            if (this.pendingDossierId) this.sessionDocCache.delete(this.pendingDossierId);
            this.forceCloseModal();
            this.loadDemandes();
            this.loadStatistiques();
            this.showNotification('Dossier rejeté', 'success');
          },
          error: (error) => {
            this.actionLoading = false;
            this.showNotification('Erreur lors du rejet', 'error');
          }
        });
      },
      error: () => {
        this.actionLoading = false;
        this.showNotification('Erreur lors de la sauvegarde des documents', 'error');
      }
    });
  }

  // Ajouter cette méthode pour fermer le menu en cliquant ailleurs
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.export-menu-container')) {
      this.showExportMenu = false;
    }
  }
  demanderPieces() {
    if (!this.selectedDemande || !this.taskId) return;

    // Construire la liste brute des docs manquants/rejetés
    const docsManquants = this.selectedDemande.documents
      .filter(d => d.statut === 'REJETE' || d.statut === 'MANQUANTE')
      .map(d => d.type)
      .join(',');

    this.actionLoading = true;
    this.commitPendingChanges().subscribe({
      next: () => {
        this.scolariteService.completeTask(
          this.taskId!,
          'DOCUMENT_ILLISIBLE',
          docsManquants,  // ← liste brute, pas de HTML
          this.userProfile?.email || 'scolarite_admin'
        ).subscribe({
          next: () => {
            this.actionLoading = false;
            if (this.pendingDossierId) this.sessionDocCache.delete(this.pendingDossierId);
            this.forceCloseModal();
            this.loadDemandes();
            this.showNotification('Demande de pièces envoyée', 'success');
          },
          error: (error) => {
            this.actionLoading = false;
            console.error('Erreur demande pièces:', error);
            this.showNotification('Erreur lors de la demande', 'error');
          }
        });
      },
      error: (error) => {
        this.actionLoading = false;
        this.showNotification('Erreur lors de la sauvegarde des documents', 'error');
      }
    });
  }

  // ── REJET SPÉCIFIQUE DE DOCUMENT ─────────────────────

  openRejectDocDialog(doc: any) {
    this.selectedDocToReject = doc;
    this.rejectionDocComment = 'Document illisible ou non conforme';
    this.showRejectDocDialog = true;
  }

  closeRejectDocDialog() {
    this.showRejectDocDialog = false;
    this.selectedDocToReject = null;
    this.rejectionDocComment = '';
  }

  confirmRejectDocument() {
    if (!this.selectedDocToReject || !this.rejectionDocComment.trim() || this.isAssignedToOther) return;

    // Enregistrement LOCAL. On localise le doc par ID promu (RELANCE) OU par type
    if (this.selectedDemande) {
      let docIndex = this.selectedDemande.documents.findIndex(d => d.documentId === this.selectedDocToReject.documentId);
      if (docIndex === -1) {
        docIndex = this.selectedDemande.documents.findIndex(d => d.type === this.selectedDocToReject.type);
      }
      
      if (docIndex > -1) {
        this.selectedDemande.documents[docIndex].statut = 'REJETE';
        this.selectedDemande.documents[docIndex].typeEnvoie = 'REJETE';
        this.selectedDemande.documents[docIndex].commentaireValidation = this.rejectionDocComment;
      }
    }
    this.pendingDocChanges.set(this.selectedDocToReject.documentId, { 
      statut: 'REJETE', 
      commentaire: this.rejectionDocComment 
    });

    this.showNotification('Document marqué comme rejeté (en attente de décision finale)', 'success');
    this.closeRejectDocDialog();
  }

  /** Committe tous les changements locaux en parallèle via forkJoin */
  commitPendingChanges(): Observable<any> {
    if (this.pendingDocChanges.size === 0) {
      return new Observable(obs => { obs.next(null); obs.complete(); });
    }

    const apiCalls: Observable<any>[] = [];

    this.pendingDocChanges.forEach((change, docId) => {
      if (change.statut === 'VALIDE') {
        apiCalls.push(this.studentService.acceptDocument(docId));
      } else if (change.statut === 'REJETE') {
        const comment = change.commentaire || 'Rejeté';
        apiCalls.push(this.studentService.rejectDocument(docId, comment));
      }
    });

    return forkJoin(apiCalls);
  }

  get hasPendingChanges(): boolean {
    return this.pendingDocChanges.size > 0;
  }


  confirmAcceptDocument(doc: any) {
    if (!doc || this.isAssignedToOther) return;

    // Enregistrement LOCAL. On localise le doc par ID promu (RELANCE) OU par type
    if (this.selectedDemande) {
      // Chercher d'abord par documentId (cas standard SOUMIS/VALIDE)
      let docIndex = this.selectedDemande.documents.findIndex(d => d.documentId === doc.documentId);
      // Si non trouvé (cas RELANCE promu où documentId = archive.id), chercher par type
      if (docIndex === -1) {
        docIndex = this.selectedDemande.documents.findIndex(d => d.type === doc.type);
      }
      if (docIndex > -1) {
        this.selectedDemande.documents[docIndex].statut = 'VALIDE';
        this.selectedDemande.documents[docIndex].typeEnvoie = 'VALIDE';
      }
    }
    this.pendingDocChanges.set(doc.documentId, { statut: 'VALIDE' });
    this.showNotification('Document marqué comme valide (en attente de décision finale)', 'success');
  }

  get areAllDocumentsValidated(): boolean {
    if (!this.selectedDemande || !this.selectedDemande.documents) return false;
    if (this.selectedDemande.documents.length === 0) return false;

    const isRelanceMode = this.selectedDemande.statutActuel === 'RELANCE' ||
      this.selectedDemande.statutActuel === 'EN_ATTENTE_DOCUMENT';

    if (isRelanceMode) {
      // Pour les dossiers relancés, on ignore les documents déjà REJETE
      // Il faut juste que tout ce qui n'est pas REJETE soit VALIDE
      // (Et rien ne doit rester en SOUMIS ou RELANCE)
      return this.selectedDemande.documents.every(doc =>
        doc.statut === 'VALIDE' || doc.statut === 'REJETE'
      );
    }

    return this.selectedDemande.documents.every(doc => doc.statut === 'VALIDE');
  }

  get areAllDocumentsTreated(): boolean {
    if (!this.selectedDemande || !this.selectedDemande.documents) return false;
    // Un dossier est "traité" seulement si CHAQUE document a reçu une décision (VALIDE / REJETE)
    // ou est marqué comme MANQUANTE (décision implicite de dossier incomplet).
    // On bloque s'il reste des documents SOUMIS ou RELANCE non traités.
    return this.selectedDemande.documents.every(doc =>
      doc.statut === 'VALIDE' || doc.statut === 'REJETE' || doc.statut === 'MANQUANTE'
    );
  }

  get isAssignedToOther(): boolean {
    if (!this.taskId || !this.taskAssignee) return false;
    const currentUser = this.userProfile?.email || this.userProfile?.username;
    return !!(this.taskAssignee && currentUser && this.taskAssignee !== currentUser);
  }

  get isAssignedToMe(): boolean {
    if (!this.taskId || !this.taskAssignee) return true; // Personne n'est encore assigné
    const currentUser = this.userProfile?.email || this.userProfile?.username;
    return this.taskAssignee === currentUser;
  }

  isDemandeReadOnly(demande: DemandeDetailDTO): boolean {
    if (!demande) return false;
    const s = demande.statutActuel;
    // Un dossier est en lecture seule s'il n'est plus dans un état "actif" pour la scolarité
    // Les états actifs sont : SOUMIS, EN_COURS_SCOLARITE, EN_ATTENTE_DOCUMENT
    const activeStatuses = ['SOUMIS', 'EN_COURS_SCOLARITE', 'EN_ATTENTE_DOCUMENT', 'RELANCE'];
    return !activeStatuses.includes(s);
  }

  isOldRejectedDocument(doc: any): boolean {
    // Un document est "ancien rejeté" uniquement si son statut effectif est REJETE
    // ET qu'il n'est PAS un doc promu RELANCE (qui a été re-soumis)
    if (!doc) return false;
    const effectiveStatus = this.getEffectiveStatus(doc);
    return effectiveStatus === 'REJETE';
  }

  getDocumentStatusClass(statut: string): string {
    switch (statut) {
      case 'SOUMIS': return 'bg-blue-100 text-blue-700';
      case 'VALIDE': return 'bg-green-100 text-green-700';
      case 'MANQUANTE': return 'bg-red-100 text-red-700';
      case 'REJETE': return 'bg-rose-100 text-rose-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  getDateStatusClass(priorite: string): string {
    switch (priorite) {
      case 'HAUTE': return 'text-red-600';
      case 'MOYENNE': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  }

  getPrioriteLabel(priorite: string): string {
    switch (priorite) {
      case 'HAUTE': return 'Urgent';
      case 'MOYENNE': return 'En attente';
      case 'BASSE': return 'Nouveau';
      default: return '';
    }
  }

  getInitials(nom: string, prenom: string): string {
    return this.getAvatarInitials(prenom, nom);
  }

  getAvatarColor(index: number): string {
    const gradients = [
      'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', // Indigo-Purple
      'linear-gradient(135deg, #3b82f6 0%, #2dd4bf 100%)', // Blue-Teal
      'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)', // Amber-Red
      'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)', // Emerald-Blue
      'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)', // Pink-Violet
      'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)'  // Cyan-Blue
    ];
    return gradients[index % gradients.length];
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  formatTime(heures: number): string {
    if (heures < 1) {
      return 'Il y a ' + Math.round(heures * 60) + ' min';
    } else if (heures < 24) {
      return 'Il y a ' + Math.round(heures) + 'h';
    } else {
      const jours = Math.floor(heures / 24);
      const resteHeures = Math.round(heures % 24);
      if (resteHeures > 0) {
        return `Il y a ${jours}j et ${resteHeures}h`;
      }
      return `Il y a ${jours}j`;
    }
  }
  /**
 * ✅ MODIFIÉ : Utiliser l'endpoint /view pour la visualisation inline
 * Cet endpoint retourne le document avec Content-Disposition: inline
 * ce qui permet l'affichage dans l'iframe
 */
  viewDocument(id: number, documentName: string, isArchive = false) {
    console.log(`👁️ View ${isArchive ? 'archive' : 'document'}:`, id, documentName);
    const endpoint = isArchive ? 'archives/view' : 'documents/view';
    const url = `${this.ETUDIANT_SERVICE_URL}/api/${endpoint}/${id}`;

    this.scolariteService.getFileBlob(url).subscribe({
      next: (blob) => {
        // Nettoyer l'ancienne URL si elle existe
        if (this.currentDocumentBlobUrl) {
          URL.revokeObjectURL(this.currentDocumentBlobUrl);
        }

        // Détecter si c'est une image
        this.isImage = blob.type.startsWith('image/');
        console.log('📄 Document type:', blob.type, '| isImage:', this.isImage);

        // Créer une URL locale pour le Blob
        this.currentDocumentBlobUrl = URL.createObjectURL(blob);
        this.currentDocumentUrl = this.currentDocumentBlobUrl;
        this.currentDocumentName = documentName;
        this.showDocumentViewer = true;
      },
      error: (err) => {
        console.error('❌ Erreur lors de la récupération du document:', err);
        this.showNotification('Impossible de charger le document.', 'error');
      }
    });
  }

  /**
   * Fermer le visualiseur de documents
   */
  closeDocumentViewer() {
    console.log('❌ Closing document viewer');
    this.showDocumentViewer = false;

    // Révoquer l'URL pour libérer la mémoire
    if (this.currentDocumentBlobUrl) {
      URL.revokeObjectURL(this.currentDocumentBlobUrl);
      this.currentDocumentBlobUrl = null;
    }

    this.currentDocumentUrl = null;
    this.currentDocumentName = null;
  }

  /**
   * ✅ MODIFIÉ : Utiliser l'endpoint /download pour forcer le téléchargement
   * Cet endpoint retourne le document avec Content-Disposition: attachment
   */
  downloadDocument(documentId: number) {
    // ✅ IMPORTANT : Utiliser /download pour forcer le téléchargement
    const downloadUrl = `${this.ETUDIANT_SERVICE_URL}/api/documents/download/${documentId}`;
    console.log('⬇️ Downloading document:', downloadUrl);
    window.open(downloadUrl, '_blank');
  }

  // Helper methods for template
  /** Compte les documents soumis (SOUMIS ou VALIDE = envoyés par l’étudiant) */
  getDocumentsSoumisCount(documents: any[]): number {
    if (!documents) return 0;
    return documents.filter(d => d.statut === 'SOUMIS' || d.statut === 'VALIDE').length;
  }

  /** Compte les documents avec statut REJETE */
  getDocumentsRejeteCount(documents: any[]): number {
    if (!documents) return 0;
    return documents.filter(d => d.statut === 'REJETE').length;
  }

  /** Compte les documents avec statut VALIDE */
  getDocumentsValidesCount(documents: any[]): number {
    if (!documents) return 0;
    return documents.filter(d => d.statut === 'VALIDE').length;
  }

  /** Compte les documents "En cours" (SOUMIS ou RELANCE but not yet validated/rejected) */
  getDocumentsEnCoursCount(documents: any[]): number {
    if (!documents) return 0;
    return documents.filter(d => (d.statut === 'SOUMIS' || d.statut === 'RELANCE') && !d.isValidated).length;
  }

  /** Compte les documents déjà traités (VALIDE + REJETE) */
  getDocumentsTraitesCount(documents: any[]): number {
    if (!documents) return 0;
    return documents.filter(d => d.statut === 'VALIDE' || d.statut === 'REJETE').length;
  }

  hasMissingDocuments(documents: any[]): boolean {
    if (!documents) return false;
    return documents.some(d => d.statut === 'MANQUANTE' || d.statut === 'REJETE');
  }

  /** Retourne vrai uniquement si TOUS les documents sont VALIDE (ou REJETE en mode RELANCE) */
  areAllDocumentsSubmitted(documents: any[]): boolean {
    if (!documents || documents.length === 0) return false;

    const isRelanceMode = this.selectedDemande && (
      this.selectedDemande.statutActuel === 'RELANCE' ||
      this.selectedDemande.statutActuel === 'EN_ATTENTE_DOCUMENT'
    );

    if (isRelanceMode) {
      return documents.every(d => d.statut === 'VALIDE' || d.statut === 'REJETE');
    }

    return documents.every(d => d.statut === 'VALIDE');
  }

  getCompletionPercentage(documents: any[]): number {
    if (!documents || documents.length === 0) return 0;
    return (this.getDocumentsSoumisCount(documents) / documents.length) * 100;
  }
  // ========== NOUVELLES MÉTHODES À AJOUTER ==========

  /**
   * Basculer le menu d'export
   */
  toggleExportMenu(): void {
    this.showExportMenu = !this.showExportMenu;
  }

  /**
   * Export Excel amélioré
   */
  exportExcel(): void {
    if (!this.demandes || this.demandes.length === 0) {
      alert('Aucun dossier à exporter.');
      return;
    }

    // TODO: Implémenter avec une librairie comme xlsx
    console.log('Export Excel:', this.demandes.length, 'dossiers');
    alert('📊 Export Excel à implémenter avec la librairie xlsx');
    this.showExportMenu = false;
  }

  /**
   * Export PDF
   */
  exportPdf(): void {
    if (!this.demandes || this.demandes.length === 0) {
      alert('Aucun dossier à exporter.');
      return;
    }

    // TODO: Implémenter avec jsPDF ou pdfmake
    console.log('Export PDF:', this.demandes.length, 'dossiers');
    alert('📄 Export PDF à implémenter avec jsPDF');
    this.showExportMenu = false;
  }

  /**
   * Sélectionner/Désélectionner tous les dossiers
   */
  toggleSelectAll(): void {
    this.selectAll = !this.selectAll;
    if (this.selectAll) {
      this.selectedDemandes = [...this.demandes];
    } else {
      this.selectedDemandes = [];
    }
  }

  /**
   * Sélectionner/Désélectionner un dossier
   */
  toggleSelectDemande(demande: DemandeDetailDTO): void {
    const index = this.selectedDemandes.findIndex(d => d.id === demande.id);
    if (index > -1) {
      this.selectedDemandes.splice(index, 1);
    } else {
      this.selectedDemandes.push(demande);
    }
    this.selectAll = this.selectedDemandes.length === this.demandes.length;
  }

  /**
   * Vérifier si un dossier est sélectionné
   */
  isDossierSelected(demande: DemandeDetailDTO): boolean {
    return this.selectedDemandes.some(d => d.id === demande.id);
  }

  /**
   * Valider plusieurs dossiers en masse
   */
  validerDossiersEnMasse(): void {
    if (this.selectedDemandes.length === 0) {
      alert('⚠️ Aucun dossier sélectionné');
      return;
    }

    // Vérifier que tous les dossiers sont complets
    const incomplets = this.selectedDemandes.filter(d =>
      !this.areAllDocumentsSubmitted(d.documents)
    );

    if (incomplets.length > 0) {
      alert(`❌ ${incomplets.length} dossier(s) incomplet(s) ne peuvent pas être validés`);
      return;
    }

    if (!confirm(`Valider ${this.selectedDemandes.length} dossier(s) ?`)) {
      return;
    }

    this.actionLoading = true;

    // Créer les observables de validation
    const validations = this.selectedDemandes.map(demande => {
      return this.scolariteService.completeTask(
        demande.taskId || '',
        'ACCEPTE',
        'Validation groupée',
        'scolarite_admin'
      );
    });

    // Exécuter en parallèle
    forkJoin(validations).subscribe({
      next: () => {
        this.actionLoading = false;
        alert(`✅ ${this.selectedDemandes.length} dossier(s) validé(s) avec succès`);
        this.selectedDemandes = [];
        this.selectAll = false;
        this.loadDemandes();
        this.loadStatistiques();
      },
      error: (error) => {
        this.actionLoading = false;
        console.error('Erreur validation groupée:', error);
        alert('❌ Erreur lors de la validation groupée');
      }
    });
  }

  /**
   * Rejeter plusieurs dossiers en masse
   */
  rejeterDossiersEnMasse(): void {
    if (this.selectedDemandes.length === 0) {
      alert('⚠️ Aucun dossier sélectionné');
      return;
    }

    const motif = prompt(`Motif de rejet pour ${this.selectedDemandes.length} dossier(s):`);

    if (!motif || !motif.trim()) {
      alert('⚠️ Motif de rejet requis');
      return;
    }

    this.actionLoading = true;

    const rejets = this.selectedDemandes.map(demande => {
      return this.scolariteService.completeTask(
        demande.taskId || '',
        'REJETE',
        motif,
        'scolarite_admin'
      );
    });

    forkJoin(rejets).subscribe({
      next: () => {
        this.actionLoading = false;
        alert(`✅ ${this.selectedDemandes.length} dossier(s) rejeté(s)`);
        this.selectedDemandes = [];
        this.selectAll = false;
        this.loadDemandes();
        this.loadStatistiques();
      },
      error: (error) => {
        this.actionLoading = false;
        console.error('Erreur rejet groupé:', error);
        alert('❌ Erreur lors du rejet groupé');
      }
    });
  }

  /**
   * Trier le tableau par colonne
   */
  sortByColumn(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.demandes.sort((a, b) => {
      let valueA: any;
      let valueB: any;

      switch (column) {
        case 'numero':
          valueA = a.numeroDossier;
          valueB = b.numeroDossier;
          break;
        case 'nom':
          valueA = a.etudiant.nom;
          valueB = b.etudiant.nom;
          break;
        case 'formation':
          valueA = a.nomDiplome;
          valueB = b.nomDiplome;
          break;
        case 'date':
          valueA = new Date(a.dateCreation).getTime();
          valueB = new Date(b.dateCreation).getTime();
          break;
        case 'progression':
          valueA = this.getCompletionPercentage(a.documents);
          valueB = this.getCompletionPercentage(b.documents);
          break;
        default:
          return 0;
      }

      if (valueA < valueB) {
        return this.sortDirection === 'asc' ? -1 : 1;
      }
      if (valueA > valueB) {
        return this.sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  /**
   * Effacer la recherche
   */
  clearSearch(): void {
    this.searchTerm = '';
    this.loadDemandes();
  }

  /**
   * Obtenir la classe CSS pour l'icône de tri
   */
  getSortIconClass(column: string): string {
    if (this.sortColumn !== column) {
      return 'text-gray-400';
    }
    return this.sortDirection === 'asc'
      ? 'text-blue-600'
      : 'text-blue-600 transform rotate-180';
  }
  logout(): void {
    this.keycloak.logout();
  }

  hasRole(role: string): boolean {
    return this.keycloak.isUserInRole(role);
  }

  getDisplayRole(): string {
    if (this.hasRole('ADMIN')) return 'Administrateur';
    if (this.hasRole('AGENT_SCOLARITE')) return 'AGENT_SCOLARITE';
    return 'Agent Scolarité';
  }
  getProfileInitials(): string {
    if (!this.userProfile) return 'IT';
    const first = this.userProfile.firstName?.charAt(0) || '';
    const last = this.userProfile.lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || 'IT';
  }

  getPagesArray(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i);
  }
  // ── NOUVELLE MÉTHODE : stepper workflow ─────────────────────

  /**
   * Détermine si une étape du workflow est terminée
   * selon le statut actuel du dossier
   */
  isStepDone(step: string): boolean {
    if (!this.selectedDemande) return false;
    const statut = this.selectedDemande.statutActuel || '';

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

    // Si le dossier est rejeté à une étape ultérieure, il est quand même "done" pour les étapes précédentes
    // Mais ici on veut juste savoir si le jalon a été passé.
    const currentIndex = order.indexOf(statut);
    const targetIndex = order.indexOf(targetStatus);

    // Si le statut actuel n'est pas dans la liste (ex: REJETE_...), on vérifie le dernier jalon atteint.
    // Pour simplifier, on gère les rejets séparément.
    return currentIndex >= targetIndex && currentIndex !== -1;
  }

  isStepActive(step: string): boolean {
    if (!this.selectedDemande) return false;
    const statut = this.selectedDemande.statutActuel || '';

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
    const statut = this.selectedDemande.statutActuel || '';

    const failureMap: Record<string, string[]> = {
      'SCOLARITE': ['REJETE_SCOLARITE'],
      'DEPARTEMENT': ['REJETE_DEPARTEMENT'],
      'PAIEMENT': ['REJETE_FINANCE'],
    };

    return failureMap[step]?.includes(statut) ?? false;
  }
  // Dans la classe, ajoute cette propriété
  quickRejectReasons = [
    'Document illisible',
    'Document expiré',
    'Mauvais document',
    'Document incomplet'
  ];

  // Ajoute cette méthode
  selectQuickReason(reason: string) {
    this.rejectionDocComment = reason;
  }
  // onBtnDemanderPiecesClick() {
  //   this.activeTab = 'action';
  //   // Laisser Angular finir le rendu du tab avant d'ouvrir le dialog
  //   setTimeout(() => {
  //     this.openDemanderPiecesDialog();
  //   }, 50);
  // }

  commencerTraitement() {
    if (!this.selectedDemande || this.selectedDemande.statutActuel !== 'SOUMIS') return;

    this.actionLoading = true;
    const login = this.userProfile?.username || this.userProfile?.email || 'scolarite_admin';

    this.scolariteService.updateStatus(
      this.selectedDemande.id,
      'EN_COURS_SCOLARITE',
      'Prise en charge du dossier par l\'agent scolarité.',
      login
    ).subscribe({
      next: () => {
        this.actionLoading = false;
        this.showNotification('Dossier pris en charge avec succès', 'success');
        // Recharger le détail pour mettre à jour l'UI locale
        this.scolariteService.getDemandeDetail(this.selectedDemande!.id).subscribe(detail => {
          this.selectedDemande = detail;
          this.loadDemandes(); // Rafraîchir la liste principale aussi
          this.loadStatistiques();
        });
      },
      error: (error) => {
        this.actionLoading = false;
        console.error('Erreur prise en charge:', error);
        this.showNotification('Erreur lors de la prise en charge', 'error');
      }
    });
  }
  // Propriété pour le dialog de confirmation
  showConfirmDemanderPieces = false;
  apercuDocsManquants: { type: string; motif: string }[] = [];

  // Ouvre le dialog avec aperçu
  ouvrirConfirmDemanderPieces() {
    if (!this.selectedDemande) return;

    // Construire l'aperçu avec type + motif
    this.apercuDocsManquants = this.selectedDemande.documents
      .filter(d => d.statut === 'REJETE' || d.statut === 'MANQUANTE')
      .map(d => ({
        type: d.type,
        motif: d.commentaireValidation ||
          (d.statut === 'MANQUANTE' ? 'Document non soumis' : 'Non conforme')
      }));

    if (this.apercuDocsManquants.length === 0) {
      this.showNotification('Aucun document rejeté ou manquant', 'error');
      return;
    }

    this.showConfirmDemanderPieces = true;
  }

  // Confirme et envoie
  confirmerDemanderPieces() {
    if (!this.selectedDemande || !this.taskId) return;

    // Format enrichi : type||motif;;type||motif
    const docsPayload = this.apercuDocsManquants
      .map(d => `${d.type}||${d.motif}`)
      .join(';;');

    this.actionLoading = true;
    this.showConfirmDemanderPieces = false;

    this.commitPendingChanges().subscribe({
      next: () => {
        this.scolariteService.completeTask(
          this.taskId!,
          'DOCUMENT_ILLISIBLE',
          docsPayload,
          this.userProfile?.email || 'scolarite_admin'
        ).subscribe({
          next: () => {
            this.actionLoading = false;
            if (this.pendingDossierId)
              this.sessionDocCache.delete(this.pendingDossierId);
            this.forceCloseModal();
            this.loadDemandes();
            this.showNotification('Demande envoyée ✅', 'success');
          },
          error: () => {
            this.actionLoading = false;
            this.showNotification('Erreur lors de l\'envoi', 'error');
          }
        });
      },
      error: () => {
        this.actionLoading = false;
        this.showNotification('Erreur sauvegarde documents', 'error');
      }
    });
  }

}
