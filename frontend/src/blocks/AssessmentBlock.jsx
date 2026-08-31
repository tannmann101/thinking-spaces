// A judgment on something, with supporting rationale and a confidence
// marker -- the first of the "Work" Tools. See WorkBlock.jsx for the
// shared implementation every Work Tool is built on.

import WorkBlock from './WorkBlock.jsx';

function AssessmentBlock(props) {
  return <WorkBlock {...props} statementLabel="Assessment" supportLabel="Rationale" />;
}

export default AssessmentBlock;
