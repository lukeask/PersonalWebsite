// src/components/ConsoleToggleButton.js
import React from 'react';

function ConsoleToggleButton({ toggleConsole }) {
  return (
    <button className="console-toggle" onClick={toggleConsole}>
      Toggle Console
    </button>
  );
}

export default ConsoleToggleButton;