import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-action-buttons',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-gray-100 px-2 gap-4 sm:gap-0">
      <!-- Previous button -->
      <div class="w-full sm:w-auto sm:min-w-[120px] order-2 sm:order-1">
        <button
          *ngIf="!isFirstStep"
          type="button"
          (click)="previous.emit()"
          class="w-full sm:w-auto group px-6 py-3.5 border-2 border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center justify-center gap-2 transform active:scale-95"
        >
          <svg class="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Précédent
        </button>
      </div>

      <!-- Next/Submit button -->
      <button
        type="button"
        (click)="next.emit()"
        [disabled]="!isValid || isLoading"
        [class]="'w-full sm:w-auto order-1 sm:order-2 group px-6 sm:px-10 py-3.5 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-3 transform active:scale-95 shadow-lg ' + 
                 (isValid && !isLoading
                  ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200 shadow-blue-100' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none border-2 border-gray-50')"
      >
        <!-- Loading Spinner -->
        <svg *ngIf="isLoading" class="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>

        <span class="text-sm sm:text-base">{{ isLoading ? 'Traitement en cours...' : (isLastStep ? 'Soumettre l\\'inscription' : 'Continuer') }}</span>
        
        <svg *ngIf="!isLastStep && !isLoading" class="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
        <svg *ngIf="isLastStep && !isLoading" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  `,
  styles: [`
    /* Ripple effect */
    button {
      position: relative;
      overflow: hidden;
    }

    button::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.5);
      transform: translate(-50%, -50%);
      transition: width 0.6s, height 0.6s;
    }

    button:active:not(:disabled)::after {
      width: 300px;
      height: 300px;
      transition: 0s;
    }

    /* Disabled state */
    button:disabled::after {
      display: none;
    }
  `]
})
export class ActionButtonsComponent {
  @Input() isFirstStep: boolean = true;
  @Input() isLastStep: boolean = false;
  @Input() isValid: boolean = false;
  @Input() isLoading: boolean = false;
  @Output() previous = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
}
