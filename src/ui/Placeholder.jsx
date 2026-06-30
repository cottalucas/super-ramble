// The deployable placeholder. One name, one line, nothing else.
// Real design comes from screenshots of the live Todoist Ramble flow
// after this deploys (see docs/design-system.md).
export default function Placeholder({ note }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        color: '#1f1f1f',
        background: '#ffffff',
        padding: '2rem',
        textAlign: 'center'
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>super-ramble</h1>
      <p style={{ fontSize: '1.125rem', color: '#4a4a4a', margin: 0, maxWidth: '32rem' }}>
        Voice brain-dump in, structured projects out. The organize step after capture.
      </p>
      {note ? (
        <p style={{ fontSize: '0.875rem', color: '#8a6d3b', margin: 0, maxWidth: '32rem' }}>
          {note}
        </p>
      ) : null}
    </main>
  );
}
