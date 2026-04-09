import { Component, ViewChild, ElementRef, AfterViewInit, HostListener, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';
import { Router } from '@angular/router';
import { PreInscriptionComponent } from '../pre-inscription/pre-inscription.component';
import { ScrollService } from '../../services/scroll.service';
import { ScolariteService } from '../../services/scolarite.service';
import { AnneeUniversitaire } from '../../models/academic-year.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, PreInscriptionComponent],
  template: `
    <div class="flex flex-col lg:flex-row-reverse min-h-screen">
      <!-- Right Side: Landing Content (Sticky on LG) -->
      <div class="w-full lg:w-[40%] lg:h-screen lg:sticky lg:top-0 overflow-hidden relative" #landingSection>
        <!-- Vidéo en arrière-plan -->
        <video 
          #backgroundVideo
          autoplay 
          loop 
          muted 
          playsinline
          class="absolute inset-0 w-full h-full object-cover scale-110"
          [style.transform]="videoTransform"
        >
          <source src="assets/video_robot.mp4" type="video/mp4" />
        </video>

        <!-- Overlay gradient -->
        <div class="absolute inset-0 sidebar-overlay"></div>

        <!-- Floating Particles -->
        <div class="absolute inset-0 overflow-hidden pointer-events-none">
          <div class="particle" *ngFor="let i of [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]"></div>
        </div>

        <!-- Contenu Sidebar -->
        <div class="relative z-10 flex flex-col justify-between h-full text-white p-8 lg:p-12">
          
          <div class="flex flex-col gap-8">
            <div [@fadeInUp]>
              <span class="px-4 py-2 rounded-full glass-morphism text-[10px] tracking-[0.4em] uppercase font-bold text-blue-300 mb-6 inline-block">
                ITECH • EXCELLENCE
              </span>
              <h1 class="text-3xl md:text-5xl font-black mb-6 tracking-tight hero-text-shadow leading-tight">
                Rejoignez <span class="text-blue-400">{{typedText}}<span class="cursor">|</span></span>
              </h1>
              <p class="text-lg text-gray-300 font-light max-w-md leading-relaxed">
                Façonnez votre avenir dans une université à la pointe de l'innovation technologique.
              </p>
            </div>

          </div>

          <!-- Bottom Footer Info -->
          <div class="pb-4 text-right">
            <p class="text-xs text-blue-300/60 flex items-center justify-end gap-3">
              Inscriptions {{currentYear}} • Ouvertes
              <span class="flex h-2 w-2 relative">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
            </p>
          </div>
        </div>
      </div>

      <!-- Left Side: Formulaire Section -->
      <div #formSection class="w-full lg:w-[60%] mesh-bg relative lg:h-screen lg:overflow-y-auto custom-scrollbar">
        <div class="py-10 px-4 md:px-8 lg:px-12">
            <app-pre-inscription></app-pre-inscription>
        </div>
      </div>
    </div>
  `,
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(40px)' }),
        animate('1000ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ],
  styleUrl: './home.component.css'
})
export class HomeComponent implements AfterViewInit, OnInit, OnDestroy {
  @ViewChild('formSection') formSection!: ElementRef;
  @ViewChild('backgroundVideo') backgroundVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('landingSection') landingSection!: ElementRef;
  @ViewChild('featuresSection') featuresSection!: ElementRef;

  // Parallax effect
  videoTransform = 'scale(1.05)';

  // Typing effect
  typedText = '';
  private fullTextArray = ["l'Excellence", "l'Innovation", "votre Futur", "la Réussite"];
  private textIndex = 0;
  private charIndex = 0;
  private isDeleting = false;
  private typingSpeed = 150;
  // Animated counters
  studentsCount = 0;
  employabilityRate = 0;
  programsCount = 0;
  private countersAnimated = false;
  private scrollSubscription?: Subscription;
  private observer?: IntersectionObserver;

  currentYear = '2024-2025';

  constructor(
    private router: Router,
    private scrollService: ScrollService,
    private scolariteService: ScolariteService
  ) { }

  ngOnInit() {
    // 🆕 Charger l'année courante dynamiquement
    this.scolariteService.getAnneeCouranteDetails().subscribe(res => {
      if (res && res.annee) {
        this.currentYear = res.annee;
      }
    });

    // Start counter animations after a short delay
    setTimeout(() => this.animateCounters(), 500);

    // Start typing effect
    this.startTypingEffect();

    // Écouter le service de scroll
    this.scrollSubscription = this.scrollService.scroll$.subscribe(scrollTop => {
      this.handleScrollUpdate(scrollTop);
    });
  }

  private startTypingEffect() {
    const currentFullText = this.fullTextArray[this.textIndex];

    if (this.isDeleting) {
      this.typedText = currentFullText.substring(0, this.charIndex - 1);
      this.charIndex--;
      this.typingSpeed = 50;
    } else {
      this.typedText = currentFullText.substring(0, this.charIndex + 1);
      this.charIndex++;
      this.typingSpeed = 150;
    }

    if (!this.isDeleting && this.charIndex === currentFullText.length) {
      this.isDeleting = true;
      this.typingSpeed = 2000; // Pause at the end
    } else if (this.isDeleting && this.charIndex === 0) {
      this.isDeleting = false;
      this.textIndex = (this.textIndex + 1) % this.fullTextArray.length;
      this.typingSpeed = 500;
    }

    setTimeout(() => this.startTypingEffect(), this.typingSpeed);
  }

  ngOnDestroy() {
    if (this.scrollSubscription) {
      this.scrollSubscription.unsubscribe();
    }
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  ngAfterViewInit() {
    // S'assurer que la vidéo est muette et forcer la lecture
    if (this.backgroundVideo?.nativeElement) {
      const video = this.backgroundVideo.nativeElement;
      video.muted = true;
      video.volume = 0;
      video.play().catch(() => {
        // Autoplay bloqué par le navigateur, on réessaie après interaction
        const tryPlay = () => {
          video.play();
          document.removeEventListener('click', tryPlay);
        };
        document.addEventListener('click', tryPlay);
      });
    }

    // Initialiser l'Intersection Observer pour les animations scroll
    this.initScrollReveal();
  }

  private initScrollReveal() {
    const options = {
      threshold: 0.15,
      rootMargin: '0px 0px -50px 0px'
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          // Optionnel: arrêter d'observer une fois révélé
          // this.observer?.unobserve(entry.target);
        }
      });
    }, options);

    // Observer tous les éléments avec la classe .reveal
    const revealElements = document.querySelectorAll('.reveal');
    revealElements.forEach(el => this.observer?.observe(el));
  }

  private handleScrollUpdate(scrolled: number) {
    const parallaxSpeed = 0.5;

    // Parallax video effect
    this.videoTransform = `translateY(${scrolled * parallaxSpeed}px)`;

    // Trigger counter animation when landing section is in view
    if (!this.countersAnimated && this.landingSection) {
      const rect = this.landingSection.nativeElement.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        this.animateCounters();
        this.countersAnimated = true;
      }
    }
  }

  @HostListener('window:scroll')
  onScroll() {
    const scrolled = window.pageYOffset || document.documentElement.scrollTop;
    this.handleScrollUpdate(scrolled);
  }

  private animateCounters() {
    this.animateCounter('students', 5000, 2000);
    this.animateCounter('employability', 95, 2000);
    this.animateCounter('programs', 20, 1500);
  }

  private animateCounter(type: 'students' | 'employability' | 'programs', target: number, duration: number) {
    const start = 0;
    const increment = target / (duration / 16);
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }

      switch (type) {
        case 'students':
          this.studentsCount = Math.floor(current);
          break;
        case 'employability':
          this.employabilityRate = Math.floor(current);
          break;
        case 'programs':
          this.programsCount = Math.floor(current);
          break;
      }
    }, 16);
  }

  scrollToForm() {
    if (this.formSection) {
      this.formSection.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }
}