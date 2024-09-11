// src/components/Navbar.js
import React from 'react';
import { Link } from 'react-router-dom';

function Navbar() {
  return (
    <nav className="navbar">
      <ul>
        <li className="navbar-title"><Link to="/">askew.sh</Link></li>
        <li><Link to="/research">research</Link></li>
        <li><Link to="/teaching">teaching</Link></li>
        <li><Link to="/contact">contact</Link></li>
      </ul>
    </nav>
  );
}

export default Navbar;