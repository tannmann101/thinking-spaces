// Timeline: any List block's items that carry a date, shown in
// chronological order. Doesn't care what block this data lives in --
// it just needs items with dates.

function TimelineView({ block }) {
  const items = block.content.items.filter((item) => item.date);
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="view-card">
      <h3>Timeline</h3>
      <ol className="timeline-spine">
        {sorted.map((item) => (
          <li key={item.id} className="timeline-tick">
            <span className="t-date">{item.date}</span>
            {item.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default TimelineView;
