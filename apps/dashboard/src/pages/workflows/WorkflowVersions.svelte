<script lang="ts">
  import { navigate } from '$lib/navigation'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Card from '$lib/components/ui/card/index.js'
  import * as Alert from '$lib/components/ui/alert/index.js'
  import * as Collapsible from '$lib/components/ui/collapsible/index.js'
  import * as Empty from '$lib/components/ui/empty/index.js'
  import { Skeleton } from '$lib/components/ui/skeleton/index.js'
  import { createRevisionReader, workflowRevisions } from './revisions'

  let { workflowId, currentRevision, revision, onselect, oncurrent }: {
    workflowId: string; currentRevision: number; revision: number | null;
    onselect: (revision: number) => void; oncurrent: () => void;
  } = $props()
  const reader = createRevisionReader()
  let selectedWorkflow = $derived(workflowId)
  let selectedRevision = $derived(revision)
  $effect(() => {
    if (selectedRevision !== null) void reader.load(selectedWorkflow, selectedRevision)
    return () => reader.cancel()
  })
  let phases = $derived([...new Set(($reader.detail?.nodes ?? []).map(node => node.phase))])
</script>

<Card.Root class="overflow-hidden">
  <div class="grid min-h-[28rem] md:grid-cols-[17rem_1fr]">
    <aside class="space-y-1 border-b bg-muted/20 p-3 md:border-r md:border-b-0" aria-label="Workflow versions">
      <h3 class="px-2 py-2 text-xs font-semibold uppercase">Versions</h3>
      {#each workflowRevisions(currentRevision) as version}
        <Button variant={revision === version ? 'secondary' : 'ghost'} class="w-full justify-between" aria-current={revision === version ? 'true' : undefined} onclick={() => onselect(version)}>
          v{version} {#if version === currentRevision}<Badge variant="outline">Current</Badge>{/if}
        </Button>
      {/each}
    </aside>
    <div class="min-w-0 space-y-4 p-4 md:p-6">
      <div class="flex flex-wrap items-center gap-2">
        {#if revision !== null}<h3 class="text-lg font-semibold">Viewing v{revision}</h3><Badge variant="secondary">{revision === currentRevision ? 'Current' : 'Historical'}</Badge><Badge variant="outline">Read-only</Badge>{/if}
        <Button variant="outline" onclick={oncurrent}>Back to current workflow</Button>
      </div>
      <p class="text-sm text-muted-foreground">Definition only. Session links do not represent execution state at this revision.</p>
      {#if revision === null}
        <Alert.Root variant="destructive"><Alert.Title>Invalid or unavailable revision</Alert.Title><Alert.Description>Select an existing version from the list.</Alert.Description></Alert.Root>
      {:else if $reader.loading}
        <div role="status" aria-label="Loading revision"><Skeleton class="h-64 w-full" /></div>
      {:else if $reader.error}
        <Alert.Root variant="destructive"><Alert.Title>Could not load revision</Alert.Title><Alert.Description>{$reader.error}</Alert.Description></Alert.Root>
        <Button variant="outline" onclick={() => revision !== null && reader.load(workflowId, revision)}>Retry revision</Button>
      {:else if $reader.detail}
        {#each phases as phase}
          <section class="space-y-3">
            <h4 class="font-semibold">{phase || 'No phase'}</h4>
            {#each $reader.detail.nodes.filter(node => node.phase === phase) as node (node.node_id)}
              <Card.Root class="gap-3 p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div><h5 class="font-medium">{node.title}</h5><p class="text-xs text-muted-foreground">{node.node_type} · {node.node_id}</p></div>
                  {#if node.retired_revision !== null}<Badge variant="outline">Removed in v{node.retired_revision}</Badge>{/if}
                  {#if node.session_id}<Button variant="ghost" onclick={() => node.session_id && navigate(`/chat/${node.session_id}`)}>Open chat →</Button>{/if}
                </div>
                <Collapsible.Root>
                  <Collapsible.Trigger class="text-sm font-medium underline">Definition details</Collapsible.Trigger>
                  <Collapsible.Content>
                    <dl class="mt-3 space-y-3 text-sm [&_dd]:whitespace-pre-wrap [&_dd]:break-words [&_dt]:font-medium">
                      <div><dt>Instructions</dt><dd>{node.instructions || 'Not provided'}</dd></div>
                      <div><dt>Inputs</dt><dd>{node.inputs.length ? node.inputs.join('\n') : 'None'}</dd></div>
                      <div><dt>Output</dt><dd>{node.output || 'Not provided'}</dd></div>
                      <div><dt>Profile</dt><dd>{node.execution_profile_id ?? 'Not provided'}{node.execution_profile_version ? ` · ${node.execution_profile_version}` : ''}</dd></div>
                      <div><dt>Parent node</dt><dd>{node.parent_node_id ?? 'None'}</dd></div>
                      <div><dt>Introduced</dt><dd>v{node.introduced_revision}</dd></div>
                    </dl>
                  </Collapsible.Content>
                </Collapsible.Root>
              </Card.Root>
            {/each}
          </section>
        {:else}
          <Empty.Root><Empty.Header><Empty.Title>No nodes in this revision</Empty.Title></Empty.Header></Empty.Root>
        {/each}
      {/if}
    </div>
  </div>
</Card.Root>
