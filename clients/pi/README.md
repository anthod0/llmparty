# @pontia/pi-client-plugin

Connect your pi coding-agent sessions to Pontia so you can follow and continue your work from the web dashboard.

## Requirements

- [Pontia](https://pontia.dev/) running locally
- pi CLI
- tmux

## Install

If you selected the pi integration during `pontia init`, the plugin is already installed.

To install it separately:

```bash
pi install npm:@pontia/pi-client-plugin
```

The plugin loads automatically when pi starts.

## Get started

Open the Pontia dashboard and create a pi session. You can then view the session and continue the conversation from the dashboard.

You can also start pi in a tmux pane inside a workspace registered with Pontia.

For Pontia installation and setup, see the [getting started guide](../../README.md#get-started).

## Troubleshooting

If a session does not appear in the dashboard, check that:

- Pontia is running (`pontia status`).
- The workspace is registered with Pontia.
- pi is running inside tmux.
- If you just installed the plugin, you have restarted pi.

## Event reporting contract

- Turn input and output summaries are bounded to 200 Unicode code points. The full prompt still reaches pi unchanged; full messages remain in pi's native session store. Pontia also bounds input summaries before event persistence, including non-HTTP ingestion.
- If `turn.started` is rejected, Pontia records a runtime-fenced `session.error` with reason `turn_start_reporting_failed`. This is a Pontia-owned integration error (`runtime_manager`), not a claim that the agent's task failed or its process exited. No synthetic `turn.failed` is created. If the start actually committed but its response was lost, the terminal Session error administratively abandons its active Turn with explicit projection provenance.
- The Workflow coordinator reads this durable error and marks the current node and Workflow `failed` (even if the node has submitted and is awaiting exit), including when the error arrived before node/session binding or before a server restart. A Session in error cannot submit a Workflow node.
- For a transport failure or missing canonical turn ID, the plugin sends a small `POST /internal/v1/sessions/{session_id}/turn-start-failure` notification containing only `runtime_instance_id` and a reason (`event_rejected`, `transport_failed`, or `missing_turn_id`). Repeated notifications persist only one reporting error per runtime; stale runtimes are rejected. Workflow failure rechecks the runtime and current node in the same transaction as the state transition.
- A `turn.started` request has a five-second timeout. An ambiguous request is not blindly retried because it could create another Turn. Only the failure notification is retried, at most three attempts with five-second timeouts. If Pontia remains unreachable, the hook log reports `turn_start_failure_report_failed`; persisted state is unconfirmed, not claimed to be failed.

## License

[Apache License 2.0](LICENSE)
