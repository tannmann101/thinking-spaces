// An open question worth holding onto, with why it matters and a
// confidence marker for how central/pressing it feels -- the second of
// the "Work" Tools. See WorkBlock.jsx for the shared implementation
// every Work Tool is built on.

import WorkBlock from './WorkBlock.jsx';

function QuestionBlock(props) {
  return <WorkBlock {...props} statementLabel="Question" rationaleLabel="Why this matters" />;
}

export default QuestionBlock;
