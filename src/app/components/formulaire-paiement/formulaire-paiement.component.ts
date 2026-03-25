// formulaire-paiement.component.ts
import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { animate, style, transition, trigger } from '@angular/animations';
import { environment } from '../../envirements/enviremetns';

declare const THREE: any;

// ─── MODELS ───────────────────────────────────────────────────────────────────

export interface RemiseDTO {
  id: number;
  motif: string;
  pourcentage: number;
  descriptionJustificatif: string;  // ← NEW
  exempleJustificatif?: string;     // ← NEW
}
// RemiseSelection — ajouter fichierPret
export interface RemiseSelection {
  remiseId: number;
  justificatifNote: string;
  justificatifUrl: string;
  fichier?: File;
  fichierPret?: boolean;    // ← fichier sélectionné, pas encore uploadé
  uploadLoading?: boolean;
  uploadDone?: boolean;     // ← upload HTTP réussi
  uploadError?: string;
}

export interface PreferencesRequest {
  typePaiement: string;
  remisesSelectionnees: number[];
  notesJustificatifs: { [remiseId: number]: string };    // → justificatifNote
  urlsJustificatifs: { [remiseId: number]: string };     // → justificatifUrl
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-formulaire-paiement',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './formulaire-paiement.component.html',
  styleUrls: ['./formulaire-paiement.component.css'],
  animations: [
    trigger('stepAnim', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(20px)' }),
        animate('350ms cubic-bezier(0.16, 1, 0.3, 1)',
          style({ opacity: 1, transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in',
          style({ opacity: 0, transform: 'translateX(-20px)' }))
      ])
    ])
  ]
})
export class FormulairePaiementComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('logoCanvas') logoCanvas?: ElementRef<HTMLCanvasElement>;

  // State
  loading = true;
  submitting = false;
  submitted = false;
  linkInvalid = false;
  token: string | null = null;


  // Data
  remisesDisponibles: RemiseDTO[] = [];
  heuresRestantes: number | null = null;
  enrollmentId: number | null = null;

  // Navigation
  currentStep = 1;

  // Préférences saisies
  preferences: PreferencesRequest = {
    typePaiement: '',
    remisesSelectionnees: [],
    notesJustificatifs: {},
    urlsJustificatifs: {}
  };

  // Three.js refs
  private threeRenderer: any = null;
  private threeAnimId: number | null = null;

  private readonly financeUrl = `${environment.apiUrl}/FINANCE-SERVICE/api/formulaire`;
  private readonly remisesUrl = `${environment.apiUrl}/FINANCE-SERVICE/api/finance/remises`;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient
  ) { }

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token');

    if (!this.token) {
      this.loading = false;
      this.linkInvalid = true;
      return;
    }

    this.validateToken();
    this.loadRemises();
  }

  ngAfterViewInit(): void {
    if (this.linkInvalid) {
      this.init3DLogo();
    }
  }

  ngOnDestroy(): void {
    if (this.threeAnimId !== null) cancelAnimationFrame(this.threeAnimId);
    this.threeRenderer?.dispose?.();
  }

  // ─── DATA ─────────────────────────────────────────────────────────────────

  // validateToken(): void {
  //   this.http.get<boolean>(`${this.financeUrl}/token/${this.token}/valider`).subscribe({
  //     next: (isValid) => {
  //       if (!isValid) {
  //         this.loading = false;
  //         this.setLinkInvalid();
  //         return;
  //       }
  //       this.loadEnrollmentId();
  //     },
  //     error: () => {
  //       this.loading = false;
  //       this.setLinkInvalid();
  //     }
  //   });
  // }
  // loadEnrollmentId(): void {
  //   this.http.get<number>(`${this.financeUrl}/token/${this.token}/valider`).subscribe({
  //     next: (enrollmentId) => {
  //       this.enrollmentId = enrollmentId;
  //       this.loading = false;
  //     },
  //     error: () => {
  //       this.loading = false;
  //       this.setLinkInvalid();
  //     }
  //   });
  // }
  // formulaire-paiement.component.ts

  validateToken(): void {
    this.http.get<boolean>(`${this.financeUrl}/token/${this.token}/valider`).subscribe({
      next: (isValid) => {
        if (!isValid) {
          this.loading = false;
          this.setLinkInvalid();
          return;
        }
        // ✅ Si valide → charger l'enrollmentId
        this.loadEnrollmentId();
      },
      error: () => {
        this.loading = false;
        this.setLinkInvalid();
      }
    });
  }

  // ✅ FIX — appeler un endpoint dédié
  loadEnrollmentId(): void {
    this.http.get<number>(`${this.financeUrl}/token/${this.token}/enrollment-id`).subscribe({
      next: (enrollmentId) => {
        this.enrollmentId = enrollmentId;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.setLinkInvalid();
      }
    });
  }

  loadRemises(): void {
    this.http.get<RemiseDTO[]>(this.remisesUrl).subscribe({
      next: (data) => this.remisesDisponibles = data,
      error: () => this.remisesDisponibles = []
    });
  }

  // ─── PAGE ERREUR — THREE.JS (identique student-dossier) ───────────────────

  private setLinkInvalid(): void {
    this.linkInvalid = true;
    setTimeout(() => this.init3DLogo(), 100);
  }

  private async init3DLogo(): Promise<void> {
    if (!this.logoCanvas?.nativeElement) return;
    try {
      await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
      await this.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js');
      this.buildThreeScene();
    } catch {
      this.renderFallbackCanvas();
    }
  }
  private addGlowRing(scene: any): void {
    const geo = new THREE.TorusGeometry(1.8, 0.02, 16, 120);
    const mat = new THREE.MeshBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.35 });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = Math.PI / 3;
    scene.add(ring);

    const geo2 = new THREE.TorusGeometry(2.3, 0.015, 16, 120);
    const mat2 = new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.2 });
    const ring2 = new THREE.Mesh(geo2, mat2);
    ring2.rotation.x = -Math.PI / 4;
    ring2.rotation.z = Math.PI / 6;
    scene.add(ring2);
  }
  private buildThreeScene(): void {
    const canvas = this.logoCanvas!.nativeElement;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xffffff, 0); // déjà 0 d'opacité ✓ — laisser tel quel
    renderer.outputEncoding = (THREE as any).sRGBEncoding || 3001;
    renderer.toneMapping = (THREE as any).ACESFilmicToneMapping || 4;
    renderer.toneMappingExposure = 1.4;
    this.threeRenderer = renderer;

    // ── Scène ──
    const scene = new THREE.Scene();

    // Fond sombre dégradé via un plan géant
    // const bgGeo = new THREE.PlaneGeometry(100, 100);
    // const bgMat = new THREE.MeshBasicMaterial({ color: 0x0f1117, side: THREE.DoubleSide });
    // const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    // bgMesh.position.z = -10;
    // scene.add(bgMesh);

    // ── Caméra ──
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 0, 5);

    // ── Lumières (style premium) ──
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x6395f8, 2.5);
    keyLight.position.set(3, 5, 5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x7c3aed, 1.5);
    fillLight.position.set(-4, -2, 3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x2563eb, 1.8);
    rimLight.position.set(0, -3, -5);
    scene.add(rimLight);

    // Lumière d'ambiance chaude douce
    const warmLight = new THREE.PointLight(0x93c5fd, 1.2, 20);
    warmLight.position.set(2, 2, 2);
    scene.add(warmLight);

    // ── Chargement GLB ──
    const loader = new (THREE as any).GLTFLoader();
    loader.load(
      'assets/logo+3d+rotatif.glb',
      (gltf: any) => {
        const model = gltf.scene;

        // Centrer et mettre à l'échelle le modèle
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2.5 / maxDim;

        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
        model.rotation.y = Math.PI;

        model.traverse((child: any) => {
          if (child.isMesh) {
            if (child.material) {
              child.material.envMapIntensity = 1.5;
              child.material.needsUpdate = true;
            }
            child.castShadow = true;
          }
        });

        scene.add(model);

        // Particules flottantes en arrière-plan
        this.addParticles(scene);

        // Anneau lumineux autour
        this.addGlowRing(scene);

        // ── Boucle d'animation ──
        let t = 0;
        const animate = () => {
          this.threeAnimId = requestAnimationFrame(animate);
          t += 0.01;

          // Rotation douce
          model.rotation.y += 0.008;
          model.rotation.x = Math.sin(t * 0.4) * 0.08;

          // Légère oscillation verticale
          model.position.y = Math.sin(t * 0.6) * 0.1;

          // Pulsation lumières
          keyLight.intensity = 2.5 + Math.sin(t * 0.9) * 0.4;
          fillLight.intensity = 1.5 + Math.cos(t * 0.7) * 0.3;

          renderer.render(scene, camera);
        };
        animate();
      },
      undefined,
      (error: any) => {
        console.warn('GLB non chargé, fallback canvas.', error);
        this.renderFallbackCanvas();
      }
    );

    // Redimensionnement
    const onResize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);
  }
  private readonly justificatifsUrl =
    `${environment.apiUrl}/FINANCE-SERVICE/api/finance/justificatifs`;

  // uploadJustificatif(remiseId: number, event: Event): void {
  //   const file = (event.target as HTMLInputElement).files?.[0];
  //   if (!file || !this.enrollmentId) return;

  //   const sel = this.remisesSelections[remiseId];
  //   if (!sel) return;

  //   // Validation côté client
  //   const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  //   if (!allowedTypes.includes(file.type)) {
  //     sel.uploadError = 'Format non supporté (PDF, JPEG, PNG uniquement)';
  //     return;
  //   }
  //   if (file.size > 5 * 1024 * 1024) {
  //     sel.uploadError = 'Fichier trop volumineux (max 5 MB)';
  //     return;
  //   }

  //   sel.fichier = file;
  //   sel.uploadLoading = true;
  //   sel.uploadDone = false;
  //   sel.uploadError = undefined;

  //   const formData = new FormData();
  //   formData.append('enrollmentId', this.enrollmentId.toString());
  //   formData.append('remiseId', remiseId.toString());
  //   formData.append('file', file);

  //   this.http.post<any>(`${this.justificatifsUrl}/upload`, formData).subscribe({
  //     next: (res) => {
  //       sel.justificatifUrl = res.remotePath;
  //       sel.uploadLoading = false;
  //       sel.uploadDone = true;
  //     },
  //     error: (err) => {
  //       sel.uploadLoading = false;
  //       sel.uploadError = err.error?.error || 'Erreur lors de l\'upload';
  //     }
  //   });
  // }
  // uploadJustificatif(remiseId: number, event: Event): void {
  //   const file = (event.target as HTMLInputElement).files?.[0];
  //   if (!file) return;

  //   const sel = this.remisesSelections[remiseId];
  //   if (!sel) return;

  //   // Validation côté client uniquement
  //   const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  //   if (!allowedTypes.includes(file.type)) {
  //     sel.uploadError = 'Format non supporté (PDF, JPEG, PNG uniquement)';
  //     return;
  //   }
  //   if (file.size > 5 * 1024 * 1024) {
  //     sel.uploadError = 'Fichier trop volumineux (max 5 MB)';
  //     return;
  //   }

  //   // ✅ Juste stocker le fichier — upload réel au moment de soumettre
  //   sel.fichier = file;
  //   sel.uploadDone = true;    // ← affiche l'état "fichier prêt"
  //   sel.uploadError = undefined;
  //   sel.uploadLoading = false;
  // }
  // uploadJustificatif — juste stocker, pas d'HTTP
  uploadJustificatif(remiseId: number, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const sel = this.remisesSelections[remiseId];
    if (!sel) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      sel.uploadError = 'Format non supporté (PDF, JPEG, PNG uniquement)';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      sel.uploadError = 'Fichier trop volumineux (max 5 MB)';
      return;
    }

    sel.fichier = file;
    sel.fichierPret = true;   // ← prêt à uploader
    sel.uploadDone = false;   // ← pas encore uploadé vers serveur
    sel.uploadError = undefined;
  }

  hasRemiseSansJustificatif(): boolean {
    return this.preferences.remisesSelectionnees
      .some(id => !this.remisesSelections[id]?.uploadDone);
  }
  /** Particules étoiles en arrière-plan */
  private addParticles(scene: any): void {
    const geo = new THREE.BufferGeometry();
    const count = 600;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      positions[i] = (Math.random() - 0.5) * 30;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0x6395f8,
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.7
    });
    const particles = new THREE.Points(geo, mat);
    scene.add(particles);

    // Rotation lente des particules
    const animPart = () => {
      particles.rotation.y += 0.0003;
      particles.rotation.x += 0.0001;
    };
    // On s'appuie sur la boucle principale via le renderer callback — simplification
    const origAnimate = this.threeRenderer?.setAnimationLoop;
  }

  private renderFallbackCanvas(): void {
    if (!this.logoCanvas?.nativeElement) return;
    const canvas = this.logoCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width = canvas.clientWidth;
    const H = canvas.height = canvas.clientHeight;

    const draw = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * .7);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(1, '#a5c2e1');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      const pulse = 1 + Math.sin(t * .03) * .05;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(pulse, pulse);
      ctx.font = `bold 140px 'DM Sans', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const grad = ctx.createLinearGradient(-80, -80, 80, 80);
      grad.addColorStop(0, '#2563eb');
      grad.addColorStop(1, '#7c3aed');
      ctx.fillStyle = grad;
      ctx.fillText('I', 0, 0);
      ctx.restore();
      this.threeAnimId = requestAnimationFrame(() => draw(t + 1));
    };
    draw(0);
  }

  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ─── NAVIGATION ───────────────────────────────────────────────────────────

  nextStep(): void { if (this.currentStep < 3) this.currentStep++; }
  prevStep(): void { if (this.currentStep > 1) this.currentStep--; }
  goToStep(step: number): void { this.currentStep = step; }

  // ─── SÉLECTIONS ───────────────────────────────────────────────────────────

  selectType(type: string): void { this.preferences.typePaiement = type; }

  // toggleRemise(id: number): void {
  //   const idx = this.preferences.remisesSelectionnees.indexOf(id);
  //   if (idx > -1) this.preferences.remisesSelectionnees.splice(idx, 1);
  //   else this.preferences.remisesSelectionnees.push(id);
  // }
  remisesSelections: { [remiseId: number]: RemiseSelection } = {};

  toggleRemise(remiseId: number): void {
    if (this.isRemiseSelected(remiseId)) {
      // Désélectionner
      delete this.remisesSelections[remiseId];
      this.preferences.remisesSelectionnees =
        this.preferences.remisesSelectionnees.filter(id => id !== remiseId);
    } else {
      // Sélectionner
      this.remisesSelections[remiseId] = {
        remiseId,
        justificatifNote: '',
        justificatifUrl: ''
      };
      this.preferences.remisesSelectionnees.push(remiseId);
    }
  }

  // isRemiseSelected(id: number): boolean {
  //   return this.preferences.remisesSelectionnees.includes(id);
  // }
  isRemiseSelected(remiseId: number): boolean {
    return remiseId in this.remisesSelections;
  }
  setNote(remiseId: number, note: string): void {
    if (this.remisesSelections[remiseId]) {
      this.remisesSelections[remiseId].justificatifNote = note;
    }
  }

  setUrl(remiseId: number, url: string): void {
    if (this.remisesSelections[remiseId]) {
      this.remisesSelections[remiseId].justificatifUrl = url;
    }
  }

  getNote(remiseId: number): string {
    return this.remisesSelections[remiseId]?.justificatifNote || '';
  }

  getUrl(remiseId: number): string {
    return this.remisesSelections[remiseId]?.justificatifUrl || '';
  }

  getRemisesSelectionnees(): RemiseDTO[] {
    return this.remisesDisponibles.filter(r => this.preferences.remisesSelectionnees.includes(r.id));
  }

  getTotalRemise(): number {
    return this.getRemisesSelectionnees().reduce((sum, r) => sum + r.pourcentage, 0);
  }

  // ─── SUBMIT ───────────────────────────────────────────────────────────────

  // submitFormulaire(): void {
  //   if (!this.token || this.submitting) return;
  //   this.submitting = true;

  //   const body: PreferencesRequest = {
  //     typePaiement: this.preferences.typePaiement,
  //     remisesSelectionnees: [...this.preferences.remisesSelectionnees]
  //   };

  //   this.http.post(`${this.financeUrl}/token/${this.token}/soumettre`, body).subscribe({
  //     next: () => { this.submitting = false; this.submitted = true; },
  //     error: (err) => {
  //       console.error('Erreur soumission:', err);
  //       this.submitting = false;
  //       alert('Une erreur est survenue. Veuillez réessayer.');
  //     }
  //   });
  // }
  buildSubmitBody(): PreferencesRequest {
    const notesJustificatifs: { [key: number]: string } = {};
    const urlsJustificatifs: { [key: number]: string } = {};

    Object.values(this.remisesSelections).forEach(sel => {
      if (sel.justificatifNote) notesJustificatifs[sel.remiseId] = sel.justificatifNote;
      if (sel.justificatifUrl) urlsJustificatifs[sel.remiseId] = sel.justificatifUrl;
    });

    return {
      typePaiement: this.preferences.typePaiement,
      remisesSelectionnees: this.preferences.remisesSelectionnees,
      notesJustificatifs,
      urlsJustificatifs
    };
  }

  // submitFormulaire(): void {
  //   const body = this.buildSubmitBody();
  //   this.http.post(`${this.financeUrl}/token/${this.token}/soumettre`, body)
  //     .subscribe({
  //       next: () => { /* succès */ },
  //       error: (err) => console.error('Erreur soumission:', err)
  //     });
  // }
  // submitFormulaire(): void {
  //   if (!this.token || this.submitting) return;
  //   this.submitting = true;

  //   // 1. Collecter les fichiers à uploader
  //   const uploads = Object.values(this.remisesSelections)
  //     .filter(sel => sel.fichier && !sel.uploadDone);

  //   if (uploads.length === 0) {
  //     // Pas de fichiers → soumettre directement
  //     this.doSubmit();
  //     return;
  //   }

  //   // 2. Uploader tous les fichiers en parallèle
  //   const uploadRequests = uploads.map(sel => {
  //     const formData = new FormData();
  //     formData.append('enrollmentId', this.enrollmentId!.toString());
  //     formData.append('remiseId', sel.remiseId.toString());
  //     formData.append('file', sel.fichier!);
  //     return this.http.post<any>(`${this.justificatifsUrl}/upload`, formData);
  //   });

  //   // 3. Attendre que tous les uploads soient terminés
  //   import('rxjs').then(({ forkJoin }) => {
  //     forkJoin(uploadRequests).subscribe({
  //       next: (results) => {
  //         // Sauvegarder les URLs retournées
  //         results.forEach((res, i) => {
  //           const remiseId = uploads[i].remiseId;
  //           if (this.remisesSelections[remiseId]) {
  //             this.remisesSelections[remiseId].justificatifUrl = res.remotePath;
  //             this.remisesSelections[remiseId].uploadDone = true;
  //           }
  //         });
  //         this.doSubmit();
  //       },
  //       error: (err) => {
  //         console.error('Erreur upload:', err);
  //         this.submitting = false;
  //         alert('Erreur lors de l\'upload des justificatifs. Veuillez réessayer.');
  //       }
  //     });
  //   });
  // }
  submitFormulaire(): void {
    if (!this.token || this.submitting) return;
    this.submitting = true;

    // Fichiers prêts mais pas encore uploadés
    const aUploader = Object.values(this.remisesSelections)
      .filter(sel => sel.fichier && sel.fichierPret && !sel.uploadDone);

    if (aUploader.length === 0) {
      this.doSubmit();
      return;
    }

    // Uploader séquentiellement pour éviter les problèmes de concurrence
    this.uploadSequentiel(aUploader, 0);
  }
  private uploadSequentiel(uploads: RemiseSelection[], index: number): void {
    if (index >= uploads.length) {
      // Tous uploadés → soumettre
      this.doSubmit();
      return;
    }

    const sel = uploads[index];
    const formData = new FormData();
    formData.append('enrollmentId', this.enrollmentId!.toString());
    formData.append('remiseId', sel.remiseId.toString());
    formData.append('file', sel.fichier!);

    this.http.post<any>(`${this.justificatifsUrl}/upload`, formData).subscribe({
      next: (res) => {
        sel.justificatifUrl = res.remotePath;
        sel.uploadDone = true;
        sel.fichierPret = false;
        // Uploader le suivant
        this.uploadSequentiel(uploads, index + 1);
      },
      error: (err) => {
        this.submitting = false;
        const remise = this.remisesDisponibles.find(r => r.id === sel.remiseId);
        alert(`Erreur upload pour "${remise?.motif || 'remise'}" : ${err.error?.error || 'Erreur inconnue'}`);
      }
    });
  }

  // private doSubmit(): void {
  //   const body = this.buildSubmitBody();
  //   this.http.post(`${this.financeUrl}/token/${this.token}/soumettre`, body).subscribe({
  //     next: () => {
  //       this.submitting = false;
  //       this.submitted = true;   // ← affiche la page succès
  //     },
  //     error: (err) => {
  //       console.error('Erreur soumission:', err);
  //       this.submitting = false;
  //       alert('Une erreur est survenue. Veuillez réessayer.');
  //     }
  //   });
  // }
  // private doSubmit(): void {
  //   const body = this.buildSubmitBody();
  //   this.http.post(`${this.financeUrl}/token/${this.token}/soumettre`, body).subscribe({
  //     next: () => {
  //       this.submitting = false;
  //       this.submitted = true;   // ← affiche la page succès
  //     },
  //     error: (err) => {
  //       console.error('Erreur soumission:', err);
  //       this.submitting = false;
  //       alert('Une erreur est survenue. Veuillez réessayer.');
  //     }
  //   });
  // }
  private doSubmit(): void {
    const body = this.buildSubmitBody();
    this.http.post(`${this.financeUrl}/token/${this.token}/soumettre`, body).subscribe({
      next: () => {
        this.submitting = false;
        this.submitted = true;
      },
      error: (err) => {
        console.error('Erreur soumission:', err);
        this.submitting = false;
        alert('Une erreur est survenue. Veuillez réessayer.');
      }
    });
  }


  // ─── HELPERS ──────────────────────────────────────────────────────────────

  formatHeures(h: number): string {
    if (h >= 24) return `${Math.floor(h / 24)}j ${h % 24}h`;
    return `${h}h`;
  }
}