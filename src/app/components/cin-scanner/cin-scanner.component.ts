import {
  Component, Output, EventEmitter, ElementRef, ViewChild, NgZone,
  AfterViewInit, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OcrCinResult, OcrService } from '../../services/ocr.service';

interface Point { x: number; y: number; }

type ScanState = 'idle' | 'framing' | 'scanning' | 'success' | 'error';

interface EditableResult {
  nom: string;
  prenom: string;
  numeroCin: string;
  dateNaissance: string;
  genre: 'HOMME' | 'FEMME' | null;
}

@Component({
  selector: 'app-cin-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="cin-scanner-wrapper">

  <input #cameraInput  type="file" accept="image/*" capture="environment" class="hidden" (change)="onFileSelected($event)" />
  <input #galleryInput type="file" accept="image/*"                        class="hidden" (change)="onFileSelected($event)" />
  <canvas #cropCanvas class="hidden"></canvas>

  <!-- ══════════ IDLE ══════════ -->
  <ng-container *ngIf="state === 'idle'">
    <div class="idle-card">
      <!-- Illustration de guidage -->
      <div class="guidance-illustration mb-4">
        <svg width="120" height="80" viewBox="0 0 120 80" fill="none" class="mx-auto">
          <rect x="10" y="10" width="100" height="60" rx="8" stroke="#3b82f6" stroke-width="2" stroke-dasharray="4 4"/>
          <rect x="30" y="25" width="60" height="35" rx="4" fill="#dbeafe" stroke="#3b82f6" stroke-width="1.5" class="animate-float-slow"/>
          <path d="M95 55L105 70M85 55L75 70" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>

      <div class="cin-icon-wrap">
        <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="2" y="5" width="20" height="14" rx="3" stroke-width="2"/>
          <path d="M7 10h10M7 14h5" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <p class="idle-title">Scan automatique de la CIN</p>
      <p class="idle-sub">
        Photographiez le recto de votre carte d'identité tunisienne<br/>
        et cadrez-la dans le guide — le formulaire se remplira automatiquement
      </p>
      <div class="idle-btns">
        <button type="button" class="btn-primary animate-pulse-slow" (click)="openCamera()">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          Caméra
        </button>
        <button type="button" class="btn-secondary" (click)="openGallery()">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          Galerie
        </button>
      </div>
      
      <!-- Mention Sécurité & Conseils -->
      <div class="security-assurance mt-4 p-3 rounded-xl border border-blue-50 bg-blue-50/30 flex items-center gap-2">
        <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
        </svg>
        <p class="text-[10px] font-bold text-blue-600/80 m-0">
          Vos données sont cryptées et ne sont jamais stockées sans votre accord.
        </p>
      </div>

      <p class="idle-tip">💡 Photo nette · Bonne luminosité · Sans reflets</p>
    </div>
  </ng-container>

  <!-- ══════════ FRAMING ══════════ -->
  <ng-container *ngIf="state === 'framing'">
    <p class="frame-hint">
      <svg class="w-3 h-3 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      ALIGNEMENT DE LA CARTE
    </p>
    <div class="viewport-wrap">
      <div #viewport class="viewport"
           (mousedown)="onPointerDown($event)"
           (mousemove)="onPointerMove($event)"
           (mouseup)="onPointerUp($event)"
           (mouseleave)="onPointerUp($event)"
           (touchstart)="onTouchStart($event)"
           (touchmove)="onTouchMove($event)"
           (touchend)="onTouchEnd($event)"
           (wheel)="onWheel($event)">

        <div class="img-layer" [style.transform]="imgTransform" [style.transformOrigin]="'center center'">
          <img #photoImg [src]="previewUrl" class="photo-img" draggable="false"/>
        </div>

        <svg class="mask-svg" [attr.width]="vpW" [attr.height]="vpH" [attr.viewBox]="'0 0 ' + vpW + ' ' + vpH">
          <defs>
            <mask id="cinHole">
              <rect width="100%" height="100%" fill="white"/>
              <rect [attr.x]="frameX" [attr.y]="frameY" [attr.width]="frameW" [attr.height]="frameH" rx="10" fill="black"/>
            </mask>
            <linearGradient id="scanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stop-color="#3b82f6" stop-opacity="0"/>
              <stop offset="50%"  stop-color="#60a5fa" stop-opacity="0.9"/>
              <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
            </linearGradient>
            <clipPath id="frameClip">
              <rect [attr.x]="frameX" [attr.y]="frameY" [attr.width]="frameW" [attr.height]="frameH" rx="10"/>
            </clipPath>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#cinHole)"/>
          <rect [attr.x]="frameX" [attr.y]="frameY" [attr.width]="frameW" [attr.height]="frameH"
                rx="10" fill="none" [attr.stroke]="alignmentGood ? '#4ade80' : '#3b82f6'" stroke-width="2.5"/>
          <g [attr.stroke]="alignmentGood ? '#4ade80' : '#60a5fa'" stroke-width="4" stroke-linecap="round" fill="none">
            <path [attr.d]="'M'+(frameX+3)+','+(frameY+20)+' L'+(frameX+3)+','+(frameY+3)+' L'+(frameX+20)+','+(frameY+3)"/>
            <path [attr.d]="'M'+(frameX+frameW-20)+','+(frameY+3)+' L'+(frameX+frameW-3)+','+(frameY+3)+' L'+(frameX+frameW-3)+','+(frameY+20)"/>
            <path [attr.d]="'M'+(frameX+3)+','+(frameY+frameH-20)+' L'+(frameX+3)+','+(frameY+frameH-3)+' L'+(frameX+20)+','+(frameY+frameH-3)"/>
            <path [attr.d]="'M'+(frameX+frameW-20)+','+(frameY+frameH-3)+' L'+(frameX+frameW-3)+','+(frameY+frameH-3)+' L'+(frameX+frameW-3)+','+(frameY+frameH-20)"/>
          </g>
          <line clip-path="url(#frameClip)"
                [attr.x1]="frameX+8" [attr.x2]="frameX+frameW-8"
                [attr.y1]="scanLineY" [attr.y2]="scanLineY"
                stroke="url(#scanGrad)" stroke-width="2"/>

          <!-- Grille des champs OCR (toggle 🗺) -->
          <g *ngIf="showFieldGuide" clip-path="url(#frameClip)">
            <ng-container *ngFor="let z of CIN_FIELD_ZONES">
              <rect [attr.x]="frameX + z.x[0]/100*frameW"
                    [attr.y]="frameY + z.y[0]/100*frameH"
                    [attr.width]="(z.x[1]-z.x[0])/100*frameW"
                    [attr.height]="(z.y[1]-z.y[0])/100*frameH"
                    [attr.stroke]="z.color" stroke-width="1.2" fill="none"
                    opacity="0.7" rx="2"/>
              <text [attr.x]="frameX + z.x[0]/100*frameW + 4"
                    [attr.y]="frameY + z.y[0]/100*frameH + 10"
                    [attr.fill]="z.color"
                    font-size="8" font-weight="bold" font-family="monospace">{{ z.label }}</text>
            </ng-container>
          </g>
        </svg>

        <div class="align-badge" [class.good]="alignmentGood">
          <svg *ngIf="!alignmentGood" class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <svg *ngIf="alignmentGood" class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
          </svg>
          <span *ngIf="alignmentGood">Alignement optimal</span>
        </div>
      </div>

      <div class="ctrl-bar">
        <div class="ctrl-group">
          <button class="ctrl-btn" (click)="adjustZoom(-0.12)">−</button>
          <input type="range" min="0.2" max="5" step="0.05" [value]="scale" (input)="onZoomSlider($event)" class="zoom-slider"/>
          <button class="ctrl-btn" (click)="adjustZoom(0.12)">+</button>
        </div>
        <div class="ctrl-sep"></div>
        <div class="ctrl-group">
          <button class="ctrl-btn" (click)="rotate(-90)" title="Tourner gauche">⟲</button>
          <button class="ctrl-btn" (click)="rotate(90)"  title="Tourner droite">⟳</button>
        </div>
        <div class="ctrl-sep"></div>
        <button class="ctrl-btn guide-btn"
                [class.active]="showFieldGuide"
                (click)="showFieldGuide = !showFieldGuide"
                title="Afficher les zones OCR">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
          </svg>
        </button>
        <span class="zoom-val">{{ (scale*100)|number:'1.0-0' }}%</span>
      </div>
    </div>

    <div class="frame-btns">
      <button type="button" class="btn-ghost" (click)="resetFrame()">
        <svg class="w-3 h-3 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        Réinitialiser
      </button>
      <button type="button" class="btn-ghost" (click)="openGallery()">
        <svg class="w-3 h-3 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        Autre photo
      </button>
      <button type="button" class="btn-analyze" (click)="analyzePhoto()">
        <svg class="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        Analyser
      </button>
    </div>
    <p class="idle-tip">
      <svg *ngIf="alignmentGood" class="w-3 h-3 mr-1 inline text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
      </svg>
      {{ alignmentGood ? 'Prêt — cliquez sur Analyser' : 'Glissez · Pincez · Molette pour ajuster' }}
    </p>
  </ng-container>

  <!-- ══════════ SCANNING ══════════ -->
  <ng-container *ngIf="state === 'scanning'">
    <div class="scanning-wrap">
      <div class="scan-preview-wrap">
        <img *ngIf="croppedPreviewUrl" [src]="croppedPreviewUrl" class="scan-preview-img"/>
        <div class="scan-overlay">
          <div *ngFor="let z of CIN_FIELD_ZONES; let i = index"
               class="zone-hl"
               [class.pending]="currentZoneIdx < i"
               [class.active]="currentZoneIdx === i"
               [class.done]="currentZoneIdx > i"
               [style.left.%]="z.x[0]" [style.top.%]="z.y[0]"
               [style.width.%]="z.x[1] - z.x[0]" [style.height.%]="z.y[1] - z.y[0]"
               [style.--zc]="z.color">
            <span class="zone-lbl" *ngIf="currentZoneIdx === i">{{ z.label }}</span>
          </div>
        </div>
        <div class="scan-center">
          <div class="scan-spinner"></div>
          <p class="scan-txt">{{ scanLabel }}</p>
        </div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" [style.width.%]="((currentZoneIdx+1) / CIN_FIELD_ZONES.length)*100"></div>
      </div>
    </div>
  </ng-container>

  <ng-container *ngIf="state === 'success'">
    <div class="result-card">
      <div class="result-header">
        <div class="result-icon">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
          </svg>
        </div>
        <div class="rh-text">
          <p class="result-title">CIN lue — Vérifiez et corrigez si besoin</p>
          <p class="result-sub">Le formulaire a été pré-rempli avec les données extraites.</p>
        </div>
        <button type="button" class="btn-restart" (click)="reset()">
          <svg class="w-3 h-3 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Recommencer
        </button>
      </div>
      <div class="fields-grid">
        <!-- PRÉNOM -->
        <div class="field-group">
          <label>Prénom <span class="field-ar">الاسم</span></label>
          <div class="field-input-row">
            <input type="text" [(ngModel)]="editableResult.prenom" dir="rtl" placeholder="الاسم"/>
          </div>
        </div>

        <!-- NOM -->
        <div class="field-group">
          <label>Nom <span class="field-ar">اللقب</span></label>
          <div class="field-input-row">
            <input type="text" [(ngModel)]="editableResult.nom" dir="rtl" placeholder="اللقب"/>
          </div>
        </div>

        <!-- N° CIN -->
        <div class="field-group">
          <label>N° CIN</label>
          <div class="field-input-row">
            <input type="text" [(ngModel)]="editableResult.numeroCin" maxlength="8" placeholder="12345678" class="tracking" readonly/>
          </div>
        </div>

        <!-- DATE -->
        <div class="field-group">
  <label>Date de naissance</label>
  <div class="field-input-row">
    <input type="date" 
           [(ngModel)]="editableResult.dateNaissance"
           (change)="onDateNaissanceChange()"
           [max]="maxDateNaissance"/>
  </div>
</div>
<!-- ✅ Message erreur âge — juste avant le bouton confirmer -->
<div *ngIf="ageError"
     style="margin-bottom:10px; padding:10px 14px; background:#fff5f5; 
            border:2px solid #fecaca; border-radius:12px; 
            display:flex; align-items:center; gap:8px;">
  <span style="font-size:16px;">⛔</span>
  <p style="margin:0; font-size:12px; font-weight:700; color:#dc2626;">{{ ageError }}</p>
</div>

        <!-- GENRE -->
        <div class="field-group">
          <label>Genre</label>
          <div class="field-input-row genre-row">
            <div class="genre-toggle">
              <button type="button" [class.active]="editableResult.genre==='HOMME'" (click)="editableResult.genre='HOMME'">HOMME</button>
              <button type="button" [class.active]="editableResult.genre==='FEMME'" (click)="editableResult.genre='FEMME'">FEMME</button>
            </div>
          </div>
        </div>

      </div>

      <button type="button" class="btn-confirm" (click)="confirmAndFill()">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
        </svg>
        CONFIRMER ET REMPLIR LE FORMULAIRE
      </button>
    </div>
  </ng-container>

  <!-- ══════════ ERROR ══════════ -->
  <ng-container *ngIf="state === 'error'">
    <div class="error-card">
      <div class="error-icon">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </div>
      <div>
        <p class="error-title">Échec de la lecture</p>
        <p class="error-msg">{{ errorMessage }}</p>
      </div>
      <button type="button" class="btn-restart" (click)="reset()">Réessayer</button>
    </div>
  </ng-container>

</div>
  `,
  styles: [`
    .cin-scanner-wrapper {
      font-family: 'Segoe UI', system-ui, sans-serif;
      max-width: 520px; margin: 0 auto 2rem;
    }
    .hidden { display: none !important; }

    /* ── IDLE ── */
    .idle-card {
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      border: none; border-radius: 20px;
      background: #f8fafc; padding: 32px 24px; text-align: center;
    }
    .cin-icon-wrap {
      width: 64px; height: 64px; border-radius: 16px;
      background: #dbeafe; color: #2563eb;
      display: flex; align-items: center; justify-content: center;
    }
    .idle-title { font-weight: 900; font-size: 15px; color: #1e293b; margin: 0; }
    .idle-sub   { font-size: 12px; color: #64748b; margin: 0; line-height: 1.5; }
    .idle-tip   { font-size: 10px; color: #94a3b8; margin: 6px 0 0; text-align: center; }
    .idle-btns  { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }

    /* ── Buttons ── */
    .btn-primary {
      display: flex; align-items: center; justify-content: center;
      padding: 10px 24px; background: #2563eb; color: #fff;
      border: none; border-radius: 12px; font-weight: 800; font-size: 13px;
      letter-spacing: .02em; cursor: pointer; transition: all .2s;
    }
    .btn-primary:hover { background: #1d4ed8; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(37,99,235,0.2); }
    .btn-secondary {
      display: flex; align-items: center; justify-content: center;
      padding: 10px 24px; background: white; color: #475569;
      border: 1.5px solid #e2e8f0; border-radius: 12px; font-weight: 800; font-size: 13px;
      cursor: pointer; transition: all .2s;
    }
    .btn-secondary:hover { background: #f8fafc; border-color: #cbd5e1; }
    .btn-ghost {
      padding: 10px 16px; background: transparent; color: #475569;
      border: 2px solid #e2e8f0; border-radius: 12px;
      font-weight: 700; font-size: 11px; cursor: pointer; transition: all .2s;
    }
    .btn-ghost:hover { border-color: #94a3b8; background: #f8fafc; }
    .btn-analyze {
      flex: 1; padding: 10px 20px; background: #16a34a; color: #fff;
      border: none; border-radius: 12px; font-weight: 900; font-size: 12px;
      letter-spacing: .08em; cursor: pointer; transition: all .2s;
    }
    .btn-analyze:hover:not(:disabled) { background: #15803d; }
    .btn-analyze:disabled { background: #86efac; cursor: not-allowed; opacity: .65; }
    .btn-confirm {
      width: 100%; padding: 14px; background: #2563eb; color: #fff;
      border: none; border-radius: 14px; font-weight: 900; font-size: 13px;
      letter-spacing: .02em; cursor: pointer; display: flex; align-items: center;
      justify-content: center; gap: 8px; transition: all 0.2s; margin-top: 4px;
    }
    .btn-confirm:hover { background: #1d4ed8; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(37,99,235,0.2); }
    .btn-restart {
      padding: 6px 12px; background: transparent; border: none;
      color: #94a3b8; font-size: 11px; font-weight: 700; cursor: pointer;
      text-decoration: underline; white-space: nowrap; flex-shrink: 0;
    }

    /* ── RESCAN BUTTON (inline per field) ── */
    .btn-rescan {
      width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0;
      border: 2px solid #e2e8f0; background: #f8fafc;
      font-size: 14px; cursor: pointer; display: flex; align-items: center;
      justify-content: center; transition: all .2s; padding: 0;
    }
    .btn-rescan:hover {
      border-color: #f59e0b; background: #fffbeb;
      transform: scale(1.1);
    }
    .field-input-row {
      display: flex; gap: 6px; align-items: center;
    }
    .field-input-row input,
    .field-input-row .genre-toggle {
      flex: 1;
    }
    .genre-row { align-items: center; }
    .field-rescan-active {
      animation: rescan-pulse 0.5s ease-out;
    }
    @keyframes rescan-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(245,158,11,0.4); }
      70%  { box-shadow: 0 0 0 8px rgba(245,158,11,0); }
      100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
    }

    /* ── FRAMING ── */
    .frame-hint {
      text-align: center; font-size: 12px; font-weight: 800;
      color: #2563eb; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 10px;
    }
    .viewport-wrap { position: relative; }
    .viewport {
      position: relative; width: 100%; aspect-ratio: 1.585;
      background: #0f172a; border-radius: 16px; overflow: hidden;
      cursor: grab; user-select: none; touch-action: none;
    }
    .viewport:active { cursor: grabbing; }
    .img-layer {
      position: absolute; top: 0; left: 0; will-change: transform; pointer-events: none;
    }
    .photo-img { display: block; max-width: none; pointer-events: none; user-select: none; }
    .mask-svg  { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
    .align-badge {
      position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,.7); backdrop-filter: blur(6px);
      border-radius: 20px; padding: 5px 14px;
      font-size: 11px; font-weight: 700; color: #fbbf24;
      white-space: nowrap; pointer-events: none; transition: color .3s;
    }
    .align-badge.good { color: #4ade80; }

    .ctrl-bar {
      display: flex; align-items: center; gap: 8px;
      margin-top: 10px; padding: 8px 12px;
      background: #f1f5f9; border-radius: 12px;
    }
    .ctrl-group { display: flex; align-items: center; gap: 5px; }
    .ctrl-sep   { width: 1px; height: 20px; background: #cbd5e1; }
    .ctrl-btn {
      min-width: 28px; height: 28px; padding: 0 8px;
      border-radius: 8px; border: 1px solid #e2e8f0;
      background: #fff; color: #334155; font-size: 15px; font-weight: 800;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: all .15s;
    }
    .ctrl-btn:hover { background: #e2e8f0; }
    .ctrl-btn.active { background: #dbeafe; border-color: #3b82f6; color: #2563eb; }
    .zoom-slider { flex: 1; accent-color: #2563eb; cursor: pointer; min-width: 70px; }
    .zoom-val { font-size: 11px; font-weight: 700; color: #475569; min-width: 36px; text-align: right; margin-left: auto; }
    .frame-btns { display: flex; gap: 8px; margin-top: 10px; }

    /* ── SCANNING ── */
    .scanning-wrap { display: flex; flex-direction: column; gap: 12px; }
    .scan-preview-wrap {
      position: relative; width: 100%; aspect-ratio: 1.585;
      border-radius: 16px; overflow: hidden; background: #0f172a;
    }
    .scan-preview-img { width: 100%; height: 100%; object-fit: cover; opacity: .28; }
    .scan-overlay { position: absolute; inset: 0; }
    .zone-hl {
      position: absolute; border-radius: 4px;
      transition: all .35s ease; pointer-events: none; border: 2px solid transparent;
    }
    .zone-hl.pending { opacity: 0; }
    .zone-hl.active {
      background: color-mix(in srgb, var(--zc) 18%, transparent);
      border-color: var(--zc); opacity: 1;
    }
    .zone-hl.done { background: rgba(74,222,128,.1); border-color: #4ade80; opacity: 1; }
    .zone-lbl {
      position: absolute; top: 2px; left: 4px;
      font-size: 8px; font-weight: 900; color: var(--zc);
      white-space: nowrap; font-family: monospace;
    }


    .scan-center {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
    }
    .scan-spinner {
      width: 42px; height: 42px;
      border: 4px solid rgba(255,255,255,.15);
      border-top-color: #60a5fa; border-radius: 50%;
      animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .scan-txt { font-size: 13px; font-weight: 800; color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,.6); }
    .progress-bar { width: 100%; height: 4px; background: #dbeafe; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; background: #2563eb; border-radius: 4px; transition: width .45s ease; }

    /* ── REFINED ANIMATIONS ── */
    @keyframes pulse-slow {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.2); }
      50% { transform: scale(1.02); box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
    }
    .animate-pulse-slow {
      animation: pulse-slow 2.5s infinite ease-in-out;
    }

    @keyframes float-slow {
      0%, 100% { transform: translateY(0) rotate(0); }
      50% { transform: translateY(-3px) rotate(1deg); }
    }
    .animate-float-slow {
      animation: float-slow 4s infinite ease-in-out;
    }

    .guidance-illustration { opacity: 0.8; }


    /* ── SUCCESS ── */
    .result-card {
      border: 1.5px solid #e2e8f0; border-radius: 20px;
      background: #f8fafc; padding: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.03);
    }
    .result-header {
      display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px;
    }
    .result-icon {
      width: 40px; height: 40px; border-radius: 12px; background: #fbbf24;
      font-size: 18px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .rh-text { flex: 1; }
    .result-title { font-size: 14px; font-weight: 900; color: #1e293b; margin: 0 0 2px; }
    .result-sub   { font-size: 10px; color: #64748b; margin: 0; }
    .field-ar     { font-size: 9px; color: #94a3b8; margin-left: 4px; }
    .fields-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .field-group  { display: flex; flex-direction: column; gap: 4px; }
    .field-group label {
      font-size: 10px; font-weight: 900; color: #64748b;
      text-transform: uppercase; letter-spacing: .07em;
    }
    .field-group input {
      padding: 9px 12px; border: 2px solid #e2e8f0; border-radius: 12px;
      font-size: 13px; font-weight: 700; color: #334155;
      background: #fff; outline: none; transition: border .2s; width: 100%; box-sizing: border-box;
    }
    .field-group input:focus { border-color: #3b82f6; }
    .field-group input.tracking { letter-spacing: .15em; font-family: monospace; }
    .genre-toggle { display: flex; gap: 6px; }
    .genre-toggle button {
      flex: 1; padding: 9px 0; border-radius: 12px; font-size: 11px; font-weight: 900;
      border: 2px solid #e2e8f0; background: #fff; color: #64748b; cursor: pointer; transition: all .2s;
    }
    .genre-toggle button.active { background: #2563eb; border-color: #2563eb; color: #fff; }

    /* ── ERROR ── */
    .error-card {
      display: flex; align-items: flex-start; gap: 14px;
      border: 2px solid #fecaca; border-radius: 16px; background: #fff5f5; padding: 16px;
    }
    .error-icon {
      width: 36px; height: 36px; border-radius: 10px; background: #ef4444;
      color: #fff; font-size: 16px; font-weight: 900;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .error-title { font-size: 13px; font-weight: 900; color: #dc2626; margin: 0 0 3px; }
    .error-msg   { font-size: 12px; color: #64748b; margin: 0; }
  `]
})
export class CinScannerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('cameraInput') cameraInput!: ElementRef<HTMLInputElement>;
  @ViewChild('galleryInput') galleryInput!: ElementRef<HTMLInputElement>;
  @ViewChild('cropCanvas') cropCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('viewport') viewport!: ElementRef<HTMLDivElement>;
  @ViewChild('photoImg') photoImg!: ElementRef<HTMLImageElement>;
  @Output() scanned = new EventEmitter<OcrCinResult>();

  // ═══════════════════════════════════════════════════════════════════════
  // ZONES — pour l'animation de scan global (5 zones affichées)
  // ═══════════════════════════════════════════════════════════════════════
  readonly CIN_FIELD_ZONES = [
    { key: 'cin', label: 'N° CIN (8 chiffres)', x: [20, 80], y: [22, 38], color: '#f59e0b' },
    { key: 'nom', label: 'اللقب (Nom)', x: [38, 98], y: [38, 55], color: '#3b82f6' },
    { key: 'prenom', label: 'الاسم (Prénom)', x: [38, 98], y: [53, 68], color: '#8b5cf6' },
    { key: 'genre', label: 'بن / بنت (Genre)', x: [15, 98], y: [65, 79], color: '#ec4899' },
    { key: 'date', label: 'تاريخ الولادة (Date)', x: [15, 98], y: [76, 90], color: '#10b981' },
  ];

  private readonly scanLabels = [
    'N° CIN (8 chiffres)…',
    'اللقب — Nom…',
    'الاسم — Prénom…',
    'بن / بنت — Genre…',
    'تاريخ الولادة — Date…',
  ];

  // ── State ──────────────────────────────────────────────────────────────
  state: ScanState = 'idle';
  previewUrl: string | null = null;
  croppedPreviewUrl: string | null = null;
  errorMessage = '';
  capturedFile: File | null = null;
  private croppedBlob: Blob | null = null; // stored for re-scan calls

  // ── Field guide toggle ────────────────────────────────────────────────
  showFieldGuide = false;

  // ── Transform image ───────────────────────────────────────────────────
  scale = 1;
  translateX = 0;
  translateY = 0;
  rotation = 0;
  vpW = 480;
  vpH = 303;
  private lastFile: File | null = null;
  ageError: string | null = null;

  get frameW() { return this.vpW * 0.82; }
  get frameH() { return this.frameW / 1.585; }
  get frameX() { return (this.vpW - this.frameW) / 2; }
  get frameY() { return (this.vpH - this.frameH) / 2; }

  get imgTransform() {
    return `translate(${this.translateX}px, ${this.translateY}px) translate(-50%, -50%) scale(${this.scale}) rotate(${this.rotation}deg)`;
  }

  get alignmentGood(): boolean {
    const img = this.photoImg?.nativeElement;
    if (!img?.naturalWidth) return false;
    const dispW = img.naturalWidth * this.scale;
    const dispH = img.naturalHeight * this.scale;
    const left = this.translateX - dispW / 2;
    const top = this.translateY - dispH / 2;
    return left <= this.frameX && top <= this.frameY &&
      left + dispW >= this.frameX + this.frameW &&
      top + dispH >= this.frameY + this.frameH;
  }

  // ── Interactions ───────────────────────────────────────────────────────
  private isDragging = false;
  private isPinching = false;
  private lastPointer: Point = { x: 0, y: 0 };
  private lastPinchDist = 0;

  // ── Animations ────────────────────────────────────────────────────────
  scanLineY = 0;
  currentZoneIdx = -1;
  scanLabel = '';
  private scanLineDir = 1;
  private scanLineInt: any;
  private scanInt: any;

  // ── Result ────────────────────────────────────────────────────────────
  editableResult: EditableResult = {
    nom: '', prenom: '', numeroCin: '',
    dateNaissance: '', genre: null
  };
  // ── Draw state ────────────────────────────────────────────────────────
  isDrawing = false;
  drawStart: Point = { x: 0, y: 0 };
  drawRect = { x: 0, y: 0, w: 0, h: 0 };
  drawField: keyof EditableResult | null = null;

  constructor(private ocrService: OcrService, private ngZone: NgZone) { }

  ngAfterViewInit() { this.startScanLine(); }
  ngOnDestroy() { clearInterval(this.scanInt); clearInterval(this.scanLineInt); }

  // ── Helpers ───────────────────────────────────────────────────────────

  // ── File / Camera ─────────────────────────────────────────────────────
  openCamera() { this.cameraInput.nativeElement.click(); }
  openGallery() { this.galleryInput.nativeElement.click(); }
  rotate(deg: number) { this.rotation = (this.rotation + deg) % 360; }

  onFileSelected(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.lastFile = file;  // ✅ STOCKER
    const r = new FileReader();
    r.onload = ev => {
      this.previewUrl = ev.target?.result as string;
      this.state = 'framing';
      setTimeout(() => this.fitImageToFrame(), 100);
    };
    r.readAsDataURL(file);
    (e.target as HTMLInputElement).value = '';
  }

  fitImageToFrame(): void {
    const img = this.photoImg?.nativeElement;
    if (!img?.naturalWidth) { setTimeout(() => this.fitImageToFrame(), 80); return; }
    const vp = this.viewport?.nativeElement;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    this.vpW = rect.width || 480;
    this.vpH = rect.height || this.vpW / 1.585;
    const minScale = Math.max(this.frameW / img.naturalWidth, this.frameH / img.naturalHeight) * 1.08;
    this.scale = minScale;
    this.translateX = this.vpW / 2;
    this.translateY = this.vpH / 2;
    this.rotation = 0;
  }

  resetFrame() { this.fitImageToFrame(); }

  // ── Scan line ─────────────────────────────────────────────────────────
  private startScanLine() {
    clearInterval(this.scanLineInt);
    this.scanLineY = this.frameY + 6;
    this.scanLineDir = 1;
    this.scanLineInt = setInterval(() => {
      this.scanLineY += 1.5 * this.scanLineDir;
      if (this.scanLineY >= this.frameY + this.frameH - 6) this.scanLineDir = -1;
      if (this.scanLineY <= this.frameY + 6) this.scanLineDir = 1;
    }, 16);
  }

  // ── Drag ──────────────────────────────────────────────────────────────
  onPointerDown(e: MouseEvent) { this.isDragging = true; this.lastPointer = { x: e.clientX, y: e.clientY }; }
  onPointerMove(e: MouseEvent) {
    if (!this.isDragging) return;
    this.translateX += e.clientX - this.lastPointer.x;
    this.translateY += e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
  }
  onPointerUp(_e: MouseEvent) { this.isDragging = false; }

  onWheel(e: WheelEvent) { e.preventDefault(); this.zoomAt(e.deltaY > 0 ? -0.08 : 0.08, e.offsetX, e.offsetY); }
  adjustZoom(delta: number) { this.zoomAt(delta, this.vpW / 2, this.vpH / 2); }
  onZoomSlider(e: Event) {
    const nv = parseFloat((e.target as HTMLInputElement).value);
    this.zoomAt(nv - this.scale, this.vpW / 2, this.vpH / 2);
  }
  private zoomAt(delta: number, px: number, py: number) {
    const ns = Math.min(5, Math.max(0.2, this.scale + delta));
    const r = ns / this.scale;
    this.translateX = px - r * (px - this.translateX);
    this.translateY = py - r * (py - this.translateY);
    this.scale = ns;
  }

  onTouchStart(e: TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1) { this.isDragging = true; this.isPinching = false; this.lastPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
    else if (e.touches.length === 2) { this.isDragging = false; this.isPinching = true; this.lastPinchDist = this.pinchDist(e); }
  }
  onTouchMove(e: TouchEvent) {
    e.preventDefault();
    if (this.isPinching && e.touches.length === 2) {
      const d = this.pinchDist(e);
      const vp = this.viewport?.nativeElement?.getBoundingClientRect();
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - (vp?.left ?? 0);
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - (vp?.top ?? 0);
      this.zoomAt((d - this.lastPinchDist) * 0.008, mx, my);
      this.lastPinchDist = d;
    } else if (this.isDragging && e.touches.length === 1) {
      this.translateX += e.touches[0].clientX - this.lastPointer.x;
      this.translateY += e.touches[0].clientY - this.lastPointer.y;
      this.lastPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }
  onTouchEnd(e: TouchEvent) {
    if (e.touches.length < 2) this.isPinching = false;
    if (e.touches.length === 0) this.isDragging = false;
  }
  private pinchDist(e: TouchEvent) {
    return Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  }

  // ── CROP + GLOBAL SCAN ────────────────────────────────────────────────
  analyzePhoto() {
    if (!this.lastFile || !this.previewUrl) return;
    this.cropAndSend();
  }

  private cropAndSend(): void {
    const img = this.photoImg?.nativeElement;
    if (!img) return;
    const canvas = this.cropCanvas.nativeElement;
    const outW = Math.max(1400, Math.round(this.frameW / this.scale));
    const outH = Math.round(outW / 1.585);
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
    const ratio = outW / this.frameW;
    ctx.translate(outW / 2, outH / 2);
    ctx.scale(ratio, ratio);
    ctx.translate(this.translateX - this.vpW / 2, this.translateY - this.vpH / 2);
    ctx.rotate(this.rotation * Math.PI / 180);
    ctx.scale(this.scale, this.scale);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2, img.naturalWidth, img.naturalHeight);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let imgData = ctx.getImageData(0, 0, outW, outH);
    imgData = this.autoContrast(imgData);
    imgData = this.sharpen(imgData, outW, outH);
    ctx.putImageData(imgData, 0, 0);
    this.croppedPreviewUrl = canvas.toDataURL('image/jpeg', 0.85);
    this.startScanAnimation();

    canvas.toBlob(blob => {
      if (!blob) { this.handleError('Recadrage impossible'); return; }
      // Store the cropped blob for future zone re-scans
      this.croppedBlob = blob;
      const file = new File([blob], 'cin_crop.jpg', { type: 'image/jpeg' });

      this.ocrService.scanCin(file).subscribe({
        next: res => this.ngZone.run(() => {
          clearInterval(this.scanInt);
          if (res.success) {
            this.state = 'success';
            this.editableResult = {
              nom: res.nom || '',
              prenom: res.prenom || '',
              numeroCin: res.numeroCin || '',
              dateNaissance: res.dateNaissance || '',
              genre: res.genre || null,
            };
          } else {
            this.handleError(res.errorMessage || 'Échec OCR');
          }
        }),
        error: () => this.ngZone.run(() => {
          clearInterval(this.scanInt);
          this.handleError('Service OCR indisponible (port 5050)');
        })
      });
    }, 'image/jpeg', 0.95);
  }

  private startScanAnimation() {
    this.state = 'scanning';
    this.currentZoneIdx = 0;
    this.scanLabel = this.scanLabels[0];
    let i = 0;
    this.scanInt = setInterval(() => {
      i++;
      if (i < this.scanLabels.length) { this.currentZoneIdx = i; this.scanLabel = this.scanLabels[i]; }
    }, 500);
  }


  // ── Error / Reset ─────────────────────────────────────────────────────
  private handleError(msg: string) {
    clearInterval(this.scanInt);
    this.state = 'error';
    this.errorMessage = msg;
  }

  // ── Getter : âge calculé ────────────────────────────────────────
  get studentAge(): number | null {
    const dateNaissance = this.editableResult.dateNaissance;
    if (!dateNaissance) return null;
    const today = new Date();
    const birth = new Date(dateNaissance);
    if (isNaN(birth.getTime())) return null;
    let age = today.getFullYear() - birth.getFullYear();
    const moisPasse = today.getMonth() > birth.getMonth()
      || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
    if (!moisPasse) age--;
    return age;
  }
  // ── Réinitialiser erreur si la date change ───────────────────────
  onDateNaissanceChange(): void {
    this.ageError = null;
  }
  confirmAndFill() {
    this.ageError = null;

    if (!this.editableResult.dateNaissance) {
      this.ageError = 'Veuillez saisir votre date de naissance.';
      return;
    }

    const age = this.studentAge;
    if (age === null) {
      this.ageError = 'Date de naissance invalide.';
      return;
    }

    if (age < 18) {
      this.ageError = `Âge détecté : ${age} an${age > 1 ? 's' : ''}. L'inscription requiert 18 ans minimum.`;
      return;
    }

    this.scanned.emit({
      success: true,
      nom: this.editableResult.nom || undefined,
      prenom: this.editableResult.prenom || undefined,
      numeroCin: this.editableResult.numeroCin || undefined,
      dateNaissance: this.editableResult.dateNaissance || undefined,
      genre: this.editableResult.genre || undefined,
      file: this.lastFile,
    } as any);
  }
  get maxDateNaissance(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  reset() {
    clearInterval(this.scanInt);
    this.state = 'idle';
    this.previewUrl = null;
    this.croppedPreviewUrl = null;
    this.capturedFile = null;
    this.croppedBlob = null;
    this.lastFile = null;  // ✅ AJOUTER
    this.errorMessage = '';
    this.currentZoneIdx = -1;
    this.showFieldGuide = false;
    this.scale = 1; this.translateX = 0; this.translateY = 0; this.rotation = 0;
    this.editableResult = { nom: '', prenom: '', numeroCin: '', dateNaissance: '', genre: null };
    this.ageError = null;  // ← ajouter
  }

  // ── Image preprocessing ───────────────────────────────────────────────
  private autoContrast(imgData: ImageData): ImageData {
    const d = imgData.data; const n = d.length;
    const lums: number[] = [];
    for (let i = 0; i < n; i += 4) lums.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    lums.sort((a, b) => a - b);
    const lo = lums[Math.floor(lums.length * 0.05)];
    const hi = lums[Math.floor(lums.length * 0.95)];
    if (hi === lo) return imgData;
    const range = hi - lo;
    for (let i = 0; i < n; i += 4)
      for (let c = 0; c < 3; c++)
        d[i + c] = Math.min(255, Math.max(0, Math.round((d[i + c] - lo) / range * 255)));
    return imgData;
  }

  private sharpen(imgData: ImageData, w: number, h: number): ImageData {
    const src = new Uint8ClampedArray(imgData.data); const dst = imgData.data;
    const k = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        let val = 0;
        for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++)
          val += src[((y + ky) * w + (x + kx)) * 4 + c] * k[(ky + 1) * 3 + (kx + 1)];
        dst[idx + c] = Math.min(255, Math.max(0, val));
      }
    }
    return imgData;
  }
}