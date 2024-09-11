import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage/LandingPage';
import ConsoleInterface from './components/Console/ConsoleInterface';
import ResearchPage from './components/ResearchPage/ResearchPage';
import './styles/Global.css';


function App() {
  const [isConsoleMode, setIsConsoleMode] = useState(false);

  const toggleConsoleMode = () => {
    setIsConsoleMode(!isConsoleMode);
  };

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={
            isConsoleMode ? (
              <ConsoleInterface />
            ) : (
              <LandingPage toggleConsoleMode={toggleConsoleMode} />
            )
          } />
          <Route path="/research" element={<ResearchPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;