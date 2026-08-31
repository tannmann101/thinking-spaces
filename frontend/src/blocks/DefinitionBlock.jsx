// A term and its meaning, with a confidence marker for how settled it
// feels. The one Work Type whose two fields aren't "the Tool's own
// name" and "why" -- a Definition is inherently asymmetric (a short
// term, a longer meaning), so the statement field holds the term and
// the meaning itself lives in what every other Work Type calls
// "rationale". See WorkBlock.jsx for the shared implementation.

import WorkBlock from './WorkBlock.jsx';

function DefinitionBlock(props) {
  return <WorkBlock {...props} statementLabel="Term" rationaleLabel="Definition" />;
}

export default DefinitionBlock;
