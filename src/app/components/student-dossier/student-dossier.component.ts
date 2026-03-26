import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { KeycloakService } from 'keycloak-angular';
import { KeycloakProfile } from 'keycloak-js';
import { StudentService } from '../../services/student.service';
import { EnrollmentService } from '../../services/enrollment.service';
import { AlertService } from '../../services/alert.service';
import { Student } from '../../models/student.model';
import { Enrollment } from '../../models/enrollment.model';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { animate, style, transition, trigger } from '@angular/animations';

// Déclaration globale pour Three.js chargé dynamiquement
declare const THREE: any;

@Component({
    selector: 'app-student-dossier',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './student-dossier.component.html',
    styleUrls: ['./student-dossier.component.css'],
    animations: [
        trigger('fadeIn', [
            transition(':enter', [
                style({ opacity: 0, transform: 'translateY(12px)' }),
                animate('450ms cubic-bezier(0.16, 1, 0.3, 1)',
                    style({ opacity: 1, transform: 'translateY(0)' }))
            ])
        ])
    ]
})
export class StudentDossierComponent implements OnInit, OnDestroy, AfterViewInit {

    @ViewChild('logoCanvas') logoCanvas?: ElementRef<HTMLCanvasElement>;

    // ── State ──────────────────────────────────────────────
    userProfile: KeycloakProfile | null = null;
    student: Student | null = null;
    enrollment: Enrollment | null = null;
    documents: any[] = [];
    loading = true;
    submitting = false;
    linkInvalid = false;
    accessToken: string | null = null;
    selectedFiles: Map<string, File> = new Map();

    // ── Three.js refs ──────────────────────────────────────
    private threeRenderer: any = null;
    private threeAnimId: number | null = null;

    // Ordre du workflow pour déterminer les étapes passées
    private readonly STATUS_ORDER = [
        'SOUMIS',
        'EN_COURS_SCOLARITE',
        'EN_ATTENTE_DOCUMENT',
        'RELANCE',
        'SCOLARITE_VALIDEE',
        'EN_COURS_DEPARTEMENT',
        'DEPARTEMENT_VALIDE',
        'FORMULAIRE_ENVOYE',
        'EN_ATTENTE_PAIEMENT',
        'PAIEMENT_VALIDE',
        'INSCRIT'
    ];

    get currentStatut(): string {
        return (this.enrollment?.statutActuel || (this.enrollment as any)?.statut) || '';
    }

    constructor(
        private route: ActivatedRoute,
        private keycloak: KeycloakService,
        private studentService: StudentService,
        private enrollmentService: EnrollmentService,
        private alertService: AlertService
    ) { }

    // ════════════════════════════════════════════════════════
    // LIFECYCLE
    // ════════════════════════════════════════════════════════

    async ngOnInit(): Promise<void> {
        this.accessToken = this.route.snapshot.queryParamMap.get('token');

        if (this.accessToken) {
            this.loadDossierByToken(this.accessToken);
            return;
        }

        try {
            const isLoggedIn = await this.keycloak.isLoggedIn();
            if (!isLoggedIn) {
                this.loading = false;
                this.alertService.error('Veuillez vous connecter pour accéder à votre dossier.');
                return;
            }
            this.userProfile = await this.keycloak.loadUserProfile();
            if (this.userProfile?.email) {
                this.loadDossierData(this.userProfile.email);
            } else {
                this.loading = false;
                this.alertService.error('Impossible de charger votre profil.');
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            this.loading = false;
        }
    }

    ngAfterViewInit(): void {
        // Si le lien est déjà marqué invalide après init (rare, normalement après async)
        if (this.linkInvalid) {
            this.init3DLogo();
        }
    }

    ngOnDestroy(): void {
        this.destroy3DScene();
    }

    // ════════════════════════════════════════════════════════
    // DATA LOADING
    // ════════════════════════════════════════════════════════

    // loadDossierByToken(token: string) {
    //     this.enrollmentService.getDemandeByToken(token).pipe(
    //         switchMap(enrollment => {
    //             this.enrollment = enrollment;
    //             const studentId = enrollment.etudiantId || enrollment.studentId;
    //             if (!studentId) return of(null);
    //             return forkJoin({
    //                 student: this.studentService.getStudentById(studentId).pipe(catchError(() => of(null))),
    //                 documents: this.studentService.getDocumentsStatus(studentId).pipe(catchError(() => of([])))
    //             });
    //         })
    //     ).subscribe({
    //         next: (data) => {
    //             if (data) {
    //                 this.student = data.student;
    //                 this.documents = this.deduplicateDocuments(data.documents);
    //             }
    //             this.loading = false;
    //         },
    //         error: (err) => {
    //             console.error('Error loading by token:', err);
    //             this.loading = false;
    //             this.setLinkInvalid();
    //         }
    //     });
    // }
    loadDossierByToken(token: string) {
        console.log('🔍 Token reçu:', token);

        this.enrollmentService.getDemandeByToken(token).pipe(
            switchMap(enrollment => {
                console.log('✅ Enrollment reçu:', JSON.stringify(enrollment));

                this.enrollment = enrollment;

                const studentId = (enrollment as any).etudiantId
                    || (enrollment as any).studentId
                    || (enrollment as any).etudiant_id
                    || (enrollment as any).idEtudiant
                    || (enrollment as any).student?.id;

                console.log('🔍 studentId résolu:', studentId);

                if (!studentId) {
                    console.error('❌ studentId introuvable! Champs disponibles:',
                        Object.keys(enrollment as any));
                    return of(null);
                }

                return forkJoin({
                    student: this.studentService.getStudentById(studentId).pipe(
                        catchError(e => {
                            console.error('❌ Erreur getStudentById:', e.status, e.message);
                            return of(null);
                        })
                    ),
                    documents: this.studentService.getDocumentsStatus(studentId, (enrollment as any).id).pipe(
                        catchError(e => {
                            console.error('❌ Erreur getDocumentsStatus:', e.status, e.message);
                            return of([]);
                        })
                    )
                });
            })
        ).subscribe({
            next: (data) => {
                console.log('✅ Data finale:', JSON.stringify(data));
                if (data) {
                    this.student = data.student;
                    this.documents = this.deduplicateDocuments(data.documents);
                    console.log('✅ Student:', this.student);
                    console.log('✅ Documents:', this.documents);
                } else {
                    console.error('❌ data est null');
                }
                this.loading = false;
            },
            error: (err) => {
                console.error('❌ Erreur globale:', err.status, err.message);
                this.loading = false;
                this.setLinkInvalid();
            }
        });
    }

    loadDossierData(email: string) {
        this.studentService.getStudentByEmail(email).pipe(
            switchMap(student => {
                this.student = student;
                if (!student.id) return of(null);
                return forkJoin({
                    enrollment: this.enrollmentService.getDemandeByEtudiantId(student.id).pipe(catchError(() => of(null))),
                    student: of(student)
                });
            }),
            switchMap((data: any) => {
                if (!data || !data.student || !data.enrollment) return of(null);

                return forkJoin({
                    enrollment: of(data.enrollment),
                    student: of(data.student),
                    documents: this.studentService.getDocumentsStatus(data.student.id!, data.enrollment.id!).pipe(catchError(() => of([])))
                });
            })
        ).subscribe({
            next: (data) => {
                if (data && data.enrollment) {
                    this.enrollment = data.enrollment;
                    this.student = data.student;
                    this.documents = this.deduplicateDocuments(data.documents);
                }
                this.loading = false;
            },
            error: (err) => {
                console.error('Error loading dossier:', err);
                this.loading = false;
                this.alertService.error('Erreur lors du chargement de votre dossier.');
            }
        });
    }

    /**
     * Dé-duplique les documents par type. Quand plusieurs documents du même type existent
     * (suite à plusieurs relances successives), on garde le plus pertinent :
     * - Priorité 1 : SOUMIS / RELANCE (nouveau dépôt en cours de vérification)
     * - Priorité 2 : VALIDE
     * - Priorité 3 : REJETE
     * - Priorité 4 : MANQUANTE
     * En cas d'égalité, on garde le plus récent (id le plus grand = dernier inséré).
     */
    private deduplicateDocuments(documents: any[]): any[] {
        if (!documents || documents.length === 0) return documents;

        const priority = (statut: string): number => {
            switch (statut) {
                case 'SOUMIS': return 0;
                case 'RELANCE': return 0;
                case 'VALIDE': return 1;
                case 'REJETE': return 2;
                case 'MANQUANTE': return 3;
                default: return 4;
            }
        };

        const best = new Map<string, any>();
        for (const doc of documents) {
            const type = doc.type || doc.typeDocument;
            if (!type) continue;
            const existing = best.get(type);
            if (!existing) {
                best.set(type, doc);
            } else {
                const pNew = priority(doc.statut || doc.typeEnvoie);
                const pOld = priority(existing.statut || existing.typeEnvoie);
                if (pNew < pOld || (pNew === pOld && (doc.documentId || 0) > (existing.documentId || 0))) {
                    best.set(type, doc);
                }
            }
        }
        return Array.from(best.values());
    }

    // ════════════════════════════════════════════════════════
    // PAGE LIEN INVALIDE — THREE.JS 3D LOGO
    // ════════════════════════════════════════════════════════

    private setLinkInvalid(): void {
        this.linkInvalid = true;
        // ngAfterViewInit aura déjà été appelé, donc on attend que le canvas soit dans le DOM
        setTimeout(() => this.init3DLogo(), 100);
    }

    private async init3DLogo(): Promise<void> {
        if (!this.logoCanvas?.nativeElement) return;

        try {
            // Charger Three.js et GLTFLoader dynamiquement
            await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
            await this.loadScript(
                'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'
            );

            this.buildThreeScene();
        } catch (err) {
            console.warn('Three.js non disponible, fallback visuel activé.', err);
            this.renderFallbackCanvas();
        }
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

    /** Anneau lumineux décoratif */
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

    /** Fallback si Three.js non disponible */
    private renderFallbackCanvas(): void {
        if (!this.logoCanvas?.nativeElement) return;
        const canvas = this.logoCanvas.nativeElement;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const W = canvas.width = canvas.clientWidth;
        const H = canvas.height = canvas.clientHeight;

        const draw = (t: number) => {
            ctx.clearRect(0, 0, W, H);

            // Fond dégradé
            // Remplacer dans renderFallbackCanvas() :
            const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * .7);
            bg.addColorStop(0, '#ffffff');   // ← était '#1e293b'
            bg.addColorStop(1, '#a5c2e1');   // ← était '#0f1117'
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);

            // Texte "I" animé
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

    private destroy3DScene(): void {
        if (this.threeAnimId !== null) {
            cancelAnimationFrame(this.threeAnimId);
            this.threeAnimId = null;
        }
        if (this.threeRenderer) {
            this.threeRenderer.dispose?.();
            this.threeRenderer = null;
        }
    }

    private loadScript(src: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // ════════════════════════════════════════════════════════
    // SOUMISSION FICHIERS
    // ════════════════════════════════════════════════════════

    onFileSelected(event: any, docType: string) {
        const file = event.target.files[0];
        if (file) this.selectedFiles.set(docType, file);
    }

    get canSubmit(): boolean {
        const statut = this.currentStatut;
        return this.selectedFiles.size > 0 && statut === 'EN_ATTENTE_DOCUMENT';
    }

    submitChanges() {
        const studentId = this.student?.id || this.enrollment?.studentId || (this.enrollment as any)?.etudiantId;
        if (!studentId || !this.enrollment?.id || this.submitting) return;

        this.submitting = true;
        const uploads = Array.from(this.selectedFiles.entries()).map(([type, file]) =>
            this.studentService.uploadDocumentRelance(studentId, type, file, this.enrollment?.id)
        );

        forkJoin(uploads).pipe(
            switchMap(() => {
                if (this.accessToken) {
                    return this.enrollmentService.resubmitByToken(this.accessToken);
                } else {
                    return this.enrollmentService.resubmitDemande(this.enrollment!.id!);
                }
            })
        ).subscribe({
            next: () => {
                this.submitting = false;
                this.selectedFiles.clear();
                this.alertService.success('Vos documents ont été resoumis avec succès.');
                if (this.accessToken) {
                    this.loadDossierByToken(this.accessToken);
                } else if (this.userProfile?.email) {
                    this.loadDossierData(this.userProfile.email);
                }
            },
            error: (err) => {
                this.submitting = false;
                console.error('Error resubmitting:', err);
                this.alertService.error('Une erreur est survenue lors de la resoumission.');
            }
        });
    }

    // ════════════════════════════════════════════════════════
    // HELPERS TEMPLATE
    // ════════════════════════════════════════════════════════

    isDocActionRequired(doc: any): boolean {
        const docStatut = doc.statut || doc.typeEnvoie;
        return (docStatut === 'REJETE' || docStatut === 'MANQUANTE')
            && this.currentStatut === 'EN_ATTENTE_DOCUMENT';
    }

    /** Détermine si un statut est passé dans le workflow */
    isStatusPast(targetStatus: string): boolean {
        const currentIdx = this.STATUS_ORDER.indexOf(this.currentStatut);
        const targetIdx = this.STATUS_ORDER.indexOf(targetStatus);
        return currentIdx >= targetIdx && currentIdx !== -1 && targetIdx !== -1;
    }

    /** Détermine si le statut courant est dans la liste fournie */
    isStatusCurrent(statuses: string[]): boolean {
        return statuses.includes(this.currentStatut);
    }

    getStatusLabel(status?: string): string {
        switch (status) {
            case 'SOUMIS': return 'Soumis';
            case 'EN_COURS_SCOLARITE': return 'En vérification';
            case 'EN_ATTENTE_DOCUMENT': return 'Action requise';
            case 'RELANCE': return 'Documents soumis';
            case 'SCOLARITE_VALIDEE': return 'Scolarité validée';
            case 'EN_COURS_DEPARTEMENT': return 'En cours — Département';
            case 'DEPARTEMENT_VALIDE': return 'Département validé';
            case 'FORMULAIRE_ENVOYE': return 'Formulaire envoyé';
            case 'EN_ATTENTE_PAIEMENT': return 'En attente paiement';
            case 'PAIEMENT_VALIDE': return 'Paiement validé';
            case 'REJETE_SCOLARITE': return 'Dossier rejeté';
            case 'REJETE_DEPARTEMENT': return 'Rejeté — Département';
            case 'REJETE_FINANCE': return 'Rejeté — Finance';
            case 'INSCRIT': return 'Inscrit ✓';
            default: return status || '—';
        }
    }

    getPillLabel(status?: string): string {
        switch (status) {
            case 'VALIDE': return '✓ Validé';
            case 'REJETE': return '✗ Rejeté';
            case 'MANQUANTE': return '! Manquant';
            case 'SOUMIS': return 'Soumis';
            case 'RELANCE': return '↑ Relancé';
            default: return status || '—';
        }
    }

    // ── Progress helpers ──────────────────────────────────
    getValidCount(): number { return this.documents.filter(d => (d.statut || d.typeEnvoie) === 'VALIDE').length; }
    getRejectedCount(): number { return this.documents.filter(d => (d.statut || d.typeEnvoie) === 'REJETE').length; }
    getMissingCount(): number { return this.documents.filter(d => (d.statut || d.typeEnvoie) === 'MANQUANTE').length; }

    formatGender(gendre?: string): string {
        switch (gendre) {
            case 'HOMME': return 'Masculin';
            case 'FEMME': return 'Féminin';
            default: return gendre || '—';
        }
    }

    formatDiploma(diploma?: string): string {
        if (!diploma) return '—';
        return diploma.charAt(0).toUpperCase() + diploma.slice(1).toLowerCase();
    }
}