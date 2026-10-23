// Single-select filter chips; clicking the active chip clears it.
export default function Chips({ label, options, value, onChange }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      <span className="chips-label">{label}</span>
      {options.map((o) => (
        <button key={o} className={`chip ${value === o ? 'on' : ''}`} aria-pressed={value === o}
                onClick={() => onChange(value === o ? '' : o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
