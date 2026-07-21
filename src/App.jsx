import { useEffect, useState } from 'react';
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
import Intrastat from './pages/Intrastat.jsx';
import Etiquetas from './pages/etiquetas/Etiquetas.jsx';
import EtiquetaLibro from './pages/etiquetas/EtiquetaLibro.jsx';
import Equivalencias from './pages/Equivalencias.jsx';
import EtiquetaMarke from './pages/etiquetas/EtiquetasMarke.jsx';
import EtiquetaLibro26Tipo3ConImagen from './pages/etiquetas/EtiquetaLibro35Ancho.jsx';
import EtiquetaNormativa from './pages/etiquetas/EtiquetasNormativa.jsx';
import EtiquetaPerchas from './pages/etiquetas/EtiquetasPechas.jsx';
import EtiquetasLibro35Tipo1 from './pages/etiquetas/EtiquetasLibro35Tipo1.jsx';
import EtiquetasLibro35Tipo2 from './pages/etiquetas/EtiquetasLibro35Tipo2.jsx';
import EtiquetaPerchasEstampados from './pages/etiquetas/EtiquetasPerchasEstampados.jsx';
import EtiquetasPersonalizable from './pages/etiquetas/Etiquetapersonalizable.jsx';
import EntradasPage from './pages/EntradasPages.jsx';
import LowStockAlertsPage from './pages/LowStockAlertsPage.jsx';
import PaginaMapaClientes from './pages/paginamapaclientes.jsx';
import PaginaMapaEspaña from './pages/paginamapaespana.jsx';
import VerifyBatch from './pages/VerifyBatch.jsx';
import PerfilUsuario from './pages/PerfilUsuario.jsx';
import AgendaPage from './pages/paginaagenda.jsx';
import NotasPage from './pages/paginanotas.jsx';
import Perfil from './pages/gestionusuarios.jsx';
import FicharPage from './pages/Fichar.jsx';
import RecursosHumanos from './pages/RecursosHumanos.jsx';
import EtiquetaSinQR from './pages/etiquetas/etiquetaSinQR.jsx';
import EtiquetaCameo from './pages/etiquetas/Etiqueta cameo.jsx';
import EtiquetaLibro45Ancho from './pages/etiquetas/EtiquetaLibro45AnchoConImagen.jsx';
import FacturacionAnalyticsPage from './pages/FacturacionAnalyticsPage.jsx';
// import ComprasAnalyticsPage from './pages/ComprasAnalyticsPage.jsx';
import FichaTecnicaPage from './pages/fichaTecnica/fichaTenica.jsx'
import ReservasTejido from './pages/reservas.jsx';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme ? savedTheme === 'dark' : false;
  });

  useEffect(() => {
    const theme = isDarkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [isDarkMode]);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const closeSidebar = () => setSidebarOpen(false);
  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="flex min-h-screen app-bg app-text">
                  <Sidebar sidebarOpen={sidebarOpen} closeSidebar={closeSidebar} />

                  {/* Sidebar fijo en desktop y header fijo, por eso reservamos espacio superior y lateral. */}
                  <div className="flex-1 h-screen overflow-y-auto app-bg pt-20 md:pl-64">
                    <Header
                      toggleSidebar={toggleSidebar}
                      isDarkMode={isDarkMode}
                      toggleDarkMode={toggleDarkMode}
                    />

                    <main className="">
                      <div className="">
                        <Routes>
                          <Route path="/" element={<Home />} />

                          <Route
                            path="/admin"
                            element={
                              <ProtectedRoute requiredRole="admin">
                                <Admin />
                              </ProtectedRoute>
                            }
                          />

                          <Route
                            path="/intrastat"
                            element={
                              <ProtectedRoute requiredRole="admin">
                                <Intrastat />
                              </ProtectedRoute>
                            }
                          />

                          <Route
                            path="/analitica-facturacion"
                            element={
                              <ProtectedRoute>
                                <FacturacionAnalyticsPage />
                              </ProtectedRoute>
                            }
                          />

                          {/* <Route
                            path="/analitica-compras"
                            element={
                              <ProtectedRoute>
                                <ComprasAnalyticsPage />
                              </ProtectedRoute>
                            }
                          /> */}

                          <Route
                            path="/stock"
                            element={
                              <ProtectedRoute>
                                <Stock />
                              </ProtectedRoute>
                            }
                          />

                          <Route
                            path='/reservasTejido'
                            element={
                              <ProtectedRoute>
                                <ReservasTejido />
                              </ProtectedRoute>
                            }
                          />

                          <Route
                            path="/clients"
                            element={
                              <ProtectedRoute requiredRole="comercial">
                                <Clients />
                              </ProtectedRoute>
                            }
                          />

                          <Route
                            path="/equivalencias"
                            element={
                              <ProtectedRoute requiredRole="almacen">
                                <Equivalencias />
                              </ProtectedRoute>
                            }
                          />

                          <Route path="/etiquetas" element={<Etiquetas />} />
                          <Route path="/etiquetasMarke" element={<EtiquetaMarke />} />
                          <Route path="/estiquetaSinQR" element={<EtiquetaSinQR />} />
                          <Route path="/libro" element={<EtiquetaLibro />} />
                          <Route path="/libroNormativa" element={<EtiquetaNormativa />} />
                          <Route path="/Libro35AnchoConImagen" element={<EtiquetaLibro26Tipo3ConImagen />} />
                          <Route path="/Libro45AnchoConImagen" element={<EtiquetaLibro45Ancho />} />
                          <Route path="/perchas" element={<EtiquetaPerchas />} />
                          <Route path="/perchasEstampados" element={<EtiquetaPerchasEstampados />} />
                          <Route path="/EtiquetasLibro35Tipo1" element={<EtiquetasLibro35Tipo1 />} />
                          <Route path="/EtiquetasLibro35Tipo2" element={<EtiquetasLibro35Tipo2 />} />
                          <Route path="/EtiquetaPersonalizable" element={<EtiquetasPersonalizable />} />
                          <Route path="/mapa-clientes" element={<PaginaMapaClientes />} />
                          <Route path="/mapa-españa" element={<PaginaMapaEspaña />} />
                          <Route path="/comprobacionExcel" element={<VerifyBatch />} />
                          <Route path="/perfilusuario" element={<PerfilUsuario />} />
                          <Route path="/agenda" element={<AgendaPage />} />
                          <Route path="/notas" element={<NotasPage />} />
                          <Route path="/EtiquetaCameo" element={<EtiquetaCameo />} />
                          <Route path="/gestionusuarios" element={<Perfil />} />
                          <Route path="/fichar" element={<FicharPage />} />
                          <Route path="/fichaTecnica" element={<FichaTecnicaPage />} />

                          <Route
                            path="entradas"
                            element={
                              <ProtectedRoute requiredRole="ventas">
                                <EntradasPage />
                              </ProtectedRoute>
                            }
                          />
                          <Route
                            path="rrhh/vacaciones"
                            element={
                              <ProtectedRoute>
                                <RecursosHumanos />
                              </ProtectedRoute>
                            }
                          />
                          <Route
                            path="/stock-alerts"
                            element={
                              <ProtectedRoute requiredRole="almacen">
                                <LowStockAlertsPage />
                              </ProtectedRoute>
                            }
                          />
                        </Routes>
                      </div>
                    </main>
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
