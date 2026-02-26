import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Logo3dComponent } from './logo3d.component';

describe('Logo3dComponent', () => {
  let component: Logo3dComponent;
  let fixture: ComponentFixture<Logo3dComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Logo3dComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Logo3dComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
