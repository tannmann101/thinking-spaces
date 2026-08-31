// Progress: any List block's items that carry a checkbox, shown as a
// completion count and a bar. Items without a checkbox at all aren't
// counted in the total -- only items where the property is actually set.

function ProgressView({ block }) {
  const items = block.content.items.filter((item) => typeof item.checkbox === 'boolean');
  const done = items.filter((item) => item.checkbox).length;
  const total = items.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="view-card">
      <h3>Progress</h3>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-stat">
        {done} of {total} complete
      </div>
    </div>
  );
}

export default ProgressView;
