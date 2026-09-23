# Regole implementate

La base normativa del gameplay è il **Codice di Gara FIBUR — Edizione Gennaio 2026**.
Questo documento distingue le regole ufficiali già rilevanti, le astrazioni digitali
usate dall'implementazione e le assunzioni temporanee di prodotto. Le regole relative
alle funzionalità non ancora implementate saranno aggiunte prima della relativa
implementazione.

## Mazzo

- Si usano due mazzi francesi completi: 108 carte in totale.
- Ogni mazzo ha 52 carte (assi, 2–10, jack, queen e king in quattro semi) e due jolly.
- Il due è una *pinella*: la carta fisica è capace di assumere funzione di matta, ma
  nelle sequenze può anche occupare il proprio posto naturale prima del 3. Il jolly
  ha sempre funzione di matta. Le regole di validazione delle nuove calate sono
  descritte nel milestone 3.
- Ogni carta fisica possiede un identificatore stabile e unico, incluso il numero del
  mazzo. Per esempio, le due carte `ace-hearts` non vengono confuse.

## Preparazione del round

### Regole ufficiali applicate

- La partita ha quattro giocatori e due coppie contrapposte.
- Ogni giocatore riceve 11 carte e vengono predisposti due pozzetti da 11 carte.
- Al termine della distribuzione, la carta successiva apre il monte degli scarti.
  Può essere una carta ordinaria, una pinella o un jolly: non viene saltata né
  sostituita.

### Astrazioni digitali dell'implementazione

- Dopo lo shuffle, le 11 mani sono distribuite in 11 giri, nell'ordine
  `player-1`, `player-2`, `player-3`, `player-4`. È l'equivalente logico della
  distribuzione in senso orario; non simula taglio e meccanica fisica del tavolo.
- Le 22 carte successive formano i pozzetti alternandosi tra `pozzetto-1` e
  `pozzetto-2`, fino a 11 carte per ciascuno.
- La sessantasettesima carta dell'ordine risultante (dopo 44 carte di mano e 22 di
  pozzetti) diventa direttamente lo scarto iniziale; le 41 carte restanti formano
  il tallone.
- Il primo turno digitale è assegnato a `player-1`, in fase “attendere la pesca”.

### Assunzioni temporanee di prodotto

- I nomi visualizzati dei giocatori e l'identità iniziale di `player-1` sono segnaposto
  dell'MVP; non definiscono una regola FIBUR.

## Ciclo del turno — milestone 2

### Regole ufficiali applicate

- All'inizio del turno, il giocatore di mano sceglie una sola alternativa: pescare la
  carta in cima al tallone oppure raccogliere il monte degli scarti.
- Dopo questa scelta, il giocatore conclude il turno scartando una carta dalla propria
  mano; lo scarto va in cima al monte e il turno passa al giocatore successivo.
- Se il monte raccolto è composto da una sola carta, quella stessa carta non può essere
  normalmente scartata nello stesso turno. L'eccezione è la presenza, già nella mano
  del giocatore, di un'altra carta equivalente: per le carte ordinarie stesso valore e
  stesso seme; per i jolly, un altro jolly.
- La rotazione digitale segue `player-1` → `player-2` → `player-3` → `player-4` →
  `player-1`, come rappresentazione dell'ordine di gioco a quattro giocatori.

### Astrazioni digitali dell'implementazione

- Il motore rappresenta l'inizio turno con la fase `mustDraw` e il momento successivo
  alla pesca/raccolta con la fase `action`.
- La cima del tallone è l'elemento all'indice `0` di `drawPile`; pescare lo rimuove da
  tale indice. La cima del monte degli scarti è l'ultimo elemento di `discardPile`;
  uno scarto viene aggiunto in coda.
- Raccogliere gli scarti trasferisce l'intero monte, nell'ordine interno conservato,
  nella mano del giocatore e svuota `discardPile`. Durante `action`, il turno conserva
  soltanto la sorgente e gli ID fisici delle carte acquisite, necessari per applicare
  il vincolo sullo scarto singolo; al passaggio di turno queste informazioni spariscono.
- Un singolo comando di scarto termina atomicamente il turno: non esiste un comando
  separato di fine turno.

### Funzionalità non ancora implementate

- Se il tallone è esaurito, `drawCard` restituisce l'errore di dominio
  `DRAW_PILE_EMPTY`. La procedura FIBUR di conclusione/ripristino del tallone non è
  ancora implementata e non viene simulata in questo milestone.

## Dominio e validazione delle nuove calate — milestone 3

Questa sezione riguarda esclusivamente l'analisi pura di un insieme candidato di
carte fisiche. La validazione non modifica lo stato della partita, non toglie carte
dalla mano e non colloca ancora calate sul tavolo.

### Regole comuni

- Una nuova calata valida è una combinazione oppure una sequenza e contiene almeno
  tre carte fisiche con ID distinti.
- L'ordine delle carte ricevute non influenza la validità. Una calata valida viene
  restituita in un ordine semantico deterministico e conserva le carte fisiche
  originali.
- La rappresentazione distingue la carta fisica capace di fungere da matta dalla
  funzione effettivamente assunta nella calata. Ogni collocazione ha ruolo `natural`
  oppure `wildcard`; una matta attiva conserva separatamente il rango rappresentato.
- Una nuova calata può contenere al massimo una matta attiva. L'eccezione apparente
  è una sequenza con un 2 naturale dello stesso seme e un'altra matta attiva: il 2
  naturale non consuma il limite della matta.
- Una candidatura illegale produce un risultato invalido con motivo tipizzato e
  stabile; non viene lanciata un'eccezione per la normale invalidità della calata.
  L'ingresso digitale illegale viene quindi impedito prima dell'impegno della mossa:
  non sono simulate le procedure arbitrali FIBUR per carte esposte o penalizzate.

### Combinazioni

- Una combinazione contiene almeno tre carte in totale. Le sue carte naturali
  condividono lo stesso rango; sono ammesse fino a otto carte naturali e al massimo
  una matta attiva, per un massimo complessivo di nove carte. Sono quindi sufficienti
  due carte naturali dello stesso rango insieme a una matta.
- I semi non devono essere distinti. Poiché si usano due mazzi, le due copie fisiche
  della stessa carta (stesso rango e stesso seme) possono coesistere nella stessa
  combinazione, purché abbiano ID fisici diversi.
- In una combinazione una pinella non è mai un 2 naturale: pinelle e jolly sono matte
  attive. Una combinazione composta soltanto da pinelle e/o jolly è quindi invalida.
- Le carte naturali devono condividere tutte lo stesso rango; una singola pinella o
  un singolo jolly può rappresentare quel rango.

### Sequenze

- Una sequenza contiene da tre a quattordici carte: fino a tredici ranghi naturali
  e un'eventuale matta attiva.
- Tutte le carte naturali appartengono allo stesso seme e occupano ranghi consecutivi.
  La stessa posizione naturale non può comparire due volte, nemmeno usando le copie
  della stessa faccia provenienti dai due mazzi.
- Un jolly è sempre una matta attiva. Una pinella fuori seme può essere soltanto una
  matta attiva. Una pinella dello stesso seme può essere il 2 naturale immediatamente
  precedente al 3 oppure, quando richiesto dall'interpretazione legale, fungere da
  matta attiva.
- Sono pertanto lecite sia la presenza di un 2 naturale con un jolly, sia quella di
  un 2 naturale con una seconda pinella attiva. Con due copie fisiche dello stesso
  2, la scelta della copia naturale è deterministica e gli ID restano distinti.
- La matta attiva copre una sola posizione mancante. Un vuoto interno determina
  direttamente il rango rappresentato. Se la matta è libera a un'estremità, viene
  risolta all'estremità di rango più basso; quando tale estremità è già occupata
  dall'Asso basso, viene collocata all'estremità alta.
- Nella sequenza naturale completa da Asso a King, l'eventuale quattordicesima carta
  è conservata semanticamente come matta libera (`representedRank: null`) oltre
  l'estremità alta: non viene inventato un rango inesistente e la carta fisica resta
  invariata.
- L'Asso può essere basso prima del 2 oppure alto dopo il King. L'ordine semantico
  non è circolare e l'Asso non può occupare entrambe le estremità: una sequenza
  risolta come `K-A-2 naturale` o `Q-K-A-2 naturale` è invalida. La sola presenza
  fisica di una pinella dopo un Asso alto non implica però wraparound: la pinella può
  fungere da matta attiva. Per esempio, le carte fisiche `K♠-A♠-2♠` sono risolte come
  `Q♠-K♠-A♠`, con il `2♠` invariato fisicamente ma nel ruolo di wildcard per la Queen.
- L'analisi considera un numero finito di interpretazioni semantiche (Asso basso,
  Asso alto e possibili ruoli delle pinelle) e non genera permutazioni delle carte.

### Rilevamento e normalizzazione

- `validateGroup`, `validateSequence` e `validateMeld` sono funzioni pure. L'ultima
  rileva automaticamente il tipo della calata; in un ipotetico caso valido per
  entrambi i tipi, la combinazione ha precedenza deterministica.
- Il risultato validato distingue `group` e `sequence`; conserva rango della
  combinazione oppure seme e orientamento dell'Asso della sequenza, ordine
  normalizzato, carta fisica di ogni collocazione e assegnazione della matta attiva.

### Funzionalità rinviate

- sostituire o spostare jolly e pinelle già sul tavolo;
- punteggio;
- chiusura.

Queste funzioni restano fuori dall'attuale implementazione.

## Integrazione delle nuove calate — milestone 4

- Durante la fase `action`, soltanto il giocatore di turno può creare una nuova calata.
  La mossa non termina il turno e non modifica le informazioni sull'acquisizione delle
  carte; il giocatore può continuare ad agire e poi scartare normalmente.
- Il comando riceve gli ID delle carte fisiche. Ogni ID deve comparire una sola volta
  nella richiesta e deve identificare una carta realmente presente nella mano del
  giocatore. Carte equivalenti per rango e seme non sono intercambiabili.
- La combinazione viene analizzata esclusivamente da `validateMeld`. Se non è valida,
  oppure se fallisce un controllo di turno o possesso, il comando produce un errore di
  regola e lo stato precedente resta integralmente invariato.
- Una mossa valida rimuove dalla mano soltanto le carte selezionate e conserva nel
  tavolo di squadra il `ValidatedMeld` completo, inclusi ordine semantico, carta fisica,
  ruolo della matta e `representedRank`.
- Le calate sono memorizzate una sola volta nella collezione `melds` della squadra.
  Entrambi i compagni contribuiscono quindi allo stesso insieme, mentre la squadra
  avversaria non viene modificata.

## Estensione delle calate di squadra — milestone 5

- Durante la fase `action`, il giocatore di turno può aggiungere una o più carte
  fisiche della propria mano a una calata già presente nella raccolta della sua
  squadra, inclusa una calata originariamente creata dal compagno. Non può agire
  sulle calate avversarie.
- La calata bersaglio è identificata dal suo indice zero-based nella raccolta
  `team.melds`. La selezione vuota e un indice inesistente sono errori espliciti.
- Il motore ricostruisce l'insieme completo usando le carte fisiche della calata e
  quelle aggiunte, quindi lo passa nuovamente a `validateMeld`. Solo un risultato
  completo valido sostituisce la calata precedente; ruoli e rango rappresentato da
  jolly o pinelle possono quindi essere ricalcolati dal validatore.
- La riuscita rimuove dalla mano soltanto gli ID fisici richiesti, sostituisce solo
  la calata selezionata e non termina il turno. Qualunque errore lascia invariato
  l'intero stato di gioco.

## Classificazione del Burraco — milestone 6

- Una calata valida è un Burraco soltanto quando contiene almeno sette carte fisiche;
  le calate valide da tre a sei carte sono classificate come `none` e restano
  perfettamente lecite.
- Un Burraco è pulito (`clean`) quando non contiene alcuna matta attiva. Una pinella
  interpretata semanticamente come 2 naturale ha ruolo `natural` e non sporca il
  Burraco.
- Un jolly ha sempre ruolo di matta attiva. Una pinella assume ruolo di matta attiva
  solo quando il validatore la colloca come `wildcard`; in entrambi i casi la calata
  è sporca (`dirty`) salvo la condizione semipulita descritta di seguito.
- Una sequenza è semipulita (`semi-clean`) quando la matta attiva si trova a una
  estremità dell'ordine semantico normalizzato e precede o segue almeno sette altre
  carte. Una matta interna resta sporca. Anche una matta libera oltre la sequenza
  naturale completa Asso–King, con `representedRank: null`, resta una matta attiva e
  segue la stessa regola posizionale.
- Una combinazione è semipulita soltanto quando è composta da esattamente otto carte,
  matta inclusa. La combinazione da sette carte con matta è sporca. La combinazione
  legale da nove carte (otto naturali più una matta) è anch'essa sporca: il Codice di
  Gara FIBUR 2026 riserva espressamente il semipulito alla combinazione di otto carte,
  mentre classifica come sporco ogni Burraco con matta che non sia il 2 naturale.
- La classificazione usa esclusivamente i ruoli semantici prodotti dalla validazione,
  non il rango stampato della carta. È una proprietà derivata dal `ValidatedMeld`
  corrente e non viene memorizzata nello stato: dopo un'estensione, la nuova calata
  rivalidata produce sempre la classificazione aggiornata senza metadati di ciclo di
  vita ridondanti.

La classificazione non implementa punteggio, sostituzione o spostamento delle matte,
chiusura o determinazione del vincitore.

## Acquisizione del pozzetto — milestone 7

- Ogni coppia può prendere un solo pozzetto. Il diritto nasce automaticamente quando
  uno dei due giocatori termina la prima mano; lo stato della squadra lo registra con
  `hasTakenPozzetto`, senza dedurlo dal solo contenuto dei pozzetti.
- Se il giocatore termina la mano aprendo una calata o legando carte a una calata
  esistente, prende il pozzetto *al volo*: non effettua lo scarto, mantiene il turno
  in fase `action` e può giocare immediatamente le carte ricevute. L'acquisizione
  registrata nel turno continua a descrivere la pesca o raccolta che lo ha aperto.
- Se il giocatore termina la mano scartando l'ultima carta, prende il pozzetto *con lo
  scarto*: la carta entra normalmente nel monte degli scarti, il turno passa al
  giocatore successivo in fase `mustDraw` e il pozzetto sarà giocabile soltanto al
  successivo turno del giocatore che lo ha preso, dopo la normale pesca o raccolta.
- Andare a pozzo con lo scarto non è una chiusura definitiva: l'ultima carta può essere
  anche un jolly o una pinella, ferme restando le altre regole già applicate allo
  scarto. Il divieto relativo alla chiusura definitiva non è anticipato in questa
  milestone.
- I due pozzetti non sono preassegnati alle squadre. L'astrazione digitale assegna in
  modo deterministico il primo pozzetto ancora disponibile; il suo slot diventa vuoto
  e la seconda squadra riceverà quello restante quando maturerà il diritto.
- Nella presa con scarto le carte vengono inserite subito nella mano digitale, pur non
  essendo giocabili fino al turno successivo. Non sono simulate la consegna materiale,
  la visione fuori turno, le carte esposte, le ammonizioni o le altre procedure
  arbitrali legate ai pozzi; un'eventuale UI potrà limitarne la visibilità.

La chiusura definitiva, la fine della smazzata, i relativi requisiti e bonus, il
punteggio e l'esaurimento regolamentare del tallone restano funzionalità rinviate.

## Riproducibilità

Il motore riceve opzionalmente una sorgente pseudo-casuale. `createSeededRandom` usa
Mulberry32 e serve a produrre partite e test ripetibili. In produzione, in assenza di
una sorgente esplicita, viene usato `Math.random`.
