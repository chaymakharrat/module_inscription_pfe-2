import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DepartementsManagementComponent } from './departements-management.component';

describe('DepartementsManagementComponent', () => {
  let component: DepartementsManagementComponent;
  let fixture: ComponentFixture<DepartementsManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DepartementsManagementComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DepartementsManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
