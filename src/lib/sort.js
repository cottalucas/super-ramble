// Client-side sort over an already-fetched task list. Manual keeps the stored
// order field; Priority and Date reorder for display only and never touch
// order or write to the store. See docs/roadmap.md.
export function sortTasks(tasks, mode) {
  const arr = [...tasks];
  if (mode === 'priority') {
    arr.sort((a, b) => a.priority - b.priority || a.order - b.order);
  } else if (mode === 'date') {
    arr.sort((a, b) => {
      const ad = a.due?.date || '9999-99-99';
      const bd = b.due?.date || '9999-99-99';
      return ad.localeCompare(bd) || a.order - b.order;
    });
  } else {
    arr.sort((a, b) => a.order - b.order);
  }
  return arr;
}
