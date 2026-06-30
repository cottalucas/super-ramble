# Brief

## What super-ramble is

Voice brain-dump in, structured projects out. super-ramble reads a transcript
plus your existing Todoist projects, decides whether the content is loose tasks
or a project with nested sub-tasks, proposes a scaffold, shows a one-line reason
for that decision, and on your confirm writes the result to Todoist.

## The stage

This is the organize step that sits right after capture. Todoist's Ramble
already captures a spoken stream into flat tasks and routes them into existing
projects. super-ramble does the part Ramble does not: it synthesizes structure.

## The problem

Ramble captures and routes. It does not structure or nest. Its own UI tips state
that it does not support sub-tasks, and it does not invent a new project shape
from a dump. So a messy spoken plan lands as a flat pile of tasks. The user is
left to build the project, order the steps, and nest the sub-tasks by hand. That
manual reorganization is the gap super-ramble fills.

## The user

Anyone who brain-dumps into Todoist and then has to organize. They think out
loud, capture fast, and want the structure to fall out without busywork. They
already trust Todoist, so super-ramble has to feel calm and adjacent to it, not
like a louder, busier tool.

## Scope

- Capture: record then transcribe. Deliberately simple. A thin input adapter.
- Structure synthesis: loose tasks or project-with-sub-tasks, with reasoning.
- Confirm: the user reviews and accepts before anything is written.
- Write: create the project and nested tasks in Todoist on confirm.

## Success signal

A user speaks a messy dump and gets back a correctly scaffolded project they
accept and ship to Todoist with one confirm. The structure matches what they
meant. They did not have to fix it.

## Constraints

- Privacy. Personal free text is encrypted client-side before any write. No
  secret key reaches the browser.
- User in control. Nothing is written without an explicit confirm.
- Capture stays simple so structuring stays the focus. The voice pipeline is an
  adapter, not the product.
- Generic output kills trust. A bland or wrong scaffold is worse than none. The
  decision and its one-line reason have to feel right the first time.
