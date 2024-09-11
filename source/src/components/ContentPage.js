// src/components/ContentPage.js
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import Navbar from './Navbar';
import '../styles/ContentPage.css';


function ContentPage({ contentFile }) {
  const [content, setContent] = useState('');

  useEffect(() => {
    fetch(`/content/${contentFile}.md`)
      .then(response => response.text())
      .then(text => setContent(text));
  }, [contentFile]);

  return (
    <div className="page">
      <Navbar />
      <main className="content">
        <ReactMarkdown>{content}</ReactMarkdown>
      </main>
    </div>
  );
}

export default ContentPage;