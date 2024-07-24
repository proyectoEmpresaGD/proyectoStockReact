// App.jsx
import { HashRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Stock from './pages/paginaStock.jsx';
import Login from './components/Login.jsx';
import Clients from './pages/paginaclients.jsx';
import Admin from './pages/Admin.jsx';
import Header from './components/header.jsx';
import Sidebar from './components/navbar.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import { AuthProvider } from './AuthContext';
import { useState } from 'react';
import FicharPage from './pages/Fichar.jsx'; // Importa FicharPage en lugar de Fichar
import EquivalenciasTable from './components/EquivalenciasTable';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="flex flex-col h-screen overflow-hidden">
                  <Header toggleSidebar={toggleSidebar} />
                  <div className="flex flex-1 overflow-hidden">
                    <Sidebar sidebarOpen={sidebarOpen} closeSidebar={closeSidebar} />
                    <div className="flex-1 p-4 overflow-auto">
                      <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/admin" element={<ProtectedRoute role="admin"><Admin /></ProtectedRoute>} />
                        <Route path="/stock" element={<ProtectedRoute role="almacen"><Stock /></ProtectedRoute>} />
                        <Route path="/clients" element={<ProtectedRoute role="comercial"><Clients /></ProtectedRoute>} />
                        <Route path="/fichar" element={<ProtectedRoute role="almacen"><FicharPage /></ProtectedRoute>} /> {/* Ruta para FicharPage */}
                        <Route path="/equivalencias" element={<ProtectedRoute role="almacen"><EquivalenciasTable /></ProtectedRoute>} /> {/* Ruta para EquivalenciasTable */}
                        <Route path="/app1" element={<ProtectedRoute role="almacen"><div>Aplicación 1</div></ProtectedRoute>} />
                        <Route path="/app2" element={<ProtectedRoute role="almacen"><div>Aplicación 2</div></ProtectedRoute>} />
                        <Route path="/app3" element={<ProtectedRoute role="almacen"><div>Aplicación 3</div></ProtectedRoute>} />
                        <Route path="*" element={<Navigate to="/" />} />
                      </Routes>
                    </div>
                  </div>
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
