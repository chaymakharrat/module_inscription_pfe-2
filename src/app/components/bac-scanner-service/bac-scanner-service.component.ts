import {
  Component, Output, EventEmitter, ElementRef, ViewChild,
  NgZone, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES — alignées sur QR_service_bac.py
// ─────────────────────────────────────────────────────────────────────────────

export interface NoteItem {
  tag: string;   // ex: '1N'
  key: string;   // ex: 'noteMaths'
  matiere_fr: string;   // ex: 'Mathématiques'
  matiere_ar: string;   // ex: 'الرياضيات'
  note: string;   // ex: '08,50'
}

export interface BacResult {
  success: boolean;
  errorMessage?: string;

  // ── Identité ────────────────────────────────────────────────────
  nomComplet?: string;   // arabe : شيماء الخراط
  dateNaissance?: string;   // "12-05-2004"
  lieuNaissance?: string;   // arabe : صفاقس
  numDossier?: string;   // "140901"
  session?: string;   // "2023"
  dateDiplome?: string;   // "25/06/2023"
  specialite?: string;   // arabe
  specialiteFr?: string;   // "Mathématiques"
  mention?: string;   // arabe
  mentionFr?: string;   // "Assez Bien"
  codeSection?: string;   // "A"

  // ── Notes individuelles ─────────────────────────────────────────
  noteMaths?: string;
  noteSciPhys?: string;
  noteSVT?: string;
  noteAnglais?: string;
  noteFrancais?: string;
  noteArabe?: string;
  notePhilo?: string;
  noteInfo?: string;
  noteEPS?: string;
  noteAllemand?: string;
  noteAllemand2?: string;
  noteLittArabe?: string;
  noteEco?: string;
  noteGestion?: string;
  noteSocio?: string;
  noteTechno?: string;
  noteDessin?: string;
  noteHistGeo?: string;
  noteSport?: string;
  moyennefinale?: string;

  // ── Tableau ordonné pour affichage ──────────────────────────────
  notes?: NoteItem[];

  // ── Debug ───────────────────────────────────────────────────────
  rawQr?: string;
  allFields?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT
// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-bac-scanner-service',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bac-scanner-service.component.html',
  styleUrl: './bac-scanner-service.component.css'
})
export class BacScannerServiceComponent implements OnDestroy {

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
  private jsQR: any = null;

  constructor(private http: HttpClient, private ngZone: NgZone) { }

  ngOnDestroy(): void { this.stopCamera(); }

  // ── Helpers template ─────────────────────────────────────────────────────

  objectEntries(obj: any): [string, string][] {
    return obj ? Object.entries(obj) : [];
  }

  private toNum(note: string): number {
    return parseFloat(note?.replace(',', '.') ?? '0') || 0;
  }

  isHigh(note: string): boolean { const n = this.toNum(note); return n >= 16; }
  isMid(note: string): boolean { const n = this.toNum(note); return n >= 10 && n < 16; }
  isLow(note: string): boolean { const n = this.toNum(note); return n > 0 && n < 10; }

  mentionClass(mention?: string): string {
    if (!mention) return 'mention-default';
    const m = mention.toLowerCase();
    if (m.includes('excel')) return 'mention-excellent';
    if (m.includes('très')) return 'mention-tres-bien';
    if (m.includes('assez')) return 'mention-assez';
    if (m.includes('bien')) return 'mention-bien';
    if (m.includes('passable')) return 'mention-passable';
    return 'mention-default';
  }

  // ── Caméra live ──────────────────────────────────────────────────────────

  async startCamera(): Promise<void> {
    this.state = 'camera';
    this.qrDetected = false;
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
      this.ngZone.run(() => {
        this.errorMessage = 'Caméra non accessible — utilisez la galerie';
        this.state = 'error';
      });
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
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = this.jsQR?.(imageData.data, imageData.width, imageData.height,
          { inversionAttempts: 'dontInvert' });
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

  // ── Galerie ──────────────────────────────────────────────────────────────

  onFileSelected(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (e.target as HTMLInputElement).value = '';
    this.ngZone.run(() => { this.state = 'loading'; });
    const fd = new FormData();
    fd.append('file', file);
    this.http.post<BacResult>('/bilan-bac', fd).subscribe({
      next: res => this.ngZone.run(() => this.handleResult(res)),
      error: () => this.ngZone.run(() => {
        this.errorMessage = 'Service indisponible';
        this.state = 'error';
      })
    });
  }

  // ── QR caméra → backend ──────────────────────────────────────────────────

  private processRawQr(rawQr: string): void {
    this.ngZone.run(() => { this.state = 'loading'; });
    this.http.post<BacResult>('/parse-bilan-bac', { raw: rawQr }).subscribe({
      next: res => this.ngZone.run(() => this.handleResult(res)),
      error: () => this.ngZone.run(() => {
        const parsed = this.clientParse(rawQr);
        this.handleResult({ success: true, rawQr: rawQr.substring(0, 300), ...parsed });
      })
    });
  }

  private clientParse(raw: string): Partial<BacResult> {
    const r: Partial<BacResult> = {};
    const d = raw.match(/\b((?:19|20)\d{2})[\/\-](\d{2})[\/\-](\d{2})\b/);
    if (d) r.dateNaissance = `${d[1]}-${d[2]}-${d[3]}`;
    const sessions = raw.match(/\b(20[1-3]\d)\b/g);
    if (sessions) r.session = sessions[sessions.length - 1];
    const num = raw.match(/\b(\d{5,7})\b/);
    if (num) r.numDossier = num[1];
    return r;
  }

  private handleResult(res: BacResult): void {
    if (res.success) { this.result = res; this.state = 'success'; }
    else { this.errorMessage = res.errorMessage || 'QR non lisible'; this.state = 'error'; }
  }

  confirm(): void { if (this.result) this.scanned.emit(this.result); }

  reset(): void {
    this.stopCamera();
    this.state = 'idle'; this.result = null; this.errorMessage = ''; this.qrDetected = false;
  }
}