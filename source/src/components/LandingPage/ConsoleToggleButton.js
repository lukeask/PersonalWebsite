import React from 'react';

function ConsoleToggleButton({ toggleConsoleMode }) {
  return (
    <button className="console-toggle-button" onClick={toggleConsoleMode}>
      Switch to Console Mode
    </button>
  );
}

export default ConsoleToggleButton;