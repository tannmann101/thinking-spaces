// What seems to follow from something, short of proof -- a softer,
// more suggestive sibling to Deduction's explicit reasoning. See
// WorkBlock.jsx for the shared implementation every Work Tool is
// built on.

import WorkBlock from './WorkBlock.jsx';

function ImplicationBlock(props) {
  return <WorkBlock {...props} statementLabel="Implication" supportLabel="What suggests it" />;
}

export default ImplicationBlock;
