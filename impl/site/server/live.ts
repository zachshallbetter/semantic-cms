/**
 * The live channel (SCMS-063, epic E14).
 *
 * §8.3 states what this must do, and — just as importantly — what it must not:
 *
 *   "The notify phase pushes **invalidation keys**; clients re-fetch through
 *    access projection. If the live channel fails, the client silently keeps its
 *    snapshot and says so — failure degrades to truth, not to a spinner."
 *
 * So the wire carries **keys, never content**. A subscriber is told *which
 * subject changed*, and re-fetches through the same access projection it would
 * have used anyway. That is what keeps the channel from becoming a second read
 * path with its own access rules — the failure NR-scms-004 and NR-scms-006 were
 * both instances of.
 *
 * **How the site learns anything changed.** The editor and the site are separate
 * processes, and the site rebuilds its Canon at startup by replaying the action
 * log through the contracts (SCMS-051). This watches that log and replays the
 * increment, so an edit in the editor reaches a reader without either process
 * knowing about the other.
 *
 * That is development-grade custody, and deliberately so: the real mechanism is
 * already in the schema. `canon_emit` calls `pg_notify('canon_outbox', ...)`,
 * which is the native channel §8.1 requires. When the store adapter lands
 * (SCMS-065) this watcher is replaced by a LISTEN, and nothing above it changes
 * — which is the point of keeping the seam here rather than in the routes.
 */
import { readFileSync, existsSync } from "node:fs";
import type { ServerResponse } from "node:http";
import type { CanonJournal } from "../../canon/src/journal.ts";
import type { ContractRegistry } from "../../contracts/src/runtime.ts";
import { deliver } from "../../transport/src/wire.ts";
import { replayActions } from "./replay.ts";

export interface LiveClient {
  id: string;
  res: ServerResponse;
  /** The subject ids this client's page actually depends on, post-access-projection. */
  dependencies: string[];
  /** How many of this client's own relevant events it has consumed (SCMS-038). */
  position: number | null;
}

/**
 * What each client is told is decided by `deliver` (SCMS-033), and not here.
 *
 * The first version of this file computed the wave itself, straight from
 * `journal.events()`, and ignored `minimumAccess` — so a **public** SSE client
 * was sent the subject ids of owner-scoped evidence and attestation records,
 * revision hashes included. It learned that qualification had happened, on which
 * revision, and which obligations ran (NR-scms-018).
 *
 * The cause is one this project keeps recording: I wrote a third notification
 * path beside `fanOut` and `deliver`, both of which were built specifically to
 * be non-leaking, and the new one did not inherit the property. A second
 * implementation of a rule is a second chance to get it wrong — and I did it
 * while quoting §8.3 in the paragraph above.
 *
 * So there is no wave computation in this module any more. `deliver` filters
 * against the subscriber's own accessible dependency set, which was computed
 * after access projection, so a change a reader cannot observe cannot reach it.
 */

/** SSE framing. Comments double as keep-alives and are ignored by EventSource. */
function send(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export interface LiveChannel {
  /** @param dependencies the accessible dependency set of the page this client is viewing */
  attach(res: ServerResponse, id: string, dependencies: string[]): void;
  /** Replay any new actions and tell every client what changed. Returns the wave size. */
  pump(): number;
  clientCount(): number;
  close(): void;
}

export function openLiveChannel(opts: {
  journal: CanonJournal;
  registry: ContractRegistry;
  logPath: string;
  actor: { id: string; role: string };
  /** Explicit clock — no ambient time, as everywhere else. */
  now: () => string;
  onChange?: () => void;
}): LiveChannel {
  const clients = new Map<string, LiveClient>();
  let replayed = existsSync(opts.logPath)
    ? readFileSync(opts.logPath, "utf8").split("\n").filter(Boolean).length
    : 0;

  function pump(): number {
    if (!existsSync(opts.logPath)) return 0;
    const lines = readFileSync(opts.logPath, "utf8").split("\n").filter(Boolean);
    if (lines.length <= replayed) return 0;

    // Replay only the increment, through the contracts — a replayed action
    // crosses exactly the gates the original crossed (SCMS-052).
    replayActions(opts.journal, opts.registry, opts.logPath, opts.actor, opts.now());
    replayed = lines.length;
    opts.onChange?.();

    let told = 0;
    for (const client of clients.values()) {
      // One delivery per subscriber, filtered by that subscriber's own
      // accessible dependency set. Silence is a valid outcome and carries no
      // information — a client with nothing to hear gets no message at all.
      const delivery = deliver(opts.journal, {
        subscription: { id: client.id, access: "public", dependencies: client.dependencies },
        position: client.position,
      });
      if (!delivery) continue;
      send(client.res, "invalidate", { keys: delivery.keys, phase: delivery.phase });
      client.position = delivery.cursor;
      told += delivery.keys.length;
    }
    return told;
  }

  return {
    attach(res, id, dependencies) {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      // Tell the client where it stands immediately. A client that has just
      // connected is current, and should say so rather than assume it.
      // A client that has just been served a page is CAUGHT UP, not new: the
      // page it is holding was rendered from the state it is about to be told
      // about. Starting at `null` made the first wave a backfill of everything
      // the page already showed, so a browser re-fetched on connect for no
      // reason.
      //
      // The position is taken from `deliver` rather than counted here, because
      // "how many events are relevant to this subscriber" is exactly the
      // question `deliver` already answers correctly — and reimplementing it is
      // how NR-scms-018 happened one function earlier.
      const caughtUp = deliver(opts.journal, {
        subscription: { id, access: "public", dependencies },
        position: null,
      });
      send(res, "ready", { at: opts.now(), position: caughtUp?.cursor ?? 0 });
      clients.set(id, { id, res, dependencies, position: caughtUp?.cursor ?? 0 });
      res.on("close", () => { clients.delete(id); });
    },
    pump,
    clientCount: () => clients.size,
    close() {
      for (const c of clients.values()) c.res.end();
      clients.clear();
    },
  };
}
