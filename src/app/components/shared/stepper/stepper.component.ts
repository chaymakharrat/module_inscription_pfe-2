import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface Step {
  id: number;
  name: string;
  icon: string;
  status?: 'completed' | 'active' | 'pending' | 'rejected';
}

@Component({
  selector: 'app-stepper',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="stepper-container">
      <div class="stepper-glass-card">
        <div class="steps-wrapper">
          <div *ngFor="let step of steps; let i = index" class="step-item" [style.flex]="i < steps.length - 1 ? '1' : '0 0 auto'">
            
            <div class="step-node" 
                 [class.active]="isActive(step)" 
                 [class.completed]="isCompleted(step)"
                 [class.rejected]="isRejected(step)">
              
              <div class="circle-wrapper">
                <!-- Outer Ring (Active Glow) -->
                <div class="glow-ring" *ngIf="isActive(step)"></div>
                
                <div class="circle-base">
                  <div class="inner-content">
                    <ng-container *ngIf="isCompleted(step); else showIconOrIndex">
                      <svg *ngIf="!isRejected(step)" class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      <svg *ngIf="isRejected(step)" class="status-icon error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </ng-container>
                    <ng-template #showIconOrIndex>
                      <div [innerHTML]="getStepSvg(step.id)" class="step-icon"></div>
                    </ng-template>
                  </div>
                </div>
              </div>
              
              <div class="step-label">
                <span class="label-badge">0{{ step.id }}</span>
                <span class="label-text">{{ step.name }}</span>
              </div>
            </div>

            <!-- Connector Line -->
            <div *ngIf="i < steps.length - 1" class="connector">
              <div class="connector-track">
                <div class="connector-progress" [class.filled]="isCompleted(step)" [class.flowing]="isActive(steps[i+1])"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Master Progress Footer -->
        <div class="stepper-footer">
          <div class="progress-bar-container">
            <div class="progress-bar-fill" [style.width.%]="progressPercentage">
              <div class="energy-bead"></div>
            </div>
          </div>
          <div class="progress-meta">
            <span class="meta-label">Progression de l'admission</span>
            <span class="meta-value">{{ progressPercentage }}%</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; font-family: 'Inter', system-ui, -apple-system, sans-serif; }

    .stepper-container {
      position: relative;
      padding: 1.5rem 0.5rem;
      perspective: 1000px;
    }

    /* Decorative Background Elements */
    .stepper-bg-decor {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      overflow: hidden;
      pointer-events: none;
      z-index: 0;
      opacity: 0.4;
    }

    .blob {
      position: absolute;
      filter: blur(40px);
      border-radius: 50%;
    }
    .blob-1 { width: 15136s; height: 100px; background: rgba(13, 71, 161, 0.1); top: -20px; left: 10%; }
    .blob-2 { width: 120px; height: 120px; background: rgba(0, 188, 212, 0.1); bottom: -30px; right: 15%; }

    .stepper-glass-card {
      position: relative;
      z-index: 1;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.7) 0%, rgba(214, 229, 245, 0.7) 100%);
      backdrop-filter: blur(25px) saturate(200%);
      -webkit-backdrop-filter: blur(25px) saturate(200%);
      border: 1px solid rgba(255, 255, 255, 0.5);
      border-radius: 2.5rem;
      padding: 2.5rem;
      box-shadow: 
        0 4px 24px -1px rgba(0,0,0,0.03),
        0 40px 80px -20px rgba(13, 71, 161, 0.08);
    }

    .steps-wrapper {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 2.5rem;
    }

    .step-item {
      display: flex;
      align-items: center;
      position: relative;
    }

    .step-node {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      position: relative;
      z-index: 2;
    }

    .circle-wrapper {
      position: relative;
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .circle-base {
      width: 100%;
      height: 100%;
      background: #ffffff;
      border: 1px solid #f1f5f9;
      border-radius: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 
        0 10px 20px -5px rgba(0,0,0,0.05),
        inset 0 -4px 0 rgba(0,0,0,0.02);
      transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
      overflow: hidden;
    }

    .inner-content {
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.4s;
    }

    .step-icon {
      color: #94a3b8;
      display: flex;
      align-items: center;
      transition: all 0.4s;
    }

    /* Active State Elevation */
    .active .circle-base {
      background: #fff;
      border: 2px solid #0d47a1;
      transform: translateY(-5px) scale(1.05);
      box-shadow: 
        0 20px 40px -10px rgba(13, 71, 161, 0.2),
        0 0 0 1px rgba(13, 71, 161, 0.1);
    }
    .active .step-icon { color: #0d47a1; transform: scale(1.1); }
    .active .label-text { color: #0f172a; transform: translateY(-3px); }

    .glow-ring {
      position: absolute;
      top: -15%; left: -15%; width: 130%; height: 130%;
      background: radial-gradient(circle, rgba(13,71,161,0.15) 0%, transparent 70%);
      border-radius: 50%;
      animation: ripple 2s infinite ease-out;
    }

    @keyframes ripple {
      0% { transform: scale(0.8); opacity: 1; }
      100% { transform: scale(1.4); opacity: 0; }
    }

    /* Completed State Mastery */
    .completed .circle-base {
      background: linear-gradient(145deg, #0d47a1 0%, #1a237e 100%);
      border-color: #0d47a1;
      box-shadow: 
        0 10px 25px -5px rgba(13, 71, 161, 0.4),
        inset 0 4px 6px rgba(255,255,255,0.2);
    }
    .status-icon { width: 22px; height: 22px; color: #fff; }
    .completed .label-text { color: #2563eb; }

    /* Rejected State */
    .rejected .circle-base {
      background: #fff;
      border-color: #ef4444;
      box-shadow: 0 10px 20px -5px rgba(239, 68, 68, 0.1);
    }
    .status-icon.error { color: #ef4444; }

    /* Label Styling */
    .step-label {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      transition: all 0.4s;
    }

    .label-badge {
      font-size: 0.6rem;
      font-weight: 900;
      color: #94a3b8;
      letter-spacing: 0.15em;
      margin-bottom: 4px;
    }

    .label-text {
      font-size: 0.75rem;
      font-weight: 800;
      color: #64748b;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Connector Pipe */
    .connector {
      flex: 1;
      height: 40px;
      display: flex;
      align-items: center;
      margin: 0 -15px;
      transform: translateY(-25px);
    }

    .connector-track {
      width: 100%;
      height: 6px;
      background: #f1f5f9;
      border-radius: 99px;
      overflow: hidden;
      position: relative;
    }

    .connector-progress {
      height: 100%;
      background: #f1f5f9;
      width: 0%;
      transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
    }

    .connector-progress.filled {
      width: 100%;
      background: linear-gradient(to right, #0d47a1, #1565c0);
    }

    .connector-progress.flowing {
      width: 100%;
      background: #f1f5f9;
    }

    .connector-progress.flowing::after {
      content: "";
      position: absolute;
      top: 0; left: 0; width: 40%; height: 100%;
      background: linear-gradient(90deg, transparent, rgba(13, 71, 161, 0.3), transparent);
      animation: slide-energy 1.5s infinite linear;
    }

    @keyframes slide-energy {
      0% { left: -40%; }
      100% { left: 100%; }
    }

    /* Master Progress Footer */
    .stepper-footer {
      border-top: 1px solid rgba(0,0,0,0.05);
      padding-top: 1.5rem;
    }

    .progress-bar-container {
      width: 100%;
      height: 10px;
      background: #f1f5f9;
      border-radius: 99px;
      overflow: hidden;
      margin-bottom: 0.75rem;
      position: relative;
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(to right, #0d47a1 0%, #00bcd4 100%);
      border-radius: 99px;
      transition: width 1.2s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
      box-shadow: 0 0 15px rgba(0, 188, 212, 0.4);
    }

    .energy-bead {
      position: absolute;
      top: 0; right: 0;
      width: 30px; height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);
    }

    .progress-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .meta-label { font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
    .meta-value { font-size: 0.9rem; font-weight: 900; color: #0d47a1; }

    @media (max-width: 768px) {
      .stepper-glass-card { padding: 1.5rem; border-radius: 1.5rem; }
      .label-text { font-size: 0.6rem; display: none; }
      .circle-wrapper { width: 44px; height: 44px; }
      .circle-base { border-radius: 1rem; }
      .connector { transform: translateY(-18px); }
    }
  `]
})
export class StepperComponent {
  @Input() currentStep: number = 1;
  @Input() steps: Step[] = [
    { id: 1, name: 'Identification', icon: '' },
    { id: 2, name: 'Profil & Contact', icon: '' },
    { id: 3, name: 'Dossier Scolaire', icon: '' },
    { id: 4, name: 'Choix de Formation', icon: '' },
  ];

  get progressPercentage(): number {
    return Math.round(((this.currentStep - 1) / (this.steps.length - 1)) * 100);
  }

  isCompleted(step: Step): boolean {
    if (step.status) return step.status === 'completed';
    return this.currentStep > step.id;
  }

  isActive(step: Step): boolean {
    if (step.status) return step.status === 'active';
    return this.currentStep === step.id;
  }

  isRejected(step: Step): boolean {
    return step.status === 'rejected';
  }

  getStepSvg(id: number): string {
    const size = 20;
    const stroke = 2.5;
    if (id === 1) return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    if (id === 2) return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
    if (id === 3) return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    if (id === 4) return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
    return '';
  }
}