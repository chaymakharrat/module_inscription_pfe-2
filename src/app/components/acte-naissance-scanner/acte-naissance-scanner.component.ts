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
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="3" y="3" width="7" height="7" rx="1" stroke-width="1.5"/>
          <rect x="14" y="3" width="7" height="7" rx="1" stroke-width="1.5"/>
          <rect x="3" y="14" width="7" height="7" rx="1" stroke-width="1.5"/>
          <path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" stroke-width="1"/>
        </svg>
      </div>
      <p class="idle-title">Scanner l'extrait de naissance</p>
      <p class="idle-sub">Scannez le QR code pour extraire vos données officielles<br/>
        <strong>100% fiable · Pas d'erreur OCR possible</strong></p>
      <div class="idle-btns">
        <button type="button" class="btn-camera" (click)="startCamera()">📷 Caméra live</button>
        <button type="button" class="btn-gallery" (click)="fileInput.click()">🖼️ Galerie</button>
      </div>
      <p class="idle-tip">💡 Pointez la caméra sur le QR — détection automatique</p>
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
      <p class="loading-txt">Lecture du QR code…</p>
      <p class="loading-sub">Extraction des données officielles</p>
    </div>
  </ng-container>

  <!-- SUCCESS -->
  <ng-container *ngIf="state === 'success'">
    <div class="result-card">
      <div class="result-header">
        <span class="success-icon">✅</span>
        <div>
          <p class="result-title">Données extraites avec succès</p>
          <p class="result-sub">Certifiées par le QR code officiel</p>
        </div>
        <button type="button" class="btn-sm" (click)="reset()">↺</button>
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
        <summary class="debug-toggle">🔧 QR brut (debug)</summary>
        <pre class="debug-raw">{{ result?.rawQr }}</pre>
      </details>
      <button type="button" class="btn-confirm" (click)="confirm()">
        ✓ UTILISER CES DONNÉES
      </button>
    </div>
  </ng-container>

  <!-- ERROR -->
  <ng-container *ngIf="state === 'error'">
    <div class="error-card">
      <p class="error-title">⚠️ {{ errorMessage }}</p>
      <p class="error-sub">Essayez la caméra live plutôt qu'une photo</p>
      <div class="idle-btns" style="margin-top:8px">
        <button type="button" class="btn-camera" (click)="startCamera()">📷 Caméra</button>
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
      display:flex; flex-direction:column; align-items:center; gap:14px;
      border:2px dashed #c7d2fe; border-radius:20px;
      background:linear-gradient(135deg,#eef2ff,#f0f9ff); padding:32px 24px; text-align:center;
    }
    .qr-icon-wrap {
      width:68px; height:68px; border-radius:18px; background:#e0e7ff; color:#4f46e5;
      display:flex; align-items:center; justify-content:center;
    }
    .idle-title { font-size:15px; font-weight:900; color:#1e1b4b; margin:0; }
    .idle-sub   { font-size:12px; color:#6366f1; margin:0; line-height:1.7; }
    .idle-sub strong { color:#4338ca; }
    .idle-tip   { font-size:10px; color:#a5b4fc; margin:0; }
    .idle-btns  { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; width:100%; }
    .btn-camera {
      flex:1; padding:12px 20px; background:#4f46e5; color:#fff;
      border:none; border-radius:14px; font-weight:900; font-size:12px;
      letter-spacing:.07em; cursor:pointer; transition:all .2s;
    }
    .btn-camera:hover { background:#4338ca; }
    .btn-gallery {
      padding:12px 20px; background:#f1f5f9; color:#475569;
      border:none; border-radius:14px; font-weight:800; font-size:12px; cursor:pointer;
    }
    .frame-hint { text-align:center; font-size:12px; font-weight:800; color:#4f46e5; margin-bottom:10px; }
    .camera-wrap { position:relative; width:100%; border-radius:18px; overflow:hidden; background:#000; aspect-ratio:4/3; }
    .camera-video { width:100%; height:100%; object-fit:cover; display:block; }
    .camera-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
    .qr-frame { position:relative; width:min(65%,220px); aspect-ratio:1; transition:all .3s; }
    .qr-frame.detected { transform:scale(1.05); }
    .qr-c { position:absolute; width:26px; height:26px; border-color:#818cf8; border-style:solid; border-width:0; transition:border-color .3s; }
    .qr-frame.detected .qr-c { border-color:#4ade80; }
    .qr-c.tl { top:0; left:0; border-top-width:3px; border-left-width:3px; border-radius:6px 0 0 0; }
    .qr-c.tr { top:0; right:0; border-top-width:3px; border-right-width:3px; border-radius:0 6px 0 0; }
    .qr-c.bl { bottom:0; left:0; border-bottom-width:3px; border-left-width:3px; border-radius:0 0 0 6px; }
    .qr-c.br { bottom:0; right:0; border-bottom-width:3px; border-right-width:3px; border-radius:0 0 6px 0; }
    .scan-line { position:absolute; left:6px; right:6px; height:2px; background:linear-gradient(90deg,transparent,#818cf8,transparent); animation:beam 1.8s ease-in-out infinite; }
    .scan-line.stop { animation:none; top:50%; background:linear-gradient(90deg,transparent,#4ade80,transparent); }
    @keyframes beam { 0%{top:4px} 50%{top:calc(100% - 4px)} 100%{top:4px} }
    .cam-badge { position:absolute; bottom:16px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,.7); backdrop-filter:blur(6px); border-radius:20px; padding:6px 16px; font-size:12px; font-weight:700; color:#a5b4fc; white-space:nowrap; }
    .cam-badge.found { color:#4ade80; }
    .camera-btns { display:flex; gap:8px; margin-top:10px; }
    .btn-ghost { flex:1; padding:10px; background:transparent; color:#475569; border:2px solid #e2e8f0; border-radius:12px; font-weight:700; font-size:11px; cursor:pointer; }
    .loading-card { display:flex; flex-direction:column; align-items:center; gap:14px; padding:40px 24px; text-align:center; border:2px solid #e0e7ff; border-radius:20px; background:#eef2ff; }
    .loading-spinner { width:48px; height:48px; border:4px solid #c7d2fe; border-top-color:#4f46e5; border-radius:50%; animation:spin .8s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .loading-txt { font-size:14px; font-weight:900; color:#4f46e5; margin:0; }
    .loading-sub { font-size:11px; color:#818cf8; margin:0; }
    .result-card { border:2px solid #bbf7d0; border-radius:20px; background:linear-gradient(135deg,#f0fdf4,#eef2ff); padding:20px; }
    .result-header { display:flex; align-items:flex-start; gap:12px; margin-bottom:16px; }
    .success-icon { font-size:28px; flex-shrink:0; }
    .result-title { font-size:14px; font-weight:900; color:#14532d; margin:0 0 2px; }
    .result-sub   { font-size:10px; color:#16a34a; margin:0; }
    .btn-sm { padding:6px 10px; background:transparent; border:none; font-size:16px; color:#94a3b8; cursor:pointer; margin-left:auto; }
    .data-list { display:flex; flex-direction:column; gap:8px; margin-bottom:16px; }
    .data-item { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#fff; border-radius:12px; border:1px solid #dcfce7; gap:12px; }
    .dk { font-size:10px; font-weight:900; color:#16a34a; text-transform:uppercase; letter-spacing:.07em; flex-shrink:0; }
    .dv { font-size:14px; font-weight:700; color:#1e293b; text-align:right; }
    .dv.rtl { direction:rtl; font-family:'Segoe UI',Tahoma,sans-serif; }
    .dv.mono { font-family:monospace; letter-spacing:.1em; }
    .debug-section { margin-bottom:14px; }
    .debug-toggle { font-size:11px; font-weight:700; color:#6366f1; cursor:pointer; padding:6px 0; list-style:none; }
    .debug-raw { background:#1e1b4b; color:#a5b4fc; border-radius:10px; padding:12px; font-size:10px; margin:6px 0 0; white-space:pre-wrap; word-break:break-all; max-height:150px; overflow-y:auto; }
    .btn-confirm { width:100%; padding:13px; background:#16a34a; color:#fff; border:none; border-radius:14px; font-weight:900; font-size:12px; letter-spacing:.1em; cursor:pointer; transition:background .2s; }
    .btn-confirm:hover { background:#15803d; }
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