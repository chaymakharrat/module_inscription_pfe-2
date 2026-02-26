import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashboardDepartementComponent } from './dashboard-departement.component';

describe('DashboardDepartementComponent', () => {
  let component: DashboardDepartementComponent;
  let fixture: ComponentFixture<DashboardDepartementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardDepartementComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardDepartementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
