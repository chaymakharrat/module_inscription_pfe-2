import { Component, ViewChild, ElementRef, AfterViewInit, HostListener, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';
import { Router } from '@angular/router';
import { PreInscriptionComponent } from '../pre-inscription/pre-inscription.component';
import { ScrollService } from '../../services/scroll.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, PreInscriptionComponent],
  template: `
    <div class="w-full">
      <!-- Landing Page Section -->
      <div class="relative h-[100vh] w-full overflow-hidden font-sans" #landingSection>
        <!-- Vidéo en arrière-plan -->
        <video 
          #backgroundVideo
          autoplay 
          loop 
          muted 
          playsinline
          class="absolute inset-0 w-full h-full object-cover scale-105"
          [style.transform]="videoTransform"
        >
          <source src="assets/video_robot.mp4" type="video/mp4" />
        </video>

        <!-- Overlay gradient -->
        <div class="absolute inset-0" style="background: linear-gradient(180deg, rgba(105, 125, 170, 0.75) 0%, rgba(30,58,138,0.50) 40%, rgba(49,46,129,0.55) 70%, rgba(15,23,42,0.80) 100%);"></div>

        <!-- Floating Particles -->
        <div class="absolute inset-0 overflow-hidden pointer-events-none">
          <div class="particle" *ngFor="let i of [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]"></div>
        </div>

        <!-- Contenu -->
        <div class="relative z-10 flex flex-col items-center justify-center h-full text-white px-4">
          <div [@fadeInUp] class="text-center max-w-5xl">
            <div class="mb-12 hero-reveal">
              <span class="px-4 py-2 rounded-full glass-morphism text-xs tracking-[0.4em] uppercase font-bold text-blue-300 mt-24 mb-6 inline-block">
                ITECH UNIVERSITY • EXCELLENCE
              </span>
              <h1 class="text-4xl md:text-6xl font-black mb-6 tracking-tight hero-text-shadow text-white leading-tight">
                Rejoignez <span class="inline-block">{{typedText}}<span class="cursor">|</span></span>
              </h1>
              <p class="text-xl md:text-3xl mb-12 text-gray-300 font-light max-w-3xl mx-auto leading-relaxed">
                Façonnez votre avenir dans une université à la pointe de l'innovation technologique.
              </p>
            </div>

            <!-- Statistiques -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 max-w-4xl mx-auto">
              <div class="stat-card glass-morphism rounded-2xl p-8 border border-white/10">
                <div class="text-5xl font-black mb-2 text-white">{{studentsCount}}+</div>
                <div class="text-sm font-bold tracking-widest uppercase text-blue-200">Étudiants</div>
              </div>
              <div class="stat-card glass-morphism rounded-2xl p-8 border border-white/10">
                <div class="text-5xl font-black mb-2 text-white">{{employabilityRate}}%</div>
                <div class="text-sm font-bold tracking-widest uppercase text-blue-200">Employabilité</div>
              </div>
              <div class="stat-card glass-morphism rounded-2xl p-8 border border-white/10">
                <div class="text-5xl font-black mb-2 text-white">{{programsCount}}+</div>
                <div class="text-sm font-bold tracking-widest uppercase text-blue-200">Programmes</div>
              </div>
            </div>

            <!-- Dynamic Scroll Arrows Instead of Button -->
            <div class="flex flex-col items-center justify-center mt-8">
              <button
                (click)="scrollToForm()"
                class="scroll-arrows-container flex flex-col items-center gap-1 group cursor-pointer bg-transparent border-none p-4"
              >
                <span class="text-blue-300 text-xs tracking-[0.3em] uppercase mb-4 group-hover:text-white transition-colors">Défiler pour s'inscrire</span>
                <div class="arrows-wrapper flex flex-col items-center">
                  <div class="arrow-down"></div>
                  <div class="arrow-down delay-1"></div>
                  <div class="arrow-down delay-2"></div>
                </div>
              </button>
            </div>

            <p class="mt-8 text-sm text-gray-400 flex items-center justify-center gap-3">
              <span class="flex h-3 w-3 relative">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
              </span>
              Session d'inscription ouverte pour 2024-2025
            </p>
          </div>

          <!-- Scroll indicator Arrow -->
          <div class="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-400">
            <span class="text-[10px] uppercase tracking-[0.3em]">Découvrir</span>
            <div class="w-px h-12 bg-gradient-to-b from-blue-500 to-transparent animate-bounce"></div>
          </div>
        </div>
      </div>

      <!-- Formulaire Section -->
      <div #formSection class="w-full bg-gray-50">
        <div class="hero-wave">
          <svg viewBox="0 0 1440 80" xmlns="http://www.w3.org/2000/svg">
            <path fill="#f9fafb" d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z"/>
          </svg>
        </div>  
        <app-pre-inscription></app-pre-inscription>
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

  constructor(
    private router: Router,
    private scrollService: ScrollService
  ) { }

  ngOnInit() {
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