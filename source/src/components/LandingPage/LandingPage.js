// src/components/LandingPage/LandingPage.js
import React from 'react';
import AboutMe from './AboutMe';
import Navbar from './Navbar';
import ConsoleToggleButton from './ConsoleToggleButton';
import '../../styles/LandingPage.css';

function LandingPage({ toggleConsoleMode }) {
  return (
    <div className="landing-page">
      <Navbar />
      <main className="main-content">
    <AboutMe />
    <ConsoleToggleButton toggleConsoleMode={toggleConsoleMode} />
      </main>
    </div>
  );
}

export default LandingPage;