# Siemens S7

Lies und schreibe die Variablen einer Siemens-SPS aus Gladys, in deinem lokalen
Netz: CPUs S7-300, S7-400, S7-1200, S7-1500, ET 200SP und LOGO! 0BA7 / 0BA8.
Die Integration spricht das S7-Protokoll (S7comm über ISO-on-TCP, Port 102),
das der Siemens-Bediengeräte und Engineering-Werkzeuge.

> **Ohne die Hardware entwickelt: Rückmeldungen willkommen.** Die Integration wurde gegen
> den S7-Server von Snap7 getestet, nicht gegen eine echte SPS. Erzähl uns im
> Gladys-Forum, wie sie sich mit deiner verhält.

## Was du bekommst

- Ein Gladys-Gerät für die SPS, eine Funktion pro deklarierter Variable: eine
  Temperatur, ein Zähler, ein Bit eines DB, ein Eingang, ein Ausgang, ein Wort
  des V-Speichers einer LOGO!.
- Werte im gewählten Takt gelesen (1 Sekunde bis 1 Minute), alle Variablen auf
  einmal in so wenigen Anfragen, wie die SPS erlaubt; nur die Änderungen gehen
  an Gladys.
- Auf Wunsch das Schreiben der als änderbar deklarierten Variablen: ein
  Schalter oder ein Sollwert im Dashboard, eine Aktion, eine Szene.
- Szenen-Auslöser, wenn die SPS weg ist oder zurückkommt oder eine Adresse
  unlesbar wird, und ein Dashboard-Widget mit dem Zustand der Verbindung.

## Voraussetzungen

- Gladys 5.1 oder neuer.
- Die SPS im selben Netz wie Gladys, Port 102 erreichbar, mit einer **festen
  IP-Adresse**.
- Für eine S7-1200 oder S7-1500: PUT/GET-Zugriff erlaubt (siehe unten).
- Für eine LOGO!: eine in LOGO!Soft Comfort angelegte Serververbindung (siehe
  unten).

## Konfiguration

Installiere die Integration (**Integrationen → Von GitHub installieren**,
Adresse `https://github.com/guim31/gladys-siemens-s7`), öffne ihren Tab
**Konfiguration**, fülle die Felder aus, speichere und füge die SPS im Tab
**Entdecken** hinzu.

### SPS

- **IP-Adresse der SPS**: die Adresse der CPU (oder ihres Ethernet-Moduls).
- **TCP-Port**: 102, immer, außer ein Gateway leitet einen anderen Port weiter.
- **SPS-Typ**: legt fest, wie die CPU erreicht wird. S7-1200, S7-1500 und
  ET 200SP: Rack 0, Slot 1. S7-300: Rack 0, Slot 2. LOGO!: die TSAPs unten.
  **Andere**: die Felder **Rack** und **Slot** (eine S7-400-CPU steckt oft in
  Slot 3; prüfe die Hardwarekonfiguration deines Projekts).

Gladys erkennt die SPS an Adresse und Port: Eine andere Adresse erzeugt ein
neues Gerät.

### S7-1200 und S7-1500: PUT/GET

Diese CPUs lehnen Lesezugriffe von außen ab, bis du sie in TIA Portal erlaubst:

1. CPU-Eigenschaften → **Schutz & Security** → **Verbindungsmechanismen**:
   Hake **Zugriff über PUT/GET-Kommunikation durch entfernten Partner
   erlauben** an.
2. Für jeden zu lesenden DB: Bausteineigenschaften → **Attribute**, Haken bei
   **Optimierter Bausteinzugriff** entfernen, dann übersetzen. Ein optimierter
   DB hat keine festen Adressen: Seine Variablen lassen sich nicht per Adresse
   lesen.
3. Lade das Projekt in die CPU.

Ohne Schritt 1 meldet die Konfiguration, dass die CPU das Lesen ablehnt.

### LOGO!

In LOGO!Soft Comfort unter **Extras → Ethernet-Verbindungen** eine
**Serververbindung** (S7-Verbindung) hinzufügen, **Alle
Verbindungsanfragen annehmen** anhaken und die beiden TSAPs notieren:

- **Lokaler TSAP** der LOGO! (meist `02.00`): das Feld **Lokaler TSAP der
  LOGO! (Server-Seite)**.
- **Entfernter TSAP** (meist `01.00`): das Feld **Entfernter TSAP der LOGO!
  (Client-Seite)**.

Lade das Programm in die LOGO!. Der Variablenspeicher (VM) der LOGO! ist für das
S7-Protokoll der DB1: `VW10` ist das Wort an VM-Adresse 10. Ordne die
gewünschten Werte (Analogeingänge, Merker, Zähler) unter **Extras →
Parameter-VM-Zuordnung** (LOGO! 8) dem VM zu.

### Variablen

Das Feld **Variablen** enthält die zu lesenden Variablen, durch Semikolons
getrennt:

```
Name: Adresse Art write Option=Wert
```

Nur die Adresse ist Pflicht. Beispiele:

```
Kessel: DB1,REAL0 temperature; Pumpe: Q0.1 switch; Sollwert: DB1,REAL4 setpoint min=5 max=30; Pegel: VW10 scale=0.1 unit=%
```

- **Name**: der Name der Funktion in Gladys (höchstens 40 Zeichen). Ohne
  `Name:` heißt die Variable wie ihre Adresse.
- **Art**: was der Wert ist; bestimmt Symbol und Einheit in Gladys:
  `temperature`, `humidity`, `pressure`, `power`, `energy` (ein Zählerstand, in
  Gladys in kWh), `production`, `solar_power`, `grid_power`, `voltage`,
  `current`, `battery`, `volume`, `duration`, `value` (eine einfache Zahl,
  Standard), `binary` (ein Ein/Aus-Zustand, Standard für ein Bit), `switch` (ein
  änderbares Ein/Aus), `setpoint` (eine änderbare Temperatur).
- **write**: die Variable darf aus Gladys geschrieben werden (siehe Schreiben).
- **Optionen**: `scale=` und `offset=` (angezeigter Wert = Rohwert × scale +
  offset, so wird `scale=0.1` aus 215 die 21,5), `unit=` (°C, %, W, kWh, Wh, V,
  A, bar, L, m3, s, min, h…), `min=` und `max=` (der angezeigte Bereich und die
  Grenzen beim Schreiben), `precision=` (behaltene Nachkommastellen).

Bis zu 100 Variablen. **Konfiguration prüfen** listet die Fehler Eintrag für
Eintrag auf.

### Adressen

| Adresse                                         | Typ                                | Bereich                    |
| ----------------------------------------------- | ---------------------------------- | -------------------------- |
| `DB1,X0.1` oder `DB1.DBX0.1`                    | Bit                                | 0 / 1                      |
| `DB1,BYTE2` oder `DB1.DBB2`                     | BYTE                               | 0 bis 255                  |
| `DB1,WORD4` oder `DB1.DBW4`                     | WORD (ohne Vorzeichen)             | 0 bis 65535                |
| `DB1,INT6`                                      | INT (mit Vorzeichen)               | -32768 bis 32767           |
| `DB1,DWORD8` oder `DB1.DBD8`                    | DWORD                              | 0 bis 4294967295           |
| `DB1,DINT8`                                     | DINT                               | -2147483648 bis 2147483647 |
| `DB1,REAL12`                                    | REAL                               | 32-Bit-Gleitkomma          |
| `DB1,LREAL16`                                   | LREAL                              | 64 Bit (S7-1200/1500)      |
| `M0.1`, `I0.0` (`E0.0`), `Q0.1` (`A0.1`)        | Bit                                | 0 / 1                      |
| `MB10`, `MW10`, `MI10`, `MD10`, `MDI10`, `MR10` | BYTE, WORD, INT, DWORD, DINT, REAL |                            |
| `V10.0`, `VB10`, `VW10`, `VI10`, `VD10`, `VR10` | LOGO!-VM (DB1)                     |                            |

Die Adresse bestimmt den Typ: `DB1.DBD8` ist ein DWORD und wird als ganze Zahl
gelesen. Für ein REAL schreibst du `DB1,REAL8` (oder `MR8`, `VR8`). Ein WORD
hat kein Vorzeichen: Für einen negativen Wert als INT schreibst du `DB1,INT6`
oder `MI10`.

### Schreiben

Schreiben ist **aus**, bis du **Schreiben erlauben** aktivierst. Auch dann
lassen sich nur die als `write` deklarierten Variablen (oder der Arten `switch`
und `setpoint`) ändern:

- ein `switch` zeigt im Dashboard einen Ein/Aus-Schalter, ein `setpoint` eine
  Sollwertsteuerung; andere änderbare Variablen werden mit der Aktion **Wert
  schreiben** oder der Szenen-Aktion geschrieben;
- ein Bit wird allein geschrieben: Die anderen Bits seines Bytes bleiben, wie
  sie sind;
- der Wert wird vor dem Senden gegen `min`/`max` (standardmäßig der Bereich der
  Art: ±1.000.000 für `value`, 0 bis 100 für `setpoint`) und den Bereich des Typs
  geprüft; eine Zahl wie `1,000` wird als mehrdeutig abgelehnt; danach wird er
  zurückgelesen, damit das Dashboard zeigt, was die SPS
  wirklich enthält.

**Eine falsche Variable zu schreiben kann eine Anlage stoppen oder
beschädigen.** Deklariere nur als änderbar, was Gladys ändern muss, und lass
Sicherheitsfunktionen im SPS-Programm. Absichtlich wird nichts als Schalter
oder Thermostat für Sprachassistenten bereitgestellt.

## Aktionen

Im Konfigurationsbildschirm:

- **Konfiguration prüfen**: ob die SPS antwortet, wie viele Variablen sie
  liest, und die Fehler Eintrag für Eintrag.
- **Adresse lesen**: liest eine beliebige Adresse einmal, deklariert oder
  nicht, um die richtige zu finden, bevor du sie deklarierst.
- **Wert schreiben**: schreibt in eine als änderbar deklarierte Variable, per
  Name oder Adresse.

## Szenen

- Auslöser (Gladys 5.1 oder neuer): **Die SPS ist weg** (mit dem Grund), **Die
  SPS ist zurück**, **Eine SPS-Variable wird unlesbar** (ein DB, den ein neues
  Programm gelöscht oder gekürzt hat, mit dem Namen der Variable). Die Werte
  selbst lösen Szenen aus wie jedes Gladys-Gerät.
- Aktion: **SPS-Variable schreiben**, mit einer Variable (Name oder Adresse)
  und einem Wert.

## Dashboard

Das Widget **Siemens-SPS** zeigt die ersten sechs Werte der SPS und den
Zustand der Verbindung: verbunden oder nicht, wie viele Variablen lesbar sind,
die Uhrzeit des letzten Lesens und seine Dauer. Jeder Block lässt sich in den
Einstellungen des Widgets ausblenden.

## Siemens S7, Modbus oder OPC UA?

- **Diese Integration** liest den Speicher der SPS per Adresse, ohne etwas in
  der SPS zu programmieren (außer PUT/GET bei S7-1200/1500). Der einfachste Weg
  für eine LOGO!, eine S7-300/400 oder eine S7-1200.
- **[Modbus](https://github.com/guim31/gladys-modbus)**: Eine LOGO! 8 (ab FS4)
  und manche S7-1200-Programme sprechen auch Modbus TCP. Wähle sie, wenn die
  SPS schon als Modbus-Server eingerichtet ist.
- **[OPC UA](https://github.com/guim31/gladys-opcua)**: Eine S7-1500 (und eine
  S7-1200 ab Firmware 4.4) hat einen OPC-UA-Server, mit benannten Variablen,
  optimierten DBs und Sicherheit. Wähle sie, wenn du diesen Server einschalten
  kannst.

## Grenzen

- Eine SPS pro Installation der Integration.
- Nur Zahlen und Bits: keine STRING, DATE_AND_TIME, Arrays, Zeiten oder Zähler
  (`T`, `C`).
- Optimierte DBs der S7-1200/1500 lassen sich nicht per Adresse lesen (siehe
  PUT/GET).
- S7-1200/1500 mit einer Schutzstufe, die PUT/GET verbietet, und S7-200 (PPI)
  werden nicht unterstützt.
- Keine gesicherte Verbindung: Das S7-Protokoll hat keine; halte die SPS in
  einem vertrauenswürdigen Netz.
- Gladys nimmt 300 Werte pro Minute an: Bei vielen Variablen werden die Werte
  seltener gesendet als gelesen.

## Fehlerbehebung

- **Die SPS antwortet nicht auf Port 102**: Prüfe die Adresse, ob Gladys und
  die SPS im selben Netz sind und ob keine Firewall Port 102 sperrt.
- **Die SPS lehnt die Verbindung ab**: falscher SPS-Typ, Rack/Slot oder TSAP.
  Prüfe bei einer LOGO! die Serververbindung in LOGO!Soft Comfort und ob das
  Programm geladen wurde.
- **Die CPU lehnt das Lesen ab**: Erlaube PUT/GET (siehe oben).
- **Adresse außerhalb des Bereichs**: Der DB ist kürzer als die Adresse, er
  ist optimiert, oder das Programm hat ihn nicht.
- Die Protokolle der Integration (Gladys → Integrationen → Siemens S7) sagen
  mehr mit der Umgebungsvariable `LOG_LEVEL=debug`.

## Danksagung

Der S7-Client dieser Integration ist nach den öffentlichen Beschreibungen des
Protokolls geschrieben: [Snap7](https://snap7.sourceforge.net/) von Davide
Nardella, [nodes7](https://github.com/plcpeople/nodeS7) (MIT) von plcpeople und
der s7comm-Dissector von Wireshark. Er wurde gegen den Snap7-Server über
[python-snap7](https://github.com/gijzelaerr/python-snap7) (MIT) getestet.

Siemens, SIMATIC, S7 und LOGO! sind Marken der Siemens AG. Diese Integration
ist nicht mit Siemens verbunden.
