import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ActeNaissanceScannerComponent } from './acte-naissance-scanner.component';

describe('ActeNaissanceScannerComponent', () => {
  let component: ActeNaissanceScannerComponent;
  let fixture: ComponentFixture<ActeNaissanceScannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActeNaissanceScannerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ActeNaissanceScannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
