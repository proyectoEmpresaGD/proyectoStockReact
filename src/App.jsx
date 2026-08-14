import { Suspense, lazy, useEffect, useState } from 'react';
import { HashRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider } from './Auth/AuthContext.jsx';
import ProtectedRoute from './Auth/ProtectedRoute.jsx';
import Sidebar from './components/navbar';
import Header from './components/header';
import Login from './components/Login.jsx';

import AppErrorBoundary from './common/AppErrorBoundary.jsx';

const Home = lazy(() => import('./pages/Home.jsx'));
const Stock = lazy(() => import('./pages/paginaStock.jsx'));
const Clients = lazy(() => import('./pages/paginaclients.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const Intrastat = lazy(() => import('./pages/Intrastat.jsx'));
const Etiquetas = lazy(() => import('./pages/etiquetas/Etiquetas.jsx'));
const EtiquetaLibro = lazy(() => import('./pages/etiquetas/EtiquetaLibro.jsx'));
const Equivalencias = lazy(() => import('./pages/Equivalencias.jsx'));
const EtiquetaMarke = lazy(() => import('./pages/etiquetas/EtiquetasMarke.jsx'));
const GeneradorEtiquetaProducto = lazy(() => import('./pages/etiquetas/GeneradorEtiquetaProducto.jsx'));
const EtiquetaLibro26Tipo3ConImagen = lazy(() => import('./pages/etiquetas/EtiquetaLibro35Ancho.jsx'));
const EtiquetaNormativa = lazy(() => import('./pages/etiquetas/EtiquetasNormativa.jsx'));
const EtiquetaPerchas = lazy(() => import('./pages/etiquetas/EtiquetasPechas.jsx'));
const EtiquetasLibro35Tipo1 = lazy(() => import('./pages/etiquetas/EtiquetasLibro35Tipo1.jsx'));
const EtiquetasLibro35Tipo2 = lazy(() => import('./pages/etiquetas/EtiquetasLibro35Tipo2.jsx'));
const EtiquetaPerchasEstampados = lazy(() => import('./pages/etiquetas/EtiquetasPerchasEstampados.jsx'));
const EtiquetasPersonalizable = lazy(() => import('./pages/etiquetas/Etiquetapersonalizable.jsx'));
const GeneradorEtiquetasLotes = lazy(() => import('./pages/etiquetas/GeneradorEtiquetasLotes.jsx'));
const EntradasPage = lazy(() => import('./pages/EntradasPages.jsx'));
const LowStockAlertsPage = lazy(() => import('./pages/LowStockAlertsPage.jsx'));
const MapasFacturacionPage = lazy(() => import('./pages/MapasFacturacionPage.jsx'));
const VerifyBatch = lazy(() => import('./pages/VerifyBatch.jsx'));
const PerfilUsuario = lazy(() => import('./pages/PerfilUsuario.jsx'));
const AgendaPage = lazy(() => import('./pages/paginaagenda.jsx'));
const NotasPage = lazy(() => import('./pages/paginanotas.jsx'));
const GestionUsuarios = lazy(() => import('./pages/gestionusuarios.jsx'));
const FicharPage = lazy(() => import('./pages/Fichar.jsx'));
const RecursosHumanos = lazy(() => import('./pages/RecursosHumanos.jsx'));
const EtiquetaSinQR = lazy(() => import('./pages/etiquetas/etiquetaSinQR.jsx'));
const EtiquetaCameo = lazy(() => import('./pages/etiquetas/Etiqueta cameo.jsx'));
const EtiquetaLibro45Ancho = lazy(() => import('./pages/etiquetas/EtiquetaLibro45AnchoConImagen.jsx'));
const FacturacionAnalyticsPage = lazy(() => import('./pages/FacturacionAnalyticsPage.jsx'));
const ReservasTejido = lazy(() => import('./pages/reservas.jsx'));
const FichaTecnicaPage = lazy(() => import('./pages/fichaTecnica/fichaTenica.jsx'));
const NotFoundPage = lazy(() => import('./common/NotFoundPage.jsx'));

const PageLoader = () => (
  <div className="flex min-h-[60vh] items-center justify-center px-4" role="status" aria-live="polite">
    <div className="cjm-panel cjm-hero w-full max-w-sm rounded-3xl px-8 py-8 text-center">
      <img
        src="/logos/CJM marca negro.png"
        alt="CJM Group"
        className="cjm-logo-adaptive mx-auto h-10 w-auto object-contain"
      />
      <div className="mx-auto mt-6 h-9 w-9 animate-spin rounded-full border-[3px] border-[var(--cjm-border)] border-t-[var(--cjm-primary)]" aria-hidden="true" />
      <h2 className="mt-5 text-lg font-semibold tracking-tight app-text">Preparando el módulo</h2>
      <p className="cjm-muted mt-2 text-sm">CJM Stock &amp; Operations</p>
    </div>
  </div>
);

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme ? savedTheme === 'dark' : false;
  });

  useEffect(() => {
    const theme = isDarkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem('theme', theme);
  }, [isDarkMode]);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const closeSidebar = () => setSidebarOpen(false);
  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ToastContainer
          position="bottom-right"
          autoClose={4500}
          newestOnTop
          closeOnClick
          pauseOnFocusLoss
          pauseOnHover
          draggable
          theme={isDarkMode ? 'dark' : 'light'}
          toastClassName="cjm-toast"
          limit={4}
        />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="flex min-h-screen app-bg app-text">
                  <Sidebar sidebarOpen={sidebarOpen} closeSidebar={closeSidebar} />

                  <div className="h-screen min-w-0 flex-1 overflow-y-auto app-bg pt-20 md:pl-64">
                    <Header
                      toggleSidebar={toggleSidebar}
                      isDarkMode={isDarkMode}
                      toggleDarkMode={toggleDarkMode}
                    />

                    <main id="main-content" tabIndex="-1">
                      <AppErrorBoundary>
                        <Suspense fallback={<PageLoader />}>
                          <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><Admin /></ProtectedRoute>} />
                            <Route path="/intrastat" element={<ProtectedRoute requiredRole="admin"><Intrastat /></ProtectedRoute>} />
                            <Route path="/analitica-facturacion" element={<ProtectedRoute><FacturacionAnalyticsPage /></ProtectedRoute>} />
                            <Route path="/stock" element={<ProtectedRoute><Stock /></ProtectedRoute>} />
                            <Route path="/reservasTejido" element={<ProtectedRoute><ReservasTejido /></ProtectedRoute>} />
                            <Route path="/etiquetas-lotes" element={<ProtectedRoute><GeneradorEtiquetasLotes /></ProtectedRoute>} />
                            <Route path="/clients" element={<ProtectedRoute requiredRole="comercial"><Clients /></ProtectedRoute>} />
                            <Route path="/equivalencias" element={<ProtectedRoute requiredRole="almacen"><Equivalencias /></ProtectedRoute>} />

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
                            <Route path="/EtiquetaCameo" element={<EtiquetaCameo />} />
                            <Route
                              path="/etiquetas-producto"
                              element={
                                <ProtectedRoute>
                                  <GeneradorEtiquetaProducto />
                                </ProtectedRoute>
                              }
                            />
                            <Route path="/mapas-facturacion" element={<ProtectedRoute allowedRoles={['admin', 'administracion']}><MapasFacturacionPage /></ProtectedRoute>} />
                            <Route path="/mapa-clientes" element={<Navigate to="/mapas-facturacion?vista=global" replace />} />
                            <Route path="/mapa-españa" element={<Navigate to="/mapas-facturacion?vista=spain" replace />} />
                            <Route path="/comprobacionExcel" element={<VerifyBatch />} />
                            <Route path="/perfilusuario" element={<PerfilUsuario />} />
                            <Route path="/agenda" element={<AgendaPage />} />
                            <Route path="/notas" element={<NotasPage />} />
                            <Route path="/gestionusuarios" element={<GestionUsuarios />} />
                            <Route path="/fichar" element={<FicharPage />} />
                            <Route path="/fichaTecnica" element={<FichaTecnicaPage />} />
                            <Route path="/entradas" element={<ProtectedRoute requiredRole="ventas"><EntradasPage /></ProtectedRoute>} />
                            <Route path="/rrhh/vacaciones" element={<ProtectedRoute><RecursosHumanos /></ProtectedRoute>} />
                            <Route path="/stock-alerts" element={<ProtectedRoute allowedRoles={['compras']}><LowStockAlertsPage /></ProtectedRoute>} />
                            <Route path="*" element={<NotFoundPage />} />
                          </Routes>
                        </Suspense>
                      </AppErrorBoundary>
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
