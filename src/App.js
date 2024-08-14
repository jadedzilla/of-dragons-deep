import React from 'react';
import FishGrid from './components/FishGrid';
import './App.css';

function App() {
  return (
    <div className="App">
      <img
        src="/ofdragonsdeep-banner.png"
        alt="Of Dragons Deep"
        className="banner-image"
      />
      <FishGrid />
    </div>
  );
}

export default App;
