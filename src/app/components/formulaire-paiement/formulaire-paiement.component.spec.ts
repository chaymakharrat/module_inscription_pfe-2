import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FormulairePaiementComponent } from './formulaire-paiement.component';

describe('FormulairePaiementComponent', () => {
  let component: FormulairePaiementComponent;
  let fixture: ComponentFixture<FormulairePaiementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormulairePaiementComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FormulairePaiementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
