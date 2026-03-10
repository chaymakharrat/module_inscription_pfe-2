import { Component, Input, Output, EventEmitter, forwardRef, ContentChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-input',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true
    }
  ],
  template: `
    <div class="mb-6">
      <label class="block text-sm font-bold text-slate-700 mb-3 ml-1">
        {{label}}
        <span *ngIf="required" class="text-blue-500 ml-1">*</span>
      </label>

      <div class="relative group">
        <!-- Icon -->
        <div *ngIf="icon" class="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
          <ng-container *ngTemplateOutlet="icon"></ng-container>
        </div>

        <!-- Input -->
        <input
          [type]="type"
          [value]="value"
          [disabled]="isDisabled"
          [placeholder]="placeholder"
          (input)="onInput($event)"
          (blur)="onBlur()"
          (focus)="onFocus()"
          [class]="'w-full py-4 rounded-2xl border-2 transition-all duration-300 outline-none font-medium ' + 
                   (icon ? 'pl-12 pr-12' : 'px-5 pr-12') + ' ' +
                   (isFocused ? 'border-blue-500 bg-white ring-8 ring-blue-50 shadow-xl -translate-y-0.5' : 'border-slate-200 bg-white/50 hover:border-blue-300 hover:bg-white') + ' ' +
                   (error ? 'border-red-500 ring-red-50 bg-red-50/10' : '') + ' ' +
                   (isValid ? 'border-green-500 ring-green-50' : '') + ' ' +
                   (isDisabled ? 'opacity-60 cursor-not-allowed bg-slate-50' : '')"
        >

        <!-- Validation icons -->
        <div class="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
          <ng-container *ngIf="isValid">
            <svg [@scaleIn] class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </ng-container>

          <ng-container *ngIf="error">
            <svg [@scaleIn] class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </ng-container>
        </div>
      </div>

      <!-- Error message -->
      <div *ngIf="error" [@slideDown] class="mt-2 text-sm text-red-600 flex items-center gap-1.5 font-medium ml-1">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        {{error}}
      </div>
    </div>
  `,
  animations: [
    trigger('scaleIn', [
      transition(':enter', [
        style({ opacity: 0, scale: 0 }),
        animate('200ms ease-out', style({ opacity: 1, scale: 1 }))
      ])
    ]),
    trigger('slideDown', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class InputComponent implements ControlValueAccessor {
  @Input() label: string = '';
  @Input() type: string = 'text';
  @Input() placeholder: string = '';
  @Input() required: boolean = false;
  @Input() error: string | null = null;
  @Input() isValid: boolean = false;
  @ContentChild('icon') icon?: TemplateRef<any>;

  value: any = '';
  isFocused = false;
  isDisabled = false;

  onChange = (value: any) => { };
  onTouched = () => { };

  onInput(event: any) {
    this.value = event.target.value;
    this.onChange(this.value);
  }

  onFocus() {
    this.isFocused = true;
  }

  onBlur() {
    this.isFocused = false;
    this.onTouched();
  }

  writeValue(value: any): void {
    this.value = value;
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
  }
}
