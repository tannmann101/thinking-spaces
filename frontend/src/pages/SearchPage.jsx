// Search results: everywhere a phrase actually appears, not just in a
// Space title. Reached from the Sidebar's search box, which is on every
// page, so finding something never means going home first.
//
// An entry result links straight to the entry itself, using the same
// ?highlight= convention the deep-linking pass already built -- the
// Space page scrolls to it and flashes it. So a search result lands you
// on the thing, not merely near it.

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { searchEverything } from '../api.js';
import { blockRegistry } from '../registry/blocks.js';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

function SearchPage() {
  const [params] = useSearchParams();
  const query = params.get('q') || '';
  usePageTitle(query ? `Search: ${query}` : 'Search');

  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // Nothing is cleared synchronously here on purpose. Whether a result
  // set is stale is derivable from the results themselves -- they carry
  // the query they answered -- so clearing state up front would be an
  // extra render for something render can already work out.
  useEffect(() => {
    if (!query.trim()) return;
    let current = true;
    searchEverything(query)
      .then((data) => {
        if (!current) return;
        setResults(data);
        setError(null);
      })
      .catch((err) => {
        if (current) setError(err.message);
      });
    // Guards against a slow earlier query landing after a later one.
    return () => {
      current = false;
    };
  }, [query]);

  const showing = results && results.query === query ? results : null;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
        <h1>Search</h1>
        <p>
          Every place a phrase actually appears &mdash; Space titles and what they&rsquo;re working toward,
          plus everything written inside an entry. A result takes you straight to the entry, not just the
          Space it sits in.
        </p>

        {!query.trim() && <p className="empty-note">Type something into the search box to begin.</p>}
        {error && <p>Search failed: {error}</p>}
        {query.trim() && !showing && !error && <p>Searching...</p>}

        {showing && (
          <>
            <p className="search-summary">
              {showing.total === 0
                ? `Nothing matches “${showing.query}”.`
                : `${showing.total} ${showing.total === 1 ? 'match' : 'matches'} for “${showing.query}”.`}
            </p>

            {showing.spaces.length > 0 && (
              <>
                <h2>Spaces ({showing.spaces.length})</h2>
                <ul className="search-results">
                  {showing.spaces.map((space) => (
                    <li key={space.id} className="search-result">
                      <Link to={`/spaces/${space.id}`}>{space.title}</Link>
                      <span className="search-result-meta">
                        {space.status}
                        {space.goal ? ` · ${space.goal}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {showing.blocks.length > 0 && (
              <>
                <h2>Entries ({showing.blocks.length})</h2>
                <ul className="search-results">
                  {showing.blocks.map((result) => {
                    const entry = blockRegistry[result.type];
                    return (
                      <li key={result.blockId} className="search-result">
                        <Link to={`/spaces/${result.spaceId}?highlight=${result.blockId}`}>
                          {entry?.icon && <span className="block-type-icon">{entry.icon}</span>}{' '}
                          {entry?.label || result.type}
                        </Link>
                        <span className="search-result-meta">in {result.spaceTitle}</span>
                        <p className="search-excerpt">{result.excerpt}</p>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default SearchPage;
