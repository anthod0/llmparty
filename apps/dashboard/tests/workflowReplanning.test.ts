import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { beforeEach, expect, test, vi } from 'vitest';
import WorkflowDetailPage from '../src/pages/WorkflowDetailPage.svelte';
import WorkflowDocument from '../src/pages/workflows/WorkflowDocument.svelte';
import WorkflowSession from '../src/pages/workflows/WorkflowSession.svelte';
import { createPatchHistoryReader } from '../src/pages/workflows/patches';
import { workflowDetail, workflowDetailError, workflowDetailLoading, selectedWorkflowSessionIds, selectedWorkflowHistorySessionId } from '../src/stores/workflows';
import type { WorkflowDetailView, WorkflowPatchHistoryView } from '../src/api/types';

const mocks = vi.hoisted(() => ({ getWorkflow: vi.fn(), getWorkflowRevision: vi.fn(), listWorkflowPatches: vi.fn(), getWorkflowDocument: vi.fn(), getSession: vi.fn() }));
vi.mock('../src/api/client', () => ({ ...mocks, listWorkflows: vi.fn(), pauseWorkflow: vi.fn(), resumeWorkflow: vi.fn() }));
vi.mock('$lib/navigation', () => ({ navigate: async (path: string, query: Record<string, string | null> = {}, options: { replaceState?: boolean } = {}) => {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(query)) if (value !== null) url.searchParams.set(key, value);
  window.history[options.replaceState ? 'replaceState' : 'pushState']({}, '', url);
  if (path.startsWith('/workflows/')) window.dispatchEvent(new PopStateEvent('popstate'));
} }));
const patch = (id = 'p1', overrides: Partial<WorkflowPatchHistoryView> = {}): WorkflowPatchHistoryView => ({
  patch_id: id, state: 'planning', outcome: null, base_revision: 3, result_revision: null,
  requesting_node_id: 'request-node', requesting_session_id: 'request-session', requesting_turn_id: 'request-turn', requesting_runtime_instance_id: 'request-runtime',
  replanner_session_id: 'replanner', replanner_turn_id: 'replanner-turn', replanner_runtime_instance_id: 'replanner-runtime',
  added_node_ids: [], retired_node_ids: [], request_document_ref: 'requests/request.md', decision_document_ref: null, reason_document_ref: null, blocked_draft_ref: null,
  requested_at: '2026-01-01T00:00:00Z', planning_at: '2026-01-01T00:01:00Z', resolved_at: null, ...overrides,
});
const snapshot = (overrides: Partial<WorkflowDetailView> = {}): WorkflowDetailView => ({
  workflow_id: 'wf', title: 'Example', state: 'replanning', current_revision: 3, active_patch: patch(), failure_message: null, cwd: '/workspace', agent_submitted_count: 0, agent_total_count: 0, current_node_id: null, started_at: null, completed_at: null, created_at: '', updated_at: '', elapsed_ms: 0, nodes: [], ...overrides,
});
function visit(query = '?tab=replanning&patch=p1') { window.history.replaceState({}, '', `/workflows/wf${query}`); window.dispatchEvent(new PopStateEvent('popstate')); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(() => {
  vi.resetAllMocks(); workflowDetail.set(null); workflowDetailError.set(null); workflowDetailLoading.set(false); selectedWorkflowHistorySessionId.set(null);
  mocks.getWorkflow.mockResolvedValue(snapshot());
  mocks.listWorkflowPatches.mockResolvedValue([patch()]);
  mocks.getSession.mockImplementation(async (id: string) => ({ session_id: id, state: 'busy' }));
  mocks.getWorkflowDocument.mockImplementation(async (id, ref) => ({ workflow_id: id, document_ref: ref, content: 'Actual request reason' }));
  mocks.getWorkflowRevision.mockImplementation(async (id, revision) => ({ workflow_id: id, revision, current: false, nodes: [] }));
  visit();
});

test('current Replanner remains visible on all tabs with independent workflow, patch and Session state', async () => {
  visit('?tab=versions&revision=2');
  render(WorkflowDetailPage, { routeWorkflowId: 'wf' });
  expect(await screen.findByText('Viewing v2')).toBeInTheDocument();
  expect(await screen.findByText('Session now: busy')).toBeInTheDocument();
  expect(screen.getByText('Current v3')).toBeInTheDocument();
  expect(screen.getByText('Based on v3')).toBeInTheDocument();
  expect(mocks.listWorkflowPatches).not.toHaveBeenCalled();
  expect(window.location.search).toBe('?tab=versions&revision=2');
  expect(screen.getByText('replanning')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
  for (const name of ['Current workflow', 'Replanning records', 'Versions']) {
    await fireEvent.click(screen.getByRole('tab', { name }));
    expect(screen.getByRole('button', { name: 'Open chat', exact: true })).toBeInTheDocument();
  }
  expect(selectedWorkflowSessionIds()).toContain('replanner');
});

test('Session creation, replacement, applied revision and clearing active patch follow snapshots only', async () => {
  mocks.getWorkflow.mockResolvedValue(snapshot({ active_patch: patch('p1', { replanner_session_id: null }) }));
  render(WorkflowDetailPage, { routeWorkflowId: 'wf' });
  expect(await screen.findByText('Waiting for Replanner Session creation.')).toBeInTheDocument();
  expect(mocks.getSession).not.toHaveBeenCalled();
  expect(screen.queryByText('Current v4')).not.toBeInTheDocument();
  workflowDetail.set(snapshot());
  expect(await screen.findByText('Session now: busy')).toBeInTheDocument();
  workflowDetail.set(snapshot({ active_patch: patch('p2', { replanner_session_id: 'new-replanner' }) }));
  await waitFor(() => expect(mocks.getSession).toHaveBeenCalledWith('new-replanner', expect.anything()));
  const applied = patch('p1', { state: 'applied', outcome: 'applied', result_revision: 4 });
  mocks.listWorkflowPatches.mockResolvedValue([applied]);
  workflowDetail.set(snapshot({ state: 'running', current_revision: 4, active_patch: null }));
  expect(await screen.findByText('No active replanning.')).toBeInTheDocument();
  expect(await screen.findByText('Current v4')).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'View revision v3 → v4' })).toBeInTheDocument();
  expect(screen.getByText('Historical request')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Replanner' })).getByRole('button', { name: 'Open chat' })).toBeInTheDocument();
});

test('all outcomes are listed newest first; historical selection survives updates and revision navigation', async () => {
  const applied = patch('old', { state: 'applied', outcome: 'applied', base_revision: 1, result_revision: 2, replanner_session_id: 'old-session' });
  mocks.listWorkflowPatches.mockResolvedValue([applied, patch('blocked', { state: 'blocked', requested_at: '2026-02-01T00:00:00Z' }), patch('rejected', { state: 'rejected', outcome: 'rejected', result_revision: 3, requested_at: '2026-03-01T00:00:00Z' }), patch('p1', { requested_at: '2026-04-01T00:00:00Z' })]);
  visit('?tab=replanning&patch=old&phase=1');
  render(WorkflowDetailPage, { routeWorkflowId: 'wf' });
  expect(await screen.findByText('Patch old')).toBeInTheDocument();
  const buttons = within(screen.getByRole('complementary', { name: 'Patch requests' })).getAllByRole('button');
  expect(buttons.map(button => button.textContent?.split(' ')[0])).toHaveLength(4);
  expect(buttons[0]).toHaveTextContent('p1'); expect(buttons[3]).toHaveTextContent('old');
  expect(await screen.findByText('old-session')).toBeInTheDocument();
  expect(selectedWorkflowSessionIds()).toContain('old-session');
  workflowDetail.set(snapshot({ current_revision: 4 }));
  expect(await screen.findByText('Current v4')).toBeInTheDocument();
  expect(screen.getByText('Patch old')).toBeInTheDocument();
  await fireEvent.click(screen.getByRole('button', { name: 'View revision v1 → v2' }));
  expect(await screen.findByText('Viewing v2')).toBeInTheDocument();
  expect(window.location.search).toContain('phase=1'); expect(window.location.search).toContain('patch=old');
  visit('?tab=replanning&patch=rejected');
  expect(await screen.findByText('Patch rejected')).toBeInTheDocument();
  expect(screen.getByText('No new revision. Version remained v3.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /View revision/ })).not.toBeInTheDocument();
});

test('initial selection is URL-pinned; empty, missing record, list failure and retry are local', async () => {
  visit('?tab=replanning');
  mocks.listWorkflowPatches.mockRejectedValueOnce(new Error('History unavailable')).mockResolvedValueOnce([]).mockResolvedValue([patch()]);
  render(WorkflowDetailPage, { routeWorkflowId: 'wf' });
  expect(await screen.findByText('History unavailable')).toBeInTheDocument();
  await fireEvent.click(screen.getByRole('button', { name: 'Retry records' }));
  expect(await screen.findByText('No replanning requests.')).toBeInTheDocument();
  workflowDetail.set(snapshot());
  await waitFor(() => expect(window.location.search).toContain('patch=p1'));
  visit('?tab=replanning&patch=missing');
  expect(await screen.findByText('Patch not found: missing. Select an available request.')).toBeInTheDocument();
});

test('blocked/failed requests retain facts and lazy documents, without fabricated revisions or historical lifecycle', async () => {
  mocks.getWorkflow.mockResolvedValue(snapshot({ state: 'blocked', active_patch: null }));
  mocks.listWorkflowPatches.mockResolvedValue([patch('p1', { state: 'blocked', outcome: 'failed', replanner_session_id: 'gone', decision_document_ref: 'decision.md', reason_document_ref: 'reason.md', blocked_draft_ref: 'draft.md', added_node_ids: ['added'], retired_node_ids: ['retired'], resolved_at: '2026-01-01T01:00:00Z' })]);
  mocks.getSession.mockRejectedValue(new Error('Not found'));
  mocks.getWorkflowDocument.mockRejectedValueOnce(new Error('Document gone')).mockResolvedValue({ content: 'Actual reason' });
  render(WorkflowDetailPage, { routeWorkflowId: 'wf' });
  expect(await screen.findByText('Patch state: blocked · Outcome: failed')).toBeInTheDocument();
  expect(await screen.findByText('Session unavailable: Not found')).toBeInTheDocument();
  expect(screen.getByText('Added nodes: added')).toBeInTheDocument();
  expect(screen.getByText('Retired nodes: retired')).toBeInTheDocument();
  expect(screen.getByText('Replanner Turn: replanner-turn')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
  expect(mocks.getWorkflowDocument).not.toHaveBeenCalled();
  await fireEvent.click(screen.getByText('Reason document', { exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Document gone');
  await fireEvent.click(screen.getByRole('button', { name: 'Retry document' }));
  expect(await screen.findByText('Actual reason')).toBeInTheDocument();
  expect(mocks.getWorkflowDocument.mock.calls.every(call => call[1] === 'reason.md')).toBe(true);
  await fireEvent.click(screen.getByRole('button', { name: 'Open chat', exact: true }));
  expect(window.location.pathname).toBe('/chat/gone');
});

test('missing historical Session is explicit and does not borrow the active Session', async () => {
  mocks.listWorkflowPatches.mockResolvedValue([patch('p1', { state: 'rejected', replanner_session_id: null, replanner_turn_id: null })]);
  mocks.getWorkflow.mockResolvedValue(snapshot({ active_patch: null }));
  render(WorkflowDetailPage, { routeWorkflowId: 'wf' });
  expect(await screen.findByText('No associated Replanner Session recorded.')).toBeInTheDocument();
  expect(mocks.getSession).not.toHaveBeenCalled();
});

test('patch reader coalesces slow refreshes and fences workflow changes, errors and cancellation', async () => {
  const old = deferred<WorkflowPatchHistoryView[]>();
  mocks.listWorkflowPatches.mockReturnValueOnce(old.promise);
  const reader = createPatchHistoryReader();
  const first = reader.load('old');
  expect(reader.load('old')).toBe(first);
  await reader.load('new');
  old.resolve([patch('obsolete')]); await first;
  expect(get(reader).workflowId).toBe('new'); expect(get(reader).patches[0].patch_id).toBe('p1');
  expect(mocks.listWorkflowPatches.mock.calls[0][1].signal.aborted).toBe(true);
  const late = deferred<WorkflowPatchHistoryView[]>(); mocks.listWorkflowPatches.mockReturnValueOnce(late.promise);
  const pending = reader.load('new'); reader.cancel(); late.reject(new Error('Late error')); await pending;
  expect(get(reader).error).toBeNull();
});

test('Session reads survive slow snapshot refreshes but reject replaced Session responses', async () => {
  const slow = deferred<unknown>(); mocks.getSession.mockReturnValueOnce(slow.promise);
  const view = render(WorkflowSession, { sessionId: 'old', snapshot: snapshot() });
  await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(1));
  await view.rerender({ sessionId: 'old', snapshot: snapshot({ current_revision: 4 }) });
  expect(mocks.getSession).toHaveBeenCalledTimes(1);
  await view.rerender({ sessionId: 'new', snapshot: snapshot() });
  expect(await screen.findByText('Session now: busy')).toBeInTheDocument();
  slow.resolve({ session_id: 'old', state: 'exited' });
  await Promise.resolve();
  expect(screen.queryByText('Session now: exited')).not.toBeInTheDocument();
  expect(mocks.getSession.mock.calls[0][1].signal.aborted).toBe(true);
});

test('documents fence rapid ref/workflow changes and closing an in-flight read', async () => {
  const slow = deferred<unknown>(); mocks.getWorkflowDocument.mockReturnValueOnce(slow.promise);
  const view = render(WorkflowDocument, { workflowId: 'wf', documentRef: 'old.md', label: 'Request document' });
  await fireEvent.click(screen.getByText('Request document'));
  await view.rerender({ workflowId: 'other', documentRef: 'new.md', label: 'Request document' });
  expect(await screen.findByText('Actual request reason')).toBeInTheDocument();
  slow.resolve({ content: 'Obsolete reason' }); await Promise.resolve();
  expect(screen.queryByText('Obsolete reason')).not.toBeInTheDocument();
  expect(mocks.getWorkflowDocument.mock.calls[0][2].signal.aborted).toBe(true);
  await fireEvent.click(screen.getByText('Request document'));
  expect(mocks.getWorkflowDocument.mock.calls[1][2].signal.aborted).toBe(true);
});

test('missed notifications converge through polling without moving a selected historical request', async () => {
  vi.useFakeTimers();
  mocks.getWorkflow.mockImplementation(async () => snapshot());
  mocks.listWorkflowPatches.mockResolvedValue([patch('historical', { state: 'blocked', replanner_session_id: 'old-session' }), patch()]);
  visit('?tab=replanning&patch=historical');
  const view = render(WorkflowDetailPage, { routeWorkflowId: 'wf' });
  await vi.advanceTimersByTimeAsync(1);
  expect(screen.getByText('Patch historical')).toBeInTheDocument();
  mocks.getWorkflow.mockImplementation(async () => snapshot({ active_patch: null, current_revision: 4, state: 'running' }));
  mocks.getSession.mockResolvedValue({ session_id: 'old-session', state: 'exited' });
  await vi.advanceTimersByTimeAsync(2000);
  expect(screen.getByText('Current v4')).toBeInTheDocument();
  expect(screen.getByText('No active replanning.')).toBeInTheDocument();
  expect(screen.getByText('Session now: exited')).toBeInTheDocument();
  expect(screen.getByText('Patch historical')).toBeInTheDocument();
  expect(window.location.search).toBe('?tab=replanning&patch=historical');
  view.unmount();
  vi.useRealTimers();
  render(WorkflowDetailPage, { routeWorkflowId: 'wf' });
  expect(await screen.findByText('Patch historical')).toBeInTheDocument();
  expect(await screen.findByText('Session now: exited')).toBeInTheDocument();
});

test('visible-page recovery refreshes even terminal workflows and updates selected Session facts', async () => {
  mocks.getWorkflow.mockImplementation(async () => snapshot({ state: 'failed', active_patch: null }));
  render(WorkflowDetailPage, { routeWorkflowId: 'wf' });
  expect(await screen.findByText('Session now: busy')).toBeInTheDocument();
  mocks.getSession.mockResolvedValue({ session_id: 'replanner', state: 'exited' });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
  expect(await screen.findByText('Session now: exited')).toBeInTheDocument();
  expect(mocks.getWorkflow).toHaveBeenCalledTimes(2);
  expect(mocks.listWorkflowPatches).toHaveBeenCalledTimes(2);
});
