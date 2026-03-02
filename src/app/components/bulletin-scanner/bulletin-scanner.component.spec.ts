import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BulletinScannerComponent } from './bulletin-scanner.component';

describe('BulletinScannerComponent', () => {
  let component: BulletinScannerComponent;
  let fixture: ComponentFixture<BulletinScannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BulletinScannerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BulletinScannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
