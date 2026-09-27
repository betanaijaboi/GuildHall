"use client";

import { useState } from "react";

/** Local date-time pickers that submit ISO strings, so the server stores the host's intended moment. */
export function JamDates() {
  const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const [start, setStart] = useState(() => toLocal(new Date(Date.now() + 86_400_000)));
  const [end, setEnd] = useState(() => toLocal(new Date(Date.now() + 3 * 86_400_000)));
  const iso = (v: string) => (v ? new Date(v).toISOString() : "");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="startsAtLocal">Starts</label>
        <input id="startsAtLocal" type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} required />
        <input type="hidden" name="startsAt" value={iso(start)} />
      </div>
      <div>
        <label className="label" htmlFor="endsAtLocal">Ends</label>
        <input id="endsAtLocal" type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} required />
        <input type="hidden" name="endsAt" value={iso(end)} />
      </div>
      <p className="text-xs text-fg-muted sm:col-span-2">Times are in your timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
    </div>
  );
}
