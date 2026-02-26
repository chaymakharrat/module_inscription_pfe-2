import { Component, Input, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

declare const THREE: any;

@Component({
  selector: 'app-logo3d',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './logo3d.component.html',
  styleUrls: ['./logo3d.component.css']
})
export class Logo3dComponent implements AfterViewInit, OnDestroy {

  @ViewChild('logoCanvas') logoCanvas?: ElementRef<HTMLCanvasElement>;

  // ── Inputs personnalisables ──
  @Input() title = 'Accès non autorisé';
  @Input() subtitle = 'Votre lien d\'accès sécurisé a expiré ou n\'est plus valide.<br>Pour protéger vos données, l\'accès a été verrouillé.';
  @Input() contactEmail = 'scolarite@itech.edu';
  @Input() contactLabel = 'Contacter la scolarité';

  private threeRenderer: any = null;
  private threeAnimId: number | null = null;

  ngAfterViewInit(): void {
    this.init3DLogo();
  }

  ngOnDestroy(): void {
    if (this.threeAnimId !== null) cancelAnimationFrame(this.threeAnimId);
    this.threeRenderer?.dispose?.();
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

  private buildThreeScene(): void {
    const canvas = this.logoCanvas!.nativeElement;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xffffff, 0);
    renderer.outputEncoding = (THREE as any).sRGBEncoding || 3001;
    renderer.toneMapping = (THREE as any).ACESFilmicToneMapping || 4;
    renderer.toneMappingExposure = 1.4;
    this.threeRenderer = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 0, 5);

    scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    const keyLight = new THREE.DirectionalLight(0x6395f8, 2.5);
    keyLight.position.set(3, 5, 5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x7c3aed, 1.5);
    fillLight.position.set(-4, -2, 3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x2563eb, 1.8);
    rimLight.position.set(0, -3, -5);
    scene.add(rimLight);

    const warmLight = new THREE.PointLight(0x93c5fd, 1.2, 20);
    warmLight.position.set(2, 2, 2);
    scene.add(warmLight);

    const loader = new (THREE as any).GLTFLoader();
    loader.load(
      'assets/logo+3d+rotatif.glb',
      (gltf: any) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const scale = 2.5 / Math.max(size.x, size.y, size.z);

        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
        model.rotation.y = Math.PI;

        model.traverse((child: any) => {
          if (child.isMesh) {
            child.material?.envMapIntensity !== undefined && (child.material.envMapIntensity = 1.5);
            child.castShadow = true;
          }
        });

        scene.add(model);
        this.addParticles(scene);
        this.addGlowRings(scene);

        let t = 0;
        const animate = () => {
          this.threeAnimId = requestAnimationFrame(animate);
          t += 0.01;
          model.rotation.y += 0.008;
          model.rotation.x = Math.sin(t * 0.4) * 0.08;
          model.position.y = Math.sin(t * 0.6) * 0.1;
          keyLight.intensity = 2.5 + Math.sin(t * 0.9) * 0.4;
          fillLight.intensity = 1.5 + Math.cos(t * 0.7) * 0.3;
          renderer.render(scene, camera);
        };
        animate();
      },
      undefined,
      () => this.renderFallbackCanvas()
    );

    window.addEventListener('resize', () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
  }

  private addParticles(scene: any): void {
    const positions = new Float32Array(600 * 3).map(() => (Math.random() - 0.5) * 30);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x6395f8, size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.7
    })));
  }

  private addGlowRings(scene: any): void {
    const r1 = new THREE.Mesh(
      new THREE.TorusGeometry(1.8, 0.02, 16, 120),
      new THREE.MeshBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.35 })
    );
    r1.rotation.x = Math.PI / 3;
    scene.add(r1);

    const r2 = new THREE.Mesh(
      new THREE.TorusGeometry(2.3, 0.015, 16, 120),
      new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.2 })
    );
    r2.rotation.x = -Math.PI / 4;
    r2.rotation.z = Math.PI / 6;
    scene.add(r2);
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
      const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(1, '#a5c2e1');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const pulse = 1 + Math.sin(t * 0.03) * 0.05;
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
}