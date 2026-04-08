import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SafePipe } from '../../pipes/safe.pipe';
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
    const rolesList = ['ETUDIANT', 'ENSEIGNANT', 'ENSEIGNANT_RESPONSABLE', 'AGENT_FINANCE', 'ADMIN'];
    rolesList.forEach(role => {
      this.http.get<PageResponse<Utilisateur>>(`${this.apiUrl}/filtre?role=${role}&page=0&size=1`).subscribe(res => {
        this.roleCounts[role] = res.totalElements;
        console.log(`Stats pour ${role}: ${res.totalElements}`);
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

  get selectableRoles(): Role[] {
    return this.roles.filter(r => r.actif && r.nom !== 'ADMIN' && r.nom !== 'ENSEIGNANT_RESPONSABLE');
  }

  isProtectedUser(user: Utilisateur | null): boolean {
    if (!user) return false;
    return user.role.nom === 'ADMIN' || user.role.nom === 'ENSEIGNANT_RESPONSABLE';
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
    
    if (this.isProtectedUser(user)) {
      this.showToast('Opération impossible : Ce compte est protégé', 'error');
      return;
    }

    if (user.actif) {
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



  openDeactivateModal(user: Utilisateur): void {
    this.selectedUser = user;
    this.deactivateReason = '';
    this.showDeactivateModal = true;
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
      role: user.role.nom
    };
    this.showFormModal = true;
  }

  closeModals(): void {
    this.showDeactivateModal = false;
    this.showDeleteModal = false;
    this.showFormModal = false;
    this.showRoleModal = false;
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
    const roleData = {
      nom: this.newRoleNom.trim().toUpperCase().replace(/\s+/g, '_'),
      actif: true
    };

    this.http.post(`${environment.apiUrl}/AUTHENTIFICATION-SERVICE/authentifier/roles`, roleData).subscribe({
      next: () => {
        this.newRoleNom = '';
        this.loadRoles();
        this.showToast('Rôle ajouté avec succès', 'success');
      },
      error: (err) => {
        console.error('Erreur lors de l\'ajout du rôle:', err);
        if (err.status === 409) {
          this.showToast('Ce rôle existe déjà !', 'error');
        } else {
          this.showToast(`Erreur (${err.status}): ${err.message}`, 'error');
        }
      }
    });
  }

  toggleRoleStatus(role: Role, event?: Event): void {
    // Sécurité : Bloquer la désactivation si des users possèdent le rôle (Global)
    if (role.actif) { // L'utilisateur veut le passer à false
      const totalUsersInRole = this.roleCounts[role.nom.trim().toUpperCase()] || 0;
      if (totalUsersInRole > 0) {
        this.showToast(`Impossible : ${totalUsersInRole} utilisateur(s) possèdent le rôle ${role.nom}`, 'error');
        // On force le bouton physique du navigateur à rester sur ON
        if (event && event.target) {
          (event.target as HTMLInputElement).checked = true;
        }
        return;
      }
    }

    this.http.put<Role>(`${environment.apiUrl}/AUTHENTIFICATION-SERVICE/authentifier/roles/${role.id}/status`, {}).subscribe({
      next: (updatedRole) => {
        role.actif = updatedRole.actif;
        this.showToast(`Rôle ${role.nom} ${role.actif ? 'activé' : 'désactivé'}`, 'success');
      },
      error: (err) => {
        this.showToast('Erreur de mise à jour', 'error');
        role.actif = !role.actif;
      }
    });
  }

  submitForm(): void {
    if (!this.formData.role || !this.formData.nom || !this.formData.prenom) {
      this.showToast('Champs obligatoires manquants', 'error');
      return;
    }
    this.formLoading = true;
    this.http.post<Utilisateur>(`${this.apiUrl}/create`, this.formData).subscribe({
      next: (user) => {
        if (user.role.nom === 'ENSEIGNANT') {
          this.http.post(`${this.deptApiUrl}/api/enseignants`, { emailUniversitaire: user.login }).subscribe({
            next: () => {
              this.finalizeCreation(user);
            },
            error: () => {
              this.http.delete(`${this.apiUrl}/${user.id}`).subscribe(() => {
                this.formLoading = false;
                this.showToast('Erreur service Enseignant (Rollback)', 'error');
              });
            }
          });
        } else {
          this.finalizeCreation(user);
        }
      },
      error: () => {
        this.formLoading = false;
        this.showToast('Erreur création compte', 'error');
      }
    });
  }

  private finalizeCreation(user: Utilisateur): void {
    this.formLoading = false;
    this.closeModals();
    this.loadUsers();
    this.loadStats();
    this.showToast(`Compte créé : ${user.prenom}`, 'success');
  }

  // ═══════════════════ HELPERS UI ═══════════════════

  getActivePercent(): number {
    const total = this.activeCount + this.inactiveCount;
    return total > 0 ? (this.activeCount / total) * 100 : 0;
  }

  getAvatarGradient(index: number): string {
    const gradients = [
      'linear-gradient(135deg, #2563eb, #3b82f6)', 'linear-gradient(135deg, #059669, #34d399)',
      'linear-gradient(135deg, #d97706, #fbbf24)', 'linear-gradient(135deg, #dc2626, #f87171)',
      'linear-gradient(135deg, #7c3aed, #a78bfa)', 'linear-gradient(135deg, #0d9488, #14b8a6)',
    ];
    return gradients[index % gradients.length];
  }

  getInitials(nom: string, prenom: string): string {
    return ((prenom?.charAt(0) || '') + (nom?.charAt(0) || '')).toUpperCase() || '??';
  }

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      'ETUDIANT': 'Étudiant', 'ENSEIGNANT': 'Enseignant',
      'ENSEIGNANT_RESPONSABLE': 'Ens. Responsable', 'AGENT_FINANCE': 'Finance', 'ADMIN': 'Admin'
    };
    return labels[role] || role;
  }

  getRoleClass(role: string): string {
    const classes: Record<string, string> = {
      'ETUDIANT': 'badge-etudiant', 'ENSEIGNANT': 'badge-enseignant',
      'ENSEIGNANT_RESPONSABLE': 'badge-responsable', 'AGENT_FINANCE': 'badge-finance', 'ADMIN': 'badge-admin'
    };
    return classes[role] || '';
  }

  getRoleSvgIcon(role: string): string {
    if (!role) return '';
    const roleKey = role.trim().toUpperCase();
    const icons: Record<string, string> = {
      'ETUDIANT': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" style="width:24px;height:24px"><path stroke-linecap="round" stroke-linejoin="round" d="M12 14l9-5-9-5-9 5 9 5z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/></svg>`,
      'ENSEIGNANT': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" style="width:24px;height:24px"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>`,
      'ENSEIGNANT_RESPONSABLE': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" style="width:24px;height:24px"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>`,
      'AGENT_FINANCE': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" style="width:24px;height:24px"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
      'ADMIN': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" style="width:24px;height:24px"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 21.248a11.955 11.955 0 01-7.618-13.264L12 3.935l7.618 4.047z"/></svg>`
    };
    return icons[roleKey] || `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" style="width:24px;height:24px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  }

  // ═══════════════════ TOAST ═══════════════════

  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    console.log('Appel de showToast:', message, type);
    this.toastMessage = message;
    this.toastType = type;
    this.toastVisible = true;
    setTimeout(() => this.toastVisible = false, 3500);
  }
}