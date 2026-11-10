import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ManagerDashboard, SupportConversation } from '../../../services/manager-dashboard';
import { StaffAccess } from '../../../services/staff-access';
import { ManagerSupport } from './manager-support';

describe('ManagerSupport reply composer', () => {
  const conversation: SupportConversation = {
    id: 'conversation-1', customer_first_name: 'Test', customer_last_name: 'Customer',
    customer_email: 'customer@example.com', subject: 'Order question', status: 'open',
    assigned_support_id: 'support-1', created_at: '2026-11-09T00:00:00Z',
    updated_at: '2026-11-09T00:00:00Z', rating: null,
  };

  async function openThread() {
    await TestBed.configureTestingModule({
      imports: [ManagerSupport],
      providers: [
        { provide: StaffAccess, useValue: { role: signal('support') } },
        { provide: ManagerDashboard, useValue: {
          getSupportConversations: async () => [conversation],
          getSupportMessages: async () => [],
        } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ManagerSupport);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.viewThread(conversation);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('allows native mouse focus and typing in the reply field without closing the thread', async () => {
    const fixture = await openThread();
    const textarea = fixture.nativeElement.querySelector('#support-reply') as HTMLTextAreaElement;
    const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    textarea.dispatchEvent(mouseDown);
    expect(mouseDown.defaultPrevented).toBe(false);
    expect(fixture.componentInstance.selected()?.id).toBe(conversation.id);
    textarea.value = 'Thanks for contacting us.';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.replyText()).toBe('Thanks for contacting us.');
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(false);
  });

  it('still closes the thread when pressing the backdrop', async () => {
    const fixture = await openThread();
    fixture.nativeElement.querySelector('.thread-backdrop').dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBeNull();
  });
});
