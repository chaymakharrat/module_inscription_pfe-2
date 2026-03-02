import {
  Component, EventEmitter, Output,
  ViewChild, ElementRef, signal, computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  OcrBulletinService,
  BulletinResult,
  UniteEnseignement,
  SemestreBulletin,
} from '../../services/ocr.bulletin.service';

export type { BulletinResult } from '../../services/ocr.bulletin.service';

type ScanState = 'idle' | 'loading' | 'success' | 'error';

@Component({
  selector: 'app-bulletin-scanner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bulletin-scanner.component.html',
  styleUrl: './bulletin-scanner.component.css',
})
export class BulletinScannerComponent {

  @Output() scanned = new EventEmitter<BulletinResult>();
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  // ── State ──────────────────────────────────────────────────────────────
  state = signal<ScanState>('idle');
  result = signal<BulletinResult | null>(null);
  preview = signal<string | null>(null);
  error = signal<string>('');
  isDragging = signal(false);

  isLoading = computed(() => this.state() === 'loading');
  isSuccess = computed(() => this.state() === 'success');
  isError = computed(() => this.state() === 'error');

  constructor(private ocrBulletinService: OcrBulletinService) { }

  // ── Drag & Drop ────────────────────────────────────────────────────────
  onDragOver(event: DragEvent): void { event.preventDefault(); this.isDragging.set(true); }
  onDragLeave(): void { this.isDragging.set(false); }
  onDrop(event: DragEvent): void {
    event.preventDefault(); this.isDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.processFile(file);
  }

  // ── File Input ─────────────────────────────────────────────────────────
  triggerFileInput(): void { this.fileInput.nativeElement.click(); }
  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.processFile(file);
    (event.target as HTMLInputElement).value = '';
  }

  // ── Core ───────────────────────────────────────────────────────────────
  private processFile(file: File): void {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(file.type)) {
      this.state.set('error');
      this.error.set('Format non supporté. Utilisez JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      this.state.set('error');
      this.error.set('Fichier trop volumineux (max 15 Mo).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => this.preview.set(e.target?.result as string);
    reader.readAsDataURL(file);

    this.state.set('loading');
    this.result.set(null);
    this.error.set('');

    this.ocrBulletinService.scanBulletin(file).subscribe({
      next: (res) => {
        if (res.success !== false) {
          this.state.set('success');
          this.result.set(res);
          this.scanned.emit(res);
        } else {
          this.state.set('error');
          this.error.set(res.errorMessage ?? 'Échec de l\'extraction OCR.');
        }
      },
      error: (err) => {
        this.state.set('error');
        this.error.set(
          err.status === 0
            ? 'Service OCR inaccessible (port 5053).'
            : `Erreur serveur (${err.status}).`
        );
      },
    });
  }

  reset(): void {
    this.state.set('idle');
    this.result.set(null);
    this.preview.set(null);
    this.error.set('');
  }

  // ── Template helpers ───────────────────────────────────────────────────

  /** Nombre total d'unités (tous semestres confondus) */
  getModuleCount(): number {
    const r = this.result();
    if (!r) return 0;
    return (r.semestres ?? []).reduce((acc, s) => acc + (s.unites?.length ?? 0), 0);
  }

  /** Semestres disponibles dans le résultat */
  getSemestres(): SemestreBulletin[] {
    return this.result()?.semestres ?? [];
  }

  /** Semestre 1 */
  getSemestre1(): SemestreBulletin | null {
    return this.result()?.semestres?.find(s =>
      s.nom?.toLowerCase().includes('1') ||
      s.nom?.toLowerCase().includes('premier')
    ) ?? null;
  }

  /** Semestre 2 */
  getSemestre2(): SemestreBulletin | null {
    return this.result()?.semestres?.find(s =>
      s.nom?.toLowerCase().includes('2') ||
      s.nom?.toLowerCase().includes('deux')
    ) ?? null;
  }

  /** Unités du semestre 1 */
  getSemestre1Unites(): UniteEnseignement[] {
    return this.getSemestre1()?.unites ?? [];
  }

  /** Unités du semestre 2 */
  getSemestre2Unites(): UniteEnseignement[] {
    return this.getSemestre2()?.unites ?? [];
  }

  /** Détermine si une unité a des sous-éléments */
  hasElements(unite: UniteEnseignement): boolean {
    return (unite.elements?.length ?? 0) > 0;
  }

  /** Couleur badge selon la moyenne */
  getMoyenneClass(moyenne: string | null | undefined): string {
    if (!moyenne) return '';
    const v = parseFloat(moyenne.replace(',', '.'));
    if (isNaN(v)) return '';
    if (v >= 16) return 'note-high';
    if (v >= 12) return 'note-medium';
    return 'note-low';
  }
}