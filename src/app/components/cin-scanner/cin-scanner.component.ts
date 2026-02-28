import {
  Component, Output, EventEmitter, ElementRef, ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { animate, style, transition, trigger } from '@angular/animations';
import { OcrCinResult, OcrService } from '../../services/ocr.service';

@Component({
  selector: 'app-cin-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cin-scanner.component.html',
  styleUrl: './cin-scanner.component.css',
  animations: [
    trigger('fadeSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-8px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-8px)' }))
      ])
    ])
  ]
})
export class CinScannerComponent {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @Output() scanned = new EventEmitter<OcrCinResult>();

  state: 'idle' | 'scanning' | 'success' | 'error' = 'idle';
  previewUrl: string | null = null;
  errorMessage = '';
  lastResult: OcrCinResult | null = null;

  // Résultat éditable — l'utilisateur peut corriger avant validation
  editableResult: {
    nom: string;
    prenom: string;
    numeroCin: string;
    dateNaissance: string;
    genre: 'HOMME' | 'FEMME' | null;
    adresse: string;
  } = { nom: '', prenom: '', numeroCin: '', dateNaissance: '', genre: null, adresse: '' };

  constructor(private ocrService: OcrService) { }

  triggerUpload(): void {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => this.previewUrl = e.target?.result as string;
    reader.readAsDataURL(file);

    this.state = 'scanning';
    this.errorMessage = '';

    this.ocrService.scanCin(file).subscribe({
      next: (result: OcrCinResult) => {
        if (result.success) {
          this.state = 'success';
          this.lastResult = result;
          // Pré-remplir les champs éditables
          this.editableResult = {
            nom: result.nom || '',
            prenom: result.prenom || '',
            numeroCin: result.numeroCin || '',
            dateNaissance: result.dateNaissance || '',
            genre: result.genre || null,
            adresse: result.adresse || ''
          };
        } else {
          this.state = 'error';
          this.errorMessage = result.errorMessage || 'Échec de la lecture. Réessayez avec une photo plus nette.';
        }
      },
      error: () => {
        this.state = 'error';
        this.errorMessage = 'Service OCR indisponible. Vérifiez que le service tourne sur le port 5050.';
      }
    });

    input.value = '';
  }

  // Appelé quand l'utilisateur clique "Confirmer"
  confirmAndFill(): void {
    const confirmed: OcrCinResult = {
      success: true,
      nom: this.editableResult.nom || undefined,
      prenom: this.editableResult.prenom || undefined,
      numeroCin: this.editableResult.numeroCin || undefined,
      dateNaissance: this.editableResult.dateNaissance || undefined,
      genre: this.editableResult.genre || undefined,
      adresse: this.editableResult.adresse || undefined,
    };
    this.scanned.emit(confirmed);
  }

  reset(): void {
    this.state = 'idle';
    this.previewUrl = null;
    this.errorMessage = '';
    this.lastResult = null;
    this.editableResult = { nom: '', prenom: '', numeroCin: '', dateNaissance: '', genre: null, adresse: '' };
  }
}