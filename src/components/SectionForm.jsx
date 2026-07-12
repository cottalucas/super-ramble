import { useEffect, useRef, useState } from 'react';

// The Add/Edit section form: a name field and a description field, the same
// two-field shape TaskAddForm and AddProjectModal already use for their own
// name+description pair. Renders inline, replacing whatever it stands in
// for (a "+ Add section" line, or a section's own head row) in place: a
// thin-bordered box, no backdrop, no centered floating card, the same
// convention docs/design-system.md's "Inline add-task" section already
// established for InlineTaskAdd. See docs/roadmap.md and
// docs/resolution-log.md.
export default function SectionForm({ initial = {}, submitLabel, onSubmit, onCancel, autoFocus = true }) {
  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description || '');
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    if (autoFocus) nameRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const canSubmit = name.trim().length > 0 && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    await onSubmit({ name: name.trim(), description: description.trim() });
  }

  function onNameKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="inline-add section-form">
      <div className="modal-body">
        <input
          ref={nameRef}
          className="modal-name"
          placeholder="Name this section"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onNameKey}
        />
        <textarea
          className="modal-desc"
          placeholder="Add a description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="modal-footer">
        <div className="right">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={submit}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
