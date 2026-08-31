import { Link } from 'react-router-dom';

// The one persistent piece of chrome shared by every page in the app --
// pulled out of what used to be Dashboard.jsx's own local header so
// every other page (Tools, Log, Insights, The Map, Templates, a Space,
// a Workspace, every Creation flow) gets the same top bar instead of
// each being an island only reachable via a single "back to Dashboard"
// link. `current` names which nav entry is "here" (one of the keys in
// LINKS below, or 'dashboard'/null on the Dashboard itself) so that
// entry gets a visual "you are here" marker -- the direct fix for "can
// I tell what page I'm on," on top of each page's own <h1>. The
// wordmark itself is now a real link back to the Dashboard (it was
// already styled like one -- see .wordmark's `text-decoration: none` in
// index.css -- just never wrapped in a Link), which is what lets every
// page drop its own separate "back to Dashboard" text link without
// losing that path: one obvious way home, not two competing ones.
const LINKS = [
  { key: 'insights', to: '/insights', label: 'Insights' },
  { key: 'tools', to: '/tools', label: 'Tools' },
  { key: 'templates', to: '/templates', label: 'Manage Templates' },
  { key: 'graph', to: '/graph', label: 'View the Map' },
  { key: 'log', to: '/log', label: 'Log' },
];

function TopNav({ current }) {
  return (
    <header className="topbar">
      <Link to="/" className="wordmark">
        Thinking Spaces<span className="dot">.</span>
      </Link>
      <nav className="nav-links">
        {LINKS.map((link) => (
          <Link key={link.key} to={link.to} className={current === link.key ? 'nav-link-current' : undefined}>
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export default TopNav;
