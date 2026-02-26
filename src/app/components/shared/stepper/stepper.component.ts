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
     <div class="w-full py-8">
      <div class="flex items-center justify-between max-w-3xl mx-auto px-4">
        <div *ngFor="let step of steps; let i = index" class="step-item">

          <!-- Step circle with gradient border -->
          <div class="step-node">
            <div [class]="getStepClass(step)">
              <ng-container *ngIf="isCompleted(step); else showIcon">
                <svg class="checkmark" fill="none" stroke="currentColor" viewBox="0 0 24 24" *ngIf="!isRejected(step)">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                </svg>
                <svg class="checkmark text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" *ngIf="isRejected(step)">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M18 6L6 18M6 6l12 12" />
                </svg>
              </ng-container>
              <ng-template #showIcon>
                <span class="step-emoji">{{ step.icon }}</span>
              </ng-template>
            </div>

            <!-- Step label -->
            <div [class]="'step-label ' + (isActive(step) ? 'label-active' : 'label-default')">
              {{ step.name }}
            </div>
          </div>

          <!-- Connector line -->
          <div *ngIf="i < steps.length - 1" class="connector">
            <div
              class="connector-fill"
              [style.width]="isCompleted(step) ? '100%' : '0%'"
            ></div>
          </div>

        </div>
      </div>

      <!-- Animated progress bar -->
      <div class="progress-section">
        <div class="progress-track">
          <div
            class="progress-fill"
            [style.width]="progressPercentage + '%'"
          ></div>
        </div>
        <div class="progress-label">{{ progressPercentage }}%</div>
      </div>
    </div>
  `,
  styles: [`
    /* ---- Wrapper ---- */
    .stepper-wrapper {
      width: 100%;
      padding: 2rem 1.5rem 1.5rem;
      background: #ffffff;
      border-radius: 1.25rem;
      border: 2px solid transparent;
      background-clip: padding-box;
      position: relative;
    }

    /* Gradient border via pseudo-element */
    .stepper-wrapper::before {
      content: '';
      position: absolute;
      inset: -2px;
      border-radius: calc(1.25rem + 2px);
      background: linear-gradient(135deg, #ffffff 0%, #d6e5f5 50%, #3b82f6 100%);
      z-index: -1;
    }

    /* ---- Steps row ---- */
    .steps-container {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      max-width: 640px;
      margin: 0 auto;
    }

    .step-item {
      display: flex;
      flex: 1;
      align-items: center;
    }

    /* ---- Step node (circle + label) ---- */
    .step-node {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
    }

    /* Circle base */
    .step-circle {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
      cursor: default;
    }

    /* Active: gradient border + white fill */
    .step-circle.active {
      background: #ffffff;
      box-shadow:
        0 0 0 2.5px transparent,
        0 10px 20px rgba(59, 130, 246, 0.2);
      /* Gradient border via outline trick */
      border: 3px solid transparent;
      background-clip: padding-box;
    }
    .step-circle.active::before {
      content: '';
      position: absolute;
      inset: -3px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      z-index: -1;
    }

    /* Completed: filled gradient */
    .step-circle.completed {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      border: none;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
      transform: scale(1.05);
    }

    /* Inactive */
    .step-circle.inactive {
      background: #f8fafc;
      border: 2px solid #e2e8f0;
    }

    /* Rejected */
    .step-circle.rejected {
      background: #fee2e2;
      border: 2px solid #ef4444;
    }

    .step-emoji {
      font-size: 1.4rem;
      line-height: 1;
    }

    .checkmark {
      width: 26px;
      height: 26px;
      color: #ffffff;
    }

    /* ---- Labels ---- */
    .step-label {
      margin-top: 0.8rem;
      font-size: 0.7rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      text-align: center;
      max-width: 100px;
      line-height: 1.3;
      transition: color 0.3s ease;
    }

    .label-active {
      color: #1e293b;
    }

    .label-default {
      color: #94a3b8;
    }

    /* ---- Connector ---- */
    .connector {
      flex: 1;
      height: 2px;
      margin: 0 0.75rem;
      margin-bottom: 2.2rem; /* vertically align with circle center */
      background: #e2e8f0;
      border-radius: 9999px;
      overflow: hidden;
      position: relative;
    }

    .connector-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6 0%, #2563eb 100%);
      border-radius: 9999px;
      transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* ---- Progress bar ---- */
    .progress-section {
      margin-top: 2rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      max-width: 640px;
      margin-left: auto;
      margin-right: auto;
    }

    .progress-track {
      flex: 1;
      height: 8px;
      background: #f1f5f9;
      border-radius: 9999px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6 0%, #2563eb 100%);
      border-radius: 9999px;
      transition: width 0.7s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .progress-label {
      font-size: 0.8rem;
      font-weight: 900;
      color: #2563eb;
      min-width: 40px;
      text-align: right;
    }
  `]
})
export class StepperComponent {
  @Input() currentStep: number = 1;
  @Input() steps: Step[] = [
    { id: 1, name: 'Informations personnelles', icon: '👤' },
    { id: 2, name: 'Informations académiques', icon: '🎓' },
    { id: 3, name: 'Documents requis', icon: '📄' },
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
}