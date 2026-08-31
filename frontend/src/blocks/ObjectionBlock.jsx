// A specific challenge to another existing claim -- distinct from a
// generic Question. What it challenges is typically a linked support
// point (see WorkBlock.jsx's support-point pointer mechanism) rather
// than a dedicated field of its own, which is what keeps Objection
// consistent with the shared shape every other Work Type uses.

import WorkBlock from './WorkBlock.jsx';

function ObjectionBlock(props) {
  return <WorkBlock {...props} statementLabel="Objection" supportLabel="What this challenges" />;
}

export default ObjectionBlock;
