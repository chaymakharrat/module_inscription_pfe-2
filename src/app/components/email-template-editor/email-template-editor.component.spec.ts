import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmailTemplateEditorComponent } from './email-template-editor.component';

describe('EmailTemplateEditorComponent', () => {
  let component: EmailTemplateEditorComponent;
  let fixture: ComponentFixture<EmailTemplateEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmailTemplateEditorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EmailTemplateEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
