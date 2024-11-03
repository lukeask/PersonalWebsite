import React, { useState, useRef, useEffect } from 'react';
import '../../styles/Console.css';
import { processCommand } from '../../utils/CommandProcessor';

function ConsoleInterface() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState([]);
  const [hasCommandBeenUsed, setHasCommandBeenUsed] = useState(false);
  const inputRef = useRef(null);
  const outputRef = useRef(null);

  useEffect(() => {
    inputRef.current.focus();
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  const handleInputSubmit = async (e) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (trimmedInput === '') return;

    const newOutput = [...output, `guest@askew.sh:~$ ${trimmedInput}`];
    const commandOutput = await processCommand(trimmedInput);
    
    if (hasCommandBeenUsed === false) {
      setHasCommandBeenUsed(true);
    }

    if (commandOutput === null) {
      setOutput([]);
    } else {
      newOutput.push(commandOutput.output);
      setOutput(newOutput);
    }
    
    setInput('');
  };

  const handleConsoleClick = (e) => {
    e.preventDefault();
    inputRef.current.focus();
  };

  return (
    <div className="console" onClick={handleConsoleClick}>
      <div className="console-output" ref={outputRef}>
        {output.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
      <form onSubmit={handleInputSubmit}>
        <span className="prompt">guest@askew.sh:~$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          placeholder={
            !hasCommandBeenUsed ? "Type 'help' to see available commands" : ''
          }
          ref={inputRef}
        />
      </form>
    </div>
  );
}

export default ConsoleInterface;