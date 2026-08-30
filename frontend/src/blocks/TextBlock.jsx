// Renders one Text block: a paragraph, with an optional inline
// attribution tag (quote / paraphrase / reflection / inference) shown
// as a plain label in front of it. No styling yet -- see CLAUDE.md on
// holding off visual polish until the functional passes are done.

function TextBlock({ block }) {
  const { text, tag } = block.content;
  return (
    <p>
      {tag && <strong>[{tag}] </strong>}
      {text}
    </p>
  );
}

export default TextBlock;
