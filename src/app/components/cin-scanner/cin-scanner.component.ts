import {
  Component, Output, EventEmitter, ElementRef, ViewChild, NgZone,
  AfterViewInit, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OcrCinResult, OcrService } from '../../services/ocr.service';

interface Point { x: number; y: number; }

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
      <div class="cin-icon-wrap">
        <svg width="44" height="44" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="2" y="5" width="20" height="14" rx="2.5" stroke-width="1.4"/>
          <circle cx="7.5" cy="11" r="2" stroke-width="1.4"/>
          <path d="M12 9h6M12 13h4" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </div>
      <p class="idle-title">Scan automatique de la CIN</p>
      <p class="idle-sub">
        Photographiez le recto de votre carte d'identité tunisienne<br/>
        et cadrez-la dans le guide — le formulaire se remplira automatiquement ✨
      </p>
      <div class="idle-btns">
        <button type="button" class="btn-primary"   (click)="openCamera()">📷 Caméra</button>
        <button type="button" class="btn-secondary" (click)="openGallery()">🖼️ Galerie</button>
      </div>
      <p class="idle-tip">💡 Photo nette · Bonne luminosité · Sans reflets</p>
    </div>
  </ng-container>

  <!-- ══════════ FRAMING ══════════ -->
  <ng-container *ngIf="state === 'framing'">
    <p class="frame-hint">📐 Alignez la CIN dans le cadre bleu</p>

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

        <!-- Image déplaçable -->
        <div class="img-layer"
             [style.transform]="imgTransform"
             [style.transformOrigin]="'center center'">
          <img #photoImg [src]="previewUrl" class="photo-img" draggable="false"/>
        </div>

        <!-- Masque + cadre guide SVG -->
        <svg class="mask-svg"
             [attr.width]="vpW" [attr.height]="vpH"
             [attr.viewBox]="'0 0 ' + vpW + ' ' + vpH">
          <defs>
            <mask id="cinHole">
              <rect width="100%" height="100%" fill="white"/>
              <rect [attr.x]="frameX" [attr.y]="frameY"
                    [attr.width]="frameW" [attr.height]="frameH"
                    rx="10" fill="black"/>
            </mask>
            <linearGradient id="scanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stop-color="#3b82f6" stop-opacity="0"/>
              <stop offset="50%"  stop-color="#60a5fa" stop-opacity="0.9"/>
              <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
            </linearGradient>
            <clipPath id="frameClip">
              <rect [attr.x]="frameX" [attr.y]="frameY"
                    [attr.width]="frameW" [attr.height]="frameH" rx="10"/>
            </clipPath>
          </defs>

          <!-- Fond sombre autour du cadre -->
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#cinHole)"/>

          <!-- Contour cadre (vert si aligné, bleu sinon) -->
          <rect [attr.x]="frameX" [attr.y]="frameY"
                [attr.width]="frameW" [attr.height]="frameH"
                rx="10" fill="none"
                [attr.stroke]="alignmentGood ? '#4ade80' : '#3b82f6'"
                stroke-width="2.5"/>

          <!-- Coins renforcés -->
          <g [attr.stroke]="alignmentGood ? '#4ade80' : '#60a5fa'"
             stroke-width="4" stroke-linecap="round" fill="none">
            <path [attr.d]="'M'+(frameX+3)+','+(frameY+20)+' L'+(frameX+3)+','+(frameY+3)+' L'+(frameX+20)+','+(frameY+3)"/>
            <path [attr.d]="'M'+(frameX+frameW-20)+','+(frameY+3)+' L'+(frameX+frameW-3)+','+(frameY+3)+' L'+(frameX+frameW-3)+','+(frameY+20)"/>
            <path [attr.d]="'M'+(frameX+3)+','+(frameY+frameH-20)+' L'+(frameX+3)+','+(frameY+frameH-3)+' L'+(frameX+20)+','+(frameY+frameH-3)"/>
            <path [attr.d]="'M'+(frameX+frameW-20)+','+(frameY+frameH-3)+' L'+(frameX+frameW-3)+','+(frameY+frameH-3)+' L'+(frameX+frameW-3)+','+(frameY+frameH-20)"/>
          </g>

          <!-- Ligne scan animée (clippée dans le cadre) -->
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

        <!-- Badge alignement -->
        <div class="align-badge" [class.good]="alignmentGood">
          <span *ngIf="!alignmentGood">⚠ Centrez la CIN dans le cadre</span>
          <span *ngIf="alignmentGood">✓ Bon alignement</span>
        </div>
      </div>

      <!-- Barre contrôles -->
      <div class="ctrl-bar">
        <div class="ctrl-group">
          <button class="ctrl-btn" (click)="adjustZoom(-0.12)">−</button>
          <input type="range" min="0.2" max="5" step="0.05"
                 [value]="scale" (input)="onZoomSlider($event)"
                 class="zoom-slider"/>
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
                title="Afficher les zones OCR">🗺</button>
        <span class="zoom-val">{{ (scale*100)|number:'1.0-0' }}%</span>
      </div>
    </div>

    <div class="frame-btns">
      <button type="button" class="btn-ghost"   (click)="resetFrame()">↺ Réinitialiser</button>
      <button type="button" class="btn-ghost"   (click)="openGallery()">🖼️ Autre photo</button>
      <button type="button" class="btn-analyze"
            
              (click)="analyzePhoto()">🔍 Analyser</button>
    </div>
    <p class="idle-tip">
      {{ alignmentGood
           ? '✅ Prêt — cliquez sur Analyser'
           : 'Glissez · Pincez · Molette pour ajuster' }}
    </p>
  </ng-container>

  <!-- ══════════ SCANNING ══════════ -->
  <ng-container *ngIf="state === 'scanning'">
    <div class="scanning-wrap">
      <div class="scan-preview-wrap">
        <img *ngIf="croppedPreviewUrl" [src]="croppedPreviewUrl" class="scan-preview-img"/>

        <!-- Zones animées — SYNCHRONISÉES avec CIN_ZONES de ocr_service.py -->
        <div class="scan-overlay">
          <div *ngFor="let z of CIN_FIELD_ZONES; let i = index"
               class="zone-hl"
               [class.pending]="currentZoneIdx < i"
               [class.active]="currentZoneIdx === i"
               [class.done]="currentZoneIdx > i"
               [style.left.%]="z.x[0]"
               [style.top.%]="z.y[0]"
               [style.width.%]="z.x[1] - z.x[0]"
               [style.height.%]="z.y[1] - z.y[0]"
               [style.--zc]="z.color">
            <span class="zone-lbl" *ngIf="currentZoneIdx === i">{{ z.label }}</span>
          </div>
        </div>

        <!-- Spinner -->
        <div class="scan-center">
          <div class="scan-spinner"></div>
          <p class="scan-txt">{{ scanLabel }}</p>
        </div>
      </div>

      <div class="progress-bar">
        <div class="progress-fill"
             [style.width.%]="((currentZoneIdx+1) / CIN_FIELD_ZONES.length)*100">
        </div>
      </div>
    </div>
  </ng-container>

  <!-- ══════════ SUCCESS ══════════ -->
  <ng-container *ngIf="state === 'success'">
    <div class="result-card" (click)="$event.stopPropagation()">
      <div class="result-header">
        <div class="result-icon">✏️</div>
        <div class="rh-text">
          <p class="result-title">CIN lue — Vérifiez et corrigez si besoin</p>
          <p class="result-sub">L'OCR peut faire des erreurs sur certains caractères arabes</p>
        </div>
        <button type="button" class="btn-restart" (click)="reset()">↺ Recommencer</button>
      </div>

      <div class="fields-grid">
        <div class="field-group">
          <label>Prénom <span class="field-ar">الاسم</span></label>
          <input type="text" [(ngModel)]="editableResult.prenom" dir="rtl" placeholder="الاسم"/>
        </div>
        <div class="field-group">
          <label>Nom <span class="field-ar">اللقب</span></label>
          <input type="text" [(ngModel)]="editableResult.nom" dir="rtl" placeholder="اللقب"/>
        </div>
        <div class="field-group">
          <label>N° CIN</label>
          <input type="text" [(ngModel)]="editableResult.numeroCin" maxlength="8"
                 placeholder="12345678" class="tracking"/>
        </div>
        <div class="field-group">
          <label>Date de naissance</label>
          <input type="date" [(ngModel)]="editableResult.dateNaissance"/>
        </div>
        <div class="field-group">
          <label>Genre</label>
          <div class="genre-toggle">
            <button type="button" [class.active]="editableResult.genre==='HOMME'"
                    (click)="editableResult.genre='HOMME'">HOMME</button>
            <button type="button" [class.active]="editableResult.genre==='FEMME'"
                    (click)="editableResult.genre='FEMME'">FEMME</button>
          </div>
        </div>
        <div class="field-group">
          <label>Ville <span class="field-ar">السكنى</span></label>
          <input type="text" [(ngModel)]="editableResult.adresse" dir="rtl" placeholder="Ville"/>
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
      <div class="error-icon">✕</div>
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
      border: 2px dashed #bfdbfe; border-radius: 20px;
      background: #f0f7ff; padding: 32px 24px; text-align: center;
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

    /* ── Boutons ── */
    .btn-primary {
      padding: 10px 24px; background: #2563eb; color: #fff;
      border: none; border-radius: 12px; font-weight: 800; font-size: 12px;
      letter-spacing: .08em; cursor: pointer; transition: background .2s;
    }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-secondary {
      padding: 10px 24px; background: #e2e8f0; color: #334155;
      border: none; border-radius: 12px; font-weight: 800; font-size: 12px;
      cursor: pointer; transition: background .2s;
    }
    .btn-secondary:hover { background: #cbd5e1; }
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
    .btn-analyze:hover:not(.disabled) { background: #15803d; }
    .btn-analyze.disabled { background: #86efac; cursor: not-allowed; opacity: .65; }
    .btn-confirm {
      width: 100%; padding: 14px; background: #16a34a; color: #fff;
      border: none; border-radius: 14px; font-weight: 900; font-size: 12px;
      letter-spacing: .1em; cursor: pointer; display: flex; align-items: center;
      justify-content: center; gap: 8px; transition: background .2s; margin-top: 4px;
    }
    .btn-confirm:hover { background: #15803d; }
    .btn-restart {
      padding: 6px 12px; background: transparent; border: none;
      color: #94a3b8; font-size: 11px; font-weight: 700; cursor: pointer;
      text-decoration: underline; white-space: nowrap; flex-shrink: 0;
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
      position: absolute; top: 0; left: 0;
      will-change: transform; pointer-events: none;
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

    /* Barre contrôles */
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
    .ctrl-btn.active { background: #dbeafe; border-color: #3b82f6; }
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

    /* Zones animées avec couleur variable */
    .zone-hl {
      position: absolute; border-radius: 4px;
      transition: all .35s ease; pointer-events: none; border: 2px solid transparent;
    }
    .zone-hl.pending { opacity: 0; }
    .zone-hl.active {
      background: color-mix(in srgb, var(--zc) 18%, transparent);
      border-color: var(--zc); opacity: 1;
    }
    .zone-hl.done {
      background: rgba(74,222,128,.1); border-color: #4ade80; opacity: 1;
    }
    .zone-lbl {
      position: absolute; top: 2px; left: 4px;
      font-size: 8px; font-weight: 900;
      color: var(--zc); white-space: nowrap; font-family: monospace;
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
    .progress-bar {
      width: 100%; height: 4px; background: #dbeafe; border-radius: 4px; overflow: hidden;
    }
    .progress-fill {
      height: 100%; background: #2563eb; border-radius: 4px; transition: width .45s ease;
    }

    /* ── SUCCESS ── */
    .result-card {
      border: 2px solid #d1fae5; border-radius: 20px;
      background: #f0fdf4; padding: 20px;
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
      background: #fff; outline: none; transition: border .2s;
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
  // ZONES SYNCHRONISÉES avec ocr_service.py → CIN_ZONES
  // Si vous recalibrez dans calibrage-zones.html, mettez à jour ICI aussi.
  // ═══════════════════════════════════════════════════════════════════════
  readonly CIN_FIELD_ZONES = [
    // ── N° CIN : 8 chiffres, centré en haut de la carte ─────────────
    { key: 'cin', label: 'N° CIN (8 chiffres)', x: [20, 80], y: [22, 38], color: '#f59e0b' },
    // ── Zone texte droite : photo occupe ~0-38% en largeur ──────────
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

  // États
  state: 'idle' | 'framing' | 'scanning' | 'success' | 'error' = 'idle';
  previewUrl: string | null = null;
  croppedPreviewUrl: string | null = null;
  errorMessage = '';
  capturedFile: File | null = null;
  showFieldGuide = false;

  // Transform image
  scale = 1;
  translateX = 0;
  translateY = 0;
  rotation = 0;

  // Dimensions viewport
  vpW = 480;
  vpH = 303;

  // Cadre guide (82% de la largeur viewport, centré)
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

  // Interactions
  private isDragging = false;
  private isPinching = false;
  private lastPointer: Point = { x: 0, y: 0 };
  private lastPinchDist = 0;

  // Animations
  scanLineY = 0;
  currentZoneIdx = -1;
  scanLabel = '';
  private scanLineDir = 1;
  private scanLineInt: any;
  private scanInt: any;

  // Résultat éditable
  editableResult = {
    nom: '', prenom: '', numeroCin: '',
    dateNaissance: '', genre: null as 'HOMME' | 'FEMME' | null, adresse: ''
  };

  constructor(private ocrService: OcrService, private ngZone: NgZone) { }

  ngAfterViewInit() { this.startScanLine(); }
  ngOnDestroy() { clearInterval(this.scanInt); clearInterval(this.scanLineInt); }

  // ── Actions ──────────────────────────────────────
  openCamera() { this.cameraInput.nativeElement.click(); }
  openGallery() { this.galleryInput.nativeElement.click(); }
  rotate(deg: number) { this.rotation = (this.rotation + deg) % 360; }

  onFileSelected(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.capturedFile = file;
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
    // Zoom minimal pour que l'image couvre tout le cadre + petite marge
    const minScale = Math.max(
      this.frameW / img.naturalWidth,
      this.frameH / img.naturalHeight
    ) * 1.08;
    this.scale = minScale;
    this.translateX = this.vpW / 2;
    this.translateY = this.vpH / 2;
    this.rotation = 0;
  }

  resetFrame() { this.fitImageToFrame(); }

  // ── Scan line ────────────────────────────────────
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

  // ── Drag souris ──────────────────────────────────
  onPointerDown(e: MouseEvent) {
    this.isDragging = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
  }
  onPointerMove(e: MouseEvent) {
    if (!this.isDragging) return;
    this.translateX += e.clientX - this.lastPointer.x;
    this.translateY += e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
  }
  onPointerUp(_e: MouseEvent) { this.isDragging = false; }

  // ── Zoom molette ─────────────────────────────────
  onWheel(e: WheelEvent) {
    e.preventDefault();
    this.zoomAt(e.deltaY > 0 ? -0.08 : 0.08, e.offsetX, e.offsetY);
  }
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

  // ── Touch drag + pinch ────────────────────────────
  onTouchStart(e: TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1) {
      this.isDragging = true; this.isPinching = false;
      this.lastPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      this.isDragging = false; this.isPinching = true;
      this.lastPinchDist = this.pinchDist(e);
    }
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
    return Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }

  // ── Crop canvas + envoi OCR ──────────────────────
  analyzePhoto() {
    if (!this.capturedFile || !this.previewUrl) return;
    this.cropAndSend();
  }

  private cropAndSend(): void {
    const img = this.photoImg?.nativeElement;
    if (!img) return;
    const canvas = this.cropCanvas.nativeElement;

    // Résolution minimale 1400px (requis par ocr_service.py pour CLAHE + upscale)
    const outW = Math.max(1400, Math.round(this.frameW / this.scale));
    const outH = Math.round(outW / 1.585);
    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);

    // Reproduire exactement la CSS transform sur le canvas :
    // CSS : translate(tx,ty) translate(-50%,-50%) scale(s) rotate(r°)
    // Le centre du cadre dans le viewport = (vpW/2, vpH/2)
    // → on centre le canvas sur ce point, mis à l'échelle outW/frameW
    const ratio = outW / this.frameW;
    ctx.translate(outW / 2, outH / 2);
    ctx.scale(ratio, ratio);
    ctx.translate(this.translateX - this.vpW / 2, this.translateY - this.vpH / 2);
    ctx.rotate(this.rotation * Math.PI / 180);
    ctx.scale(this.scale, this.scale);
    ctx.drawImage(img,
      -img.naturalWidth / 2, -img.naturalHeight / 2,
      img.naturalWidth, img.naturalHeight);

    // ── Prétraitement image côté client ──────────────────────────────
    // 1. Auto-contrast : étire l'histogramme (percentiles 5%–95%)
    // 2. Sharpen : filtre de convolution 3×3 → lettres plus nettes
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform avant lecture pixels
    let imgData = ctx.getImageData(0, 0, outW, outH);
    imgData = this.autoContrast(imgData);
    imgData = this.sharpen(imgData, outW, outH);
    ctx.putImageData(imgData, 0, 0);
    // ─────────────────────────────────────────────────────────────────

    this.croppedPreviewUrl = canvas.toDataURL('image/jpeg', 0.85);
    this.startScanAnimation();

    canvas.toBlob(blob => {
      if (!blob) { this.handleError('Recadrage impossible'); return; }
      this.ocrService.scanCin(new File([blob], 'cin_crop.jpg', { type: 'image/jpeg' }))
        .subscribe({
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
                adresse: res.adresse || '',
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
      if (i < this.scanLabels.length) {
        this.currentZoneIdx = i;
        this.scanLabel = this.scanLabels[i];
      }
    }, 500);
  }

  private handleError(msg: string) {
    clearInterval(this.scanInt);
    this.state = 'error';
    this.errorMessage = msg;
  }

  // ── Prétraitement : Auto-contrast (percentile stretch 5%–95%) ─────
  private autoContrast(imgData: ImageData): ImageData {
    const d = imgData.data;
    const n = d.length;
    // Collecter les luminances
    const lums: number[] = [];
    for (let i = 0; i < n; i += 4) {
      lums.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    }
    lums.sort((a, b) => a - b);
    const lo = lums[Math.floor(lums.length * 0.05)];
    const hi = lums[Math.floor(lums.length * 0.95)];
    if (hi === lo) return imgData; // image déjà uniforme
    const range = hi - lo;
    for (let i = 0; i < n; i += 4) {
      for (let c = 0; c < 3; c++) {
        d[i + c] = Math.min(255, Math.max(0, Math.round((d[i + c] - lo) / range * 255)));
      }
    }
    return imgData;
  }

  // ── Prétraitement : Sharpen (convolution 3×3) ─────────────────────
  private sharpen(imgData: ImageData, w: number, h: number): ImageData {
    const src = new Uint8ClampedArray(imgData.data);
    const dst = imgData.data;
    // Kernel sharpen standard
    const k = [0, -1, 0,
      -1, 5, -1,
      0, -1, 0];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          let val = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const si = ((y + ky) * w + (x + kx)) * 4 + c;
              val += src[si] * k[(ky + 1) * 3 + (kx + 1)];
            }
          }
          dst[idx + c] = Math.min(255, Math.max(0, val));
        }
      }
    }
    return imgData;
  }

  confirmAndFill() {
    this.scanned.emit({
      success: true,
      nom: this.editableResult.nom || undefined,
      prenom: this.editableResult.prenom || undefined,
      numeroCin: this.editableResult.numeroCin || undefined,
      dateNaissance: this.editableResult.dateNaissance || undefined,
      genre: this.editableResult.genre || undefined,
      adresse: this.editableResult.adresse || undefined,
    });
  }

  reset() {
    clearInterval(this.scanInt);
    this.state = 'idle'; this.previewUrl = null;
    this.croppedPreviewUrl = null; this.capturedFile = null;
    this.errorMessage = ''; this.currentZoneIdx = -1;
    this.scale = 1; this.translateX = 0; this.translateY = 0; this.rotation = 0;
    this.editableResult = { nom: '', prenom: '', numeroCin: '', dateNaissance: '', genre: null, adresse: '' };
  }
}