// Streak: a daily checkbox List (items carrying both a date and a
// checkbox), rendered as a calendar grid rather than a plain list, so
// gaps in the streak are visible at a glance.

const cellStyle = {
  border: '1px solid #ccc',
  padding: '4px',
  textAlign: 'center',
  minWidth: '32px',
};

function StreakView({ block }) {
  const items = block.content.items.filter(
    (item) => typeof item.checkbox === 'boolean' && item.date
  );
  if (items.length === 0) return null;

  const byDate = new Map(items.map((item) => [item.date, item]));
  const dates = items.map((item) => new Date(item.date + 'T00:00:00Z')).sort((a, b) => a - b);
  const start = dates[0];
  const end = dates[dates.length - 1];

  // Pad the range out to full weeks (Sunday-start) so it renders as a
  // proper calendar grid, not just a ragged row of days.
  const gridStart = new Date(start);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  const gridEnd = new Date(end);
  gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - gridEnd.getUTCDay()));

  const days = [];
  for (let d = new Date(gridStart); d <= gridEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(new Date(d));
  }

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <section>
      <h3>Streak</h3>
      <table style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {weeks.map((week, weekIndex) => (
            <tr key={weekIndex}>
              {week.map((day) => {
                const iso = day.toISOString().slice(0, 10);
                const item = byDate.get(iso);
                const inRange = day >= start && day <= end;
                return (
                  <td key={iso} style={cellStyle}>
                    {inRange && (
                      <>
                        {day.getUTCDate()}
                        <br />
                        {item ? (item.checkbox ? '✓' : '·') : ''}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default StreakView;
