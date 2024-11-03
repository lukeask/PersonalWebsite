import React from 'react';

function ConsoleToggleButton({ toggleConsoleMode }) {
  return (
    <button className="console-toggle-button" onClick={toggleConsoleMode}>
      Switch to the Shell
    </button>
  );
}

export default ConsoleToggleButton;