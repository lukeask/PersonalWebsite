// src/components/ContentPage.js
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
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
      <main className="main-content">
        <main className="content">
          <ReactMarkdown 
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {content}
          </ReactMarkdown>
        </main>
      </main>
    </div>
  );
}

export default ContentPage;