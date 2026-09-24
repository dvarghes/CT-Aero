import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Theme } from '@carbon/react';
import { ControlTower } from './dashboard/ControlTower.jsx';
import { ModulePage } from './pages/ModulePage.jsx';
import { PlannerPage } from './pages/PlannerPage.jsx';
import { AppShell } from './shell/AppShell.jsx';
import { SlicerProvider } from './slicers/SlicerContext.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Theme theme="g90">
        <SlicerProvider>
          <AppShell>
            <Routes>
              <Route path="/" element={<ControlTower />} />
              <Route path="/planner" element={<ModulePage id="planner" />} />
              <Route path="/planner/:id" element={<PlannerPage />} />
              <Route path="/workforce" element={<ModulePage id="workforce" />} />
              <Route path="/alerts" element={<ModulePage id="alerts" />} />
              <Route path="/horizon" element={<ModulePage id="horizon" />} />
              <Route path="/reports" element={<ModulePage id="reports" />} />
              <Route path="/admin" element={<ModulePage id="admin" />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        </SlicerProvider>
      </Theme>
    </BrowserRouter>
  );
}
