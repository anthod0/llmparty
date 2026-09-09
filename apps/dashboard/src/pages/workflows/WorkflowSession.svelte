<script lang="ts">
  import { untrack } from 'svelte'
  import { getSession } from '../../api/client'
  import type { SessionView, WorkflowDetailView } from '../../api/types'
  import { Button } from '$lib/components/ui/button/index.js'
  import { navigate } from '$lib/navigation'

  let { sessionId, snapshot }: { sessionId: string; snapshot: WorkflowDetailView } = $props()
  let session = $state<SessionView | null>(null)
  let error = $state<string | null>(null)
  let sessionKey = $derived(`${snapshot.workflow_id}:${sessionId}`)
  let controller: AbortController | null = null
  let pending: Promise<void> | null = null

  function refresh(): Promise<void> {
    if (pending) return pending
    const request = new AbortController()
    controller = request
    const id = sessionId
    pending = (async () => {
      try {
        const loaded = await getSession(id, { signal: request.signal })
        if (!request.signal.aborted) { session = loaded; error = null }
      } catch (cause) {
        if (!request.signal.aborted) { session = null; error = cause instanceof Error ? cause.message : String(cause) }
      } finally {
        if (controller === request) pending = null
      }
    })()
    return pending
  }

  $effect(() => {
    sessionKey
    untrack(() => { controller?.abort(); pending = null; session = null; error = null })
    return () => { controller?.abort(); pending = null }
  })
  $effect(() => { snapshot; sessionId; untrack(() => void refresh()) })
</script>

<div class="flex flex-wrap items-center gap-2 text-sm">
  <span class="break-all font-mono text-xs">{sessionId}</span>
  {#if error}
    <span class="text-destructive">Session unavailable: {error}</span>
    <Button variant="outline" size="sm" onclick={() => void refresh()}>Retry Session</Button>
  {:else if session}
    <span>Session now: {session.state}</span>
  {:else}<span class="text-muted-foreground">Loading Session status…</span>{/if}
  <Button variant="outline" size="sm" onclick={() => navigate(`/chat/${encodeURIComponent(sessionId)}`)}>Open chat</Button>
</div>
