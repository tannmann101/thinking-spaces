// Timeline: any List block's items that carry a date, shown in
// chronological order. Doesn't care what block this data lives in --
// it just needs items with dates.

function TimelineView({ block }) {
  const items = block.content.items.filter((item) => item.date);
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section>
      <h3>Timeline</h3>
      <ul>
        {sorted.map((item) => (
          <li key={item.id}>
            {item.date} — {item.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default TimelineView;
