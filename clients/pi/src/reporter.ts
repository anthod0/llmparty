import { appendDiagnostic } from "./diagnostics.js";
import type { InternalEvent } from "./events.js";

type FetchLike = typeof fetch;

export interface EventReportResult {
  accepted: boolean;
  eventId?: string;
  turnId?: string;
}

export interface EventReporterOptions {
  fetch?: FetchLike;
  logFile: string;
}

export class EventReporter {
  private readonly fetchImpl: FetchLike;
  private readonly logFile: string;

  constructor(options: EventReporterOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.logFile = options.logFile;
  }

  async report(context: { internalEventUrl: string }, event: InternalEvent): Promise<EventReportResult> {
    try {
      const response = await this.fetchImpl(context.internalEventUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
        ...(event.type === "turn.started" ? { signal: AbortSignal.timeout(5_000) } : {}),
      });

      const body = await response.text().catch(() => "");
      if (!response.ok) {
        await appendDiagnostic(this.logFile, {
          level: "error",
          code: "internal_event_post_failed",
          message: `Internal Event API rejected ${event.type}: ${response.status} ${response.statusText}`,
          details: { event_type: event.type, status: response.status, body },
        });
        await this.reportStartFailure(context, event, "event_rejected");
        return { accepted: false };
      }

      let responseBody: unknown;
      try {
        responseBody = body ? JSON.parse(body) : null;
      } catch {
        responseBody = null;
      }
      const record = responseBody && typeof responseBody === "object" ? responseBody as Record<string, unknown> : undefined;
      if (event.type === "turn.started" && (record?.accepted !== true || typeof record?.turn_id !== "string" || !record.turn_id)) {
        await this.reportStartFailure(context, event, "missing_turn_id");
        return { accepted: false };
      }
      return {
        accepted: true,
        eventId: typeof record?.event_id === "string" ? record.event_id : undefined,
        turnId: typeof record?.turn_id === "string" ? record.turn_id : undefined,
      };
    } catch (error) {
      await appendDiagnostic(this.logFile, {
        level: "error",
        code: "internal_event_post_exception",
        message: `Internal Event API POST failed for ${event.type}`,
        details: { event_type: event.type, error: error instanceof Error ? error.message : String(error) },
      });
      await this.reportStartFailure(context, event, "transport_failed");
      return { accepted: false };
    }
  }

  private async reportStartFailure(
    context: { internalEventUrl: string },
    event: InternalEvent,
    reason: "event_rejected" | "transport_failed" | "missing_turn_id",
  ): Promise<void> {
    if (event.type !== "turn.started" || typeof event.data.runtime_instance_id !== "string") return;
    const url = new URL(context.internalEventUrl);
    url.pathname = `/internal/v1/sessions/${encodeURIComponent(event.session_id)}/turn-start-failure`;
    // A lost turn.started response is ambiguous: retrying it could create a
    // second Turn. Only this fenced, idempotent failure notification is retried.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
      try {
        const response = await this.fetchImpl(url.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runtime_instance_id: event.data.runtime_instance_id, reason }),
          signal: AbortSignal.timeout(5_000),
        });
        const body = await response.json().catch(() => null) as { accepted?: unknown } | null;
        if (response.ok && body?.accepted === true) return;
        if (response.status < 500 && response.status !== 429) break;
      } catch {
        // Exhaustion is visible locally; an unreachable server cannot persist
        // a state transition. Never claim that this notification succeeded.
      }
    }
    await appendDiagnostic(this.logFile, {
      level: "error",
      code: "turn_start_failure_report_failed",
      message: "could not persist turn.started reporting failure; workflow state is unconfirmed",
      details: { session_id: event.session_id, reason },
    });
  }
}
