import { HashRouter as Router, Route, Routes } from "react-router-dom";
import Home from "./paginaPrincipal.jsx";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </Router>
  );
}

export default App;