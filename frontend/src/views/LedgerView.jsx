// Ledger: any List block's items that carry a number, shown with a
// running total.

function LedgerView({ block }) {
  const items = block.content.items.filter((item) => typeof item.number === 'number');

  // Built functionally (no mutated accumulator variable) so each
  // render computes the same rows from the same items with nothing
  // carried over between renders -- oxlint flagged the previous
  // let-and-reassign version as a variable reassigned after render,
  // since it couldn't tell the reassignment was fully render-scoped.
  const rows = items.reduce((acc, item) => {
    const previousTotal = acc.length > 0 ? acc[acc.length - 1].runningTotal : 0;
    return [...acc, { ...item, runningTotal: previousTotal + item.number }];
  }, []);

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
