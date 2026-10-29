// Plan morning-digest § 1. The contract every part of § 2 builds against: the reader fills it,
// the page, the JSON and the board link only read it.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing at the edge.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times keep the log's offset (styleguide).
export type DigestRow = {
  job: string;
  owner: string | null; // owner of the job's last line; null renders as —
  runs: number; // lines for this job
  retries: number; // lines with status retry
  lastStatus: RunStatus;
  lastError: string | null; // the latest error the job logged, even if it recovered after
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  counts: Record<RunStatus, number>; // parsed lines per status
  badLines: number; // lines that didn't parse; counted, never thrown
};

// null: no file for that night (or not a YYYY-MM-DD night). An empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
