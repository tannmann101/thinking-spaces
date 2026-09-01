import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import CreateSpace from './pages/CreateSpace.jsx';
import CreateResource from './pages/CreateResource.jsx';
import CreateSynthesis from './pages/CreateSynthesis.jsx';
import SpacePage from './pages/SpacePage.jsx';
import WorkspacePage from './pages/WorkspacePage.jsx';
import TemplatesPage from './pages/TemplatesPage.jsx';
import TemplateEditor from './pages/TemplateEditor.jsx';
import GraphPage from './pages/GraphPage.jsx';
import ToolsPage from './pages/ToolsPage.jsx';
import LogPage from './pages/LogPage.jsx';
import InsightsPage from './pages/InsightsPage.jsx';
import { ConfirmDialogProvider } from './components/ConfirmDialog.jsx';
import { ToastProvider } from './components/Toast.jsx';

function App() {
  return (
    <ToastProvider>
      <ConfirmDialogProvider>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/spaces/new" element={<CreateSpace />} />
          <Route path="/resources/new" element={<CreateResource />} />
          <Route path="/synthesis/new" element={<CreateSynthesis />} />
          <Route path="/spaces/:id" element={<SpacePage />} />
          <Route path="/spaces/:spaceId/workspaces/:workspaceId" element={<WorkspacePage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/templates/new" element={<TemplateEditor />} />
          <Route path="/templates/:id/edit" element={<TemplateEditor />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/log" element={<LogPage />} />
          <Route path="/insights" element={<InsightsPage />} />
        </Routes>
      </ConfirmDialogProvider>
    </ToastProvider>
  );
}

export default App;
