import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BacScannerServiceComponent } from './bac-scanner-service.component';

describe('BacScannerServiceComponent', () => {
  let component: BacScannerServiceComponent;
  let fixture: ComponentFixture<BacScannerServiceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BacScannerServiceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BacScannerServiceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
