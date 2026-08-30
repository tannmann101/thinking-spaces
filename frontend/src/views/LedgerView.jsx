// Ledger: any List block's items that carry a number, shown with a
// running total.

const cellStyle = { border: '1px solid #ccc', padding: '4px' };

function LedgerView({ block }) {
  const items = block.content.items.filter((item) => typeof item.number === 'number');

  let runningTotal = 0;
  const rows = items.map((item) => {
    runningTotal += item.number;
    return { ...item, runningTotal };
  });

  return (
    <section>
      <h3>Ledger</h3>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={cellStyle}>Item</th>
            <th style={cellStyle}>Amount</th>
            <th style={cellStyle}>Running total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>{row.text}</td>
              <td style={cellStyle}>{row.number}</td>
              <td style={cellStyle}>{row.runningTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default LedgerView;
