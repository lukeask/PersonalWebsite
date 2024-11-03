import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage/LandingPage';
import ConsoleInterface from './components/Console/ConsoleInterface';
import ContentPage from './components/ContentPage';
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
          <Route path="/research" element={<ContentPage contentFile="research" />} />
          <Route path="/contact" element={<ContentPage contentFile="contact" />} />
          <Route path="/teaching" element={<ContentPage contentFile="teaching" />} />
          <Route path="/teaching/math3" element={<ContentPage contentFile="teaching/math3" />} />
          <Route path="/drp" element={<ContentPage contentFile="drp" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;