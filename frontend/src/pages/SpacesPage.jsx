// Every Space, as a real index.
//
// The Dashboard used to carry the full searchable list; it now keeps a
// short "recent and needs attention" view and links here instead, so the
// two have genuinely different jobs rather than being two copies of the
// same list. What earns this page its place is everything the Dashboard's
// one-line rows never showed: each Space's own glyph, its Categories, how
// much is unresolved in it, and how far its Milestones have got --
// grouped by status so the shape of the whole collection is visible at
// once.
//
// All of it is already computed on every Space (see
// withComputedSpaceFields), so this needed no new backend read.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSpaces, deleteSpace } from '../api.js';
import SpaceGlyph, { SPACE_STATUSES } from '../glyph/SpaceGlyph.jsx';
import { resolveSpaceTheme, themeAttributes } from '../theme/itemTheme.js';
import { useConfirmDialog } from '../components/ConfirmDialog.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

const SORTS = [
  { key: 'recent', label: 'Recently touched' },
  { key: 'title', label: 'Title' },
  { key: 'connections', label: 'Most connected' },
  { key: 'unresolved', label: 'Most unresolved' },
];

function sortSpaces(spaces, sort) {
  const copy = [...spaces];
  if (sort === 'title') return copy.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'connections') return copy.sort((a, b) => (b.relationDensity || 0) - (a.relationDensity || 0));
  if (sort === 'unresolved') return copy.sort((a, b) => (b.openTensionCount || 0) - (a.openTensionCount || 0));
  return copy.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

function SpaceCard({ space, onDelete }) {
  const milestones = space.milestoneStats;
  return (
    <li className="space-index-card" {...themeAttributes(resolveSpaceTheme(space))}>
      <div className="space-index-head">
        <SpaceGlyph space={space} size={28} />
        <Link to={`/spaces/${space.id}`} className="space-index-title">
          {space.title}
        </Link>
      </div>

      {space.goal && <p className="space-index-goal">{space.goal}</p>}

      <p className="space-index-meta">
        {space.status}
        {space.due_date && (
          <>
            {' · '}
            due {space.due_date}
            {space.isOverdue && <span className="overdue-badge">Overdue</span>}
          </>
        )}
        {space.relationDensity > 0 && ` · ${space.relationDensity} connected`}
        {space.openTensionCount > 0 && ` · ${space.openTensionCount} open`}
        {milestones?.total > 0 && ` · ${milestones.reached}/${milestones.total} milestones`}
      </p>

      {space.categories?.length > 0 && (
        <p className="space-index-categories">
          {space.categories.map((category) => (
            <span key={category} className="category-chip">
              {category}
            </span>
          ))}
        </p>
      )}

      {/* Managing the collection belongs on the index, not on the
          Dashboard's glance surface. Safe to offer here now that a
          delete goes to the trash rather than being permanent. */}
      {!space.isTestSpace && (
        <button type="button" className="btn-ghost-small" onClick={() => onDelete(space)}>
          Delete
        </button>
      )}
    </li>
  );
}

function SpacesPage() {
  usePageTitle('Spaces');
  const { promptToMatch } = useConfirmDialog();
  const [spaces, setSpaces] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');

  function refetch() {
    getSpaces()
      .then(setSpaces)
      .catch((err) => setError(err.message));
  }

  useEffect(refetch, []);

  async function handleDelete(space) {
    const confirmed = await promptToMatch(
      `Delete "${space.title}" and everything in it? It will go to the trash, where you can restore it.`,
      space.title
    );
    if (!confirmed) return;
    await deleteSpace(space.id);
    refetch();
  }

  const matching = useMemo(() => {
    if (!spaces) return [];
    const term = search.trim().toLowerCase();
    if (!term) return spaces;
    return spaces.filter(
      (space) =>
        space.title.toLowerCase().includes(term) || (space.goal || '').toLowerCase().includes(term)
    );
  }, [spaces, search]);

  // Grouped by status so the shape of the whole collection reads at a
  // glance. Statuses come from the glyph's own list, in its own order, so
  // this can't drift from the vocabulary the status pill cycles through.
  const groups = useMemo(
    () =>
      SPACE_STATUSES.map((status) => ({
        status,
        spaces: sortSpaces(
          matching.filter((space) => space.status === status),
          sort
        ),
      })).filter((group) => group.spaces.length > 0),
    [matching, sort]
  );

  return (
    <div className="app-shell">
      <Sidebar current="spaces" />
      <main className="app-content">
        <h1>Spaces</h1>
        <p>
          Every train of thought you&rsquo;ve started, grouped by how settled it is. The Dashboard shows what
          needs you right now; this is the whole collection.
        </p>

        {error && <p>Could not load Spaces: {error}</p>}
        {!error && !spaces && <p>Loading...</p>}

        {spaces && (
          <>
            <p className="space-search-row">
              <input
                type="search"
                value={search}
                placeholder="Filter by title or what it's working toward"
                aria-label="Filter Spaces"
                className="space-search-input"
                onChange={(event) => setSearch(event.target.value)}
              />{' '}
              <label>
                Sort:{' '}
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  {SORTS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </p>

            {matching.length === 0 && (
              <p className="empty-note">
                {spaces.length === 0 ? 'No Spaces yet.' : `Nothing matches “${search}”.`}
              </p>
            )}

            {groups.map((group) => (
              <section key={group.status}>
                <h2 className="space-index-status">
                  {group.status} <span className="space-index-count">({group.spaces.length})</span>
                </h2>
                <ul className="space-index-grid">
                  {group.spaces.map((space) => (
                    <SpaceCard key={space.id} space={space} onDelete={handleDelete} />
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </main>
    </div>
  );
}

export default SpacesPage;
