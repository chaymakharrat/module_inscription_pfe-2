import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { KeycloakService } from 'keycloak-angular';
import { KeycloakProfile } from 'keycloak-js';
import { environment } from '../../envirements/enviremetns';
import { ScolariteService, CamundaTask } from '../../services/scolarite.service';

// ─── MODELS ───────────────────────────────────────────────────────────────────
export interface DashboardDeptDTO {
  nomDepartement: string;
  nomEnseignant: string;
  emailEnseignant: string;
  nomDiplome: string;
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
  langue: string;
  capaciteMax: number;
  inscritsConfirmes: number;
  enCoursTraitement: number;
  listeAttente: number;
  placesRestantes: number;
  pourcentageRemplissage: number;
  prerequisNiveau: string[]; // Changé en tableau pour Angular
  prerequisType: string[];   // Changé en tableau pour Angular
}

export interface DemandeDeptDTO {
  id: number;
  etudiantId: number;
  nomEtudiant: string;
  prenomEtudiant: string;
  emailEtudiant: string;
  nomDiplome: string;
  langue: string;
  niveauChoisi: string; // ✅ Ajouté
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

// ─── COMPONENT ────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-dashboard-departement',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-departement.component.html',
  styleUrls: ['./dashboard-departement.component.css']
})
export class DashboardDepartementComponent implements OnInit {

  // State principal
  dashboard: DashboardDeptDTO | null = null;
  loading = false;
  userProfile: KeycloakProfile | null = null;
  emailEnseignant = ''; // sera récupéré depuis Keycloak
  private apiUrl = `${environment.apiUrl}/DEPARTEMENT-SERVICE/api`;
  private inscriptionUrl = `${environment.apiUrl}/INSCRIPTION-SERVICE/api/demandes`; // ✅ ajout

  // Table / filtres
  currentFilter = 'tous';
  searchTerm = '';
  filteredDemandes: DemandeDeptDTO[] = [];

  // Modal détail
  showModal = false;
  selectedDemande: DemandeDeptDTO | null = null;
  activeTab: 'prerequis' | 'capacite' | 'decision' = 'prerequis';

  // Décision
  showDecisionForm = false;
  pendingDecision: 'ACCEPTE' | 'LISTE_ATTENTE' | 'REJETE' | null = null;
  commentaire = '';
  actionLoading = false;

  // Toast
  toastVisible = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';

  // Motifs rapides
  readonly motifsRejetRapides = [
    'Prérequis insuffisants',
    'Spécialité non compatible',
    'Capacité atteinte',
    'Dossier incomplet',
    'Moyenne insuffisante',
    'Autre'
  ];

  // Analytics //ba3d njibha mel les etudiant houma chnouma
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

  constructor(
    private http: HttpClient,
    private keycloak: KeycloakService,
    private scolariteService: ScolariteService
  ) { }

  async ngOnInit(): Promise<void> {
    try {
      const isLoggedIn = await this.keycloak.isLoggedIn();
      if (!isLoggedIn) {
        return;
      }

      const profile = await this.keycloak.loadUserProfile();
      this.userProfile = profile;
      console.log(profile);
      // On privilégie l'email du profil, sinon celui du token
      this.emailEnseignant =
        (profile.email || '') ||
        (this.keycloak.getKeycloakInstance().tokenParsed as any)?.email ||
        '';

      if (!this.emailEnseignant) {
        return;
      }

      this.loadDashboard();
    } catch {
      // En cas d'erreur Keycloak, on n'affiche simplement pas le dashboard
    }
  }


  // ─── DATA ─────────────────────────────────────────────────────────────────

  loadDashboard(): void {
    if (!this.emailEnseignant) return;

    this.loading = true;

    this.http.get<DashboardDeptDTO>(
      `${this.apiUrl}/dashboardDepartment/dashboard/enseignant`,
      {
        params: { email: this.emailEnseignant.trim().toLowerCase() }
      }
    ).subscribe({
      next: (data) => {
        this.dashboard = data;
        console.log(data);
        this.applyFilter();
        this.loading = false;
      },
      error: (err) => {
        console.error('❌ Erreur dashboard:', err);
        this.loading = false;
      }
    });
  }

  // ─── FILTRES ──────────────────────────────────────────────────────────────

  setFilter(filter: string): void {
    this.currentFilter = filter;
    this.applyFilter();
  }

  onSearch(): void {
    this.applyFilter();
  }


  applyFilter(): void {
    if (!this.dashboard) return;
    let result = [...this.dashboard.demandes];

    switch (this.currentFilter) {
      case 'prerequis_ok':
        result = result.filter(d => d.prerequisSatisfaits); break;
      case 'prerequis_ko':
        result = result.filter(d => !d.prerequisSatisfaits); break;
      case 'liste_attente':
        result = result.filter(d => d.statut === 'LISTE_ATTENTE'); break;
      case 'valides':
        result = result.filter(d => d.statut === 'DEPARTEMENT_VALIDE' || d.statut === 'INSCRIT'); break;
      case 'rejetes':
        result = result.filter(d => d.statut === 'REJETE_DEPARTEMENT'); break;
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

  // ─── MODAL ────────────────────────────────────────────────────────────────

  openDetail(demande: DemandeDeptDTO, tab: 'prerequis' | 'capacite' | 'decision' = 'prerequis'): void {
    this.selectedDemande = demande;
    this.activeTab = tab;
    this.showModal = true;
    this.showDecisionForm = false;

    // Récupérer le taskId
    this.scolariteService.getTasksForEnrollment(demande.id).subscribe({
      next: (tasks: CamundaTask[]) => {
        if (tasks && tasks.length > 0) {
          this.selectedDemande!.taskId = tasks[0].id;
        }
      },
      error: (err) => console.error('Erreur taskId:', err)
    });
    this.pendingDecision = null;
    this.commentaire = '';
  }

  closeModal(): void {
    this.showModal = false;
    this.selectedDemande = null;
    this.showDecisionForm = false;
  }

  openDecision(demande: DemandeDeptDTO, decision: 'ACCEPTE' | 'LISTE_ATTENTE' | 'REJETE'): void {
    this.openDetail(demande, 'decision');
    this.prepareDecision(decision);
  }
  tokenFormulaire: string | null = null;
  loadingToken = false;

  prepareDecision(decision: 'ACCEPTE' | 'LISTE_ATTENTE' | 'REJETE'): void {
    this.pendingDecision = decision;
    this.showDecisionForm = true;

    if (decision === 'ACCEPTE') {
      // Générer le token AVANT d'afficher l'email, comme dans le dashboard scolarité
      this.loadingToken = true;
      this.commentaire = ''; // vide le temps de charger

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
          console.error('Erreur génération token formulaire:', err);
          this.loadingToken = false;
          // Fallback : afficher l'email sans lien réel
          this.commentaire = this.buildEmailValidation(null);
        }
      });

    } else if (decision === 'LISTE_ATTENTE') {
      this.commentaire = this.buildEmailListeAttente();
    } else {
      this.commentaire = this.buildEmailRejet();
    }
  }

  private buildEmailValidation(token: string | null): string {
    const nom = this.selectedDemande
      ? `${this.selectedDemande.prenomEtudiant} ${this.selectedDemande.nomEtudiant}`
      : 'Candidat(e)';
    const diplome = this.selectedDemande?.nomDiplome || 'votre diplôme';
    const dept = this.dashboard?.nomDepartement || 'le Département';
    const enseignant = this.dashboard?.nomEnseignant || 'Le Responsable';

    // Construire le lien réel si token disponible, sinon placeholder clair
    const frontendBaseUrl = 'http://localhost:4200'; // ou environment.frontendUrl si tu l'as
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
    const nom = this.selectedDemande
      ? `${this.selectedDemande.prenomEtudiant} ${this.selectedDemande.nomEtudiant}`
      : 'Candidat(e)';
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
    const nom = this.selectedDemande
      ? `${this.selectedDemande.prenomEtudiant} ${this.selectedDemande.nomEtudiant}`
      : 'Candidat(e)';
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

  confirmerDecision(): void {
    if (!this.selectedDemande || !this.pendingDecision || !this.commentaire.trim()) return;

    const taskId = this.selectedDemande.taskId;
    if (!taskId) {
      this.showToast('❌ Tâche introuvable dans le workflow', 'error');
      return;
    }

    this.actionLoading = true;
    const login = this.userProfile?.email || this.userProfile?.username || 'enseignant_responsable';

    this.scolariteService.completeTask(
      taskId,
      this.pendingDecision,
      this.commentaire,
      login
    ).subscribe({
      next: () => {
        this.actionLoading = false;
        this.showToast(
          this.pendingDecision === 'ACCEPTE' ? '✅ Dossier validé avec succès' :
            this.pendingDecision === 'LISTE_ATTENTE' ? '🕐 Candidat mis en liste d\'attente' :
              '❌ Dossier rejeté avec succès',
          'success'
        );
        this.showModal = false;
        this.loadDashboard(); // Recharger pour voir les changements
      },
      error: (error) => {
        this.actionLoading = false;
        console.error('Erreur lors de la décision:', error);
        this.showToast('❌ Erreur lors du traitement de la décision', 'error');
      }
    });
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
      return cap ? cap.placesRestantes <= 0 : false;
    }
    return this.dashboard.capacites.some(c => c.placesRestantes <= 0);
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
    if (niveau) {
      return this.dashboard.capacites.find(c => c.niveau.toString() === niveau);
    }
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
    const initials = parts.map(p => p[0]).join('').substring(0, 2).toUpperCase();
    return initials || 'EN';
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

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.toastVisible = true;
    setTimeout(() => this.toastVisible = false, 3500);
  }
}