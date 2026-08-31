import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import CreateSpace from './pages/CreateSpace.jsx';
import SpacePage from './pages/SpacePage.jsx';
import TemplatesPage from './pages/TemplatesPage.jsx';
import TemplateEditor from './pages/TemplateEditor.jsx';
import GraphPage from './pages/GraphPage.jsx';
import ToolsPage from './pages/ToolsPage.jsx';
import LogPage from './pages/LogPage.jsx';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/spaces/new" element={<CreateSpace />} />
      <Route path="/spaces/:id" element={<SpacePage />} />
      <Route path="/templates" element={<TemplatesPage />} />
      <Route path="/templates/new" element={<TemplateEditor />} />
      <Route path="/templates/:id/edit" element={<TemplateEditor />} />
      <Route path="/graph" element={<GraphPage />} />
      <Route path="/tools" element={<ToolsPage />} />
      <Route path="/log" element={<LogPage />} />
    </Routes>
  );
}

export default App;
