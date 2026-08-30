// Progress: any List block's items that carry a checkbox, shown as a
// completion count and a bar. Items without a checkbox at all aren't
// counted in the total -- only items where the property is actually set.

function ProgressView({ block }) {
  const items = block.content.items.filter((item) => typeof item.checkbox === 'boolean');
  const done = items.filter((item) => item.checkbox).length;
  const total = items.length;

  return (
    <section>
      <h3>Progress</h3>
      <p>
        {done} of {total} complete
      </p>
      <progress value={done} max={total || 1} />
    </section>
  );
}

export default ProgressView;
