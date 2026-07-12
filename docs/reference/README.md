# Reference screenshots

This folder is the source of visual truth. Drop the real Todoist screenshots
here and refine the UI against them, not from memory. See
[docs/design-system.md](../design-system.md) for the tokens and the litmus test.

Expected set, referenced across the docs and the phase 2 build:

- `01-today.png` Today view: task rows, checkbox, priority ring, green due meta.
- `02-upcoming.png` Upcoming: horizontal multi-day columns, per-day Add task.
- `04-task-row.png` Task row detail: meta line, label chips, project name.
- `05-quick-add.png` Quick-add modal: name, description, footer selectors.
- `08-quick-add-full.png` Quick-add with all fields shown.
- `09-date-picker.png` Date picker: presets, month calendar, Time.
- `10-labels-reminders.png` Labels and Reminders pickers.
- `11-priority.png` Priority picker: four flags (p1 red, p2 orange, p3 blue, p4).
- `12-sidebar.png` Sidebar: nav-item rhythm (icon size, gap, padding), the
  "My Projects" label and its collapse chevron, and the "#" project-color
  glyph. Needed to audit `.nav-item`/`.nav-section-label`/`.project-hash`/
  `.count` sizing concretely; see docs/design-system.md's "Sidebar project
  list" section.

Until the images are added, the build follows the inline specifications and the
tokens in the design system.
