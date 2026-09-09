import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';
import WorkflowDetailPage from '../src/pages/WorkflowDetailPage.svelte';
import { workflowDetail, workflowDetailError, workflowDetailLoading } from '../src/stores/workflows';
import type { WorkflowDetailView } from '../src/api/types';
const mocks = vi.hoisted(() => ({ getWorkflow: vi.fn(), getWorkflowRevision: vi.fn() }));
vi.mock('../src/api/client', () => ({ ...mocks, listWorkflows: vi.fn(), pauseWorkflow: vi.fn(), resumeWorkflow: vi.fn() }));
vi.mock('$lib/navigation', () => ({ navigate: async (path: string, query: Record<string, string | null> = {}, options: { replaceState?: boolean } = {}) => {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(query)) if (value !== null) url.searchParams.set(key, value);
  window.history[options.replaceState ? 'replaceState' : 'pushState']({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
} }));
const snapshot: WorkflowDetailView = { workflow_id: 'wf', title: 'Example', state: 'completed', current_revision: 3, active_patch: null, failure_message: null, cwd: '/workspace', agent_submitted_count: 0, agent_total_count: 1, current_node_id: null, started_at: null, completed_at: null, created_at: '', updated_at: '', elapsed_ms: 0, nodes: [{ node_id: 'n', phase: 'Build', title: 'Current writer', status: 'pending', session_id: 'session', session_state: null, submitted_at: null }] };
beforeEach(() => {
  vi.clearAllMocks(); workflowDetail.set(null); workflowDetailError.set(null); workflowDetailLoading.set(false);
  mocks.getWorkflow.mockResolvedValue(snapshot);
  mocks.getWorkflowRevision.mockImplementation(async (id, revision) => ({ workflow_id: id, revision, current: false, nodes: [] }));
});
function visit(query: string) { window.history.replaceState({}, '', `/workflows/wf${query}`); window.dispatchEvent(new PopStateEvent('popstate')); }

test('direct history URL, tab navigation and popstate retain phase and independent current revision', async () => {
  visit('?revision=2&phase=1');
  const view = render(WorkflowDetailPage, { routeWorkflowId: 'wf' });
  expect(await screen.findByText('Viewing v2')).toBeInTheDocument();
  expect(screen.getByText('Current v3')).toBeInTheDocument();
  workflowDetail.set({ ...snapshot, current_revision: 4 });
  expect(await screen.findByText('Current v4')).toBeInTheDocument();
  expect(screen.getByText('Viewing v2')).toBeInTheDocument();
  await fireEvent.click(screen.getByRole('tab', { name: 'Current workflow' }));
  expect(await screen.findByText('Current writer')).toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get('phase')).toBe('1');
  visit('?tab=versions&revision=1&phase=1');
  expect(await screen.findByText('Viewing v1')).toBeInTheDocument();
  view.unmount();
  render(WorkflowDetailPage, { routeWorkflowId: 'wf' });
  expect(await screen.findByText('Viewing v1')).toBeInTheDocument();
});

test('versions URL without a revision is pinned before subsequent snapshot updates', async () => {
  visit('?tab=versions&phase=1');
  render(WorkflowDetailPage, { routeWorkflowId: 'wf' });
  await waitFor(() => expect(new URLSearchParams(window.location.search).get('revision')).toBe('3'));
  workflowDetail.set({ ...snapshot, current_revision: 4 });
  expect(await screen.findByText('Current v4')).toBeInTheDocument();
  expect(screen.getByText('Viewing v3')).toBeInTheDocument();
});
