import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditTemplateService, AuditServiceContext } from '../../services/audit-template.service';
import { AuditTemplate } from '../../models/audit-template.model';
import { AlertService } from '../../services/alert.service';

@Component({
  selector: 'app-audit-template-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit-template-editor.component.html',
  styleUrls: ['./audit-template-editor.component.css']
})
export class AuditTemplateEditorComponent implements OnInit {
  @ViewChild('editorRef') editorRef!: ElementRef;

  activeContext: AuditServiceContext = 'FINANCE-SERVICE';
  templates: AuditTemplate[] = [];
  selectedTemplate: AuditTemplate | null = null;

  isLoading: boolean = false;
  isSaving: boolean = false;

  // Mapping des variables pour l'aide contextuelle
  variableHints: { [key: string]: string[] } = {
    'REMISE_CREATE': ['Motif de la remise', 'Pourcentage'],
    'REMISE_UPDATE': ['Motif de la remise', 'Pourcentage'],
    'REMISE_ACTIVATE': ['Motif'],
    'REMISE_DEACTIVATE': ['Motif'],
    'REMISE_DELETE': ['Motif'],
    'REMISE_DECISION': ['Motif', 'ID Inscription', 'Statut'],
    'DEPT_CAPACITY_UPDATE': ['Nom Départ.', 'Capacité'],
    'DEPT_SCORE_UPDATE': ['Nom Départ.', 'Score Min.'],
    'DEPT_GROUP_SIZE_UPDATE': ['Nom Départ.', 'Taille Groupe'],
    'DEPT_STATUS_TOGGLE': ['Nom Départ.', 'Action'],
    'DIPLOME_STATUS_TOGGLE': ['Nom Diplôme', 'Action'],
    'DIPLOME_RESPONSABLE_TOGGLE': ['Nom Diplôme', 'Action'],
    'DIPLOME_VARIANT_UPDATE': ['Nom Diplôme', 'Nom Variante'],
    'TEACHER_ASSIGN': ['Nom Diplôme', 'Nom Enseignant'],
    'TEACHER_UPDATE': ['Nom Enseignant'],
    'PREREQUIS_UPDATE': ['Type Prérequis', 'ID Element']
  };

  // Mapping des noms expressifs pour l'affichage (Finance & Scolarité)
  templateNames: { [key: string]: string } = {
    // --- FINANCE ---
    'REMISE_CREATE': 'Création d\'une nouvelle remise',
    'REMISE_UPDATE': 'Modification des paramètres d\'une remise',
    'REMISE_ACTIVATE': 'Réactivation d\'une remise',
    'REMISE_DEACTIVATE': 'Désactivation d\'une remise',
    'REMISE_DELETE': 'Suppression d\'une remise',
    'REMISE_DECISION': 'Décision sur une demande de remise',

    // --- DÉPARTEMENTS / SCOLARITÉ ---
    'DEPT_CREATE': 'Création d\'un nouveau département',
    'DEPT_ACTIVATE': 'Réactivation d\'un département',
    'DEPT_DEACTIVATE': 'Désactivation d\'un département',

    'DIPLOME_RESP_CREATE': 'Création d\'un diplôme responsable',
    'DIPLOME_RESP_ACTIVATE': 'Réactivation d\'un diplôme responsable',
    'DIPLOME_RESP_DEACTIVATE': 'Désactivation d\'un diplôme responsable',

    'DIPLOME_VAR_CREATE': 'Création d\'une variante de diplôme',
    'DIPLOME_VAR_ACTIVATE': 'Réactivation d\'une variante de diplôme',
    'DIPLOME_VAR_DEACTIVATE': 'Désactivation d\'une variante de diplôme',

    'UPDATE_FEES': 'Mise à jour des frais d\'inscription',
    'UPDATE_SCORE': 'Ajustement du score minimal d\'admission',
    'UPDATE_CAPACITY': 'Ajustement de la capacité maximale d\'accueil',
    'UPDATE_GROUP_SIZE': 'Ajustement de la taille des groupes',

    'NIVEAU_CREATE': 'Création d\'un nouveau niveau d\'étude',
    'NIVEAU_ACTIVATE': 'Réactivation d\'un niveau d\'étude',
    'NIVEAU_DEACTIVATE': 'Désactivation d\'un niveau d\'étude',

    'ENSEIGNANT_CREATE': 'Création d\'un profil enseignant',
    'ENSEIGNANT_ASSIGN_GLOBAL': 'Affectation Responsable GLOBAL (par type)',
    'ENSEIGNANT_ASSIGN_SPECIFIC': 'Affectation Responsable SPÉCIFIQUE (par diplôme)',
    'ENSEIGNANT_REPLACE_TYPE': 'Remplacement de responsable par type',
    'ENSEIGNANT_REPLACE_DIPLOME': 'Remplacement de responsable par diplôme',
    'ENSEIGNANT_MIGRATE_GLOBAL': 'Migration vers le mode de gestion Global',

    'PREREQUIS_CREATE': 'Création d\'un prérequis système',
    'PREREQUIS_ACTIVATE': 'Réactivation d\'un prérequis système',
    'PREREQUIS_DEACTIVATE': 'Désactivation d\'un prérequis système',
    'PREREQUIS_LEVEL_ADD': 'Lien d\'un prérequis à un niveau spécifique',
    'PREREQUIS_LEVEL_ACTIVATE': 'Réactivation du lien prérequis-niveau',
    'PREREQUIS_LEVEL_DEACTIVATE': 'Désactivation du lien prérequis-niveau',

    'MIGRATION_LOG': 'Log de migration historique'
  };

  constructor(
    private auditService: AuditTemplateService,
    private alertService: AlertService
  ) { }

  ngOnInit(): void {
    this.loadTemplates();
  }

  switchContext(context: AuditServiceContext): void {
    if (this.activeContext === context) return;
    this.activeContext = context;
    this.selectedTemplate = null;
    this.loadTemplates();
  }

  loadTemplates(): void {
    this.isLoading = true;
    this.auditService.getAll(this.activeContext).subscribe({
      next: (data) => {
        this.templates = data;
        this.isLoading = false;
      },
      error: (err) => {
        this.alertService.error('Erreur lors du chargement des modèles');
        this.isLoading = false;
      }
    });
  }

  selectTemplate(tpl: AuditTemplate): void {
    this.selectedTemplate = { ...tpl };
    setTimeout(() => {
      this.initEditor(tpl.message);
    }, 0);
  }

  /**
   * ✅ Initialise l'éditeur avec des badges protégés pour les variables {n}
   */
  private initEditor(text: number | string): void {
    if (!this.editorRef) return;
    const msg = String(text);

    // Remplace {0}, {1}, etc. par des spans non-éditables
    const html = msg.replace(/\{(\d+)\}/g, (match, index) => {
      const hint = this.getHint(this.selectedTemplate?.code || '', index);
      return `<span class="variable-badge" 
                    contenteditable="false" 
                    data-index="${index}" 
                    title="Variable ${index} : ${hint}">
                {${index}}
              </span>`;
    });

    this.editorRef.nativeElement.innerHTML = html;
  }

  private getHint(code: string, index: string): string {
    const hints = this.variableHints[code];
    return (hints && hints[parseInt(index)]) ? hints[parseInt(index)] : 'Information dynamique';
  }

  /**
   * ✅ Sauvegarde le modèle en convertissant les badges en texte {n}
   */
  saveTemplate(): void {
    if (!this.selectedTemplate || !this.editorRef) return;

    const finalMessage = this.serializeEditor();

    // Validation : Vérifier si toutes les variables d'origine sont encore là
    const originalMatches = this.templates.find(t => t.id === this.selectedTemplate?.id)?.message.match(/\{(\d+)\}/g) || [];
    const finalMatches = finalMessage.match(/\{(\d+)\}/g) || [];

    if (originalMatches.length !== finalMatches.length) {
      this.alertService.error(`Erreur : Vous avez supprimé une variable obligatoire. Le modèle doit contenir ${originalMatches.length} variables.`);
      return;
    }

    this.isSaving = true;
    const updatedTemplate = { ...this.selectedTemplate, message: finalMessage };

    this.auditService.update(this.activeContext, updatedTemplate.id, updatedTemplate).subscribe({
      next: (saved) => {
        const index = this.templates.findIndex(t => t.id === saved.id);
        if (index > -1) this.templates[index] = saved;
        this.alertService.success('Modèle d\'audit mis à jour avec succès');
        this.isSaving = false;
      },
      error: (err) => {
        this.alertService.error('Erreur lors de la sauvegarde');
        this.isSaving = false;
      }
    });
  }

  private serializeEditor(): string {
    if (!this.editorRef || !this.editorRef.nativeElement) {
      return this.selectedTemplate?.message || '';
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = this.editorRef.nativeElement.innerHTML;

    // On remplace les spans badges par leur texte d'origine {n}
    const badges = tempDiv.querySelectorAll('.variable-badge');
    badges.forEach(badge => {
      const index = badge.getAttribute('data-index');
      badge.replaceWith(`{${index}}`);
    });

    return tempDiv.innerText.trim();
  }

  getPreview(): string {
    if (!this.selectedTemplate) return '';

    // Sécurité : si l'éditeur n'est pas prêt, on prend le message brut du template
    let preview = (this.editorRef && this.editorRef.nativeElement)
      ? this.serializeEditor()
      : this.selectedTemplate.message;

    const dummyValues = ['"Scolarité"', '10%', '"Département GL"', 'Informatique', 'Activé', '8', '15'];

    return preview.replace(/\{(\d+)\}/g, (match, index) => {
      return `<b class="text-blue-600">${dummyValues[parseInt(index)] || '...'}</b>`;
    });
  }
}
