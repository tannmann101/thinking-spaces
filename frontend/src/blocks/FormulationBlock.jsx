// A working claim about what a phenomenon fundamentally is -- derived
// through a specific interpretive lens (etymology, phenomenology,
// anthropology, history, epistemology, philosophy, ...) rather than
// observed directly. See WorkBlock.jsx for the shared implementation
// every Work Tool is built on.

import WorkBlock from './WorkBlock.jsx';

function FormulationBlock(props) {
  return <WorkBlock {...props} statementLabel="Formulation" supportLabel="Grounds" />;
}

export default FormulationBlock;
