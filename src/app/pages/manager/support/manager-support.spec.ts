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
    escalation_reason: null, escalation_target: null, escalated_at: null,
    updated_at: '2026-11-09T00:00:00Z', rating: null,
  };

  async function openThread(role = 'support', selectedConversation = conversation) {
    await TestBed.configureTestingModule({
      imports: [ManagerSupport],
      providers: [
        { provide: StaffAccess, useValue: { role: signal(role) } },
        { provide: ManagerDashboard, useValue: {
          getSupportConversations: async () => [selectedConversation],
          getSupportRatings: async () => selectedConversation.rating ? [{
            ...selectedConversation.rating, conversation_id: selectedConversation.id, created_at: selectedConversation.updated_at,
          }] : [],
          getStaffDirectory: async () => [],
          getSupportMessages: async () => [],
        } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ManagerSupport);
    await fixture.componentInstance.load();
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.viewThread(selectedConversation);
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

  const escalatedConversation: SupportConversation = {
    ...conversation, status: 'escalated', escalation_target: 'admin',
    escalation_reason: 'Escalation detail for the reviewing manager.',
    escalated_at: '2026-11-09T00:00:00Z',
    rating: { rating: 4, feedback: 'Customer feedback belongs in ratings.' },
  };

  it('shows only an escalation badge and rating score in the Support dashboard', async () => {
    const fixture = await openThread('support', escalatedConversation);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.conversation-row .status.escalated')?.textContent).toBe('Escalated');
    expect(root.querySelector('.thread-panel .status.escalated')?.textContent).toBe('Escalated');
    expect(root.querySelector('.rating')?.textContent).toContain('4/5');
    expect(root.textContent).not.toContain(escalatedConversation.escalation_reason);
    expect(root.textContent).not.toContain(escalatedConversation.rating!.feedback);
    fixture.componentInstance.closeThread();
    fixture.componentInstance.section.set('ratings');
    fixture.detectChanges();
    expect(root.querySelector('.support-rating-entry')?.textContent).toContain(escalatedConversation.rating!.feedback);
    expect(root.querySelector('.support-rating-entry [aria-label="4 out of 5 stars"]')).not.toBeNull();
  });

  for (const role of ['admin', 'manager']) {
    it(`shows only escalation badges and a rating score for ${role}`, async () => {
      const fixture = await openThread(role, escalatedConversation);
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.conversation-row .status.escalated')?.textContent).toBe('Escalated');
      expect(root.querySelector('.thread-panel .status.escalated')?.textContent).toBe('Escalated');
      expect(root.querySelector('.rating')?.textContent).toContain('4/5');
      expect(root.textContent).not.toContain(escalatedConversation.escalation_reason);
      expect(root.textContent).not.toContain(escalatedConversation.rating!.feedback);
      fixture.componentInstance.closeThread();
      fixture.componentInstance.section.set('ratings');
      fixture.detectChanges();
      expect(root.querySelector('.support-rating-entry')?.textContent).toContain(escalatedConversation.rating!.feedback);
    });
  }
});
