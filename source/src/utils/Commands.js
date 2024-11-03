const fetchMarkdown = async (fileName) => {
  try {
    const response = await fetch(`/content/${fileName}.md`);
    console.log(`Fetching from: /content/${fileName}.md`);
    if (!response.ok) {
      console.error(`Failed to fetch ${fileName}.md:`, response.status);
      return { output: `Error: Could not fetch ${fileName}. Status: ${response.status}` };
    }
    const markdown = await response.text();
    if (!markdown.trim()) {
      return { output: `Warning: ${fileName}.md appears to be empty.` };
    }
    return { output: markdown };
  } catch (error) {
    console.error(`Error fetching ${fileName}.md:`, error);
    return { output: `Error: Failed to fetch ${fileName}. ${error.message}` };
  }
};

export const commands = {
  ls: {
    name: 'ls',
    description: 'List directory contents',
    handler: (args) => {
      return {
        output: 'file1.txt  file2.txt  secretFile.hidden'
      };
    }
  },
  cat: {
    name: 'cat',
    description: 'Show file contents',
    handler: (args) => {
      const filename = args[0];

      if (!filename) {
        return {
          output: 'cat: missing operand'
        };
      }

      if (filename == 'file1.txt') {
        return {
          output: 'This is the contents of file1.txt'
        };
      }

      if (filename == 'file2.txt') {
        return {
          output: 'This is the contents of file2.txt'
        };
      }

      if (filename == 'secretFile.hidden') {
        return {
          output: 'This is a hidden file'
        };
      }

      else {
        return {
          output: `cat: ${filename}: No such file or directory`
        };
      }
    }
  },
  help: {
    name: 'help',
    description: 'Show available commands',
    handler: (args) => {
      if (args.includes('-a')) {
        const commandList = Object.entries(commands)
          .map(([name, cmd]) => `${name}: ${cmd.description}`)
          .join('\n');
        return {
          output: commandList
        };
      } else {
        const personalCommands = ['teaching', 'contact', 'research'];
        const commandList = personalCommands
          .map(name => `${name}: ${commands[name].description}`)
          .join('\n');
        return {
          output: commandList + '\n\nUse `help -a` to show all commands.'
        };
      }
    }
  },
  neofetch: {
    name: 'neofetch',
    description: 'Display system info',
    handler: () => ({
      output: `
        guest@askew
        ------------⠀⠀⠀⠀⠀⠀
        OS: AskewOS 0.0.1
        Uptime: yes
        Shell: React.js
        CPU: Intel 4004
        Memory: what?
      `
    })
  },
  
  clear: {
    name: 'clear',
    description: 'Clear the terminal screen',
    handler: () => null
  },
  
  exit: {
    name: 'exit',
    description: 'Exit the terminal',
    handler: () => {
      window.location.href = '/';
      return null;
    }
  },
  
  pwd: {
    name: 'pwd',
    description: 'Print working directory',
    handler: () => ({
      output: '/home/guest'
    })
  },

  cd: {
    name: 'cd',
    description: 'Change directory',
    handler: () => (
      {
        output: "you're going to stay here"
      }
    ) 
  },

  sudo: {
    name: 'sudo',
    description: 'Run command with root privileges',
    handler: () => ({
      output: 'you have no power here'
    })
  },
  // markdown fetching commands  
  research: {
    name: 'research',
    description: 'View research information',
    handler: () => fetchMarkdown('research')
  },
  
  contact: {
    name: 'contact',
    description: 'Display contact information',
    handler: () => fetchMarkdown('contact')
  },

  aboutme: {
    name: 'aboutme',
    description: 'Display about me page',
    handler: () => fetchMarkdown('aboutme')
  }
};