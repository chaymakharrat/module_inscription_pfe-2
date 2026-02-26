import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="mb-6">
      <label class="block text-sm font-bold text-slate-700 mb-3 ml-1">
        {{label}}
        <span *ngIf="required" class="text-blue-500 ml-1">*</span>
      </label>

      <div *ngIf="!file; else previewTpl"
           (dragover)="onDragOver($event)"
           (dragleave)="onDragLeave($event)"
           (drop)="onDrop($event)"
           (click)="fileInput.click()"
           [class]="'border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all duration-300 ' + 
                    (isDragActive ? 'border-blue-500 bg-blue-50/50 scale-[1.02] shadow-xl' : 'border-slate-200 bg-slate-50/30 hover:border-blue-400 hover:bg-white hover:shadow-lg hover:-translate-y-1')"
      >
        <input #fileInput type="file" [accept]="accept" (change)="onFileSelected($event)" class="hidden">
        
        <div class="transition-transform duration-300" [style.transform]="isDragActive ? 'translateY(-8px)' : 'none'">
          <div class="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300">
            <svg class="h-10 w-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>

          <p class="mt-4 text-base font-medium text-gray-700">
            <ng-container *ngIf="isDragActive; else defaultText">
              📂 Déposez le fichier ici
            </ng-container>
            <ng-template #defaultText>
              <span class="text-blue-600 hover:text-blue-700">Cliquez pour parcourir</span> ou glissez-déposez
            </ng-template>
          </p>
          
          <p class="mt-2 text-sm text-gray-500">
            PDF, PNG, JPG jusqu'à 5MB
          </p>
        </div>
      </div>

      <ng-template #previewTpl>
        <div [@fadeInScale] class="border-2 border-green-200 rounded-xl p-4 bg-green-50 shadow-sm">
          <div class="flex items-start gap-4">
            <!-- Preview -->
            <div class="flex-shrink-0">
              <img *ngIf="preview; else noPreview" [src]="preview" alt="Preview" class="w-20 h-20 object-cover rounded-lg shadow-inner">
              <ng-template #noPreview>
                <div class="w-20 h-20 bg-gray-200 rounded-lg flex items-center justify-center">
                  <svg class="w-10 h-10 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm3 1h6v4H7V5zm6 6H7v2h6v-2z" clip-rule="evenodd" />
                  </svg>
                </div>
              </ng-template>
            </div>

            <!-- File info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium text-gray-900 truncate">{{file?.name}}</p>
                <div *ngIf="uploading" class="animate-spin text-blue-600">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <svg *ngIf="!uploading" class="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <p class="text-xs text-gray-500 mt-1">{{ fileSizeMB }} MB</p>

              <div *ngIf="uploading" class="mt-2 w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                <div class="bg-blue-600 h-1.5 rounded-full transition-all duration-1000" [style.width]="'100%'"></div>
              </div>
            </div>

            <!-- Actions -->
            <button type="button" (click)="removeFile()" class="flex-shrink-0 text-red-600 hover:text-red-700 p-2 hover:bg-red-50 rounded-full transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </ng-template>
    </div>
  `,
  animations: [
    trigger('fadeInScale', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.95)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ])
  ]
})
export class FileUploadComponent {
  @Input() label: string = '';
  @Input() required: boolean = false;
  @Input() accept: string = 'image/*,application/pdf';
  @Output() fileSelect = new EventEmitter<File>();

  file: File | null = null;
  preview: string | null = null;
  isDragActive = false;
  uploading = false;

  get fileSizeMB(): string {
    return this.file ? (this.file.size / (1024 * 1024)).toFixed(2) : '0';
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragActive = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragActive = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragActive = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  onFileSelected(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  private handleFile(selectedFile: File) {
    this.file = selectedFile;
    this.fileSelect.emit(selectedFile);

    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        this.preview = reader.result as string;
      };
      reader.readAsDataURL(selectedFile);
    } else {
      this.preview = null;
    }

    this.uploading = true;
    setTimeout(() => this.uploading = false, 1500);
  }

  removeFile() {
    this.file = null;
    this.preview = null;
    this.uploading = false;
    this.fileSelect.emit(null as any);
  }
}
