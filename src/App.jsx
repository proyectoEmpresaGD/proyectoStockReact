import { HashRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Login from "./components/Login.jsx";
import Admin from "./pages/Admin.jsx";  // Crear este componente para la página de admin

function ProtectedRoute({ children, role }) {
  const userRole = localStorage.getItem('role'); // Obtener el rol del usuario del localStorage

  if (!userRole) {
    return <Navigate to="/login" />;
  }

  if (role && userRole !== role) {
    return <Navigate to="/" />;
  }

  return children;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute role="admin">
              <Admin />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
