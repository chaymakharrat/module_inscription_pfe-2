import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BacScannerComponent } from './bac-scanner.component';

describe('BacScannerComponent', () => {
  let component: BacScannerComponent;
  let fixture: ComponentFixture<BacScannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BacScannerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BacScannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
