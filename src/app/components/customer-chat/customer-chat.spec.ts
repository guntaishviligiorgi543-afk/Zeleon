import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Auth } from '../../services/auth';
import { SUPABASE_CLIENT } from '../../services/supabase';
import { CustomerChat } from './customer-chat';

const first = { id: '00000000-0000-4000-8000-000000000001', subject: 'Order help', status: 'open', updated_at: '2026-11-11T00:00:00Z' };
const second = { ...first, id: '00000000-0000-4000-8000-000000000002', subject: 'Delivery question' };

describe('Customer chat history', () => {
  async function setup(rows = [first, second], query: Record<string, string> = {}) {
    const hidden = new Set<string>();
    const user = signal<{ id: string } | null>({ id: 'customer-1' });
    const params = new BehaviorSubject(convertToParamMap(query));
    let authChange: (_event: string, session: any) => void = () => {};
    const channel: any = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
    const client = {
      auth: {
        onAuthStateChange: vi.fn(callback => { authChange = callback; return { data: { subscription: { unsubscribe() {} } } }; }),
        getSession: async () => ({ data: { session: null } }),
      },
      rpc: vi.fn((name: string, args?: any): any => {
        if (name === 'customer_support_history') return { range: vi.fn(async (from: number, to: number) => ({ data: rows.filter(row => !hidden.has(row.id)).slice(from, to + 1), error: null })) };
        if (name === 'customer_hide_support_history') {
          const ids = rows.filter(row => (!args.p_conversation_id || row.id === args.p_conversation_id) && !hidden.has(row.id)).map(row => row.id);
          ids.forEach(id => hidden.add(id));
          return Promise.resolve({ data: ids, error: null });
        }
        args.p_conversation_ids.forEach((id: string) => hidden.delete(id));
        return Promise.resolve({ data: args.p_conversation_ids.length, error: null });
      }),
      from: vi.fn((table: string) => {
        let id = first.id;
        const builder: any = {
          select: () => builder, eq: (column: string, value: string) => { if (column === 'id' || column === 'conversation_id') id = value; return builder; },
          order: () => builder,
          limit: async () => ({ data: [{ id: 'message', conversation_id: id, sender_type: 'customer', body: 'Where is my order?', created_at: first.updated_at }], error: null }),
          maybeSingle: async () => ({ data: table === 'support_conversations' ? rows.find(row => row.id === id) : null, error: null }),
          upsert: async () => ({ error: null }),
          delete: () => builder, then: (resolve: any) => resolve({ error: null }),
        };
        return builder;
      }),
      channel: vi.fn(() => channel), removeChannel: vi.fn(),
    };
    await TestBed.configureTestingModule({ imports: [CustomerChat], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { queryParamMap: params } },
      { provide: Auth, useValue: { ready: Promise.resolve(), user, initialized: signal(true), isAuthenticated: () => !!user() } },
      { provide: SUPABASE_CLIENT, useValue: client },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(CustomerChat);
    authChange('INITIAL_SESSION', { user: user() });
    const component = fixture.componentInstance;
    component.opened.set(true);
    await component.load();
    fixture.detectChanges();
    return { fixture, component, client, hidden, user, authChange };
  }

  it('opens on history without fetching messages or automatically selecting a conversation', async () => {
    const { fixture, component, client } = await setup();
    expect(component.active()).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.zc-conversation').length).toBe(2);
    expect(fixture.nativeElement.querySelector('.zc-new')).toBeNull();
    expect(fixture.nativeElement.querySelector('.zc-messages')).toBeNull();
    expect(client.from).not.toHaveBeenCalledWith('support_messages');
    await component.select(second);
    fixture.detectChanges();
    expect(component.active()?.id).toBe(second.id);
    expect(fixture.nativeElement.querySelector('.zc-subheader').textContent).toContain(second.subject);
    expect(fixture.nativeElement.querySelector('.zc-messages').textContent).toContain('Where is my order?');
  });

  it('shows a full new-chat form and returns to history using the header back arrow', async () => {
    const { fixture, component } = await setup();
    fixture.nativeElement.querySelector('.zc-start-new').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.zc-new')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.zc-list')).toBeNull();
    fixture.nativeElement.querySelector('.zc-header [aria-label="Back to conversations"]').click();
    fixture.detectChanges();
    expect(component.newChat()).toBe(false);
    expect(fixture.nativeElement.querySelector('.zc-list')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.zc-new')).toBeNull();
  });

  it('keeps the usual new-chat form when there is no history', async () => {
    const { fixture } = await setup([]);
    expect(fixture.nativeElement.querySelector('.zc-new')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.zc-list')).toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Back to conversations"]')).toBeNull();
  });

  it('requires confirmation, removes one conversation, persists removal, and supports Undo', async () => {
    const { fixture, component, client } = await setup();
    fixture.nativeElement.querySelector('.zc-delete-history').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(client.rpc).not.toHaveBeenCalledWith('customer_hide_support_history', expect.anything());
    component.deleteTarget.set(null);
    expect(component.conversations().length).toBe(2);
    component.requestDelete(first);
    await component.deleteHistory();
    expect(component.conversations().map(row => row.id)).toEqual([second.id]);
    await component.load();
    expect(component.conversations().length).toBe(1);
    await component.undoDelete();
    expect(component.conversations().length).toBe(2);
    expect(component.undoIds()).toEqual([]);
  });

  it('clears all history, shows the new-chat form, and can restore all removed rows', async () => {
    const { fixture, component } = await setup();
    component.requestDelete('all');
    await component.deleteHistory();
    fixture.detectChanges();
    expect(component.conversations()).toEqual([]);
    expect(fixture.nativeElement.querySelector('.zc-new')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.zc-history-notice')).not.toBeNull();
    await component.undoDelete();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.zc-conversation').length).toBe(2);
  });

  it('keeps history and shows an error if deletion fails', async () => {
    const { component, client } = await setup();
    client.rpc.mockReturnValueOnce(Promise.resolve({ data: null, error: new Error('Unable to delete history') }));
    component.requestDelete(first);
    await component.deleteHistory();
    expect(component.conversations().length).toBe(2);
    expect(component.error()).toBe('Unable to delete history');
    expect(component.deleting()).toBe(false);
  });

  it('preserves ordinary email deep links to the correct conversation', async () => {
    const { component } = await setup([first, second], { supportChat: second.id });
    expect(component.active()?.id).toBe(second.id);
  });

  it('returns to the list when reopened and clears user state at logout', async () => {
    const { fixture, component, user, authChange } = await setup();
    await component.select(first);
    component.toggle();
    component.toggle();
    await component.load();
    expect(component.active()).toBeNull();
    user.set(null);
    authChange('SIGNED_OUT', null);
    fixture.detectChanges();
    expect(component.conversations()).toEqual([]);
    expect(component.undoIds()).toEqual([]);
    expect(fixture.nativeElement.querySelector('.zc-empty').textContent).toContain('Sign in');
  });

  it('loads history beyond the first page', async () => {
    const rows = Array.from({ length: 105 }, (_, i) => ({ ...first, id: `conversation-${i}` }));
    const { component } = await setup(rows);
    expect(component.conversations().length).toBe(105);
  });
});
