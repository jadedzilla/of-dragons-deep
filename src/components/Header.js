// src/Header.js
import React from 'react';
import './Header.css'; // Import a CSS file for styling if needed

const Header = () => {
  return (
    <header className="header">
      <div className="header-content">
        <h1 className="header-title">Of Dragons Deep</h1>
        {/* <nav className="header-nav">
          <a href="#home" className="nav-link">Home</a>
          <a href="#about" className="nav-link">About</a>
          <a href="#contact" className="nav-link">Contact</a>
        </nav> */}
      </div>
    </header>
  );
};

export default Header;
