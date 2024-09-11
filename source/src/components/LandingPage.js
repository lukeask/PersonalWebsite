// src/components/LandingPage.js
import React from 'react';
import ContentPage from './ContentPage';
import ConsoleToggleButton from './ConsoleToggleButton';
import '../styles/LandingPage.css';


function LandingPage({ toggleConsole }) {
  return (
    <div className="landing-page">
      <ContentPage contentFile="aboutme" />
      <ConsoleToggleButton toggleConsole={toggleConsole} />
    </div>
  );
}

export default LandingPage;