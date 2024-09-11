import React from 'react';
import { Link } from 'react-router-dom';

function Navbar({ toggleConsoleMode }) {
  return (
    <nav className="navbar">
      <ul>
        <li><Link to="/">Home</Link></li>
        <li><Link to="/research">Research</Link></li>
        <li><Link to="/publications">Publications</Link></li>
        <li><Link to="/blog">Blog</Link></li>
      </ul>
    </nav>
  );
}

export default Navbar;