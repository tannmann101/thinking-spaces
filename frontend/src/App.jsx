import { useEffect, useState } from 'react';

// Pass 1 scaffold check: call the backend's health endpoint and show
// whatever it says. This proves the frontend and backend can talk to
// each other before any real feature is built.
function App() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main>
      <h1>Thinking Spaces</h1>
      <h2>Backend connection check</h2>
      {error && <p>Could not reach backend: {error}</p>}
      {!error && !health && <p>Checking backend...</p>}
      {health && (
        <ul>
          <li>Status: {health.status}</li>
          <li>Message: {health.message}</li>
          <li>Spaces in database: {health.spaceCount}</li>
          <li>Server time: {health.time}</li>
        </ul>
      )}
    </main>
  );
}

export default App;
