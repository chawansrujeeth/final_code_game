const { spawn } = require('child_process');

async function getSampleFromPython(problemUrl) {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', ['random_cf_sample.py', problemUrl], { cwd: __dirname });
    let output = '';
    let error = '';
    py.stdout.on('data', (data) => {
      output += data.toString();
    });
    py.stderr.on('data', (data) => {
      error += data.toString();
    });
    py.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(error || 'Python script failed'));
      }
      // Parse output for sample input/output
      const inputMatch = output.match(/=== First Sample Input ===\n([\s\S]*?)\n===/);
      const outputMatch = output.match(/=== First Sample Output ===\n([\s\S]*)/);
      resolve({
        input: inputMatch ? inputMatch[1].trim() : null,
        output: outputMatch ? outputMatch[1].trim() : null,
        raw: output
      });
    });
  });
}

module.exports = { getSampleFromPython };
