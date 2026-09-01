// Read-only preview of one draft block -- used anywhere a block is
// being assembled before it has a database id (the Template editor,
// and Creation Mode's Tools step). Not the live blockRegistry
// components -- those expect a real saved block and would try to PATCH
// one that doesn't exist yet. Text and List are the two types these
// draft-assembly UIs can actually create; anything else (Reference,
// Media, Comparison) can only already be present in a Template built
// before this UI existed, so it's shown but left alone rather than
// silently dropped.

function BlockPreview({ block }) {
  if (block.type === 'text') {
    return <p>[Writing] {block.content?.text || <em>(empty)</em>}</p>;
  }
  if (block.type === 'list') {
    return (
      <div>
        <p>
          [List] {block.content?.laneLabel || <em>(no heading)</em>}
        </p>
        <ul>
          {(block.content?.items || []).map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ul>
      </div>
    );
  }
  return <p>[{block.type}] (not editable in this UI -- preserved as-is)</p>;
}

export default BlockPreview;
