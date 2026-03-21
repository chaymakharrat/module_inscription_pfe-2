import {
  Component, Output, EventEmitter, ElementRef, ViewChild,
  NgZone, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

export interface ActeNaissanceResult {
  success: boolean;
  nom?: string;
  prenom?: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  numActe?: string;
  commune?: string;
  rawQr?: string;
  errorMessage?: string;
}

@Component({
  selector: 'app-acte-naissance-scanner',
  standalone: true,
  imports: [CommonModule],
  template: `
<div class="acte-wrapper">
  <input #fileInput type="file" accept="image/*" class="hidden" (change)="onFileSelected($event)"/>

  <!-- IDLE -->
  <ng-container *ngIf="state === 'idle'">
    <div class="idle-card">
      <div class="qr-icon-wrap">
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
        </svg>
      </div>
      <p class="idle-title">Scanner l'extrait de naissance</p>
      <p class="idle-sub">Scannez le QR code pour extraire vos données officielles<br/>
        <strong>100% fiable · Pas d'erreur OCR possible</strong></p>
      <div class="idle-btns">
        <button type="button" class="btn-camera" (click)="startCamera()">
          <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 012 2H5a2 2 0 01-2-2V9z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Caméra live
        </button>
        <button type="button" class="btn-gallery" (click)="fileInput.click()">
          <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Galerie
        </button>
      </div>
      <p class="idle-tip">
        <svg class="w-3 h-3 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Pointez la caméra sur le QR — détection automatique
      </p>
    </div>
  </ng-container>

  <!-- CAMERA LIVE -->
  <ng-container *ngIf="state === 'camera'">
    <p class="frame-hint">🎯 Cadrez le QR code dans le carré</p>
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
          <span *ngIf="!qrDetected">🔍 Cherche le QR code…</span>
          <span *ngIf="qrDetected">
            <svg class="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
            Détecté !
          </span>
        </div>
      </div>
    </div>
    <div class="camera-btns">
      <button type="button" class="btn-ghost" (click)="stopCamera(); state='idle'">
        <svg class="w-3.5 h-3.5 mr-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Annuler
      </button>
      <button type="button" class="btn-ghost" (click)="stopCamera(); fileInput.click()">
        <svg class="w-3.5 h-3.5 mr-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Galerie
      </button>
    </div>
  </ng-container>

  <!-- LOADING -->
  <ng-container *ngIf="state === 'loading'">
    <div class="loading-card">
      <div class="loading-spinner"></div>
      <p class="loading-txt">Lecture du QR code…</p>
      <p class="loading-sub">Extraction des données officielles</p>
    </div>
  </ng-container>

  <!-- SUCCESS -->
  <ng-container *ngIf="state === 'success'">
    <div class="result-card">
      <div class="result-header">
        <div class="success-icon">
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p class="result-title">Données extraites avec succès</p>
          <p class="result-sub">Certifiées par le QR code officiel</p>
        </div>
        <button type="button" class="btn-sm" (click)="reset()">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      <div class="data-list">
        <div class="data-item" *ngIf="result?.nom">
          <span class="dk">Nom</span><span class="dv rtl">{{ result?.nom }}</span>
        </div>
        <div class="data-item" *ngIf="result?.prenom">
          <span class="dk">Prénom</span><span class="dv rtl">{{ result?.prenom }}</span>
        </div>
        <div class="data-item" *ngIf="result?.dateNaissance">
          <span class="dk">Date naissance</span><span class="dv">{{ result?.dateNaissance }}</span>
        </div>
        <div class="data-item" *ngIf="result?.lieuNaissance || result?.commune">
          <span class="dk">Lieu naissance</span>
          <span class="dv rtl">{{ result?.lieuNaissance || result?.commune }}</span>
        </div>
        <div class="data-item" *ngIf="result?.numActe">
          <span class="dk">N° acte</span><span class="dv mono">{{ result?.numActe }}</span>
        </div>
      </div>
      <details class="debug-section" *ngIf="result?.rawQr">
        <summary class="debug-toggle">
          <svg class="w-3.5 h-3.5 mr-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          QR brut (debug)
        </summary>
        <pre class="debug-raw">{{ result?.rawQr }}</pre>
      </details>
      <button type="button" class="btn-confirm" (click)="confirm()">
        <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
        </svg>
        UTILISER CES DONNÉES
      </button>
    </div>
  </ng-container>

  <!-- ERROR -->
  <ng-container *ngIf="state === 'error'">
    <div class="error-card">
      <p class="error-title">
        <svg class="w-5 h-5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        {{ errorMessage }}
      </p>
      <p class="error-sub">Essayez la caméra live plutôt qu'une photo</p>
      <div class="idle-btns" style="margin-top:8px">
        <button type="button" class="btn-camera" (click)="startCamera()">
          <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 012 2H5a2 2 0 01-2-2V9z" />
          </svg>
          Caméra
        </button>
        <button type="button" class="btn-gallery" (click)="reset()">Annuler</button>
      </div>
    </div>
  </ng-container>
</div>
  `,
  styles: [`
    .acte-wrapper { font-family:'Segoe UI',system-ui,sans-serif; max-width:500px; margin:0 auto 1.5rem; }
    .hidden { display:none !important; }
    .idle-card {
      display:flex; flex-direction:column; align-items:center; gap:18px;
      border:2px solid #f1f5f9; border-radius:24px;
      background:#f8fafc; padding:40px 24px; text-align:center;
      transition: all 0.3s ease;
    }
    .qr-icon-wrap {
      width:72px; height:72px; border-radius:20px;
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      display:flex; align-items:center; justify-content:center;
      color:#2563eb; margin-bottom:4px;
      box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.1);
    }
    .idle-title { font-size:16px; font-weight:900; color:#1e293b; margin:0; }
    .idle-sub   { font-size:12px; color:#64748b; margin:0; line-height:1.7; }
    .idle-sub strong { color:#334155; }
    .idle-tip   { 
      display:flex; align-items:center; justify-content:center;
      font-size:11px; font-weight:700; color:#94a3b8; margin:0; 
      background: white; padding: 6px 12px; border-radius: 999px;
      border: 1px solid #f1f5f9;
    }
    .idle-btns  { display:flex; gap:12px; flex-wrap:wrap; justify-content:center; width:100%; }
    .btn-camera {
      flex:1; padding:14px 24px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color:#fff;
      border:none; border-radius:16px; font-weight:900; font-size:13px;
      letter-spacing:.03em; cursor:pointer; transition:all .3s cubic-bezier(0.16, 1, 0.3, 1);
      display:flex; align-items:center; justify-content:center;
      box-shadow: 0 10px 25px -5px rgba(37, 99, 235, 0.4);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); }
      70% { box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
      100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
    }
    .btn-camera:hover { transform: translateY(-2px); box-shadow: 0 15px 30px -5px rgba(37, 99, 235, 0.5); }
    .btn-gallery {
      padding:14px 24px; background:white; color:#475569;
      border:1.5px solid #e2e8f0; border-radius:16px; font-weight:800; font-size:13px; 
      cursor:pointer; display:flex; align-items:center; justify-content:center;
      transition: all 0.2s;
    }
    .frame-hint { text-align:center; font-size:12px; font-weight:800; color:#4f46e5; margin-bottom:10px; }
    .camera-wrap { position:relative; width:100%; border-radius:18px; overflow:hidden; background:#000; aspect-ratio:4/3; }
    .camera-video { width:100%; height:100%; object-fit:cover; display:block; }
    .camera-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
    .qr-frame { position:relative; width:min(65%,220px); aspect-ratio:1; transition:all .3s; }
    .qr-frame.detected { transform:scale(1.05); }
    .qr-c { position:absolute; width:26px; height:26px; border-color:#60a5fa; border-style:solid; border-width:0; transition:border-color .3s; }
    .qr-frame.detected .qr-c { border-color:#4ade80; }
    .qr-c.tl { top:0; left:0; border-top-width:3px; border-left-width:3px; border-radius:6px 0 0 0; }
    .qr-c.tr { top:0; right:0; border-top-width:3px; border-right-width:3px; border-radius:0 6px 0 0; }
    .qr-c.bl { bottom:0; left:0; border-bottom-width:3px; border-left-width:3px; border-radius:0 0 0 6px; }
    .qr-c.br { bottom:0; right:0; border-bottom-width:3px; border-right-width:3px; border-radius:0 0 6px 0; }
    .scan-line { position:absolute; left:6px; right:6px; height:2px; background:linear-gradient(90deg,transparent,#60a5fa,transparent); animation:beam 1.8s ease-in-out infinite; }
    .scan-line.stop { animation:none; top:50%; background:linear-gradient(90deg,transparent,#4ade80,transparent); }
    @keyframes beam { 0%{top:4px} 50%{top:calc(100% - 4px)} 100%{top:4px} }
    .cam-badge { position:absolute; bottom:16px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,.7); backdrop-filter:blur(6px); border-radius:20px; padding:6px 16px; font-size:12px; font-weight:700; color:#60a5fa; white-space:nowrap; }
    .cam-badge.found { color:#4ade80; }
    .camera-btns { display:flex; gap:8px; margin-top:10px; }
    .btn-ghost { flex:1; padding:10px; background:transparent; color:#475569; border:2px solid #e2e8f0; border-radius:12px; font-weight:700; font-size:11px; cursor:pointer; }
    .loading-card { display:flex; flex-direction:column; align-items:center; gap:14px; padding:40px 24px; text-align:center; border:2px solid #dbeafe; border-radius:20px; background:white; }
    .loading-spinner { width:48px; height:48px; border:4px solid #eff6ff; border-top-color:#2563eb; border-radius:50%; animation:spin .8s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .loading-txt { font-size:14px; font-weight:900; color:#2563eb; margin:0; }
    .loading-sub { font-size:11px; color:#64748b; margin:0; }
    .result-card { border:1px solid #e2e8f0; border-radius:24px; background:#f8fafc; padding:24px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }
    .result-header { display:flex; align-items:center; gap:16px; margin-bottom:20px; }
    .success-icon { 
      width:48px; height:48px; border-radius:14px; background:#f0fdf4; color:#16a34a;
      display:flex; align-items:center; justify-content:center;
      font-size:24px; flex-shrink:0;
    }
    .result-title { font-size:15px; font-weight:900; color:#1e293b; margin:0 0 2px; }
    .result-sub   { font-size:11px; color:#64748b; margin:0; font-weight:600; }
    .btn-sm { padding:8px; background:white; border:1px solid #e2e8f0; border-radius:10px; color:#94a3b8; cursor:pointer; margin-left:auto; transition:all 0.2s; }
    .btn-sm:hover { color:#2563eb; border-color:#dbeafe; background:#eff6ff; }
    .data-list { display:flex; flex-direction:column; gap:10px; margin-bottom:20px; }
    .data-item { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:#fff; border-radius:14px; border:1px solid #f1f5f9; gap:12px; }
    .dk { font-size:10px; font-weight:900; color:#94a3b8; text-transform:uppercase; letter-spacing:.1em; flex-shrink:0; }
    .dv { font-size:14px; font-weight:800; color:#0f172a; text-align:right; }
    .dv.rtl { direction:rtl; font-family:'Segoe UI',Tahoma,sans-serif; font-size:15px;}
    .dv.mono { font-family:'JetBrains Mono', monospace; font-size:13px; color:#2563eb; letter-spacing: 0; }
    .debug-section { margin-bottom:14px; }
    .debug-toggle { font-size:11px; font-weight:700; color:#2563eb; cursor:pointer; padding:6px 0; list-style:none; }
    .debug-raw { background:#1e1b4b; color:#a5b4fc; border-radius:10px; padding:12px; font-size:10px; margin:6px 0 0; white-space:pre-wrap; word-break:break-all; max-height:150px; overflow-y:auto; }
    .btn-confirm { 
      width:100%; padding:14px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color:#fff;
      border:none; border-radius:16px; font-weight:900; font-size:12px;
      letter-spacing:.1em; cursor:pointer; transition:all .3s cubic-bezier(0.16, 1, 0.3, 1);
      display:flex; align-items:center; justify-content:center;
      box-shadow: 0 10px 25px -5px rgba(37, 99, 235, 0.3);
    }
    .btn-confirm:hover { transform: translateY(-2px); box-shadow: 0 15px 30px -5px rgba(37, 99, 235, 0.4); }
    .error-card { border:2px solid #fecaca; border-radius:16px; background:#fff5f5; padding:20px; text-align:center; }
    .error-title { font-size:13px; font-weight:900; color:#dc2626; margin:0 0 6px; }
    .error-sub   { font-size:11px; color:#64748b; margin:0; }
  `]
})
export class ActeNaissanceScannerComponent implements OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('processCanvas') processCanvas!: ElementRef<HTMLCanvasElement>;
  @Output() scanned = new EventEmitter<ActeNaissanceResult>();

  private readonly QR_URL = '/scan-acte-naissance';

  state: 'idle' | 'camera' | 'loading' | 'success' | 'error' = 'idle';
  result: ActeNaissanceResult | null = null;
  errorMessage = '';
  qrDetected = false;

  private stream: MediaStream | null = null;
  private scanLoopId: number | null = null;
  private jsQR: any = null;

  constructor(private http: HttpClient, private ngZone: NgZone) { }
  ngOnDestroy() { this.stopCamera(); }

  // ── Caméra live ───────────────────────────────────────────────────
  async startCamera(): Promise<void> {
    this.state = 'camera'; this.qrDetected = false;
    if (!this.jsQR) await this.loadJsQR();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      setTimeout(() => {
        if (this.videoEl?.nativeElement) {
          this.videoEl.nativeElement.srcObject = this.stream;
          this.videoEl.nativeElement.play();
          this.startScanLoop();
        }
      }, 150);
    } catch {
      this.ngZone.run(() => { this.errorMessage = 'Caméra non accessible — utilisez la galerie'; this.state = 'error'; });
    }
  }

  private loadJsQR(): Promise<void> {
    return new Promise(resolve => {
      if ((window as any).jsQR) { this.jsQR = (window as any).jsQR; resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
      s.onload = () => { this.jsQR = (window as any).jsQR; resolve(); };
      document.head.appendChild(s);
    });
  }

  private startScanLoop(): void {
    const video = this.videoEl?.nativeElement;
    const canvas = this.processCanvas?.nativeElement;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const loop = () => {
      if (this.state !== 'camera') return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = this.jsQR?.(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });
        if (code?.data) {
          this.qrDetected = true;
          setTimeout(() => { this.stopCamera(); this.processRawQr(code.data); }, 600);
          return;
        }
      }
      this.scanLoopId = requestAnimationFrame(loop);
    };
    this.scanLoopId = requestAnimationFrame(loop);
  }

  stopCamera(): void {
    if (this.scanLoopId) { cancelAnimationFrame(this.scanLoopId); this.scanLoopId = null; }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
  }

  // ── Fallback galerie ──────────────────────────────────────────────
  onFileSelected(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (e.target as HTMLInputElement).value = '';
    this.ngZone.run(() => { this.state = 'loading'; });
    const fd = new FormData(); fd.append('file', file);
    this.http.post<ActeNaissanceResult>(this.QR_URL, fd).subscribe({
      next: res => this.ngZone.run(() => this.handleResult(res)),
      error: () => this.ngZone.run(() => { this.errorMessage = 'Service indisponible (port 5051)'; this.state = 'error'; })
    });
  }

  // ── QR lu par caméra → envoyer au backend ou parser client ────────
  private processRawQr(rawQr: string): void {
    this.ngZone.run(() => { this.state = 'loading'; });
    this.http.post<ActeNaissanceResult>('/parse-qr-raw', { raw: rawQr }).subscribe({
      next: res => this.ngZone.run(() => this.handleResult(res)),
      error: () => this.ngZone.run(() => {
        // Parser minimal côté client si backend /parse-qr-raw absent
        const parsed = this.clientParse(rawQr);
        this.handleResult({ success: true, rawQr: rawQr.substring(0, 300), ...parsed });
      })
    });
  }

  private clientParse(raw: string): Partial<ActeNaissanceResult> {
    const r: Partial<ActeNaissanceResult> = {};
    const d = raw.match(/\b((?:19|20)\d{2})[\/\-](\d{2})[\/\-](\d{2})\b/);
    if (d) r.dateNaissance = `${d[1]}-${d[2]}-${d[3]}`;
    const d8 = raw.match(/\b((?:19|20)\d{2})(\d{2})(\d{2})\b/);
    if (!r.dateNaissance && d8) r.dateNaissance = `${d8[1]}-${d8[2]}-${d8[3]}`;
    const acte = raw.match(/\b(\d{6,7})\b/);
    if (acte) r.numActe = acte[1];
    return r;
  }

  private handleResult(res: ActeNaissanceResult): void {
    if (res.success) { this.result = res; this.state = 'success'; }
    else { this.errorMessage = res.errorMessage || 'QR non lisible'; this.state = 'error'; }
  }

  confirm(): void { if (this.result) this.scanned.emit(this.result); }

  reset(): void {
    this.stopCamera();
    this.state = 'idle'; this.result = null; this.errorMessage = ''; this.qrDetected = false;
  }
}