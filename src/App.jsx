import React, { useState, useEffect } from 'react'; // Asegúrate de que useState esté importado
import { HashRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './Auth/AuthContext.jsx';
import ProtectedRoute from './Auth/ProtectedRoute.jsx';
import Home from './pages/Home';
import Stock from './pages/paginaStock';
import Clients from './pages/paginaclients';
import Admin from './pages/Admin';
import Sidebar from './components/navbar';
import Header from './components/header';
import Login from './components/Login.jsx';
import Etiquetas from './pages/Etiquetas.jsx';
import EtiquetaLibro from './pages/EtiquetaLibro.jsx';
import Equivalencias from './pages/Equivalencias.jsx';
import EtiquetaMarke from './pages/EtiquetasMarke.jsx';
import EtiquetaNormativa from './pages/EtiquetasNormativa.jsx';
function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="flex">
                  <Sidebar sidebarOpen={sidebarOpen} closeSidebar={closeSidebar} />
                  <div className="flex-1 h-screen overflow-y-auto">
                    <Header toggleSidebar={toggleSidebar} />
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><Admin /></ProtectedRoute>} />
                      <Route path="/stock" element={<ProtectedRoute><Stock /></ProtectedRoute>} />
                      <Route path="/clients" element={<ProtectedRoute requiredRole="comercial"><Clients /></ProtectedRoute>} />
                      <Route path="/equivalencias" element={<ProtectedRoute requiredRole="almacen"><Equivalencias /></ProtectedRoute>} />
                      <Route path="/etiquetas" element={<Etiquetas />} />
                      <Route path="/etiquetasMarke" element={<EtiquetaMarke />} />
                      <Route path="/libro" element={<EtiquetaLibro />} />
                      <Route path="/libroNormativa" element={< EtiquetaNormativa />} />
                    </Routes>
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
