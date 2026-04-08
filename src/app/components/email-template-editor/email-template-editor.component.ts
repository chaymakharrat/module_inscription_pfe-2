import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmailTemplateService } from '../../services/email-template.service';
import { EmailTemplate } from '../../models/email-template.model';
import { NotificationTemplate } from '../../models/notification-template.model';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { AlertService } from '../../services/alert.service';

@Component({
  selector: 'app-email-template-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './email-template-editor.component.html',
  styleUrls: ['./email-template-editor.component.css']
})
export class EmailTemplateEditorComponent implements OnInit, OnDestroy {
  @ViewChild('editorRef') editorRef!: ElementRef;
  activeTab: 'email' | 'notification' = 'email';

  // Email Templates
  templates: EmailTemplate[] = [];
  selectedTemplate: EmailTemplate | null = null;
  previewHtml: SafeHtml = '';
  isLoading: boolean = false;

  // Notification Templates
  notificationTemplates: NotificationTemplate[] = [];
  isLoadingNotifications: boolean = false;
  editingNotification: NotificationTemplate | null = null;
  notificationEditContent: string = '';
  selectedRoleFilter: string = 'ALL';

  // Variables & Sync
  isSyncing: boolean = false;
  availableVariables = [
    { name: 'diplome', label: 'Diplôme' },
    { name: 'langue', label: 'Langue' },
    { name: 'status', label: 'Statut' },
    { name: 'type', label: 'Type' },
    { name: 'frais', label: 'Frais' },
    { name: 'departement', label: 'Département' },
    { name: 'nomDepartement', label: 'Nom Dept' },
    { name: 'montantRecu', label: 'Montant' },
    { name: 'numFacture', label: 'Facture' },
    { name: 'numeroOrdre', label: 'N° Ordre' },
    { name: 'statutBlock', label: 'Bloc Statut' },
    { name: 'lienFormulaire', label: 'Lien' }
  ];

  private previewSubject = new Subject<void>();
  private destroy$ = new Subject<void>();

  // Simulation Data (Marc Kharat)
  dummyData: any = {
    prenom: 'Marc',
    nom: 'Kharat',
    nomDiplome: 'Génie Logiciel',
    dateDepot: '03 avril 2026',
    numeroDemande: 'DEM-2026-0042',
    motifRejet: 'Documents non conformes',
    commentaire: 'Veuillez re-scanner votre CIN en haute résolution.',
    montantEcheance: '850.50',
    dateEcheance: '15 mai 2026',
    numeroEcheance: '1',
    numeroFacture: 'FAC-2026-0004',
    montantTotal: '4500.00',
    totalPaye: '850.50',
    resteApayer: '3649.50',
    pctLabel: '19%',
    barColor: '#2563eb',
    badgeTxt: 'Paiement en cours',
    badgeBg: '#eff4ff',
    badgeColor: '#2563eb',
    badgeDot: '●',
    today: '03 avril 2026',
    annee: '2026',
    matricule: '2026-00451',
    login: 'marc.kharat@itech-university.tn',
    password: 'PROVISOIRE-123',
    formation: 'Cycle d\'Ingénieur en Informatique',
    salutation: 'Marc Kharat',
    subject: 'Confirmation de Paiement - ITECH',
    nomDepartement: 'Génie Logiciel',
    niveau: '3ème année',
    langue: 'Français',
    lienFormulaire: 'https://itech-university.tn/form/pref-paiement',
    listeHtml: '<ul><li>Copie de la CIN</li><li>Justificatif de domicile</li></ul>',
    numeroOrdre: '1',
    totalEcheances: '3',
    montantRecu: '850.50',
    modeMsg: 'Virement bancaire',
    numFacture: 'FAC-2026-0042',
    dateEcheanceStr: '15 Mai 2026',
    echeancesBlock: '',
    compteBlock: '',
    soldeBlock: '',
    statutBlock: ''
  };

  constructor(
    private templateService: EmailTemplateService,
    private sanitizer: DomSanitizer,
    private alertService: AlertService
  ) { }

  // --- UI Helpers ---

  get totalTemplates(): number {
    return this.templates.length + this.notificationTemplates.length;
  }

  get emailCount(): number {
    return this.templates.length;
  }

  get notificationCount(): number {
    return this.notificationTemplates.length;
  }

  get filteredNotificationTemplates(): NotificationTemplate[] {
    if (this.selectedRoleFilter === 'ALL') return this.notificationTemplates;
    return this.notificationTemplates.filter(nt => nt.recipientRole === this.selectedRoleFilter);
  }

  get uniqueRoles(): string[] {
    const roles = this.notificationTemplates.map(nt => nt.recipientRole);
    return Array.from(new Set(roles)).filter(r => !!r);
  }

  setRoleFilter(role: string): void {
    this.selectedRoleFilter = role;
  }

  getRoleInitial(role: string): string {
    if (!role) return '?';
    return role.charAt(0).toUpperCase();
  }

  getRoleColorClass(role: string): string {
    if (!role) return 'bg-slate-500';
    const r = role.toUpperCase();
    if (r.includes('ENSEIGNANT')) return 'bg-indigo-600';
    if (r.includes('FINANCE') || r.includes('SCOLARITE')) return 'bg-emerald-500';
    if (r.includes('ADMIN')) return 'bg-blue-600';
    if (r.includes('ETUDIANT')) return 'bg-amber-500';
    return 'bg-slate-600';
  }

  ngOnInit(): void {
    this.loadTemplates();
    this.loadNotificationTemplates();

    this.previewSubject.pipe(
      debounceTime(300),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.updatePreview();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  switchTab(tab: 'email' | 'notification'): void {
    this.activeTab = tab;
  }

  loadTemplates(): void {
    this.isLoading = true;
    this.templateService.getAll().subscribe({
      next: (data) => {
        this.templates = data;
        if (data.length > 0 && !this.selectedTemplate) {
          this.selectTemplate(data[0]);
        }
        this.isLoading = false;
      },
      error: (err) => {
        this.alertService.error('Erreur lors du chargement des modèles email');
        this.isLoading = false;
      }
    });
  }

  loadNotificationTemplates(): void {
    this.isLoadingNotifications = true;
    this.templateService.getAllNotificationTemplates().subscribe({
      next: (data) => {
        this.notificationTemplates = data;
        this.isLoadingNotifications = false;
      },
      error: (err) => {
        this.alertService.error('Erreur lors du chargement des modèles de notifications');
        this.isLoadingNotifications = false;
      }
    });
  }

  compareTemplates(t1: EmailTemplate, t2: EmailTemplate): boolean {
    return t1 && t2 ? t1.id === t2.id : t1 === t2;
  }

  selectTemplate(tpl: EmailTemplate): void {
    this.selectedTemplate = { ...tpl };
    this.updatePreview();
  }

  onContentChange(): void {
    this.isSyncing = true;
    this.previewSubject.next();
  }

  updatePreview(): void {
    if (!this.selectedTemplate) {
      this.isSyncing = false;
      return;
    }

    this.templateService.getPreview(this.selectedTemplate.bodyHtml, this.dummyData).subscribe({
      next: (html) => {
        this.previewHtml = this.sanitizer.bypassSecurityTrustHtml(html);
        setTimeout(() => this.isSyncing = false, 500);
      },
      error: (err) => {
        console.error('Erreur preview', err);
        this.isSyncing = false;
      }
    });
  }

  // Sidebar Helpers
  isTemplateSelected(id: any): boolean {
    return this.selectedTemplate?.id === id;
  }

  // --- Notification Template Actions ---

  editNotification(nt: NotificationTemplate): void {
    this.editingNotification = { ...nt };
    const rawText = nt.template || '';
    this.notificationEditContent = rawText;

    setTimeout(() => {
      if (this.editorRef) {
        this.editorRef.nativeElement.innerHTML = this.parseTextToHtml(rawText);
      }
    }, 0);

    this.activeTab = 'notification';
  }

  onEditorChange(): void {
    this.isSyncing = true;
    this.previewSubject.next();
  }

  insertVariable(varName: string): void {
    if (!this.editorRef) return;

    const badgeHtml = `<span class="variable-badge" contenteditable="false" data-var="${varName}">\${${varName}}</span>&nbsp;`;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!this.editorRef.nativeElement.contains(range.commonAncestorContainer)) {
      this.editorRef.nativeElement.focus();
    }

    const fragment = range.createContextualFragment(badgeHtml);
    range.deleteContents();
    range.insertNode(fragment);

    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);

    this.onEditorChange();
  }

  cancelEditNotification(): void {
    this.editingNotification = null;
    this.notificationEditContent = '';
  }

  saveNotificationTemplate(): void {
    if (!this.editingNotification) return;

    const serialized = this.serializeEditorHtml();
    if (!serialized || serialized.trim() === '') {
      this.alertService.error('Le message du modèle ne peut pas être vide.');
      return;
    }

    const updatedTemplate: NotificationTemplate = {
      ...this.editingNotification,
      template: serialized
    };

    this.templateService.updateNotificationTemplate(updatedTemplate.id, updatedTemplate).subscribe({
      next: (saved) => {
        const index = this.notificationTemplates.findIndex(x => x.id === saved.id);
        if (index > -1) {
          this.notificationTemplates[index] = saved;
        }
        this.alertService.success('Modèle de notification mis à jour avec succès');
        this.cancelEditNotification();
      },
      error: (err) => {
        this.alertService.error('Erreur lors de la mise à jour du modèle');
        console.error(err);
      }
    });
  }

  private parseTextToHtml(text: string): string {
    // Replace ${var} with a protected span badge
    return text.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return `<span class="variable-badge" contenteditable="false" data-var="${varName}">${match}</span>`;
    });
  }

  private serializeEditorHtml(): string {
    if (!this.editorRef) return '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = this.editorRef.nativeElement.innerHTML;

    // Convert spans back to text
    const badges = tempDiv.querySelectorAll('.variable-badge');
    badges.forEach(badge => {
      const varName = badge.getAttribute('data-var');
      badge.replaceWith(`\${${varName}}`);
    });

    // Cleanup HTML entities
    return tempDiv.innerText.replace(/\u00a0/g, ' ');
  }
}
