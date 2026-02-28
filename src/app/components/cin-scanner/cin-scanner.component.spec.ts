import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CinScannerComponent } from './cin-scanner.component';

describe('CinScannerComponent', () => {
  let component: CinScannerComponent;
  let fixture: ComponentFixture<CinScannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CinScannerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CinScannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
