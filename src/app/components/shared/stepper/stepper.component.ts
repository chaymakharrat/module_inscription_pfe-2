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
    <div class="stepper-outer">
      <div class="steps-row">
        <div *ngFor="let step of steps; let i = index" class="step-wrapper">
          
          <div class="step-node" 
               [class.is-active]="isActive(step)" 
               [class.is-completed]="isCompleted(step)"
               [class.is-rejected]="isRejected(step)">
            
            <div class="step-circle-container">
              <!-- Pulse effect for active step -->
              <div *ngIf="isActive(step) && !isRejected(step)" class="pulse-ring"></div>
              
              <div class="step-circle">
                <ng-container *ngIf="isCompleted(step); else showIcon">
                  <svg *ngIf="!isRejected(step)" class="icon-svg success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <svg *ngIf="isRejected(step)" class="icon-svg error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </ng-container>
                <ng-template #showIcon>
                  <div [innerHTML]="getStepSvg(step.id)" class="icon-svg-wrapper"></div>
                </ng-template>
              </div>
            </div>
            
            <div class="step-content">
              <span class="step-index">STEP 0{{ step.id }}</span>
              <span class="step-name">{{ step.name }}</span>
            </div>
          </div>

          <!-- Vertical/Horizontal Connector -->
          <div *ngIf="i < steps.length - 1" class="step-connector">
            <div class="connector-line" [class.is-flowing]="isActive(steps[i+1])"></div>
          </div>
        </div>
      </div>

      <!-- Compact Progress indicator -->
      <div class="progress-mini">
        <div class="progress-track-bg">
          <div class="progress-thumb" [style.width.%]="progressPercentage">
            <div class="progress-glow"></div>
          </div>
        </div>
        <div class="progress-info">
          <span class="progress-val">{{ progressPercentage }}%</span>
          <span class="progress-label">Complété</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }

    .stepper-outer {
      background: rgba(255, 255, 255, 0.6);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.5);
      border-radius: 2.5rem;
      padding: 2rem;
      box-shadow: 
        0 4px 6px -1px rgba(0,0,0,0.02),
        0 20px 40px -10px rgba(0,0,0,0.05),
        inset 0 0 0 1px rgba(255,255,255,0.4);
    }

    .steps-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .step-wrapper {
      display: flex;
      align-items: center;
      flex: 1;
    }

    .step-wrapper:last-child { flex: none; }

    .step-node {
      display: flex;
      align-items: center;
      gap: 1.25rem;
      position: relative;
    }

    .step-circle-container {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .step-circle {
      width: 52px;
      height: 52px;
      border-radius: 1.25rem;
      background: #fff;
      border: 2px solid #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 2;
      box-shadow: 0 8px 15px -3px rgba(0,0,0,0.04);
    }

    .pulse-ring {
      position: absolute;
      width: 100%;
      height: 100%;
      background: rgba(59, 130, 246, 0.15);
      border-radius: 1.25rem;
      animation: pulse-ring 2s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite;
      z-index: 1;
    }

    @keyframes pulse-ring {
      0% { transform: scale(0.95); opacity: 0.8; }
      100% { transform: scale(1.6); opacity: 0; }
    }

    .icon-svg { width: 22px; height: 22px; transition: all 0.3s ease; }
    .icon-svg-wrapper { display: flex; align-items: center; color: #94a3b8; transition: all 0.3s; }

    /* Active State */
    .is-active .step-circle {
      border-color: #3b82f6;
      background: #fff;
      transform: scale(1.05);
      box-shadow: 0 15px 25px -5px rgba(59, 130, 246, 0.15);
    }
    .is-active .icon-svg-wrapper { color: #2563eb; transform: scale(1.1); }

    /* Completed State */
    .is-completed .step-circle {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      border-color: #2563eb;
      color: #fff;
      box-shadow: 0 10px 20px -5px rgba(37, 99, 235, 0.3);
    }
    .is-completed .icon-svg { transform: scale(1.1); }

    /* Rejected State */
    .is-rejected .step-circle {
      background: #fef2f2;
      border-color: #ef4444;
      color: #ef4444;
      box-shadow: 0 10px 20px -5px rgba(239, 68, 68, 0.15);
    }

    .step-content { display: flex; flex-direction: column; }

    .step-index {
      font-size: 0.6rem;
      font-weight: 900;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      margin-bottom: 2px;
      transition: all 0.3s;
    }

    .step-name {
      font-size: 0.875rem;
      font-weight: 900;
      color: #334155;
      white-space: nowrap;
      transition: all 0.3s;
    }

    .is-active .step-index { color: #3b82f6; }
    .is-active .step-name { color: #0f172a; }
    .is-completed .step-name { color: #2563eb; }

    /* Connector */
    .step-connector {
      flex: 1;
      height: 4px;
      margin: 0 2rem;
      background: #f1f5f9;
      border-radius: 99px;
      position: relative;
      overflow: hidden;
    }

    .connector-line {
      position: absolute;
      top: 0; left: 0; height: 100%;
      background: #3b82f6;
      width: 0;
      transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
      border-radius: 99px;
    }

    .is-completed + .step-connector .connector-line { 
      width: 100%; 
      background: linear-gradient(to right, #3b82f6, #2563eb);
    }

    /* Flowing animation for the connector towards active step */
    .is-flowing::after {
      content: "";
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);
      animation: flow 1.5s infinite;
    }

    @keyframes flow {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }

    /* Progress mini */
    .progress-mini {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem;
      padding: 0.5rem 0.25rem 0;
    }

    .progress-track-bg {
      flex: 1;
      height: 8px;
      background: #f1f5f9;
      border-radius: 99px;
      overflow: hidden;
      position: relative;
    }

    .progress-thumb {
      height: 100%;
      background: linear-gradient(to right, #3b82f6 0%, #8b5cf6 100%);
      border-radius: 99px;
      transition: width 1s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
    }

    .progress-glow {
      position: absolute;
      top: 0; right: 0;
      width: 20px; height: 100%;
      background: rgba(255,255,255,0.3);
      filter: blur(4px);
    }

    .progress-info {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      min-width: 80px;
    }

    .progress-val {
      font-size: 0.875rem;
      font-weight: 900;
      color: #2563eb;
      line-height: 1;
    }

    .progress-label {
      font-size: 0.6rem;
      font-weight: 800;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    @media (max-width: 768px) {
      .stepper-outer { padding: 1.25rem; border-radius: 1.5rem; }
      .step-name { display: none; }
      .step-connector { margin: 0 0.75rem; }
      .step-index { font-size: 0.55rem; }
    }
  `]
})
export class StepperComponent {
  @Input() currentStep: number = 1;
  @Input() steps: Step[] = [
    { id: 1, name: 'Identité & Contact', icon: '' },
    { id: 2, name: 'Parcours Académique', icon: '' },
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

  getStepClass(step: Step): string {
    if (this.isRejected(step)) return 'step-circle rejected';
    if (this.isCompleted(step)) return 'step-circle completed';
    if (this.isActive(step)) return 'step-circle active';
    return 'step-circle inactive';
  }

  getStepSvg(id: number): string {
    if (id === 1) return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    if (id === 2) return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-graduation-cap"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>';
    return '';
  }
}