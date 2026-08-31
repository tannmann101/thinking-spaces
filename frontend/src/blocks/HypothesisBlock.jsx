// A claim proposed to test, not yet believed -- distinct from
// Assessment's already-reached judgment. See WorkBlock.jsx for the
// shared implementation every Work Tool is built on.

import WorkBlock from './WorkBlock.jsx';

function HypothesisBlock(props) {
  return <WorkBlock {...props} statementLabel="Hypothesis" supportLabel="What would test this" />;
}

export default HypothesisBlock;
