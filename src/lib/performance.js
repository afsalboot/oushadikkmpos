// Opt-in, structured timings without user data, query values, or credentials.
export function requestTiming(name) {
  const start = performance.now();
  const stages = {};
  return {
    async measure(stage, work) {
      const mark = performance.now();
      try { return await work(); }
      finally { stages[stage] = Math.round((performance.now() - mark) * 10) / 10; }
    },
    finish(response) {
      const totalMs = Math.round((performance.now() - start) * 10) / 10;
      if (process.env.POS_PERFORMANCE_LOG === '1') console.info(JSON.stringify({ performance: name, totalMs, stages, status: response.status }));
      response.headers.set('Server-Timing', [...Object.entries(stages), ['total', totalMs]].map(([key, ms]) => `${key};dur=${ms}`).join(', '));
      return response;
    },
  };
}
