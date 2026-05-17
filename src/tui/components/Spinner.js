import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

// Claude Code-inspired spinner frames
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export default function Spinner({ label = '', color = 'cyan', interval = 80 }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % FRAMES.length), interval);
    return () => clearInterval(id);
  }, [interval]);

  return (
    <Text color={color}>
      {FRAMES[frame]}
      {label ? <Text color="gray"> {label}</Text> : null}
    </Text>
  );
}
