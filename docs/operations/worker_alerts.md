# Worker Alerts

WorldDock Alpha treats Worker health as a release gate. Release driver must check `/v1/system/worker-health` before staging smoke and again before production handoff.

## Alert Conditions

- `degraded`: any queue has failed jobs. Page the release driver and inspect failed job payloads before retrying.
- `backlogged`: any queue has more than 1000 waiting jobs. Pause release, confirm Redis latency, then scale worker replicas or drain old jobs.
- `paused`: any queue is paused. Confirm whether this is an intentional maintenance hold before production deploy.

## Required Evidence

- API response from `/v1/system/worker-health` with timestamp and request id.
- Sentry event link for every non-healthy queue when `SENTRY_DSN` is configured.
- Staging smoke evidence covering creation, Agent run, release publish, search, Fork, report, import/export, and notifications.

## Triage

1. Capture the queue snapshot and current release commit.
2. If `failed > 0`, inspect the failed jobs and retry only after the root cause is understood.
3. If `waiting > 1000`, verify Redis health and worker replica count before deploy.
4. If a queue is paused, record the operator and reason in the release ticket.
5. Mark production release ready only after all queues are healthy and staging smoke has passed.
