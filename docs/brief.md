# Brief

## Stage

Working prototype. Phase 1 scaffolded the repo and conventions. Phase 2 builds
the persisted task app shell. Phase 3 adds the Super Ramble pipeline.

## Problem

Capturing tasks is solved. Todoist Ramble takes a spoken brain-dump and turns it
into separate tasks, fast and well. But Ramble is flat by design. Its own
interface states it does not create sub-tasks. A brain-dump is often not a list
of loose tasks. It is a project waiting to be structured: a goal, a set of
steps, some of them nested. Today the user builds that structure by hand after
capture. The organize step between a raw dump and a structured project is
unowned.

## Product

Super Ramble is the organize step. A user rambles or types a brain-dump. Super
Ramble reads it against the user's existing projects and labels, decides whether
the content is loose tasks or a structured project, and when it is a project,
proposes a scaffold: a project name, sections where they help, tasks, and
sub-tasks nested under their parents, with priorities and dates inferred from the
words. The user reviews the proposed structure, edits anything, and confirms.
Only on confirm does Super Ramble write the project tree to the task store.
Nothing is auto-executed. The model proposes, the human commits.

## User

Anyone who thinks out loud before they organize. People who brain-dump into a
task app and then spend effort turning that dump into something structured. They
already know what they want to do. They lack a fast path from spoken intent to
organized structure.

## Scope

A faithful task app as the container: projects, sections, tasks, sub-tasks,
priorities, dates, labels, reminders. On top of it, a capture-to-structure
pipeline that writes into the container on confirm. The four pipeline stages are
detailed in [docs/llm-pipeline.md](llm-pipeline.md).

## Success signal

A user rambles a real project, gets back a scaffold they recognize as theirs,
confirms it with light edits, and keeps using it. They reach for Super Ramble the
next time they have a messy project in their head, instead of building it by
hand.

## Constraints

- The structure has to be genuinely good. A bad scaffold is worse than none,
  because the user has to unpick it.
- Capture stays deliberately simple. The value is the structuring, not the
  transcription.
- Nothing writes without explicit confirmation.
- Personal task text can be sensitive. It is treated as private by default.
