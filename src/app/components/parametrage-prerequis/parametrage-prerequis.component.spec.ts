import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParametragePrerequisComponent } from './parametrage-prerequis.component';

describe('ParametragePrerequisComponent', () => {
  let component: ParametragePrerequisComponent;
  let fixture: ComponentFixture<ParametragePrerequisComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParametragePrerequisComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParametragePrerequisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
