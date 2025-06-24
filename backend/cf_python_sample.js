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
      try {
        // Parse the JSON output from the Python script
        const parsed = JSON.parse(output);
        resolve(parsed);
      } catch (e) {
        return reject(new Error('Failed to parse Python output as JSON: ' + e.message));
      }
    });
  });
}

module.exports = { getSampleFromPython };
