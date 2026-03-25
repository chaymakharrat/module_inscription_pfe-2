import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../envirements/enviremetns';

export interface Role {
  id: number;
  nom: string;
  actif: boolean;
}

export interface Utilisateur {
  id: number;
  login: string;
  nom: string;
  prenom: string;
  numeroDeTelephone: string;
  role: Role; // ← Changé de string à Role object
  actif: boolean;
  keycloakUserId: string;
  dateCreation: string;
  dateDesactivation?: string;
  raisonDesactivation?: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

@Component({
  selector: 'app-users-management-component',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './users-management-component.component.html',
  styleUrl: './users-management-component.component.css'
})
export class UsersManagementComponent implements OnInit {

  // ═══════ DATA ═══════
  users: Utilisateur[] = [];
  totalElements = 0;
  totalPages = 0;
  currentPage = 0;
  pageSize = 10;
  loading = false;

  // ═══════ STATS ═══════
  activeCount = 0;
  inactiveCount = 0;
  todayCount = 0;
  weekCount = 0;
  roleCounts: Record<string, number> = {};
  roles: Role[] = []; // ← NOUVEAU

  // ═══════ FILTRES ═══════
  activeRoleFilter = 'ALL';
  statusFilter = 'ALL';
  searchTerm = '';
  viewMode: 'list' | 'grid' = 'list';

  // ═══════ SÉLECTION ═══════
  selectedIds: number[] = [];

  // ═══════ MODALS ═══════
  showDetailModal = false;
  showDeactivateModal = false;
  showDeleteModal = false;
  showFormModal = false;
  showRoleModal = false; // ← NOUVEAU
  selectedUser: Utilisateur | null = null;
  deactivateReason = '';
  newRoleNom = ''; // ← NOUVEAU
  editMode = false;
  formLoading = false;

  formData = {
    email: '',
    password: '',
    nom: '',
    prenom: '',
    numeroDeTelephone: '',
    role: ''
  };

  // ═══════ TOAST ═══════
  toastVisible = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';

  Math = Math;

  private apiUrl = `${environment.apiUrl}/AUTHENTIFICATION-SERVICE/authentifier/utilisateurs`;
  private deptApiUrl = `${environment.apiUrl}/DEPARTEMENT-SERVICE`;

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.loadUsers();
    this.loadRoles(); // ← NOUVEAU
    this.loadStats();
  }

  // ═══════════════════ CHARGEMENT ═══════════════════

  loadUsers(): void {
    this.loading = true;
    this.selectedIds = [];

    let params = new HttpParams()
      .set('page', this.currentPage.toString())
      .set('size', this.pageSize.toString());

    if (this.activeRoleFilter !== 'ALL') {
      params = params.set('role', this.activeRoleFilter);
    }
    if (this.statusFilter === 'ACTIF') {
      params = params.set('actif', 'true');
    } else if (this.statusFilter === 'INACTIF') {
      params = params.set('actif', 'false');
    }

    this.http.get<PageResponse<Utilisateur>>(`${this.apiUrl}/filtre`, { params }).subscribe({
      next: (res) => {
        this.users = res.content;
        this.totalElements = res.totalElements;
        this.totalPages = res.totalPages;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.showToast('Erreur lors du chargement', 'error');
      }
    });
  }

  loadStats(): void {
    // ✅ Les 5 rôles séparément
    const roles = ['ETUDIANT', 'ENSEIGNANT', 'ENSEIGNANT_RESPONSABLE', 'AGENT_FINANCE', 'ADMIN'];
    roles.forEach(role => {
      this.http.get<PageResponse<Utilisateur>>(
        `${this.apiUrl}/filtre?role=${role}&page=0&size=1`
      ).subscribe(res => {
        this.roleCounts[role] = res.totalElements;
      });
    });

    // Actifs / Inactifs
    this.http.get<Utilisateur[]>(`${this.apiUrl}/actifs`).subscribe(res => {
      this.activeCount = res.length;
      const today = new Date().toDateString();
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      this.todayCount = res.filter(u =>
        new Date(u.dateCreation).toDateString() === today
      ).length;
      this.weekCount = res.filter(u =>
        new Date(u.dateCreation) >= weekAgo
      ).length;
    });

    this.http.get<Utilisateur[]>(`${this.apiUrl}/inactifs`).subscribe(res => {
      this.inactiveCount = res.length;
    });
  }

  loadRoles(): void {
    this.http.get<Role[]>(`${environment.apiUrl}/AUTHENTIFICATION-SERVICE/authentifier/roles`).subscribe({
      next: (res) => this.roles = res,
      error: () => console.error('Erreur chargement rôles')
    });
  }

  get activeRoles(): Role[] {
    return this.roles.filter(r => r.actif);
  }

  // ═══════════════════ FILTRES ═══════════════════

  setRoleFilter(role: string): void {
    this.activeRoleFilter = role;
    this.currentPage = 0;
    this.loadUsers();
  }

  setStatusFilter(status: string): void {
    this.statusFilter = status;
    this.currentPage = 0;
    this.loadUsers();
  }

  onSearch(): void {
    this.currentPage = 0;
    if (!this.searchTerm.trim()) {
      this.loadUsers();
      return;
    }
    this.loading = true;
    const params = new HttpParams()
      .set('page', '0')
      .set('size', '100');

    this.http.get<PageResponse<Utilisateur>>(`${this.apiUrl}/filtre`, { params }).subscribe({
      next: (res) => {
        const term = this.searchTerm.toLowerCase();
        this.users = res.content.filter(u =>
          u.login?.toLowerCase().includes(term) ||
          u.nom?.toLowerCase().includes(term) ||
          u.prenom?.toLowerCase().includes(term) ||
          u.numeroDeTelephone?.includes(term)
        );
        this.totalElements = this.users.length;
        this.totalPages = 1;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.loadUsers();
  }

  // ═══════════════════ PAGINATION ═══════════════════

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages) {
      this.currentPage = page;
      this.loadUsers();
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const total = this.totalPages;
    const current = this.currentPage;

    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i);
    }

    pages.push(0);
    if (current > 2) pages.push(-1);
    for (let i = Math.max(1, current - 1); i <= Math.min(total - 2, current + 1); i++) {
      pages.push(i);
    }
    if (current < total - 3) pages.push(-1);
    pages.push(total - 1);
    return pages;
  }

  // ═══════════════════ ACTIONS UTILISATEUR ═══════════════════

  toggleUserStatus(user: Utilisateur, event: Event): void {
    event.stopPropagation();
    const checkbox = event.target as HTMLInputElement;
    if (user.actif) {
      checkbox.checked = true;
      this.selectedUser = user;
      this.showDeactivateModal = true;
    } else {
      this.activerUtilisateur(user);
    }
  }

  activerUtilisateur(user: Utilisateur): void {
    this.http.put(`${this.apiUrl}/${user.id}/activer`, {}).subscribe({
      next: () => {
        user.actif = true;
        this.activeCount++;
        this.inactiveCount--;
        this.closeModals();
        this.showToast(`${user.prenom} ${user.nom} activé avec succès`, 'success');
        this.loadStats();
      },
      error: () => this.showToast('Erreur lors de l\'activation', 'error')
    });
  }

  desactiverUtilisateur(user: Utilisateur): void {
    const params = this.deactivateReason
      ? new HttpParams().set('raison', this.deactivateReason)
      : new HttpParams();

    this.http.put(`${this.apiUrl}/${user.id}/desactiver`, {}, { params }).subscribe({
      next: () => {
        user.actif = false;
        user.raisonDesactivation = this.deactivateReason;
        this.activeCount--;
        this.inactiveCount++;
        this.closeModals();
        this.showToast(`${user.prenom} ${user.nom} désactivé`, 'success');
        this.loadStats();
      },
      error: () => this.showToast('Erreur lors de la désactivation', 'error')
    });
  }

  supprimerUtilisateur(user: Utilisateur): void {
    this.http.delete(`${this.apiUrl}/${user.id}`).subscribe({
      next: () => {
        this.users = this.users.filter(u => u.id !== user.id);
        this.totalElements--;
        this.closeModals();
        this.showToast(`Compte supprimé définitivement`, 'success');
        this.loadStats();
      },
      error: () => this.showToast('Erreur lors de la suppression', 'error')
    });
  }

  // ═══════════════════ BULK ACTIONS ═══════════════════

  toggleSelect(id: number): void {
    const idx = this.selectedIds.indexOf(id);
    if (idx === -1) this.selectedIds.push(id);
    else this.selectedIds.splice(idx, 1);
  }

  toggleSelectAll(): void {
    if (this.isAllSelected()) {
      this.selectedIds = [];
    } else {
      this.selectedIds = this.users.map(u => u.id);
    }
  }

  isAllSelected(): boolean {
    return this.users.length > 0 && this.selectedIds.length === this.users.length;
  }

  clearSelection(): void { this.selectedIds = []; }

  bulkAction(action: 'activate' | 'deactivate'): void {
    const requests = this.selectedIds.map(id => {
      const endpoint = action === 'activate'
        ? `${this.apiUrl}/${id}/activer`
        : `${this.apiUrl}/${id}/desactiver`;
      return this.http.put(endpoint, {});
    });

    let done = 0;
    requests.forEach(req => {
      req.subscribe({
        next: () => {
          done++;
          if (done === requests.length) {
            this.clearSelection();
            this.loadUsers();
            this.loadStats();
            this.showToast(
              `${done} comptes ${action === 'activate' ? 'activés' : 'désactivés'}`,
              'success'
            );
          }
        }
      });
    });
  }

  // ═══════════════════ MODALS ═══════════════════

  openUserDetail(user: Utilisateur): void {
    this.selectedUser = user;
    this.showDetailModal = true;
  }

  openDeactivateModal(user: Utilisateur): void {
    this.selectedUser = user;
    this.deactivateReason = '';
    this.showDeactivateModal = true;
    this.showDetailModal = false;
  }

  confirmDelete(user: Utilisateur): void {
    this.selectedUser = user;
    this.showDeleteModal = true;
  }

  openCreateModal(): void {
    this.editMode = false;
    this.formData = { email: '', password: '', nom: '', prenom: '', numeroDeTelephone: '', role: '' };
    this.showFormModal = true;
  }

  openEditModal(user: Utilisateur): void {
    this.editMode = true;
    this.selectedUser = user;
    this.formData = {
      email: user.login,
      password: '',
      nom: user.nom,
      prenom: user.prenom,
      numeroDeTelephone: user.numeroDeTelephone,
      role: user.role.nom // ← Utiliser le nom du rôle pour le dropdown
    };
    this.showFormModal = true;
  }

  closeModals(): void {
    this.showDeleteModal = false;
    this.showFormModal = false;
    this.showRoleModal = false; // ← NOUVEAU
    this.selectedUser = null;
    this.deactivateReason = '';
  }

  // ═══════════════════ GESTION DES RÔLES ═══════════════════

  openRoleModal(): void {
    this.loadRoles();
    this.showRoleModal = true;
  }

  addRole(): void {
    if (!this.newRoleNom.trim()) return;
    this.http.post<Role>(`${environment.apiUrl}/AUTHENTIFICATION-SERVICE/authentifier/roles`, {
      nom: this.newRoleNom.toUpperCase().replace(/\s+/g, '_'),
      actif: true
    }).subscribe({
      next: () => {
        this.newRoleNom = '';
        this.loadRoles();
        this.showToast('Rôle ajouté avec succès', 'success');
      },
      error: (err) => {
        const errorMsg = err.status === 409 ? err.error : 'Erreur lors de l\'ajout';
        this.showToast(errorMsg, 'error');
      }
    });
  }

  toggleRoleStatus(role: Role): void {
    this.http.put<Role>(`${environment.apiUrl}/AUTHENTIFICATION-SERVICE/authentifier/roles/${role.id}/status`, {}).subscribe({
      next: (updatedRole) => {
        role.actif = updatedRole.actif;
        this.showToast(`Rôle ${role.nom} ${role.actif ? 'activé' : 'désactivé'}`, 'success');
        this.loadRoles();
      },
      error: (err) => {
        const errorMsg = err.status === 409 ? err.error : 'Erreur lors du changement de statut';
        this.showToast(errorMsg, 'error');
      }
    });
  }

  submitForm(): void {
    if (!this.formData.email || !this.formData.role) {
      this.showToast('Email et rôle sont obligatoires', 'error');
      return;
    }
    this.formLoading = true;

    this.http.post<Utilisateur>(`${this.apiUrl}/create`, this.formData).subscribe({
      next: (user) => {

        // ✅ Si enseignant → créer dans dept-service
        if (user.role.nom === 'ENSEIGNANT') {

          // Valider email @itech.tn
          const emailPattern = /^[A-Za-z0-9+_.-]+@itech\.tn$/;
          if (!emailPattern.test(user.login)) {
            this.http.delete(`${this.apiUrl}/${user.id}`).subscribe();
            this.formLoading = false;
            this.showToast('Email invalide : doit être @itech.tn pour un enseignant', 'error');
            return;
          }

          this.http.post(`${this.deptApiUrl}/api/enseignants`, {
            emailUniversitaire: user.login
          }).subscribe({
            next: () => {
              this.formLoading = false;
              this.closeModals();
              this.loadUsers();
              this.loadStats();
              this.showToast(`Enseignant ${user.prenom} ${user.nom} créé`, 'success');
            },
            error: () => {
              // Rollback : supprimer le user auth
              this.http.delete(`${this.apiUrl}/${user.id}`).subscribe({
                next: () => {
                  this.formLoading = false;
                  this.showToast('Erreur : aucun compte créé (rollback effectué)', 'error');
                },
                error: () => {
                  this.formLoading = false;
                  this.showToast(
                    `ATTENTION : compte auth créé (id: ${user.id}) mais dept-service en échec. Suppression manuelle requise.`,
                    'error'
                  );
                }
              });
            }
          });

        } else {
          // Autres rôles → pas de dept-service
          this.formLoading = false;
          this.closeModals();
          this.loadUsers();
          this.loadStats();
          this.showToast(`Compte créé pour ${user.prenom} ${user.nom}`, 'success');
        }
      },
      error: () => {
        this.formLoading = false;
        this.showToast('Erreur lors de la création du compte', 'error');
      }
    });
  }

  // ═══════════════════ HELPERS UI ═══════════════════

  getActivePercent(): number {
    const total = this.activeCount + this.inactiveCount;
    return total > 0 ? (this.activeCount / total) * 100 : 0;
  }

  getAvatarGradient(index: number): string {
    const gradients = [
      'linear-gradient(135deg, #6366f1, #4f46e5)',
      'linear-gradient(135deg, #0891b2, #0e7490)',
      'linear-gradient(135deg, #059669, #047857)',
      'linear-gradient(135deg, #d97706, #b45309)',
      'linear-gradient(135deg, #dc2626, #b91c1c)',
      'linear-gradient(135deg, #7c3aed, #6d28d9)',
      'linear-gradient(135deg, #2563eb, #1d4ed8)',
      'linear-gradient(135deg, #0d9488, #0f766e)',
    ];
    return gradients[index % gradients.length];
  }

  getInitials(nom: string, prenom: string): string {
    if (!nom && !prenom) return '??';
    return ((prenom?.charAt(0) || '') + (nom?.charAt(0) || '')).toUpperCase();
  }

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      'ETUDIANT': 'Étudiant',
      'ENSEIGNANT': 'Enseignant',                         // ← simple
      'ENSEIGNANT_RESPONSABLE': 'Ens. Responsable',       // ← responsable
      'AGENT_FINANCE': 'Finance',
      'ADMIN': 'Admin'
    };
    return labels[role] || role;
  }

  getRoleIcon(role: string): string {
    const icons: Record<string, string> = {
      'ETUDIANT': '🎓',
      'ENSEIGNANT': '👨‍🏫',
      'ENSEIGNANT_RESPONSABLE': '⭐',
      'AGENT_FINANCE': '💰',
      'ADMIN': '⚡'
    };
    return icons[role] || '👤';
  }

  getRoleClass(role: string): string {
    const classes: Record<string, string> = {
      'ETUDIANT': 'badge-etudiant',
      'ENSEIGNANT': 'badge-enseignant',
      'ENSEIGNANT_RESPONSABLE': 'badge-responsable',
      'AGENT_FINANCE': 'badge-finance',
      'ADMIN': 'badge-admin'
    };
    return classes[role] || '';
  }

  // ═══════════════════ TOAST ═══════════════════

  showToast(message: string, type: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.toastVisible = true;
    setTimeout(() => this.toastVisible = false, 3500);
  }
}