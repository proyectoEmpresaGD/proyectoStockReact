import { HashRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Stock from './pages/paginaStock.jsx';
import Login from './components/Login.jsx';
import Admin from './pages/Admin.jsx';
import Header from './components/header.jsx';
import Sidebar from './components/navbar.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import { AuthProvider } from './AuthContext';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="flex flex-col h-screen">
                  <Header />
                  <div className="flex flex-grow">
                    <Sidebar />
                    <div className="flex-grow p-4 overflow-auto">
                      <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/admin" element={<ProtectedRoute role="admin"><Admin /></ProtectedRoute>} />
                        <Route path="/stock" element={<Stock />} />
                        <Route path="/app1" element={<div>Aplicación 1</div>} />
                        <Route path="/app2" element={<div>Aplicación 2</div>} />
                        <Route path="/app3" element={<div>Aplicación 3</div>} />
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
