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
import Etiquetas from './pages/etiquetas/Etiquetas.jsx';
import EtiquetaLibro from './pages/etiquetas/EtiquetaLibro.jsx';
import Equivalencias from './pages/Equivalencias.jsx';
import EtiquetaMarke from './pages/etiquetas/EtiquetasMarke.jsx';
import EtiquetaNormativa from './pages/etiquetas/EtiquetasNormativa.jsx';
import EtiquetaPerchas from './pages/etiquetas/EtiquetasPechas.jsx';
import EtiquetasLibro35Tipo1 from './pages/etiquetas/EtiquetasLibro35Tipo1.jsx';
import EtiquetasLibro35Tipo2 from './pages/etiquetas/EtiquetasLibro35Tipo2.jsx';
import EtiquetaPerchasEstampados from './pages/etiquetas/EtiquetasPerchasEstampados.jsx';
import EtiquetasPersonalizable from './pages/etiquetas/Etiquetapersonalizable.jsx';
import EntradasPage from './pages/EntradasPages.jsx';
import LowStockAlertsPage from './pages/LowStockAlertsPage.jsx';
import PaginaMapaClientes from './pages/paginamapaclientes.jsx';
import PaginaMapaEspaña from './pages/paginamapaespaña.jsx';
import PerfilUsuario from './pages/PerfilUsuario.jsx';
import AgendaPage from './pages/paginaagenda.jsx';
import NotasPage from './pages/paginanotas.jsx';
import Perfil from './pages/gestionusuarios.jsx';
import FicharPage from './pages/Fichar.jsx'
import EtiquetaSinQR from './pages/etiquetas/etiquetaSinQR.jsx'
import CatalogoPage from './pages/Catalogo.jsx'

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
                      <Route path="/estiquetaSinQR" element={<EtiquetaSinQR />} />
                      <Route path="/catalogo" element={<CatalogoPage />} />
                      <Route path="/libro" element={<EtiquetaLibro />} />
                      <Route path="/libroNormativa" element={< EtiquetaNormativa />} />
                      <Route path="/perchas" element={< EtiquetaPerchas />} />
                      <Route path="/perchasEstampados" element={< EtiquetaPerchasEstampados />} />
                      <Route path="/EtiquetasLibro35Tipo1" element={< EtiquetasLibro35Tipo1 />} />
                      <Route path="/EtiquetasLibro35Tipo2" element={< EtiquetasLibro35Tipo2 />} />
                      <Route path="/EtiquetaPersonalizable" element={< EtiquetasPersonalizable />} />
                      <Route path="entradas" element={<ProtectedRoute requiredRole="ventas"><EntradasPage /></ProtectedRoute>} />
                      <Route path="/stock-alerts" element={<ProtectedRoute requiredRole="almacen"><LowStockAlertsPage /></ProtectedRoute>} />
                      <Route path="/mapa-clientes" element={<PaginaMapaClientes />} />
                      <Route path="/mapa-españa" element={<PaginaMapaEspaña />} />
                      <Route path="/perfilusuario" element={<PerfilUsuario />} />
                      <Route path="/agenda" element={<AgendaPage />} />
                      <Route path="/notas" element={<NotasPage />} />
                      <Route path="/gestionusuarios" element={<Perfil />} />
                      <Route path="/fichar" element={<FicharPage />} />
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
