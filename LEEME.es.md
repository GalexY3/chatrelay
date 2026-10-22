# ChatRelay 1.0.0-rc.1

**¿Lo vas a usar en otro PC? Sigue [esta guía rápida de instalación](OTRO-PC.md).** Utiliza la extensión de Chrome/Edge, que es la vía comprobada con una cuenta real.

Delega tareas concretas desde Codex u otro host MCP a ChatGPT **Chat** y recoge respuestas breves en el flujo principal. Software gratuito, local y de código abierto con licencia MIT. Cada persona utiliza su cuenta y sus límites.

**Resultado de costes:** en el [piloto de tres tareas cortas](docs/COST-PILOT-2026-10-20.md), delegar dio respuestas correctas pero aumentó un 90,6 % el equivalente estimado de créditos de Codex y tardó unas 7 veces más que el control directo. Conviene resolver las tareas cortas directamente. El ahorro en razonamientos largos y en cuota real sigue sin demostrar.

## Uso invisible

El modo predeterminado utiliza Chromium en segundo plano con un perfil propio. **Durante las tareas normales no aparecen ventanas ni pestañas en tu navegador habitual.** No hace falta instalar la extensión. El navegador se cierra tras 60 segundos sin trabajo y se vuelve a iniciar oculto cuando se necesita.

La primera conexión requiere una acción explícita para iniciar sesión. Las sesiones no se copian desde Chrome, Edge ni el navegador integrado de Codex. Si caduca la sesión o aparece una verificación, ChatRelay devuelve un error y espera que reconectes: no abre una ventana automáticamente.

```sh
pnpm install --frozen-lockfile
node src/cli.js setup
node src/cli.js connect
```

`setup` imprime la configuración MCP y no abre el navegador. `connect` prepara Chromium si hace falta, abre una ventana de conexión y espera que inicies sesión manualmente y selecciones **Chat**. Cuando está listo, la cierra. Después, las tareas se ejecutan sin interfaz visible. La descarga inicial del navegador puede ocupar varios cientos de MB.

**Limitación observada:** Google rechazó el inicio de sesión en el navegador automatizado de conexión durante la prueba del 20/10/2026. La alternativa que sí completó una tarea fue la extensión en el Chrome habitual del usuario, con `setup --extension`. Este modo usa pestañas inactivas y no es completamente invisible. No requiere copiar cookies ni volver a iniciar sesión en un perfil automatizado.

Si instalas el paquete `.tgz`, usa `chatrelay setup` y `chatrelay connect`. Se necesita Node.js 22+. La validación local actual corresponde a Windows y Node 24; la matriz de otras plataformas está preparada en CI.

## Conectar el agente

Añade a tu host la entrada MCP con las rutas absolutas que imprime `setup`. Para Codex, su estructura es:

```toml
[mcp_servers.chatrelay]
command = "RUTA/ABSOLUTA/A/node.exe"
args = ["RUTA/ABSOLUTA/A/ChatRelay/src/cli.js", "mcp"]
```

Recarga el host. `chatrelay doctor` comprueba el estado sin enviar una consulta. `chatrelay stop` cierra el servicio y su navegador interno. El proceso MCP lo inicia de nuevo cuando hace falta; no se registra nada en el inicio del sistema.

La configuración y el perfil de sesión están en `~/.chatrelay/`, o en `CHATRELAY_HOME` si lo has definido. Son privados: no los publiques ni los incluyas en Git.

## Tareas y cuotas

| Herramienta | Uso |
| --- | --- |
| `chatrelay_status` | Estado local y tareas, sin enviar prompts. |
| `chatrelay_delegate` | Enviar una tarea y recibir su ID. |
| `chatrelay_delegate_batch` | Enviar de 1 a 8 tareas con contexto común en una llamada. |
| `chatrelay_result` | Recoger un resultado con espera de hasta 30 segundos. |
| `chatrelay_results` | Recoger varios resultados con una llamada. |
| `chatrelay_cancel` | Cancelar trabajo en cola o dejar de recoger una respuesta. |

Las tareas se ejecutan una a una. Los lotes reducen llamadas de coordinación, aunque cada chat recibe su copia del contexto común. Las respuestas se recortan antes de salir del navegador para limitar el contexto que vuelve al agente principal.

La protección de modo exige observar **Chat seleccionado antes de introducir el contexto**. Work y los modos desconocidos se rechazan. No se implementa OAuth que redirija el razonamiento a cuota Work/Codex. Aun así, el estado visible no certifica la contabilidad del proveedor: Chat tiene sus propios límites y la coordinación/verificación siguen consumiendo uso en Codex. No se ha medido el ahorro.

Si una tarea acaba como `uncertain`, puede haberse enviado ya. Revisa su URL antes de reintentar. El mismo `requestId` evita duplicados mientras el servicio conserve el trabajo; esa protección desaparece al reiniciar o caducar la retención. Cancelar no garantiza detener la generación remota ni borrar el historial.

## Estado real de la candidata

La versión final 1.0 aún no se ha declarado ni publicado. El 20/10/2026 se completó una tarea real MCP → broker → extensión Chrome → ChatGPT Chat → MCP, en unos 134 segundos. Dos intentos anteriores se detuvieron antes de enviar; solo se generó una consulta. La respuesta excedió el presupuesto y volvió recortada, con su indicador correspondiente. La prueba permitió corregir el pegado en el editor, la lectura de enlaces y las fórmulas duplicadas. Pasan 86 comprobaciones de Node y 14 escenarios sintéticos con Chromium. **La compatibilidad con una cuenta real en modo oculto y el ahorro de cuota siguen pendientes.**

La integración es experimental e independiente. Las condiciones de ChatGPT plantean una limitación expresa a la extracción automática; el proyecto no afirma contar con aprobación del proveedor ni garantizar la seguridad de una cuenta. [Investigación y fuentes](docs/INTEGRATION-RESEARCH.md).

El backend de extensión sigue disponible con `chatrelay setup --extension`. Ese modo sí abre pestañas inactivas en Chrome/Edge y las conserva para inspección; no es necesario para el modo invisible predeterminado.

[README completo](README.md) · [Validación](docs/VALIDATION.md) · [Publicación](docs/RELEASE.md) · [Privacidad](PRIVACY.md)
