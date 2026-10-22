const frame = document.querySelector('#fixture');
const button = document.querySelector('#run');
async function load(params = '') {
  await new Promise(resolve => { frame.onload = resolve; frame.src = '/fixture' + params; });
  return { doc: frame.contentDocument, adapter: frame.contentWindow.ChatRelayDOM };
}
const check = (value, message) => { if (!value) throw new Error(message); };
const cases = [
  ['Texto multilínea, acentos y emoji', async () => {
    const { doc, adapter } = await load(); const prompt = 'Primera línea: España 🙂\n\nSegunda línea: análisis.';
    const output = await adapter.run({ document: doc, prompt, timeoutSeconds: 4, stableMs: 100, onSubmitted: async () => {} });
    check(output === 'Respuesta final: España 🙂', 'Respuesta incorrecta');
    check(frame.contentWindow.submissions.length === 1 && frame.contentWindow.submissions[0] === prompt, 'Envío duplicado o modificado');
  }],
  ['Compositor textarea', async () => {
    const { doc, adapter } = await load('?editor=textarea');
    const output = await adapter.run({ document: doc, prompt: 'Pregunta textarea', timeoutSeconds: 4, stableMs: 100, onSubmitted: async () => {} });
    check(output === 'Respuesta final: España 🙂', 'Respuesta incorrecta');
  }],
  ['No recoger una respuesta que sigue generándose', async () => {
    const { doc, adapter } = await load('?mode=never-finishes');
    try { await adapter.run({ document: doc, prompt: 'Pregunta lenta', timeoutSeconds: 1, stableMs: 100, onSubmitted: async () => {} }); throw new Error('Aceptó una respuesta parcial'); }
    catch (error) { check(error.mayHaveSubmitted === true && error.message.includes('Timed out'), 'No detectó generación incompleta'); }
  }],
  ['Aviso de límite de uso', async () => {
    const { doc, adapter } = await load('?mode=alert');
    try { await adapter.run({ document: doc, prompt: 'Pregunta', timeoutSeconds: 2, stableMs: 100, onSubmitted: async () => {} }); throw new Error('Ignoró límite'); }
    catch (error) { check(error.mayHaveSubmitted === true && error.message.includes('requires user action'), 'Error no reconocido'); }
    check(frame.contentWindow.submissions.length === 1, 'Reintentó la pregunta');
  }],
  ['Sesión cerrada: ningún envío anónimo', async () => {
    const { doc, adapter } = await load('?mode=logged-out');
    try { await adapter.run({ document: doc, prompt: 'Pregunta', timeoutSeconds: 2, onSubmitted: async () => {} }); throw new Error('Envió sin cuenta'); }
    catch (error) { check(error.mayHaveSubmitted === false && error.message.includes('signed out'), 'No detectó sesión cerrada'); }
    check(frame.contentWindow.submissions.length === 0, 'Envió al sitio sin cuenta');
  }],
  ['Respuesta grande con 110.000 emojis', async () => {
    const { doc, adapter } = await load('?large=1');
    const output = await adapter.run({ document: doc, prompt: 'Pregunta larga', timeoutSeconds: 4, stableMs: 100, onSubmitted: async () => {} });
    check(output.length === 220000 && output.startsWith('🙂'), 'Resultado grande incompleto');
  }],
];
button.onclick = async () => {
  button.disabled = true; window.smokeResults = [];
  document.querySelector('#results').replaceChildren();
  for (const [name, run] of cases) {
    document.querySelector('#status').textContent = 'Ejecutando: ' + name;
    const result = { name, passed: false };
    try { await run(); result.passed = true; } catch (error) {
      result.error = error.message;
      const input = frame.contentDocument.querySelector('#prompt-textarea');
      if (input) result.error += ' · DOM: ' + JSON.stringify({ text: input.innerText?.slice(0, 200), html: input.innerHTML?.slice(0, 400) });
    }
    window.smokeResults.push(result);
    const row = document.createElement('tr');
    for (const value of [name, result.passed ? 'OK' : 'FALLO: ' + result.error]) { const td = document.createElement('td'); td.textContent = value; row.append(td); }
    document.querySelector('#results').append(row);
  }
  document.querySelector('#status').textContent = `${window.smokeResults.filter(r => r.passed).length} / ${cases.length} pruebas correctas`;
  frame.hidden = true;
  button.disabled = false;
};
