// A finding reached by breaking something down into its parts, with
// that breakdown and a confidence marker. See WorkBlock.jsx for the
// shared implementation every Work Tool is built on.

import WorkBlock from './WorkBlock.jsx';

function AnalysisBlock(props) {
  return <WorkBlock {...props} statementLabel="Analysis" rationaleLabel="Breakdown" />;
}

export default AnalysisBlock;
