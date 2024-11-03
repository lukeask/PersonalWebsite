// src/components/LandingPage/LandingPage.js
import React, { useState, useEffect } from 'react';
import Navbar from '../Navbar';
import ConsoleToggleButton from './ConsoleToggleButton';
import ReactMarkdown from 'react-markdown';
import '../../styles/LandingPage.css';

function LandingPage({ toggleConsoleMode }) {
  const [aboutMeContent, setAboutMeContent] = useState('');
  useEffect(() => {
    fetch(`/content/aboutme.md`)
      .then(response => response.text())
      .then(text => setAboutMeContent(text));
  }, []);

  return (
    <div className="landing-page">
      <Navbar />
      <main className="main-content">
        <div className="content">
          <ReactMarkdown>{aboutMeContent}</ReactMarkdown>
          <ConsoleToggleButton toggleConsoleMode={toggleConsoleMode} />
        </div>
      </main>
    </div>
  );
}

export default LandingPage;