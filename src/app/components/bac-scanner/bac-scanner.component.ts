import {
  Component, Output, EventEmitter, ElementRef, ViewChild,
  NgZone, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

export interface BacResult {
  success: boolean;
  nom?: string;
  prenom?: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  numDossier?: string;
  session?: string;
  mention?: string;
  specialite?: string;
  wilaya?: string;
  rawQr?: string;
  errorMessage?: string;
  file?: File | null;      // ✅ AJOUTER
  isManual?: boolean;
}

@Component({
  selector: 'app-bac-scanner',
  standalone: true,
  imports: [CommonModule],
  template: `
<div class="bac-wrapper">
  <input #fileInput type="file" accept="image/*" class="hidden" (change)="onFileSelected($event)"/>

  <!-- IDLE -->
  <ng-container *ngIf="state === 'idle'">
    <div class="idle-card">
      <div class="icon-wrap">🎓</div>
      <p class="idle-title">Scanner le diplôme de Bac</p>
      <p class="idle-sub">
        Photographiez le <strong>diplôme complet</strong> — le 2D-DOC est en bas à gauche<br/>
        <strong>100% fiable · Pas d'erreur OCR possible</strong>
      </p>
      <div class="idle-btns">
        <button type="button" class="btn-camera" (click)="startCamera()">📷 Caméra live</button>
        <button type="button" class="btn-gallery" (click)="fileInput.click()">🖼️ Galerie</button>
      </div>
      <p class="idle-tip">💡 Cadrez tout le diplôme, pas seulement le QR code</p>
    </div>
  </ng-container>

  <!-- CAMERA LIVE -->
  <ng-container *ngIf="state === 'camera'">
    <p class="frame-hint">🎯 Cadrez le code 2D-DOC dans le carré</p>
    <div class="camera-wrap">
      <video #videoEl class="camera-video" autoplay playsinline muted></video>
      <canvas #processCanvas class="hidden"></canvas>
      <div class="camera-overlay">
        <div class="qr-frame" [class.detected]="qrDetected">
          <div class="qr-c tl"></div><div class="qr-c tr"></div>
          <div class="qr-c bl"></div><div class="qr-c br"></div>
          <div class="scan-line" [class.stop]="qrDetected"></div>
        </div>
        <div class="cam-badge" [class.found]="qrDetected">
          <span *ngIf="!qrDetected">🔍 Cherche le 2D-DOC…</span>
          <span *ngIf="qrDetected">✅ Détecté !</span>
        </div>
      </div>
    </div>
    <div class="camera-btns">
      <button type="button" class="btn-ghost" (click)="stopCamera(); state='idle'">✕ Annuler</button>
      <button type="button" class="btn-ghost" (click)="stopCamera(); fileInput.click()">🖼️ Galerie</button>
    </div>
  </ng-container>

  <!-- LOADING -->
  <ng-container *ngIf="state === 'loading'">
    <div class="loading-card">
      <div class="loading-spinner"></div>
      <p class="loading-txt">Lecture du 2D-DOC…</p>
      <p class="loading-sub">Extraction des données officielles du Bac</p>
    </div>
  </ng-container>

  <!-- SUCCESS -->
  <ng-container *ngIf="state === 'success'">
    <div class="result-card">
      <div class="result-header">
        <span class="success-icon">🎓</span>
        <div>
          <p class="result-title">Données Bac extraites</p>
          <p class="result-sub">Certifiées par le 2D-DOC officiel</p>
        </div>
        <button type="button" class="btn-sm" (click)="reset()">↺</button>
      </div>

      <div class="data-list">
        <div class="data-item" *ngIf="result?.nom">
          <span class="dk">Nom</span>
          <span class="dv rtl">{{ result?.nom }}</span>
        </div>
        <div class="data-item" *ngIf="result?.prenom">
          <span class="dk">Prénom</span>
          <span class="dv rtl">{{ result?.prenom }}</span>
        </div>
        <div class="data-item" *ngIf="result?.dateNaissance">
          <span class="dk">Date naissance</span>
          <span class="dv">{{ result?.dateNaissance }}</span>
        </div>
        <div class="data-item" *ngIf="result?.lieuNaissance">
          <span class="dk">Lieu naissance</span>
          <span class="dv rtl">{{ result?.lieuNaissance }}</span>
        </div>
        <div class="data-item" *ngIf="result?.specialite">
          <span class="dk">Spécialité</span>
          <span class="dv">{{ result?.specialite }}</span>
        </div>
        <div class="data-item" *ngIf="result?.mention">
          <span class="dk">Mention</span>
          <span class="dv mention">{{ result?.mention }}</span>
        </div>
        <div class="data-item" *ngIf="result?.session">
          <span class="dk">Session</span>
          <span class="dv mono">{{ result?.session }}</span>
        </div>
        <div class="data-item" *ngIf="result?.numDossier">
          <span class="dk">N° dossier</span>
          <span class="dv mono">{{ result?.numDossier }}</span>
        </div>
        <div class="data-item" *ngIf="result?.wilaya">
          <span class="dk">Gouvernorat</span>
          <span class="dv rtl">{{ result?.wilaya }}</span>
        </div>
      </div>

      <details class="debug-section" *ngIf="result?.rawQr">
        <summary class="debug-toggle">🔧 QR brut (debug)</summary>
        <pre class="debug-raw">{{ result?.rawQr }}</pre>
      </details>

      <!-- <button type="button" class="btn-confirm" (click)="confirm()">
        ✓ UTILISER CES DONNÉES
      </button> -->
      <!-- <div class="flex items-center gap-2 mt-3 p-3 rounded-xl bg-green-50 border border-green-200">
  <span>✅</span>
  <p class="text-xs font-bold text-green-700">
    Données transmises automatiquement
  </p>
  <button type="button" class="ml-auto text-xs text-slate-400 hover:text-slate-600 font-bold" 
          (click)="reset()">
    ↺ Rescanner
  </button>
</div> -->
<div class="flex items-center gap-2 mt-3 p-3 rounded-xl"
     [ngClass]="result?.isManual ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'">
  <span>{{ result?.isManual ? '⚠️' : '✅' }}</span>
  <div class="flex-1">
    <p class="text-xs font-bold" [ngClass]="result?.isManual ? 'text-amber-700' : 'text-green-700'">
      <ng-container *ngIf="result?.success && !result?.isManual">
        Données transmises automatiquement
      </ng-container>
      <ng-container *ngIf="result?.isManual">
        QR illisible — document enregistré pour vérification
      </ng-container>
    </p>
    <p *ngIf="result?.isManual" class="text-xs text-amber-600 mt-0.5">
      💡 Pour un meilleur résultat : photographiez le diplôme entier avec bonne lumière, en cadrant bien le code 2D-DOC en bas à gauche.
    </p>
  </div>
  <button type="button" class="ml-auto text-xs text-slate-400 hover:text-slate-600 font-bold flex-shrink-0"
          (click)="reset()">
    ↺ Rescanner
  </button>
</div>
    </div>
  </ng-container>

  <!-- ERROR -->
  <!-- <ng-container *ngIf="state === 'error'">
    <div class="error-card">
      <p class="error-title">⚠️ {{ errorMessage }}</p>
      <p class="error-sub">
        Conseil : photographiez <strong>le diplôme entier</strong>, pas seulement le QR code.
        Bonne lumière, image nette.
      </p>
      <div class="idle-btns" style="margin-top:10px">
        <button type="button" class="btn-camera" (click)="startCamera()">📷 Réessayer</button>
        <button type="button" class="btn-gallery" (click)="reset()">Annuler</button>
      </div>
    </div>
  </ng-container> -->
  <ng-container *ngIf="state === 'error'">
  <div class="error-card">
    <p class="error-title">⚠️ {{ errorMessage }}</p>
    <p class="error-sub">
      QR code illisible ou absent sur ce diplôme.
    </p>
    <div class="idle-btns" style="margin-top:10px">
      <button type="button" class="btn-camera" (click)="startCamera()">📷 Réessayer</button>
      <button type="button" class="btn-gallery" (click)="fileInput.click()">🖼️ Autre photo</button>
    </div>

    <!-- ✅ AJOUTER : upload sans QR -->
    <div class="manual-upload-section">
      <div class="manual-divider">ou</div>
      <p class="manual-hint">
        📎 Votre diplôme n'a pas de QR code ?
      </p>
      <button type="button" class="btn-manual" (click)="manualInput.click()">
        Uploader le fichier sans scan QR
      </button>
      <input #manualInput type="file" accept="image/*,application/pdf"
             class="hidden" (change)="onManualUpload($event)"/>
      <p class="manual-note">
        ✅ Le fichier sera transmis — l'administration vérifiera le document.
      </p>
    </div>
  </div>
</ng-container>
</div>
  `,
  styles: [`
    .bac-wrapper { font-family:'Segoe UI',system-ui,sans-serif; max-width:500px; margin:0 auto 1.5rem; }
    .hidden { display:none !important; }

    /* IDLE */
    .idle-card {
      display:flex; flex-direction:column; align-items:center; gap:14px;
      border:2px dashed #fde68a; border-radius:20px;
      background:linear-gradient(135deg,#fffbeb,#fef9c3); padding:32px 24px; text-align:center;
    }
    .icon-wrap { font-size:42px; }
    .idle-title { font-size:15px; font-weight:900; color:#78350f; margin:0; }
    .idle-sub   { font-size:12px; color:#92400e; margin:0; line-height:1.7; }
    .idle-sub strong { color:#b45309; }
    .idle-tip   { font-size:10px; color:#fbbf24; margin:0; }
    .idle-btns  { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; width:100%; }
    .btn-camera {
      flex:1; padding:12px 20px; background:#d97706; color:#fff;
      border:none; border-radius:14px; font-weight:900; font-size:12px;
      letter-spacing:.07em; cursor:pointer; transition:all .2s;
    }
    .btn-camera:hover { background:#b45309; }
    .btn-gallery {
      padding:12px 20px; background:#f1f5f9; color:#475569;
      border:none; border-radius:14px; font-weight:800; font-size:12px; cursor:pointer;
    }

    /* CAMERA */
    .frame-hint { text-align:center; font-size:12px; font-weight:800; color:#d97706; margin-bottom:10px; }
    .camera-wrap { position:relative; width:100%; border-radius:18px; overflow:hidden; background:#000; aspect-ratio:4/3; }
    .camera-video { width:100%; height:100%; object-fit:cover; display:block; }
    .camera-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
    .qr-frame { position:relative; width:min(65%,220px); aspect-ratio:1; transition:all .3s; }
    .qr-frame.detected { transform:scale(1.05); }
    .qr-c { position:absolute; width:26px; height:26px; border-color:#fbbf24; border-style:solid; border-width:0; transition:border-color .3s; }
    .qr-frame.detected .qr-c { border-color:#4ade80; }
    .qr-c.tl { top:0; left:0; border-top-width:3px; border-left-width:3px; border-radius:6px 0 0 0; }
    .qr-c.tr { top:0; right:0; border-top-width:3px; border-right-width:3px; border-radius:0 6px 0 0; }
    .qr-c.bl { bottom:0; left:0; border-bottom-width:3px; border-left-width:3px; border-radius:0 0 0 6px; }
    .qr-c.br { bottom:0; right:0; border-bottom-width:3px; border-right-width:3px; border-radius:0 0 6px 0; }
    .scan-line { position:absolute; left:6px; right:6px; height:2px; background:linear-gradient(90deg,transparent,#fbbf24,transparent); animation:beam 1.8s ease-in-out infinite; }
    .scan-line.stop { animation:none; top:50%; background:linear-gradient(90deg,transparent,#4ade80,transparent); }
    @keyframes beam { 0%{top:4px} 50%{top:calc(100% - 4px)} 100%{top:4px} }
    .cam-badge { position:absolute; bottom:16px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,.7); backdrop-filter:blur(6px); border-radius:20px; padding:6px 16px; font-size:12px; font-weight:700; color:#fbbf24; white-space:nowrap; }
    .cam-badge.found { color:#4ade80; }
    .camera-btns { display:flex; gap:8px; margin-top:10px; }
    .btn-ghost { flex:1; padding:10px; background:transparent; color:#475569; border:2px solid #e2e8f0; border-radius:12px; font-weight:700; font-size:11px; cursor:pointer; }

    /* LOADING */
    .loading-card { display:flex; flex-direction:column; align-items:center; gap:14px; padding:40px 24px; text-align:center; border:2px solid #fde68a; border-radius:20px; background:#fffbeb; }
    .loading-spinner { width:48px; height:48px; border:4px solid #fde68a; border-top-color:#d97706; border-radius:50%; animation:spin .8s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .loading-txt { font-size:14px; font-weight:900; color:#d97706; margin:0; }
    .loading-sub { font-size:11px; color:#92400e; margin:0; }

    /* SUCCESS */
    .result-card { border:2px solid #fde68a; border-radius:20px; background:linear-gradient(135deg,#fffbeb,#f0fdf4); padding:20px; }
    .result-header { display:flex; align-items:flex-start; gap:12px; margin-bottom:16px; }
    .success-icon { font-size:28px; flex-shrink:0; }
    .result-title { font-size:14px; font-weight:900; color:#78350f; margin:0 0 2px; }
    .result-sub   { font-size:10px; color:#d97706; margin:0; }
    .btn-sm { padding:6px 10px; background:transparent; border:none; font-size:16px; color:#94a3b8; cursor:pointer; margin-left:auto; }
    .data-list { display:flex; flex-direction:column; gap:8px; margin-bottom:16px; }
    .data-item { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border-radius:12px; border:1px solid #fde68a; gap:12px; }
    .dk { font-size:10px; font-weight:900; color:#d97706; text-transform:uppercase; letter-spacing:.07em; flex-shrink:0; }
    .dv { font-size:14px; font-weight:700; color:#1e293b; text-align:right; }
    .dv.rtl { direction:rtl; font-family:'Segoe UI',Tahoma,sans-serif; }
    .dv.mono { font-family:monospace; letter-spacing:.1em; }
    .dv.mention { color:#16a34a; font-weight:900; }
    .debug-section { margin-bottom:14px; }
    .debug-toggle { font-size:11px; font-weight:700; color:#d97706; cursor:pointer; padding:6px 0; list-style:none; }
    .debug-raw { background:#1e1b4b; color:#a5b4fc; border-radius:10px; padding:12px; font-size:10px; margin:6px 0 0; white-space:pre-wrap; word-break:break-all; max-height:150px; overflow-y:auto; }
    .btn-confirm { width:100%; padding:13px; background:#d97706; color:#fff; border:none; border-radius:14px; font-weight:900; font-size:12px; letter-spacing:.1em; cursor:pointer; transition:background .2s; }
    .btn-confirm:hover { background:#b45309; }

    /* ERROR */
    .error-card { border:2px solid #fecaca; border-radius:16px; background:#fff5f5; padding:20px; text-align:center; }
    .error-title { font-size:13px; font-weight:900; color:#dc2626; margin:0 0 6px; }
    .error-sub   { font-size:11px; color:#64748b; margin:0; }
    .error-sub strong { color:#dc2626; }
    .manual-upload-section {
  margin-top: 14px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding-top: 14px;
  border-top: 1px dashed #fecaca;
}
.manual-divider {
  font-size: 10px; color: #94a3b8; font-weight: 700;
  text-transform: uppercase; letter-spacing: .1em;
}
.manual-hint {
  font-size: 11px; color: #64748b; font-weight: 600; margin: 0; text-align: center;
}
.manual-note {
  font-size: 10px; color: #16a34a; font-weight: 700; margin: 0; text-align: center;
}
.btn-manual {
  width: 100%; padding: 10px 16px;
  background: #f8fafc; color: #475569;
  border: 2px dashed #cbd5e1; border-radius: 12px;
  font-weight: 700; font-size: 11px; cursor: pointer; transition: all .2s;
}
.btn-manual:hover { border-color: #94a3b8; background: #f1f5f9; }
.btn-manual-idle {
  padding: 10px 20px;
  background: transparent; color: #64748b;
  border: 2px dashed #e2e8f0; border-radius: 12px;
  font-weight: 700; font-size: 11px; cursor: pointer; transition: all .2s;
  width: 100%;
}
.btn-manual-idle:hover { border-color: #94a3b8; }
  `]
})
export class BacScannerComponent implements OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('processCanvas') processCanvas!: ElementRef<HTMLCanvasElement>;

  @Output() scanned = new EventEmitter<BacResult>();

  state: 'idle' | 'camera' | 'loading' | 'success' | 'error' = 'idle';
  result: BacResult | null = null;
  errorMessage = '';
  qrDetected = false;

  private stream: MediaStream | null = null;
  private scanLoopId: number | null = null;

  // ★ ZXing-js à la place de jsQR — supporte DataMatrix + QR Code
  private zxingReader: any = null;
  private zxingLoaded = false;
  private lastFile: File | null = null;

  constructor(private http: HttpClient, private ngZone: NgZone) { }
  ngOnDestroy() { this.stopCamera(); }

  // ── Chargement ZXing-js ─────────────────────────────────────────
  private loadZXing(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.zxingLoaded) { resolve(); return; }

      // ZXing-js supporte QR Code ET DataMatrix (2D-DOC tunisien)
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
      script.onload = () => {
        try {
          const ZXing = (window as any).ZXing;
          // MultiFormatReader → tente QR + DataMatrix + autres formats
          const hints = new Map();
          const formats = [
            ZXing.BarcodeFormat.DATA_MATRIX,  // ★ 2D-DOC tunisien
            ZXing.BarcodeFormat.QR_CODE,
            ZXing.BarcodeFormat.PDF_417,
          ];
          hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
          hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
          this.zxingReader = new ZXing.MultiFormatReader();
          this.zxingReader.setHints(hints);
          this.zxingLoaded = true;
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      script.onerror = () => reject(new Error('ZXing non chargé'));
      document.head.appendChild(script);
    });
  }// ✅ AJOUTER dans BacScannerComponent
  @ViewChild('manualInput') manualInput!: ElementRef<HTMLInputElement>;

  onManualUpload(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.lastFile = file;
    (e.target as HTMLInputElement).value = '';

    // Émettre directement sans QR — fichier stocké, données vides
    this.state = 'success';
    this.result = { success: false, isManual: true };

    this.scanned.emit({ success: false, file: file, isManual: true });
  }

  // ── Caméra live ─────────────────────────────────────────────────
  async startCamera(): Promise<void> {
    this.state = 'camera';
    this.qrDetected = false;

    try {
      await this.loadZXing();
    } catch {
      // Fallback: continuer sans ZXing, on utilisera le backend
      console.warn('ZXing non disponible, fallback backend');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },   // ★ Résolution max pour DataMatrix
          height: { ideal: 1080 }
        }
      });
      setTimeout(() => {
        if (this.videoEl?.nativeElement) {
          this.videoEl.nativeElement.srcObject = this.stream;
          this.videoEl.nativeElement.play();
          this.startScanLoop();
        }
      }, 150);
    } catch {
      this.ngZone.run(() => {
        this.errorMessage = 'Caméra non accessible — utilisez la galerie';
        this.state = 'error';
      });
    }
  }

  // ── Boucle de scan caméra ────────────────────────────────────────
  private startScanLoop(): void {
    const video = this.videoEl?.nativeElement;
    const canvas = this.processCanvas?.nativeElement;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    let frameCount = 0;

    const loop = () => {
      if (this.state !== 'camera') return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        frameCount++;
        // ★ Scanner 1 frame sur 3 pour économiser CPU (DataMatrix = lourd à décoder)
        if (frameCount % 3 === 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const decoded = this.tryDecodeFrame(canvas, ctx);
          if (decoded) {
            this.qrDetected = true;
            setTimeout(() => {
              this.stopCamera();
              this.processRawQr(decoded);
            }, 600);
            return;
          }
        }
      }
      this.scanLoopId = requestAnimationFrame(loop);
    };

    this.scanLoopId = requestAnimationFrame(loop);
  }

  // ── Décodage d'une frame ─────────────────────────────────────────
  private tryDecodeFrame(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): string | null {
    const w = canvas.width;
    const h = canvas.height;

    if (!this.zxingLoaded || !this.zxingReader) return null;

    try {
      const ZXing = (window as any).ZXing;

      // ★ Essai 1 : image complète
      const imageData = ctx.getImageData(0, 0, w, h);
      const luminance = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
      const binaryBitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminance));
      const result = this.zxingReader.decode(binaryBitmap);
      if (result?.getText() && result.getText().length >= 20) {
        return result.getText();
      }
    } catch {
      // Pas de code détecté dans cette frame
    }

    try {
      const ZXing = (window as any).ZXing;
      // ★ Essai 2 : crop bas-gauche (position DataMatrix sur diplôme complet)
      const cropX = 0;
      const cropY = Math.floor(h * 0.6);
      const cropW = Math.floor(w * 0.45);
      const cropH = h - cropY;

      const offscreen = document.createElement('canvas');
      offscreen.width = cropW;
      offscreen.height = cropH;
      const octx = offscreen.getContext('2d')!;
      octx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const lum2 = new ZXing.HTMLCanvasElementLuminanceSource(offscreen);
      const bin2 = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum2));
      const res2 = this.zxingReader.decode(bin2);
      if (res2?.getText() && res2.getText().length >= 20) {
        return res2.getText();
      }
    } catch {
      // Rien trouvé
    }

    return null;
  }

  stopCamera(): void {
    if (this.scanLoopId) { cancelAnimationFrame(this.scanLoopId); this.scanLoopId = null; }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
  }

  // ── Galerie → backend ────────────────────────────────────────────
  onFileSelected(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.lastFile = file;
    (e.target as HTMLInputElement).value = '';

    // ★ Tentative ZXing côté client AVANT d'envoyer au backend
    // (plus rapide si l'image est propre)
    this.tryDecodeImageFile(file).then(raw => {
      if (raw) {
        this.ngZone.run(() => { this.state = 'loading'; });
        this.processRawQr(raw);
      } else {
        // Fallback: envoyer au backend Python
        this.ngZone.run(() => { this.state = 'loading'; });
        const fd = new FormData();
        fd.append('file', file);
        this.http.post<BacResult>('/scan-bac', fd).subscribe({
          next: res => this.ngZone.run(() => this.handleResult(res)),
          error: () => this.ngZone.run(() => {
            this.errorMessage = 'Service indisponible';
            this.state = 'error';
          })
        });
      }
    });
  }

  // ── Décodage fichier image côté client ───────────────────────────
  private tryDecodeImageFile(file: File): Promise<string | null> {
    return new Promise(resolve => {
      if (!this.zxingLoaded) { this.loadZXing().then(() => this.tryDecodeImageFile(file).then(resolve)).catch(() => resolve(null)); return; }

      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        // ★ Limiter à 2000px max (DataMatrix se lit bien à cette résolution)
        const maxDim = 2000;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const result = this.tryDecodeFrame(canvas, ctx);
        resolve(result);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  // ── QR/DataMatrix décodé → backend parse ────────────────────────
  private processRawQr(rawQr: string): void {
    this.ngZone.run(() => { this.state = 'loading'; });
    this.http.post<BacResult>('/parse-qr-raw', { raw: rawQr, type: 'bac' }).subscribe({
      next: res => this.ngZone.run(() => this.handleResult(res)),
      error: () => this.ngZone.run(() => {
        const parsed = this.clientParse(rawQr);
        this.handleResult({ success: true, rawQr: rawQr.substring(0, 300), ...parsed });
      })
    });
  }

  // ── Parser client minimal (fallback) ────────────────────────────
  private clientParse(raw: string): Partial<BacResult> {
    const r: Partial<BacResult> = {};
    const d = raw.match(/\b((?:19|20)\d{2})[\/\-](\d{2})[\/\-](\d{2})\b/);
    if (d) r.dateNaissance = `${d[1]}-${d[2]}-${d[3]}`;
    const session = raw.match(/\b(20[1-3]\d)\b/g);
    if (session) r.session = session[session.length - 1];
    const num = raw.match(/\b(\d{5,7})\b/);
    if (num) r.numDossier = num[1];
    return r;
  }

  // private handleResult(res: BacResult): void {
  //   if (res.success) {
  //     this.result = res;
  //     this.state = 'success';
  //     // ✅ Attacher le fichier au résultat émis
  //     this.scanned.emit({ ...this.result, file: this.lastFile } as any);
  //   } else {
  //     this.errorMessage = res.errorMessage || 'QR non lisible';
  //     this.state = 'error';
  //   }
  // }
  // private handleResult(res: BacResult): void {
  //   if (res.success) {
  //     this.result = { ...res, isManual: false };
  //     this.state = 'success';
  //     this.scanned.emit({ ...this.result, file: this.lastFile });
  //   } else {
  //     // QR échoué → fichier stocké quand même si disponible
  //     if (this.lastFile) {
  //       this.result = { success: true, isManual: true };
  //       this.state = 'success';
  //       this.scanned.emit({ success: true, file: this.lastFile, isManual: true });
  //     } else {
  //       this.errorMessage = res.errorMessage || 'QR non lisible';
  //       this.state = 'error';
  //     }
  //   }
  // }
  private handleResult(res: BacResult): void {
    if (res.success) {
      this.result = { ...res, isManual: false };
      this.state = 'success';
      this.scanned.emit({ ...this.result, file: this.lastFile });
    } else {
      // ✅ success: false → pas d'auto-validation
      if (this.lastFile) {
        this.result = { success: false, isManual: true };
        this.state = 'success';
        this.scanned.emit({ success: false, file: this.lastFile, isManual: true });
      } else {
        this.errorMessage = res.errorMessage || 'QR non lisible';
        this.state = 'error';
      }
    }
  }

  confirm(): void { if (this.result) this.scanned.emit(this.result); }

  reset(): void {
    this.stopCamera();
    this.state = 'idle';
    this.result = null;
    this.errorMessage = '';
    this.qrDetected = false;
    this.lastFile = null;  // ✅ AJOUTER
  }
}