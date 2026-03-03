import Home from "@/pages/Home";
import { HashRouter, Route, Routes } from "react-router";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
