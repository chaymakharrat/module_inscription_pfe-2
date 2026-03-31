import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, PageResponse } from '../../services/admin.service';
import { AdminDashboardStats, WorkflowDistribution } from '../../models/dashboard.model';
import { Enrollment } from '../../models/enrollment.model';
import { AlertService } from '../../services/alert.service';
import { Router } from '@angular/router';
import { KeycloakService } from 'keycloak-angular';
import { KeycloakProfile } from 'keycloak-js';
import { ScolariteService } from '../../services/scolarite.service';
import { AnneeUniversitaire } from '../../models/academic-year.model';

@Component({
  selector: 'app-dashboard-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-admin.component.html',
  styleUrl: './dashboard-admin.component.css'
})
export class DashboardAdminComponent implements OnInit {
  // Statistiques
  stats: AdminDashboardStats = {
    totalInscriptions: 0,
    demandesEnAttente: 0,
    dossiersRejetes: 0,
    paiementsValides: 0,
    inscritsDefinitifs: 0
  };

  distribution: WorkflowDistribution[] = [];

  // âœ… Pagination
  demandes: Enrollment[] = [];
  currentPage: number = 0;
  pageSize: number = 8;
  totalPages: number = 0;
  totalElements: number = 0;

  // UI State
  selectedDemande: Enrollment | null = null;
  currentFilter: 'tous' | 'attente' | 'payment_valid' | 'rejetes' | 'inscrits' = 'tous';
  searchTerm: string = '';
  viewMode: 'list' | 'grid' = 'list';
  showDetailDrawer: boolean = false;
  loading: boolean = false;
  isLoggedIn = false;
  userProfile: KeycloakProfile | null = null;
  // ðŸ†• Filtre annÃ©e universitaire
  selectedAnnee: string = '';
  anneesDisponibles: AnneeUniversitaire[] = [];
  currentYearObj?: AnneeUniversitaire;

  get isReadOnlyYear(): boolean {
    const selected = this.anneesDisponibles.find(a => a.annee === this.selectedAnnee);
    return selected ? selected.verrouillee : false;
  }

  onAnneeChange() {
    this.currentPage = 0;
    this.refreshData();
  }

  // Stepper pour le modal
  workflowSteps: any[] = [
    { id: 1, name: 'Dossier soumis', icon: 'ðŸ“', status: 'completed' },
    { id: 2, name: 'Validation ScolaritÃ©', icon: 'ðŸ«', status: 'completed' },
    { id: 3, name: 'Validation DÃ©partement', icon: 'ðŸ“‚', status: 'completed' },
    { id: 4, name: 'Paiement', icon: 'ðŸ’³', status: 'active' },
    { id: 5, name: 'Inscrit', icon: 'ðŸŽ“', status: 'pending' }
  ];

  // Pour l'affichage Math dans le template
  Math = Math;

  constructor(
    private adminService: AdminService,
    private scolariteService: ScolariteService,
    private alertService: AlertService,
    private router: Router,
    private keycloak: KeycloakService
  ) { }
  private pollingInterval: any;

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
        this.refreshData();
        
        // âœ… Polling toutes les 30 secondes
        this.pollingInterval = setInterval(() => {
          this.loadStats();
          this.loadDistribution();
        }, 30000);
      },
      error: (err) => {
        console.error('Erreur chargement annÃ©es:', err);
        this.refreshData();
      }
    });
  }

  ngOnDestroy() {
    // âœ… Toujours nettoyer
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }

  // ========== CHARGEMENT DES DONNÃ‰ES ==========

  /**
   * âœ… Charger les statistiques (pas de pagination)
   */
  loadStats(): void {
    this.adminService.getStats(this.selectedAnnee).subscribe({
      next: (stats) => {
        this.stats = stats;
      },
      error: (error) => {
        console.error('Erreur chargement stats:', error);
        this.alertService.error('Erreur lors du chargement des statistiques');
      }
    });
  }

  /**
   * âœ… Charger la distribution (pas de pagination)
   */
  loadDistribution(): void {
    this.adminService.getDistribution(this.selectedAnnee).subscribe({
      next: (distribution) => {
        this.distribution = distribution;
      },
      error: (error) => {
        console.error('Erreur chargement distribution:', error);
      }
    });
  }

  /**
   * âœ… Charger les demandes (AVEC pagination et support filtrage chart)
   */
  loadDemandes(): void {
    this.loading = true;
    let observable;

    // Si on a un terme de recherche (via onSearch), on l'utilise
    if (this.searchTerm && !this.currentFilter.includes('_')) {
      observable = this.adminService.searchDemandesPaginated(this.searchTerm, this.selectedAnnee, this.currentPage, this.pageSize);
    } else {
      // Sinon on utilise les filtres standards ou le status exact du chart
      switch (this.currentFilter) {
        case 'attente':
          observable = this.adminService.getDemandesEnAttentePaginated(this.selectedAnnee, this.currentPage, this.pageSize);
          break;
        case 'payment_valid':
          observable = this.adminService.getDemandesPaymentValidPaginated(this.selectedAnnee, this.currentPage, this.pageSize);
          break;
        case 'rejetes':
          observable = this.adminService.getDemandesRejeteesPaginated(this.selectedAnnee, this.currentPage, this.pageSize);
          break;
        case 'inscrits':
          observable = this.adminService.getInscritsDefinitifsPaginated(this.selectedAnnee, this.currentPage, this.pageSize);
          break;
        case 'tous':
          observable = this.adminService.getAllDemandesPaginated(this.selectedAnnee, this.currentPage, this.pageSize);
          break;
        default:
          // Filtrage spÃ©cifique par status exact (Drill-down Chart) - âœ… UTILISE LE NOUVEL ENDPOINT
          observable = this.adminService.getDemandesByStatutPaginated(this.currentFilter, this.selectedAnnee, this.currentPage, this.pageSize);
      }
    }

    observable.subscribe({
      next: (response: PageResponse<Enrollment>) => {
        this.demandes = response.content;
        this.totalElements = response.totalElements;
        this.totalPages = response.totalPages;
        this.loading = false;
      },
      error: (error) => {
        console.error('Erreur chargement demandes:', error);
        this.alertService.error('Erreur lors du chargement des demandes');
        this.loading = false;
      }
    });
  }

  /**
   * âœ… Interaction avec le graphique (Drill-down)
   */
  onChartBarClick(status: string): void {
    // Si on reclique sur le mÃªme status, on rÃ©initialise
    if (this.currentFilter === status) {
      this.setFilter('tous');
      return;
    }

    this.currentFilter = status as any;
    this.searchTerm = ''; // On vide la recherche manuelle pour privilÃ©gier le filtre chart
    this.currentPage = 0;
    this.loadDemandes();

    // Feedback visuel
    this.alertService.info(`Filtrage par : ${this.getDistributionLabel(status)}`);
  }

  // ========== FILTRES ==========

  /**
   * âœ… Changer de filtre
   */
  setFilter(filter: 'tous' | 'attente' | 'payment_valid' | 'rejetes' | 'inscrits'): void {
    this.currentFilter = filter;
    this.searchTerm = '';
    this.currentPage = 0; // Reset Ã  la page 0
    this.loadDemandes();
  }

  /**
   * âœ… Recherche (avec debounce recommandÃ©)
   */
  onSearch(): void {
    if (this.searchTerm.trim()) {
      this.loading = true;
      this.adminService.searchDemandesPaginated(this.searchTerm, this.selectedAnnee, this.currentPage, this.pageSize)
        .subscribe({
          next: (response: PageResponse<Enrollment>) => {
            this.demandes = response.content;
            this.totalElements = response.totalElements;
            this.totalPages = response.totalPages;
            this.loading = false;
          },
          error: (error) => {
            console.error('Erreur recherche:', error);
            this.loading = false;
          }
        });
    } else {
      this.loadDemandes();
    }
  }

  /**
   * âœ… Appliquer le filtre de recherche (dÃ©clenchement automatique)
   */
  applyFilter(): void {
    // Debounce recommandÃ© ici (voir ci-dessous)
    this.onSearch();
  }

  // ========== PAGINATION ==========

  /**
   * âœ… Aller Ã  une page spÃ©cifique
   */
  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages) {
      this.currentPage = page;
      this.loadDemandes();
    }
  }

  /**
   * âœ… Page suivante
   */
  nextPage(): void {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.loadDemandes();
    }
  }

  /**
   * âœ… Page prÃ©cÃ©dente
   */
  previousPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.loadDemandes();
    }
  }

  // ========== ACTIONS ==========

  /**
   * âœ… Actualiser toutes les donnÃ©es
   */
  refreshData(): void {
    this.loadStats();
    this.loadDistribution();
    this.loadDemandes();
  }

  /**
   * Ouvrir les dÃ©tails d'une demande
   */
  openDetails(demande: Enrollment): void {
    this.selectedDemande = demande;
    this.showDetailDrawer = true;
    this.loading = true;

    this.adminService.getDemandeById(demande.id).subscribe({
      next: (fullDemande: Enrollment) => {
        // Fusionner les données pour ne pas perdre les champs locaux
        this.selectedDemande = { ...this.selectedDemande, ...fullDemande };
        
        if (this.selectedDemande.statut) {
            this.updateWorkflowSteps(this.selectedDemande.statut);
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Erreur lors du chargement des détails:', err);
        this.loading = false;
        this.alertService.error('Impossible de charger les détails de la demande');
      }
    });
  }

  /**
   * Mettre Ã  jour les Ã©tapes du stepper selon le statut
   */
  updateWorkflowSteps(status: string): void {
    const statuses = ['SOUMIS', 'SCOLARITE_VALIDEE', 'DEPARTEMENT_VALIDE', 'PAYMENT_VALID', 'INSCRIT'];
    const currentIndex = status ? statuses.indexOf(status) : -1;

    this.workflowSteps = this.workflowSteps.map((step, idx) => {
      if (idx < currentIndex) return { ...step, status: 'completed' };
      if (idx === currentIndex) return { ...step, status: 'active' };
      return { ...step, status: 'pending' };
    });
  }

  /**
   * âœ… Finaliser une inscription
   */
  finalize(demandeId: number): void {
    if (confirm('ÃŠtes-vous sÃ»r de vouloir finaliser cette inscription ? Cela gÃ©nÃ©rera un matricule et un compte utilisateur.')) {
      this.loading = true;
      this.adminService.finalizeInscription(demandeId).subscribe({
        next: () => {
          this.alertService.success('Inscription finalisÃ©e avec succÃ¨s !');
          this.showDetailDrawer = false;
          this.refreshData();
        },
        error: (err) => {
          console.error('Erreur finalisation:', err);
          this.alertService.error('Erreur lors de la finalisation');
          this.loading = false;
        }
      });
    }
  }

  // ========== EXPORT ==========

  /**
   * Exporter vers Excel/CSV
   */
  exportToExcel(): void {
    // Pour exporter TOUTES les demandes (pas seulement la page actuelle)
    // On peut soit :
    // 1. Faire un appel sans pagination (size=999999)
    // 2. Utiliser l'ancien endpoint dÃ©prÃ©ciÃ©

    this.adminService.getAllDemandesPaginated(this.selectedAnnee, 0, 10000).subscribe({
      next: (response) => {
        const data = response.content.map(d => ({
          ID: d.id,
          Etudiant: `${d.student?.nom} ${d.student?.prenom}`,
          Email: d.student?.email,
          Statut: d.statut,
          Diplome: d.diplomeDemande,
          Date: d.dateCreation
        }));

        const csvContent = "data:text/csv;charset=utf-8,"
          + ["ID,Etudiant,Email,Statut,Diplome,Date"]
            .concat(data.map(row => Object.values(row).join(",")))
            .join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "inscriptions_admin.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.alertService.success('Export rÃ©ussi !');
      },
      error: (error) => {
        console.error('Erreur export:', error);
        this.alertService.error('Erreur lors de l\'export');
      }
    });
  }

  // ========== UTILS ==========

  /**
   * Calculer le pourcentage pour le graphique de distribution
   */
  getDistributionPercentage(count: number): number {
    const total = this.distribution.reduce((acc, curr) => acc + curr.count, 0);
    return total > 0 ? (count / total) * 100 : 0;
  }

  /**
   * âœ… Obtenir la couleur de la barre selon le statut
   */
  getDistributionColor(status: string): string {
    const s = status.toLowerCase();

    // Status in waiting/pending -> Amber/Orange Gradient
    if (s.includes('attente')) {
      return 'linear-gradient(135deg, #fbbf24, #d97706)';
    }

    // Rejections or Incomplete -> Red Gradient
    if (s.includes('rejet') || s.includes('incomplet')) {
      return 'linear-gradient(135deg, #f87171, #dc2626)';
    }

    // Payments / Validations -> Green Gradient
    if (s.includes('pay') || s.includes('valid')) {
      return 'linear-gradient(135deg, #34d399, #059669)';
    }

    // Final enrollments -> Purple/Indigo Gradient
    if (s.includes('inscrit') || s.includes('final')) {
      return 'linear-gradient(135deg, #a78bfa, #7c3aed)';
    }

    // Default / Global -> Blue Gradient
    return 'linear-gradient(135deg, #60a5fa, #2563eb)';
  }

  /**
   * âœ… Obtenir un label plus court si nÃ©cessaire
   */
  getDistributionLabel(status: string): string {
    const s = status.toLowerCase();
    if (s.includes('attente')) return 'En Attente';
    if (s.includes('rejet')) return 'RejetÃ©s';
    if (s.includes('pay')) return 'PayÃ©s';
    if (s.includes('inscrit')) return 'Inscrits';
    return status;
  }

  /**
   * DÃ©connexion
   */
  logout(): void {
    this.keycloak.logout();
  }

  // ========== UI HELPERS ==========

  hasRole(role: string): boolean {
    return this.keycloak.isUserInRole(role);
  }

  getDisplayRole(): string {
    if (this.hasRole('ADMIN')) return 'Administrateur';
    if (this.hasRole('AGENT_SCOLARITE')) return 'ScolaritÃ© Admin';
    return 'Admin ITECK';
  }

  getProfileInitials(): string {
    if (!this.userProfile) return 'AD';
    const first = this.userProfile.firstName?.charAt(0) || '';
    const last = this.userProfile.lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || 'AD';
  }

  getInitials(nom: string, prenom: string): string {
    if (!nom || !prenom) return 'ST';
    return (nom.charAt(0) + prenom.charAt(0)).toUpperCase();
  }

  getAvatarColor(index: number): string {
        const colors = [
      'linear-gradient(135deg, #2563eb, #1d4ed8)', // Bleu primaire
      'linear-gradient(135deg, #60a5fa, #2563eb)', // Bleu clair -> primaire
      'linear-gradient(135deg, #3b82f6, #1d4ed8)', // Bleu vif
      'linear-gradient(135deg, #1e40af, #1e3a8a)', // Bleu foncÃ©
      'linear-gradient(135deg, #0ea5e9, #0284c7)', // Cyan -> Bleu
      'linear-gradient(135deg, #6366f1, #4f46e5)', // Indigo
      'linear-gradient(135deg, #0284c7, #075985)', // Sky blue
      'linear-gradient(135deg, #4f46e5, #3730a3)'  // Indigo foncÃ©
    ];
    return colors[index % colors.length];
  }


}

