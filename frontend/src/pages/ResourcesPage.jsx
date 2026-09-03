// Every Resource, grouped by what kind of thing it is, and showing what
// actually references it.
//
// That last part is what earns this its own page. A Resource is something
// brought in from outside to think alongside; the question worth asking of
// the whole collection is which ones are actually being used. Nothing in
// the app answered that before -- backlinks existed, but only ever on one
// Space's own page, so "which Resources have I never touched" meant
// visiting every one.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getResourcesIndex } from '../api.js';
import { resolveSpaceTheme, themeAttributes } from '../theme/itemTheme.js';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

// A Resource with no type tag still needs a home. Named rather than left
// blank so it reads as a real group instead of a rendering slip.
const UNTYPED = 'Untyped';
// A Synthesis promoted to Resource status belongs here, but it isn't a
// *kind* of thing brought in from outside -- it gets its own group
// rather than being filed under its Synthesis kind.
const PRODUCED = 'Produced here';

function titleCase(tag) {
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

function ResourceCard({ resource }) {
  return (
    <li className="resource-card" {...themeAttributes(resolveSpaceTheme(resource))}>
      <Link to={`/spaces/${resource.id}`} className="resource-card-title">
        {resource.title}
      </Link>
      {resource.origin === 'internal' && (
        <span className="origin-badge-small" title="Produced here, then promoted to Resource status">
          Internal
        </span>
      )}

      {resource.goal && <p className="resource-card-goal">{resource.goal}</p>}

      {resource.categories?.length > 0 && (
        <p className="resource-card-facets">
          {resource.categories.map((category) => (
            <span key={category} className="category-chip">
              {category}
            </span>
          ))}
        </p>
      )}

      {resource.referenceCount === 0 ? (
        <p className="resource-card-unused">Not referenced anywhere yet.</p>
      ) : (
        <p className="resource-card-used">
          Used in{' '}
          {resource.referencedBy.map((reference, index) => (
            <span key={reference.spaceId}>
              {index > 0 && ', '}
              <Link to={`/spaces/${reference.spaceId}`}>{reference.spaceTitle}</Link>
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

function ResourcesPage() {
  usePageTitle('Resources');
  const [resources, setResources] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getResourcesIndex()
      .then(setResources)
      .catch((err) => setError(err.message));
  }, []);

  // A Resource can carry more than one type tag, so it appears under each
  // -- the groups are a way of finding it, not an exclusive filing.
  const groups = useMemo(() => {
    if (!resources) return [];
    const byType = new Map();
    resources.forEach((resource) => {
      const types = resource.producedHere
        ? [PRODUCED]
        : resource.typeTags.length > 0
        ? resource.typeTags
        : [UNTYPED];
      types.forEach((type) => {
        if (!byType.has(type)) byType.set(type, []);
        byType.get(type).push(resource);
      });
    });
    return [...byType.entries()]
      // Real external types first, then produced-here, then untyped --
      // the two catch-all groups sit at the end rather than alphabetically
      // among the genuine types.
      .sort(([a], [b]) => {
        const rank = (type) => (type === UNTYPED ? 2 : type === PRODUCED ? 1 : 0);
        return rank(a) - rank(b) || a.localeCompare(b);
      })
      .map(([type, members]) => ({ type, members }));
  }, [resources]);

  const unused = useMemo(() => (resources || []).filter((r) => r.referenceCount === 0), [resources]);

  return (
    <div className="app-shell">
      <Sidebar current="resources" />
      <main className="app-content">
        <h1>Resources</h1>
        <p>
          Everything brought in from outside to think alongside &mdash; books, people, accounts, interpretive
          lenses. Grouped by what kind of thing each is, and showing which Spaces actually draw on it.
        </p>

        {error && <p>Could not load Resources: {error}</p>}
        {!error && !resources && <p>Loading...</p>}

        {resources && resources.length === 0 && (
          <p className="empty-note">
            None yet. <Link to="/resources/new">Add one</Link> and it will show up here.
          </p>
        )}

        {resources && resources.length > 0 && (
          <>
            <p className="resource-summary">
              {resources.length} {resources.length === 1 ? 'Resource' : 'Resources'}
              {unused.length > 0 && ` · ${unused.length} not referenced anywhere yet`}
            </p>
            <p>
              <Link to="/resources/new">+ New Resource</Link>
            </p>

            {groups.map((group) => (
              <section key={group.type}>
                <h2>
                  {titleCase(group.type)} <span className="space-index-count">({group.members.length})</span>
                </h2>
                <ul className="resource-grid">
                  {group.members.map((resource) => (
                    <ResourceCard key={`${group.type}-${resource.id}`} resource={resource} />
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

export default ResourcesPage;
