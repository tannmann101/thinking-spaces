// One consistent strip for a page's own actions, sitting directly under
// its <h1>.
//
// Before this, a page's actions were wherever they happened to be written
// -- a Report button in one div, "Start a Session" loose in a bare <p>
// after the Add-Entry form, a delete at the very bottom. Nothing was
// wrong individually; the problem was that you had to hunt for each one,
// and that a page action looked exactly like a per-row "Move up".
//
// The rule this enforces, stated in full next to the button styles in
// index.css:
//
//   btn btn-primary   the one submit action of a creation form
//   btn               a page's own actions -- they live in here
//   btn-ghost-small   actions on one row or card, inline with it
//   btn-danger        destructive, wherever it sits
//
// Deliberately a plain wrapper rather than something that takes an array
// of action descriptors: the actions themselves stay written where you
// can read them, in the page, as ordinary elements. This only settles
// where they sit and how they space.

function PageActions({ children }) {
  return <div className="page-actions">{children}</div>;
}

export default PageActions;
