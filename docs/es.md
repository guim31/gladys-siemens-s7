# Siemens S7

Lea y escriba las variables de un PLC Siemens desde Gladys, en su red local:
CPU S7-300, S7-400, S7-1200, S7-1500, ET 200SP y LOGO! 0BA7 / 0BA8. La
integración habla el protocolo S7 (S7comm sobre ISO-on-TCP, puerto 102), el de
los paneles y las herramientas de ingeniería de Siemens.

> **Desarrollada sin el hardware: sus comentarios son bienvenidos.** Se probó
> contra el servidor S7 de Snap7, no contra un PLC real. Cuéntenos en el foro de
> Gladys cómo se comporta con el suyo.

## Lo que obtiene

- Un dispositivo Gladys para el PLC, una función por variable declarada: una
  temperatura, un contador, un bit de un DB, una entrada, una salida, una
  palabra de la memoria V de un LOGO!.
- Valores leídos al ritmo elegido (de 1 segundo a 1 minuto), todas las
  variables a la vez en tan pocas peticiones como permita el PLC; solo los
  cambios se envían a Gladys.
- Si lo desea, la escritura de las variables declaradas modificables: un
  interruptor o una consigna en el panel, una acción, una escena.
- Disparadores de escena cuando el PLC se pierde o vuelve, o cuando una
  dirección deja de poder leerse, y un widget del panel con el estado del
  enlace.

## Requisitos

- Gladys 5.1 o posterior.
- El PLC en la misma red que Gladys, puerto 102 accesible, con una **dirección
  IP fija**.
- Para un S7-1200 o un S7-1500: el acceso PUT/GET permitido (ver más abajo).
- Para un LOGO!: una conexión de servidor creada en LOGO!Soft Comfort (ver más
  abajo).

## Configuración

Instale la integración (**Integraciones → Instalar desde GitHub**, dirección
`https://github.com/guim31/gladys-siemens-s7`), abra su pestaña
**Configuración**, rellene los campos, guarde y añada el PLC desde la pestaña
**Descubrimiento**.

### PLC

- **Dirección IP del PLC**: la dirección de la CPU (o de su módulo Ethernet).
- **Puerto TCP**: 102, siempre, salvo que una pasarela redirija otro puerto.
- **Tipo de PLC**: define cómo se accede a la CPU. S7-1200, S7-1500 y
  ET 200SP: rack 0, slot 1. S7-300: rack 0, slot 2. LOGO!: los TSAP de abajo.
  **Otro**: los campos **Rack** y **Slot** (una CPU S7-400 suele estar en el
  slot 3; compruebe la configuración de hardware de su proyecto).

Gladys identifica el PLC por su dirección y su puerto: cambiar la dirección
crea un nuevo dispositivo.

### S7-1200 y S7-1500: PUT/GET

Estas CPU rechazan las lecturas externas hasta que usted las permita, en TIA
Portal:

1. Propiedades de la CPU → **Protección y seguridad** → **Mecanismos de
   conexión**: marque **Permitir acceso vía comunicación PUT/GET del
   interlocutor remoto**.
2. Para cada DB que vaya a leer: propiedades del bloque → **Atributos**,
   desmarque **Acceso optimizado al bloque** y compile. Un DB optimizado no
   tiene direcciones fijas: sus variables no pueden leerse por dirección.
3. Cargue el proyecto en la CPU.

Sin el paso 1, la pantalla Configuración indica que la CPU rechaza las
lecturas.

### LOGO!

En LOGO!Soft Comfort, **Herramientas → Conexiones Ethernet**, añada una
**conexión de servidor** (conexión S7), marque **Aceptar todas las peticiones
de conexión** y anote los dos TSAP:

- **TSAP local** del LOGO! (normalmente `02.00`): el campo **TSAP local del
  LOGO! (lado servidor)**.
- **TSAP remoto** (normalmente `01.00`): el campo **TSAP remoto del LOGO!
  (lado cliente)**.

Cargue el programa en el LOGO!. Su memoria de variables (VM) es el DB1 para el
protocolo S7: `VW10` es la palabra en la dirección VM 10. Asigne los valores
que quiera ver (entradas analógicas, marcas, contadores) a la VM en
**Herramientas → Asignación de parámetros VM** (LOGO! 8).

### Variables

El campo **Variables** contiene las variables que se van a leer, separadas por
punto y coma:

```
Nombre: dirección tipo write opción=valor
```

Solo la dirección es obligatoria. Ejemplos:

```
Caldera: DB1,REAL0 temperature; Bomba: Q0.1 switch; Consigna: DB1,REAL4 setpoint min=5 max=30; Nivel: VW10 scale=0.1 unit=%
```

- **Nombre**: el nombre de la función en Gladys (40 caracteres como máximo).
  Sin `Nombre:`, la variable toma el nombre de su dirección.
- **Tipo**: lo que es el valor, que define su icono y su unidad en Gladys:
  `temperature`, `humidity`, `pressure`, `power`, `energy` (un índice, en kWh
  en Gladys), `production`, `solar_power`, `grid_power`, `voltage`, `current`,
  `battery`, `volume`, `duration`, `value` (un número simple, por defecto),
  `binary` (un estado encendido/apagado, por defecto para un bit), `switch` (un
  encendido/apagado modificable), `setpoint` (una temperatura modificable).
- **write**: la variable puede escribirse desde Gladys (ver Escritura).
- **Opciones**: `scale=` y `offset=` (valor mostrado = bruto × scale + offset,
  así `scale=0.1` convierte 215 en 21,5), `unit=` (°C, %, W, kWh, Wh, V, A,
  bar, L, m3, s, min, h…), `min=` y `max=` (el rango mostrado y los límites de
  una escritura), `precision=` (decimales conservados).

Hasta 100 variables. **Comprobar la configuración** enumera los errores entrada
por entrada.

### Direcciones

| Dirección                                       | Tipo                               | Rango                    |
| ----------------------------------------------- | ---------------------------------- | ------------------------ |
| `DB1,X0.1` o `DB1.DBX0.1`                       | bit                                | 0 / 1                    |
| `DB1,BYTE2` o `DB1.DBB2`                        | BYTE                               | 0 a 255                  |
| `DB1,WORD4` o `DB1.DBW4`                        | WORD (sin signo)                   | 0 a 65535                |
| `DB1,INT6`                                      | INT (con signo)                    | -32768 a 32767           |
| `DB1,DWORD8` o `DB1.DBD8`                       | DWORD                              | 0 a 4294967295           |
| `DB1,DINT8`                                     | DINT                               | -2147483648 a 2147483647 |
| `DB1,REAL12`                                    | REAL                               | coma flotante de 32 bits |
| `DB1,LREAL16`                                   | LREAL                              | 64 bits (S7-1200/1500)   |
| `M0.1`, `I0.0` (`E0.0`), `Q0.1` (`A0.1`)        | bit                                | 0 / 1                    |
| `MB10`, `MW10`, `MI10`, `MD10`, `MDI10`, `MR10` | BYTE, WORD, INT, DWORD, DINT, REAL |                          |
| `V10.0`, `VB10`, `VW10`, `VI10`, `VD10`, `VR10` | VM del LOGO! (DB1)                 |                          |

La dirección define el tipo: `DB1.DBD8` es un DWORD, leído como un entero. Para
un REAL, escriba `DB1,REAL8` (o `MR8`, `VR8`). Un WORD no tiene signo: para un
valor negativo guardado como INT, escriba `DB1,INT6` o `MI10`.

### Escritura

La escritura está **desactivada** hasta que active **Permitir la escritura**.
Incluso entonces, solo las variables declaradas `write` (o de tipo `switch` o
`setpoint`) pueden modificarse:

- un `switch` muestra un interruptor en el panel, un `setpoint` un control de
  consigna; las demás variables modificables se escriben con la acción
  **Escribir un valor** o la acción de escena;
- un bit se escribe solo: los demás bits de su byte no cambian;
- el valor se comprueba contra `min`/`max` y el rango del tipo antes de
  enviarlo, y luego se vuelve a leer, para que el panel muestre lo que el PLC
  contiene realmente.

**Escribir una variable equivocada puede detener o dañar una instalación.**
Declare modificable solo lo que Gladys deba cambiar, y mantenga las funciones
de seguridad en el programa del PLC. A propósito, nada se expone como
interruptor o termostato a los asistentes de voz.

## Acciones

En la pantalla Configuración:

- **Comprobar la configuración**: si el PLC responde, cuántas variables lee y
  los errores entrada por entrada.
- **Leer una dirección**: lee una dirección cualquiera una vez, declarada o
  no, para encontrar la correcta antes de declararla.
- **Escribir un valor**: escribe en una variable declarada modificable, por su
  nombre o su dirección.

## Escenas

- Disparadores (Gladys 5.1 o posterior): **Se pierde el PLC** (con el motivo),
  **El PLC ha vuelto**, **Una variable del PLC deja de poder leerse** (un DB
  borrado o acortado por un nuevo programa, con el nombre de la variable). Los
  valores mismos disparan escenas como cualquier dispositivo Gladys.
- Acción: **Escribir una variable del PLC**, con una variable (nombre o
  dirección) y un valor.

## Panel

El widget **PLC Siemens** muestra los seis primeros valores del PLC y el estado
del enlace: conectado o no, cuántas variables pueden leerse, la hora de la
última lectura y su duración. Cada bloque puede ocultarse en los ajustes del
widget.

## ¿Siemens S7, Modbus u OPC UA?

- **Esta integración** lee la memoria del PLC por dirección, sin nada que
  programar en el PLC (salvo PUT/GET en S7-1200/1500). La vía más sencilla para
  un LOGO!, un S7-300/400 o un S7-1200.
- **[Modbus](https://github.com/guim31/gladys-modbus)**: un LOGO! 8 (desde FS4)
  y algunos programas S7-1200 también hablan Modbus TCP. Elíjala cuando el PLC
  ya esté configurado como servidor Modbus.
- **[OPC UA](https://github.com/guim31/gladys-opcua)**: un S7-1500 (y un
  S7-1200 desde el firmware 4.4) tiene un servidor OPC UA, con variables con
  nombre, DB optimizados y seguridad. Elíjala cuando pueda activar ese
  servidor.

## Límites

- Un PLC por instalación de la integración.
- Solo números y bits: ni STRING, ni DATE_AND_TIME, ni matrices, ni
  temporizadores o contadores (`T`, `C`).
- Los DB optimizados de los S7-1200/1500 no se leen por dirección (ver
  PUT/GET).
- Los S7-1200/1500 con un nivel de protección que prohíbe PUT/GET y los S7-200
  (PPI) no son compatibles.
- Sin conexión segura: el protocolo S7 no la tiene; mantenga el PLC en una red
  de confianza.
- Gladys acepta 300 valores por minuto: con muchas variables, los valores se
  envían con menos frecuencia de la que se leen.

## Solución de problemas

- **El PLC no responde en el puerto 102**: compruebe la dirección, que Gladys y
  el PLC estén en la misma red y que ningún cortafuegos bloquee el puerto 102.
- **El PLC rechaza la conexión**: tipo de PLC, rack/slot o TSAP incorrectos.
  Para un LOGO!, compruebe la conexión de servidor en LOGO!Soft Comfort y que
  el programa se haya cargado.
- **La CPU rechaza las lecturas**: permita PUT/GET (ver más arriba).
- **Dirección fuera de rango**: el DB es más corto que la dirección, está
  optimizado o el programa no lo tiene.
- Los registros de la integración (Gladys → Integraciones → Siemens S7) dicen
  más con la variable de entorno `LOG_LEVEL=debug`.

## Créditos

El cliente S7 de esta integración está escrito a partir de las descripciones
públicas del protocolo: [Snap7](https://snap7.sourceforge.net/) de Davide
Nardella, [nodes7](https://github.com/plcpeople/nodeS7) (MIT) de plcpeople y el
disector s7comm de Wireshark. Se probó contra el servidor de Snap7 a través de
[python-snap7](https://github.com/gijzelaerr/python-snap7) (MIT).

Siemens, SIMATIC, S7 y LOGO! son marcas de Siemens AG. Esta integración no está
afiliada a Siemens.
