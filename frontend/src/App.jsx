import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import CreateSpace from './pages/CreateSpace.jsx';
import CreateResource from './pages/CreateResource.jsx';
import CreateSynthesis from './pages/CreateSynthesis.jsx';
import SpacePage from './pages/SpacePage.jsx';
import WorkspacePage from './pages/WorkspacePage.jsx';
import TemplatesPage from './pages/TemplatesPage.jsx';
import TemplateEditor from './pages/TemplateEditor.jsx';
import ResourceTemplatesPage from './pages/ResourceTemplatesPage.jsx';
import ResourceTemplateEditor from './pages/ResourceTemplateEditor.jsx';
import ToolsPage from './pages/ToolsPage.jsx';
import WorkspacesPage from './pages/WorkspacesPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import SpacesPage from './pages/SpacesPage.jsx';
import TrashPage from './pages/TrashPage.jsx';
import LogPage from './pages/LogPage.jsx';
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
          <Route path="/resource-templates" element={<ResourceTemplatesPage />} />
          <Route path="/resource-templates/new" element={<ResourceTemplateEditor />} />
          <Route path="/resource-templates/:id/edit" element={<ResourceTemplateEditor />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/spaces" element={<SpacesPage />} />
          <Route path="/workspaces" element={<WorkspacesPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/log" element={<LogPage />} />
        </Routes>
      </ConfirmDialogProvider>
    </ToastProvider>
  );
}

export default App;
