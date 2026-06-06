import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ChangePasswordPage from './pages/ChangePasswordPage';
import LoginPage from './pages/LoginPage';
import OrganizationsPage from './pages/OrganizationsPage';
import UsersPage from './pages/UsersPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Layout />}>
          <Route path="/organizations" element={<OrganizationsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/settings" element={<ChangePasswordPage />} />
          <Route path="/" element={<Navigate to="/organizations" replace />} />
          <Route path="*" element={<Navigate to="/organizations" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
