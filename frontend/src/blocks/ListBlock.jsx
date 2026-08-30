// Renders one List block: an ordered set of items. Each item's text is
// plain; whichever of checkbox/number/date/confidence it happens to
// carry is shown as a plain trailing label. No editing, no Views over
// this data yet -- just the raw block.

function ListBlock({ block }) {
  const items = block.content.items || [];
  return (
    <ol>
      {items.map((item) => (
        <li key={item.id}>
          {typeof item.checkbox === 'boolean' && (
            <input type="checkbox" checked={item.checkbox} readOnly />
          )}{' '}
          {item.text}
          {typeof item.number === 'number' && <> — number: {item.number}</>}
          {item.date && <> — date: {item.date}</>}
          {item.confidence && <> — confidence: {item.confidence}</>}
        </li>
      ))}
    </ol>
  );
}

export default ListBlock;
