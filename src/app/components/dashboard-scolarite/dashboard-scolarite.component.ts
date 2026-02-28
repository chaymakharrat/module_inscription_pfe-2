import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, Observable } from 'rxjs';
import { CamundaTask, DemandeDetailDTO, PageResponse, ScolariteService } from '../../services/scolarite.service';
import { SafePipe } from '../../pipes/safe.pipe';
import { HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { KeycloakService } from 'keycloak-angular';
import { KeycloakProfile } from 'keycloak-js';
import { trigger, style, animate, transition, query, stagger } from '@angular/animations';
import { StudentService } from '../../services/student.service';



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

  // Loading states
  loading = false;
  actionLoading = false;
  private readonly ETUDIANT_SERVICE_URL = 'http://localhost:8888/ETUDIANT-SERVICE';
  private currentDocumentBlobUrl: string | null = null;

  // Filtres
  currentFilter: 'tous' | 'nouveaux' | 'urgents' | 'valides' | 'rejetes' | 'enAttente' | 'relances' = 'tous';
  searchTerm = '';

  // Dossier sélectionné pour le modal
  selectedDemande: DemandeDetailDTO | null = null;
  showModal = false;
  taskId: string = '';
  taskAssignee?: string;

  // Commentaire pour validation/rejet
  commentaire = '';
  showValidationDialog = false;
  showRejetDialog = false;
  showDemanderPiecesDialog = false;

  // Rejet spécifique de document
  showRejectDocDialog = false;
  selectedDocToReject: any = null;
  rejectionDocComment = '';

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
    this.loadStatistiques();
    this.loadDemandes();
  }


  loadStatistiques() {
    const login = this.userProfile?.username || this.userProfile?.email || '';
    this.scolariteService.getStatistiques(login).subscribe({
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
        observable = this.scolariteService.getDemandesNouvelles(this.currentPage, this.pageSize);
        break;
      case 'urgents':
        observable = this.scolariteService.getDemandesUrgentes(this.currentPage, this.pageSize);
        break;
      case 'valides':
        observable = this.scolariteService.getDemandesValidees(this.currentPage, this.pageSize, login);
        break;
      case 'rejetes':
        observable = this.scolariteService.getDemandesRejetees(this.currentPage, this.pageSize, login);
        break;
      case 'enAttente':
        observable = this.scolariteService.getDemandesEnAttenteDocument(this.currentPage, this.pageSize, login);
        break;
      case 'relances':
        observable = this.scolariteService.getDemandesRelancees(this.currentPage, this.pageSize, login);
        break;
      default:
        observable = this.scolariteService.getAllDemandes(this.currentPage, this.pageSize);
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

  // Dans setFilter()
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
      this.scolariteService.searchByDiplome(this.searchTerm, this.currentPage, this.pageSize).subscribe({
        next: (response) => {
          this.demandes = response.content;
          this.totalElements = response.totalElements;
          this.totalPages = response.totalPages;
        },
        error: (error) => console.error('Erreur recherche:', error)
      });
    } else {
      this.loadDemandes();
    }
  }

  goToPage(page: number) {
    if (page >= 0 && page < this.totalPages) {
      this.currentPage = page;
      this.loadDemandes();
    }
  }

  activeTab: 'documents' | 'action' = 'documents'; // Onglet actif du modal

  openDemandeDetail(demande: DemandeDetailDTO, initialTab: 'documents' | 'action' = 'documents', actionType?: 'validation' | 'rejet' | 'pieces') {
    this.pendingDossierId = demande.id;

    // Cloner la demande pour ne pas muter l'objet de la liste
    this.selectedDemande = { ...demande, documents: demande.documents.map(d => ({ ...d })) };
    this.showModal = true;
    this.activeTab = initialTab;
    this.commentaire = '';

    // Appliquer les changements locaux en attente (depuis le cache de session)
    if (this.pendingDocChanges.size > 0) {
      this.pendingDocChanges.forEach((change, docId) => {
        const doc = this.selectedDemande!.documents.find(d => d.documentId === docId);
        if (doc) {
          doc.statut = change.statut;
          if (change.commentaire) doc.commentaireValidation = change.commentaire;
        }
      });
    }

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


    let docsToRequest: any[];

    const isRelanceMode = this.selectedDemande.statutActuel === 'RELANCE' ||
      this.selectedDemande.statutActuel === 'EN_ATTENTE_DOCUMENT';

    if (isRelanceMode) {
      // Pour les dossiers déjà relancés, on ne liste que :
      // 1. Les documents manquants
      // 2. Les documents rejetés DANS CETTE SESSION (via pendingDocChanges)
      docsToRequest = this.selectedDemande.documents.filter(d => {
        if (d.statut === 'MANQUANTE') return true;
        const change = this.pendingDocChanges.get(d.documentId);
        return change && change.statut === 'REJETE';
      });
    } else {
      // Logique standard pour les nouveaux dossiers
      docsToRequest = this.selectedDemande.documents.filter(d =>
        d.statut === 'REJETE' || d.statut === 'MANQUANTE'
      );
    }

    const docsNames = docsToRequest.map(d => d.type === 'CARTE_IDENTITE' ? "Pièce d'identité" : d.nomFichier || d.type);

    const dossierNum = this.selectedDemande.numeroDossier;
    let itemsList = docsNames.length > 0
      ? docsNames.map(d => `- ${d}`).join('\n')
      : "- (Préciser les documents ici)";

    const baseUrl = window.location.origin;
    const tokenPart = token ? `?token=${token}` : '';
    const resubmissionLink = `${baseUrl}/mon-dossier${tokenPart}`;

    this.commentaire = `Aperçu de l'email
-----------------------------------------
À : ${this.selectedDemande.etudiant.email}
Objet : Documents manquants - Dossier #${dossierNum}

Bonjour ${this.selectedDemande.etudiant.prenom},

Veuillez soumettre à nouveau les documents suivants car ils sont invalides ou manquants :
${itemsList}

Vous pouvez les déposer directement via ce lien sécurisé (valable 72h) :
${resubmissionLink}

Cordialement,
Le Service de Scolarité — ITECH University`;
  }

  prepareRejetComment() {
    if (!this.selectedDemande) return;
    const studentName = `${this.selectedDemande.etudiant.prenom} ${this.selectedDemande.etudiant.nom}`;
    const dossierNum = this.selectedDemande.numeroDossier;

    this.commentaire = `Aperçu de l'email
-----------------------------------------
À : ${this.selectedDemande.etudiant.email}
Objet : Décision concernant votre dossier #${dossierNum}

Bonjour ${this.selectedDemande.etudiant.prenom},

Après étude de votre dossier d'inscription, nous avons le regret de vous informer que votre candidature n'a pas été retenue.

Motif : (Préciser le motif de rejet ici)

Si vous souhaitez obtenir plus d'informations, veuillez contacter notre service de scolarité.

Cordialement,
Le Service de Scolarité — ITECH University`;
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

  openValidationDialog() {
    this.showValidationDialog = true;
    this.showRejetDialog = false;
  }

  openRejetDialog() {
    this.showRejetDialog = true;
    this.showValidationDialog = false;
    this.prepareRejetComment();
  }

  openDemanderPiecesDialog() {
    this.showDemanderPiecesDialog = true;
    this.preparePieceRequestComment();
  }
  validerDossier() {
    console.log('taskId:', this.taskId);
    console.log('selectedDemande:', this.selectedDemande?.id);
    console.log('commentaire:', this.commentaire);
    if (!this.selectedDemande || !this.taskId) return;

    this.actionLoading = true;
    // 1. Committer tous les changements de documents en attente
    this.commitPendingChanges().subscribe({
      next: () => {
        // 2. Valider le dossier
        this.scolariteService.completeTask(
          this.taskId!,
          'ACCEPTE',
          this.commentaire,
          this.userProfile?.email || this.userProfile?.username || 'scolarite_admin'
        ).subscribe({
          next: () => {
            this.actionLoading = false;
            // Effacer le cache du dossier après décision réussie
            if (this.pendingDossierId) this.sessionDocCache.delete(this.pendingDossierId);
            this.forceCloseModal();
            this.loadDemandes();
            this.loadStatistiques();
            this.showNotification('Dossier validé avec succès', 'success');
          },
          error: (error) => {
            this.actionLoading = false;
            console.error('Erreur validation:', error);
            this.showNotification('Erreur lors de la validation', 'error');
          }
        });
      },
      error: (error) => {
        this.actionLoading = false;
        console.error('Erreur commit documents:', error);
        this.showNotification('Erreur lors de la sauvegarde des documents', 'error');
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
    if (!this.selectedDemande || !this.taskId || !this.commentaire.trim()) return;

    this.actionLoading = true;
    // 1. Committer tous les changements de documents en attente
    this.commitPendingChanges().subscribe({
      next: () => {
        // 2. Rejeter le dossier
        this.scolariteService.completeTask(
          this.taskId!,
          'REJETE',
          this.commentaire,
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
            console.error('Erreur rejet:', error);
            this.showNotification('Erreur lors du rejet', 'error');
          }
        });
      },
      error: (error) => {
        this.actionLoading = false;
        console.error('Erreur commit documents:', error);
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
    if (!this.selectedDemande || !this.taskId || !this.commentaire.trim()) return;

    this.actionLoading = true;
    // 1. Committer tous les changements de documents en attente
    this.commitPendingChanges().subscribe({
      next: () => {
        // 2. Envoyer la demande de pièces
        this.scolariteService.completeTask(
          this.taskId!,
          'DOCUMENT_ILLISIBLE',
          this.commentaire,
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
        console.error('Erreur commit documents:', error);
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

    // Enregistrement LOCAL uniquement (pas d'API). L'API sera appelée à la décision finale.
    if (this.selectedDemande) {
      const docIndex = this.selectedDemande.documents.findIndex(d => d.documentId === this.selectedDocToReject.documentId);
      if (docIndex > -1) {
        this.selectedDemande.documents[docIndex].statut = 'REJETE';
        // Stocker aussi le commentaire de rejet pour le commit
        this.selectedDemande.documents[docIndex].commentaireValidation = this.rejectionDocComment;
      }
    }
    this.pendingDocChanges.set(this.selectedDocToReject.documentId, { statut: 'REJETE', commentaire: this.rejectionDocComment });


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

    // Enregistrement LOCAL uniquement (pas d'API). L'API sera appelée à la décision finale.
    if (this.selectedDemande) {
      const docIndex = this.selectedDemande.documents.findIndex(d => d.documentId === doc.documentId);
      if (docIndex > -1) {
        this.selectedDemande.documents[docIndex].statut = 'VALIDE';
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
    if (!this.selectedDemande || !doc) return false;
    // Un document est considéré comme "ancien rejeté" si le dossier est en RELANCE
    // et que le document est actuellement à l'état REJETE.
    return this.selectedDemande.statutActuel === 'RELANCE' && doc.statut === 'REJETE';
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
    return (nom.charAt(0) + prenom.charAt(0)).toUpperCase();
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
      return 'Il y a ' + jours + 'j';
    }
  }
  /**
 * ✅ MODIFIÉ : Utiliser l'endpoint /view pour la visualisation inline
 * Cet endpoint retourne le document avec Content-Disposition: inline
 * ce qui permet l'affichage dans l'iframe
 */
  viewDocument(documentId: number, documentName: string) {
    console.log('👁️ Opening document viewer:', documentId, documentName);
    const url = `${this.ETUDIANT_SERVICE_URL}/api/documents/view/${documentId}`;

    this.scolariteService.getFileBlob(url).subscribe({
      next: (blob) => {
        // Nettoyer l'ancienne URL si elle existe
        if (this.currentDocumentBlobUrl) {
          URL.revokeObjectURL(this.currentDocumentBlobUrl);
        }

        // Créer une URL locale pour le Blob
        this.currentDocumentBlobUrl = URL.createObjectURL(blob);
        this.currentDocumentUrl = this.currentDocumentBlobUrl;
        this.currentDocumentName = documentName;
        this.showDocumentViewer = true;
      },
      error: (err) => {
        console.error('❌ Erreur lors de la récupération du document:', err);
        alert('Impossible de charger le document. Vérifiez votre connexion ou vos droits.');
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
  onBtnDemanderPiecesClick() {
    this.activeTab = 'action';
    // Laisser Angular finir le rendu du tab avant d'ouvrir le dialog
    setTimeout(() => {
      this.openDemanderPiecesDialog();
    }, 50);
  }

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

}