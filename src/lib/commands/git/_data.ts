// --- Fake git log ---

export interface FakeCommit {
  hash: string;
  author: string;
  email: string;
  date: string;
  subject: string;
  body?: string;
}

export const FAKE_LOG: FakeCommit[] = [
  {
    hash: "9cbfb53",
    author: "luke",
    email: "luke@askew.sh",
    date: "Fri Feb  7 00:00:00 2026 +0000",
    subject: "archive everything, begin the terminal era",
    body: "this is fine. everything is fine.",
  },
  {
    hash: "ab5f0c6",
    author: "luke",
    email: "luke@askew.sh",
    date: "Sun Nov  3 00:00:00 2024 +0000",
    subject: "react prototype: it works, don't look at the mobile css",
  },
  {
    hash: "bf8724a",
    author: "luke",
    email: "luke@askew.sh",
    date: "Wed Sep 11 00:00:00 2024 +0000",
    subject: "content updated (yes, again)",
  },
  {
    hash: "5b73437",
    author: "luke",
    email: "luke@askew.sh",
    date: "Wed Sep 11 00:00:00 2024 +0000",
    subject: '"basic page setup" — nothing about this is basic',
  },
  {
    hash: "cdb918a",
    author: "luke",
    email: "luke@askew.sh",
    date: "Sun May 28 00:00:00 2023 +0000",
    subject: "drp updates (losing count now)",
  },
  {
    hash: "f6b2e18",
    author: "luke",
    email: "luke@askew.sh",
    date: "Sat May 27 00:00:00 2023 +0000",
    subject: 'spellcheck: turns out i cannot spell "gaussian"',
  },
  {
    hash: "579339f",
    author: "luke",
    email: "luke@askew.sh",
    date: "Sat May 27 00:00:00 2023 +0000",
    subject: "hotfix — do not ask what was broken",
  },
  {
    hash: "701904d",
    author: "luke",
    email: "luke@askew.sh",
    date: "Wed Apr  5 00:00:00 2023 +0000",
    subject: "added course that definitely will not be cancelled",
  },
  {
    hash: "561eb7d",
    author: "luke",
    email: "luke@askew.sh",
    date: "Wed Dec 28 00:00:00 2022 +0000",
    subject: 'it\'s "Weil conjecture" not "Well conjecture". sorry.',
  },
  {
    hash: "d661949",
    author: "luke",
    email: "luke@askew.sh",
    date: "Thu Nov  3 00:00:00 2022 +0000",
    subject: "who needs a database when you have hardcoded arrays",
  },
  {
    hash: "fa15509",
    author: "luke",
    email: "luke@askew.sh",
    date: "Wed Jun  8 00:00:00 2022 +0000",
    subject: "rewrote to use mongodb. this will probably break in 6 months.",
  },
  {
    hash: "e48e25b",
    author: "luke",
    email: "luke@askew.sh",
    date: "Wed Aug  4 00:00:00 2021 +0000",
    subject: "blogpost: posted. content: unknown. confidence: waning.",
  },
  {
    hash: "f8949b6",
    author: "luke",
    email: "luke@askew.sh",
    date: "Wed Jul  7 00:00:00 2021 +0000",
    subject: '"i\'ll write blog posts regularly" — past me, a liar',
  },
  {
    hash: "40de0c0",
    author: "luke",
    email: "luke@askew.sh",
    date: "Thu Aug 20 00:00:00 2020 +0000",
    subject: "started writing database. for a personal website. no notes.",
  },
  {
    hash: "82b1f2e",
    author: "luke",
    email: "luke@askew.sh",
    date: "Thu Aug 20 00:00:00 2020 +0000",
    subject: 'Update README.md  (it said "TODO: write readme")',
  },
];

// --- Blame message pool ---

export const BLAME_MESSAGES = [
  "ok fine",
  "looks fine to me",
  "why does this work",
  "this one is definitely not the bug",
  "added this at 2am",
  "DO NOT TOUCH",
  "technically not wrong",
  "refactor (did not refactor)",
  "ship it",
  "final fix",
  "final final fix",
  "future me's problem",
  "removed the embarrassing part",
  "per the alignment of the stars",
  "css moment",
  "i know what i'm doing",
  "one more tweak",
  "left for reasons",
];

// Fake date pool drawn from the commit log, used for blame metadata.
export const BLAME_DATES = [
  "2026-02-07",
  "2024-11-03",
  "2024-09-11",
  "2023-05-27",
  "2022-12-28",
  "2022-11-03",
  "2021-08-04",
  "2020-08-20",
];
