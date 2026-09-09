<script lang="ts">
  import { untrack } from 'svelte'
  import * as Card from '$lib/components/ui/card/index.js'
  import * as Alert from '$lib/components/ui/alert/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { navigate } from '$lib/navigation'
  import type { WorkflowDetailView } from '../../api/types'
  import { selectedWorkflowHistorySessionId } from '../../stores/workflows'
  import { createPatchHistoryReader } from './patches'
  import WorkflowDocument from './WorkflowDocument.svelte'
  import WorkflowSession from './WorkflowSession.svelte'

  let { snapshot, patchId, onselect, onrevision }: {
    snapshot: WorkflowDetailView; patchId: string | null;
    onselect: (id: string, replace?: boolean) => void; onrevision: (revision: number) => void;
  } = $props()
  const reader = createPatchHistoryReader()
  let workflowId = $derived(snapshot.workflow_id)
  $effect(() => { workflowId; return () => { reader.cancel(); selectedWorkflowHistorySessionId.set(null) } })
  $effect(() => { snapshot; untrack(() => void reader.load(snapshot.workflow_id)) })
  let patches = $derived($reader.workflowId === snapshot.workflow_id ? $reader.patches : [])
  let selected = $derived(patches.find(patch => patch.patch_id === patchId) ?? null)
  $effect(() => {
    if (patchId === null && patches.length) onselect(patches[0].patch_id, true)
  })
  $effect(() => { selectedWorkflowHistorySessionId.set(selected?.replanner_session_id ?? null) })
  function time(value: string | null): string { return value ?? 'Not recorded' }
</script>

<Card.Root class="overflow-hidden">
  <div class="grid min-h-[28rem] md:grid-cols-[17rem_1fr]">
    <aside class="space-y-2 border-b bg-muted/20 p-3 md:border-r md:border-b-0" aria-label="Patch requests">
      <h3 class="px-2 py-2 text-xs font-semibold uppercase">Replanning records</h3>
      {#each patches as patch (patch.patch_id)}
        <Button variant={patchId === patch.patch_id ? 'secondary' : 'ghost'} class="h-auto w-full justify-start whitespace-normal text-left" aria-current={patchId === patch.patch_id ? 'true' : undefined} onclick={() => onselect(patch.patch_id)}>
          <span class="min-w-0 space-y-1 break-all"><span class="block font-mono text-xs">{patch.patch_id}</span><span class="block">{patch.state}{patch.outcome ? ` · ${patch.outcome}` : ''}</span><span class="block text-xs text-muted-foreground">{patch.requested_at}</span><span class="block text-xs">v{patch.base_revision}{patch.result_revision !== null && patch.result_revision > patch.base_revision ? ` → v${patch.result_revision}` : ' · No new revision'}</span></span>
        </Button>
      {/each}
    </aside>
    <div class="min-w-0 space-y-5 p-4 md:p-6">
      {#if $reader.error}<Alert.Root variant="destructive"><Alert.Title>Could not load replanning records</Alert.Title><Alert.Description>{$reader.error}</Alert.Description></Alert.Root><Button variant="outline" onclick={() => reader.load(snapshot.workflow_id)}>Retry records</Button>{/if}
      {#if selected}
        {#key snapshot.workflow_id + ':' + selected.patch_id}
          <div class="flex flex-wrap items-center gap-2"><h3 class="break-all text-lg font-semibold">Patch {selected.patch_id}</h3><Badge variant="outline">{selected.patch_id === snapshot.active_patch?.patch_id ? 'Current request' : 'Historical request'}</Badge></div>
          <section class="space-y-2" aria-label="Request">
            <h4 class="font-semibold">1. Request</h4>
            <p class="text-sm">Requested: {time(selected.requested_at)} · Base v{selected.base_revision}</p>
            <p class="break-all text-sm">From node: {selected.requesting_node_id}</p>
            <div class="flex flex-wrap items-center gap-2 text-sm"><span class="break-all">Requesting Session: {selected.requesting_session_id}</span>{#if selected.requesting_session_id}<Button variant="outline" size="sm" onclick={() => navigate(`/chat/${encodeURIComponent(selected.requesting_session_id)}`)}>Open requesting chat</Button>{/if}</div>
            <p class="break-all text-sm">Requesting Turn: {selected.requesting_turn_id || 'Not recorded'}</p>
            <WorkflowDocument workflowId={snapshot.workflow_id} documentRef={selected.request_document_ref} label="Request document" />
          </section>
          <section class="space-y-2" aria-label="Replanner">
            <h4 class="font-semibold">2. Replanner</h4>
            {#if selected.replanner_session_id}
              {#if selected.replanner_session_id === snapshot.active_patch?.replanner_session_id}
                <p class="break-all text-sm">{selected.replanner_session_id} · Current Replanner — status and Open chat above.</p>
              {:else}<WorkflowSession sessionId={selected.replanner_session_id} {snapshot} />{/if}
              <p class="text-xs text-muted-foreground">Session status is current, not a historical status snapshot.</p>
            {:else}<p class="text-sm text-muted-foreground">No associated Replanner Session recorded.{selected.patch_id === snapshot.active_patch?.patch_id ? ' Waiting for Session creation.' : ''}</p>{/if}
            <p class="break-all text-sm">Replanner Turn: {selected.replanner_turn_id ?? 'Not recorded'}</p>
            <p class="text-sm">Planning: {time(selected.planning_at)}</p>
          </section>
          <section class="space-y-2" aria-label="Patch outcome">
            <h4 class="font-semibold">3. Patch</h4>
            <p class="text-sm">Patch state: {selected.state} · Outcome: {selected.outcome ?? 'Not recorded'}</p>
            <p class="text-sm">Resolved: {time(selected.resolved_at)}</p>
            <WorkflowDocument workflowId={snapshot.workflow_id} documentRef={selected.decision_document_ref} label="Decision document" />
            <WorkflowDocument workflowId={snapshot.workflow_id} documentRef={selected.reason_document_ref} label="Reason document" />
            <WorkflowDocument workflowId={snapshot.workflow_id} documentRef={selected.blocked_draft_ref} label="Blocked draft" />
            <p class="break-all text-sm">Added nodes: {selected.added_node_ids.join(', ') || 'None recorded'}</p>
            <p class="break-all text-sm">Retired nodes: {selected.retired_node_ids.join(', ') || 'None recorded'}</p>
          </section>
          <section class="space-y-2" aria-label="Resulting revision">
            <h4 class="font-semibold">4. Revision</h4>
            {#if selected.result_revision !== null && selected.result_revision > selected.base_revision}
              <Button variant="outline" onclick={() => selected.result_revision !== null && onrevision(selected.result_revision)}>View revision v{selected.base_revision} → v{selected.result_revision}</Button>
            {:else if selected.result_revision === selected.base_revision}<p class="text-sm">No new revision. Version remained v{selected.base_revision}.</p>
            {:else}<p class="text-sm">No resulting revision recorded. Current effective version: v{snapshot.current_revision}.</p>{/if}
          </section>
        {/key}
      {:else if $reader.loading}<p role="status">Loading replanning records…</p>
      {:else if patchId !== null}<p>Patch not found: {patchId}. Select an available request.</p>
      {:else if !$reader.error}<p>No replanning requests.</p>{/if}
    </div>
  </div>
</Card.Root>
