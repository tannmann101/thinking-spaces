// A concrete worked example showing a claim to be true, with the
// walkthrough itself and a confidence marker. See WorkBlock.jsx for
// the shared implementation every Work Tool is built on.

import WorkBlock from './WorkBlock.jsx';

function DemonstrationBlock(props) {
  return <WorkBlock {...props} statementLabel="Demonstration" rationaleLabel="Walkthrough" />;
}

export default DemonstrationBlock;
