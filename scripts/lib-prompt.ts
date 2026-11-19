import readline from "node:readline";

/** Membaca satu baris dari terminal; jika `hidden`, ketikan tidak ditampilkan. Mendukung stdin non-TTY (pipe). */
export function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
    if (hidden && process.stdin.isTTY) {
      const w = (rl as unknown as { _writeToOutput: (s: string) => void });
      w._writeToOutput = (s: string) => { if (s.includes(question)) process.stdout.write(s); };
    }
    rl.question(question, (a) => {
      rl.close();
      if (hidden && process.stdin.isTTY) process.stdout.write("\n");
      resolve(a.trim());
    });
  });
}
