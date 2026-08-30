// Renders one Reference block: a link to another Space, with an
// optional note. The backend attaches targetSpaceTitle so this doesn't
// need its own fetch just to show the target's name.

import { Link } from 'react-router-dom';

function ReferenceBlock({ block }) {
  const { target_space_id, note, targetSpaceTitle } = block.content;
  return (
    <p>
      → <Link to={`/spaces/${target_space_id}`}>{targetSpaceTitle || target_space_id}</Link>
      {note && <> — {note}</>}
    </p>
  );
}

export default ReferenceBlock;
