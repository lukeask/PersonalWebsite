import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/ResearchPage.css';

function ResearchPage() {
  return (
    <div className="research-page">
      <h1>Research</h1>
      <section className="research-intro">
        <p>
          I'm an arithmetic geometer with an interest in low degree points. 
        </p>
      </section>
      
      <section className="publications">
        <h2>Preprints</h2>

        <ul>
          <li>coming soon!</li>
          

        </ul>
      </section>
      
      <Link to="/" className="back-button">Back to Main Page</Link>
    </div>
  );
}

export default ResearchPage;