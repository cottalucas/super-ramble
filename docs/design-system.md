# Design system

## Principle

Match Todoist closely so the product reads as native. Someone who uses Todoist
should open Super Ramble and feel at home. [docs/reference/](reference/) holds
the screenshots that are the source of visual truth. Refine against those
screenshots, not from memory. The tokens below are defined here so the look never
regresses even as views change.

## Litmus test

A screenshot of any view should be hard to tell apart from Todoist at a glance.
If a view drifts from that bar, it is wrong, even if it builds.

## Visual tokens

```
--ds-red          #dc4c3e   primary actions, active nav, Add task
--ds-red-tint     #fef0ed   active nav row fill
--ds-p1           #d1453b   priority 1 flag and checkbox ring
--ds-p2           #eb8909   priority 2
--ds-p3           #246fe0   priority 3
--ds-p4           transparent   priority 4 (none)
--ds-sidebar-bg   #fcfaf8   warm near-white sidebar
--ds-canvas       #ffffff   main content
--ds-ink          #202020   primary text
--ds-ink-soft     #808080   secondary text and meta
--ds-line         #ededed   hairlines
--ds-due-green    #058527   due time and date text
```

Font: Inter, the closest free match to Todoist's sans. Tight row rhythm.
Generous left padding in the content column. A slim, warm sidebar.

## One primary action per surface

The red Add task is the single primary action. Every other control is secondary
or quiet. Do not place two equally loud buttons on one surface.

## Copy rules (stop-slop)

Run these on every label, button, and empty state. Source:
github.com/hardikpandya/stop-slop.

- Active voice. The user does things; the product responds.
- No filler, no throat-clearing. Open on the point.
- Varied rhythm. Mix short and long sentences. Do not drone.
- No em dashes.
- Avoid the hyphen as a connector. Use a period or a comma instead. Compound
  words keep their hyphen (sub-task, brain-dump, client-side).
- Say what a thing does, plainly. No hype, no hedging.

## Anti-pattern checklist

Check every view against this before done.

- No tiny fonts. Body text stays comfortably readable.
- No cramped spacing. Honor the row rhythm; let the layout breathe.
- No low contrast. Text and controls meet a clear contrast bar.
- No inconsistent rhythm. Spacing and type follow the scale, not ad hoc values.
- No more than one primary action per view.
