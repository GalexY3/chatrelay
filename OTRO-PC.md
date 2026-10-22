# Instalar ChatRelay en otro PC

Versión experimental **1.0.0-rc.1**. Esta guía usa la extensión de Chrome/Edge: es el recorrido que ya completó tareas reales. Necesitas Node.js 22 o superior, Git y tu propia sesión de ChatGPT en el navegador habitual.

## 1. Descargar e instalar

Abre PowerShell en la carpeta donde quieras guardar el proyecto:

```powershell
git clone https://github.com/GalexY3/chatrelay.git
cd chatrelay
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile --ignore-scripts
```

Si no tienes Git, usa **Code → Download ZIP** en GitHub, descomprime y abre PowerShell dentro de la carpeta que contiene `package.json`. Instala Node.js desde [nodejs.org](https://nodejs.org/).

## 2. Cargar la extensión una sola vez

En Chrome abre `chrome://extensions/`; en Edge, `edge://extensions/`. Activa **Modo de desarrollador**, pulsa **Cargar descomprimida** y selecciona la carpeta `extension` dentro del proyecto descargado. Es normal que el selector solo enseñe carpetas: selecciona esa carpeta.

Abre [ChatGPT](https://chatgpt.com/) en ese navegador e inicia sesión normalmente. Deja seleccionado **Chat** si aparece el selector Chat/Work.

## 3. Conectar

Desde PowerShell, en la carpeta del proyecto:

```powershell
node src/cli.js setup --extension
```

Copia el código que empieza por `cr1:`. Abre el icono de extensiones del navegador → **ChatRelay**, pégalo en **One-time connection code** y pulsa **Connect**. El código dura dos minutos; si caduca, repite el comando. Cuando aparezca **Connected**, comprueba:

```powershell
node src/cli.js doctor
```

`doctor` no envía ninguna consulta. El servicio se inicia automáticamente cuando se necesita. La extensión debe seguir cargada y el navegador abierto.

## 4. Añadirlo a Codex u otro agente MCP

`setup --extension` también imprime una entrada MCP con las rutas exactas de **este PC**. En Codex añade su equivalente al archivo de configuración que abre la aplicación desde sus ajustes:

```toml
[mcp_servers.chatrelay]
command = "C:/RUTA/AL/node.exe"
args = ["C:/RUTA/AL/chatrelay/src/cli.js", "mcp"]
```

Sustituye ambos ejemplos por las rutas que imprimió `setup`. Usa `/` en las rutas de este bloque TOML y recarga Codex después de guardarlo. En otros hosts MCP puedes usar directamente el bloque JSON que imprime el comando.

Pide al agente: **«Comprueba chatrelay_status. Después usa ChatRelay para proponer tres nombres para una app de notas; devuelve solo los nombres».** Si el host solicita permiso para usar la herramienta, autoriza esa tarea. Primero se envía el trabajo y después se recoge con `chatrelay_result` o `chatrelay_results`.

También puedes comprobar el recorrido sin configurar MCP:

```powershell
node src/cli.js submit "Propón tres nombres para una app de notas. Responde solo con los nombres."
node src/cli.js result ID_QUE_DEVUELVE_EL_COMANDO_ANTERIOR
```

Si aún está en cola o ejecutándose, vuelve a consultar ese mismo ID.

## Si algo falla

- **Disconnected:** repite `setup --extension` y pega el nuevo código en la extensión.
- **La herramienta no aparece en Codex:** comprueba las dos rutas absolutas y recarga el host.
- **Error de modo o de sesión:** abre ChatGPT, inicia sesión o selecciona Chat y vuelve a comprobar el estado.
- **Google rechaza el inicio de sesión en una ventana automatizada:** usa este recorrido con la extensión y el navegador habitual. No necesitas ejecutar `connect` para esta instalación.
- **Cambias de carpeta o actualizas la extensión:** pulsa **Recargar** en su página de extensiones y revisa la ruta MCP si cambió.

Para parar el servicio: `node src/cli.js stop`. Para actualizar el código: `git pull` y `pnpm install --frozen-lockfile --ignore-scripts`; después recarga la extensión y el host.

## Qué debes saber

La extensión crea pestañas inactivas para las tareas y las conserva para inspección. Las tareas se ejecutan una a una. Cada PC necesita su propio emparejamiento; no copies ni compartas `~/.chatrelay/`, perfiles de navegador o códigos de conexión.

ChatRelay es gratuito y no requiere clave API. ChatGPT conserva sus límites y la coordinación consume uso del agente principal. **No garantiza ahorro de créditos:** en el [piloto de tareas cortas](docs/COST-PILOT-2026-10-20.md) aumentó el coste estimado. La integración web es experimental y puede dejar de funcionar si cambia ChatGPT. Consulta [privacidad](PRIVACY.md) y [estado de validación](docs/VALIDATION.md).
