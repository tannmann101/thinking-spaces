// A conclusion reached by explicit reasoning from other claims, with
// that reasoning and a confidence marker. See WorkBlock.jsx for the
// shared implementation every Work Tool is built on.

import WorkBlock from './WorkBlock.jsx';

function DeductionBlock(props) {
  return <WorkBlock {...props} statementLabel="Deduction" supportLabel="Reasoning" />;
}

export default DeductionBlock;
