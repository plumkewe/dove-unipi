<p align="center">
  <img src="assets/logo/logo.svg" alt="DOVE? UniPI Logo" width="200">
</p>

<h1 align="center"> DOVE? UniPi </h1>

<p align="center">Un'applicazione web single-page (SPA) per esplorare gli edifici, i piani e le aule del Polo Fibonacci dell’Università di Pisa.</p>

<p align="center">L’interfaccia consente di navigare in modo interattivo tra gli edifici, visualizzare mappe .SVG dei piani e ottenere dettagli sulle singole aule.</p>


<h2 align="right"> SCREENSHOT </h2>

<p align="center">
  <img src="assets/screenshots/desktop.png" alt="Screenshot dell'applicazione su desktop">
</p>


## Contributori

[<img src="https://wsrv.nl/?url=github.com/calba-droid.png?w=64&h=64&mask=circle&fit=cover" width="46" height="46" alt="Calogero Alba" />](https://github.com/calba-droid)
[<img src="https://wsrv.nl/?url=github.com/plumkewe.png?w=64&h=64&mask=circle&fit=cover" width="46" height="46" alt="Lyubomyr Malay" />](https://github.com/plumkewe)

*Un ringraziamento speciale a chi ha dedicato il proprio tempo per la raccolta dati nelle aule.*


## Perchè?

L'idea nasce da un'esigenza personale, sorta fin dal primo giorno di università, quando ci dissero di recarci in un'aula specifica, in un edificio di cui nessuno sapeva nulla.

Ho capito subito che non ero l'unico ad avere questo problema. Mi è capitato spesso, sia di persona che nelle chat di gruppo, di vedere richieste di aiuto per trovare un'aula.

A dimostrazione di ciò, ecco alcuni messaggi reali presi da un gruppo Telegram:

> "Qualcuno del corso C mi può aiutare a trovare l'aula per favore?"

> "Qualcuno sa dov'è l'aula M1?"

> "L'aula D3 dove è?"

> "Sapete dirmi dove è questa aula M1?"

> "L'aula H dov'è?"

...e tanti altri. Da qui l'ispirazione per il nome del progetto: **DOVE?**

> [!NOTE]
> Il proggetto è in sviluppo, contribuisci!


## Struttura del progetto

```graphql
├── README.md
├── assets/
│   ├── logo/
│   │   └── logo.svg
│   └── screenshots/
├── data/
│   └── rooms.json <- file importante per far funzionare tutto
├── index.html
└── polo/ <- dove aggiungere altri poli
    └── fibonacci/
        ├── edificio/
        │   ├── a/
        │   │   └── piano/
        │   │       ├── 0-top-max.svg <- top sta per vista e max sta per non ottimizzato (non si usano)
        │   │       ├── 0-top.svg
        │   │       ├── 0.dwg <- file CAD del piano 
        │   │       ├── 0.svg <- vista prospettica
        │   │       ├── 1-top-max.svg
        │   │       ├── 1-top.svg
        │   │       ├── 1.dwg
        │   │       ├── 1.svg
        │   │       ├── 2-top.max.svg
        │   │       ├── 2-top.svg
        │   │       ├── 2.dwg
        │   │       └── 2.svg
        │   ├── b/
        │   │   └── ...
        │   ├── c/
        │   │   └── ...
        │   ├── d/
        │   │   └── ...
        │   └── e/
        │       └── ...
        └── mini-map.svg <- mini mappa (non si usa)
```

## rooms.json

È il "database" dell'applicazione.

Contiene tutti i dati su edifici, piani e aule, e l'interfaccia viene costruita dinamicamente leggendo questo file. Per aggiornare i contenuti, basta modificare rooms.json senza toccare il codice.

```json
{
  "polo": {
    "fibonacci": {
      "edificio": {
        "a": {
          "..."
        },
        "b": {
          "..."
        },
        "c": {
          "..."
        },
        "d": {
          "piano": {
            "0": [
              {
                "id": "D04",
                "nome": "Aula D4",
                "alias": ["D4"],
                "capienza": 168,
                "presenza_pc": false,
                "numero_pc": 0,
                "prese_elettriche": true,
                "numero_prese_elettriche": 0,
                "porte_rete": true,
                "proiettore": true,
                "lavagna": "nera",
                "note": ""
              },
              {
                "..."
              },
              {
                "..."
              },
              {
                "..."
              }
            ]
          }
        },
        "e": {
          "..."
        }
      }
    }
  }
}
```

## Problemi noti

- [ ] **Zoom anomalo:** Lo zoom non si comporta come previsto
- [ ] **Visibilità bottone su Safari iOS:** Il bottnoe di GitHub nella sidebar non è visibile su Safari per iOS 26
- [ ] **Mappe non aggiornate:** I nomi di alcune aule sulle planimetrie SVG/DWG non corrispondono a quelli reali.


## Funzionalità che vorrei aggiungere

- [x] **Ricerca intelligente:** Una ricerca che ti auta con il complementamento automatico, e prende in considerazioni i valori alias presenti su rooms.json e altro
- [ ] **Occupazione aule:** Collegare in qualche modo University Planner da poter vedere le prenotazioni direttamente sul sito
