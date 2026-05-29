/**
 * StaticLog — append-only log renderer backed by Ink's <Static>.
 *
 * Ink renders only `items.slice(printedIndex)` and never re-touches lines it
 * has already printed (Static prints them once into terminal scrollback). This
 * makes streaming logs essentially free: old lines never participate in any
 * subsequent re-render.
 *
 * CONTRACT: `entries` must only ever GROW (concat new records). Never slice,
 * cap, or reorder it — Static dedups by index, so head-slicing desyncs which
 * lines have been printed and replays/drops history. Old lines cost nothing
 * once flushed to scrollback, so there is no need to cap.
 *
 * Each entry is a pre-parsed record from parseLogLine() carrying a stable,
 * monotonic `id` used as the React key.
 */

import React from 'react';
import { Static } from 'ink';
import LogLine from './LogLine.js';

function StaticLog({ entries }) {
  return (
    <Static items={entries ?? []}>
      {(e) => <LogLine key={e.id} entry={e} />}
    </Static>
  );
}

export default StaticLog;
