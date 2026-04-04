import { Component, OnInit, OnDestroy } from '@angular/core';
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
    subject: 'Confirmation de Paiement - ITECH'
  };

  constructor(
    private templateService: EmailTemplateService,
    private sanitizer: DomSanitizer,
    private alertService: AlertService
  ) { }

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
    this.previewSubject.next();
  }

  updatePreview(): void {
    if (!this.selectedTemplate) return;

    this.templateService.getPreview(this.selectedTemplate.bodyHtml, this.dummyData).subscribe({
      next: (html) => {
        this.previewHtml = this.sanitizer.bypassSecurityTrustHtml(html);
      },
      error: (err) => console.error('Erreur preview', err)
    });
  }

  // --- Notification Template Actions ---

  editNotification(nt: NotificationTemplate): void {
    this.editingNotification = { ...nt };
    this.notificationEditContent = nt.template || '';
  }

  cancelEditNotification(): void {
    this.editingNotification = null;
    this.notificationEditContent = '';
  }

  saveNotificationTemplate(): void {
    if (!this.editingNotification) return;
    
    if (!this.notificationEditContent || this.notificationEditContent.trim() === '') {
      this.alertService.error('Le message du modèle ne peut pas être vide.');
      return;
    }

    const updatedTemplate: NotificationTemplate = {
      ...this.editingNotification,
      template: this.notificationEditContent
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
}
