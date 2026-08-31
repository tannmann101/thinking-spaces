// Ledger: any List block's items that carry a number, shown with a
// running total.

function LedgerView({ block }) {
  const items = block.content.items.filter((item) => typeof item.number === 'number');

  let runningTotal = 0;
  const rows = items.map((item) => {
    runningTotal += item.number;
    return { ...item, runningTotal };
  });

  return (
    <div className="view-card">
      <h3>Ledger</h3>
      <table className="ledger-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Amount</th>
            <th>Running total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.text}</td>
              <td>{row.number}</td>
              <td>{row.runningTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default LedgerView;
