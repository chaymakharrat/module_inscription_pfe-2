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
          
          <div class="step-node" [class.is-active]="isActive(step)" [class.is-completed]="isCompleted(step)">
            <div class="step-circle" [class.is-rejected]="isRejected(step)">
              <ng-container *ngIf="isCompleted(step); else showIcon">
                <svg *ngIf="!isRejected(step)" class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <svg *ngIf="isRejected(step)" class="icon-svg text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </ng-container>
              <ng-template #showIcon>
                <div [innerHTML]="getStepSvg(step.id)" class="icon-svg-wrapper"></div>
              </ng-template>
            </div>
            
            <div class="step-content">
              <span class="step-index">0{{ step.id }}</span>
              <span class="step-name">{{ step.name }}</span>
            </div>
          </div>

          <!-- Vertical/Horizontal Connector -->
          <div *ngIf="i < steps.length - 1" class="step-connector">
            <div class="connector-line"></div>
          </div>
        </div>
      </div>

      <!-- Compact Progress indicator -->
      <div class="progress-mini">
        <div class="progress-track-bg">
          <div class="progress-thumb" [style.width.%]="progressPercentage"></div>
        </div>
        <span class="progress-text">{{ progressPercentage }}% complété</span>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }

    .stepper-outer {
      background: rgba(255, 255, 255, 0.4);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 2rem;
      padding: 1.5rem;
      box-shadow: 0 10px 30px -5px rgba(0,0,0,0.03);
    }

    .steps-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.5rem;
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
      gap: 1rem;
      position: relative;
    }

    .step-circle {
      width: 48px;
      height: 48px;
      border-radius: 1rem;
      background: #fff;
      border: 1.5px solid #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
    }

    .icon-svg { width: 20px; height: 20px; }
    .icon-svg-wrapper { display: flex; align-items: center; color: #94a3b8; }

    .is-active .step-circle {
      border-color: #3b82f6;
      background: #eff6ff;
      transform: scale(1.1);
      box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.2);
    }
    .is-active .icon-svg-wrapper { color: #2563eb; }

    .is-completed .step-circle {
      background: #3b82f6;
      border-color: #3b82f6;
      color: #fff;
    }

    .step-circle.is-rejected {
      background: #fef2f2;
      border-color: #ef4444;
    }

    .step-content { display: flex; flex-direction: column; }

    .step-index {
      font-size: 0.65rem;
      font-weight: 800;
      color: #94a3b8;
      letter-spacing: 0.1em;
      margin-bottom: -2px;
    }

    .step-name {
      font-size: 0.8125rem;
      font-weight: 800;
      color: #1e293b;
      white-space: nowrap;
    }

    .is-active .step-index { color: #3b82f6; }
    .is-active .step-name { color: #0f172a; }

    /* Connector */
    .step-connector {
      flex: 1;
      height: 2px;
      margin: 0 1.5rem;
      background: #f1f5f9;
      border-radius: 99px;
      position: relative;
    }

    .connector-line {
      position: absolute;
      top: 0; left: 0; height: 100%;
      background: #3b82f6;
      width: 0;
      transition: width 0.6s ease;
    }

    .is-completed + .step-connector .connector-line { width: 100%; }

    /* Progress mini */
    .progress-mini {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .progress-track-bg {
      flex: 1;
      height: 6px;
      background: #f1f5f9;
      border-radius: 99px;
      overflow: hidden;
    }

    .progress-thumb {
      height: 100%;
      background: linear-gradient(to right, #3b82f6, #8b5cf6);
      border-radius: 99px;
      transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .progress-text {
      font-size: 0.7rem;
      font-weight: 900;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    @media (max-width: 640px) {
      .step-name { display: none; }
      .step-connector { margin: 0 0.5rem; }
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