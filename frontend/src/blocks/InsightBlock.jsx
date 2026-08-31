// An unplanned realization -- something that clicked, with what led to
// it and a confidence marker. See WorkBlock.jsx for the shared
// implementation every Work Tool is built on.

import WorkBlock from './WorkBlock.jsx';

function InsightBlock(props) {
  return <WorkBlock {...props} statementLabel="Insight" rationaleLabel="What led to it" />;
}

export default InsightBlock;
