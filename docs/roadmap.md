# Roadmap

## Built

Phase 1: scaffold. The `docs/` set and conventions, the auth-gate seam, the store
interface seam, the eval and trace flywheel, Firebase wiring, and CI.

Phase 2: the persisted task app shell.
- Sidebar nav: Add task, Search stub, Inbox, Today, Upcoming, and a Projects
  list. Projects is the only project grouping.
- Today view: tasks due today under a date header, with an overdue rollover
  section. List layout.
- Upcoming view: a horizontally scrollable multi-day window, one column per day
  with its own Add task affordance and a Today control top-right. Seven-day
  window.
- Project view: title, optional collapsible sections, tasks, and sub-tasks
  nested under their parent. List layout, with a clean seam for Board later.
- Inbox: the default project, rendered like any project.
- Quick-add modal: name, description, Date picker (Today, Tomorrow, This weekend,
  Next week, No date, a month calendar, and a Time option), Priority picker (four
  flags), Labels, Reminders, and a footer project/section selector with Cancel
  and Add task.
- Task row: circular checkbox that completes, content, and a meta line with due
  time in green, label chips, and the project name when shown outside its
  project. Priority sets the checkbox ring color.
- Project overflow: Edit, Add section, Delete only.
- `store.createProjectTree` batch write, used by the normal Add flows.
- Native Todoist look against [docs/reference/](reference/).

## Next

Phase 3: the Super Ramble pipeline. Classify, Structure, Write, evals first,
writing into the task app through `createProjectTree`. Then live Todoist OAuth and
REST v1 so it can write into a real Todoist account, not only the local store.

## Out of scope

- Competing on capture quality or live-audio streaming.
- Auto-execution without confirmation.
- Board and Calendar layouts beyond leaving seams.
- Search logic, Filters page, Labels management page, Reporting, Favorites,
  Share, comments, templates, CSV, attachments, location, deadline, extensions.
- Drag-and-drop reordering. Order fields exist; the manual reorder UI is out.
