import React, { useState, useRef, useEffect } from 'react';
import '../../styles/Console.css';

function ConsoleInterface() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current.focus();
  }, []);

  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  const handleInputSubmit = (e) => {
    e.preventDefault();
    processCommand(input);
    setInput('');
  };

  const processCommand = (cmd) => {
    const newOutput = [...output, `guest@askew.sh:~$ ${cmd}`];
    
    switch(cmd.toLowerCase()) {
      case 'help':
      case 'ls':
    
        newOutput.push('Available commands: publications, blog, luke, research');
        break;

      case 'man help':
        newOutput.push('NAME\n    help - display available commands\nUSAGE\n    help [OPTION]\nOPTIONS\n    -a    display all available commands\n');
        break;

      case 'help -a':
      case 'ls -a':
        newOutput.push('Available commands: publications, blog, luke, exit, clear, pwd');
        break;

      case 'clear':
        newOutput.length = 0;
        break;

      case 'exit':
        window.location.href = '/';
        return;

      case 'pwd':
        newOutput.push('/home/guest');
        break;

      case 'publications':
        newOutput.push('Displaying publications... (todo)');
        // TODO
        break;
      case 'blog':
        newOutput.push('Displaying blog posts... (todo)');
        // TODO
        break;
      case 'luke':
        newOutput.push("I'm a mathematics graduate student at Dartmouth studying arithmetic geometry advised by Asher Auel."    );
        // TODO
        break;
      case 'research':
        window.location.href = '/research';
        return;

      case 'contact':
        newOutput.push('Displaying contact information... (todo)');
        // TODO
        break;

      default:
        newOutput.push(`Command not found: ${cmd}. Try 'help'`);
        break;
    }

    setOutput(newOutput);
  };

  return (
    <div className="console">
      <div className="console-output">
        {output.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
      <form onSubmit={handleInputSubmit}>
        <span className="prompt">guest@askew.sh:~$</span>
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          ref={inputRef}
        />
      </form>
    </div>
  );
}

export default ConsoleInterface;