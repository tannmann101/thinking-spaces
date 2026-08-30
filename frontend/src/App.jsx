import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import CreateSpace from './pages/CreateSpace.jsx';
import SpacePage from './pages/SpacePage.jsx';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/spaces/new" element={<CreateSpace />} />
      <Route path="/spaces/:id" element={<SpacePage />} />
    </Routes>
  );
}

export default App;
